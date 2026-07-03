// camera.js - orbit camera: arcball grab-drag with momentum, smooth zoom, and
// an animated flyTo() that eases the globe so a given lon/lat faces the camera.
import { perspective, lookAt, multiply } from "./mat.js";

const INERTIA_DECAY = 3.5;
const INERTIA_EPS = 1e-4;

export class OrbitCamera {
  constructor() {
    this.target = [0, 0, 0];
    this.distance = 2.6;
    this.azimuth = 0.6;
    this.elevation = 0.35;
    this.fov = (45 * Math.PI) / 180;
    this.near = 0.01;
    this.far = 50;
    this.minDist = 1.15;
    this.maxDist = 8;
    this._elevLimit = Math.PI / 2 - 0.02;
    this._dragging = false;
    this._velAz = 0;
    this._velEl = 0;
    this._flying = false;
    this._tAz = 0; this._tEl = 0; this._tDist = 2.6;
  }

  eye() {
    const ce = Math.cos(this.elevation);
    return [
      this.distance * ce * Math.cos(this.azimuth),
      this.distance * Math.sin(this.elevation),
      this.distance * ce * Math.sin(this.azimuth),
    ];
  }

  orbit(dAz, dEl) {
    this.azimuth += dAz;
    this.elevation = Math.max(-this._elevLimit, Math.min(this._elevLimit, this.elevation + dEl));
  }

  rotateByPixels(dx, dy, viewportHeight) {
    this._flying = false;                           // manual drag cancels a fly
    const h = viewportHeight || 1;
    const distScale = this.distance / 2.6;
    const rate = (this.fov / h) * distScale;
    const dAz = dx * rate;
    const dEl = dy * rate;
    this.azimuth += dAz;
    this.elevation = Math.max(-this._elevLimit, Math.min(this._elevLimit, this.elevation + dEl));
    const dtGuess = 1 / 60;
    this._velAz = dAz / dtGuess;
    this._velEl = dEl / dtGuess;
  }

  beginDrag() { this._dragging = true; this._flying = false; this._velAz = 0; this._velEl = 0; }
  endDrag() { this._dragging = false; }

  // Ease the globe so (lonDeg, latDeg) rotates to face the camera; optional zoom.
  flyTo(lonDeg, latDeg, dist) {
    this._flying = true; this._dragging = false; this._velAz = 0; this._velEl = 0;
    this._tAz = (lonDeg * Math.PI) / 180;
    this._tEl = Math.max(-this._elevLimit, Math.min(this._elevLimit, (latDeg * Math.PI) / 180));
    this._tDist = dist != null ? Math.max(this.minDist, Math.min(this.maxDist, dist)) : Math.max(this.minDist, 1.8);
  }

  update(dt) {
    if (this._flying) {
      const k = Math.min(1, 1 - Math.exp(-dt * 6));
      let da = this._tAz - this.azimuth;
      da = Math.atan2(Math.sin(da), Math.cos(da));   // shortest way around
      this.azimuth += da * k;
      this.elevation += (this._tEl - this.elevation) * k;
      this.distance += (this._tDist - this.distance) * k;
      if (Math.abs(da) < 0.002 && Math.abs(this._tEl - this.elevation) < 0.002
          && Math.abs(this._tDist - this.distance) < 0.002) { this._flying = false; }
      return;
    }
    if (this._dragging) return;
    if (this._velAz === 0 && this._velEl === 0) return;
    this.azimuth += this._velAz * dt;
    this.elevation = Math.max(-this._elevLimit, Math.min(this._elevLimit, this.elevation + this._velEl * dt));
    const damp = Math.exp(-dt * INERTIA_DECAY);
    this._velAz *= damp;
    this._velEl *= damp;
    if (Math.abs(this._velAz) < INERTIA_EPS) this._velAz = 0;
    if (Math.abs(this._velEl) < INERTIA_EPS) this._velEl = 0;
  }

  zoom(factor) {
    this._flying = false;
    this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * factor));
  }
  zoomBy(factor) { this.zoom(factor); }

  viewProj(aspect) {
    const proj = perspective(this.fov, aspect, this.near, this.far);
    const view = lookAt(this.eye(), this.target, [0, 1, 0]);
    return multiply(proj, view);
  }
}
