// Digital Twin tab: two simulated assets with live sensors, 3D model, trends, alarms, what-if and QR tags.
// PRACTICE DATA — simplified physics for teaching, not an engineering model.
import * as THREE from 'three';
import * as C from './charts.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = s => (Math.random() - 0.5) * 2 * s;
const PRICE = 0.12;                       // USD per kWh (practice value)

// ---------- asset definitions ----------
const ASSETS = {
  'M-101': {
    id: 'M-101', name: 'Cooling-water pump motor', type: 'Induction motor + centrifugal pump', site: 'Atlas Plant · Pump house 1',
    rated: '160 kW · 400 V · 50 Hz · 1,485 rpm · IE3', installed: 'Mar 2019',
    st: { load: 0.78, ambient: 32, wear: 0.18, cooling: 1, hours: 41200, wT: 95, bT: 58 },
    sensors: [
      { k: 'power', l: 'Power', u: 'kW', d: 0, min: 0, max: 200, warn: 165, alarm: 180, part: 'stator' },
      { k: 'current', l: 'Current', u: 'A', d: 0, min: 0, max: 360, warn: 290, alarm: 315, part: 'stator' },
      { k: 'wT', l: 'Winding temp', u: '°C', d: 0, min: 20, max: 180, warn: 130, alarm: 150, part: 'stator' },
      { k: 'bT', l: 'Bearing temp (DE)', u: '°C', d: 0, min: 20, max: 120, warn: 85, alarm: 95, part: 'bearing' },
      { k: 'vib', l: 'Vibration', u: 'mm/s', d: 1, min: 0, max: 12, warn: 4.5, alarm: 7.1, part: 'bearing' },
      { k: 'speed', l: 'Speed', u: 'rpm', d: 0, min: 1400, max: 1500, part: 'shaft' },
      { k: 'flow', l: 'Flow', u: 'm³/h', d: 0, min: 0, max: 400, part: 'pump' },
      { k: 'eff', l: 'Efficiency', u: '%', d: 1, min: 80, max: 98, warn: 92, alarm: 90, low: true, part: 'stator' },
    ],
    model(st) {   // steady-state physics (simplified)
      const eff = 0.955 - 0.05 * Math.pow(1 - st.load, 3) - 0.015 * st.wear;
      const pOut = 160 * st.load, power = pOut / eff;
      return { power, current: power * 1000 / (Math.sqrt(3) * 400 * 0.86), eff: eff * 100,
        wT: st.ambient + 85 * st.load * st.load * (st.cooling ? 1 : 1.7) + 8,
        bT: st.ambient + 18 + 45 * st.wear + 6 * st.load,
        vib: 1.1 + 0.6 * st.load + 7.5 * Math.pow(st.wear, 1.6), speed: 1500 - 16 * st.load, flow: 340 * st.load };
    },
  },
  'G-201': {
    id: 'G-201', name: 'Standby diesel generator', type: 'Diesel engine + synchronous alternator', site: 'Atlas Plant · Emergency power',
    rated: '500 kVA · 400 kW (pf 0.8) · 400 V · 50 Hz', installed: 'Aug 2021',
    st: { load: 0.62, ambient: 32, wear: 0.12, cooling: 1, hours: 2350, wT: 88, bT: 82, fuel: 74 },
    sensors: [
      { k: 'power', l: 'Output', u: 'kW', d: 0, min: 0, max: 450, warn: 380, alarm: 410, part: 'alternator' },
      { k: 'freq', l: 'Frequency', u: 'Hz', d: 2, min: 48, max: 52, part: 'alternator' },
      { k: 'wT', l: 'Alternator temp', u: '°C', d: 0, min: 20, max: 180, warn: 135, alarm: 150, part: 'alternator' },
      { k: 'bT', l: 'Coolant temp', u: '°C', d: 0, min: 20, max: 120, warn: 98, alarm: 105, part: 'radiator' },
      { k: 'oilP', l: 'Oil pressure', u: 'bar', d: 1, min: 0, max: 7, warn: 2.5, alarm: 1.8, low: true, part: 'engine' },
      { k: 'vib', l: 'Vibration', u: 'mm/s', d: 1, min: 0, max: 20, warn: 11, alarm: 18, part: 'engine' },
      { k: 'fuelRate', l: 'Fuel use', u: 'L/h', d: 0, min: 0, max: 130, part: 'engine' },
      { k: 'fuel', l: 'Fuel level', u: '%', d: 0, min: 0, max: 100, warn: 30, alarm: 15, low: true, part: 'tank' },
    ],
    model(st) {
      const power = 400 * st.load;
      return { power, freq: 50 - 0.4 * st.load + 0.25, wT: st.ambient + 70 * st.load * st.load * (st.cooling ? 1 : 1.5) + 12,
        bT: 72 + 18 * st.load + (st.cooling ? 0 : 30) + 6 * st.wear, oilP: 5.2 - 2.8 * st.wear - 0.4 * st.load,
        vib: 4 + 3 * st.load + 12 * Math.pow(st.wear, 1.6), fuelRate: 8 + 0.24 * power, eff: 0 };
    },
  },
};
const statusOf = (s, v) => s.warn == null ? 'ok' : s.low ? (v <= s.alarm ? 'alarm' : v <= s.warn ? 'warn' : 'ok') : (v >= s.alarm ? 'alarm' : v >= s.warn ? 'warn' : 'ok');
const SC = { ok: '#2fbf7a', warn: '#f5a524', alarm: '#f0505a' };

