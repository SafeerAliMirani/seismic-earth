// globe.js - geometry for the Earth sphere and its lat/long graticule.
// Uses the same lon/lat -> xyz convention as geo.js so the grid lines up
// with earthquake positions.

function ll(lonDeg, latDeg, r) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  return [r * cl * Math.cos(lon), r * Math.sin(lat), r * cl * Math.sin(lon)];
}

// Solid sphere (slightly inside r=1 so quake points sit just above it).
export function sphereMesh(r = 0.994, latSteps = 60, lonSteps = 120) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= latSteps; i++) {
    const lat = -90 + (180 * i) / latSteps;
    for (let j = 0; j <= lonSteps; j++) {
      const lon = -180 + (360 * j) / lonSteps;
      positions.push(...ll(lon, lat, r));
    }
  }
  const stride = lonSteps + 1;
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      const a = i * stride + j, b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// Graticule as a line list (consecutive vertex pairs = one segment).
export function graticule(r = 1.001, step = 15, seg = 90) {
  const v = [];
  for (let lat = -75; lat <= 75; lat += step) {          // parallels
    for (let s = 0; s < seg; s++) {
      v.push(...ll(-180 + (360 * s) / seg, lat, r));
      v.push(...ll(-180 + (360 * (s + 1)) / seg, lat, r));
    }
  }
  for (let lon = -180; lon < 180; lon += step) {          // meridians
    for (let s = 0; s < seg; s++) {
      v.push(...ll(lon, -90 + (180 * s) / seg, r));
      v.push(...ll(lon, -90 + (180 * (s + 1)) / seg, r));
    }
  }
  return new Float32Array(v);
}
