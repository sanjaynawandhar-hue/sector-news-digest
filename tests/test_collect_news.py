import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys, tempfile, json
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
try:
    from collect_news import parse_feed, normalize_articles, collect_snapshot, save_snapshot
except ImportError:
    parse_feed = normalize_articles = collect_snapshot = save_snapshot = None

NOW = datetime(2026, 10, 14, 0, 0, tzinfo=timezone.utc)
RSS = b'''<rss><channel><title>Example News</title><item><title>New energy report</title><link>https://example.com/story</link><pubDate>Tue, 13 Oct 2026 20:00:00 GMT</pubDate><source>Example</source></item></channel></rss>'''
ATOM = b'''<feed xmlns="http://www.w3.org/2005/Atom"><title>Science</title><entry><title>New research</title><link href="https://example.com/research"/><published>2026-10-13T21:00:00Z</published></entry></feed>'''
CONFIG = [{'id':'tech','name':'Technology','query':'technology','feeds':['https://good.test/feed','https://bad.test/feed']}]
def article(**kw):
    return dict({'title':'Valid headline','url':'https://example.com/story','publishedAt':'2026-10-13T20:00:00Z','publisher':'Example','sector':'tech','image':None}, **kw)

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(parse_feed), 'news collector has not been implemented')
    def test_rss_and_atom_have_real_publisher_and_date(self):
        self.assertEqual(parse_feed(RSS,'tech',NOW)[0]['publisher'], 'Example')
        self.assertEqual(parse_feed(ATOM,'tech',NOW)[0]['url'], 'https://example.com/research')
        self.assertEqual(parse_feed(ATOM,'tech',NOW)[0]['publishedAt'], '2026-10-13T21:00:00Z')
    def test_invalid_feed_does_not_count_as_success(self):
        for data in [b'<html>upstream error</html>', b'bad xml', b'<rss><channel/></rss>']:
            self.assertEqual(parse_feed(data,'tech',NOW), [])
    def test_reject_unsafe_dates_and_urls(self):
        rows=[article(url='javascript:alert(1)'),article(publishedAt='invalid'),article(publishedAt='2026-10-14T00:11:00Z'),article(image='javascript:bad')]
        result=normalize_articles(rows,NOW)
        self.assertEqual(len(result),1)
        self.assertIsNone(result[0]['image'])
    def test_dedup_order_and_limit(self):
        rows=[article(title=f'Story {i}',url=f'https://example.com/{i}',publishedAt=f'2026-10-13T20:{i:02}:00Z') for i in range(40)]
        rows += [article(title='Story 39',url='https://other.test/duplicate')]
        result=normalize_articles(rows,NOW)
        self.assertEqual(len(result),30)
        self.assertEqual(result[0]['title'],'Story 39')
    def test_tracking_links_and_recent_preference(self):
        rows=[article(url='https://example.com/story?utm_source=a'),article(url='https://example.com/story?utm_source=b',title='Other title'),article(title='Old news',url='https://example.com/old',publishedAt='2026-09-01T00:00:00Z')]
        self.assertEqual(len(normalize_articles(rows,NOW)),1)
    def test_partial_feed_failure_keeps_healthy_articles(self):
        def fetch(url):
            if 'bad.test' in url: raise TimeoutError('secret=DO_NOT_LEAK')
            return RSS
        result=collect_snapshot(CONFIG,{},NOW,fetch,keys={})
        data=result['sectors']['tech']
        self.assertEqual(len(data['articles']),1)
        self.assertEqual(data['status'],'degraded')
        self.assertEqual(data['lastSuccessAt'],'2026-10-14T00:00:00Z')
        self.assertNotIn('DO_NOT_LEAK',json.dumps(result))
    def test_failed_refresh_does_not_renew_cached_timestamp(self):
        previous={'schemaVersion':1,'sectors':{'tech':{'articles':[article()], 'lastSuccessAt':'2026-10-13T00:00:00Z'}}}
        result=collect_snapshot(CONFIG,previous,NOW,lambda u:b'<html>Error</html>',keys={})
        self.assertEqual(result['sectors']['tech']['lastSuccessAt'],'2026-10-13T00:00:00Z')
        self.assertEqual(result['sectors']['tech']['articles'],previous['sectors']['tech']['articles'])
        self.assertEqual(result['sectors']['tech']['status'],'degraded')
    def test_total_failure_never_overwrites_previous_file(self):
        result=collect_snapshot(CONFIG,{},NOW,lambda u:b'error',keys={})
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'news.json';target.write_text('prior')
            with self.assertRaises(RuntimeError):save_snapshot(result,target)
            self.assertEqual(target.read_text(),'prior')
    def test_atomic_success_snapshot(self):
        result=collect_snapshot(CONFIG,{},NOW,lambda u:RSS,keys={})
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'data/news.json';save_snapshot(result,target)
            self.assertEqual(json.loads(target.read_text())['schemaVersion'],1)

if __name__=='__main__':unittest.main()
