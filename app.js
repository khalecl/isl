import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { PROJECTS, BANDS, COMPANY, DATA_DATE, fmt, money, bandColor, bandLabel, tick } from './data.js';
import { PANELS, ctxFor } from './panels.js';
import * as C from './charts.js';
import { initDashboard, renderAll } from './dashboard.js';

const $ = id => document.getElementById(id);

// ---------- header clock + simulated live feed ----------
function clock() { const n = new Date(); $('clockT').textContent = n.toLocaleTimeString('en-GB');
  $('clockD').innerHTML = n.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + '<br>Data date ' + DATA_DATE; }
clock(); setInterval(clock, 1000);
initDashboard();
for (let i = 0; i < 6; i++) tick();          // warm up the feed so panels are populated
setInterval(tick, 2000);

// ---------- helpers ----------
function textTexture(draw, w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const roundRect = C.rr;
function labelTexture(text) {
  return textTexture((g, w, h) => { g.fillStyle = 'rgba(11,16,36,0.85)'; roundRect(g, 4, 4, w - 8, h - 8, 36); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 120px system-ui, Arial'; g.fillText(text, w / 2, h / 2); });
}
// draw a registry panel as a glass card onto a canvas (used for 3D panels)
function drawGlassPanel(canvas, id, ctx) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, 'rgba(40,48,96,0.97)'); grad.addColorStop(1, 'rgba(14,18,44,0.97)');
  g.fillStyle = grad; roundRect(g, 3, 3, w - 6, h - 6, 34); g.fill();
  g.strokeStyle = 'rgba(160,200,255,0.35)'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
  g.fillStyle = '#cfe0ff'; g.font = '600 30px system-ui, Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(PANELS[id].title, 30, 40);
  g.fillStyle = '#ff4d5a'; g.beginPath(); g.arc(w - 36, 40, 8, 0, 7); g.fill();
  // charts are designed at ~half this resolution: scale 2× for crisp text
  g.save(); g.translate(22, 74); g.scale(2, 2);
  PANELS[id].draw(g, (w - 44) / 2, (h - 96) / 2, ctx);
  g.restore();
}
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
stage.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h || renderer.xr.isPresenting) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage);
function addLights(scene) { scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(2, 4, 3); scene.add(d); }

// ============ LEVEL 2: AR on the desk ============
function buildChart() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 2.0), new THREE.MeshStandardMaterial({ color: 0x232a52, roughness: 0.9 }));
  base.position.y = -0.025; group.add(base);
  const bars = [];
  PROJECTS.forEach((p, i) => {
    const col = i % 4, row = Math.floor(i / 4), x = -0.9 + col * 0.6, z = -0.6 + row * 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), new THREE.MeshStandardMaterial({ color: bandColor(p.band), roughness: 0.5 }));
    mesh.geometry.translate(0, 0.5, 0); mesh.position.set(x, 0, z); mesh.scale.y = 0.01; mesh.userData.project = p; group.add(mesh);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: labelTexture(p.id), transparent: true }));
    label.position.set(x, 0.1, z + 0.18); group.add(label);
    bars.push({ p, mesh, label, h: 0.01, targetH: 0.01 });
  });
  return { group, bars };
}
const maxBac = Math.max(...PROJECTS.map(p => p.bac)), maxOver = Math.max(...PROJECTS.map(p => p.overrun));
function setChartMode(chart, height) { chart.bars.forEach(b => { b.targetH = height === 'overrun' ? Math.max(0.02, b.p.overrun / maxOver * 1.4) : b.p.bac / maxBac * 1.4;
  b.mesh.material.color.set(height === 'overrun' && b.p.overrun <= 0 ? bandColor('ok') : bandColor(b.p.band)); }); }
function animateChart(chart, k) { chart.bars.forEach(b => { b.h += (b.targetH - b.h) * k; b.mesh.scale.y = b.h; b.label.position.y = b.h + 0.1; }); }