// ---------- live simulation ----------
const HIST = 144;                           // 144 points = last 24 h at 10-min resolution (time is compressed: 1 tick = 10 min)
for (const a of Object.values(ASSETS)) {
  a.now = {}; a.hist = {}; a.alarms = []; a.prev = {};
  const m = a.model(a.st); a.sensors.forEach(s => { a.now[s.k] = a.st[s.k] ?? m[s.k]; a.hist[s.k] = []; });
  // synthetic history: daily load cycle
  for (let i = 0; i < HIST; i++) { const st = { ...a.st, load: clamp(a.st.load + 0.15 * Math.sin(i / HIST * Math.PI * 2 - 1), 0.2, 1) }; const mm = a.model(st);
    a.sensors.forEach(s => a.hist[s.k].push(s.k === 'fuel' ? a.st.fuel + (HIST - i) * 0.05 : mm[s.k] + rnd(s.max * 0.004))); }
}
function step(a) {
  const st = a.st, m = a.model(st);
  st.wT += (m.wT - st.wT) * 0.3; st.bT += (m.bT - st.bT) * 0.3;     // thermal lag
  st.hours += 1 / 6; st.wear = clamp(st.wear + (a.scenario === 'bearing' ? 0.04 : 0.00002), 0, 0.95);
  if (a.id === 'G-201') st.fuel = clamp(st.fuel - m.fuelRate / 1000 * 1.2, 0, 100);
  a.sensors.forEach(s => {
    let v = s.k === 'wT' ? st.wT : s.k === 'bT' ? st.bT : s.k === 'fuel' ? st.fuel : m[s.k];
    v += rnd((s.max - s.min) * 0.006); a.now[s.k] = v;
    a.hist[s.k].push(v); if (a.hist[s.k].length > HIST) a.hist[s.k].shift();
    const stt = statusOf(s, v), was = a.prev[s.k] || 'ok';
    if (stt !== was) a.alarms.unshift({ t: new Date(), lvl: stt, msg: stt === 'ok' ? `${s.l} back to normal (${v.toFixed(s.d)} ${s.u})` : `${s.l} ${stt === 'alarm' ? 'ALARM' : 'warning'}: ${v.toFixed(s.d)} ${s.u} (limit ${stt === 'alarm' ? s.alarm : s.warn})` });
    a.prev[s.k] = stt;
  });
  a.alarms.length = Math.min(a.alarms.length, 40);
}
function health(a) {
  let h = 100; a.sensors.forEach(s => { const t = statusOf(s, a.now[s.k]); h -= t === 'alarm' ? 25 : t === 'warn' ? 10 : 0; });
  return clamp(h - a.st.wear * 30, 0, 100);
}
// remaining useful life of the weakest part (illustrative): bearing/engine wear reaching 0.8
function rulDays(a, st = a.st) { const rate = a.scenario === 'bearing' && st === a.st ? 0.04 * 6 * 24 : 0.00002 * 6 * 24 * (0.6 + st.load);
  return Math.max(0, (0.8 - st.wear) / rate); }
const lifeTxt = d => d <= 0 ? '<span style="color:#f0505a">due now</span>' : d < 2 ? `${Math.round(d * 24)} hours` : `${Math.round(d)} days`;

