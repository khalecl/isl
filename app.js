import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { PROJECTS, SECTORS, BANDS, COMPANY, fmt } from './data.js';

// ---------- shared helpers ----------
const $ = id => document.getElementById(id);
const bandColor = k => BANDS.find(b => b.key === k).color;
const NEUTRAL = '#7f9cc4';
const byId = Object.fromEntries(PROJECTS.map(p => [p.id, p]));

const totals = (() => {
  const bac = PROJECTS.reduce((s, p) => s + p.bac, 0);
  const pos = PROJECTS.filter(p => p.overrun > 0).reduce((s, p) => s + p.overrun, 0);
  const net = PROJECTS.reduce((s, p) => s + p.overrun, 0);
  const top3 = [...PROJECTS].sort((a, b) => b.overrun - a.overrun).slice(0, 3);
  const top3sum = top3.reduce((s, p) => s + p.overrun, 0);
  const count = k => PROJECTS.filter(p => p.band === k).length;
  return { bac, pos, net, top3, top3share: top3sum / pos, risk: count('risk'), watch: count('watch'), ok: count('ok') };
})();
const top3ids = totals.top3.map(p => p.id);
const top3names = totals.top3.map(p => `${p.id} ${p.name}`);

function textTexture(draw, w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function labelTexture(text, sub) {
  return textTexture((g, w, h) => {
    g.fillStyle = 'rgba(11,18,32,0.85)'; roundRect(g, 4, 4, w - 8, h - 8, 36); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${sub ? 96 : 120}px system-ui, Arial`; g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
    if (sub) { g.font = '70px system-ui, Arial'; g.fillStyle = '#cfe2ff'; g.fillText(sub, w / 2, h * 0.75); }
  });
}

// ---------- renderer ----------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
stage.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h || renderer.xr.isPresenting) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(2, 4, 3); scene.add(d);
}

// ---------- bar chart builder (used by Level 1 and Level 2) ----------
// Layout: 4 columns x 3 rows, P01–P04 at the back, P09–P12 at the front.
function buildChart({ sprites }) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x233247, roughness: 0.9 }));
  base.position.y = -0.025; group.add(base);
  const bars = [];
  PROJECTS.forEach((p, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = -0.9 + col * 0.6, z = -0.6 + row * 0.6;
    const mat = new THREE.MeshStandardMaterial({ color: NEUTRAL, roughness: 0.55, transparent: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), mat);
    mesh.geometry.translate(0, 0.5, 0);
    mesh.position.set(x, 0, z); mesh.scale.y = 0.01; mesh.userData.project = p;
    group.add(mesh);
    let label;
    if (sprites) {
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p.id), depthTest: false, transparent: true }));
      label.scale.set(0.3, 0.15, 1); label.renderOrder = 2;
    } else {
      label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
        new THREE.MeshBasicMaterial({ map: labelTexture(p.id), transparent: true }));
    }
    label.position.set(x, 0.1, z + (sprites ? 0 : 0.18));
    group.add(label);
    bars.push({ p, mesh, label, h: 0.01, targetH: 0.01, color: new THREE.Color(NEUTRAL), targetColor: new THREE.Color(NEUTRAL), opacity: 1, targetOpacity: 1 });
  });
  return { group, bars };
}
const maxBac = Math.max(...PROJECTS.map(p => p.bac));
const maxOver = Math.max(...PROJECTS.map(p => p.overrun));
function setChartMode(chart, { height, color, focus, filter }) {
  chart.bars.forEach(b => {
    const p = b.p;
    b.targetH = height === 'overrun' ? Math.max(0.02, (p.overrun / maxOver) * 1.4) : (p.bac / maxBac) * 1.4;
    b.targetColor.set(color === 'band' ? bandColor(p.band) : NEUTRAL);
    if (height === 'overrun' && p.overrun <= 0) b.targetColor.set(color === 'band' ? bandColor('ok') : NEUTRAL);
    let o = 1;
    if (filter && !filter.has(p.sector)) o = 0.12;
    if (focus && !focus.includes(p.id)) o = Math.min(o, 0.18);
    b.targetOpacity = o;
  });
}
function animateChart(chart, k) {
  chart.bars.forEach(b => {
    b.h += (b.targetH - b.h) * k; b.mesh.scale.y = b.h;
    b.color.lerp(b.targetColor, k); b.mesh.material.color.copy(b.color);
    b.opacity += (b.targetOpacity - b.opacity) * k; b.mesh.material.opacity = b.opacity;
    b.mesh.material.depthWrite = b.opacity > 0.9;
    b.label.material.opacity = Math.max(0.15, b.opacity);
    b.label.position.y = b.h + 0.1;
  });
}
function snapChart(chart) { animateChart(chart, 1); }

// ============ LEVEL 1: interactive screen, guided story ============
const s1 = new THREE.Scene(); addLights(s1);
const chart1 = buildChart({ sprites: true }); s1.add(chart1.group);
const floor1 = new THREE.GridHelper(8, 16, 0x2c3a4f, 0x1b2636); floor1.position.y = -0.06; s1.add(floor1);

const VIEWS = {
  normal: { pos: new THREE.Vector3(0, 2.4, 4.0), look: new THREE.Vector3(0, 0.45, 0) },
  low: { pos: new THREE.Vector3(0.25, 0.38, 2.45), look: new THREE.Vector3(0, 0.5, -0.4) },
};
const STEPS = [
  { title: 'Meet the portfolio',
    text: `${COMPANY} is running ${PROJECTS.length} projects with a combined budget of $${fmt(totals.bac, 0)} M. Each bar is one project and its height shows the budget. Tap any bar to see its numbers.`,
    mode: { height: 'budget', color: 'neutral' }, view: 'normal' },
  { title: 'Colour shows cost health',
    text: `Colour now shows the cost performance index (CPI = earned value ÷ actual cost). ${totals.risk} projects are at risk (CPI below 0.85), ${totals.watch} are on watch and ${totals.ok} are on track. Large budgets are not always the problem.`,
    mode: { height: 'budget', color: 'band' }, view: 'normal', legend: true },
  { title: 'Where the money is leaking',
    text: `Height now shows the forecast overrun at completion (estimate at completion minus budget). Overrunning projects add up to $${fmt(totals.pos, 0)} M. The three largest, ${top3names.join(', ')}, account for ${Math.round(totals.top3share * 100)}% of it.`,
    mode: { height: 'overrun', color: 'band' }, view: 'normal', legend: true },
  { title: 'Pitfall: 3D can hide the story',
    text: 'From this low angle, near bars look taller than far bars and some bars hide others. Compare P11 at the front with P01 at the back, then tap <i>Flat chart</i>. It shows the same numbers without distortion. Use 3D to engage; use 2D to decide.',
    mode: { height: 'overrun', color: 'band' }, view: 'low', legend: true, flat: true },
  { title: 'The decision',
    text: `Recommendation: focus the next steering meeting on ${totals.top3.map(p => p.id).join(', ')}. Ask each project manager for a recovery plan and a revised forecast. The other projects need routine monitoring only.`,
    mode: { height: 'overrun', color: 'band', focus: top3ids }, view: 'normal', legend: true },
];
let step = 0, flatOn = false;
const sectorFilter = new Set(SECTORS);
const camTarget = { pos: VIEWS.normal.pos.clone(), look: VIEWS.normal.look.clone() };
const camLook = VIEWS.normal.look.clone();
let zoom = 1, yaw = 0, yawTarget = 0;

function renderLegend(show) {
  $('legend').style.display = show ? 'flex' : 'none';
  $('legend').innerHTML = BANDS.map(b => `<span><i style="background:${b.color}"></i>${b.label}</span>`).join('');
}
function renderChips() {
  $('chips').innerHTML = SECTORS.map(s => `<span class="chip ${sectorFilter.has(s) ? 'on' : ''}" data-s="${s}">${s}</span>`).join('');
}
$('chips').addEventListener('click', e => {
  const s = e.target.dataset.s; if (!s) return;
  if (sectorFilter.size === SECTORS.length) { sectorFilter.clear(); sectorFilter.add(s); }
  else if (sectorFilter.has(s)) { sectorFilter.delete(s); if (!sectorFilter.size) SECTORS.forEach(x => sectorFilter.add(x)); }
  else sectorFilter.add(s);
  renderChips(); applyStep(false);
});

function applyStep(moveCamera = true) {
  const st = STEPS[step];
  $('stepTitle').textContent = `${step + 1}/${STEPS.length} · ${st.title}`;
  $('stepText').innerHTML = st.text;
  setChartMode(chart1, { ...st.mode, filter: sectorFilter.size === SECTORS.length ? null : sectorFilter });
  renderLegend(!!st.legend);
  flatOn = false; $('flat').style.display = 'none';
  if (moveCamera) { const v = VIEWS[st.view]; camTarget.pos.copy(v.pos); camTarget.look.copy(v.look); yawTarget = 0; zoom = 1; }
  $('controls').innerHTML = `
    <button class="btn" id="prev" ${step === 0 ? 'disabled' : ''}>Back</button>
    <div class="dots">${STEPS.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>
    ${st.flat ? '<button class="btn" id="flatBtn">Flat chart</button>' : ''}
    <button class="btn primary" id="next">${step === STEPS.length - 1 ? 'Restart' : 'Next'}</button>`;
  $('prev').onclick = () => { if (step > 0) { step--; applyStep(); } };
  $('next').onclick = () => { step = (step + 1) % STEPS.length; applyStep(); };
  if ($('flatBtn')) $('flatBtn').onclick = () => {
    flatOn = !flatOn; $('flatBtn').classList.toggle('primary', flatOn);
    if (flatOn) { drawFlat(); $('card').style.display = 'none'; }
    $('flat').style.display = flatOn ? 'block' : 'none';
  };
}

function drawFlat() {
  const cv = $('flatCanvas'), g = cv.getContext('2d');
  const small = stage.clientWidth < 560;
  const W = small ? 230 : 300, rowH = 19, H = PROJECTS.length * rowH + 20;
  const dpr = Math.min(devicePixelRatio, 2);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const rows = [...PROJECTS].sort((a, b) => b.overrun - a.overrun);
  const minO = Math.min(0, ...rows.map(p => p.overrun));
  const left = 34, right = W - 40, span = maxOver - minO, x0 = left + (-minO / span) * (right - left);
  g.font = '11px system-ui, Arial'; g.textBaseline = 'middle';
  rows.forEach((p, i) => {
    const y = 8 + i * rowH, x1 = left + ((p.overrun - minO) / span) * (right - left);
    g.fillStyle = '#9aa8bb'; g.textAlign = 'left'; g.fillText(p.id, 2, y + rowH / 2 - 2);
    g.fillStyle = p.overrun > 0 ? bandColor(p.band) : bandColor('ok');
    g.fillRect(Math.min(x0, x1), y + 2, Math.abs(x1 - x0), rowH - 8);
    g.fillStyle = '#e8edf4'; g.textAlign = 'left';
    g.fillText((p.overrun > 0 ? '+' : '') + fmt(p.overrun), Math.max(x0, x1) + 4, y + rowH / 2 - 2);
  });
  g.strokeStyle = '#5b6f8c'; g.beginPath(); g.moveTo(x0, 4); g.lineTo(x0, H - 6); g.stroke();
}

function showCard(p) {
  const c = $('card');
  c.innerHTML = `<button class="x" aria-label="Close">×</button>
    <h3>${p.id} · ${p.name}</h3><div class="sec">${p.sector} · <span class="pill" style="background:${bandColor(p.band)}">${BANDS.find(b => b.key === p.band).label}</span></div>
    <table>
      <tr><td>Budget (BAC)</td><td>$${fmt(p.bac, 0)} M</td></tr>
      <tr><td>Complete</td><td>${Math.round(p.pc * 100)}%</td></tr>
      <tr><td>Planned value (PV)</td><td>$${fmt(p.pv)} M</td></tr>
      <tr><td>Earned value (EV)</td><td>$${fmt(p.ev)} M</td></tr>
      <tr><td>Actual cost (AC)</td><td>$${fmt(p.ac)} M</td></tr>
      <tr><td>CPI = EV ÷ AC</td><td>${p.cpi.toFixed(2)}</td></tr>
      <tr><td>SPI = EV ÷ PV</td><td>${p.spi.toFixed(2)}</td></tr>
      <tr><td>Forecast (EAC)</td><td>$${fmt(p.eac)} M</td></tr>
      <tr><td>Forecast overrun</td><td>${p.overrun > 0 ? '+' : ''}$${fmt(p.overrun)} M</td></tr>
    </table>`;
  c.style.display = 'block'; $('flat').style.display = 'none';
  c.querySelector('.x').onclick = () => { c.style.display = 'none'; if (flatOn && level === 1) $('flat').style.display = 'block'; };
}

// ============ LEVEL 2: AR on the desk ============
const s2 = new THREE.Scene(); addLights(s2);
const chart2 = buildChart({ sprites: false });
const AR_SCALE = 0.16;                      // about 43 cm wide on a real desk
chart2.group.scale.setScalar(AR_SCALE);
s2.add(chart2.group);
const s2floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x1a2536 }));
s2floor.rotation.x = -Math.PI / 2; s2floor.position.y = -0.01;
const s2grid = new THREE.GridHelper(6, 24, 0x2c3a4f, 0x223044);
s2.add(s2floor, s2grid);
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x4c9aff }));
reticle.matrixAutoUpdate = false; reticle.visible = false; s2.add(reticle);
let arMode = 'budget', arPlaced = false, hitSource = null, s2Spin = 0;
setChartMode(chart2, { height: 'budget', color: 'band' }); snapChart(chart2);

const supportsQuickLook = (() => { const a = document.createElement('a'); return !!(a.relList && a.relList.supports && a.relList.supports('ar')); })();
let supportsAR = false, supportsVR = false;
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then(v => { supportsAR = v; if (level === 2) renderLevel2(); }).catch(() => {});
  navigator.xr.isSessionSupported('immersive-vr').then(v => { supportsVR = v; if (level === 3) renderLevel3Controls(); }).catch(() => {});
}

function level2Text() {
  return arMode === 'budget'
    ? `Bar height shows each project's budget; colour shows cost health. Walk around the model: can you find the at-risk projects hiding behind bigger bars?`
    : `Bar height shows the forecast overrun. ${totals.top3.map(p => p.id).join(', ')} stand out. Look from the side, then from above: which view makes the comparison easiest?`;
}
function renderLevel2() {
  $('stepTitle').textContent = 'Level 2 · Augmented reality';
  $('stepText').textContent = level2Text();
  let main;
  if (supportsAR) main = `<button class="btn primary" id="startAR">Start AR</button>`;
  else if (supportsQuickLook) main = `<button class="btn primary" id="quickLook">View on my desk (AR)</button>`;
  else main = `<span style="color:var(--muted);font-size:13px">AR is not available in this browser. Open this page on an Android phone (Chrome) or an iPhone/iPad (Safari). The 3D preview works here.</span>`;
  $('controls').innerHTML = `
    <button class="btn ${arMode === 'budget' ? 'primary' : ''}" id="m1">Budget</button>
    <button class="btn ${arMode === 'overrun' ? 'primary' : ''}" id="m2">Overrun</button>${main}`;
  $('m1').onclick = () => { arMode = 'budget'; setArMode(); renderLevel2(); };
  $('m2').onclick = () => { arMode = 'overrun'; setArMode(); renderLevel2(); };
  if ($('startAR')) $('startAR').onclick = startAR;
  if ($('quickLook')) $('quickLook').onclick = openQuickLook;
  const info = $('arInfo');
  info.style.display = 'block';
  info.innerHTML = supportsAR
    ? '<b>Android:</b> tap <i>Start AR</i>, point at a desk, tap the blue ring to place the model. Walk around it.'
    : supportsQuickLook
      ? '<b>iPhone/iPad:</b> tap the AR button. Apple’s viewer opens; point at a desk to place the model. Pinch to resize, walk around it. (The iPhone view is a fixed model; the full interactive AR runs on Android.)'
      : '<b>3D preview.</b> Drag to turn the model. Switch between <i>Budget</i> and <i>Overrun</i> to compare the two stories.';
}
function setArMode() {
  setChartMode(chart2, { height: arMode, color: 'band' });
  $('arBudget').classList.toggle('on', arMode === 'budget');
  $('arOverrun').classList.toggle('on', arMode === 'overrun');
  $('arTop').textContent = arPlaced ? level2Text() : $('arTop').textContent;
}

async function startAR() {
  try {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: $('arOverlay') } });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    xrKind = 'ar'; arPlaced = false;
    chart2.group.visible = false; s2floor.visible = false; s2grid.visible = false;
    chart2.group.rotation.y = 0;
    $('arOverlay').style.display = 'block';
    $('arTop').textContent = 'Move your phone slowly over a flat surface. When the blue ring appears, tap to place the portfolio.';
    const viewer = await session.requestReferenceSpace('viewer');
    hitSource = await session.requestHitTestSource({ space: viewer });
    session.addEventListener('select', () => {
      if (!reticle.visible) return;
      chart2.group.position.setFromMatrixPosition(reticle.matrix);
      const camPos = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
      chart2.group.rotation.y = Math.atan2(camPos.x - chart2.group.position.x, camPos.z - chart2.group.position.z);
      chart2.group.visible = true; arPlaced = true;
      $('arTop').textContent = level2Text() + ' Tap another spot to move it.';
    });
    session.addEventListener('end', () => {
      hitSource = null; xrKind = null; reticle.visible = false;
      $('arOverlay').style.display = 'none';
      chart2.group.position.set(0, 0, 0); chart2.group.visible = true; s2floor.visible = true; s2grid.visible = true;
      resize();
    });
  } catch (e) {
    $('arInfo').innerHTML = 'Could not start AR on this device. ' + (e && e.message ? e.message : '');
  }
}
['arBudget', 'arOverrun', 'arExit'].forEach(id => $(id).addEventListener('beforexrselect', e => e.preventDefault()));
$('arBudget').onclick = () => { arMode = 'budget'; setArMode(); };
$('arOverrun').onclick = () => { arMode = 'overrun'; setArMode(); };
$('arExit').onclick = () => renderer.xr.getSession() && renderer.xr.getSession().end();

async function openQuickLook() {
  const btn = $('quickLook'); btn.disabled = true; btn.textContent = 'Preparing model…';
  try {
    // Export a fixed copy of the chart (current mode) at real-world desk size.
    const data = await makeUSDZ();
    const url = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
    const a = document.createElement('a'); a.rel = 'ar'; a.href = url + '#allowsContentScaling=1';
    a.download = `atlas-portfolio-${arMode}.usdz`;
    const img = document.createElement('img'); img.alt = ''; a.appendChild(img);
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  } catch (e) {
    $('arInfo').textContent = 'Could not prepare the AR model: ' + (e && e.message ? e.message : e);
  }
  btn.disabled = false; btn.textContent = 'View on my desk (AR)';
}
async function makeUSDZ() {
  {
    const tmp = buildChart({ sprites: false });
    setChartMode(tmp, { height: arMode, color: 'band' }); snapChart(tmp);
    tmp.bars.forEach(b => { b.mesh.material.transparent = false; b.mesh.material.opacity = 1; });
    tmp.group.scale.setScalar(AR_SCALE);
    const holder = new THREE.Scene(); holder.add(tmp.group); holder.updateMatrixWorld(true);
    return new USDZExporter().parseAsync(holder, { quickLookCompatible: true });
  }
}

// ============ LEVEL 3: immersive space to think ============
const s3 = new THREE.Scene(); s3.background = new THREE.Color(0x0d1420); addLights(s3);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 64), new THREE.MeshStandardMaterial({ color: 0x162132 }));
  floor.rotation.x = -Math.PI / 2; s3.add(floor);
  const grid = new THREE.PolarGridHelper(4.5, 12, 6, 64, 0x2c3a4f, 0x223044); grid.position.y = 0.002; s3.add(grid);
}
const CARD_W = 0.56, CARD_H = 0.34, RING = 2.4;
const BANNER_ANGLES = { risk: -0.46, watch: 0, ok: 0.46 };      // radians, front of the user (−z)
const polar = (ang, r, y) => new THREE.Vector3(Math.sin(ang) * r, y, -Math.cos(ang) * r);
const faceCentre = (obj) => { obj.lookAt(0, obj.position.y, 0); };

