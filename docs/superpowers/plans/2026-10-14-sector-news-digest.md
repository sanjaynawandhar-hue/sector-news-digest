# Sector News Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a modern, reliable sector news reader at the existing GitHub Pages URL.

**Architecture:** GitHub Actions fetches RSS and optional news APIs into a durable snapshot on a data-only branch, then deploys the static site and snapshot as a Pages artifact. The browser reads that snapshot, filters stories and exports PDFs; freshness is based on successful collection, never cache access.

**Tech Stack:** Python standard library, vanilla JavaScript ES modules, CSS, existing html2pdf.js, GitHub Actions and Pages.

**Spec:** ../specs/2026-10-14-sector-news-digest-design.md

## Global Constraints

- Preserve https://sanjaynawandhar-hue.github.io/sector-news-digest/ and Sanjay Navandar / ProfessorSK branding.
- Keep a static website with no frontend framework or production build requirement.
- Use the standard library for feed parsing and collection.
- RSS operation must require no keys.
- Never invent stories or timestamps.
- Reject non-HTTP(S) links, invalid dates and dates more than ten minutes in the future.
- Order newest first, cap at 30 stories per sector, and prefer the last seven days.
- A sector is delayed if its last successful fetch is over 90 minutes old; show the actual time.
- Poll for a newer snapshot every five minutes while the page is visible, and recheck when returning to the tab.
- Never place keys in committed files, snapshots, browser storage, URLs shown to users or logs.
- Preserve digest PDF and square LinkedIn carousel exports for a selected sector with branding, source links, publication dates and collection time.
- Ensure visible keyboard focus, labelled controls, accessible contrast, reduced-motion support and no horizontal page overflow at 375px width.

## Review Focus

- One healthy feed alongside failing feeds: publish usable data and expose partial errors; Task 1 tests this.
- HTTP 200 containing HTML or unusable stories: cannot advance successful timestamps; Task 1 tests this.
- First deployment has no news-data branch: initialize only after successful collection; Task 3 verifies this.
- Browser storage disabled or corrupt: reading and refresh still work; Task 2 tests this.
- Missing images or PDF library failure: text export remains possible for image failures and library failures show actionable feedback; Task 2 verifies this.

## Task 1: Collect and preserve trustworthy news snapshots