const s2 = new THREE.Scene(); addLights(s2);
const chart2 = buildChart(), AR_SCALE = 0.16;
chart2.group.scale.setScalar(AR_SCALE); s2.add(chart2.group);
// floating live gauge panel above the model
const gaugeCanvas = document.createElement('canvas'); gaugeCanvas.width = 1024; gaugeCanvas.height = 520;
const gaugeTex = new THREE.CanvasTexture(gaugeCanvas); gaugeTex.colorSpace = THREE.SRGBColorSpace;
const gaugePanel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.32), new THREE.MeshBasicMaterial({ map: gaugeTex, transparent: true, side: THREE.DoubleSide }));
gaugePanel.position.set(0, 2.35, -0.9); chart2.group.add(gaugePanel);
function drawGaugePanel() { drawGlassPanel(gaugeCanvas, 'gauges', ctxFor(PROJECTS)); gaugeTex.needsUpdate = true; }
drawGaugePanel();
const s2floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x161a3a }));
s2floor.rotation.x = -Math.PI / 2; s2floor.position.y = -0.01;
const s2grid = new THREE.GridHelper(6, 24, 0x2c3a6f, 0x1f2550); s2.add(s2floor, s2grid);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
reticle.matrixAutoUpdate = false; reticle.visible = false; s2.add(reticle);
let arMode = 'budget', arPlaced = false, hitSource = null, s2Spin = 0;
setChartMode(chart2, 'budget');

const supportsQuickLook = (() => { const a = document.createElement('a'); return !!(a.relList && a.relList.supports && a.relList.supports('ar')); })();
let supportsAR = false, supportsVR = false;
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then(v => { supportsAR = v; if (level === 2) renderLevel2(); }).catch(() => {});
  navigator.xr.isSessionSupported('immersive-vr').then(v => { supportsVR = v; if (level === 3) renderLevel3(); }).catch(() => {});
}
const level2Text = () => arMode === 'budget'
  ? 'Bar height = budget, colour = cost health. The live gauge panel floats above the model. Walk around it: which at-risk projects hide behind bigger bars?'
  : `Bar height = forecast overrun. P02, P01 and P08 stand out. Compare the side view with the view from above: which is easier to read?`;
