// app.js - wires USGS data + globe renderer + arcball camera + city labels +
// place search + keyboard shortcuts + UI.
import { Renderer } from "./render-core.js";
import { OrbitCamera } from "./camera.js";
import { UI } from "./controls.js";
import { fetchFeed, fetchRange } from "./usgs.js";
import { buildInstances } from "./geo.js";
import { sphereMesh, graticule } from "./globe.js";
import { fetchBorders } from "./borders.js";
import { fetchCoastlines } from "./coastlines.js";
import { fetchCities } from "./cities.js";
import { LabelLayer } from "./labels.js";
import { fetchLandMask } from "./land.js";

const canvas = document.getElementById("gpu");
const state = { pointSize: 4, currentT: 1, minMag: 4.5, playing: false, speed: 0.09, pulseWin: 0.02, historyFloor: 0.22, idleRotate: false };
let renderer, camera, ui, labelLayer = null, data = null, inst = null, tMin = 0, tMax = 1;
const placeMap = new Map();
let loadSeq = 0;                        // guards against stale/overlapping loads
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let idleTimer = null;

const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 864e5).toISOString().slice(0, 10);
const dateStr = (t) => new Date(tMin + t * (tMax - tMin)).toISOString().slice(0, 10);

function armIdle() {
  state.idleRotate = false;
  clearTimeout(idleTimer);
  if (reducedMotion) return;
  idleTimer = setTimeout(() => { state.idleRotate = true; }, 9000);
}

function fetchSource(key, onProgress) {
  if (key === "month") return fetchFeed("4.5_month");
  if (key === "feedall") return fetchFeed("all_month");
  if (key === "2y") return fetchRange({ start: yearsAgo(2), end: today(), minMag: 4.5, onProgress });
  if (key === "since2000") return fetchRange({ start: "2000-01-01", end: today(), minMag: 4.5, onProgress });
  return fetchRange({ start: yearsAgo(5), end: today(), minMag: 5.0, onProgress }); // "5y" default
}

async function boot() {
  if (!(await Renderer.supported())) { showNoGPU(); return; }
  renderer = new Renderer(canvas);
  try { await renderer.init(); } catch (e) { console.error(e); showNoGPU(e.message); return; }
  renderer.setGlobe(sphereMesh(), graticule());
  camera = new OrbitCamera();
  ui = new UI(state, { onLoad: load, onPlayToggle: togglePlay, onSeek: seek });

  let coastVerts = null, borderVerts = null;
  const applyLines = () => {
    const parts = [coastVerts, borderVerts].filter((a) => a && a.length);
    if (!parts.length) return;
    let total = 0; for (const a of parts) total += a.length;
    const merged = new Float32Array(total);
    let o = 0; for (const a of parts) { merged.set(a, o); o += a.length; }
    renderer.setCoastlines(merged);
  };
  fetchCoastlines().then((v) => { coastVerts = v; applyLines(); }).catch((e) => console.warn("coastlines:", e.name));
  fetchBorders().then((v) => { borderVerts = v; applyLines(); }).catch((e) => console.warn("borders:", e.name));

  fetchLandMask().then((m) => renderer.setLandMask(m)).catch((e) => console.warn("land:", e.name));

  labelLayer = new LabelLayer(document.getElementById("labels"));
  fetchCities(1000).then((c) => { labelLayer.setCities(c); buildSearch(c); }).catch((e) => console.warn("cities:", e.name));

  setupInput();
  setupSearchAndAbout();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) armIdle(); });
  loop();
  const src = document.getElementById("source");
  if (src) src.value = "5y";
  load(src ? src.value : "5y");
  armIdle();
  maybeOnboard();
}

async function load(key) {
  const seq = ++loadSeq;
  state.playing = false; ui.setPlaying(false);
  ui.loading("Contacting USGS…");
  let d;
  try {
    d = await fetchSource(key, (n, pct) => { if (seq === loadSeq) ui.loading(`Loading real events from USGS… ${n.toLocaleString("en-US")}${pct != null ? ` (${pct}%)` : ""}`); });
  } catch (e) {
    if (seq === loadSeq) { console.error("USGS load failed:", e); ui.loading("USGS request failed, check your connection, then press Load."); }
    return;
  }
  if (seq !== loadSeq) return;          // superseded by a newer load
  if (!d.count) { ui.loading("No events for that range. Pick another source."); return; }
  if (d.dropped) console.warn(`${d.dropped} month-windows were unavailable (network/rate limit).`);
  data = d;
  inst = buildInstances(d);
  tMin = inst.tMin; tMax = inst.tMax;
  renderer.setPoints(inst.packed, inst.count);
  ui.setCount(d.count);
  state.currentT = 1; ui.setTime(1); ui.setDate(dateStr(1));
  ui.hideLoading();
}

function buildSearch(cities) {
  const dl = document.getElementById("places");
  placeMap.clear();
  if (dl) dl.replaceChildren();
  const add = (name, lat, lon) => {
    if (!name) return;
    const k = name.toLowerCase();
    if (placeMap.has(k)) return;
    placeMap.set(k, { lat, lon });
    if (dl) { const o = document.createElement("option"); o.value = name; dl.appendChild(o); }
  };
  for (const c of cities) add(c.country, c.lat, c.lon);
  for (const c of cities) add(c.name, c.lat, c.lon);
}

