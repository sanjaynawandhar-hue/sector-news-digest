# Sector News Digest

A modern, mobile-friendly news reader curated by **Sanjay Navandar · ProfessorSK**.

**[Read the website](https://sanjaynawandhar-hue.github.io/sector-news-digest/)**

## What changed

The website reads a published news edition instead of relying on unreliable public CORS proxies. GitHub Actions collects RSS directly, then deploys the website and its JSON snapshot together. No news API keys are required.

Browse Technology, Finance & Markets, Healthcare & Pharma, Energy & Oil, Automobiles & EV, Real Estate, Agriculture, Defence & Aerospace, Retail & Consumer, Telecom, Crypto News and Bollywood News. Search titles/publishers, filter sources, switch themes, and export an A4 reading digest or square LinkedIn carousel. Exports contain the five latest stories for the selected sector, independently of search filters. They deliberately use text and clickable source links, so blocked news images cannot break the PDF.

## Freshness and availability

- Collection is scheduled at **17 and 47 minutes past every hour**, UTC. GitHub scheduling is best effort and can be delayed. Public-repository schedules can be disabled after 60 days without repository activity; check Actions if updates stop.
- **Refresh** checks the latest published edition. It does not trigger a new collection or spend visitor API quota. A visible page also checks every five minutes and when brought back into focus.
- Collection timestamps and article publication times are different. A successful collection can return the same articles as before.
- After 90 minutes without a successful collection, a sector is marked delayed. Partial feed failures are shown in source status. A failed refresh never renews the last-success timestamp.
- If all sources fail, the workflow fails and leaves the live edition intact. If only some sectors fail, their previous headlines and original timestamps are retained.
- Browser cache allows a previously read edition to remain visible if the news request fails. This is not a fully offline application: an uncached page still requires a connection.

## Local development

Python 3.12+ and Node 22+ are used in CI. The collector uses only Python's standard library; there is no frontend build or dependency installation step.

```sh
python3 scripts/collect_news.py --output data/news.json
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Use HTTP, not a `file://` URL, so ES modules and JSON load correctly. Generated `data/` is ignored by Git.

```sh
python3 -m unittest discover -s tests -v
node --test tests/news-model.test.mjs
node --check assets/app.js
node --check assets/exports.js
```

## GitHub Pages setup

1. In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. Keep `.github/workflows/news-pages.yml` on the default `main` branch.
3. Open **Actions → Collect news and publish → Run workflow** for the first edition or a manual collection.
4. Check both the **collect** and **deploy** jobs. The workflow must be allowed to write repository contents; its deployment job needs Pages and OIDC permissions.

The `news-data` branch contains only `news.json` and its history. Do not edit or force-push it during a collection. A first run creates it only after successfully collecting news. Authentication/network failures are not treated as a missing branch. Workflows are serialized to avoid competing writers.

The artifact contains only `index.html`, `favicon.svg`, `.nojekyll`, `assets/`, `config/` and `data/news.json`. Source scripts, tests, local settings and credentials are not published. All asset paths are relative so the existing `/sector-news-digest/` URL works.

## Optional API keys

RSS works with zero keys. To supplement it, add any of the following under **Settings → Secrets and variables → Actions → Repository secrets**:

- `NEWSDATA_KEY`
- `GNEWS_KEY`
- `CURRENTS_KEY`
- `GUARDIAN_KEY`
- `NYT_KEY`

The collector rotates one configured API per sector per run and falls back to RSS on failures, empty responses or quota errors. With 12 sectors and up to 48 scheduled runs per day, enabling just one key can use up to 576 requests/day; check your provider allowance. No provider plan or quota is assumed. Keys are read only in the collector process and never published to the browser or included in errors.

Keys entered into the old site's browser settings were local to that browser and origin. They are not automatically imported. Do not commit keys or paste them into source files. The old `netlify/` backend is retained for historical reference but is not used or included in the Pages artifact.

## Files

- `config/sectors.json`: shared sector names, RSS feeds and provider queries.
- `scripts/collect_news.py`: parsing, validation, deduplication and outage-safe collection.
- `scripts/news_providers.py`: optional API adapters.
- `scripts/persist_snapshot.py`: data-only branch persistence.
- `assets/news-model.mjs`: snapshot validation, filtering and freshness rules.
- `assets/app.js` / `assets/styles.css`: reader interface.
- `assets/export-model.mjs` / `assets/exports.js`: printable digests and carousels.

PDF export loads html2pdf.js from cdnjs on demand. Fonts use Google Fonts with local fallbacks; article images come from their original hosts. PDF export does not require news images. No analytics or user accounts are included.

## Troubleshooting and rollback

If updates stop, check the latest workflow run and whether scheduled workflows are enabled. If a provider fails, inspect sanitized source status or remove/replace its optional secret; RSS remains available. If all feeds fail, retry the workflow after network recovery. Avoid deleting `news-data` to fix a source outage—it preserves the last useful edition.

For a code regression, revert the offending commit on `main`; its push will build and deploy a new edition. To restore a specific data version, use the history of `news-data` and a normal new commit rather than rewriting history. Keep source and data restoration separate.

All headlines and reporting belong to their original publishers. The digest links to original sources and does not generate news stories.