// ---------- scenarios ----------
const SCEN = {
  normal: { l: 'Normal', f: a => { a.st.load = a.id === 'M-101' ? 0.78 : 0.62; a.st.cooling = 1; a.st.wear = Math.min(a.st.wear, a.id === 'M-101' ? 0.18 : 0.12); } },
  bearing: { l: a => a.id === 'M-101' ? 'Bearing wear' : 'Engine wear', f: () => {} },
  overload: { l: 'Overload', f: a => { a.st.load = 1.12; } },
  cooling: { l: a => a.id === 'M-101' ? 'Cooling fan failure' : 'Radiator blockage', f: a => { a.st.cooling = 0; } },
};

// ---------- 3D models ----------
let renderer, scene, camera, root, partMeshes = {}, shaft, cur = 'M-101', selPart = null;
const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.55 });
function addPart(g, name, mesh) { mesh.userData.part = name; (partMeshes[name] ||= []).push(mesh); g.add(mesh); return mesh; }
function buildMotor() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.0), mat(0x3a4256)); base.position.y = 0.06; g.add(base);
  const stator = addPart(g, 'stator', new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 40), mat(0x2f6fb0))); stator.rotation.z = Math.PI / 2; stator.position.set(-0.85, 0.62, 0);
  for (let i = 0; i < 14; i++) { const fin = addPart(g, 'stator', new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.02), mat(0x2f6fb0))); const a = i / 14 * Math.PI * 2; fin.position.set(-0.85, 0.62 + Math.cos(a) * 0.45, Math.sin(a) * 0.45); fin.rotation.x = -a; }
  const fan = addPart(g, 'fan', new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 32), mat(0x56607a))); fan.rotation.z = Math.PI / 2; fan.position.set(-1.63, 0.62, 0);
  const feet = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.8), mat(0x2b3245)); feet.position.set(-0.85, 0.2, 0); g.add(feet);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), mat(0x2b3245)); tb.position.set(-0.85, 1.1, 0); g.add(tb);
  const bearing = addPart(g, 'bearing', new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 28), mat(0x9aa4b8))); bearing.rotation.z = Math.PI / 2; bearing.position.set(-0.12, 0.62, 0);
  shaft = new THREE.Group(); shaft.position.set(0.25, 0.62, 0); g.add(shaft);
  const sh = addPart(shaft, 'shaft', new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16), mat(0xc9cfdb))); sh.rotation.z = Math.PI / 2;
  const coup = addPart(shaft, 'shaft', new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 6), mat(0xf5a524))); coup.rotation.z = Math.PI / 2;
  const pump = addPart(g, 'pump', new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 40), mat(0x3d8c6e))); pump.rotation.x = Math.PI / 2; pump.position.set(1.05, 0.68, 0);
  const vol = addPart(g, 'pump', new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 16, 40), mat(0x3d8c6e))); vol.position.set(1.05, 0.68, 0);
  const inlet = addPart(g, 'pump', new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 24), mat(0x6b7690))); inlet.rotation.z = Math.PI / 2; inlet.position.set(1.6, 0.68, 0);
  const outlet = addPart(g, 'pump', new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 24), mat(0x6b7690))); outlet.position.set(1.05, 1.4, 0);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), mat(0x2b3245)); pf.position.set(1.05, 0.25, 0); g.add(pf);
  return g;
}
function buildGenerator() {
  const g = new THREE.Group();
  const skid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.3), mat(0x3a4256)); skid.position.y = 0.08; g.add(skid);
  const tank = addPart(g, 'tank', new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 1.2), mat(0x4a5268))); tank.position.y = 0.29;
  const eng = addPart(g, 'engine', new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), mat(0xc0392b))); eng.position.set(-0.2, 0.9, 0);
  for (let i = 0; i < 6; i++) { const c = addPart(g, 'engine', new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.5), mat(0xa93226))); c.position.set(-0.8 + i * 0.24, 1.45, 0); }
  const rad = addPart(g, 'radiator', new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 1.1), mat(0x7f8ca8))); rad.position.set(-1.45, 1.0, 0);
  for (let i = 0; i < 10; i++) { const l = addPart(g, 'radiator', new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.03, 1.05), mat(0x56607a))); l.position.set(-1.45, 0.5 + i * 0.11, 0); }
  shaft = new THREE.Group(); shaft.position.set(0.75, 0.9, 0); g.add(shaft);
  const sh = addPart(shaft, 'alternator', new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 16), mat(0xc9cfdb))); sh.rotation.z = Math.PI / 2;
  const fl = addPart(shaft, 'alternator', new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), mat(0xf5a524))); fl.rotation.z = Math.PI / 2;
  const alt = addPart(g, 'alternator', new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.0, 40), mat(0x2f6fb0))); alt.rotation.z = Math.PI / 2; alt.position.set(1.35, 0.95, 0);
  const box = addPart(g, 'alternator', new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), mat(0x2b3245))); box.position.set(1.35, 1.55, 0);
  const ex = addPart(g, 'engine', new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16), mat(0x8a8f99))); ex.position.set(0.2, 1.9, 0.25);
  return g;
}
function setAsset3D(id) {
  if (root) scene.remove(root); partMeshes = {}; selPart = null;
  root = id === 'M-101' ? buildMotor() : buildGenerator(); scene.add(root);
}
function colourParts() {
  const a = ASSETS[cur];
  Object.entries(partMeshes).forEach(([part, meshes]) => {
    const ss = a.sensors.filter(s => s.part === part).map(s => statusOf(s, a.now[s.k]));
    const st = ss.includes('alarm') ? 'alarm' : ss.includes('warn') ? 'warn' : null;
    meshes.forEach(m => { m.material.emissive.set(st ? SC[st] : 0x000000); m.material.emissiveIntensity = st ? (st === 'alarm' ? 0.55 + 0.35 * Math.sin(Date.now() / 180) : 0.35) : 0;
      if (selPart === part) { m.material.emissive.set(0x38bdf8); m.material.emissiveIntensity = 0.45; } });
  });
}

