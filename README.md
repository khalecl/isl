# Immersive Story Lab — Day 3

Companion web app for Day 3 of **Data Visualisation & Storytelling** (Digital Interactive & Immersive Visualisation).
It tells one data story about a project portfolio at three levels of interactivity and immersion.

> **Practice data.** "Atlas Projects Group" and all its projects and figures are invented for training.

## The three levels

| Level | What trainees do | Devices |
|---|---|---|
| 1 · Interactive screen | Five-step guided story: budget → cost health (CPI) → forecast overrun → 3D pitfall vs flat chart → decision. Rotate, zoom, filter by sector, tap bars for EVM details. | Any phone, tablet or PC |
| 2 · AR on your desk | Place the portfolio model on a real desk and walk around it. Switch Budget / Overrun. | Android + Chrome: live WebXR AR. iPhone/iPad + Safari: Apple Quick Look (fixed model). Others: 3D preview. |
| 3 · Space to think | 12 project cards surround the user. Compute CPI = EV ÷ AC and sort cards into At risk / Watch / On track, then Check (score + CPI revealed). | Any device (drag to look). Full VR in a headset browser (e.g. Meta Quest Browser). |

## Publish on GitHub Pages (about 5 minutes)

1. Create a new **public** repository on GitHub, e.g. `storylab`.
2. Upload **all files and folders** from this package (keep the folder structure: `vendor/`, `icons/`).
3. Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. After a minute the app is live at `https://<your-username>.github.io/storylab/`.
5. Share the link (or a QR code of it) with trainees.

GitHub Pages serves over HTTPS, which AR, VR and "install as app" all require.
Opening `index.html` directly from disk will not work; test locally with `python -m http.server` and open `http://localhost:8000`.

## Install on phone or desktop

- **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*.
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Windows/Mac (Chrome or Edge):** install icon in the address bar.

The app works offline after the first visit.

## Changing the data

Edit `data.js`. Each project has a budget (BAC), percent complete, planned value (PV) and actual cost (AC). EV, CPI, SPI, EAC, overrun, colour band and all story text are calculated automatically.
After any edit, change `VERSION` in `sw.js` (e.g. `storylab-v2`) so installed copies update.

## Trainer notes

- **Model answer, Level 3:** At risk: P01, P02, P07, P08, P11 · Watch: P06, P09 · On track: P03, P04, P05, P10, P12. The app checks this automatically.
- **Pitfall step (Level 1, step 4):** near bars look taller than far ones and bars hide each other; the flat sorted chart fixes both. Use this to link back to Day 1 pitfalls.
- **Discussion:** which level helped trainees *find* the problem, and which helped them *explain* it? Immersion suits exploring and presenting; the decision itself is usually clearest in 2D.

## Technical

Plain HTML + JavaScript, no build step. 3D/XR by three.js r170 (MIT licence), bundled in `vendor/` so no external downloads are needed.
