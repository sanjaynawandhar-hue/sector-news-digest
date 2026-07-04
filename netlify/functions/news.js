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
  tech:       { newsdata:{category:'technology'}, gnews:{category:'technology'}, currents:{category:'technology'}, guardian:{section:'technology'} },
  finance:    { newsdata:{category:'business'},   gnews:{category:'business'},   currents:{category:'finance'},    guardian:{section:'business'} },
  health:     { newsdata:{category:'health'},     gnews:{category:'health'},     currents:{category:'health'},     guardian:{q:'health OR pharma'} },
  energy:     { newsdata:{q:'energy OR oil'},                gnews:{q:'energy OR oil'},                currents:{q:'energy OR oil'},                guardian:{q:'energy OR oil'} },
  auto:       { newsdata:{q:'electric vehicle OR automobile'}, gnews:{q:'electric vehicle OR automobile'}, currents:{q:'electric vehicle OR automobile'}, guardian:{q:'electric vehicle OR automobile'} },
  realestate: { newsdata:{q:'real estate OR housing'},      gnews:{q:'real estate OR housing'},      currents:{q:'real estate OR property'},      guardian:{q:'real estate OR housing'} },
  agri:       { newsdata:{q:'agriculture OR farming'},      gnews:{q:'agriculture OR farming'},      currents:{q:'agriculture OR farming'},      guardian:{q:'agriculture OR farming'} },
  defence:    { newsdata:{q:'defence OR aerospace OR military'}, gnews:{q:'defense OR aerospace'},    currents:{q:'defense OR aerospace'},         guardian:{q:'defence OR aerospace'} },
  retail:     { newsdata:{q:'retail OR consumer'},          gnews:{q:'retail OR consumer'},          currents:{q:'retail OR consumer'},          guardian:{q:'retail OR consumer'} },
  telecom:    { newsdata:{q:'telecom OR 5G'},               gnews:{q:'telecom OR 5G'},               currents:{q:'telecom OR 5G'},               guardian:{q:'telecom OR 5G'} },
};

const KEYS = {
  newsdata: process.env.NEWSDATA_KEY,
  gnews:    process.env.GNEWS_KEY,
  currents: process.env.CURRENTS_KEY,
  guardian: process.env.GUARDIAN_KEY,
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
  }
}

// Simple title-based de-duplication + recency sort.
function mergeItems(lists) {
  const seen = new Set(), out = [];
  for (const list of lists) for (const a of list) {
    if (!a || !a.title || !a.url) continue;
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
      hasKeys: { newsdata: !!KEYS.newsdata, gnews: !!KEYS.gnews, currents: !!KEYS.currents, guardian: !!KEYS.guardian },
    }) };
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
