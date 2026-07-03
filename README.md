# Seismic Earth

**Five years of real earthquakes on a hand-built WebGPU globe — streamed live from the USGS, with zero dependencies.**

_By **Dr. Safeer Ali Mirani** — GPU / XR / real-time visualisation engineer (PhD)._

Seismic Earth renders a fully interactive 3D Earth in the browser and replays every magnitude-5.0+ earthquake of the last five years (~9,000 events) as a time-lapse of glowing spikes. It is not a Google Maps or Mapbox embed: the globe, camera, matrix math and WGSL shaders are written from scratch against the raw WebGPU API, and every earthquake is fetched live from the public USGS catalog the moment the page loads. No map SDK, no npm packages, no build step, no synthetic data.

## Features

- **Hand-built WebGPU globe** — Lambert-lit sphere with a lat/long graticule, a real depth buffer (the far side is occluded) and 4× MSAA.
- **Real earthquakes, fetched live** — client-side from the USGS FDSN Event API. Default view: every M5.0+ quake worldwide over the last 5 years (~9,000 events). Other sources: past 30 days (M4.5+ or all magnitudes), M4.5+ over the last 2 years, and M4.5+ since 2000.
- **Quakes as spikes** — each event rises from the surface: height scales with magnitude, colour encodes hypocentre depth (shallow red through yellow and green to deep blue, 0–700 km), and each quake pulses taller and brighter at the moment it strikes during playback before fading into a dim history layer.
- **Real basemap** — Natural Earth coastlines and country borders drawn as 3D polylines, plus 243 major cities labelled with dots coloured by country.
- **Time-lapse** — play / pause, a scrubber and three speeds, with a live date readout.
- **Google-Maps-style controls** — arcball grab-drag with momentum, scroll-wheel and pinch zoom, full touch support.
- **Place search** — type a city or country and the camera flies there along the shortest arc.
- **Keyboard** — `Space` play/pause, `/` search, `Esc` close, `?` shortcuts.
- **Click a quake** — popup with place, magnitude, depth, date and a link to the official USGS event page.
- **"ⓘ data" panel** — how the USGS locates earthquakes and where every byte of data comes from.

## Real, public data

Nothing here is synthetic, bundled or precomputed. At page load the browser talks directly to two public-domain sources:

| Source | What | How |
|---|---|---|
| **USGS Earthquake Hazards Program** | every earthquake shown | FDSN Event API (`earthquake.usgs.gov/fdsnws`) for historical ranges; prebuilt GeoJSON summary feeds for the past-30-day views |
| **Natural Earth** | coastlines, country borders, populated places (110m) | public-domain GeoJSON served via the jsDelivr CDN |

A note on scale, honestly: the full USGS catalog holds ~2.9 million events since 1900 — too much to stream into a browser tab — so the app streams a multi-year window instead (up to "M4.5+ since 2000"). Because the FDSN query endpoint is slow over wide time spans, historical ranges are split into monthly windows fetched with bounded concurrency, each with a timeout and one retry, so a single slow month can never stall the load. Progress is reported live as events arrive.

## Run it

```bash
cd web
python serve.py        # stdlib-only, no-cache static server
# open http://localhost:8080
```

Requirements: a WebGPU browser (Chrome/Edge 113+ or Safari 18+), an internet connection (all data is live), and Python 3 for the dev server. Any static server works; `serve.py` just disables caching so edited modules reload fresh.

Run the tests (plain Node, no dependencies):

```bash
node tests/test_usgs.mjs
```

They verify USGS GeoJSON parsing (dedupe by event id, time sorting, depth normalisation) and globe projection against real sample events.

## Architecture

Plain ES modules, no bundler.

| Module | Role |
|---|---|
| `web/index.html` | page shell: HUD, control panel, loading / about / shortcuts / no-WebGPU overlays |
| `web/js/app.js` | orchestrator: boot, data loading, render loop, input, picking, search, keyboard |
| `web/js/usgs.js` | USGS client: monthly windows, bounded concurrency, timeout + retry, dedupe, sort |
| `web/js/geo.js` | lon/lat/depth → unit-sphere positions; packs events into the GPU instance buffer |
| `web/js/globe.js` | sphere mesh and graticule line geometry |
| `web/js/shaders.js` | all WGSL: globe surface, graticule, coast/border lines, instanced quake spikes |
| `web/js/render-core.js` | WebGPU device, pipelines and per-frame encoding (depth, 4× MSAA, device-loss) |
| `web/js/camera.js` | arcball orbit camera: momentum drag, clamped zoom, eased `flyTo` |
| `web/js/mat.js` | column-major 4×4 matrix / vec3 math, WebGPU [0,1] depth convention |
| `web/js/coastlines.js` · `borders.js` · `cities.js` | Natural Earth loaders → sphere geometry / places |
| `web/js/labels.js` | DOM city-label overlay, projected every frame with horizon culling |
| `web/js/controls.js` | binds the HTML panel to app state and callbacks |
| `web/serve.py` | no-cache static dev server (port 8080) |
| `tests/test_usgs.mjs` | Node tests for parsing + projection using real USGS features |