function cardTexture(p, state) {
  return textTexture((g, w, h) => {
    const border = state.checked ? (state.correct ? '#30a46c' : '#e5484d') : state.selected ? '#4c9aff' : '#3a4b63';
    g.fillStyle = '#f4f7fb'; roundRect(g, 6, 6, w - 12, h - 12, 26); g.fill();
    g.lineWidth = state.selected || state.checked ? 14 : 6; g.strokeStyle = border; roundRect(g, 8, 8, w - 16, h - 16, 24); g.stroke();
    g.fillStyle = '#0b1220'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = 'bold 36px system-ui, Arial'; g.fillText(p.id, 32, 62);
    g.font = '30px system-ui, Arial'; g.fillStyle = '#5a6b82'; g.fillText(p.sector, 110, 62);
    g.fillStyle = '#0b1220'; g.font = 'bold 33px system-ui, Arial';
    g.fillText(p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name, 32, 108);
    g.font = '30px system-ui, Arial';
    g.fillText(`Earned value  $${fmt(p.ev)} M`, 32, 160);
    g.fillText(`Actual cost    $${fmt(p.ac)} M`, 32, 200);
    g.fillStyle = '#5a6b82'; g.fillText(`Budget $${fmt(p.bac, 0)} M · ${Math.round(p.pc * 100)}% done`, 32, 240);
    if (state.checked) {
      g.fillStyle = bandColor(p.band); roundRect(g, 32, 256, w - 64, 46, 12); g.fill();
      g.fillStyle = '#081019'; g.font = 'bold 28px system-ui, Arial';
      g.fillText(`CPI ${p.cpi.toFixed(2)} → ${BANDS.find(b => b.key === p.band).label}`, 48, 289);
    }
  }, 512, 320);
}
const cards = PROJECTS.map((p, i) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: cardTexture(p, {}), side: THREE.DoubleSide }));
  // spread the 12 cards over the sides and back of the room (about 110° to 250°)
  const a = Math.PI * 0.6 + (i / (PROJECTS.length - 1)) * Math.PI * 0.8;
  const home = polar(a, RING, i % 2 ? 1.25 : 1.65);
  mesh.position.copy(home); faceCentre(mesh);
  mesh.userData = { kind: 'card', p };
  s3.add(mesh);
  return { p, mesh, home, group: null, selected: false, checked: false, target: home.clone() };
});
const banners = BANDS.map(b => {
  const tex = textTexture((g, w, h) => {
    g.fillStyle = b.color; roundRect(g, 6, 6, w - 12, h - 12, 30); g.fill();
    g.fillStyle = '#081019'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 76px system-ui, Arial'; g.fillText(b.label, w / 2, h * 0.38);
    g.font = '44px system-ui, Arial'; g.fillText(b.rule, w / 2, h * 0.74);
  }, 1024, 256);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.position.copy(polar(BANNER_ANGLES[b.key], RING + 0.05, 2.25)); faceCentre(mesh);
  mesh.userData = { kind: 'banner', key: b.key };
  // a tall, faint drop zone below each banner makes it an easy target
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.0),
    new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  zone.position.copy(polar(BANNER_ANGLES[b.key], RING + 0.1, 1.05)); faceCentre(zone);
  zone.userData = { kind: 'banner', key: b.key };
  s3.add(mesh, zone);
  return { ...b, mesh, zone };
});
// In-world buttons so the activity also works inside a VR headset
function worldButton(text, color, ang, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({
    map: textTexture((g, w, h) => { g.fillStyle = color; roundRect(g, 4, 4, w - 8, h - 8, 40); g.fill();
      g.fillStyle = '#081019'; g.font = 'bold 84px system-ui, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2); }, 512, 164),
    side: THREE.DoubleSide }));
  m.position.copy(polar(ang, 1.6, y)); faceCentre(m); s3.add(m); return m;
}
const btnCheck = worldButton('Check', '#4c9aff', -0.22, 0.75); btnCheck.userData = { kind: 'check' };
const btnReset = worldButton('Reset', '#c5d0de', 0.22, 0.75); btnReset.userData = { kind: 'reset' };
const scoreBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
scoreBoard.position.copy(polar(0, 1.6, 0.98)); faceCentre(scoreBoard); s3.add(scoreBoard);
function setScoreText(t) {
  scoreBoard.material.map?.dispose();
  scoreBoard.material.map = textTexture((g, w, h) => { g.fillStyle = '#e8edf4'; g.font = 'bold 46px system-ui, Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2); }, 1024, 186);
  scoreBoard.material.needsUpdate = true;
}
setScoreText('Select a card, then a coloured group');

let selectedCard = null;
function refreshCard(c) {
  c.mesh.material.map.dispose();
  c.mesh.material.map = cardTexture(c.p, { selected: c.selected, checked: c.checked, correct: c.group === c.p.band });
}
function layoutGroups() {
  BANDS.forEach(b => {
    const members = cards.filter(c => c.group === b.key);
    members.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const ang = BANNER_ANGLES[b.key] + (col ? 0.11 : -0.11);
      c.target = polar(ang, RING - 0.02, 1.88 - row * 0.37);
    });
  });
  cards.filter(c => !c.group).forEach(c => c.target = c.home.clone());
}
function pick3(obj) {
  const u = obj.userData;
  if (u.kind === 'card') {
    const c = cards.find(x => x.mesh === obj);
    if (selectedCard && selectedCard !== c) { selectedCard.selected = false; refreshCard(selectedCard); }
    c.selected = !c.selected; selectedCard = c.selected ? c : null;
    if (c.checked) { cards.forEach(x => { x.checked = false; refreshCard(x); }); }
    refreshCard(c);
    setScoreText(c.selected ? `${c.p.id} selected: now choose a group` : 'Select a card, then a coloured group');
  } else if (u.kind === 'banner' && selectedCard) {
    selectedCard.group = u.key; selectedCard.selected = false; refreshCard(selectedCard); selectedCard = null;
    layoutGroups();
    const n = cards.filter(c => c.group).length;
    setScoreText(n === cards.length ? 'All placed: press Check' : `${n} of ${cards.length} placed`);
  } else if (u.kind === 'check') checkGroups();
  else if (u.kind === 'reset') resetGroups();
}
function checkGroups() {
  const placed = cards.filter(c => c.group);
  const right = placed.filter(c => c.group === c.p.band).length;
  cards.forEach(c => { c.selected = false; c.checked = !!c.group; refreshCard(c); });
  selectedCard = null;
  const msg = `${right} of ${cards.length} correct` + (placed.length < cards.length ? ` (${cards.length - placed.length} not placed)` : '');
  setScoreText(msg);
  if (level === 3) $('stepText').innerHTML = `<span class="score">${msg}.</span> Cards now show the CPI. Green border = correct group, red = move it. What does the shape of the groups tell the steering committee?`;
}
function resetGroups() {
  cards.forEach(c => { c.group = null; c.selected = false; c.checked = false; refreshCard(c); });
  selectedCard = null; layoutGroups(); setScoreText('Select a card, then a coloured group'); renderLevel3Text();
}
function renderLevel3Text() {
  $('stepTitle').textContent = 'Level 3 · Immersive space to think';
  $('stepText').textContent = 'The project cards surround you. Look around, compute CPI = earned value ÷ actual cost for each card, and sort the cards under the three coloured groups in front of you. Then press Check.';
}
function renderLevel3Controls() {
  $('controls').innerHTML = `
    <button class="btn primary" id="chk">Check</button>
    <button class="btn" id="rst">Reset</button>
    ${supportsVR ? '<button class="btn" id="vr">Enter VR headset</button>' : ''}
    <button class="btn" id="front">Face the groups</button>`;
  $('chk').onclick = checkGroups; $('rst').onclick = resetGroups;
  $('front').onclick = () => { look3.yawT = 0; look3.pitchT = -0.1; };
  if ($('vr')) $('vr').onclick = startVR;
}
async function startVR() {
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session); xrKind = 'vr';
    session.addEventListener('end', () => { xrKind = null; resize(); });
  } catch (e) { $('stepText').textContent = 'Could not start VR: ' + (e && e.message ? e.message : e); }
}
// VR controllers: a ray from each hand; trigger = select
const tmpMat = new THREE.Matrix4(), ray = new THREE.Raycaster();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0x4c9aff })); line.scale.z = 5; ctrl.add(line);
  ctrl.addEventListener('select', () => {
    if (xrKind !== 'vr') return;
    tmpMat.identity().extractRotation(ctrl.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
    const hit = ray.intersectObjects(pickables3(), false)[0];
    if (hit) pick3(hit.object);
  });
  s3.add(ctrl);
}
const pickables3 = () => [...cards.map(c => c.mesh), ...banners.flatMap(b => [b.mesh, b.zone]), btnCheck, btnReset];
const look3 = { yaw: Math.PI, pitch: -0.08, yawT: Math.PI * 0.85, pitchT: -0.08 };

