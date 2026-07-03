// land.js - fetch real Natural Earth land polygons (110m, public domain) and
// rasterize them into an equirectangular land/ocean mask on an offscreen
// canvas (land = white, ocean = black). The globe fragment shader samples this
// mask to fill continents vs sea, so land and water are clearly distinct.
// Antimeridian handling: each ring's longitude is unwrapped (no +180/-180 jump)
// and drawn at x offsets -W/0/+W so shapes that cross the dateline wrap cleanly.

const URL = "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/physical/ne_110m_land.json";

export async function fetchLandMask(W = 2048, H = 1024, timeoutMs = 20000) {
  const c = new AbortController();
  const to = setTimeout(() => c.abort(), timeoutMs);
  let gj;
  try {
    const r = await fetch(URL, { signal: c.signal });
    if (!r.ok) throw new Error(`land: HTTP ${r.status}`);
    gj = await r.json();
  } finally {
    clearTimeout(to);
  }

  const canvas = (typeof OffscreenCanvas !== "undefined")
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";           // ocean
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";           // land

  const sx = W / 360, sy = H / 180;

  // One ring -> Path2D with unwrapped longitude, shifted by offX pixels.
  const ringPath = (ring, offX) => {
    const path = new Path2D();
    let prevLon = null, off = 0;
    for (let i = 0; i < ring.length; i++) {
      const lon = ring[i][0], lat = ring[i][1];
      if (prevLon !== null) {
        const d = lon - prevLon;
        if (d > 180) off -= 360; else if (d < -180) off += 360;
      }
      prevLon = lon;
      const x = (lon + off + 180) * sx + offX;
      const y = (90 - lat) * sy;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  };

  // rings[0] = exterior, rest = holes (lakes). even-odd fill cuts the holes out.
  const drawPoly = (rings) => {
    for (const offX of [-W, 0, W]) {
      const p = new Path2D();
      for (const ring of rings) p.addPath(ringPath(ring, offX));
      ctx.fill(p, "evenodd");
    }
  };

  for (const f of gj.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") drawPoly(g.coordinates);
    else if (g.type === "MultiPolygon") for (const poly of g.coordinates) drawPoly(poly);
  }

  // Hand back something the GPU can copy from directly.
  if (typeof canvas.transferToImageBitmap === "function") return canvas.transferToImageBitmap();
  if (typeof createImageBitmap === "function") return await createImageBitmap(canvas);
  return canvas;
}