function renderLevel2() {
  $('stepTitle').textContent = 'Level 2 · Augmented reality: the portfolio on your desk';
  let main;
  if (supportsAR) main = `<button class="btn primary" id="startAR">Start AR</button>`;
  else if (supportsQuickLook) main = `<button class="btn primary" id="quickLook">View on my desk (AR)</button>`;
  else main = `<span class="muted small">Live AR needs Android Chrome; iPhone/iPad Safari opens Apple's AR viewer. The 3D preview works here.</span>`;
  $('stepText').textContent = level2Text() + (supportsQuickLook && !supportsAR ? ' (iPhone shows a fixed copy of the model.)' : '');
  $('controls').innerHTML = `<button class="btn ${arMode === 'budget' ? 'primary' : ''}" id="m1">Budget</button><button class="btn ${arMode === 'overrun' ? 'primary' : ''}" id="m2">Overrun</button>${main}`;
  $('m1').onclick = () => { arMode = 'budget'; setArMode(); renderLevel2(); };
  $('m2').onclick = () => { arMode = 'overrun'; setArMode(); renderLevel2(); };
  if ($('startAR')) $('startAR').onclick = startAR;
  if ($('quickLook')) $('quickLook').onclick = openQuickLook;
}
function setArMode() { setChartMode(chart2, arMode); $('arBudget').classList.toggle('on', arMode === 'budget'); $('arOverrun').classList.toggle('on', arMode === 'overrun'); if (arPlaced) $('arTop').textContent = level2Text(); }
async function startAR() {
  try {
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: $('arOverlay') } });
    renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
    xrKind = 'ar'; arPlaced = false; chart2.group.visible = false; s2floor.visible = false; s2grid.visible = false; chart2.group.rotation.y = 0;
    $('arOverlay').style.display = 'block'; $('arTop').textContent = 'Move your phone slowly over a flat surface. When the blue ring appears, tap to place the portfolio.';
    hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
    session.addEventListener('select', () => { if (!reticle.visible) return;
      chart2.group.position.setFromMatrixPosition(reticle.matrix);
      const cam = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
      chart2.group.rotation.y = Math.atan2(cam.x - chart2.group.position.x, cam.z - chart2.group.position.z);
      chart2.group.visible = true; arPlaced = true; $('arTop').textContent = level2Text() + ' Tap another spot to move it.'; });
    session.addEventListener('end', () => { hitSource = null; xrKind = null; reticle.visible = false; $('arOverlay').style.display = 'none';
      chart2.group.position.set(0, 0, 0); chart2.group.visible = true; s2floor.visible = true; s2grid.visible = true; resize(); });
  } catch (e) { $('stepText').textContent = 'Could not start AR on this device. ' + (e?.message || ''); }
}
['arBudget', 'arOverrun', 'arExit'].forEach(id => $(id).addEventListener('beforexrselect', e => e.preventDefault()));
$('arBudget').onclick = () => { arMode = 'budget'; setArMode(); };
$('arOverrun').onclick = () => { arMode = 'overrun'; setArMode(); };
$('arExit').onclick = () => renderer.xr.getSession()?.end();
async function makeUSDZ() {
  const tmp = buildChart(); setChartMode(tmp, arMode); animateChart(tmp, 1);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 520; drawGlassPanel(c, 'gauges', ctxFor(PROJECTS));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const pnl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.32), new THREE.MeshBasicMaterial({ map: t, transparent: true })); pnl.position.set(0, 2.35, -0.9); tmp.group.add(pnl);
  tmp.group.scale.setScalar(AR_SCALE);
  const holder = new THREE.Scene(); holder.add(tmp.group); holder.updateMatrixWorld(true);
  return new USDZExporter().parseAsync(holder, { quickLookCompatible: true });
}
async function openQuickLook() {
  const btn = $('quickLook'); btn.disabled = true; btn.textContent = 'Preparing model…';
  try { const data = await makeUSDZ(), url = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
    const a = document.createElement('a'); a.rel = 'ar'; a.href = url + '#allowsContentScaling=1'; a.download = `atlas-portfolio-${arMode}.usdz`;
    a.appendChild(document.createElement('img')); document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  } catch (e) { $('stepText').textContent = 'Could not prepare the AR model: ' + (e?.message || e); }
  btn.disabled = false; btn.textContent = 'View on my desk (AR)';
}

// ============ LEVEL 3: immersive wall + sorting activity ============
const s3 = new THREE.Scene(); s3.background = new THREE.Color(0x070a1c); s3.fog = new THREE.Fog(0x070a1c, 6, 14); addLights(s3);
{ const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x0f1430 })); floor.rotation.x = -Math.PI / 2; s3.add(floor);
  const grid = new THREE.PolarGridHelper(6, 16, 8, 64, 0x2a3570, 0x1a2150); grid.position.y = 0.003; s3.add(grid);
  // soft glowing ring under the user
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })); ring.position.y = 0.01; s3.add(ring); }
const polar = (ang, r, y) => new THREE.Vector3(Math.sin(ang) * r, y, -Math.cos(ang) * r);
const faceCentre = (obj, y = 1.6) => obj.lookAt(0, y, 0);

