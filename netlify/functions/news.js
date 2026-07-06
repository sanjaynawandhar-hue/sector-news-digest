/* ============================================================================
   Netlify Function: /.netlify/functions/news
   ----------------------------------------------------------------------------
   Proxies the free news APIs so your API keys live in server-side environment
   variables and are NEVER exposed in the browser.

   Environment variables (set in Netlify → Site settings → Environment):
     NEWSDATA_KEY   GNEWS_KEY   CURRENTS_KEY   GUARDIAN_KEY

   Endpoints the frontend calls:
     GET ?probe=1                       -> { ok:true, hasKeys:{...} }
     GET ?sector=<id>&sources=a,b       -> { items:[...normalized...], errors:{} }

   Node 18+ on Netlify has a global fetch, so no dependencies are needed.
   ============================================================================ */

// Sector config MUST mirror the SECTORS map in index.html (ids + per-API params).
const SECTORS = {
  tech:       { newsdata:{category:'technology'}, gnews:{category:'technology'}, currents:{category:'technology'}, guardian:{section:'technology'}, nyt:{section:'technology'} },
  finance:    { newsdata:{category:'business'},   gnews:{category:'business'},   currents:{category:'finance'},    guardian:{section:'business'},   nyt:{section:'business'} },
  health:     { newsdata:{category:'health'},     gnews:{category:'health'},     currents:{category:'health'},     guardian:{q:'health OR pharma'},  nyt:{section:'health'} },
  energy:     { newsdata:{q:'energy OR oil'},                gnews:{q:'energy OR oil'},                currents:{q:'energy OR oil'},                guardian:{q:'energy OR oil'},                nyt:{q:'energy oil'} },
  auto:       { newsdata:{q:'electric vehicle OR automobile'}, gnews:{q:'electric vehicle OR automobile'}, currents:{q:'electric vehicle OR automobile'}, guardian:{q:'electric vehicle OR automobile'}, nyt:{section:'automobiles'} },
  realestate: { newsdata:{q:'real estate OR housing'},      gnews:{q:'real estate OR housing'},      currents:{q:'real estate OR property'},      guardian:{q:'real estate OR housing'},      nyt:{section:'realestate'} },
  agri:       { newsdata:{q:'agriculture OR farming'},      gnews:{q:'agriculture OR farming'},      currents:{q:'agriculture OR farming'},      guardian:{q:'agriculture OR farming'},      nyt:{q:'agriculture farming'} },
  defence:    { newsdata:{q:'defence OR aerospace OR military'}, gnews:{q:'defense OR aerospace'},    currents:{q:'defense OR aerospace'},         guardian:{q:'defence OR aerospace'},        nyt:{q:'defense aerospace military'} },
  retail:     { newsdata:{q:'retail OR consumer'},          gnews:{q:'retail OR consumer'},          currents:{q:'retail OR consumer'},          guardian:{q:'retail OR consumer'},          nyt:{q:'retail consumer'} },
  telecom:    { newsdata:{q:'telecom OR 5G'},               gnews:{q:'telecom OR 5G'},               currents:{q:'telecom OR 5G'},               guardian:{q:'telecom OR 5G'},               nyt:{q:'telecom 5G wireless'} },
  crypto:        { newsdata:{q:'cryptocurrency OR bitcoin OR ethereum'}, gnews:{q:'cryptocurrency OR bitcoin'}, currents:{q:'cryptocurrency OR bitcoin'}, guardian:{q:'cryptocurrency OR bitcoin'}, nyt:{q:'cryptocurrency bitcoin'} },
  bollywood:     { newsdata:{q:'Bollywood'},                gnews:{q:'Bollywood'},                currents:{q:'Bollywood'},                guardian:{q:'Bollywood'},                nyt:{q:'Bollywood'} },
};

const KEYS = {
  newsdata: process.env.NEWSDATA_KEY,
  gnews:    process.env.GNEWS_KEY,
  currents: process.env.CURRENTS_KEY,
  guardian: process.env.GUARDIAN_KEY,
  nyt:      process.env.NYT_KEY,
};

// ---- Normalizers: convert each API's shape into a common article object ----
const normalize = {
  newsdata: (j) => (j.results || []).map(a => ({
    title: a.title, url: a.link, source: a.source_id || a.source_name || 'NewsData',
    image: a.image_url || null, publishedAt: a.pubDate, description: a.description || '' })),
  gnews: (j) => (j.articles || []).map(a => ({
    title: a.title, url: a.url, source: (a.source && a.source.name) || 'GNews',
    image: a.image || null, publishedAt: a.publishedAt, description: a.description || '' })),
  currents: (j) => (j.news || []).map(a => ({
    title: a.title, url: a.url, source: a.author || 'Currents',
    image: a.image && a.image !== 'None' ? a.image : null, publishedAt: a.published, description: a.description || '' })),
  guardian: (j) => ((j.response && j.response.results) || []).map(a => ({
    title: a.webTitle, url: a.webUrl, source: 'The Guardian',
    image: (a.fields && a.fields.thumbnail) || null, publishedAt: a.webPublicationDate,
    description: (a.fields && a.fields.trailText) || '' })),
  nyt: (j) => {
    const img = (mm) => {
      if (!mm || !mm.length) return null;
      let u = (mm.find(m => m && m.url) || {}).url || null;
      if (u && !/^https?:/.test(u)) u = 'https://www.nytimes.com/' + u.replace(/^\/+/, '');
      return u;
    };
    if (j.results) return j.results.map(a => ({
      title: a.title, url: a.url, source: 'The New York Times',
      image: img(a.multimedia), publishedAt: a.published_date, description: a.abstract || '' }));
    if (j.response && j.response.docs) return j.response.docs.map(a => ({
      title: (a.headline && a.headline.main) || '', url: a.web_url, source: 'The New York Times',
      image: img(a.multimedia), publishedAt: a.pub_date, description: a.abstract || '' }));
    return [];
  },
};

