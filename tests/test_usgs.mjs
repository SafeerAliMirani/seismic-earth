// Node test (no deps): verifies USGS parsing + globe projection using REAL
// sample features from the USGS FDSN API.  Run: node tests/test_usgs.mjs
import { parseFeatures } from "../web/js/usgs.js";
import { buildInstances, lonLatToVec3 } from "../web/js/geo.js";

// Real events (subset of a live USGS FDSN geojson response, 2024-06-01).
const REAL = [
  { id: "us7000mpjb", geometry: { coordinates: [102.0216, -4.5789, 40.394] },
    properties: { mag: 4.6, time: 1717286231992, place: "90 km SSW of Bengkulu, Indonesia", url: "u1" } },
  { id: "us7000mqyx", geometry: { coordinates: [179.2066, -22.9896, 561.361] },
    properties: { mag: 4.5, time: 1717272212280, place: "south of the Fiji Islands", url: "u2" } },
  { id: "us7000mpge", geometry: { coordinates: [134.5006, -1.6626, 36.038] },
    properties: { mag: 5.0, time: 1717239703411, place: "Ransiki, Indonesia", url: "u3" } },
  { id: "us7000mpe2", geometry: { coordinates: [86.3128, 34.1381, 20.71] },
    properties: { mag: 5.9, time: 1717202798484, place: "western Xizang", url: "u4" } },
  { id: "us7000mpe2", geometry: { coordinates: [86.3128, 34.1381, 20.71] },   // duplicate id
    properties: { mag: 5.9, time: 1717202798484, place: "dup", url: "u4" } },
];

let pass = 0, fail = 0;
const ok = (c, m) => c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.error("  ✗ " + m));
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

console.log("parse:");
const d = parseFeatures(REAL);
ok(d.count === 4, `deduped to 4 events (dropped duplicate id) - got ${d.count}`);
ok(d.timeMs[0] < d.timeMs[d.count - 1], "sorted by time ascending");
ok(near(d.mag[0], 5.9) && d.place[0] === "western Xizang", "earliest event is the M5.9 Xizang quake");
const deep = [...d.depthKm].some((v) => near(v, 561.361, 0.01));
ok(deep, "deep (561 km) Fiji event preserved");

console.log("globe projection:");
const inst = buildInstances(d);
ok(inst.packed.length === d.count * 8, "instance buffer is 8 floats/event");
let onSphere = true;
for (let i = 0; i < d.count; i++) {
  const b = i * 8, x = inst.packed[b], y = inst.packed[b + 1], z = inst.packed[b + 2];
  const rad = Math.hypot(x, y, z);
  if (rad > 1.0001 || rad < 0.86) onSphere = false;
}
ok(onSphere, "all events lie within [0.86, 1.0] radius (surface, depth-offset)");
ok(near(inst.packed[5 + 0 * 8], 0, 1e-6), "earliest event timeNorm == 0");
ok(near(inst.packed[5 + (d.count - 1) * 8], 1, 1e-6), "latest event timeNorm == 1");
const fiji = [...Array(d.count).keys()].find((i) => d.place[i].includes("Fiji"));
ok(near(inst.packed[fiji * 8 + 4], 561.361 / 700, 1e-3), "depthNorm = depthKm/700");

console.log("coordinate sanity:");
const eq = lonLatToVec3(0, 0);
ok(near(eq[0], 1) && near(eq[1], 0) && near(eq[2], 0), "(lon0,lat0) -> (1,0,0)");
const np = lonLatToVec3(123, 90);
ok(near(np[1], 1), "north pole -> y=1");
const e90 = lonLatToVec3(90, 0);
ok(near(e90[2], 1) && near(e90[0], 0, 1e-6), "(lon90,lat0) -> +z axis");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
