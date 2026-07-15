<h1 align="center">Seismic Earth</h1>
<p align="center"><b>A hand-built WebGPU globe streaming ~9,000 real earthquakes live from the USGS.</b></p>

<p align="center">
  <a href="https://seismic-earth.pages.dev"><img src="https://img.shields.io/badge/Live_Demo-seismic--earth.pages.dev-2ea44f?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Live Demo" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/WebGPU-raw_API-ff7a4d?style=for-the-badge" alt="WebGPU" />
  <img src="https://img.shields.io/badge/WGSL-hand--written_shaders-5b8def?style=for-the-badge" alt="WGSL" />
  <img src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/dependencies-zero-e0b872?style=for-the-badge" alt="No dependencies" />
  <img src="https://img.shields.io/badge/license-MIT-B08D57?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <b>Live demo:</b> <a href="https://seismic-earth.pages.dev">seismic-earth.pages.dev</a> (Chrome/Edge 113+ or desktop Safari 18+)
</p>

---

## 🌍 What it does

Seismic Earth renders an interactive 3D Earth in the browser and replays every magnitude-5.0+ earthquake from the last five years (about 9,000 events) as a time-lapse of glowing spikes. It's not a Google Maps or Mapbox embed: the globe, camera, matrix math and every shader are written from scratch against the raw WebGPU API, and the earthquakes are fetched live from the public USGS catalog the moment the page loads.

I built this to work directly against the modern graphics API instead of leaning on a library like three.js or Cesium. The concept (earthquakes on a globe) is a well-worn genre; the point here is doing the low-level graphics and data-engineering work by hand.

Highlights:

- **Hand-built WebGPU globe**: a Lambert-lit sphere with green land and blue ocean filled from a Natural Earth land mask sampled in the shader, a lat/long graticule, a real depth buffer, and 4x MSAA.
- **Real earthquakes, fetched live**: client-side from the USGS FDSN Event API. Default view is every M5.0+ quake worldwide over the last 5 years. Other ranges: past 30 days, M4.5+ over the last 2 years, and M4.5+ since 2000.
- **Quakes as spikes**: height scales with magnitude, colour encodes hypocentre depth (shallow red through yellow and green to deep blue, 0 to 700 km), and each quake pulses taller and brighter the moment it strikes during playback.
- **Real basemap**: Natural Earth coastlines and country borders as 3D polylines, plus up to 1,000 major cities labelled biggest-first, revealing more as you zoom in.
- **Time-lapse playback**: play/pause, a scrubber, three speeds, and a live date readout.
- **Google-Maps-style controls**: arcball drag with momentum, scroll/pinch zoom, full touch support.
- **Place search**: type a city or country and the camera flies there along the shortest arc.
- **Click a quake**: a popup with place, magnitude, depth, date, and a link to the official USGS event page.
- **Data-provenance panel**: an in-app explanation of how USGS locates earthquakes and where every byte of data comes from.

## ⚙️ How it works

### One instanced draw call for every quake

Each earthquake is 6 vertices in a single instanced draw. The vertex shader in `web/js/shaders.js` pulls two `vec4`s per event out of a storage buffer (position + magnitude, depth + time) and builds a screen-space spike: constant pixel width, world-space height. Magnitude and time filtering happen inside the shader via uniforms, so scrubbing the time-lapse slider never touches the buffer again, it's just a uniform update and a redraw.

```wgsl
if (mag < U.params.z || tN > U.params.y) {   // magnitude / time filter
  o.pos = vec4<f32>(3.0, 3.0, 0.5, 1.0);      // push the vertex off-screen
  ...
}
```

### The USGS data pipeline

`web/js/usgs.js` talks to the USGS FDSN Event API directly from the browser. The full catalog is about 2.9 million events since 1900, too much to stream into a tab, so historical ranges are split into monthly windows and fetched with bounded concurrency (6 at a time). Each request has a timeout that covers the full response body, one backed-off retry, and if a window still returns the API's 20,000-event page cap, it's recursively bisected in half until each half fits. A window that fails after its retry is counted in `dropped` instead of silently vanishing, and progress is reported live as events stream in. `web/js/geo.js` then converts the parsed GeoJSON into a packed `Float32Array` instance buffer on a unit sphere.

### Depth and occlusion

WebGPU's real depth buffer (`depth24plus`, `[0,1]` NDC range, handled in `web/js/mat.js`'s hand-rolled `perspective()`) means the far side of the globe is genuinely hidden, not just faked with alpha. City labels get the same treatment: `web/js/labels.js` projects each label through the camera's view-projection matrix every frame and runs a horizon test (comparing the label's direction against the camera's angular horizon) to hide labels on the far side without any GPU read-back.

### Camera