// ---------- UI ----------
let yaw = -0.6, pitch = 0.35, dist = 5.2;
export function initTwin() {
  const el = $('twin');
  el.innerHTML = `
  <div class="toolbar">
    <div class="chips" id="tAssets">${Object.keys(ASSETS).map(k => `<span class="chip" data-a="${k}">${k} · ${ASSETS[k].name}</span>`).join('')}</div>
    <span id="tStatus"></span>
    <button class="btn" id="tQRbtn">▦ QR tag</button><button class="btn" id="tPrint">🖨 Print QR tags</button>
  </div>
  <div class="grid">
    <section class="panel g-8"><h3 id="t3dTitle">3D twin</h3><div class="cv" style="height:340px" id="t3d"><div class="twinHint">Drag to rotate · tap a part · coloured glow = warning / alarm</div><div class="partCard" id="tPart"></div></div></section>
    <section class="panel g-4"><h3>Asset & health</h3><div id="tInfo"></div><div class="cv" style="height:150px"><canvas id="tHealth"></canvas></div></section>
    <section class="panel g-12"><h3>Live sensors <span class="muted">· simulated feed, 1 update = 10 min of plant time</span></h3><div class="gaugeRow" id="tGauges"></div></section>
    <section class="panel g-8"><h3>Last 24 hours <select id="tTrendSel"></select></h3><div class="cv" style="height:230px"><canvas id="tTrend"></canvas></div></section>
    <section class="panel g-4"><h3>Alarms & events</h3><div id="tAlarms" class="alarmList"></div></section>
    <section class="panel g-6"><h3>What-if: test a decision on the twin before doing it on the real asset</h3><div id="tWhat"></div></section>
    <section class="panel g-6"><h3>Trainer scenarios</h3><p class="muted small" style="margin:0 0 8px">Inject a fault and watch the twin react. Then ask the class: what would you do, and which data told you?</p><div class="row" id="tScen"></div><div id="tScenNote" class="small" style="margin-top:8px"></div></section>
  </div>
  <div id="qrModal"><div class="qrBox" id="qrBox"></div></div>
  <p class="foot">Practice data. Simulated sensors and simplified physics for training; not an engineering model.</p>`;
  $('tAssets').onclick = e => { const k = e.target.dataset.a; if (k) select(k); };
  $('tQRbtn').onclick = () => showQR(cur);
  $('tPrint').onclick = printTags;
  $('qrModal').onclick = e => { if (e.target.id === 'qrModal') $('qrModal').style.display = 'none'; };
  $('tTrendSel').onchange = drawTrend;
  // 3D
  const box = $('t3d');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  box.prepend(renderer.domElement); renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none';
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x202840, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(3, 5, 4); scene.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x141a38 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.PolarGridHelper(3.2, 12, 6, 48, 0x2a3570, 0x1d2550); grid.position.y = 0.002; scene.add(grid);
  new ResizeObserver(() => { const w = box.clientWidth, h = box.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }).observe(box);
  let down = null, moved = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; moved = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; moved += Math.abs(dx) + Math.abs(dy); down = { x: e.clientX, y: e.clientY };
    yaw -= dx * 0.008; pitch = clamp(pitch + dy * 0.006, 0.05, 1.3); });
  cv.addEventListener('pointerup', e => { if (down && moved < 6) pick(e); down = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); dist = clamp(dist * (1 + e.deltaY * 0.001), 3, 9); }, { passive: false });
  const clock = new THREE.Clock(); let ang = 0;
  renderer.setAnimationLoop(() => { if (!el.offsetParent) return; const dt = Math.min(clock.getDelta(), 0.1);
    ang += dt * (ASSETS[cur].now.speed || 1500) / 60 * 0.6; if (shaft) shaft.rotation.x = ang;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.7 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); camera.lookAt(0, 0.75, 0);
    colourParts(); renderer.render(scene, camera); });
  setInterval(() => { Object.values(ASSETS).forEach(step); if (el.offsetParent) refresh(); }, 2000);
  const q = new URLSearchParams(location.search).get('asset'); select(ASSETS[q] ? q : 'M-101');
}
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(Object.values(partMeshes).flat(), false)[0];
  selPart = hit ? hit.object.userData.part : null; drawPart();
}
function drawPart() {
  const a = ASSETS[cur], c = $('tPart');
  if (!selPart) { c.style.display = 'none'; return; }
  const ss = a.sensors.filter(s => s.part === selPart);
  const names = { stator: 'Motor stator & windings', bearing: 'Drive-end bearing', shaft: 'Shaft & coupling', pump: 'Centrifugal pump', fan: 'Cooling fan', engine: 'Diesel engine', radiator: 'Radiator & coolant', alternator: 'Alternator', tank: 'Base fuel tank' };
  c.innerHTML = `<b>${names[selPart] || selPart}</b>${ss.length ? ss.map(s => { const v = a.now[s.k], t = statusOf(s, v); return `<div><i style="background:${SC[t]}"></i>${s.l}: <b>${v.toFixed(s.d)} ${s.u}</b></div>`; }).join('') : `<div class="muted">${selPart === 'fan' ? (a.st.cooling ? 'Running' : '<b style="color:#ff8a90">Failed: no airflow</b>') : 'No sensor on this part'}</div>`}`;
  c.style.display = 'block';
}
function select(id) {
  cur = id; [...$('tAssets').children].forEach(c => c.classList.toggle('on', c.dataset.a === id));
  $('t3dTitle').textContent = `3D twin · ${id} ${ASSETS[id].name}`;
  $('tTrendSel').innerHTML = ASSETS[id].sensors.filter(s => s.warn != null || s.k === 'power').map(s => `<option value="${s.k}">${s.l}</option>`).join('');
  $('tTrendSel').value = 'wT';
  setAsset3D(id); buildWhatIf(); buildScen(); refresh();
  const u = new URL(location.href); u.searchParams.set('asset', id); history.replaceState(null, '', u);
}
function refresh() {
  const a = ASSETS[cur], h = health(a);
  const worst = a.sensors.map(s => statusOf(s, a.now[s.k])).reduce((w, t) => t === 'alarm' || w === 'alarm' ? 'alarm' : t === 'warn' || w === 'warn' ? 'warn' : 'ok', 'ok');
  $('tStatus').innerHTML = `<span class="pill big" style="background:${SC[worst]}">${worst === 'ok' ? 'Normal' : worst === 'warn' ? 'Warning' : 'ALARM'}</span>`;
  $('tInfo').innerHTML = `<table class="info"><tr><td>Asset</td><td><b>${a.id}</b> · ${a.type}</td></tr><tr><td>Location</td><td>${a.site}</td></tr><tr><td>Rating</td><td>${a.rated}</td></tr><tr><td>Installed</td><td>${a.installed}</td></tr>
    <tr><td>Running hours</td><td>${Math.round(a.st.hours).toLocaleString('en-US')} h</td></tr><tr><td>Predicted life of weakest part</td><td><b>${lifeTxt(rulDays(a))}</b></td></tr></table>`;
  C.paint($('tHealth'), C.gauge, { value: h, label: 'Health score', min: 0, max: 100, bands: [[0, 50, '#f0505a'], [50, 75, '#f5a524'], [75, 101, '#2fbf7a']], fmt: v => v.toFixed(0) });
  $('tGauges').innerHTML = a.sensors.map(s => `<div class="g1"><canvas data-k="${s.k}"></canvas></div>`).join('');
  $('tGauges').querySelectorAll('canvas').forEach(cv => { const s = a.sensors.find(x => x.k === cv.dataset.k), v = a.now[s.k];
    const bands = s.warn == null ? [[s.min, s.max + 1, '#38bdf8']] : s.low ? [[s.min, s.alarm, SC.alarm], [s.alarm, s.warn, SC.warn], [s.warn, s.max + 1, SC.ok]] : [[s.min, s.warn, SC.ok], [s.warn, s.alarm, SC.warn], [s.alarm, s.max + 1, SC.alarm]];
    C.paint(cv, C.gauge, { value: v, min: s.min, max: s.max, bands, label: `${s.l} (${s.u})`, fmt: x => x.toFixed(s.d) }); });
  drawTrend();
  $('tAlarms').innerHTML = a.alarms.length ? a.alarms.slice(0, 14).map(x => `<div><i style="background:${SC[x.lvl]}"></i><span class="muted">${x.t.toLocaleTimeString('en-GB')}</span> ${x.msg}</div>`).join('') : '<div class="muted">No events yet. Try a trainer scenario.</div>';
  updateWhatIf(); drawPart();
}
function drawTrend() {
  const a = ASSETS[cur], k = $('tTrendSel').value, s = a.sensors.find(x => x.k === k), vals = a.hist[k];
  const labels = vals.map((_, i) => { const m = (HIST - 1 - i) * 10; return m === 0 ? 'now' : `-${Math.floor(m / 60)}h`; });
  const series = [{ name: `${s.l} (${s.u})`, color: '#38bdf8', values: vals, fill: true }];
  if (s.warn != null) series.push({ name: 'Warning limit', color: SC.warn, values: vals.map(() => s.warn), dashed: true }, { name: 'Alarm limit', color: SC.alarm, values: vals.map(() => s.alarm), dashed: true });
  C.paint($('tTrend'), C.lineChart, { labels, series, yFmt: v => v.toFixed(s.d) });
}

