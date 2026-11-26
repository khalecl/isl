import { PAL, TH, SETTINGS, HOLO, wallGlass, withGlass, onTheme, applyTheme, PALETTES } from './palette.js';
// Level 2: augmented reality.
//  • Camera AR (all phones): live camera feed + gyroscope; the dashboard floats in your room as holograms.
//  • Desk AR (Android Chrome, WebXR): place a model on a real surface; tap bars for details.
//  • Apple 3D viewer (iPhone): static model via Quick Look.
import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { PROJECTS, T, bandColor, bandLabel, curCPI, curSPI, money, fmt, byId } from './data.js';
import { PANELS, ctxFor } from './panels.js';
import * as C from './charts.js';

const $ = id => document.getElementById(id);
let D;                                   // deps from app.js
const s2 = new THREE.Scene();
const bgColor = new THREE.Color(0x0a0e26);
const holo = new THREE.Group();          // everything in camera-AR / preview mode (user at origin)
const desk = new THREE.Group();          // small model for WebXR surface placement
let metric = 'budget', selected = null, focus = [], insightIdx = -1;
let camMode = false, gyro = null, gyroOK = false, videoStream = null, xrSession = null, hitSource = null, placed = false;
const look = { yaw: 0, pitch: -0.12, yawT: 0, pitchT: -0.12 };
const qTarget = new THREE.Quaternion();

const METRICS = {
  budget: { label: 'Budget', h: p => p.bac / maxBac, v: p => money(p.bac, 0), c: p => bandColor(p.band), note: 'Bar height = budget (BAC). Colour = cost health.' },
  overrun: { label: 'Overrun', h: p => Math.max(0.02, (p.bac / curCPI(p) - p.bac) / maxOver), v: p => { const o = p.bac / curCPI(p) - p.bac; return (o > 0 ? '+' : '') + fmt(o) + 'M'; }, c: p => (p.bac / curCPI(p) - p.bac) > 0 ? bandColor(p.band) : bandColor('ok'), note: 'Bar height = forecast overrun at completion.' },
  cpi: { label: 'CPI', h: p => Math.max(0.03, (curCPI(p) - 0.7) / 0.42), v: p => curCPI(p).toFixed(2), c: p => bandColor(p.band), note: 'Bar height = cost performance index (EV ÷ AC). Taller is healthier.' },
  crew: { label: 'Crew (live)', h: p => p.live.crew / maxCrew(), v: p => String(p.live.crew), c: () => '#a78bfa', note: 'Bar height = crew on site right now. Watch it move with the live feed.' },
};
const maxBac = Math.max(...PROJECTS.map(p => p.bac)), maxOver = Math.max(...PROJECTS.map(p => p.overrun));
const maxCrew = () => Math.max(...PROJECTS.map(p => p.live.crew)) * 1.1;
const top3 = [...PROJECTS].sort((a, b) => b.overrun - a.overrun).slice(0, 3).map(p => p.id);
const INSIGHTS = [
  { m: 'overrun', f: top3, t: `Three projects, ${top3.join(', ')}, cause about two-thirds of all forecast overruns. Tap each one to see why.` },
  { m: 'budget', f: ['P04', 'P02'], t: 'Big is not the same as bad: P04 is one of the largest budgets yet under budget (green); P02 is the largest and at risk (red).' },
  { m: 'cpi', f: PROJECTS.filter(p => p.band === 'risk').map(p => p.id), t: `${PROJECTS.filter(p => p.band === 'risk').length} projects have CPI below 0.85: every dollar spent earns less than 85 cents of work.` },
  { m: 'crew', f: [], t: 'Live view: crew on site now. Bars move with the simulated site feed every few seconds.' },
];