// --- the wall: 12 live glass panels on a curved surface around the user ---
const WALL_IDS = ['clock', 'kpis', 'gauges', 'scurve', 'overrun', 'matrix', 'sector', 'spend', 'risk', 'live', 'hse', 'alerts'];
const wall = new THREE.Group(); s3.add(wall);
const PW = 1.36, PH = 0.85, WR = 3.0, STEP = 0.5;
const wallPanels = WALL_IDS.map((id, i) => {
  const row = i < 6 ? 0 : 1, col = i % 6, ang = (col - 2.5) * STEP;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.05 }));
  const home = polar(ang, WR, row ? 1.05 : 2.0); mesh.position.copy(home); faceCentre(mesh);
  mesh.userData = { kind: 'panel', id }; wall.add(mesh);
  return { id, mesh, canvas, tex, home, target: home.clone(), scale: 1, targetScale: 1 };
});
let wallCtx = ctxFor(PROJECTS), focused = null;
function redrawWall(only) { wallCtx = ctxFor(PROJECTS); wallPanels.forEach(p => { if (only && p.id !== only) return; drawGlassPanel(p.canvas, p.id, wallCtx); p.tex.needsUpdate = true; }); }
redrawWall();
setInterval(() => { if (level === 3) redrawWall('clock'); if (level === 2) drawGaugePanel(); }, 1000);
function focusPanel(p) {
  if (focused && focused !== p) { focused.target = focused.home.clone(); focused.targetScale = 1; }
  if (focused === p) { p.target = p.home.clone(); p.targetScale = 1; focused = null; setL3Text(); return; }
  focused = p; const dir = p.home.clone().setY(0).normalize();
  p.target = new THREE.Vector3(dir.x * 1.55, 1.55, dir.z * 1.55); p.targetScale = 1.05;
  $('stepText').innerHTML = `<b>${PANELS[p.id].title}.</b> Tap it again to send it back to the wall. Which question does this panel answer, and who needs it?`;
}

