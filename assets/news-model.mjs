const CACHE_KEY = "sector-digest-edition-v2";
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function validateSnapshot(raw) {
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(raw.attemptedAt)) ||
    !raw.sectors ||
    typeof raw.sectors !== "object" ||
    Array.isArray(raw.sectors) ||
    !Object.keys(raw.sectors).length
  )
    throw Error("Invalid edition");
  const sectors = {};
  for (const [id, data] of Object.entries(raw.sectors)) {
    if (
      !data ||
      !Array.isArray(data.articles) ||
      !["ok", "degraded", "unavailable"].includes(data.status) ||
      (data.lastSuccessAt !== null &&
        !Number.isFinite(Date.parse(data.lastSuccessAt)))
    )
      throw Error("Invalid sector");
    const articles = data.articles
      .filter(
        (a) =>
          a &&
          typeof a.title === "string" &&
          a.title.trim() &&
          safeUrl(a.url) &&
          Number.isFinite(Date.parse(a.publishedAt)) &&
          a.sector === id,
      )
      .map((a) => ({
        ...a,
        url: safeUrl(a.url),
        image: safeUrl(a.image),
        publisher: String(a.publisher || "News source"),
      }));
    sectors[id] = { ...data, articles };
  }
  return { ...raw, sectors };
}
export function filterArticles(
  snapshot,
  { sector = "all", publisher = "all", query = "" } = {},
) {
  const search = query.trim().toLocaleLowerCase();
  const seen = new Set();
  return Object.entries(snapshot?.sectors || {})
    .filter(([id]) => sector === "all" || sector === id)
    .flatMap(([, data]) => data.articles)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((a) => {
      if (
        (publisher !== "all" && a.publisher !== publisher) ||
        (search &&
          !`${a.title} ${a.publisher}`.toLocaleLowerCase().includes(search)) ||
        seen.has(a.url)
      )
        return false;
      seen.add(a.url);
      return true;
    });
}
export function sectorFreshness(data, now = Date.now()) {
  if (!data?.articles?.length || !data.lastSuccessAt) return "unavailable";
  if (now - Date.parse(data.lastSuccessAt) > 90 * 60 * 1000) return "delayed";
  return data.status === "degraded" ? "partial" : "current";
}
export function readCached(storage) {
  try {
    const value = storage.getItem(CACHE_KEY);
    return value ? validateSnapshot(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
export function writeCached(storage, snapshot) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(validateSnapshot(snapshot)));
  } catch {}
}