// ---------- 3D bar chart with value labels ----------
function valueTexture(id, val, col) {
  return D.textTexture((g, w, h) => { g.fillStyle = 'rgba(8,12,30,0.82)'; D.roundRect(g, 4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = col; g.lineWidth = 6; g.stroke(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 70px system-ui, Arial'; g.fillText(id, w / 2, h * 0.32); g.font = '600 62px system-ui, Arial'; g.fillStyle = '#cfe6ff'; g.fillText(val, w / 2, h * 0.72); }, 320, 220);
}
function buildChart() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.04, 2.0), baseMat);
  base.position.y = -0.02; group.add(base);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.7, 0.04, 2.0)), edgeMat);
  edge.position.y = -0.02; group.add(edge);
  const bars = PROJECTS.map((p, i) => {
    const col = i % 4, row = Math.floor(i / 4), x = -0.9 + col * 0.6, z = -0.6 + row * 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), new THREE.MeshStandardMaterial({ color: bandColor(p.band), roughness: 0.35, metalness: 0.1, transparent: true, emissive: 0x000000 }));
    mesh.geometry.translate(0, 0.5, 0); mesh.position.set(x, 0, z); mesh.scale.y = 0.01; mesh.userData = { kind: 'bar', id: p.id }; group.add(mesh);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: valueTexture(p.id, '', '#38bdf8'), transparent: true, depthTest: false }));
    label.scale.set(0.32, 0.22, 1); label.renderOrder = 5; label.userData = { kind: 'label', id: p.id }; label.position.set(x, 0.2, z); group.add(label);
    return { p, mesh, label, h: 0.01, targetH: 0.01, col: new THREE.Color(), op: 1, targetOp: 1 };
  });
  return { group, bars };
}
const charts = [];
const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b2a6b, transparent: true, opacity: 0.55, roughness: 0.3 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 }), ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
export function restyle() { const S = HOLO[SETTINGS.holo]; baseMat.color.set(S.base); edgeMat.color.set(S.accent); ringMat.color.set(S.accent);
  bgColor.set(SETTINGS.mode === 'light' ? 0xdfe6f3 : 0x0a0e26); if (charts.length) { applyMetric(); redrawPanels(); } }
function applyMetric() {
  const M = METRICS[metric];
  charts.forEach(ch => ch.bars.forEach(b => {
    b.targetH = Math.min(1.5, M.h(b.p) * 1.4); b.col.set(M.c(b.p)); b.mesh.material.color.copy(b.col);
    b.targetOp = focus.length && !focus.includes(b.p.id) ? 0.22 : 1;
    b.label.material.map?.dispose(); b.label.material.map = valueTexture(b.p.id, M.v(b.p), M.c(b.p));
    const sel = selected === b.p.id; if (sel) b.mesh.material.emissive.copy(b.col).multiplyScalar(0.45); else b.mesh.material.emissive.set(0x000000); b.mesh.scale.x = b.mesh.scale.z = sel ? 1.18 : 1;
  }));
  document.querySelectorAll('#arUI .seg button').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
}
function animateCharts(k) { charts.forEach(ch => ch.bars.forEach(b => { b.h += (b.targetH - b.h) * k; b.mesh.scale.y = b.h; b.op += (b.targetOp - b.op) * k;
  b.mesh.material.opacity = b.op; b.mesh.material.depthWrite = b.op > 0.9; b.label.material.opacity = Math.max(0.25, b.op); b.label.position.y = b.h + 0.2; })); }