function setupSearchAndAbout() {
  const searchEl = document.getElementById("search");
  const about = document.getElementById("about");
  const shortcuts = document.getElementById("shortcuts");
  if (searchEl) {
    const go = () => {
      const p = placeMap.get(searchEl.value.trim().toLowerCase());
      if (p) { camera.flyTo(p.lon, p.lat, 1.7); armIdle(); }
    };
    searchEl.addEventListener("change", go);
  }
  const aboutBtn = document.getElementById("about-btn");
  const aboutClose = document.getElementById("about-close");
  const openAbout = () => { about.classList.remove("hidden"); aboutClose && aboutClose.focus(); };
  const closeAbout = () => { about.classList.add("hidden"); aboutBtn && aboutBtn.focus(); };
  if (aboutBtn && about) aboutBtn.addEventListener("click", openAbout);
  if (aboutClose && about) aboutClose.addEventListener("click", closeAbout);

  document.addEventListener("keydown", (e) => {
    armIdle();
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if (e.key === "Escape") {
      if (about && !about.classList.contains("hidden")) { closeAbout(); return; }
      if (shortcuts && !shortcuts.classList.contains("hidden")) { shortcuts.classList.add("hidden"); return; }
      if (document.activeElement === searchEl) searchEl.blur();
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); searchEl && searchEl.focus(); searchEl && searchEl.select(); }
    else if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.key === "?") { shortcuts && shortcuts.classList.toggle("hidden"); }
  });
}

function loop() {
  let frames = 0, acc = 0, last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (renderer.lost) { showNoGPU("GPU device lost, please reload."); return; }
    if (document.hidden) { last = now; return; }           // skip work in background tabs
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt; frames++;
    if (acc >= 0.5) { ui.setFps(Math.round(frames / acc)); frames = 0; acc = 0; }
    if (state.playing && inst) {
      state.currentT += dt * state.speed;
      if (state.currentT >= 1) { state.currentT = 1; state.playing = false; ui.setPlaying(false); }
      ui.setTime(state.currentT); ui.setDate(dateStr(state.currentT));
    } else if (state.idleRotate) {
      camera.azimuth += dt * 0.12;                          // gentle idle spin
    }
    camera.update(dt);
    renderer.resize();
    const cw = canvas.clientWidth, ch = Math.max(1, canvas.clientHeight);
    const vp = camera.viewProj(cw / ch);
    renderer.render(vp, state);
    if (labelLayer) labelLayer.update(vp, cw, ch, camera.eye());
  };
  requestAnimationFrame(tick);
}

function togglePlay() {
  if (!inst) return;
  if (!state.playing && state.currentT >= 1) state.currentT = 0;
  state.playing = !state.playing;
  ui.setPlaying(state.playing);
}
function seek(t) {
  state.playing = false; ui.setPlaying(false);
  state.currentT = t; ui.setDate(dateStr(t));
}

function setupInput() {
  const pointers = new Map();
  let moved = 0, pinch = 0;
  const twoDist = () => { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  canvas.addEventListener("pointerdown", (e) => {
    armIdle();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { camera.beginDrag(); moved = 0; }
    else if (pointers.size === 2) { pinch = twoDist(); moved = 999; }   // pinch is not a click
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId); if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) { const d = twoDist(); if (pinch && d) camera.zoomBy(pinch / d); pinch = d; }
    else { moved += Math.abs(dx) + Math.abs(dy); camera.rotateByPixels(dx, dy, canvas.clientHeight); }
  });
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0) { camera.endDrag(); if (moved < 5) pick(e); }
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); armIdle();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    camera.zoomBy(Math.exp(Math.max(-60, Math.min(60, dy)) * 0.002));
  }, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

function pick(e) {
  if (!inst) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const px = (e.clientX - rect.left) * dpr, py = (e.clientY - rect.top) * dpr;
  const w = canvas.width, h = canvas.height, m = camera.viewProj(w / h);
  const eye = camera.eye(), eyeLen = Math.hypot(eye[0], eye[1], eye[2]) || 1;
  const P = inst.packed;
  const tol = 16 * dpr;
  let best = -1, bestD = tol * tol;
  for (let i = 0; i < inst.count; i++) {
    const b = i * 8, mag = P[b + 3], tN = P[b + 5];
    if (mag < state.minMag || tN > state.currentT) continue;
    const x = P[b], y = P[b + 1], z = P[b + 2];
    const pl = Math.hypot(x, y, z) || 1;
    if ((x * eye[0] + y * eye[1] + z * eye[2]) / (pl * eyeLen) < 1 / eyeLen) continue;
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0) continue;
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
    const sx = (cx * 0.5 + 0.5) * w, sy = (1 - (cy * 0.5 + 0.5)) * h;
    const dd = (sx - px) * (sx - px) + (sy - py) * (sy - py);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  if (best < 0) { ui.hidePick(); return; }
  ui.showPick({
    place: data.place[best], mag: data.mag[best], depth: data.depthKm[best],
    date: new Date(data.timeMs[best]).toISOString().slice(0, 10), url: data.url[best],
  });
}

function maybeOnboard() {
  try { if (localStorage.getItem("seismic-onboarded")) return; localStorage.setItem("seismic-onboarded", "1"); } catch (_) {}
  const el = document.getElementById("onboard");
  if (!el) return;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 7200);
}

function showNoGPU(msg) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("nogpu").classList.remove("hidden");
  const panel = document.getElementById("panel");
  if (panel) panel.setAttribute("inert", "");
  if (msg) console.warn("WebGPU:", msg);
}

boot();