// ---------- what-if ----------
function buildWhatIf() {
  const a = ASSETS[cur];
  $('tWhat').innerHTML = `
    <label class="sl">Load <b id="wLv"></b><input type="range" id="wL" min="30" max="120" value="${Math.round(a.st.load * 100)}"></label>
    <label class="sl">Ambient temperature <b id="wAv"></b><input type="range" id="wA" min="10" max="50" value="${a.st.ambient}"></label>
    <label class="sl">${a.id === 'M-101' ? 'Bearing' : 'Engine'} wear (from inspection) <b id="wWv"></b><input type="range" id="wW" min="0" max="80" value="${Math.round(a.st.wear * 100)}"></label>
    <label class="sl chk"><input type="checkbox" id="wC" checked> Cooling working</label>
    <div class="wiOut" id="wOut"></div>`;
  ['wL', 'wA', 'wW', 'wC'].forEach(id => $(id).oninput = updateWhatIf);
}
function updateWhatIf() {
  const a = ASSETS[cur]; if (!$('wL')) return;
  const st = { ...a.st, load: $('wL').value / 100, ambient: +$('wA').value, wear: $('wW').value / 100, cooling: $('wC').checked ? 1 : 0 };
  $('wLv').textContent = Math.round(st.load * 100) + '%'; $('wAv').textContent = st.ambient + ' °C'; $('wWv').textContent = Math.round(st.wear * 100) + '%';
  const m = a.model(st), now = a.model(a.st);
  const rows = a.sensors.filter(s => s.warn != null && m[s.k] != null && s.k !== 'fuel').map(s => { const v = m[s.k], t = statusOf(s, v);
    return `<tr><td>${s.l}</td><td>${now[s.k].toFixed(s.d)}</td><td style="color:${SC[t]}"><b>${v.toFixed(s.d)}</b> ${s.u}</td></tr>`; }).join('');
  let extra;
  if (a.id === 'M-101') { const kwhDay = m.power * 24, cost = kwhDay * PRICE, lifeFactor = Math.pow(2, (130 - m.wT) / 10);
    extra = `<div>Energy: <b>${Math.round(kwhDay).toLocaleString('en-US')} kWh/day</b> ≈ <b>$${Math.round(cost).toLocaleString('en-US')}/day</b> at $${PRICE}/kWh</div>
      <div>Insulation life vs. design: <b style="color:${lifeFactor < 1 ? SC.alarm : SC.ok}">×${lifeFactor > 8 ? '8+' : lifeFactor.toFixed(2)}</b> <span class="muted">(rule of thumb: life halves for every 10 °C above the class rating)</span></div>`; }
  else { extra = `<div>Fuel use: <b>${m.fuelRate.toFixed(0)} L/h</b> · runtime on current tank ≈ <b>${(a.st.fuel / 100 * 1000 / m.fuelRate).toFixed(1)} h</b> <span class="muted">(1,000 L tank)</span></div>`; }
  $('wOut').innerHTML = `<table class="info"><tr><th>Predicted (steady state)</th><th>Now</th><th>What-if</th></tr>${rows}</table>${extra}
    <div>Predicted life of weakest part: <b>${lifeTxt(rulDays(a, st))}</b></div>`;
}
function buildScen() {
  const a = ASSETS[cur];
  $('tScen').innerHTML = Object.entries(SCEN).map(([k, s]) => `<button class="btn ${a.scenario === k || (!a.scenario && k === 'normal') ? 'primary' : ''}" data-s="${k}">${typeof s.l === 'function' ? s.l(a) : s.l}</button>`).join('');
  $('tScen').onclick = e => { const k = e.target.dataset.s; if (!k) return; a.scenario = k === 'normal' ? null : k; if (k !== 'normal') SCEN.normal.f(a); SCEN[k].f(a); buildScen();
    const notes = { normal: 'Back to normal operation. Temperatures and vibration settle over a few updates (thermal lag).',
      bearing: 'Wear is growing fast (about 30 seconds to alarm). Watch vibration and temperature climb, the health score fall, and the predicted life shrink. When would you schedule maintenance?',
      overload: 'Load is 112% of rating. Power and current rise at once; winding temperature follows more slowly. Which alarm comes first, and why?',
      cooling: 'Cooling has failed at normal load. Nothing changes in the electrical readings: only temperature reveals it. Why do we need more than one sensor?' };
    $('tScenNote').innerHTML = `<b>${typeof SCEN[k].l === 'function' ? SCEN[k].l(a) : SCEN[k].l}.</b> ${notes[k]}`; };
}