// ---------- holographic panels ----------
function makePanel(id, w, h, res = [1024, 640]) {
  const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = res;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, side: THREE.DoubleSide }));
  mesh.userData = { kind: 'panel', id }; return { id, mesh, canvas, tex };
}
const holoPanels = [];
let detailPanel;                          // floating project card next to the chart
function drawDetail(p) {
  const c = detailPanel.canvas, g = c.getContext('2d'), w = c.width, h = c.height; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  const S = HOLO[SETTINGS.holo]; const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, S.a); grad.addColorStop(1, S.b);
  g.fillStyle = grad; D.roundRect(g, 3, 3, w - 6, h - 6, 34); g.fill(); g.strokeStyle = bandColor(p.band); g.lineWidth = 6; g.stroke();
  g.fillStyle = S.muted; g.font = '28px system-ui, Arial'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(`${p.sector} · ${p.region} · PM ${p.pm}`, 30, 26);
  g.fillStyle = S.text; g.font = 'bold 44px system-ui, Arial'; g.fillText(`${p.id} · ${p.name}`, 30, 62);
  g.fillStyle = bandColor(p.band); D.roundRect(g, w - 210, 26, 180, 50, 25); g.fill(); g.fillStyle = '#081019'; g.font = 'bold 28px system-ui'; g.textAlign = 'center'; g.fillText(bandLabel(p.band), w - 120, 37);
  const cpi = curCPI(p), spi = curSPI(p), ev = p.ev + p.live.evDelta, ac = p.ac + p.live.acDelta;
  const rows = [['Budget', money(p.bac, 0)], ['Earned value', money(ev)], ['Actual cost', money(ac)], ['Forecast (EAC)', money(p.bac / cpi)], ['Forecast finish', `${p.slip > 0 ? '+' + p.slip + ' mo late' : 'on time'}`], ['Crew on site', String(p.live.crew)]];
  g.textAlign = 'left'; rows.forEach(([k, v], i) => { const x = 30 + (i % 2) * 330, y = 140 + Math.floor(i / 2) * 70;
    g.fillStyle = S.muted; g.font = '24px system-ui'; g.fillText(k, x, y); g.fillStyle = S.text; g.font = 'bold 34px system-ui'; g.fillText(v, x, y + 28); });
  const bands = [[0.6, 0.85, PAL.risk], [0.85, 0.95, PAL.watch], [0.95, 1.2, PAL.ok]];
  g.save(); g.translate(690, 120); g.scale(1.6, 1.6); withGlass(S, () => C.gauge(g, 190, 150, { value: cpi, label: 'CPI', bands, min: 0.6, max: 1.2, target: 1 })); g.restore();
  g.save(); g.translate(690, 360); g.scale(1.6, 1.6); withGlass(S, () => C.gauge(g, 190, 150, { value: spi, label: 'SPI', bands, min: 0.6, max: 1.2, target: 1 })); g.restore();
  g.save(); g.translate(30, 360); g.scale(2, 2); withGlass(S, () => C.lineChart(g, 320, 125, { labels: p.cpiTrend.map((_, i) => ''), legend: false, yFmt: v => v.toFixed(2),
    series: [{ name: 'CPI', color: bandColor(p.band), values: p.cpiTrend, fill: true }, { name: 't', color: 'rgba(255,255,255,.4)', values: p.cpiTrend.map(() => 1), dashed: true, hideLegend: true }] })); g.restore();
  g.fillStyle = S.muted; g.font = '24px system-ui'; g.fillText('CPI trend, last 12 months', 30, 338);
  detailPanel.tex.needsUpdate = true;
}
function redrawPanels(only) { const ctx = ctxFor(PROJECTS); holoPanels.forEach(p => { if (only && p.id !== only) return; D.drawGlassPanel(p.canvas, p.id, ctx, HOLO[SETTINGS.holo]); p.tex.needsUpdate = true; });
  if (selected && detailPanel.mesh.visible) drawDetail(byId[selected]); }

