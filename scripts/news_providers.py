"""Optional provider adapters. Credentials stay inside the collection process."""
import os
from urllib.parse import urlencode

KEY_NAMES = {'newsdata':'NEWSDATA_KEY','gnews':'GNEWS_KEY','currents':'CURRENTS_KEY','guardian':'GUARDIAN_KEY','nyt':'NYT_KEY'}

def configured_keys():
    return {name:os.environ[key] for name,key in KEY_NAMES.items() if os.environ.get(key)}

def provider_request(provider, sector, key):
    cfg=sector.get(provider,{})
    query=cfg.get('q',sector['query'])
    if provider=='newsdata':
        params={'apikey':key,'language':'en'}
        params.update({'category':cfg['category']} if cfg.get('category') else {'q':query})
        base='https://newsdata.io/api/1/latest'
    elif provider=='gnews':
        params={'token':key,'lang':'en','max':10}
        if cfg.get('category'):
            base='https://gnews.io/api/v4/top-headlines';params['category']=cfg['category']
        else:
            base='https://gnews.io/api/v4/search';params.update(q=query,sortby='publishedAt')
    elif provider=='currents':
        params={'apiKey':key,'language':'en'}
        if cfg.get('category'):
            base='https://api.currentsapi.services/v1/latest-news';params['category']=cfg['category']
        else:
            base='https://api.currentsapi.services/v1/search';params['keywords']=query
    elif provider=='guardian':
        base='https://content.guardianapis.com/search'
        params={'api-key':key,'show-fields':'thumbnail','order-by':'newest','page-size':20}
        params.update({'section':cfg['section']} if cfg.get('section') else {'q':query})
    elif provider=='nyt':
        params={'api-key':key}
        if cfg.get('section'):
            base=f"https://api.nytimes.com/svc/topstories/v2/{cfg['section']}.json"
        else:
            base='https://api.nytimes.com/svc/search/v2/articlesearch.json';params.update(q=query,sort='newest')
    else:
        raise ValueError('Unknown provider')
    return base+'?'+urlencode(params)

def parse_provider(provider, data, sector):
    result=[]
    if provider=='newsdata':
        for a in data.get('results') or []:
            result.append(dict(title=a.get('title'),url=a.get('link'),publisher=a.get('source_name') or a.get('source_id'),publishedAt=a.get('pubDate'),image=a.get('image_url')))
    elif provider=='gnews':
        for a in data.get('articles') or []:
            result.append(dict(title=a.get('title'),url=a.get('url'),publisher=(a.get('source') or {}).get('name'),publishedAt=a.get('publishedAt'),image=a.get('image')))
    elif provider=='currents':
        for a in data.get('news') or []:
            result.append(dict(title=a.get('title'),url=a.get('url'),publisher=a.get('author'),publishedAt=a.get('published'),image=a.get('image')))
    elif provider=='guardian':
        for a in (data.get('response') or {}).get('results') or []:
            result.append(dict(title=a.get('webTitle'),url=a.get('webUrl'),publisher='The Guardian',publishedAt=a.get('webPublicationDate'),image=(a.get('fields') or {}).get('thumbnail')))
    elif provider=='nyt':
        for a in data.get('results') or (data.get('response') or {}).get('docs') or []:
            media=a.get('multimedia') or []
            image=next((m.get('url') for m in media if isinstance(m,dict) and m.get('url')),None) if isinstance(media,list) else None
            if image and not image.startswith('http'):image='https://www.nytimes.com/'+image.lstrip('/')
            result.append(dict(title=a.get('title') or (a.get('headline') or {}).get('main'),url=a.get('url') or a.get('web_url'),publisher='The New York Times',publishedAt=a.get('published_date') or a.get('pub_date'),image=image))
    return [dict(a,sector=sector) for a in result]