// --- sorting activity (space to think) ---
const sortGroup = new THREE.Group(); sortGroup.visible = false; s3.add(sortGroup);
const CARD_W = 0.56, CARD_H = 0.34, RING = 2.4, BANNER_ANGLES = { risk: -0.46, watch: 0, ok: 0.46 };
function cardTexture(p, st) {
  return textTexture((g, w, h) => {
    const border = st.checked ? (st.correct ? '#2fbf7a' : '#f0505a') : st.selected ? '#38bdf8' : '#3a4b83';
    g.fillStyle = '#f4f7fb'; roundRect(g, 6, 6, w - 12, h - 12, 26); g.fill();
    g.lineWidth = st.selected || st.checked ? 14 : 6; g.strokeStyle = border; roundRect(g, 8, 8, w - 16, h - 16, 24); g.stroke();
    g.fillStyle = '#0b1220'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = 'bold 36px system-ui, Arial'; g.fillText(p.id, 32, 62); g.font = '30px system-ui, Arial'; g.fillStyle = '#5a6b82'; g.fillText(p.sector, 110, 62);
    g.fillStyle = '#0b1220'; g.font = 'bold 33px system-ui, Arial'; g.fillText(p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name, 32, 108);
    g.font = '30px system-ui, Arial'; g.fillText(`Earned value  $${fmt(p.ev)} M`, 32, 160); g.fillText(`Actual cost    $${fmt(p.ac)} M`, 32, 200);
    g.fillStyle = '#5a6b82'; g.fillText(`Budget $${fmt(p.bac, 0)} M · ${Math.round(p.pc * 100)}% done`, 32, 240);
    if (st.checked) { g.fillStyle = bandColor(p.band); roundRect(g, 32, 256, w - 64, 46, 12); g.fill(); g.fillStyle = '#081019'; g.font = 'bold 28px system-ui, Arial';
      g.fillText(`CPI ${p.cpi.toFixed(2)} → ${bandLabel(p.band)}`, 48, 289); }
  }, 512, 320);
}
const cards = PROJECTS.map((p, i) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: cardTexture(p, {}), side: THREE.DoubleSide }));
  const home = polar(Math.PI * 0.6 + (i / (PROJECTS.length - 1)) * Math.PI * 0.8, RING, i % 2 ? 1.25 : 1.65);
  mesh.position.copy(home); faceCentre(mesh, home.y); mesh.userData = { kind: 'card' }; sortGroup.add(mesh);
  return { p, mesh, home, group: null, selected: false, checked: false, target: home.clone() };
});
const banners = BANDS.map(b => {
  const tex = textTexture((g, w, h) => { g.fillStyle = b.color; roundRect(g, 6, 6, w - 12, h - 12, 30); g.fill(); g.fillStyle = '#081019'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 76px system-ui, Arial'; g.fillText(b.label, w / 2, h * 0.38); g.font = '44px system-ui, Arial'; g.fillText(b.rule, w / 2, h * 0.74); }, 1024, 256);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.position.copy(polar(BANNER_ANGLES[b.key], RING + 0.05, 2.25)); faceCentre(mesh, 2.25); mesh.userData = { kind: 'banner', key: b.key };
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.0), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  zone.position.copy(polar(BANNER_ANGLES[b.key], RING + 0.1, 1.05)); faceCentre(zone, 1.05); zone.userData = { kind: 'banner', key: b.key };
  sortGroup.add(mesh, zone); return { ...b, mesh, zone };
});
function worldButton(text, color, ang, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide,
    map: textTexture((g, w, h) => { g.fillStyle = color; roundRect(g, 4, 4, w - 8, h - 8, 40); g.fill(); g.fillStyle = '#081019'; g.font = 'bold 84px system-ui, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2); }, 512, 164) }));
  m.position.copy(polar(ang, 1.6, y)); faceCentre(m, y); sortGroup.add(m); return m;
}
const btnCheck = worldButton('Check', '#38bdf8', -0.22, 0.75); btnCheck.userData = { kind: 'check' };
const btnReset = worldButton('Reset', '#c5d0de', 0.22, 0.75); btnReset.userData = { kind: 'reset' };
const btnWall = worldButton('Wall view', '#a78bfa', 0, 0.5); btnWall.userData = { kind: 'toWall' };
const scoreBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
scoreBoard.position.copy(polar(0, 1.6, 0.98)); faceCentre(scoreBoard, 0.98); sortGroup.add(scoreBoard);
function setScoreText(t) { scoreBoard.material.map?.dispose(); scoreBoard.material.map = textTexture((g, w, h) => { g.fillStyle = '#e8edf4'; g.font = 'bold 46px system-ui, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2); }, 1024, 186); scoreBoard.material.needsUpdate = true; }
setScoreText('Select a card, then a coloured group');
// a button on the wall to switch into the activity (works in VR too)
const btnSort = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide,
  map: textTexture((g, w, h) => { g.fillStyle = '#a78bfa'; roundRect(g, 4, 4, w - 8, h - 8, 40); g.fill(); g.fillStyle = '#081019'; g.font = 'bold 70px system-ui, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Sorting activity', w / 2, h / 2); }, 640, 164) }));
btnSort.position.copy(polar(0, 2.0, 0.45)); faceCentre(btnSort, 0.45); btnSort.userData = { kind: 'toSort' }; wall.add(btnSort);

let selectedCard = null;
const refreshCard = c => { c.mesh.material.map.dispose(); c.mesh.material.map = cardTexture(c.p, { selected: c.selected, checked: c.checked, correct: c.group === c.p.band }); };
function layoutGroups() {
  BANDS.forEach(b => cards.filter(c => c.group === b.key).forEach((c, i) => { c.target = polar(BANNER_ANGLES[b.key] + (i % 2 ? 0.11 : -0.11), RING - 0.02, 1.88 - Math.floor(i / 2) * 0.37); }));
  cards.filter(c => !c.group).forEach(c => c.target = c.home.clone());
}
function pick3(obj) {
  const u = obj.userData;
  if (u.kind === 'panel') return focusPanel(wallPanels.find(p => p.mesh === obj));
  if (u.kind === 'toSort') return setL3Mode('sort');
  if (u.kind === 'toWall') return setL3Mode('wall');
  if (u.kind === 'card') {
    const c = cards.find(x => x.mesh === obj);
    if (selectedCard && selectedCard !== c) { selectedCard.selected = false; refreshCard(selectedCard); }
    c.selected = !c.selected; selectedCard = c.selected ? c : null;
    if (c.checked) cards.forEach(x => { x.checked = false; refreshCard(x); });
    refreshCard(c); setScoreText(c.selected ? `${c.p.id} selected: now choose a group` : 'Select a card, then a coloured group');
  } else if (u.kind === 'banner' && selectedCard) {
    selectedCard.group = u.key; selectedCard.selected = false; refreshCard(selectedCard); selectedCard = null; layoutGroups();
    const n = cards.filter(c => c.group).length; setScoreText(n === cards.length ? 'All placed: press Check' : `${n} of ${cards.length} placed`);
  } else if (u.kind === 'check') checkGroups(); else if (u.kind === 'reset') resetGroups();
}
function checkGroups() {
  const placed = cards.filter(c => c.group), right = placed.filter(c => c.group === c.p.band).length;
  cards.forEach(c => { c.selected = false; c.checked = !!c.group; refreshCard(c); }); selectedCard = null;
  const msg = `${right} of ${cards.length} correct` + (placed.length < cards.length ? ` (${cards.length - placed.length} not placed)` : '');
  setScoreText(msg);
  if (level === 3) $('stepText').innerHTML = `<span class="score">${msg}.</span> Cards now show the CPI: green border = right group, red = move it. What does the shape of the groups tell the steering committee?`;
}
function resetGroups() { cards.forEach(c => { c.group = null; c.selected = false; c.checked = false; refreshCard(c); }); selectedCard = null; layoutGroups(); setScoreText('Select a card, then a coloured group'); setL3Text(); }

let l3mode = 'wall';
function setL3Mode(m) {
  l3mode = m; wall.visible = m === 'wall'; sortGroup.visible = m === 'sort';
  if (focused) focusPanel(focused);
  look3.yawT = m === 'sort' ? Math.PI * 0.85 : 0; look3.pitchT = (m === 'sort' ? -0.08 : 0.02) - (portrait() ? 0.14 : 0);
  renderLevel3();
}
function setL3Text() {
  $('stepTitle').textContent = l3mode === 'wall' ? 'Level 3 · Immersive wall: the command centre around you' : 'Level 3 · Space to think: sort the projects';
  $('stepText').textContent = l3mode === 'wall'
    ? 'Twelve live panels surround you, all updating from the site feed. Drag to look around; tap a panel to pull it closer. Then try the sorting activity.'
    : 'Project cards surround you. Compute CPI = earned value ÷ actual cost for each card and sort the cards under the three coloured groups. Then press Check.';
}
function renderLevel3() {
  setL3Text();
  $('controls').innerHTML = (l3mode === 'wall'
    ? `<button class="btn primary" id="toSort">Sorting activity</button><button class="btn" id="front">Face front</button>`
    : `<button class="btn primary" id="chk">Check</button><button class="btn" id="rst">Reset</button><button class="btn" id="front">Face the groups</button><button class="btn" id="toWall">Back to wall</button>`)
    + (supportsVR ? '<button class="btn" id="vr">Enter VR headset</button>' : '');
  $('front').onclick = () => { look3.yawT = 0; look3.pitchT = (l3mode === 'wall' ? 0.02 : -0.1) - (portrait() ? 0.14 : 0); };
  $('toSort') && ($('toSort').onclick = () => setL3Mode('sort'));
  $('toWall') && ($('toWall').onclick = () => setL3Mode('wall'));
  $('chk') && ($('chk').onclick = checkGroups); $('rst') && ($('rst').onclick = resetGroups);
  $('vr') && ($('vr').onclick = startVR);
}
async function startVR() {
  try { const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor'); await renderer.xr.setSession(session); xrKind = 'vr';
    session.addEventListener('end', () => { xrKind = null; resize(); });
  } catch (e) { $('stepText').textContent = 'Could not start VR: ' + (e?.message || e); }
}
const tmpMat = new THREE.Matrix4(), ray = new THREE.Raycaster();
const pickables3 = () => l3mode === 'wall' ? [...wallPanels.map(p => p.mesh), btnSort] : [...cards.map(c => c.mesh), ...banners.flatMap(b => [b.mesh, b.zone]), btnCheck, btnReset, btnWall];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x38bdf8 })); line.scale.z = 5; ctrl.add(line);
  ctrl.addEventListener('select', () => { if (xrKind !== 'vr') return; tmpMat.identity().extractRotation(ctrl.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
    const hit = ray.intersectObjects(pickables3(), false)[0]; if (hit) pick3(hit.object); });
  s3.add(ctrl);
}
const portrait = () => stage.clientWidth < stage.clientHeight;
const look3 = { yaw: 0, pitch: 0.02, yawT: 0, pitchT: 0.02 };