// ---------- build scene ----------
export function initAR(deps) {
  D = deps;
  s2.add(new THREE.HemisphereLight(0xffffff, 0x334466, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 3, 2); s2.add(dl);
  s2.add(holo); s2.add(desk);
  // centre: chart below eye level, ~1.7 m ahead
  const hc = buildChart(); hc.group.scale.setScalar(0.42); hc.group.position.set(0, -0.62, -1.95); hc.group.rotation.x = 0.12; holo.add(hc.group); charts.push(hc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.78, 64).rotateX(-Math.PI / 2), ringMat);
  ring.position.set(0, -0.66, -1.95); holo.add(ring);
  const P = (id, ang, y, r, w = 0.92, h = 0.575) => { const p = makePanel(id, w, h); p.home = new THREE.Vector3(Math.sin(ang) * r, y, -Math.cos(ang) * r);
    p.mesh.position.copy(p.home); p.mesh.lookAt(0, y, 0); p.target = p.home.clone(); p.s = 1; p.sT = 1; holo.add(p.mesh); holoPanels.push(p); };
  P('gauges', 0, 0.3, 2.05, 0.95, 0.5);
  P('kpis', -0.62, 0.02, 1.9); P('overrun', 0.62, 0.02, 1.9);
  P('scurve', -1.22, 0.02, 1.9); P('matrix', 1.22, 0.02, 1.9);
  P('live', -1.85, 0.02, 1.9); P('risk', 1.85, 0.02, 1.9);
  P('alerts', Math.PI - 0.55, 0.02, 1.9); P('clock', Math.PI, 0.02, 1.9, 0.8, 0.5); P('hse', Math.PI + 0.55, 0.02, 1.9);
  detailPanel = makePanel('detail', 0.82, 0.512); detailPanel.mesh.userData = { kind: 'detail' };
  detailPanel.mesh.position.set(0.68, -0.22, -1.4); detailPanel.mesh.lookAt(0, -0.28, 0); detailPanel.mesh.visible = false; holo.add(detailPanel.mesh);
  // desk model for WebXR surface AR
  const dc = buildChart(); dc.group.scale.setScalar(0.16); desk.add(dc.group); charts.push(dc);
  const dg = makePanel('gauges', 0.42, 0.22); dg.home = new THREE.Vector3(0, 0.4, -0.16); dg.mesh.position.copy(dg.home); dg.target = dg.home.clone(); dg.s = dg.sT = 1; dg.desk = true; desk.add(dg.mesh); holoPanels.push(dg);
  desk.visible = false;
  applyMetric(); redrawPanels();
  buildUI();
  // input: WebXR screen taps arrive as controller 0 'select'
  const ctrl = D.renderer.xr.getController(0); s2.add(ctrl);
  ctrl.addEventListener('select', () => { if (!xrSession) return;
    const m = new THREE.Matrix4().extractRotation(ctrl.matrixWorld), ray = new THREE.Raycaster();
    ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
    const hit = placed && ray.intersectObjects(charts[1].bars.map(b => b.mesh), false)[0];
    if (hit) return selectProject(hit.object.userData.id);
    if (D.reticle.visible) { desk.position.setFromMatrixPosition(D.reticle.matrix); const cam = new THREE.Vector3().setFromMatrixPosition(D.renderer.xr.getCamera().matrixWorld);
      desk.rotation.y = Math.atan2(cam.x - desk.position.x, cam.z - desk.position.z); desk.visible = true; placed = true; hint('Tap a bar for its details · tap the floor to move the model'); } });
}

// ---------- on-screen UI ----------
function buildUI() {
  const ui = $('arUI');
  ui.innerHTML = `
    <div class="arTop"><button class="btn primary" id="arStart">📷 Start camera AR</button><button class="btn" id="arExit">✕ Exit AR</button><button class="btn" id="arRecenter">⟲</button>
      <button class="btn" id="arDesk">Table AR</button><button class="btn" id="arQL">Static 3D (Apple)</button><span class="arLive"><span class="live-dot"></span>LIVE <span id="arClock"></span></span></div>
    <div class="seg">${Object.entries(METRICS).map(([k, m]) => `<button data-m="${k}">${m.label}</button>`).join('')}</div>
    <div class="arHint" id="arHint"></div>
    <div class="arCard" id="arCard"></div>`;
  ui.querySelectorAll('button').forEach(b => b.addEventListener('beforexrselect', e => e.preventDefault()));
  ui.addEventListener('beforexrselect', e => { if (e.target.closest('button,.arCard')) e.preventDefault(); });
  ui.querySelector('.seg').onclick = e => { const m = e.target.dataset.m; if (!m) return; metric = m; focus = []; insightIdx = -1; applyMetric(); showNote(); };
  $('arExit').onclick = () => exitAR();
  $('arRecenter').onclick = () => recenter();
  $('arStart').onclick = () => startCameraAR();
  $('arDesk').onclick = () => startDeskAR();
  $('arQL').onclick = () => openQuickLook();
  updateTop(); showNote();
}
let flags = { ar: false, ql: false }, intro = true;
function updateTop() { const on = camMode || !!xrSession;
  $('arStart').style.display = on ? 'none' : ''; $('arExit').style.display = on ? '' : 'none';
  $('arDesk').style.display = !on && flags.ar ? '' : 'none'; $('arQL').style.display = !on && flags.ql ? '' : 'none'; }
