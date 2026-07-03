// labels.js - HTML city-name labels overlaid on the WebGPU globe.
// Each frame, city world positions are projected through the camera's
// column-major viewProj matrix (index = col*4 + row, see mat.js) and the
// matching DOM elements are moved with translate3d. Labels that fall
// off-screen, behind the camera, or past the globe's horizon are hidden.
//
// Level-of-detail: cities arrive sorted by population (biggest first), so the
// array index is an importance rank. When zoomed out only the top-ranked few
// are labelled; as the camera moves closer, more and more are revealed. This
// keeps a dense (~1000-city) dataset readable instead of an unlabelled soup.

import { lonLatToVec3 } from './geo.js';

function countryColor(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 72%, 62%)`;
}

// Camera distance -> how many of the rank-ordered cities to label.
// distance runs ~1.15 (zoomed in) .. 8 (zoomed out); see camera.js.
function labelCap(dist, n) {
  if (dist >= 5)   return Math.min(90, n);
  if (dist <= 1.3) return n;
  if (dist >= 2.6) { const t = (5 - dist) / (5 - 2.6); return Math.min(n, Math.round(90 + (300 - 90) * t)); }
  const t = (2.6 - dist) / (2.6 - 1.3); return Math.min(n, Math.round(300 + (n - 300) * t));
}

const RADIUS = 1.004; // label anchor sits just above the unit-sphere surface
const MARGIN = 32;    // px of slack before an off-screen label is hidden

export class LabelLayer {
  // container: absolutely positioned element over the canvas (pointer-events: none).
  constructor(container) {
    this.container = container;
    this._els = [];    // one <div class="city-label"> per city, reused across setCities
    this._pos = null;  // Float32Array n*3 - world xyz at RADIUS
    this._dir = null;  // Float32Array n*3 - unit direction, for the horizon test
    this._vis = null;  // Int8Array n - -1 unknown / 0 hidden / 1 shown
    this._count = 0;
  }

  // cities: [{ name, lat, lon }] in degrees, biggest-first. Precomputes positions.
  setCities(cities) {
    const n = cities.length;
    const els = this._els;
    while (els.length < n) { // grow: <div class="city-label"><span class="dot"></span>Name</div>
      const el = document.createElement('div');
      el.className = 'city-label';
      const dot = document.createElement('span');
      dot.className = 'dot';
      el.appendChild(dot);
      el.appendChild(document.createTextNode(''));
      el.style.display = 'none';
      this.container.appendChild(el);
      els.push(el);
    }
    while (els.length > n) els.pop().remove(); // shrink
    this._pos = new Float32Array(n * 3);
    this._dir = new Float32Array(n * 3);
    this._vis = new Int8Array(n).fill(-1); // force display sync on next update
    this._count = n;
    for (let i = 0; i < n; i++) {
      els[i].lastChild.nodeValue = cities[i].name;
      els[i].firstChild.style.background = countryColor(cities[i].country || "");
      els[i].style.display = 'none';
      const d = lonLatToVec3(cities[i].lon, cities[i].lat, 1); // unit-sphere direction
      const b = i * 3;
      this._dir[b] = d[0]; this._dir[b + 1] = d[1]; this._dir[b + 2] = d[2];
      this._pos[b] = d[0] * RADIUS; this._pos[b + 1] = d[1] * RADIUS; this._pos[b + 2] = d[2] * RADIUS;
    }
  }

  // viewProj: column-major Float32Array(16). width/height: canvas CSS pixels.
  // eye: [x,y,z] camera world position. Call once per rendered frame.
  update(viewProj, width, height, eye) {
    const n = this._count;
    if (!n) return;
    const m = viewProj, pos = this._pos, dir = this._dir, vis = this._vis, els = this._els;
    // matrix rows 0, 1, 3 (clip x, y, w) - clip z is not needed for placement
    const m0 = m[0], m4 = m[4], m8 = m[8], m12 = m[12];
    const m1 = m[1], m5 = m[5], m9 = m[9], m13 = m[13];
    const m3 = m[3], m7 = m[7], m11 = m[11], m15 = m[15];
    const eyeLen = Math.hypot(eye[0], eye[1], eye[2]) || 1;
    const inv = 1 / eyeLen; // cos(horizon angle) seen from the camera, unit sphere
    const ex = eye[0] * inv, ey = eye[1] * inv, ez = eye[2] * inv;
    const cap = labelCap(eyeLen, n); // level-of-detail: rank threshold for this zoom
    for (let i = 0; i < n; i++) {
      const el = els[i];
      if (i >= cap) {                         // below the zoom's rank cutoff -> hide
        if (vis[i] !== 0) { el.style.display = 'none'; vis[i] = 0; }
        continue;
      }
      const b = i * 3;
      const x = pos[b], y = pos[b + 1], z = pos[b + 2];
      let show = false, sx = 0, sy = 0;
      const w = m3 * x + m7 * y + m11 * z + m15;       // clip.w
      if (w > 0) {                                     // in front of the camera
        sx = ((m0 * x + m4 * y + m8 * z + m12) / w * 0.5 + 0.5) * width;
        sy = (1 - ((m1 * x + m5 * y + m9 * z + m13) / w * 0.5 + 0.5)) * height;
        show = sx > -MARGIN && sx < width + MARGIN && sy > -MARGIN && sy < height + MARGIN
          // horizon cull: past the tangent circle -> far side of the globe
          && (dir[b] * ex + dir[b + 1] * ey + dir[b + 2] * ez) >= inv;
      }
      if (show) {
        if (vis[i] !== 1) { el.style.display = 'block'; vis[i] = 1; } // toggle only on change
        el.style.transform = 'translate3d(' + sx + 'px,' + sy + 'px,0)';
      } else if (vis[i] !== 0) {
        el.style.display = 'none'; vis[i] = 0;
      }
    }
  }
}
