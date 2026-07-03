# Seismic Earth — portfolio & CV framing

**Dr. Safeer Ali Mirani** · GPU / XR / real-time visualisation engineer (PhD)
[safeer.ali.mirani@gmail.com](mailto:safeer.ali.mirani@gmail.com) · [Portfolio](https://safeeralimirani.netlify.app) · [GitHub](https://github.com/SafeerAliMirani) · [LinkedIn](https://www.linkedin.com/in/safeeralimirani)

Reusable copy for a CV, portfolio site, or LinkedIn. All claims are accurate and verifiable.

## Résumé bullets

- Built **Seismic Earth**, a real-time 3D WebGPU globe that streams **~9,000 live USGS earthquakes** and renders them as depth-coloured, magnitude-scaled spikes in a single instanced GPU draw call — hand-written WGSL shaders, matrix math and arcball camera, **zero browser dependencies** (no three.js, no map SDK).
- Engineered a **resilient client-side data pipeline** against the USGS FDSN API (bounded-concurrency monthly windowing, timeouts, retry/back-off, dedupe) plus Natural Earth basemap layers, with time-lapse playback, place search with camera fly-to, and full touch/keyboard/accessibility support.

## Portfolio blurb (2–3 sentences)

Seismic Earth is a hand-built WebGPU globe that visualises real, live earthquake data from the USGS — five years of magnitude-5+ events replayed as a time-lapse of glowing, depth-coloured spikes. Everything is written from scratch against the raw WebGPU API (shaders, camera, matrices, instanced rendering); there is no map SDK and no build step, and every data point is fetched live from public government sources. It reads as a polished product — Google-Maps-style controls, city/country search, a data-provenance panel — while demonstrating low-level real-time graphics engineering.

## Interview talking points (the non-obvious engineering)

1. **One instanced draw for every quake.** 6 vertices × N events; the vertex shader pulls each event from a storage buffer and builds a screen-space "spike" billboard (constant pixel width, world-space height). Filtering by magnitude/time is done in-shader via uniforms, so scrubbing the time-lapse never re-uploads a buffer.
2. **Depth + occlusion done right.** A real depth buffer plus a horizon test means far-side spikes and city labels are correctly hidden behind the globe — a common thing naïve globe demos get wrong.
3. **Streaming a slow API without stalling.** The USGS FDSN query endpoint is slow over wide time spans, so ranges are split into monthly windows fetched with bounded concurrency, each with a body-covering timeout, one backed-off retry, and recursive bisection when a window hits the 20k page cap — with live progress and dropped-window accounting.
4. **Hand-rolled 3D math to the WebGPU spec.** Column-major `mat4x4<f32>` layout, a perspective matrix targeting WebGPU's `[0,1]` NDC depth (not WebGL's `[-1,1]`), an arcball camera with momentum inertia and an eased shortest-arc `flyTo`.
5. **Product polish under a graphics core.** DOM-overlay city labels projected with the same matrix as the GPU scene, DPI-correct picking with no GPU read-back, device-loss handling, background-tab pause, reduced-motion support, and keyboard/ARIA accessibility.

## What to emphasise, by role

**Graphics / WebGPU / rendering role** — lead with the raw-WebGPU pipeline: instanced spike rendering, the storage-buffer + in-shader filtering trick, depth/MSAA setup, the WGSL, and the hand-written matrix/camera math to the WebGPU depth convention. The differentiator is that it is written against the API directly, not three.js.

**General frontend / full-stack role** — lead with the product: real live data, a resilient fetch layer, Google-Maps-feel interaction, search, accessibility, and honest data provenance — a complete, dependency-free app that runs from a single static folder.

## One-line version

*Real-time WebGPU globe of live USGS earthquakes — hand-written shaders, camera and data pipeline, zero dependencies. — Dr. Safeer Ali Mirani*
