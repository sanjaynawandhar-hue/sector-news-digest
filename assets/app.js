import {
  validateSnapshot,
  filterArticles,
  sectorFreshness,
  readCached,
  writeCached,
  safeUrl,
} from "./news-model.mjs";
import { exportDigest, exportCarousel } from "./exports.js";
const $ = (id) => document.getElementById(id);
const state = {
  config: [],
  snapshot: null,
  sector: "all",
  publisher: "all",
  query: "",
  limit: 13,
  offline: false,
  loading: false,
  exporting: false,
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : "Not collected yet";
}
function relative(value) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  return minutes < 1
    ? "Just published"
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function external(url) {
  const a = document.createElement("a");
  a.href = safeUrl(url) || "#";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function sectorFor(id) {
  return (
    state.config.find((s) => s.id === id) || {
      id,
      name: "News",
      color: "#235b46",
    }
  );
}
function makeKicker(article, featured = false) {
  const k = el("div", "article-kicker");
  k.append(
    el("span", "", sectorFor(article.sector).name),
    el("span", "tiny-dot"),
    el("span", "", featured ? "IN FOCUS" : "LATEST"),
  );
  return k;
}
function metadata(article, arrow = false) {
  const n = el("div", "article-meta");
  const t = el("time", "", relative(article.publishedAt));
  t.dateTime = article.publishedAt;
  t.title = formatDate(article.publishedAt);
  n.append(
    el("span", "publisher-icon", article.publisher.slice(0, 1)),
    el("span", "", article.publisher),
    el("span", "", "·"),
    t,
  );
  if (arrow) {
    const link = external(article.url);
    link.className = "go";
    link.textContent = "↗";
    link.setAttribute("aria-label", `Read ${article.title}`);
    n.append(link);
  }
  return n;
}
function title(article) {
  const h = el("h3");
  const a = external(article.url);
  a.textContent = article.title;
  h.append(a);
  return h;
}
function illustration(article) {
  const s = sectorFor(article.sector);
  const art = el("div", "editorial-art");
  art.setAttribute("aria-hidden", "true");
  art.append(
    el("div", "art-lines"),
    el(
      "span",
      "art-number",
      String(state.config.findIndex((x) => x.id === s.id) + 1).padStart(2, "0"),
    ),
    el("span", "art-sector", s.name),
    el("span", "art-caption", "THE SECTOR PERSPECTIVE"),
  );
  return art;
}
function featured(article) {
  const card = el("article", "featured-card");
  const copy = el("div", "feature-copy");
  const read = external(article.url);
  read.className = "read-link";
  read.append(el("span", "", "Read the full story"), el("span", "", "↗"));
  copy.append(
    makeKicker(article, true),
    title(article),
    metadata(article),
    read,
  );
  const visual = el("div", "feature-visual");
  visual.append(illustration(article));
  if (article.image) {
    const img = el("img");
    img.src = article.image;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove(), { once: true });
    visual.append(img);
  }
  card.append(copy, visual);
  return card;
}
function articleCard(article, index) {
  const card = el("article", "article-card");
  if (article.image && index < 3) {
    const img = el("img", "article-thumb");
    img.src = article.image;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove(), { once: true });
    card.append(img);
  }
  card.append(makeKicker(article), title(article), metadata(article, true));
  return card;
}
function updatePublishers() {
  const previous = state.publisher;
  const articles = filterArticles(state.snapshot, { sector: state.sector });
  const names = [...new Set(articles.map((a) => a.publisher))].sort();
  $("publisher").replaceChildren(
    new Option("All publishers", "all"),
    ...names.map((name) => new Option(name, name)),
  );
  if (names.includes(previous)) $("publisher").value = previous;
  else state.publisher = "all";
}
function renderStatus() {
  const entries =
    state.sector === "all"
      ? Object.entries(state.snapshot?.sectors || {})
      : [[state.sector, state.snapshot?.sectors[state.sector]]];
  const available = entries.filter(([, x]) => x);
  const outdated = available.filter(([, x]) =>
    ["delayed", "unavailable"].includes(sectorFreshness(x)),
  );
  const partial = available.filter(([, x]) => sectorFreshness(x) === "partial");
  $("statusLabel").textContent = state.offline
    ? "Saved edition"
    : outdated.length
      ? "Updates delayed"
      : partial.length
        ? "Some sources unavailable"
        : "Edition up to date";
  const times = available
    .map(([, x]) => x.lastSuccessAt)
    .filter(Boolean)
    .sort();
  $("lastUpdated").textContent = times.length
    ? `Collected ${formatDate(times[0])}`
    : "No successful collection yet";
  let notice = "";
  if (state.offline)
    notice =
      "The latest edition could not be reached. You’re reading saved headlines; their original collection times are unchanged.";
  else if (outdated.length)
    notice = `${outdated.length} ${outdated.length === 1 ? "sector is" : "sectors are"} waiting for a fresh update. Available stories remain readable with their original publication dates.`;
  else if (partial.length)
    notice =
      "Some sources are temporarily unavailable. Headlines from working sources are still being collected.";
  $("notice").textContent = notice;
  $("notice").hidden = !notice;
  $("sectorStatus").replaceChildren(
    ...state.config.map((s) => {
      const d = state.snapshot?.sectors[s.id];
      const box = el("div");
      box.append(
        el("strong", "", s.name),
        el(
          "span",
          "",
          `${sectorFreshness(d)} · ${d?.articles.length || 0} stories`,
        ),
        el("br"),
        el("span", "", `Collected: ${formatDate(d?.lastSuccessAt)}`),
      );
      if (d?.errors?.length)
        box.append(
          el("br"),
          el("span", "", `${d.errors.length} source request(s) unavailable`),
        );
      return box;
    }),
  );
}
function render() {
  const articles = filterArticles(state.snapshot, {
    sector: state.sector,
    publisher: state.publisher,
    query: state.query,
  });
  const total = filterArticles(state.snapshot).length;
  $("sourceCount").textContent =
    new Set(filterArticles(state.snapshot).map((a) => a.publisher)).size || "—";
  $("resultCount").textContent =
    `${articles.length} ${articles.length === 1 ? "story" : "stories"}${state.sector === "all" ? " across all sectors" : ` in ${sectorFor(state.sector).name}`}`;
  $("resetBtn").hidden =
    state.sector === "all" && state.publisher === "all" && !state.query;
  $("exportBtn").disabled = !total;
  $("featured").replaceChildren(
    ...(articles.length ? [featured(articles[0])] : []),
  );
  $("articleGrid").replaceChildren(
    ...articles.slice(1, state.limit).map(articleCard),
  );
  $("articleGrid").setAttribute("aria-busy", "false");
  $("emptyState").hidden = !!articles.length;
  $("emptyTitle").textContent = total
    ? "No stories match your search"
    : "No edition available yet";
  $("emptyCopy").textContent = total
    ? "Try another keyword, choose a different publisher, or reset your filters."
    : "Please try Refresh again shortly. Collection may be temporarily unavailable.";
  $("loadMore").hidden = articles.length <= state.limit;
  $("loadMore").textContent =
    `More stories (${Math.min(12, articles.length - state.limit)}) ↓`;
  for (const button of $("sectorNav").querySelectorAll("button")) {
    const active = button.dataset.sector === state.sector;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderStatus();
}
function chooseSector(id) {
  state.sector = id;
  state.limit = 13;
  state.publisher = "all";
  updatePublishers();
  render();
}
async function fetchEdition() {
  if (state.loading) return;
  state.loading = true;
  $("refreshBtn").disabled = true;
  try {
    const response = await fetch(`data/news.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("Edition unavailable");
    const snapshot = validateSnapshot(await response.json());
    if (
      !state.snapshot ||
      Date.parse(snapshot.attemptedAt) >= Date.parse(state.snapshot.attemptedAt)
    ) {
      state.snapshot = snapshot;
      writeCached(storage, snapshot);
    }
    state.offline = false;
    updatePublishers();
    render();
  } catch {
    state.offline = true;
    render();
  } finally {
    state.loading = false;
    $("refreshBtn").disabled = false;
  }
}
function clocks() {
  const zones = [
    ["IN", "Asia/Kolkata"],
    ["DXB", "Asia/Dubai"],
    ["NY", "America/New_York"],
    ["LDN", "Europe/London"],
  ];
  $("clocks").replaceChildren(
    ...zones.map(([label, zone]) => {
      const n = el("span");
      n.append(
        el("b", "", label),
        document.createTextNode(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: zone,
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date()),
        ),
      );
      return n;
    }),
  );
  $("editionDate").textContent = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeBtn").setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
  try {
    storage?.setItem("sector-theme", theme);
  } catch {}
}
function openExport() {
  const available = state.config.filter(
    (s) => state.snapshot?.sectors[s.id]?.articles.length,
  );
  $("exportSector").replaceChildren(
    ...available.map((s) => new Option(s.name, s.id)),
  );
  if (available.some((s) => s.id === state.sector))
    $("exportSector").value = state.sector;
  $("exportStatus").textContent = "";
  $("exportDialog").showModal();
}
async function exportFile(kind) {
  if (state.exporting) return;
  state.exporting = true;
  const sid = $("exportSector").value,
    data = state.snapshot.sectors[sid];
  $("digestPdf").disabled = $("carouselPdf").disabled = true;
  $("exportStatus").textContent = "Preparing your PDF…";
  try {
    await (kind === "digest" ? exportDigest : exportCarousel)({
      sector: sectorFor(sid),
      articles: data.articles,
      lastSuccessAt: data.lastSuccessAt,
    });
    $("exportStatus").textContent = "Your PDF is ready. Check your downloads.";
  } catch (error) {
    $("exportStatus").textContent =
      error.message || "PDF could not be created. Please try again.";
  } finally {
    state.exporting = false;
    $("digestPdf").disabled = $("carouselPdf").disabled = false;
  }
}
async function init() {
  try {
    setTheme(storage?.getItem("sector-theme") || "light");
  } catch {
    setTheme("light");
  }
  clocks();
  setInterval(clocks, 60000);
  $("themeBtn").onclick = () =>
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  $("refreshBtn").onclick = fetchEdition;
  $("search").addEventListener("input", () => {
    state.query = $("search").value;
    state.limit = 13;
    render();
  });
  $("publisher").onchange = () => {
    state.publisher = $("publisher").value;
    state.limit = 13;
    render();
  };
  $("resetBtn").onclick = () => {
    state.query = "";
    $("search").value = "";
    chooseSector("all");
  };
  $("loadMore").onclick = () => {
    state.limit += 12;
    render();
  };
  $("exportBtn").onclick = openExport;
  $("closeExport").onclick = () => $("exportDialog").close();
  $("digestPdf").onclick = () => exportFile("digest");
  $("carouselPdf").onclick = () => exportFile("carousel");
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(
        document.activeElement.tagName,
      ) &&
      !$("exportDialog").open
    ) {
      e.preventDefault();
      $("search").focus();
    }
  });
  $("sectorNav").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-sector]");
    if (button) chooseSector(button.dataset.sector);
  });
  try {
    const response = await fetch("config/sectors.json");
    if (!response.ok) throw Error("Configuration unavailable");
    state.config = await response.json();
    for (const s of state.config) {
      const button = el("button", "sector-tab", s.name);
      button.dataset.sector = s.id;
      button.setAttribute("aria-pressed", "false");
      $("sectorNav").append(button);
    }
  } catch {
    $("notice").hidden = false;
    $("notice").textContent =
      "Sector navigation could not load. Please reload the page.";
  }
  state.snapshot = readCached(storage);
  if (state.snapshot) {
    state.offline = true;
    updatePublishers();
    render();
  }
  await fetchEdition();
  setInterval(() => {
    if (!document.hidden) fetchEdition();
  }, 300000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fetchEdition();
  });
}
init();
