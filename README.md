# 📰 Global Sector News Digest

A single-page web app that aggregates the latest global news by **sector** from
multiple free news APIs + RSS feeds, de-duplicates and sorts it, and lets you
export each sector as a **LinkedIn-ready PDF** (a one-page infographic digest
_and_ a multi-page 1080×1080 carousel).

**Curated by Sanjay · ProfessorSK · [@iam_sanjay_navandar](https://www.instagram.com/iam_sanjay_navandar)** (Instagram)

---

## ✨ Features

- **10 sectors**: Technology, Finance & Markets, Healthcare & Pharma, Energy & Oil,
  Automobiles & EV, Real Estate, Agriculture, Defence & Aerospace, Retail & Consumer, Telecom.
- **Layered data strategy** (all free tiers):
  - **Layer 1 — APIs:** NewsData.io, GNews.io, Currents API, The Guardian.
  - **Layer 2 — RSS fallback:** Google News RSS via CORS proxy (used when a key is
    missing or a quota is exhausted). The app **works with zero keys** in RSS-only mode.
- **Quota safety:** 30-minute localStorage cache per sector, only **2 APIs called per
  refresh** (rotated), and a refresh confirmation when it would spend quota.
- **Two key-handling modes:**
  - **Browser mode** — paste keys in ⚙️ Settings (stored in `localStorage`).
  - **Server mode (recommended)** — a Netlify Function holds keys as env vars so they
    are **never exposed in the browser**. The app auto-detects and prefers this.
- **Modern UI:** dark-mode toggle, source-filter chips, loading skeletons, per-source
  error states, thumbnails, source badges, and "x hours ago" timestamps.
- **PDF export** with html2pdf.js + Chart.js: header banner with per-sector accent,
  Top-5 headlines with thumbnails, a "stories by source" donut, trending-keyword chips,
  a quick-stats row, and a branded footer (Instagram @iam_sanjay_navandar). Images are downscaled to ~120px JPEG q0.6 so
  the file stays **under ~1 MB**.

---

## 🚀 Quick start (no keys, RSS-only)

Just open `index.html` in a browser — or serve the folder — and it will pull headlines
from Google News RSS. That's it. Add API keys later for richer results and images.

> RSS is fetched through a public CORS proxy (`api.allorigins.win`, with a fallback).
> If both proxies are down, the page still loads and shows a per-source error notice.

---

## 🔑 Getting the free API keys

You only need the ones you want — the app blends whatever is available.

| API | Free tier | Where to get the key |
|-----|-----------|----------------------|
| **NewsData.io** | 200 credits/day, commercial use OK, good India coverage, image URLs | <https://newsdata.io/register> → Dashboard → API Key (`pub_…`) |
| **GNews.io** | 100 requests/day, keyword + topic, images | <https://gnews.io/register> → Dashboard → API token |
| **Currents API** | ~600 requests/day, category filtering | <https://currentsapi.services/en/register> → API key |
| **The Guardian** | Free & generous, section filtering, high quality | <https://open-platform.theguardian.com/access/> → request a **developer** key (emailed) |

### Add them in the browser (Settings)
1. Click **⚙️** (top-right).
2. Paste any keys you have.
3. **Save keys** — they're stored only in your browser's `localStorage` and the current
   sector refreshes immediately. Use **Clear all** to remove them.

The mode badge in the header shows the active mode:
`📡 RSS-only` · `🔑 API + RSS` · `☁️ Server keys`.

---

## ☁️ Deploy to Netlify (recommended — keys stay server-side)

This repo includes `netlify/functions/news.js` and `netlify.toml`, so keys can live in
Netlify environment variables instead of the browser.

### Option A — drag & drop
1. Zip the project folder (or use the CLI below for functions support).
2. Go to <https://app.netlify.com/drop> and drop the folder.
   > Note: drag-and-drop deploys **do not** build functions. For the serverless proxy,
   > use Option B (Git) or the Netlify CLI.

### Option B — Git + Netlify (full features)
1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import from Git → pick the repo**.
   - Build command: _(leave empty)_
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (already set in `netlify.toml`).
3. **Site settings → Environment variables**, add any of:

   ```
   NEWSDATA_KEY   = pub_xxxxxxxx
   GNEWS_KEY      = xxxxxxxxxxxxxxxx
   CURRENTS_KEY   = xxxxxxxxxxxxxxxx
   GUARDIAN_KEY   = xxxxxxxx-xxxx-xxxx
   ```

4. **Deploy.** Visit the site — the header badge should read **☁️ Server keys** and the
   app will proxy all API calls through `/.netlify/functions/news`, keeping your keys
   private. No keys are ever sent to or stored in the browser in this mode.

### Local dev with functions
```bash
npm install -g netlify-cli
netlify dev        # serves index.html + the function at /.netlify/functions/news
```

---

## 🧩 How it works (architecture)

```
Browser (index.html, vanilla JS)
  │
  ├─ detectBackend()  → is /.netlify/functions/news reachable?
  │      ├─ yes → SERVER MODE: call the function (keys in env vars)
  │      └─ no  → BROWSER MODE: call APIs directly with localStorage keys
  │
  ├─ Layer 1: 2 rotated APIs per refresh (quota spread)
  ├─ Layer 2: Google News RSS via CORS proxy (backfill / RSS-only)
  │
  ├─ mergeItems(): de-dupe by normalized title + sort by recency (max 20)
  ├─ 30-min localStorage cache per sector
  │
  └─ PDF export (html2pdf.js + Chart.js), images downscaled via <canvas>
```

Every source is wrapped in try/catch and `Promise.allSettled` — **any single source
failing never breaks the page**; it just shows a small per-source notice.

---

## 📄 PDF exports

- **Digest PDF** — A4 portrait, one page, `< 1 MB`. Header banner (sector color + icon),
  Top-5 headlines with tiny thumbnails, a "stories by source" donut, trending-keyword
  chips, quick-stats row, branded footer.
  Filename: `SectorName_Digest_YYYY-MM-DD.pdf`.
- **LinkedIn Carousel PDF** — multi-page, 1080×1080 squares: a cover page, one headline
  per page (photo + overlay), and a closing "Follow ProfessorSK · @iam_sanjay_navandar" page.
  Filename: `SectorName_Carousel_YYYY-MM-DD.pdf`.

> Image note: thumbnails are re-encoded through a `<canvas>`. If an image host doesn't
> send CORS headers, that image is skipped and a colored placeholder (the sector icon)
> is used instead — the PDF still generates cleanly.

---

## 🛠️ Tech

- Vanilla JS, no build step. CDNs: [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)
  (bundles html2canvas + jsPDF) and [Chart.js](https://www.chartjs.org/).
- Optional Netlify Function (Node 18+, uses global `fetch`, zero dependencies).

## 📁 Files

```
index.html                   # the whole app
netlify/functions/news.js    # optional serverless API proxy
netlify.toml                 # Netlify build/functions config
README.md                    # this file
```

---

Curated by **Sanjay** · Follow **ProfessorSK** on Instagram → **[@iam_sanjay_navandar](https://www.instagram.com/iam_sanjay_navandar)**
