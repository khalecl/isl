# Immersive Story Lab — developer handout (read this before touching the code)

Live: https://khalecl.github.io/isl/ · Repo: `khalecl/isl` (branch `main`, GitHub Pages from root).
Owner: Dr. Khaled Diab ("K"). Purpose: companion web app for Day 3 (Digital Interactive & Immersive
Visualisation) of the 5-day XCalibre course *Data Visualisation & Storytelling*. All data is **practice
data** (fictional "Atlas Projects Group"); keep that label on anything new.

## Rules of the house
- Plain HTML + ES modules, **no build step**, no CDN at runtime. Libraries are vendored in `vendor/`
  (three.js r170 + USDZExporter + fflate; qrcode-generator 1.4.4, global `qrcode`). Import map in `index.html`.
- Every edit: bump **both** `VERSION` in `sw.js` (`storylab-vN`) **and** the `vN` tag next to the title in
  `index.html` (currently **v7**). K checks the header tag to confirm his phone loaded the update.
- `sw.js` is network-first (cache only as offline fallback); new files need no registration — they are cached when first fetched.
- Push: `git -c push.negotiate=true push origin main`. **Pull/rebase first** — another session writes `day4-dss/`.
  Commit as `-c user.name="Khaled Diab" -c user.email="khalecl@users.noreply.github.com"`.
- Colours: never hard-code status colours. Use `PAL.risk / PAL.watch / PAL.ok` and `TH.text/muted/grid`
  from `palette.js`; CSS uses `--risk/--watch/--ok`, light mode via `body.light` overrides in `index.html`.
- Test headless before pushing: `python3 -m http.server 8765` in the repo, then Playwright with
  `/usr/bin/google-chrome --use-gl=swiftshader --enable-unsafe-swiftshader` (add
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for camera AR). `window.__lab` exposes
  test hooks (`makeUSDZ`, `AR`, `pick3`, `cards`, `wallPanels`, `setL3Mode`, `checkGroups`).
- Writing style for UI text: plain English for non-native speakers, define acronyms, no hype words.

## Tabs (`setLevel(n)` in app.js; `#tabs button[data-level]`)
| n | Tab | Container | Code |
|---|-----|-----------|------|
| 1 | Level 1 · Interactive dashboard | `#dash` (DOM, scrolls) | `dashboard.js` + `panels.js` + `charts.js` |
| 2 | Level 2 · AR in your room | `#stage` (WebGL) + `#arUI` overlay, class `#stage.l2` | `ar.js` |
| 3 | Level 3 · Immersive wall + sorting activity | `#stage` (WebGL) + `.sheet` | `app.js` (LEVEL 3 section) |
| 4 | Digital twin (motor M-101, generator G-201) | `#twin` (DOM + own WebGL in `#t3d`) | `twin.js` |
| 0 | Guide | `#about` (HTML set at end of app.js) | `app.js` |
Start tab: 1, or 4 if URL has `?asset=` or `#twin` (QR links). Header: clock, LIVE pill, 🎨 theme menu (`#themePop`).

## File map (≈2,100 lines total)
- **index.html** (~225) — all CSS (dark default, `body.light` block, mobile `@media (max-width:700px)`), header,
  tabs, containers `#dash #twin #stage #about`, `#drawer` (project detail), `#storyBar`, `#tip`, `#qrModal`, import map.
- **palette.js** (40) — `PALETTES` (standard / cb Okabe-Ito / contrast), `HOLO` glass styles (blue, violet,
  emerald, light: `a,b` gradient, `border,title,text,muted,grid,accent,base`), live `PAL`, `TH`, `SETTINGS`
  (`mode,palette,holo`, saved in localStorage `storylab-theme`), `applyTheme(patch)`, `onTheme(fn)`,
  `wallGlass()`, `withGlass(style, fn)` (temporarily swaps TH text colours for drawing on glass).
- **data.js** (170) — portfolio model. `RAW` = 12 projects (id, name, sector, region, pm, bac, pc, pv, ac, start).
  Calendar `MONTHS` Jan 25–Dec 29, data date `T=21` (Oct 26). Builds per project: EVM (ev, cpi, spi, eac,
  overrun), S-curve series (`series.pv/ev/ac/evF/acF`), `cpiTrend`, milestones, cost breakdown, risks (L×I),
  HSE, quality, `live` {crew, util, acDelta, evDelta}. Seeded RNG ⇒ same data for everyone.
  `BANDS` (risk <0.85, watch <0.95, ok) with colour getters → PAL. `portfolio(list)` aggregates.
  `curCPI/curSPI` include live deltas. `tick()` every 2 s (called in app.js) updates live values + `ALERTS`; `onTick(fn)`.
- **charts.js** (196) — own canvas chart library: `lineChart, barH, columns, donut, gauge, scatter, heatmap,
  gantt, sparkline`. Each `fn(g, w, h, opts)` draws and returns hit areas. `paint(canvas, fn, opts)` sizes for
  HiDPI and stores `canvas._hits`; `hitTest(hits,x,y)` → tooltip. Re-exports `TH, PAL`.
- **panels.js** (108) — `PANELS` registry `{id: {title, draw(g,w,h,{list,P})}}`: gauges, scurve, overrun,
  matrix, sector, spend, risk, live, hse, alerts, kpis, clock. Used by Level 1 **and** the 3D glass panels
  (Level 2/3). `kpiList(P)`, `ctxFor(list)`. **To add a chart everywhere: add a panel here.**
