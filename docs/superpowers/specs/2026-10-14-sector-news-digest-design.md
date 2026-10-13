# Sector News Digest — reliable updates and interface redesign

## Approved direction

Preserve https://sanjaynawandhar-hue.github.io/sector-news-digest/ and Sanjay Navandar / ProfessorSK branding. Replace the dependency on anonymous browser CORS proxies with news snapshots collected by GitHub Actions. Modernize the existing reading and PDF export experience for desktop and mobile. The user approved this direction on 14 October 2026; this document supplies the concrete design for review.

## Current evidence

The live page reports RSS-only mode and no stories in all 12 sectors. A Technology retry also returned no stories. A direct Google News RSS request returned 100 items, while CodeTabs returned HTTP 503, both AllOrigins routes timed out, and ThingProxy failed DNS resolution. The Netlify probe on the GitHub Pages hostname returned HTTP 404. The repository's Netlify function cannot run on that host.

The current cache merges prior stories into a failed response and assigns a new timestamp. This can make old data appear newly refreshed. The Documents project has no detected saved API key configuration; its browser settings store keys in localStorage, scoped to the browser and origin.

## Data delivery

A Python collector runs in GitHub Actions, fetching configured HTTPS RSS feeds directly with timeouts and bounded concurrency. Use the standard library for feed parsing and collection. No anonymous CORS proxy is needed. Keep one shared sector configuration for the collector and interface.

Collect all existing sectors: Technology; Finance & Markets; Healthcare & Pharma; Energy & Oil; Automobiles & EV; Real Estate; Agriculture; Defence & Aerospace; Retail & Consumer; Telecom; Crypto News; Bollywood News. Use Google News sector searches plus suitable named publisher feeds. Each sector needs independent failure isolation.

Normalize stories into id, title, URL, publisher, publication time, optional image URL and sector. Reject non-HTTP(S) links, invalid dates and dates more than ten minutes in the future. Deduplicate normalized URLs and titles. Order newest first, cap at 30 stories per sector, and prefer the last seven days. Never invent stories or timestamps. Missing images use a deliberate typographic treatment.

Write a versioned JSON snapshot containing collection attempt time, each sector's last successful fetch time, status, stories and sanitized source errors. A successful fetch time means a valid nonempty provider response, not necessarily newly published articles. On a failed sector fetch, preserve its prior stories and successful timestamp, mark it degraded and retain the new attempt time separately. A total failure must not replace useful data with an empty snapshot and must fail the workflow visibly.

Support optional existing news-provider integrations using GitHub Secrets: NEWSDATA_KEY, GNEWS_KEY, CURRENTS_KEY, GUARDIAN_KEY and NYT_KEY. Use only configured providers, bound requests, and fall back to RSS on quota or provider errors. RSS operation must require no keys. Never place keys in committed files, snapshots, browser storage, URLs shown to users or logs. Recovering old browser keys is not a prerequisite.

## Automation and publishing

Run collection on manual dispatch, source pushes and a twice-hourly schedule offset from the hour. Scheduling is best effort, not a promise of exact delivery times. Deploy the static application plus generated snapshot with the official GitHub Pages artifact workflow. Use minimal workflow permissions, serialized deployment concurrency and trusted action versions.

Retain the previous successful snapshot as news.json on a data-only news-data branch. The collector reads that snapshot before collection, then commits the updated snapshot only when at least one sector succeeds. The serialized workflow prevents concurrent writers. A first run without prior data must collect at least one sector before deploying. Source code and credentials do not belong in the data snapshot. Preserve deployment rollback through Git history and Pages deployments.

The website's Refresh button refetches the most recently published snapshot. Explain this behavior in its status text; a public reader cannot trigger privileged GitHub workflows. Poll for a newer snapshot every five minutes while the page is visible, and recheck when returning to the tab.

## Interface

Use a restrained editorial design: warm off-white background, charcoal text, deep teal accents, a serif headline style and readable sans-serif controls. Provide a matching dark theme. Keep the site title and author attribution prominent without a crowded header.

Desktop layout: masthead and clear update status, horizontal sector navigation, a featured latest story, and an article grid with source, publication time and sector. Mobile layout stacks naturally with horizontally scrollable sector tabs. Avoid animation-heavy decoration and unnecessary frameworks.

Provide search across title and publisher, sector and publisher filters, and a reset action. Maintain selections during refresh. Distinguish loading, no matches, no data, offline cached data and delayed updates. A sector is delayed if its last successful fetch is over 90 minutes old; show the actual time. Article publication time remains separate from collection time.

Render external text as text, not raw HTML. Use safe links and lazy-loaded images. Ensure visible keyboard focus, labelled controls, accessible contrast, reduced-motion support and no horizontal page overflow at 375px width. Preserve theme preference locally; do not persist API credentials.

Preserve digest PDF and square LinkedIn carousel exports for a selected sector with branding, source links, publication dates and collection time. Make export progress and failures visible. Missing or cross-origin images must not block text-based export. Disable exports when there are no stories.

Keep the existing world clocks as a compact secondary feature. Remove the unreliable market ticker from the primary reading flow unless its values can be accompanied by a verified timestamp and unavailable states; do not present stale prices as live.

## Scope and file responsibilities

Keep a static website with no frontend framework or production build requirement. Separate styles, rendering/filtering code, snapshot validation and export code into focused files. Keep collection and provider adapters separate from browser code. Update the README with local development, GitHub Pages deployment, secrets setup, schedule limitations and troubleshooting.

Do not add accounts, subscriptions, trading features, paid services or AI-generated news summaries. The current request authorizes implementation and publication of the redesigned existing website; deployment must still pass available platform access checks.

## Verification and acceptance

- Collector tests cover RSS and Atom parsing, malformed feeds, unsafe URLs, invalid dates, duplicates, provider failures, partial failure and total outage preservation.
- Regression tests prove failed refreshes do not advance last-success timestamps or turn stale stories into fresh ones.
- Snapshot and UI tests cover all 12 sectors, filtering, empty results, missing images and offline/delayed states.
- Fetch real feeds before publication and inspect the publication dates in the resulting data.
- Verify the complete website at desktop and 375px mobile widths, keyboard navigation, theme switching, refresh behavior and both PDF export formats.
- Verify deployment success and the actual public URL, including its snapshot URL under the repository subpath. Distinguish deployment completion from the next scheduled run, which cannot be guaranteed during a single session.
- Report any credentials, repository settings or deployment permissions that remain unavailable. Do not claim a live fix from local tests alone.

## Review status

Design self-review completed: scope, data freshness semantics, outage behavior, key handling and acceptance criteria are specified. User approved the written specification with “do it” on 14 October 2026. Implementation plan review is the next workflow gate.
