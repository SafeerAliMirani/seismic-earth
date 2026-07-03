// cities.js - fetch real major world cities from Natural Earth populated places
// (public domain, via jsDelivr) and return them as { name, lat, lon, country }
// sorted largest-population first, so a caller can treat array index as a rough
// importance rank (labels.js reveals more of them as you zoom in).
//
// Primary source: 50m populated places (~1250 cities). Because that file is
// ~1.4 MB and can be slow on some networks, it is tried with a generous timeout
// and one retry, then falls back to the 110m set (~240 cities) so the globe
// always ends up with cities even on a poor connection.

const URL_50M  = "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/50m/cultural/ne_50m_populated_places_simple.json";
const URL_110M = "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/cultural/ne_110m_populated_places_simple.json";

// Tolerant field readers - cities datasets disagree on spellings.
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const getLat = (p, xy) => num(p.latitude ?? p.lat) ?? (xy ? num(xy[1]) : null);
const getLon = (p, xy) => num(p.longitude ?? p.lon ?? p.lng) ?? (xy ? num(xy[0]) : null);
const getPop = (p) => num(p.pop_max ?? p.population ?? p.pop) ?? 0;

async function fetchJson(url, timeoutMs) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`cities: HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

export async function fetchCities(limit = 1000) {
  // Try 50m (with one retry), then fall back to 110m.
  const attempts = [[URL_50M, 30000], [URL_50M, 30000], [URL_110M, 15000]];
  let gj = null, lastErr = null;
  for (const [url, ms] of attempts) {
    try { gj = await fetchJson(url, ms); break; }
    catch (e) { lastErr = e; }
  }
  if (!gj) throw lastErr || new Error("cities: unavailable");

  // Accept a GeoJSON FeatureCollection or a plain array of records.
  const rows = Array.isArray(gj) ? gj : gj.features || [];
  const seen = new Set(); // dedupe by name + country
  const cities = [];
  for (const row of rows) {
    const p = row.properties || row;
    const xy = row.geometry && row.geometry.coordinates;
    const name = p.name || p.nameascii || p.city;
    const lat = getLat(p, xy), lon = getLon(p, xy);
    if (!name || lat === null || lon === null) continue;
    const key = `${name}|${p.adm0name ?? p.country ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push({ name, lat, lon, pop: getPop(p), country: p.adm0name ?? p.country ?? "" });
  }

  // Largest first. sort() is stable, so a population-less dataset keeps order.
  cities.sort((a, b) => b.pop - a.pop);
  return cities.slice(0, Math.max(0, limit)).map(({ name, lat, lon, country }) => ({ name, lat, lon, country }));
}
