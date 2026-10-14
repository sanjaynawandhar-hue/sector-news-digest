export async function loadConfiguration(current, fetcher = fetch) {
  if (current.length) return current;
  try {
    const response = await fetcher('config/sectors.json', {cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (!response.ok) return [];
    const config = await response.json();
    if (!Array.isArray(config) || !config.length || !config.every(s => s && typeof s.id==='string' && typeof s.name==='string') || new Set(config.map(s=>s.id)).size!==config.length) return [];
    return config;
  } catch { return []; }
}
export function exportableSectors(config, snapshot) {
  return config.filter(s=>snapshot?.sectors[s.id]?.articles.length);
}