// ============ level switching, input, render loop ============
let level = 1, xrKind = null, zoom = 1;
function setLevel(n) {
  level = n;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', +b.dataset.level === n));
  $('dash').style.display = n === 1 ? 'block' : 'none';
  $('stage').style.display = n === 2 || n === 3 ? 'block' : 'none';
  $('about').style.display = n === 0 ? 'block' : 'none';
  if (n !== 1) { $('storyBar').style.display = 'none'; $('tip').style.display = 'none'; }
  const hints = { 2: 'Drag to turn the model · pinch to zoom', 3: 'Drag to look around · tap a panel' };
  $('hint').textContent = hints[n] || '';
  zoom = 1;
  if (n === 1) requestAnimationFrame(() => renderAll());
  if (n === 2) { drawGaugePanel(); renderLevel2(); }
  if (n === 3) { redrawWall(); renderLevel3(); if (l3mode === 'wall') { look3.pitchT = portrait() ? -0.16 : 0.02; } }
  resize();
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLevel(+b.dataset.level); });
import('./data.js').then(D => D.onTick(() => { if (level === 3) redrawWall(); if (level === 2) drawGaugePanel(); }));

const pointers = new Map(); let downPos = null, pinchStart = 0, zoomStart = 1;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downPos = pointers.size === 1 ? { moved: 0 } : null;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); zoomStart = zoom; } });
canvas.addEventListener('pointermove', e => { const prev = pointers.get(e.pointerId); if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinchStart) zoom = THREE.MathUtils.clamp(zoomStart * pinchStart / d, 0.5, 1.8); return; }
  if (downPos) downPos.moved += Math.abs(dx) + Math.abs(dy);
  if (level === 2) s2Spin += dx * 0.01;
  if (level === 3) { look3.yawT -= dx * 0.005; look3.pitchT = THREE.MathUtils.clamp(look3.pitchT - dy * 0.004, -0.9, 0.8); } });