// ============ level switching, input, render loop ============
let level = 1, xrKind = null;
function setLevel(n) {
  level = n;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', +b.dataset.level === n));
  $('about').style.display = n === 0 ? 'block' : 'none';
  $('sheet').style.display = n === 0 ? 'none' : '';
  $('chips').style.display = n === 1 ? 'flex' : 'none';
  $('card').style.display = 'none'; $('flat').style.display = 'none';
  $('arInfo').style.display = 'none';
  $('legend').style.display = 'none';
  const hints = { 1: 'Drag to rotate · pinch or scroll to zoom · tap a bar', 2: 'Drag to turn the model', 3: 'Drag to look around · tap a card, then a group' };
  $('hint').style.display = hints[n] ? 'block' : 'none'; $('hint').textContent = hints[n] || '';
  if (n === 1) { renderChips(); applyStep(); }
  if (n === 2) { renderLevel2(); renderLegend(true); }
  $('legend').classList.toggle('top', n === 2);
  if (n === 3) { renderLevel3Text(); renderLevel3Controls(); look3.yaw = Math.PI; look3.yawT = Math.PI * 0.85; }
  resize();
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLevel(+b.dataset.level); });

// pointer input (screen mode)
const pointers = new Map(); let downPos = null, pinchStart = 0, zoomStart = 1;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downPos = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: 0 } : null;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); zoomStart = zoom; }
});
canvas.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchStart) zoom = THREE.MathUtils.clamp(zoomStart * pinchStart / d, 0.45, 2); return;
  }
  if (downPos) downPos.moved += Math.abs(dx) + Math.abs(dy);
  if (level === 1) yawTarget += dx * 0.008;
  if (level === 2) s2Spin += dx * 0.01;
  if (level === 3) { look3.yawT -= dx * 0.005; look3.pitchT = THREE.MathUtils.clamp(look3.pitchT - dy * 0.004, -0.9, 0.7); }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (downPos && downPos.moved < 8 && e.type === 'pointerup') tap(e);
  downPos = null; if (pointers.size < 2) pinchStart = 0;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * (1 + e.deltaY * 0.001), 0.45, 2); }, { passive: false });

