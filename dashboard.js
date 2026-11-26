import { PAL, TH, SETTINGS, HOLO, wallGlass, withGlass, onTheme, applyTheme, PALETTES } from './palette.js';
// Level 1: interactive command-centre dashboard
import * as C from './charts.js';
import { PANELS, kpiList, ctxFor } from './panels.js';
import { PROJECTS, SECTORS, REGIONS, MONTHS, T, DATA_DATE, COMPANY, BANDS, bandColor, bandLabel, curCPI, curSPI, fmt, money, byId, ALERTS, onTick } from './data.js';

const $ = id => document.getElementById(id);
const state = { sectors: new Set(SECTORS), region: 'All', status: 'All', q: '', sort: 'overrun', dir: -1, open: null, story: -1 };
const filtered = () => PROJECTS.filter(p => state.sectors.has(p.sector) && (state.region === 'All' || p.region === state.region) && (state.status === 'All' || p.band === state.status)
  && (!state.q || (p.id + ' ' + p.name + ' ' + p.pm).toLowerCase().includes(state.q.toLowerCase())));

const LAYOUT = [['gauges', 'g-4'], ['scurve', 'g-8'], ['overrun', 'g-4'], ['matrix', 'g-4'], ['sector', 'g-4'], ['spend', 'g-6'], ['risk', 'g-3'], ['hse', 'g-3'], ['live', 'g-6'], ['alerts', 'g-6']];

export function initDashboard() {
  const d = $('dash');
  d.innerHTML = `
  <div class="toolbar">
    <div class="chips" id="dChips"></div>
    <select id="dRegion"><option>All</option>${REGIONS.map(r => `<option>${r}</option>`).join('')}</select>
    <select id="dStatus"><option value="All">All statuses</option>${BANDS.map(b => `<option value="${b.key}">${b.label}</option>`).join('')}</select>
    <input id="dSearch" type="search" placeholder="Search project or PM">
    <button class="btn primary" id="storyBtn">▶ Play the data story</button>
  </div>
  <div class="ticker" id="ticker"><span class="live-dot"></span><span id="tickerText">Connecting to site feeds…</span></div>
  <section class="kpis panel" id="pn-kpis" data-p="kpis"></section>
  <div class="grid" id="dGrid">${LAYOUT.map(([id, cls]) => `<section class="panel ${cls}" id="pn-${id}" data-p="${id}"><h3>${PANELS[id].title}</h3><div class="cv"><canvas></canvas></div></section>`).join('')}</div>
  <section class="panel" id="pn-table" data-p="table"><h3>Project register <span class="muted">· tap a column to sort · tap a row for full details</span></h3><div class="tablewrap"><table id="dTable"></table></div></section>
  <p class="foot">Practice data for training. ${COMPANY} is a fictional company. Status at data date ${DATA_DATE}; live feed is simulated.</p>`;
  $('dChips').innerHTML = SECTORS.map(s => `<span class="chip on" data-s="${s}">${s}</span>`).join('');
  $('dChips').onclick = e => { const s = e.target.dataset.s; if (!s) return;
    if (state.sectors.size === SECTORS.length) { state.sectors.clear(); state.sectors.add(s); }
    else if (state.sectors.has(s)) { state.sectors.delete(s); if (!state.sectors.size) SECTORS.forEach(x => state.sectors.add(x)); } else state.sectors.add(s);
    [...$('dChips').children].forEach(c => c.classList.toggle('on', state.sectors.has(c.dataset.s) && state.sectors.size !== SECTORS.length));
    renderAll(); };
  $('dRegion').onchange = e => { state.region = e.target.value; renderAll(); };
  $('dStatus').onchange = e => { state.status = e.target.value; renderAll(); };
  $('dSearch').oninput = e => { state.q = e.target.value; renderAll(); };
  $('storyBtn').onclick = () => startStory(0);
  // tooltips + click-through on all chart canvases
  d.addEventListener('pointermove', e => { const cv = e.target.closest('canvas'); if (!cv || !cv._hits) return hideTip();
    const r = cv.getBoundingClientRect(), h = C.hitTest(cv._hits, e.clientX - r.left, e.clientY - r.top); h ? showTip(h.html, e.clientX, e.clientY) : hideTip(); });
  d.addEventListener('pointerleave', hideTip);
  d.addEventListener('click', e => { const cv = e.target.closest('canvas'); if (cv && cv._hits) { const r = cv.getBoundingClientRect(), h = C.hitTest(cv._hits, e.clientX - r.left, e.clientY - r.top);
    if (h && h.id) openProject(h.id); else if (h && e.pointerType !== 'mouse') showTip(h.html, e.clientX, e.clientY); } });
  new ResizeObserver(() => renderAll()).observe(d);
  onTick(() => { if (d.offsetParent) { renderAll(true); } });
  renderAll();
}