const endPointer = e => { pointers.delete(e.pointerId); if (downPos && downPos.moved < 8 && e.type === 'pointerup') tap(e); downPos = null; if (pointers.size < 2) pinchStart = 0; };
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * (1 + e.deltaY * 0.001), 0.5, 1.8); }, { passive: false });
const screenRay = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tap(e) { if (level !== 3) return; const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); screenRay.setFromCamera(ndc, camera);
  const hit = screenRay.intersectObjects(pickables3(), false)[0]; if (hit) pick3(hit.object); }

const clock3 = new THREE.Clock();
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(clock3.getDelta(), 0.1), k = 1 - Math.pow(0.001, dt);
  if (xrKind === 'ar') {
    if (frame && hitSource) { const res = frame.getHitTestResults(hitSource);
      if (res.length) { reticle.visible = true; reticle.matrix.fromArray(res[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix); } else reticle.visible = false; }
    animateChart(chart2, k); renderer.render(s2, camera); return;
  }
  if (xrKind === 'vr') { animate3(k); renderer.render(s3, camera); return; }
  if (level === 2) {
    animateChart(chart2, k); chart2.group.rotation.y += (s2Spin - chart2.group.rotation.y) * k;
    gaugePanel.lookAt(camera.position);
    camera.fov = 50; camera.updateProjectionMatrix();
    camera.position.set(0, 0.5 * zoom, 0.95 * zoom); camera.lookAt(0, 0.16, 0); renderer.render(s2, camera);
  } else if (level === 3) {
    animate3(k);
    look3.yaw += (look3.yawT - look3.yaw) * k; look3.pitch += (look3.pitchT - look3.pitch) * k;
    camera.position.set(0, 1.6, 0); camera.rotation.set(look3.pitch, -look3.yaw, 0, 'YXZ');
    const vf = 2 * Math.atan(Math.tan(Math.PI / 4) / camera.aspect) * 180 / Math.PI;
    const fov = THREE.MathUtils.clamp(Math.max(vf, 62) * zoom, 35, camera.aspect < 1 ? 78 : 105); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    renderer.render(s3, camera);
  }
});
function animate3(k) {
  cards.forEach(c => { const tg = c.selected ? c.target.clone().multiplyScalar(0.9).setY(c.target.y + 0.05) : c.target; c.mesh.position.lerp(tg, k); faceCentre(c.mesh, c.mesh.position.y); });
  wallPanels.forEach(p => { p.mesh.position.lerp(p.target, k); p.scale += (p.targetScale - p.scale) * k; p.mesh.scale.setScalar(p.scale); faceCentre(p.mesh, p.mesh.position.y);
    p.mesh.renderOrder = p === focused ? 10 : 0; });
}

