// usgs.js - fetch real earthquakes from the USGS FDSN Event API (client-side).
// Canonical public source: https://earthquake.usgs.gov/fdsnws/event/1/
//
// Wide time spans are split into small MONTHLY windows fetched with bounded
// concurrency (each a fast request), with a per-request timeout that covers the
// response body, one backed-off retry, and dropped-window accounting so a slow
// or failing month is visible rather than a silent hole. Prebuilt summary FEEDS
// are single fast files. Returns typed arrays sorted by time ascending.

const FDSN = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const PAGE_CAP = 20000;
const CONCURRENCY = 6;
const REQ_TIMEOUT = 20000;

// Fetch + parse JSON within one timeout (covers headers AND the body).
async function fetchJson(url, ms = REQ_TIMEOUT) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

// Fast path: a prebuilt summary feed (single request, CDN-cached, CORS-enabled).
export async function fetchFeed(name = "4.5_month") {
  const gj = await fetchJson(`${FEED}/${name}.geojson`);
  const out = parseFeatures(gj.features || []);
  out.dropped = 0;
  return out;
}

// Historical range: monthly windows, bounded concurrency, resilient. Any window
// that fails (after one retry) is counted in `.dropped` instead of failing all.
export async function fetchRange({ start, end, minMag = 4.5, onProgress } = {}) {
  const queue = monthWindows(iso10(start), iso10(end));
  const total = queue.length;
  const collected = [];
  let done = 0, dropped = 0;
  const worker = async () => {
    while (queue.length) {
      const [ws, we] = queue.shift();
      const feats = await fetchWindow(ws, we, minMag);
      if (feats === null) dropped++;
      else for (const f of feats) collected.push(f);
      done++;
      if (onProgress) onProgress(collected.length, Math.round((done / total) * 100));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  if (!collected.length) throw new Error("no events returned");
  const out = parseFeatures(collected);
  out.dropped = dropped;
  return out;
}

// Returns feature array, or null if the window ultimately failed.
async function fetchWindow(s, e, minMag, attempt = 0) {
  const url = `${FDSN}?format=geojson&starttime=${s}&endtime=${e}&minmagnitude=${minMag}&limit=${PAGE_CAP}`;
  let feats;
  try {
    feats = (await fetchJson(url)).features || [];
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 500));   // brief backoff (helps with rate limits)
      return fetchWindow(s, e, minMag, attempt + 1);
    }
    return null;
  }
  if (feats.length >= PAGE_CAP) {                       // too many: split the window
    const mid = midISO(s, e);
    if (mid === s || mid === e) return feats;
    const [a, b] = await Promise.all([fetchWindow(s, mid, minMag), fetchWindow(mid, e, minMag)]);
    return (a || []).concat(b || []);
  }
  return feats;
}

// GeoJSON features -> {count, lon, lat, depthKm, mag, timeMs, place[], url[]}
export function parseFeatures(features) {
  const seen = new Set();
  const rows = [];
  for (const f of features) {
    if (!f || !f.geometry || !f.properties) continue;
    const id = f.id;
    if (id) { if (seen.has(id)) continue; seen.add(id); }
    const c = f.geometry.coordinates;
    const mag = f.properties.mag;
    if (mag == null || !c || c.length < 2) continue;
    rows.push({
      lon: +c[0], lat: +c[1], depth: c[2] == null ? 0 : +c[2],
      mag: +mag, time: +f.properties.time,
      place: f.properties.place || "", url: f.properties.url || "",
    });
  }
  rows.sort((a, b) => a.time - b.time);
  const N = rows.length;
  const out = {
    count: N,
    lon: new Float32Array(N), lat: new Float32Array(N),
    depthKm: new Float32Array(N), mag: new Float32Array(N),
    timeMs: new Float64Array(N), place: new Array(N), url: new Array(N),
  };
  for (let i = 0; i < N; i++) {
    const r = rows[i];
    out.lon[i] = r.lon; out.lat[i] = r.lat; out.depthKm[i] = r.depth;
    out.mag[i] = r.mag; out.timeMs[i] = r.time; out.place[i] = r.place; out.url[i] = r.url;
  }
  return out;
}

function iso10(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string" && d.length >= 10) return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}
function monthWindows(start, end) {
  const out = [];
  let y = +start.slice(0, 4), m = +start.slice(5, 7);
  let ws = start;
  const endT = Date.parse(end);
  for (let guard = 0; guard < 1200; guard++) {
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const nextFirst = `${ny}-${String(nm).padStart(2, "0")}-01`;
    const we = Date.parse(nextFirst) < endT ? nextFirst : end;
    if (ws < we) out.push([ws, we]);
    if (we === end) break;
    ws = nextFirst; y = ny; m = nm;
  }
  return out.length ? out : [[start, end]];
}
function midISO(s, e) {
  return new Date((Date.parse(s) + Date.parse(e)) / 2).toISOString();
}