**Files:** Create config/sectors.json, scripts/collect_news.py, scripts/news_providers.py, tests/test_collect_news.py and tests/fixtures/*.xml.

**Interfaces:** Sector config contains id, name, query, feeds and provider-specific parameters for all 12 existing sectors. Article contains id, title, url, publisher, publishedAt, image (nullable) and sector. Snapshot contains schemaVersion:1, attemptedAt and sectors keyed by ID; each value contains lastSuccessAt (nullable), status (ok/degraded/unavailable), articles and errors (source label and safe error category only).

- [ ] Read repository instructions and use using-git-worktrees to prepare an isolated checkout of the actual sector-news-digest repository. Preserve the original Documents checkout and uncommitted work. Copy approved design and plan into the working checkout.
- [ ] Use test-driven-development. Write Python unittest cases for parse_feed(xml, sector_id, now), normalize_articles(items, now), and collect_snapshot(config, previous, now, fetcher). Assert RSS/Atom support; reject unsafe links, invalid/future dates and HTML errors; deduplicate and limit to 30; prefer stories within seven days. Assert that no valid response preserves prior lastSuccessAt and articles and yields degraded status.
- [ ] Run `python3 -m unittest discover -s tests -v`; confirm the expected failures before implementation.
- [ ] Implement the interfaces above with timezone-aware UTC dates, HTTPS configured feed URLs, bounded bodies, 12-second per-request timeouts and at most six concurrent requests. Retain older articles only when recent ones are absent and retain actual publication dates.
- [ ] Implement configured-provider adapters for NEWSDATA_KEY, GNEWS_KEY, CURRENTS_KEY, GUARDIAN_KEY and NYT_KEY. Read only environment variables. Select one configured API per sector per run by rotation; use RSS when it fails or returns no valid items. Test 401/429/timeout responses, normalization and absence of credentials in output/errors.
- [ ] Add CLI arguments `--config`, `--previous`, `--output`. Write atomically on at least one successful sector; exit nonzero without overwriting output on total failure. Test this with a prior snapshot and on first run.
- [ ] Rerun tests and perform one real collection into a temporary file. Inspect counts and publication-date bounds, without logging keys or full authenticated URLs. Commit the collector and passing regression tests.

## Task 2: Redesign the reader and preserve exports

**Files:** Replace index.html; create assets/styles.css, assets/app.js, assets/news-model.mjs, assets/exports.js, tests/news-model.test.mjs; retain favicon.svg and .nojekyll.

**Interfaces:** news-model.mjs exports validateSnapshot(raw), filterArticles(snapshot, {sector, publisher, query}), sectorFreshness(sectorData, now) and safeUrl(value). app.js consumes config/sectors.json and data/news.json using document-relative URLs. exports.js exports exportDigest({sector, articles, lastSuccessAt}) and exportCarousel with the same input, returning promises.

- [ ] Write Node test cases for malformed snapshots, all 12 sectors, newest-first filtering, text/publisher search, unsafe URLs, 90-minute freshness, preserved timestamps, corrupt cache and unavailable storage. Run `node --test tests/news-model.test.mjs` and confirm expected failures.
- [ ] Implement model validation and cache wrappers. Never overwrite a valid cached snapshot with invalid data or manufacture success timestamps. Keep offline status separate from snapshot source status.
- [ ] Build the editorial layout: warm off-white and charcoal with teal accents, serif headlines, masthead/byline, update status, sector tabs, search, publisher filter, reset, featured story and responsive grid. Include dark theme, accessible focus and reduced-motion rules. Render source text through textContent and validate links before use.
- [ ] Implement explicit loading, empty, no-match, degraded, offline and delayed states. Preserve filters during refresh. Refetch every five minutes only while visible and on visibility return, deduplicating overlapping refreshes. Refresh copy says it checks the latest published edition.
- [ ] Keep compact world clocks. Remove the unreliable market ticker and browser API-key settings. Provide no secrets in the UI; document optional server-side configuration in README.
- [ ] Adapt existing PDF generation to the module interfaces. Use per-sector stories independent of search filters and clearly label export scope. Produce A4 digest and square carousel with timestamps, attribution and source links. Use text fallback if image loading fails. Disable export for empty sectors and show export progress/errors.
- [ ] Run model tests. Serve locally with the real snapshot mounted at data/news.json. Verify desktop and 375px widths, search/reset, all sector tabs, keyboard operation, dark mode, missing images, failed snapshot requests and both PDF downloads. Inspect generated PDF layout using the PDF skill. Capture final desktop/mobile screenshots.
- [ ] Commit the UI and export changes after checks pass.

## Task 3: Publish and verify scheduled updates

**Files:** Create .github/workflows/news-pages.yml; update README.md and .gitignore; include data/news.json only in the deployment artifact, not source history.

**Interfaces:** Workflow reads source main and optional news-data:news.json, runs collector, commits only the snapshot to news-data and packages index.html, favicon.svg, .nojekyll, assets/, config/ and data/news.json for Pages. No local settings, source credentials or development files enter the artifact.

- [ ] Consult current official GitHub Actions and Pages documentation before finalizing workflow syntax, runtime/action versions and permissions. Pin trusted actions to verified commits.
- [ ] Define source-push (main), workflow_dispatch and `17,47 * * * *` schedule triggers. Serialize with cancel-in-progress:false. Scope contents:write to the collection job, and pages:write plus id-token:write to deployment. Set credentials only on the collector step from optional repository secrets.
- [ ] Retrieve the existing data-only branch if present, distinguishing an absent branch from authentication/network failure. On first successful collection create the branch without source files. Do not trigger source-push collection from data-branch commits.
- [ ] Run Python and JavaScript tests before collection/deployment. A total collection failure leaves the deployed artifact and data branch unchanged. A partial failure deploys healthy results plus explicitly degraded prior sector data.
- [ ] Package an explicit file allowlist, upload with the official Pages artifact action and deploy with the official Pages deployment action. Ensure no absolute-root assets break the repository subpath.
- [ ] Update README: all 12 sectors, local commands, manual refresh meaning, scheduled-run delay limitations, safe optional secret names, no-key RSS, diagnostics, Pages setup and rollback procedure. Mark the legacy Netlify backend as unused by this deployment; do not deploy it in the Pages artifact.
- [ ] Run both test suites, inspect generated artifact contents and perform code review using requesting-code-review. Fix actionable findings and rerun affected checks.
- [ ] Push reviewed changes to the repository and enable Actions-based Pages publishing if access permits. Trigger a workflow and inspect collection and deployment results. If access blocks a setting, complete all available preparation and report that exact blocker.
- [ ] Verify public HTML and data/news.json at the existing URL, real article dates and UI status. Test refresh and an export on production. Report only observed success; the next scheduled run is separate from manual deployment verification.

## Plan self-review

Spec coverage checked: all sectors, no-key collection, optional providers, persistent outage-safe data, freshness, responsive UI, filters, theme, clocks, both exports, safe text/URLs, secrets and deployment are assigned above. Interfaces are shared explicitly; source and deployment artifacts remain separate. Production publication is not complete until its live data and interface are verified.

## Execution choice

Recommended: Native execution in this chat because collector, snapshot and reader changes share one small set of interfaces. A final independent review follows implementation. Pending user review of this plan and choice of Native or Subagent-driven execution, as required by the requested workflow.
