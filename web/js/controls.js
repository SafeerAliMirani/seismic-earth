// controls.js - wires the DOM panel to state + callbacks. No rendering here.

export class UI {
  constructor(state, handlers) {
    this.state = state;
    this.h = handlers;
    const $ = (id) => document.getElementById(id);
    this.el = {
      count: $("stat-count"), date: $("stat-date"), fps: $("stat-fps"),
      source: $("source"), load: $("load"),
      play: $("play"), speed: $("speed"), time: $("time"),
      minmag: $("minmag"), minmagVal: $("minmag-val"), size: $("size"),
      dateBig: $("date-big"),
      pick: $("pick"), pickPlace: $("pick-place"), pickMeta: $("pick-meta"), pickLink: $("pick-link"),
      loading: $("loading"), loadingText: $("loading-text"), nogpu: $("nogpu"),
    };
    this._wire();
  }

  _wire() {
    this.el.load.addEventListener("click", () => this.h.onLoad(this.el.source.value));
    this.el.play.addEventListener("click", () => this.h.onPlayToggle());
    this.el.speed.addEventListener("change", () => { this.state.speed = parseFloat(this.el.speed.value); });
    this.state.speed = parseFloat(this.el.speed.value);
    this.el.time.addEventListener("input", () => this.h.onSeek(parseFloat(this.el.time.value)));
    this.el.minmag.addEventListener("input", () => {
      this.state.minMag = parseFloat(this.el.minmag.value);
      this.el.minmagVal.textContent = this.state.minMag.toFixed(1);
    });
    this.el.size.addEventListener("input", () => { this.state.pointSize = parseFloat(this.el.size.value); });
    this.state.pointSize = parseFloat(this.el.size.value);
    this.state.minMag = parseFloat(this.el.minmag.value);
  }

  setCount(n) { this.el.count.textContent = n.toLocaleString("en-US"); }
  setFps(n) { this.el.fps.textContent = n; }
  setDate(str) { this.el.date.textContent = str; this.el.dateBig.textContent = str; }
  setTime(t) { this.el.time.value = String(t); }
  setPlaying(p) { this.el.play.textContent = p ? "⏸ pause" : "▶ play"; }

  loading(text) { this.el.loadingText.textContent = text; this.el.loading.classList.remove("hidden"); }
  hideLoading() { this.el.loading.classList.add("hidden"); }
  showNoGPU() { this.hideLoading(); this.el.nogpu.classList.remove("hidden"); }

  showPick(info) {
    this.el.pickPlace.textContent = info.place || "Earthquake";
    this.el.pickMeta.textContent = `M ${info.mag.toFixed(1)}  ·  ${info.depth.toFixed(0)} km deep  ·  ${info.date}`;
    if (info.url) { this.el.pickLink.href = info.url; this.el.pickLink.style.display = ""; }
    else this.el.pickLink.style.display = "none";
    this.el.pick.classList.remove("hidden");
  }
  hidePick() { this.el.pick.classList.add("hidden"); }
}