`web/js/camera.js` is an arcball orbit camera: drag rotates azimuth/elevation, releasing the drag keeps spinning with exponential-decay momentum, and `flyTo(lon, lat)` eases the shortest way around (using `atan2` to pick direction) so searching for a city never spins the wrong way round the globe.

## 🚀 Tech highlights

- **Zero dependencies, no build step.** No three.js, no globe.gl, no Cesium, no gl-matrix, no map SDK, no npm packages. Plain ES modules loaded directly by the browser.
- **Hand-rolled matrix math** (`web/js/mat.js`) in column-major layout to match WGSL's `mat4x4<f32>`, with a perspective matrix targeting WebGPU's `[0,1]` depth convention instead of WebGL's `[-1,1]`.
- **In-shader filtering.** Magnitude and time-lapse filtering both happen per-vertex in WGSL, driven by a small uniform block, so interacting with the sliders costs a uniform write, not a buffer re-upload.
- **Resilient streaming loader.** Monthly FDSN windows, concurrency limits, timeouts, retry with backoff, recursive bisection at the page cap, and dropped-window accounting, all in about 130 lines with no libraries.
- **DPI-correct GPU picking with no read-back.** Clicking a quake reprojects every instance through the same view-projection matrix on the CPU and picks the nearest on-screen point, scaled for device pixel ratio, instead of reading pixels back from the GPU.
- **Product polish under the graphics core:** device-loss handling, background-tab pause (the render loop skips work when the tab is hidden), reduced-motion support, and keyboard/ARIA accessibility (`Space` to play/pause, `/` to search, `Esc` to close, `?` for shortcuts).

## 🛠️ Run it locally

No build step, no package manager. Clone it and serve the `web/` folder:

```bash
cd web
python serve.py        # stdlib-only, no-cache static server
# open http://localhost:8080
```

`serve.py` is a tiny wrapper around `http.server` that disables caching, so edited modules always reload fresh (a plain `python -m http.server` will cache them and serve stale code). Any static file server works, this one just avoids that trap. Requirements: a WebGPU-capable browser (Chrome/Edge 113+ or Safari 18+) and an internet connection, since all data is fetched live.

Run the tests (plain Node, no dependencies):

```bash
node tests/test_usgs.mjs
```

They check USGS GeoJSON parsing (dedupe by event id, time sorting, depth normalisation) and globe projection against real sample events pulled from a live USGS response.

### Project layout

| File | Role |
|---|---|
| `web/index.html` | Page shell: HUD, control panel, loading/about/shortcuts overlays |
| `web/js/app.js` | Orchestrator: boot, data loading, render loop, input, picking, search |
| `web/js/usgs.js` | USGS client: monthly windows, bounded concurrency, timeout + retry, dedupe |
| `web/js/geo.js` | lon/lat/depth to unit-sphere positions, packs the GPU instance buffer |
| `web/js/globe.js` | Sphere mesh and graticule line geometry |
| `web/js/shaders.js` | All WGSL: globe surface, graticule, coast/border lines, instanced spikes |
| `web/js/render-core.js` | WebGPU device, pipelines, per-frame encoding, depth, MSAA, device-loss |
| `web/js/camera.js` | Arcball orbit camera: momentum drag, clamped zoom, eased `flyTo` |
| `web/js/mat.js` | Column-major 4x4 matrix / vec3 math for WebGPU's depth convention |
| `web/js/coastlines.js`, `borders.js`, `cities.js` | Natural Earth loaders |
| `web/js/labels.js` | DOM city-label overlay, projected every frame with horizon culling |
| `web/js/controls.js` | Binds the HTML panel to app state and callbacks |
| `web/serve.py` | No-cache static dev server |
| `tests/test_usgs.mjs` | Node tests for parsing and projection using real USGS features |

## 📊 Data & credits

Nothing in this app is synthetic, bundled, or precomputed. At page load the browser talks directly to two public-domain sources:

- **[USGS Earthquake Hazards Program](https://earthquake.usgs.gov/)**, every earthquake shown, via the [FDSN Event API](https://earthquake.usgs.gov/fdsnws/event/1/) for historical ranges and prebuilt GeoJSON summary feeds for the past-30-day views. Public domain.
- **[Natural Earth](https://www.naturalearthdata.com/)** (110m and 50m), coastlines, country borders, and populated places. Public domain, served as GeoJSON via jsDelivr, conversion by [martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson).

## 📄 License

[MIT](LICENSE) (c) 2026 Dr. Safeer Ali Mirani. Earthquake and basemap data are public domain (USGS, Natural Earth).

---

Built by **Dr. Safeer Ali Mirani**, GPU / XR / real-time visualisation engineer (PhD).
[safeer.ali.mirani@gmail.com](mailto:safeer.ali.mirani@gmail.com) · [Portfolio](https://safeeralimirani.pages.dev) · [GitHub](https://github.com/SafeerAliMirani) · [LinkedIn](https://www.linkedin.com/in/safeeralimirani)