// ---------- QR tags ----------
const assetURL = id => { const u = new URL(location.origin + location.pathname); u.searchParams.set('asset', id); u.hash = 'twin'; return u.toString(); };
function qrSVG(text, cell = 5) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true }); }
function showQR(id) {
  const a = ASSETS[id];
  $('qrBox').innerHTML = `<div class="qrImg">${qrSVG(assetURL(id))}</div><h3>${a.id} · ${a.name}</h3><p class="muted small">${a.site}</p>
    <p class="small">Scan with a phone camera to open this asset's live twin. In class, stick the printed tag on any real motor or generator (or a photo of one): the data appears where the equipment is.</p>
    <p class="small"><a href="${assetURL(id)}">${assetURL(id)}</a></p><button class="btn" onclick="document.getElementById('qrModal').style.display='none'">Close</button>`;
  $('qrModal').style.display = 'flex';
}
function printTags() {
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Asset QR tags</title><style>body{font-family:system-ui,Arial;margin:0}.tag{width:170mm;height:120mm;margin:12mm auto;border:3px solid #111;border-radius:8mm;display:flex;gap:10mm;align-items:center;padding:8mm;box-sizing:border-box;page-break-inside:avoid}
    .tag svg{width:85mm;height:85mm}.t h1{margin:0 0 3mm;font-size:30pt}.t h2{margin:0 0 4mm;font-size:14pt}.t p{margin:2mm 0;font-size:11pt}.band{background:#f5a524;padding:2mm 4mm;border-radius:2mm;display:inline-block;font-weight:700}</style></head><body>
    ${Object.values(ASSETS).map(a => `<div class="tag">${qrSVG(assetURL(a.id), 8)}<div class="t"><h1>${a.id}</h1><h2>${a.name}</h2><p>${a.rated}</p><p>${a.site}</p><p><b>Scan for live status</b></p><p class="band">Practice data · training only</p></div></div>`).join('')}
    <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
export const twinAssets = ASSETS;