// ---------- Guide ----------
$('about').innerHTML = `
<h2>How to use this lab</h2>
<p>This app supports Day 3 of <i>Data Visualisation &amp; Storytelling</i>. It presents one project-portfolio data story at three levels of interactivity and immersion. All figures are <b>practice data</b> for a fictional company, ${COMPANY}. The live feed is simulated.</p>
<h3>Install it like an app</h3>
<ul><li><b>Android (Chrome):</b> menu ⋮ → <i>Add to Home screen</i> or <i>Install app</i>.</li><li><b>iPhone / iPad (Safari):</b> Share → <i>Add to Home Screen</i>.</li><li><b>Windows / Mac (Chrome or Edge):</b> the install icon in the address bar.</li></ul>
<h3>The three levels</h3>
<table><tr><th>Level</th><th>What you do</th><th>Works on</th></tr>
<tr><td>1 · Interactive dashboard</td><td>KPIs, gauges, S-curves, bubble matrix, donut, risk heat map, live site feed and a sortable register. Filter by sector, region or status; hover or tap any chart; open any project for a full drill-down. Press <i>Play the data story</i> for a guided five-step narrative.</td><td>Any device</td></tr>
<tr><td>2 · AR on your desk</td><td>Place a 3D model of the portfolio, with a live gauge panel, on a real desk and walk around it.</td><td>Android Chrome (live AR); iPhone/iPad (Apple AR viewer, fixed model)</td></tr>
<tr><td>3 · Immersive wall</td><td>Twelve live panels surround you; pull any panel closer. Then try the sorting activity: compute CPI and group the projects in space.</td><td>Any device (drag to look); full VR in a headset browser such as Meta Quest</td></tr></table>
<h3>Key terms</h3>
<table><tr><td>BAC</td><td>Budget at completion</td></tr><tr><td>PV</td><td>Planned value: budgeted cost of work scheduled to date</td></tr><tr><td>EV</td><td>Earned value: budgeted cost of work actually done (BAC × % complete)</td></tr>
<tr><td>AC</td><td>Actual cost to date</td></tr><tr><td>CPI</td><td>Cost performance index = EV ÷ AC (below 1 = over budget)</td></tr><tr><td>SPI</td><td>Schedule performance index = EV ÷ PV (below 1 = behind schedule)</td></tr>
<tr><td>EAC</td><td>Estimate at completion = BAC ÷ CPI</td></tr><tr><td>TRIR</td><td>Total recordable incident rate = recordable injuries × 200,000 ÷ man-hours</td></tr><tr><td>NCR / RFI</td><td>Non-conformance report / request for information</td></tr></table>
<h3>Reflection questions</h3>
<ol><li>Which level helped you <i>find</i> the problem fastest? Which helped you <i>explain</i> it best?</li><li>In the story, step 4: why is the sorted bar easier to rank than the donut?</li>
<li>On the immersive wall, did seeing all panels at once change what you noticed? What did you miss?</li><li>For your own job, which level is worth the extra effort, and for which audience?</li></ol>
<p class="muted small">Practice data only. Not real projects, companies or figures.</p>`;

setLevel(1);
window.__lab = { makeUSDZ, pick3, cards, banners, checkGroups, setL3Mode, wallPanels };   // used by automated tests only