```
USGS FDSN API / feeds        Natural Earth GeoJSON (jsDelivr CDN)
        │                       │                      │
     usgs.js              coastlines.js /           cities.js
        │                    borders.js                │
     geo.js                     │                   labels.js ─► DOM overlay
        └──────────┬────────────┘                      ▲  (same viewProj,
                   ▼                                    │   every frame)
            render-core.js ◄── shaders.js (WGSL)        │
   globe · graticule · lines · instanced spikes         │
                   ▲                                     │
  controls.js ─► app.js ◄─ camera.js ───────────────────┘
```

## Tech highlights

- **One instanced draw for all quakes** — 6 verts/event; the vertex shader reads a storage buffer and builds a screen-space spike (constant pixel width, world-space height). Magnitude/time filtering is done in-shader via uniforms — scrubbing never re-uploads a buffer.
- **Resilient streaming loader** — monthly FDSN windows at concurrency 6, a body-covering timeout, one backed-off retry, recursive bisection on the 20k page cap, dropped-window accounting.
- **Hand-rolled math** — column-major `mat4` matching WGSL, perspective targeting WebGPU's [0,1] depth — no gl-matrix, no three.js.
- **Cheap, correct labels** — DOM nodes moved with `translate3d`, projected with the scene's matrix and culled at the globe's horizon.
- **Momentum + fly-to camera** — drag rate scales with zoom, releases coast with exponential-decay inertia, search eases along the shortest azimuth arc.

## Prior art & what's different

Earthquakes-on-a-globe is a well-established genre, and this project doesn't pretend otherwise. Official tools — the [USGS Latest Earthquakes](https://earthquake.usgs.gov/earthquakes/map/) map and the [IRIS Interactive Earthquake Browser](https://ds.iris.edu/ieb/index.html) — and many developer projects already visualise USGS data in 3D. Almost all of them are built on a mapping or 3D library such as [globe.gl](https://github.com/vasturiano/globe.gl), Three.js, CesiumJS or deck.gl; the closest comparison, an [Earthquake Pulse Map](https://www.webgpu.com/showcase/earthquake-pulse-map-seismic-activity-webgl-globe/), is a Three.js globe with custom shaders and live USGS feeds.

The difference here is *how* it's built, not *what* it shows:

- **No library, no build step.** No three.js, globe.gl, Cesium, deck.gl, gl-matrix or map SDK. The sphere, graticule, coastlines, instanced spikes, camera, matrix math and every shader are written directly against the raw WebGPU API in hand-written WGSL, and the app runs from a single static folder.
- **WebGPU, not WebGL.** WebGPU only shipped to browsers in 2023, and the handful of other WebGPU globes are either not earthquake-focused or still lean on Three.js to render. Targeting the modern API by hand — storage-buffer vertex-pulling, in-shader magnitude/time filtering, `[0,1]` NDC depth — is the uncommon part.

This is a deliberate engineering choice: building the whole pipeline by hand surfaces the low-level graphics work a library would otherwise hide. The concept is familiar; the implementation is from scratch.

## Data sources & credits

- **Earthquakes** — [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) via the [FDSN Event API](https://earthquake.usgs.gov/fdsnws/event/1/). Public domain.
- **Coastlines, borders, cities** — [Natural Earth](https://www.naturalearthdata.com/) (110m), public domain; conversion by [martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson) via jsDelivr.

## Author

**Dr. Safeer Ali Mirani** — GPU / XR / real-time visualisation engineer (PhD).
[safeer.ali.mirani@gmail.com](mailto:safeer.ali.mirani@gmail.com) · [Portfolio](https://safeeralimirani.netlify.app) · [GitHub](https://github.com/SafeerAliMirani) · [LinkedIn](https://www.linkedin.com/in/safeeralimirani)

## License

[MIT](LICENSE) © 2026 Dr. Safeer Ali Mirani. Earthquake and basemap data are public domain (USGS, Natural Earth).