function showTip(html, x, y) { const t = $('tip'); t.innerHTML = html; t.style.display = 'block';
  const r = t.getBoundingClientRect(); t.style.left = Math.min(innerWidth - r.width - 8, x + 14) + 'px'; t.style.top = Math.min(innerHeight - r.height - 8, y + 14) + 'px'; }
function hideTip() { $('tip').style.display = 'none'; }

let lastCtx;
export function renderAll(live) {
  const list = filtered(), ctx = ctxFor(list.length ? list : PROJECTS); lastCtx = ctx;
  // KPI tiles
  const ks = kpiList(ctx.P);
  $('pn-kpis').innerHTML = ks.map((k, i) => `<div class="kpi ${k.bad ? 'bad' : ''}"><div class="k">${k.k}</div><div class="v">${k.v}</div><div class="s">${k.s}</div>${k.spark ? `<canvas class="spark" id="sp${i}"></canvas>` : ''}</div>`).join('');
  ks.forEach((k, i) => k.spark && C.paint($('sp' + i), C.sparkline, { values: k.spark, color: k.c || '#93a4c3' }));
  LAYOUT.forEach(([id]) => { const cv = document.querySelector(`#pn-${id} canvas`); C.paint(cv, PANELS[id].draw, ctx); });
  renderTable(list);
  const a = ALERTS[0]; if (a) $('tickerText').innerHTML = `<b>${a.time.toLocaleTimeString('en-GB')}</b> ${a.msg}`;
  if (state.open) renderDrawer(state.open, live);
}

const COLS = [
  ['id', 'ID', p => p.id], ['name', 'Project', p => p.name], ['sector', 'Sector', p => p.sector], ['region', 'Region', p => p.region],
  ['bac', 'Budget', p => p.bac], ['pc', '% done', p => (p.ev + p.live.evDelta) / p.bac], ['cpi', 'CPI', p => curCPI(p)], ['spi', 'SPI', p => curSPI(p)],
  ['overrun', 'Overrun', p => p.bac / curCPI(p) - p.bac], ['slip', 'Slip (mo)', p => p.slip], ['trend', 'CPI trend', null], ['crew', 'Crew', p => p.live.crew], ['band', 'Status', p => ['risk', 'watch', 'ok'].indexOf(p.band)]];