- **dashboard.js** (146) — Level 1. `LAYOUT` (panel id → grid class g-3/4/6/8/12), filters `state`
  (sectors, region, status, search, sort), `renderAll(live)`, sortable table `COLS`, `openProject(id)` →
  `renderDrawer` (tiles, gauges, project S-curve, milestone gantt, cost donut, CPI trend, risks, HSE),
  `STORY` (5 guided steps; each `{t, p:[panel ids to spotlight], x(): text, hl?}`) with `startStory/endStory`.
- **app.js** (336) — boot (clock, `initDashboard`, warm-up ticks, `setInterval(tick,2000)`), helpers
  (`textTexture`, `drawGlassPanel(canvas,id,ctx,style)`), shared renderer/camera for `#stage`, Level 2 glue
  (reticle, `AR.initAR({...deps})`, XR support checks), **Level 3**: `WALL_IDS` (12 panels on a cylinder,
  radius `WR=3`, 2 rows), `focusPanel`, sorting activity (cards with EV/AC, `BANNER_ANGLES`, `pick3`,
  `checkGroups`, `resetGroups`, `setL3Mode('wall'|'sort')`, VR via `startVR` + controller rays),
  `setLevel`, pointer input (drag = scene follows finger; `look3` yaw/pitch), render loop, Guide HTML,
  `themeMenu()` + `onTheme` reactions (scene bg, wall redraw, AR.restyle, twinRefresh).
- **ar.js** (300) — Level 2. Scene `s2`, group `holo` (user at origin): 3D bar chart (`buildChart`, 12 bars
  4×3, value sprites), `METRICS` budget/overrun/cpi/crew(live), `INSIGHTS` (4 guided findings with focus
  sets), holo panels ring (`P(id, angle, y, r)` in `initAR`), floating `detailPanel` (`drawDetail`).
  Modes: **camera AR** (`startCameraAR`: iOS motion permission → deviceorientation quaternion → camera;
  getUserMedia rear camera into `#camVideo`; `recenter`), **Table AR** Android WebXR hit-test (`desk` group,
  tap bars via controller 0), **Static 3D (Apple)** Quick Look (`makeUSDZ` — Quick Look renders only
  `MeshStandardMaterial`; labels/panels use `qlMat` with emissive map). UI built in `buildUI()` into `#arUI`
  (top bar, metric segment `.seg`, hint, card). Hooks for app.js: `drag, tap, render, onTick, onSecond, restyle`.
- **twin.js** (308) — Digital twin. `ASSETS` {M-101 160 kW motor-pump, G-201 500 kVA generator}: `st` state,
  `sensors[]` {k,l,u,d,min,max,warn,alarm,low?,part}, `model(st)` simplified physics. `step()` each 2 s
  (1 tick = 10 min plant time, thermal lag 0.3), `HIST=144`, alarms on state change, `health`, `rulDays`,
  `SCEN` (normal, bearing/engine wear 0.04/tick, overload 112 %, cooling failure). 3D: `buildMotor/buildGenerator`,
  parts registered with `addPart(group, partName, mesh)`; `colourParts` glows by sensor status; tap → `drawPart`.
  UI: `refresh` (status pill, info, health gauge, 8 gauges, trend `drawTrend`, alarms), what-if
  (`buildWhatIf/updateWhatIf`: load, ambient, wear, cooling → predicted readings, $/day at `PRICE=0.12`,
  insulation 10 °C rule, RUL), QR: `assetURL(id)` = `…/isl/?asset=ID#twin`, `showQR`, `printTags` (A4 tags).
  Exports `initTwin, twinRefresh, twinAssets`.
- **day4-dss/index.html** — separate Day 4 "Northfield Plant" AI decision-support console, written by
  another session. Self-contained; don't edit unless asked.
- **README.md** — trainer-facing guide (publishing, install, levels, model answer). **manifest.webmanifest**, **icons/** — PWA.

## Common edits — where to go
- Change project numbers → `RAW` in data.js (everything else is derived). Level 3 model answer = CPI bands.
- New dashboard chart → new entry in `PANELS` + add to `LAYOUT` (dashboard.js) and/or `WALL_IDS` (app.js) /
  AR ring in `initAR` (ar.js). New chart type → function in charts.js returning hits.
- Story text → `STORY` (dashboard.js); AR insights → `INSIGHTS` (ar.js); Level 3 texts → `setL3Text`.
- New AR metric → `METRICS` in ar.js (+ button appears automatically).
- New twin asset → entry in `ASSETS` + a `buildX()` model using `addPart` + branch in `setAsset3D`; QR/print are automatic.
- New colours/themes → palette.js (`PALETTES`, `HOLO`) + `body.light` CSS if a new DOM surface.
- Guide tab text → `$('about').innerHTML` in app.js. Trainer README → README.md.

## Known limits (be honest with K)
- iPhone browsers have no WebXR: camera AR is gyro-only (not anchored to surfaces); only Android Table AR is registered.
- Level 2 data is not *situated* (not tied to the room); the twin's QR tags are the situated example.
- Live feeds and twin physics are simulated and simplified; labelled as practice data.
- Course alignment notes: Level 3 ≈ "space to think" + large surrounding displays (Immersive Analytics ch. 4–5);
  Level 2 ≈ handheld AR (ch. 7 situated analytics is only partly met); twin covers Day 3 "Digital Twin".
