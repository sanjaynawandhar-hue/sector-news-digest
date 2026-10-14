import test from "node:test";
import assert from "node:assert/strict";
let model;
try {
  model = await import("../assets/news-model.mjs");
} catch {
  model = {};
}
const now = Date.parse("2026-10-14T00:00:00Z");
const article = {
  id: "a",
  title: "Solar funding rises",
  url: "https://example.com/a",
  publisher: "Example",
  publishedAt: "2026-10-13T23:00:00Z",
  image: null,
  sector: "energy",
};
const snapshot = {
  schemaVersion: 1,
  attemptedAt: "2026-10-14T00:00:00Z",
  sectors: {
    energy: {
      lastSuccessAt: "2026-10-14T00:00:00Z",
      status: "ok",
      articles: [article],
      errors: [],
    },
  },
};
function ready() {
  assert.equal(
    typeof model.validateSnapshot,
    "function",
    "news model not implemented",
  );
}
test("malformed editions cannot replace good news", () => {
  ready();
  assert.throws(() => model.validateSnapshot({}));
  assert.throws(() =>
    model.validateSnapshot({
      ...snapshot,
      sectors: { energy: { articles: "bad" } },
    }),
  );
  assert.equal(
    model.validateSnapshot(snapshot).sectors.energy.articles.length,
    1,
  );
});
test("unsafe links are never reader navigation", () => {
  ready();
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "https://user:pass@example.com",
  ])
    assert.equal(model.safeUrl(url), null);
  assert.equal(model.safeUrl("https://example.com/a"), "https://example.com/a");
});
test("search and publisher filters combine and match case independently", () => {
  ready();
  assert.equal(
    model.filterArticles(snapshot, {
      sector: "energy",
      publisher: "Example",
      query: "SOLAR",
    }).length,
    1,
  );
  assert.equal(
    model.filterArticles(snapshot, {
      sector: "energy",
      publisher: "Other",
      query: "",
    }).length,
    0,
  );
  assert.equal(
    model.filterArticles(snapshot, {
      sector: "all",
      publisher: "all",
      query: "example",
    }).length,
    1,
  );
});
test("all twelve sectors participate and newest stories come first", () => {
  ready();
  const s = structuredClone(snapshot);
  s.sectors = {};
  for (let i = 0; i < 12; i++)
    s.sectors["s" + i] = {
      ...snapshot.sectors.energy,
      articles: [
        {
          ...article,
          id: "" + i,
          url: "https://example.com/" + i,
          sector: "s" + i,
          publishedAt: `2026-10-13T23:${String(i).padStart(2, "0")}:00Z`,
        },
      ],
    };
  assert.equal(
    model.filterArticles(s, { sector: "all", publisher: "all", query: "" })
      .length,
    12,
  );
  assert.equal(
    model.filterArticles(s, { sector: "all", publisher: "all", query: "" })[0]
      .id,
    "11",
  );
});
test("staleness uses collection time not view or cache access", () => {
  ready();
  assert.equal(
    model.sectorFreshness(
      { ...snapshot.sectors.energy, lastSuccessAt: "2026-10-13T22:29:00Z" },
      now,
    ),
    "delayed",
  );
  assert.equal(
    model.sectorFreshness(
      { ...snapshot.sectors.energy, lastSuccessAt: "2026-10-13T22:30:00Z" },
      now,
    ),
    "current",
  );
  assert.equal(
    model.sectorFreshness({ articles: [], lastSuccessAt: null }, now),
    "unavailable",
  );
});
test("corrupt and unavailable browser storage cannot break reading", () => {
  ready();
  const bad = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.equal(model.readCached(bad), null);
  assert.doesNotThrow(() => model.writeCached(bad, snapshot));
  assert.equal(model.readCached({ getItem: () => "{broken" }), null);
  let serialized;
  model.writeCached(
    {
      setItem(k, v) {
        serialized = v;
      },
    },
    snapshot,
  );
  assert.equal(
    model.readCached({ getItem: () => serialized }).sectors.energy
      .lastSuccessAt,
    "2026-10-14T00:00:00Z",
  );
});
test("export rejects empty sectors and keeps real links and timestamps", async () => {
  let ex;
  try {
    ex = await import("../assets/export-model.mjs");
  } catch {
    ex = {};
  }
  assert.equal(typeof ex.exportSections, "function", "export model missing");
  assert.throws(() =>
    ex.exportSections({
      sector: { name: "Energy" },
      articles: [],
      lastSuccessAt: null,
    }),
  );
  const sections = ex.exportSections({
    sector: { name: "Energy" },
    articles: [article],
    lastSuccessAt: "2026-10-14T00:00:00Z",
  });
  assert.equal(sections.articles[0].url, "https://example.com/a");
  assert.equal(sections.lastSuccessAt, "2026-10-14T00:00:00Z");
});
test("PDF artwork fills the paper instead of leaving a blank side strip", async () => {
  const ex = await import("../assets/export-model.mjs");
  assert.equal(typeof ex.exportPageSize, "function", "paper sizing missing");
  assert.deepEqual(ex.exportPageSize(true), { width: 960, height: 960 });
  assert.deepEqual(ex.exportPageSize(false), { width: 794, height: 1122 });
});
