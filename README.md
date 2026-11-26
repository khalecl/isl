# Immersive Story Lab — Day 3

Companion web app for Day 3 of **Data Visualisation & Storytelling** (Digital Interactive & Immersive Visualisation).
It tells one data story about a project portfolio at three levels of interactivity and immersion.

> **Practice data.** "Atlas Projects Group" and all its projects and figures are invented for training.

## The three levels

| Level | What trainees do | Devices |
|---|---|---|
| 1 · Interactive dashboard | Command-centre dashboard: live clock, 8 KPI tiles with sparklines, CPI/SPI/% complete gauges, portfolio S-curve (PV/EV/AC + forecast), sorted overrun bars, CPI-vs-SPI bubble matrix, budget-by-sector donut, monthly spend, 5×5 risk heat map, safety & quality tiles, live site feed and alerts. Filter by sector/region/status, search, sortable project register, and a full drill-down per project (S-curve, milestone Gantt, cost breakdown, CPI trend, top risks, HSE). **Play the data story** runs a guided 5-step narrative that spotlights panels. | Any phone, tablet or PC |
| 2 · AR in your room | **Camera AR (all phones):** the phone camera shows the room and the dashboard floats around the trainee as holograms; turning the phone (gyroscope) looks around. A live 3D bar chart stands in front: switch Budget / Overrun / CPI / Crew (live), tap any bar for its project card and floating detail panel (gauges, CPI trend), step through 4 guided insights, tap panels to pull them closer, open full details in Level 1. Works as an interactive preview on any screen (drag to look). | iPhone (Safari) and Android (Chrome) for camera AR; Android also offers **Table AR** (WebXR surface placement, tap bars); iPhone also offers Apple's static 3D viewer. |
| 3 · Immersive wall | 12 live glass panels on a curved wall around the user; tap to pull a panel closer. Then the sorting activity: compute CPI = EV ÷ AC and group 12 project cards in space, then Check. | Any device (drag to look). Full VR in a headset browser (e.g. Meta Quest Browser). |

The live feed is **simulated**: every 2 seconds costs, crews and equipment utilisation tick forward slightly and alerts are generated.

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

Edit `data.js`. Each project has a region, PM, start month, a budget (BAC), percent complete, planned value (PV) and actual cost (AC). EV, CPI, SPI, EAC, S-curves, milestones, risks, HSE figures, colour band and all story text are calculated automatically.
After any edit, change `VERSION` in `sw.js` (e.g. `storylab-v2`) so installed copies update.

## Trainer notes

- **Model answer, Level 3:** At risk: P01, P02, P07, P08, P11 · Watch: P06, P09 · On track: P03, P04, P05, P10, P12. The app checks this automatically.
- **Pitfall step (story step 4):** ranking sectors from the donut is slow; the sorted bar answers ranking questions at a glance. Level 2 shows the 3D occlusion pitfall (bars hiding bars).
- **Discussion:** which level helped trainees *find* the problem, and which helped them *explain* it? Immersion suits exploring and presenting; the decision itself is usually clearest in 2D.

## Technical

Plain HTML + JavaScript, no build step. 3D/XR by three.js r170 (MIT licence), bundled in `vendor/` so no external downloads are needed.
