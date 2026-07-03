// borders.js - fetch real Natural Earth admin-0 country borders (110m) and
// convert them to globe line-segments. Public GeoJSON via jsDelivr
// (CORS-enabled), same repo as coastlines.js. If it can't be reached, the
// caller simply skips borders; the globe still works.
// Verified: URL returns a GeoJSON FeatureCollection of Polygon/MultiPolygon
// country features (Natural Earth ne_110m_admin_0_countries).

const URL = "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/cultural/ne_110m_admin_0_countries.json";

export async function fetchBorders(radius = 1.0017, timeoutMs = 15000) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutMs);
  let gj;
  try {
    const r = await fetch(URL, { signal: c.signal });
    if (!r.ok) throw new Error(`borders: HTTP ${r.status}`);
    gj = await r.json();
  } finally {
    clearTimeout(to);
  }

  const v = [];
  const vert = (ll) => {
    const lon = (ll[0] * Math.PI) / 180, lat = (ll[1] * Math.PI) / 180, cl = Math.cos(lat);
    v.push(radius * cl * Math.cos(lon), radius * Math.sin(lat), radius * cl * Math.sin(lon));
  };
  // Segments between consecutive ring points, then close the ring. GeoJSON
  // rings normally repeat the first point at the end; only add an explicit
  // closing segment when they don't, to avoid zero-length lines.
  const addRing = (ring) => {
    for (let i = 0; i + 1 < ring.length; i++) { vert(ring[i]); vert(ring[i + 1]); }
    const a = ring[ring.length - 1], b = ring[0];
    if (ring.length > 2 && (a[0] !== b[0] || a[1] !== b[1])) { vert(a); vert(b); }
  };

  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") for (const ring of g.coordinates) addRing(ring);
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates) for (const ring of poly) addRing(ring);
  }
  return new Float32Array(v);
}