const screenRay = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tap(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  screenRay.setFromCamera(ndc, camera);
  if (level === 1) {
    const hit = screenRay.intersectObjects(chart1.bars.filter(b => b.opacity > 0.5).map(b => b.mesh))[0];
    if (hit) showCard(hit.object.userData.project); else $('card').style.display = 'none';
  } else if (level === 3) {
    const hit = screenRay.intersectObjects(pickables3(), false)[0];
    if (hit) pick3(hit.object);
  }
}

const clock = new THREE.Clock();
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(clock.getDelta(), 0.1), k = 1 - Math.pow(0.001, dt);   // frame-rate independent easing
  if (xrKind === 'ar') {
    if (frame && hitSource) {
      const res = frame.getHitTestResults(hitSource);
      const refSpace = renderer.xr.getReferenceSpace();
      if (res.length && !arPlaced) { reticle.visible = true; reticle.matrix.fromArray(res[0].getPose(refSpace).transform.matrix); }
      else if (res.length && arPlaced) { reticle.visible = true; reticle.matrix.fromArray(res[0].getPose(refSpace).transform.matrix); }
      else reticle.visible = false;
    }
    animateChart(chart2, k);
    renderer.render(s2, camera); return;
  }
  if (xrKind === 'vr') { animateCards(k); renderer.render(s3, camera); return; }

  if (level === 1 || level === 0) {
    animateChart(chart1, k);
    yaw += (yawTarget - yaw) * k; chart1.group.rotation.y = yaw;
    const desired = camTarget.pos.clone().sub(camTarget.look).multiplyScalar(zoom).add(camTarget.look);
    camera.position.lerp(desired, k * 0.8); camLook.lerp(camTarget.look, k * 0.8); camera.lookAt(camLook);
    renderer.render(s1, camera);
  } else if (level === 2) {
    animateChart(chart2, k);
    chart2.group.rotation.y += (s2Spin - chart2.group.rotation.y) * k;
    camera.position.set(0, 0.42 * zoom, 0.72 * zoom); camera.lookAt(0, 0.08, 0);
    renderer.render(s2, camera);
  } else if (level === 3) {
    animateCards(k);
    look3.yaw += (look3.yawT - look3.yaw) * k; look3.pitch += (look3.pitchT - look3.pitch) * k;
    camera.position.set(0, 1.6, 0);
    camera.rotation.set(look3.pitch, -look3.yaw, 0, 'YXZ');
    const wantH = 90 * Math.PI / 180, vf = 2 * Math.atan(Math.tan(wantH / 2) / camera.aspect) * 180 / Math.PI;
    const fov = THREE.MathUtils.clamp(Math.max(vf, 62) * zoom, 35, 100); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    renderer.render(s3, camera);
    camera.fov = 50; camera.updateProjectionMatrix();
  }
});
function animateCards(k) {
  cards.forEach(c => {
    const t = c.selected ? c.target.clone().multiplyScalar(0.9).setY(c.target.y + 0.05) : c.target;
    c.mesh.position.lerp(t, k); faceCentre(c.mesh);
  });
}

