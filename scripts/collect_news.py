#!/usr/bin/env python3
"""Collect news without browser proxies. Only successful fetches advance freshness."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UTC = timezone.utc
MAX_BYTES = 3_000_000


def iso(date):
    return date.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z')


def date_of(value):
    try:
        date = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        try:
            date = parsedate_to_datetime(str(value))
        except (ValueError, TypeError, OverflowError):
            return None
    return date.replace(tzinfo=UTC) if date.tzinfo is None else date.astimezone(UTC)


def safe_url(value):
    try:
        parts = urllib.parse.urlsplit(str(value or '').strip())
        if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
            return None
        query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
        return urllib.parse.urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, urllib.parse.urlencode(query), ''))
    except ValueError:
        return None


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', '', str(value or '')))).strip()


def normalize_articles(items, now):
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title, url, date = plain(item.get('title')), safe_url(item.get('url')), date_of(item.get('publishedAt'))
        if not title or not url or not date or date > now + timedelta(minutes=10):
            continue
        normalized.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20], title=title[:600], url=url,
                               publisher=plain(item.get('publisher'))[:120] or urllib.parse.urlsplit(url).hostname,
                               publishedAt=iso(date), image=safe_url(item.get('image')), sector=item.get('sector')))
    normalized.sort(key=lambda a: a['publishedAt'], reverse=True)
    recent = [a for a in normalized if date_of(a['publishedAt']) >= now - timedelta(days=7)]
    seen_urls, seen_titles, result = set(), set(), []
    for item in recent or normalized:
        title = re.sub(r'\W+', '', item['title'].casefold())
        if item['url'] in seen_urls or title in seen_titles:
            continue
        seen_urls.add(item['url']); seen_titles.add(title); result.append(item)
    return result[:30]


def parse_feed(xml, sector_id, now):
    try:
        root = ET.fromstring(xml)
    except (ET.ParseError, ValueError):
        return []
    def local(tag):
        return tag.rsplit('}', 1)[-1]
    def child(element, name):
        return next((x for x in element if local(x.tag) == name), None)
    def text(element, name):
        x = child(element, name)
        return ''.join(x.itertext()).strip() if x is not None else ''
    channel = child(root, 'channel')
    publisher = text(channel if channel is not None else root, 'title')
    items = []
    for entry in root.iter():
        if local(entry.tag) not in ('item', 'entry'):
            continue
        link = text(entry, 'link')
        for element in entry:
            if local(element.tag) == 'link' and element.get('rel', 'alternate') == 'alternate' and element.get('href'):
                link = element.get('href'); break
        source = text(entry, 'source') or publisher
        title = text(entry, 'title')
        if source and title.endswith(' - ' + source):
            title = title[:-len(source)-3]
        image = None
        for element in entry.iter():
            if local(element.tag) in ('thumbnail', 'content', 'enclosure') and element.get('url'):
                if local(element.tag) != 'enclosure' or element.get('type', '').startswith('image/'):
                    image = element.get('url'); break
        items.append(dict(title=title, url=link, publisher=source, image=image, sector=sector_id,
                          publishedAt=text(entry, 'pubDate') or text(entry, 'published') or text(entry, 'updated')))
    return normalize_articles(items, now)


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'SectorNewsDigest/2.0 (+https://sanjaynawandhar-hue.github.io/sector-news-digest/)', 'Accept': 'application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.5'})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('response too large')
    return data


def error_category(error):
    if isinstance(error, urllib.error.HTTPError):
        error.close()
        return f'HTTP {error.code}'
    if isinstance(error, (TimeoutError, urllib.error.URLError)):
        return 'connection unavailable'
    return 'invalid or empty response'


def collect_snapshot(config, previous, now, fetcher=fetch_bytes, keys=None):
    from news_providers import configured_keys, provider_request, parse_provider
    keys = configured_keys() if keys is None else keys
    def collect(pair):
        index, sector = pair
        sid, errors, articles = sector['id'], [], []
        available = sorted(keys)
        if available:
            provider = available[(int(now.timestamp() // 1800) + index) % len(available)]
            try:
                body = fetcher(provider_request(provider, sector, keys[provider]))
                articles = normalize_articles(parse_provider(provider, json.loads(body), sid), now)
                if not articles:
                    raise ValueError('empty')
            except Exception as exc:
                errors.append({'source': provider, 'error': error_category(exc)})
        if not articles:
            query = urllib.parse.urlencode({'q': sector['query'] + ' when:7d', 'hl':'en-IN', 'gl':'IN', 'ceid':'IN:en'})
            feeds = ['https://news.google.com/rss/search?' + query] + sector.get('feeds', [])
            for feed in feeds:
                try:
                    found = parse_feed(fetcher(feed), sid, now)
                    if not found:
                        raise ValueError('empty')
                    articles.extend(found)
                except Exception as exc:
                    errors.append({'source': urllib.parse.urlsplit(feed).hostname, 'error': error_category(exc)})
        prior = previous.get('sectors', {}).get(sid, {})
        fresh = normalize_articles(articles, now)
        return sid, {'lastSuccessAt': iso(now) if fresh else prior.get('lastSuccessAt'),
                     'status': ('degraded' if errors else 'ok') if fresh else ('degraded' if prior.get('articles') else 'unavailable'),
                     'articles': fresh or prior.get('articles', []), 'errors': errors}
    with ThreadPoolExecutor(max_workers=6) as pool:
        sectors = dict(pool.map(collect, enumerate(config)))
    return {'schemaVersion': 1, 'attemptedAt': iso(now), 'sectors': sectors}


def save_snapshot(snapshot, output):
    if not any(s['lastSuccessAt'] == snapshot['attemptedAt'] and s['articles'] for s in snapshot['sectors'].values()):
        raise RuntimeError('No sector fetched successfully; previous snapshot preserved.')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='config/sectors.json')
    parser.add_argument('--previous', default='data/news.json')
    parser.add_argument('--output', default='data/news.json')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    previous_path = Path(args.previous)
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    result = collect_snapshot(config, previous, datetime.now(UTC))
    try:
        save_snapshot(result, args.output)
    except RuntimeError as exc:
        print(str(exc)); return 1
    for sid, sector in result['sectors'].items():
        print(f"{sid}: {len(sector['articles'])} articles, {sector['status']}, last success {sector['lastSuccessAt']}")
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