function hint(t) { $('arHint').textContent = t; $('arHint').style.display = t ? 'block' : 'none'; }
function showNote() {
  if (selected) return showCard(byId[selected]);
  if (intro && !camMode && !xrSession) { $('arCard').innerHTML = `<div class="arNote"><b>Augmented reality: the dashboard in your room.</b> Press <b>📷 Start camera AR</b>, hold your phone up and turn around: the panels float in your room and the bars stand in front of you. Right now you are in preview: drag to look around, tap a bar or a panel, switch the metric above.</div>
    <div class="row"><button class="btn primary" id="arInsight">▶ Show insights</button><button class="btn" id="arIntroOk">OK</button></div>`;
    $('arIntroOk').onclick = () => { intro = false; showNote(); }; $('arInsight').onclick = () => { intro = false; insightIdx = 0; metric = INSIGHTS[0].m; focus = INSIGHTS[0].f; applyMetric(); showNote(); }; return; }
  $('arCard').innerHTML = `<div class="arNote">${insightIdx >= 0 ? `<b>Insight ${insightIdx + 1}/${INSIGHTS.length}.</b> ${INSIGHTS[insightIdx].t}` : METRICS[metric].note + ' Tap any bar or panel.'}</div>
    <div class="row"><button class="btn primary" id="arInsight">${insightIdx >= 0 && insightIdx < INSIGHTS.length - 1 ? 'Next insight ▶' : insightIdx === INSIGHTS.length - 1 ? 'Clear' : '▶ Show insights'}</button></div>`;
  $('arInsight').onclick = () => { insightIdx = insightIdx >= INSIGHTS.length - 1 ? -1 : insightIdx + 1;
    if (insightIdx >= 0) { metric = INSIGHTS[insightIdx].m; focus = INSIGHTS[insightIdx].f; } else focus = [];
    applyMetric(); showNote(); };
}
function showCard(p) {
  const cpi = curCPI(p);
  $('arCard').innerHTML = `<div class="arNote"><b>${p.id} · ${p.name}</b> <span class="pill" style="background:${bandColor(p.band)}">${bandLabel(p.band)}</span><br>
    CPI <b>${cpi.toFixed(2)}</b> · SPI <b>${curSPI(p).toFixed(2)}</b> · Forecast overrun <b>${money(p.bac / cpi - p.bac)}</b> · Crew <b>${p.live.crew}</b><br>
    <span class="muted small">Top risk: ${p.risks[0]?.title || '—'}</span></div>
    <div class="row"><button class="btn primary" id="arFull">Open full details</button><button class="btn" id="arDesel">Close</button></div>`;
  $('arFull').onclick = () => { exitAR(); D.openFull(p.id); };
  $('arDesel').onclick = () => selectProject(null);
}
function selectProject(id) {
  intro = false;
  selected = selected === id ? null : id;
  if (selected) { drawDetail(byId[selected]); if (!xrSession) detailPanel.mesh.visible = true; } else detailPanel.mesh.visible = false;
  applyMetric(); showNote();
}

// ---------- camera AR (getUserMedia + gyroscope) ----------
const euler = new THREE.Euler(), zee = new THREE.Vector3(0, 0, 1), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function onOrient(e) { if (e.beta == null) return; gyroOK = true;
  const orient = THREE.MathUtils.degToRad(screen.orientation?.angle ?? window.orientation ?? 0);
  euler.set(THREE.MathUtils.degToRad(e.beta), THREE.MathUtils.degToRad(e.alpha || 0), -THREE.MathUtils.degToRad(e.gamma), 'YXZ');
  qTarget.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
  if (gyro === 'pending') { gyro = 'on'; D.camera.quaternion.copy(qTarget); recenter(); } }