// ---------- Guide tab ----------
$('about').innerHTML = `
<h2>How to use this lab</h2>
<p>This app supports Day 3 of <i>Data Visualisation &amp; Storytelling</i>. It shows the same project-portfolio story at three levels of interactivity and immersion. All figures are <b>practice data</b> for a fictional company, ${COMPANY}.</p>
<h3>Install it like an app</h3>
<ul>
  <li><b>Android (Chrome):</b> menu ⋮ → <i>Add to Home screen</i> or <i>Install app</i>.</li>
  <li><b>iPhone / iPad (Safari):</b> Share button → <i>Add to Home Screen</i>.</li>
  <li><b>Windows / Mac (Chrome or Edge):</b> the install icon in the address bar.</li>
</ul>
<h3>The three levels</h3>
<table>
  <tr><th>Level</th><th>What you do</th><th>Works on</th></tr>
  <tr><td>1 · Interactive screen</td><td>Follow a five-step guided story, rotate the chart, filter by sector, tap bars for details.</td><td>Any device</td></tr>
  <tr><td>2 · AR on your desk</td><td>Place the portfolio model on a real desk and walk around it.</td><td>Android Chrome (live AR); iPhone/iPad (Apple AR viewer, fixed model)</td></tr>
  <tr><td>3 · Space to think</td><td>Cards surround you; compute CPI and sort them into three groups, then check.</td><td>Any device (drag to look); full VR in a headset browser such as Meta Quest</td></tr>
</table>
<h3>Key terms</h3>
<table>
  <tr><td>BAC</td><td>Budget at completion</td></tr>
  <tr><td>PV</td><td>Planned value: budgeted cost of work scheduled to date</td></tr>
  <tr><td>EV</td><td>Earned value: budgeted cost of work actually done (BAC × % complete)</td></tr>
  <tr><td>AC</td><td>Actual cost to date</td></tr>
  <tr><td>CPI</td><td>Cost performance index = EV ÷ AC (below 1 = over budget)</td></tr>
  <tr><td>SPI</td><td>Schedule performance index = EV ÷ PV (below 1 = behind schedule)</td></tr>
  <tr><td>EAC</td><td>Estimate at completion = BAC ÷ CPI</td></tr>
</table>
<h3>Reflection questions</h3>
<ol>
  <li>Which level helped you <i>find</i> the problem fastest? Which helped you <i>explain</i> it best?</li>
  <li>In Level 1, step 4: what did the low 3D view hide or exaggerate?</li>
  <li>In Level 3, did arranging cards in space change how you thought about the portfolio?</li>
  <li>For your own job, which level is worth the extra effort, and for which audience?</li>
</ol>
<p style="color:var(--muted);font-size:12px">Practice data only. Not real projects, companies or figures.</p>`;

setLevel(1);
window.__lab = { makeUSDZ, pick3, cards, banners, checkGroups };   // used by automated tests only