// ---- Build the request URL for one API/sector ----
function buildUrl(api, cfg) {
  switch (api) {
    case 'newsdata': {
      const p = new URLSearchParams({ apikey: KEYS.newsdata, language: 'en', image: '1' });
      if (cfg.category) p.set('category', cfg.category);
      if (cfg.q) p.set('q', cfg.q);
      return `https://newsdata.io/api/1/latest?${p}`;
    }
    case 'gnews':
      return cfg.category
        ? `https://gnews.io/api/v4/top-headlines?category=${cfg.category}&lang=en&max=10&token=${KEYS.gnews}`
        : `https://gnews.io/api/v4/search?q=${encodeURIComponent(cfg.q)}&lang=en&max=10&token=${KEYS.gnews}`;
    case 'currents':
      return cfg.category
        ? `https://api.currentsapi.services/v1/latest-news?category=${cfg.category}&language=en&apiKey=${KEYS.currents}`
        : `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(cfg.q)}&language=en&apiKey=${KEYS.currents}`;
    case 'guardian': {
      const p = new URLSearchParams({ 'api-key': KEYS.guardian, 'show-fields': 'thumbnail,trailText', 'order-by': 'newest', 'page-size': '12' });
      if (cfg.section) p.set('section', cfg.section);
      if (cfg.q) p.set('q', cfg.q);
      return `https://content.guardianapis.com/search?${p}`;
    }
    case 'nyt':
      return cfg.section
        ? `https://api.nytimes.com/svc/topstories/v2/${cfg.section}.json?api-key=${KEYS.nyt}`
        : `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodeURIComponent(cfg.q)}&sort=newest&api-key=${KEYS.nyt}`;
  }
}

// Social / aggregator / non-news domains to drop (mirror of index.html).
const BLOCKED_SOURCES = [
  'reddit.com', 'redd.it', 'twitter.com', 'x.com', 't.co', 'facebook.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'pinterest.',
  'quora.com', 'medium.com', 'substack.com', 'blogspot.', 'wordpress.com',
];
const isBlocked = (a) => {
  const url = (a.url || '').toLowerCase();
  const src = (a.source || '').toLowerCase().trim();
  if (/^\/(u|r)\//.test(src) || src === 'reddit') return true;   // reddit author/subreddit
  return BLOCKED_SOURCES.some(d => (url + ' ' + src).includes(d));
};

// Title-based de-duplication + recency sort, dropping social/aggregator noise.
function mergeItems(lists) {
  const seen = new Set(), out = [];
  for (const list of lists) for (const a of list) {
    if (!a || !a.title || !a.url || isBlocked(a)) continue;
    const k = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (k.length < 6 || seen.has(k)) continue;
    seen.add(k); out.push(a);
  }
  out.sort((x, y) => new Date(y.publishedAt || 0) - new Date(x.publishedAt || 0));
  return out.slice(0, 20);
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=900',   // 15-min CDN cache
  };

  // Probe: report which keys are configured (values never returned).
  if (qs.probe) {
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true,
      hasKeys: { newsdata: !!KEYS.newsdata, gnews: !!KEYS.gnews, currents: !!KEYS.currents, guardian: !!KEYS.guardian, nyt: !!KEYS.nyt },
    }) };
  }

  // Market indices via Yahoo Finance, fetched SERVER-SIDE (no CORS / no flaky
  // public proxy) — far more reliable than fetching Yahoo from the browser.
  if (qs.markets) {
    const SYMBOLS = [['Sensex', '^BSESN'], ['Nifty 50', '^NSEI'], ['Dow Jones', '^DJI'], ['Nikkei 225', '^N225']];
    const indices = await Promise.all(SYMBOLS.map(async ([name, sym]) => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const j = await r.json();
        const m = j.chart.result[0].meta;
        const price = m.regularMarketPrice;
        const prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose;
        return { name, price, chg: prev ? ((price - prev) / prev) * 100 : null };
      } catch { return { name, price: null, chg: null }; }
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ indices }) };
  }

  const sector = SECTORS[qs.sector];
  if (!sector) return { statusCode: 400, headers, body: JSON.stringify({ error: 'unknown sector' }) };

  // Only call requested sources that actually have a configured key.
  const requested = (qs.sources || 'newsdata,guardian').split(',').filter(Boolean);
  const sources = requested.filter(a => KEYS[a] && sector[a]);

  const errors = {};
  const lists = await Promise.all(sources.map(async (api) => {
    try {
      const r = await fetch(buildUrl(api, sector[api]));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return normalize[api](await r.json());
    } catch (e) { errors[api] = e.message; return []; }
  }));

  return { statusCode: 200, headers, body: JSON.stringify({ items: mergeItems(lists), errors }) };
};