function recenter() {
  if (gyro === 'on') { const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(qTarget); holo.rotation.y = Math.atan2(-dir.x, -dir.z); }
  else { look.yawT = 0; look.pitchT = -0.12; }
}
export async function startCameraAR() {
  // iOS needs permission for motion sensors, requested inside the tap
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw 0; } } catch { }
  gyro = 'pending'; addEventListener('deviceorientation', onOrient);
  try { videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const v = $('camVideo'); v.srcObject = videoStream; v.style.display = 'block'; await v.play().catch(() => {}); }
  catch (e) { hint('Camera not available: showing holograms on a dark background. ' + (e?.name === 'NotAllowedError' ? 'Allow camera access to see your room.' : '')); }
  camMode = true; document.body.classList.add('ar-on'); updateTop(); D.resize();
  setTimeout(() => { if (!gyroOK) { gyro = null; hint('No motion sensor found: drag to look around.'); } else if (!$('arHint').textContent) hint('Turn around: the dashboard surrounds you. Tap a bar or panel.'); }, 1200);
  hint('Hold your phone up and turn slowly. Tap a bar or a panel.');
}
export async function startDeskAR() {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: $('arUI') } });
    D.renderer.xr.setReferenceSpaceType('local'); await D.renderer.xr.setSession(xrSession);
    holo.visible = false; desk.visible = false; placed = false; detailPanel.mesh.visible = false;
    updateTop(); hint('Move your phone over a table. When the blue ring appears, tap to place the model.');
    hitSource = await xrSession.requestHitTestSource({ space: await xrSession.requestReferenceSpace('viewer') });
    xrSession.addEventListener('end', () => { xrSession = null; hitSource = null; D.reticle.visible = false; holo.visible = true; desk.visible = false; updateTop(); hint(''); D.resize(); });
  } catch (e) { hint('Could not start table AR on this device. ' + (e?.message || '')); }
}
export function exitAR() {
  if (xrSession) { xrSession.end(); return; }
  removeEventListener('deviceorientation', onOrient); gyro = null; gyroOK = false;
  videoStream?.getTracks().forEach(t => t.stop()); videoStream = null; $('camVideo').style.display = 'none';
  camMode = false; document.body.classList.remove('ar-on'); updateTop(); hint(''); holo.rotation.y = 0; D.camera.quaternion.identity(); recenter(); D.resize();
}
// Apple Quick Look only renders MeshStandardMaterial, so every label and panel uses it (with an emissive map so it glows).
const qlMat = tex => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, roughness: 1, metalness: 0, transparent: true });
function qlPanel(id, w, h, res = [1024, 640]) { const c = document.createElement('canvas'); [c.width, c.height] = res; D.drawGlassPanel(c, id, ctxFor(PROJECTS), HOLO[SETTINGS.holo]);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), qlMat(t)); }
export async function makeUSDZ() {
  const tmp = buildChart(); const M = METRICS[metric];
  tmp.group.children.filter(o => o.isLineSegments).forEach(o => tmp.group.remove(o));
  tmp.bars.forEach(b => { b.mesh.scale.y = Math.min(1.5, M.h(b.p) * 1.4); b.mesh.material.color.set(M.c(b.p)); b.mesh.material.transparent = false; b.mesh.material.opacity = 1; tmp.group.remove(b.label);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.27), qlMat(valueTexture(b.p.id, M.v(b.p), M.c(b.p))));
    lab.position.set(b.mesh.position.x, b.mesh.scale.y + 0.2, b.mesh.position.z); tmp.group.add(lab); });
  // a small dashboard around the model: gauges behind, KPIs left, overrun ranking right, title in front
  const g = qlPanel('gauges', 2.6, 1.32, [1024, 520]); g.position.set(0, 2.35, -1.1); tmp.group.add(g);
  const k = qlPanel('kpis', 2.4, 1.5); k.position.set(-2.6, 1.0, -0.3); k.rotation.y = 0.6; tmp.group.add(k);
  const o = qlPanel('overrun', 2.4, 1.5); o.position.set(2.6, 1.0, -0.3); o.rotation.y = -0.6; tmp.group.add(o);
  const tt = D.textTexture((gg, w, h) => { gg.fillStyle = 'rgba(10,14,40,0.9)'; D.roundRect(gg, 4, 4, w - 8, h - 8, 30); gg.fill(); gg.fillStyle = '#fff'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    gg.font = 'bold 54px system-ui, Arial'; gg.fillText(`Atlas Projects Group · ${M.label}`, w / 2, h * 0.4); gg.font = '34px system-ui, Arial'; gg.fillStyle = PAL.watch; gg.fillText('Practice data for training', w / 2, h * 0.75); }, 1024, 180);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), qlMat(tt)); title.position.set(0, 0.25, 1.25); title.rotation.x = -0.5; tmp.group.add(title);
  tmp.group.scale.setScalar(0.16); const holder = new THREE.Scene(); holder.add(tmp.group); holder.updateMatrixWorld(true);
  return new USDZExporter().parseAsync(holder, { quickLookCompatible: true });
}
async function openQuickLook() {
  const data = await makeUSDZ(), url = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
  const a = document.createElement('a'); a.rel = 'ar'; a.href = url + '#allowsContentScaling=1'; a.appendChild(document.createElement('img')); document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
}

