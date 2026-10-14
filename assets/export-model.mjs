import { safeUrl } from "./news-model.mjs";
export function exportSections({ sector, articles, lastSuccessAt }) {
  const valid = articles.filter((a) => safeUrl(a.url));
  if (!valid.length)
    throw Error("There are no stories to export in this sector.");
  return { name: sector.name, articles: valid.slice(0, 5), lastSuccessAt };
}

export function exportPageSize(carousel) {
  return carousel ? { width: 960, height: 960 } : { width: 794, height: 1122 };
}
