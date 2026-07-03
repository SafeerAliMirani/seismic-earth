// geo.js - convert parsed USGS data to a GPU instance buffer on a unit globe.
// Longitude/latitude -> 3D sphere; depth pushes the point slightly inward.

const R = 1.0;

// packed layout: 2 vec4 per event ->
//   [x, y, z, mag] , [depthNorm, timeNorm, 0, 0]
export function buildInstances(data, opts = {}) {
  const depthScale = opts.depthScale ?? 0.12; // visual inward exaggeration
  const N = data.count;
  const packed = new Float32Array(N * 8);
  const tMin = N ? data.timeMs[0] : 0;
  const tMax = N ? data.timeMs[N - 1] : 1;
  const span = Math.max(1, tMax - tMin);
  for (let i = 0; i < N; i++) {
    const lat = (data.lat[i] * Math.PI) / 180;
    const lon = (data.lon[i] * Math.PI) / 180;
    const depthN = Math.min(1, Math.max(0, data.depthKm[i] / 700));
    const r = R - depthN * depthScale;
    const cl = Math.cos(lat);
    const b = i * 8;
    packed[b + 0] = r * cl * Math.cos(lon);
    packed[b + 1] = r * Math.sin(lat);
    packed[b + 2] = r * cl * Math.sin(lon);
    packed[b + 3] = data.mag[i];
    packed[b + 4] = depthN;
    packed[b + 5] = (data.timeMs[i] - tMin) / span;
    packed[b + 6] = 0;
    packed[b + 7] = 0;
  }
  return { packed, tMin, tMax, count: N };
}

export function lonLatToVec3(lonDeg, latDeg, r = 1.0) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  return [r * cl * Math.cos(lon), r * Math.sin(lat), r * cl * Math.sin(lon)];
}