// ---------- entering the Level 2 tab ----------
export function renderLevel2(supportsAR, supportsQuickLook) {
  flags = { ar: supportsAR, ql: supportsQuickLook }; updateTop(); showNote();
}
// ---------- per-frame / input hooks called by app.js ----------
export const isCamMode = () => camMode;
export function drag(dx, dy) { if (gyro === 'on') return; look.yawT -= dx * 0.005; look.pitchT = THREE.MathUtils.clamp(look.pitchT + dy * 0.004, -1, 0.9); }
export function tap(ndc) {
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, D.camera); ray.camera = D.camera;
  const objs = [...charts[0].bars.flatMap(b => [b.mesh, b.label]), ...holoPanels.filter(p => !p.desk).map(p => p.mesh), detailPanel.mesh];
  const hit = ray.intersectObjects(objs, false)[0]; if (!hit) return;
  const u = hit.object.userData;
  if (u.kind === 'bar' || u.kind === 'label') return selectProject(u.id);
  if (u.kind === 'detail') return selectProject(null);
  if (u.kind === 'panel') { const p = holoPanels.find(x => x.mesh === hit.object);
    holoPanels.forEach(x => { if (x !== p) { x.target = x.home.clone(); x.sT = 1; } });
    const near = p.target.distanceTo(p.home) > 0.01; p.target = near ? p.home.clone() : p.home.clone().multiplyScalar(0.55); p.sT = 1;
    hint(near ? '' : `${PANELS[p.id].title}: tap again to send it back.`); }
}
export function render(k, frame) {
  animateCharts(k);
  holoPanels.forEach(p => { p.mesh.position.lerp(p.target, k); if (!p.desk) p.mesh.lookAt(0, p.mesh.position.y, 0); });
  if (selected) detailPanel.mesh.lookAt(0, detailPanel.mesh.position.y, 0);
  const cam = D.camera;
  if (xrSession) {
    if (frame && hitSource) { const res = frame.getHitTestResults(hitSource);
      if (res.length) { D.reticle.visible = true; D.reticle.matrix.fromArray(res[0].getPose(D.renderer.xr.getReferenceSpace()).transform.matrix); } else D.reticle.visible = false; }
    holoPanels.forEach(p => { if (p.desk) p.mesh.lookAt(D.renderer.xr.getCamera().position); });
    D.renderer.render(s2, cam); return;
  }
  cam.position.set(0, 0, 0);
  if (gyro === 'on') cam.quaternion.slerp(qTarget, 0.35);
  else { look.yaw += (look.yawT - look.yaw) * k; look.pitch += (look.pitchT - look.pitch) * k; cam.rotation.set(look.pitch, -look.yaw, 0, 'YXZ'); }
  const portrait = cam.aspect < 1, fov = (portrait ? 70 : 55) * D.getZoom();
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  s2.background = camMode && videoStream ? null : bgColor;
  D.renderer.render(s2, cam);
}

export function onTick() { if (metric === 'crew' || metric === 'cpi' || metric === 'overrun') applyMetric(); redrawPanels(); }
export function onSecond() { redrawPanels('clock'); const c = $('arClock'); if (c) c.textContent = new Date().toLocaleTimeString('en-GB'); }
export { s2 };
