import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
try:
    from news_providers import provider_request, parse_provider
except ImportError:
    provider_request=parse_provider=None

class ProviderTests(unittest.TestCase):
    def setUp(self):self.assertTrue(callable(parse_provider),'provider adapters not implemented')
    def test_all_five_provider_formats(self):
        fixtures={
          'newsdata': {'results':[{'title':'Headline','link':'https://example.com','pubDate':'2026-10-13T00:00:00Z','source_name':'Publisher'}]},
          'gnews':{'articles':[{'title':'Headline','url':'https://example.com','publishedAt':'2026-10-13T00:00:00Z','source':{'name':'Publisher'}}]},
          'currents':{'news':[{'title':'Headline','url':'https://example.com','published':'2026-10-13T00:00:00Z','author':'Publisher'}]},
          'guardian':{'response':{'results':[{'webTitle':'Headline','webUrl':'https://example.com','webPublicationDate':'2026-10-13T00:00:00Z'}]}},
          'nyt':{'results':[{'title':'Headline','url':'https://example.com','published_date':'2026-10-13T00:00:00Z'}]}}
        for p,data in fixtures.items():
            self.assertEqual(parse_provider(p,data,'tech')[0]['title'],'Headline')
            self.assertEqual(parse_provider(p,data,'tech')[0]['sector'],'tech')
    def test_queries_and_key_are_encoded(self):
        url=provider_request('guardian',{'query':'energy OR oil','guardian':{'q':'energy OR oil'}},'key&bad=1')
        self.assertIn('api-key=key%26bad%3D1',url)
        self.assertIn('q=energy+OR+oil',url)
    def test_quotas_fallback_to_rss_without_leaking_key(self):
        import urllib.error,json
        from test_collect_news import CONFIG, RSS, NOW
        from collect_news import collect_snapshot
        for status in (401,429):
            def fetch(url):
                if 'guardianapis' in url:raise urllib.error.HTTPError(url,status,'private-key',{},None)
                return RSS
            result=collect_snapshot(CONFIG,{},NOW,fetch,keys={'guardian':'private-key'})
            self.assertTrue(result['sectors']['tech']['articles'])
            self.assertNotIn('private-key',json.dumps(result))
    def test_provider_timeout_falls_back(self):
        from test_collect_news import CONFIG, RSS, NOW
        from collect_news import collect_snapshot
        def fetch(url):
            if 'guardianapis' in url:raise TimeoutError('secret')
            return RSS
        self.assertTrue(collect_snapshot(CONFIG,{},NOW,fetch,keys={'guardian':'secret'})['sectors']['tech']['articles'])