function renderTable(list) {
  const col = COLS.find(c => c[0] === state.sort);
  const rows = [...list].sort((a, b) => { const x = col[2](a), y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * state.dir; });
  const pill = (v, good) => `<span class="pill" style="background:${v < 0.85 ? PAL.risk : v < 0.95 ? PAL.watch : PAL.ok}">${v.toFixed(2)}</span>`;
  $('dTable').innerHTML = `<thead><tr>${COLS.map(c => `<th data-k="${c[0]}" class="${c[2] ? 'sortable' : ''} ${state.sort === c[0] ? 'sorted' : ''}">${c[1]}${state.sort === c[0] ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(p => { const pc = (p.ev + p.live.evDelta) / p.bac, o = p.bac / curCPI(p) - p.bac;
    return `<tr data-id="${p.id}" class="${state.hl && state.hl.includes(p.id) ? 'hl' : ''}"><td><b>${p.id}</b></td><td>${p.name}<div class="muted small">${p.pm}</div></td><td><i class="dot" style="background:var(--s-${p.sector})"></i>${p.sector}</td><td>${p.region}</td>
    <td class="num">${money(p.bac, 0)}</td><td><div class="prog"><span style="width:${pc * 100}%"></span></div><span class="small">${(pc * 100).toFixed(1)}%</span></td>
    <td>${pill(curCPI(p))}</td><td>${pill(curSPI(p))}</td><td class="num" style="color:${o > 0 ? '#ff8a90' : '#6fe3a8'}">${o > 0 ? '+' : ''}${o.toFixed(1)}</td><td class="num">${p.slip > 0 ? '+' + p.slip : p.slip}</td>
    <td><canvas class="tspark" data-id="${p.id}"></canvas></td><td class="num">${p.live.crew}</td><td><span class="pill" style="background:${bandColor(p.band)}">${bandLabel(p.band)}</span></td></tr>`; }).join('')}</tbody>`;
  document.querySelectorAll('.tspark').forEach(cv => { const p = byId[cv.dataset.id]; C.paint(cv, C.sparkline, { values: p.cpiTrend, color: bandColor(p.band), ref: 1 }); });
  $('dTable').querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; state.dir = state.sort === k ? -state.dir : (['id', 'name', 'sector', 'region'].includes(k) ? 1 : -1); state.sort = k; renderTable(filtered()); });
  $('dTable').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => openProject(tr.dataset.id));
}

// ---------- project drill-down ----------
export function openProject(id) { state.open = id; $('drawer').classList.add('open'); renderDrawer(id); }
$('drawerClose')?.addEventListener('click', () => { state.open = null; $('drawer').classList.remove('open'); });
function renderDrawer(id, live) {
  const p = byId[id], cpi = curCPI(p), spi = curSPI(p), ev = p.ev + p.live.evDelta, ac = p.ac + p.live.acDelta, eac = p.bac / cpi;
  const body = $('drawerBody');
  const tiles = [['Budget (BAC)', money(p.bac, 0)], ['Earned value', money(ev)], ['Actual cost', money(ac)], ['Forecast (EAC)', money(eac)], ['Cost variance', money(ev - ac)], ['Schedule variance', money(ev - p.pv)],
    ['Planned finish', MONTHS[p.finishPlan]], ['Forecast finish', MONTHS[p.finishFcst] + (p.slip > 0 ? ` (+${p.slip} mo)` : '')], ['Change orders', `${p.quality.changeOrders} · ${money(p.changeValue)}`],
    ['Crew on site (live)', p.live.crew], ['Equipment utilisation', p.live.util + '%'], ['Days since LTI', p.hse.daysSinceLTI]];
  if (!live || !body.dataset.id || body.dataset.id !== id) {
    body.dataset.id = id;
    body.innerHTML = `
    <div class="dhead"><div><div class="muted">${p.sector} · ${p.region} · PM ${p.pm}</div><h2>${p.id} · ${p.name}</h2></div><span class="pill big" style="background:${bandColor(p.band)}">${bandLabel(p.band)}</span></div>
    <div class="dtiles" id="dTiles"></div>
    <div class="dgrid">
      <section class="panel g-12"><h3>Health gauges</h3><div class="cv h160"><canvas id="dvG"></canvas></div></section>
      <section class="panel g-12"><h3>Project S-curve (USD M)</h3><div class="cv h220"><canvas id="dvS"></canvas></div></section>
      <section class="panel g-12"><h3>Milestones: plan ◇ vs forecast ◆</h3><div class="cv h200"><canvas id="dvM"></canvas></div></section>
      <section class="panel g-6"><h3>Cost to date by type</h3><div class="cv h180"><canvas id="dvC"></canvas></div></section>
      <section class="panel g-6"><h3>CPI trend, last 12 months</h3><div class="cv h180"><canvas id="dvT"></canvas></div></section>
      <section class="panel g-12"><h3>Top risks</h3><table class="rtable"><thead><tr><th>ID</th><th>Risk</th><th>L</th><th>I</th><th>Score</th></tr></thead><tbody>${p.risks.slice(0, 6).map(r => `<tr><td>${r.id}</td><td>${r.title}</td><td>${r.L}</td><td>${r.I}</td><td><span class="pill" style="background:${r.score >= 15 ? PAL.risk : r.score >= 8 ? PAL.watch : PAL.ok}">${r.score}</span></td></tr>`).join('')}</tbody></table></section>
      <section class="panel g-12"><h3>Safety & quality</h3><div class="dtiles">${[['Man-hours', fmt(p.hse.manHours / 1e3, 0) + 'k'], ['Lost-time injuries', p.hse.lti], ['Recordables', p.hse.recordables], ['TRIR', p.hse.trir.toFixed(2)], ['Open NCRs', p.quality.ncr], ['Open RFIs', p.quality.rfi]].map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v sm">${v}</div></div>`).join('')}</div></section>
    </div>`;
  }
  $('dTiles').innerHTML = tiles.map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v sm">${v}</div></div>`).join('');
  const bands = [[0.6, 0.85, PAL.risk], [0.85, 0.95, PAL.watch], [0.95, 1.2, PAL.ok]];
  C.paint($('dvG'), (g, w, h) => { const gw = w / 3; [[cpi, 'CPI', bands, 0.6, 1.2], [spi, 'SPI', bands, 0.6, 1.2], [ev / p.bac * 100, '% complete', [[0, 100, '#38bdf8']], 0, 100]].forEach(([v, l, b, mn, mx], i) => { g.save(); g.translate(gw * i, 0); C.gauge(g, gw, h, { value: v, label: l, bands: b, min: mn, max: mx, target: l === '% complete' ? null : 1, fmt: l === '% complete' ? x => x.toFixed(0) + '%' : x => x.toFixed(2) }); g.restore(); }); return []; });
  if (live && body.dataset.drawn === id) return;
  body.dataset.drawn = id;
  const a = Math.max(0, p.start - 1), b = Math.min(MONTHS.length, p.finishFcst + 3), sl = arr => arr.slice(a, b);
  C.paint($('dvS'), C.lineChart, { labels: sl(MONTHS), marker: T - a, series: [
    { name: 'PV', color: '#93a4c3', values: sl(p.series.pv), width: 2 }, { name: 'EV', color: '#38bdf8', values: sl(p.series.ev), fill: true }, { name: 'AC', color: '#f472b6', values: sl(p.series.ac) },
    { name: 'EV fcst', color: '#38bdf8', values: sl(p.series.evF), dashed: true }, { name: 'AC fcst', color: '#f472b6', values: sl(p.series.acF), dashed: true }] });
  C.paint($('dvM'), C.gantt, { labels: MONTHS, from: a, to: b - 1, marker: T, rows: p.milestones.map(m => ({ label: m.name, start: p.start, plan: m.plan, forecast: m.forecast, done: m.done })) });
  C.paint($('dvC'), C.donut, { items: p.costBreakdown.map((c, i) => ({ ...c, color: ['#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#34d399'][i] })), center: money(p.ac, 0), sub: 'spent', fmt: v => v.toFixed(1) });
  C.paint($('dvT'), C.lineChart, { labels: MONTHS.slice(T - p.cpiTrend.length + 1, T + 1), legend: false, yFmt: v => v.toFixed(2),
    series: [{ name: 'CPI', color: bandColor(p.band), values: p.cpiTrend, fill: true }, { name: 'Target', color: 'rgba(255,255,255,.4)', values: p.cpiTrend.map(() => 1), dashed: true, hideLegend: true }] });
}

