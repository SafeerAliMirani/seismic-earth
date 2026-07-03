# Deploying Seismic Earth

Seismic Earth is a static site with **no build step**. Every data point is fetched
live in the browser from public CDNs (USGS, jsDelivr), so it runs from any static
host over HTTPS. `web/serve.py` is only for local development — you don't deploy it.

The site's files live in the **`web/`** folder (that's the publish directory).
The included `netlify.toml` already tells Netlify this, so you don't configure it by hand.

Visitors need a WebGPU browser (Chrome/Edge 113+, desktop Safari 18+). Others see a
graceful "WebGPU required" card.

---

## Recommended: private GitHub repo → Netlify (auto-deploys on every push)

### 1. Create the repo on GitHub
- github.com → **New repository** → name it `seismic-earth` → **Private** → **Create repository**.
- Leave it empty (don't add a README/.gitignore — this project already has them).

### 2. Push this folder to it
Open a terminal **in this `SeismicEarth` folder** and run:

```bash
git init -b main
git add .
git commit -m "Seismic Earth — WebGPU globe of live USGS earthquakes"
git remote add origin https://github.com/SafeerAliMirani/seismic-earth.git
git push -u origin main
```

(Prefer clicking? **GitHub Desktop → File → Add local repository →** pick this folder
**→ Publish repository →** keep **Keep this code private** ticked.)

### 3. Connect it on Netlify
- app.netlify.com → **Add new site → Import an existing project → Deploy with GitHub**.
- Authorize Netlify for GitHub if asked; grant access to the **`seismic-earth`** repo
  (private repos work — Netlify just needs read access to that one).
- Pick the repo. Settings should auto-fill from `netlify.toml`:
  - **Build command:** *(blank)*
  - **Publish directory:** `web`
- **Deploy site.** You get a live `…netlify.app` URL; every `git push` now redeploys.

### 4. Tidy up
- **Site configuration → Change site name** → e.g. `seismic-earth` →
  `https://seismic-earth.netlify.app`.
- Optional: **Domain management → Add a domain** for a custom domain (HTTPS is automatic).

> Private repo = your source stays hidden. Hosting still works fine. If you'd rather
> recruiters can read the code from your CV, make the repo **Public** later
> (Settings → General → Danger Zone → Change visibility).

---

## Quick alternative: drag & drop (no Git, ~1 minute)

1. app.netlify.com → **Add new site → Deploy manually**.
2. Drag the **`web`** folder (the one containing `index.html`) onto the upload area —
   drag `web` itself, not `SeismicEarth`, so `index.html` is at the root.
3. You get a live URL. To update later, drag the `web` folder again.

---

## After it's live
Add the URL to `PORTFOLIO.md`, your résumé, and your portfolio site.
