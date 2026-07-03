// coastlines.js - fetch real Natural Earth coastlines (110m) and convert them
// to globe line-segments. Public GeoJSON via jsDelivr (CORS-enabled). If it
// can't be reached, the caller simply skips coastlines; the globe still works.

const URL = "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/physical/ne_110m_coastline.json";

export async function fetchCoastlines(radius = 1.0016, timeoutMs = 15000) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutMs);
  let gj;
  try {
    const r = await fetch(URL, { signal: c.signal });
    if (!r.ok) throw new Error(`coastlines: HTTP ${r.status}`);
    gj = await r.json();
  } finally {
    clearTimeout(to);
  }

  const v = [];
  const vert = (ll) => {
    const lon = (ll[0] * Math.PI) / 180, lat = (ll[1] * Math.PI) / 180, cl = Math.cos(lat);
    v.push(radius * cl * Math.cos(lon), radius * Math.sin(lat), radius * cl * Math.sin(lon));
  };
  const addLine = (coords) => {
    for (let i = 0; i + 1 < coords.length; i++) { vert(coords[i]); vert(coords[i + 1]); }
  };

  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") addLine(g.coordinates);
    else if (g.type === "MultiLineString") for (const line of g.coordinates) addLine(line);
    else if (g.type === "Polygon") for (const ring of g.coordinates) addLine(ring);
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates) for (const ring of poly) addLine(ring);
  }
  return new Float32Array(v);
}