// ---------- guided data story ----------
const top3 = () => [...PROJECTS].sort((a, b) => b.overrun - a.overrun).slice(0, 3);
const STORY = [
  { t: 'The big picture', p: ['kpis'], x: () => { const P = lastCtx.P; return `${COMPANY} manages ${P.n} projects worth ${money(P.bac, 0)}. The portfolio is ${(P.pc * 100).toFixed(0)}% complete, but every dollar of work is costing about $${(1 / P.cpi).toFixed(2)}. That gap is the story.`; } },
  { t: 'Is it cost, time, or both?', p: ['gauges', 'matrix'], x: () => `The gauges show the portfolio CPI and SPI below 1.0. The matrix shows each project as a bubble: the bottom-left zone is over budget and late. Bigger bubbles mean bigger budgets, so look for large red bubbles.` },
  { t: 'Where the money leaks', p: ['overrun'], x: () => { const t = top3(), pos = PROJECTS.filter(p => p.overrun > 0).reduce((s, p) => s + p.overrun, 0); return `Sorted bars make ranking easy. Forecast overruns total ${money(pos, 0)}, and three projects, ${t.map(p => p.id).join(', ')}, cause ${Math.round(t.reduce((s, p) => s + p.overrun, 0) / pos * 100)}% of it.`; } },
  { t: 'Pitfall: pick the right chart', p: ['sector', 'overrun'], x: () => `Try ranking the sectors using only the donut: slices are hard to compare. The sorted bar answers a ranking question in one glance. Use donuts for simple part-to-whole shares, bars for comparison.` },
  { t: 'From insight to decision', p: ['table'], hl: () => top3().map(p => p.id), x: () => `Recommendation: take ${top3().map(p => p.id).join(', ')} to the steering committee and ask each PM for a recovery plan. Tap a highlighted row to see the evidence: S-curve, milestones and top risks.` },
];
function startStory(i) {
  state.story = i; const st = STORY[i]; state.hl = st.hl ? st.hl() : null;
  document.querySelectorAll('#dash .panel').forEach(el => { const on = st.p.includes(el.dataset.p); el.classList.toggle('spot', on); el.classList.toggle('dim', !on); });
  renderTable(filtered());
  $('storyBar').style.display = 'flex';
  $('storyText').innerHTML = `<b>${i + 1}/${STORY.length} · ${st.t}</b><br>${st.x()}`;
  $('storyPrev').disabled = i === 0; $('storyNext').textContent = i === STORY.length - 1 ? 'Finish' : 'Next';
  document.querySelector(`#dash [data-p="${st.p[0]}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
export function endStory() { state.story = -1; state.hl = null; $('storyBar').style.display = 'none'; document.querySelectorAll('#dash .panel').forEach(el => el.classList.remove('spot', 'dim')); renderTable(filtered()); }
$('storyPrev').onclick = () => startStory(Math.max(0, state.story - 1));
$('storyNext').onclick = () => state.story >= STORY.length - 1 ? endStory() : startStory(state.story + 1);
$('storyClose').onclick = endStory;
