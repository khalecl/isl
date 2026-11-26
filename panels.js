import { PAL, TH, SETTINGS, HOLO, wallGlass, withGlass, onTheme, applyTheme, PALETTES } from './palette.js';
// Panel registry: each panel draws itself with the chart library.
// The same panels are used in the Level 1 dashboard and on the Level 3 floating glass wall.
import * as C from './charts.js';
import { PROJECTS, MONTHS, T, DATA_DATE, SECTORS, SECTOR_COLORS, bandColor, bandLabel, curCPI, curSPI, portfolio, fmt, money, ALERTS } from './data.js';

const cpiBands = [[0.6, 0.85, PAL.risk], [0.85, 0.95, PAL.watch], [0.95, 1.2, PAL.ok]];
const tipP = p => `<b>${p.id} · ${p.name}</b><br>${p.sector} · ${p.region}<br>CPI ${curCPI(p).toFixed(2)} · SPI ${curSPI(p).toFixed(2)}<br>Budget ${money(p.bac, 0)} · Forecast ${money(p.bac / curCPI(p))}<br><span style="color:${bandColor(p.band)}">${bandLabel(p.band)}</span>`;

export function kpiList(P) {
  return [
    { k: 'Portfolio budget', v: money(P.bac, 0), s: `${P.n} projects`, spark: P.pvS.slice(T - 11, T + 1) },
    { k: 'Earned value', v: money(P.ev, 1), s: `${(P.pc * 100).toFixed(1)}% complete`, spark: P.evS.slice(T - 11, T + 1), c: '#38bdf8' },
    { k: 'Actual cost', v: money(P.ac, 1), s: `CV ${money(P.ev - P.ac)}`, spark: P.acS.slice(T - 11, T + 1), c: '#f472b6', bad: P.ev < P.ac },
    { k: 'Forecast overrun', v: money(P.overrun, 1), s: `EAC ${money(P.eac, 0)}`, c: PAL.risk, bad: P.overrun > 0 },
    { k: 'Portfolio CPI', v: P.cpi.toFixed(3), s: P.cpi < 1 ? 'over budget' : 'under budget', bad: P.cpi < 0.95, c: bandColor(P.cpi < 0.85 ? 'risk' : P.cpi < 0.95 ? 'watch' : 'ok') },
    { k: 'Portfolio SPI', v: P.spi.toFixed(3), s: P.spi < 1 ? 'behind plan' : 'ahead of plan', bad: P.spi < 0.95, c: bandColor(P.spi < 0.85 ? 'risk' : P.spi < 0.95 ? 'watch' : 'ok') },
    { k: 'Crew on site (live)', v: fmt(P.crew, 0), s: 'all active sites', c: '#a78bfa' },
    { k: 'Critical risks', v: String(P.critical), s: `${P.risks} open risks`, bad: P.critical > 5, c: PAL.watch },
  ];
}

export const PANELS = {
  gauges: { title: 'Portfolio health gauges', draw(g, w, h, { P }) {
    const gw = w / 3; const hits = [];
    [[P.cpi, 'CPI', cpiBands, 0.6, 1.2, 1], [P.spi, 'SPI', cpiBands, 0.6, 1.2, 1], [P.pc * 100, '% complete', [[0, 100, '#38bdf8']], 0, 100, null]].forEach(([v, l, b, mn, mx, t], i) => {
      g.save(); g.translate(gw * i, 0);
      hits.push(...C.gauge(g, gw, h, { value: v, label: l, bands: b, min: mn, max: mx, target: t, fmt: l === '% complete' ? x => x.toFixed(0) + '%' : x => x.toFixed(2) }).map(x => ({ ...x, x: x.x + gw * i })));
      g.restore(); });
    return hits; } },
  scurve: { title: 'Cumulative cost S-curve (USD M)', draw(g, w, h, { P }) {
    const from = 0, to = Math.min(MONTHS.length, 44), sl = a => a.slice(from, to);
    return C.lineChart(g, w, h, { labels: sl(MONTHS), marker: T - from, series: [
      { name: 'Planned (PV)', color: '#93a4c3', values: sl(P.pvS), width: 2 },
      { name: 'Earned (EV)', color: '#38bdf8', values: sl(P.evS), fill: true },
      { name: 'Actual (AC)', color: '#f472b6', values: sl(P.acS) },
      { name: 'EV forecast', color: '#38bdf8', values: sl(P.evF), dashed: true },
      { name: 'AC forecast', color: '#f472b6', values: sl(P.acF), dashed: true } ] }); } },
  overrun: { title: 'Forecast overrun by project (USD M), sorted', draw(g, w, h, { list }) {
    const items = [...list].map(p => ({ p, o: p.bac / curCPI(p) - p.bac })).sort((a, b) => b.o - a.o)
      .map(({ p, o }) => ({ label: p.id, value: o, color: o > 0 ? bandColor(p.band) : PAL.ok, tip: tipP(p), id: p.id }));
    return C.barH(g, w, h, { items, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1), labelW: 32 }); } },
  matrix: { title: 'Performance matrix: CPI vs SPI (bubble = budget)', draw(g, w, h, { list }) {
    const mx = Math.max(...PROJECTS.map(p => p.bac)), k = Math.min(w, h) / 300;
    return C.scatter(g, w, h, { xLabel: 'SPI (schedule) →', yLabel: 'CPI (cost) →', xr: [0.72, 1.12], yr: [0.72, 1.12],
      points: list.map(p => ({ x: curSPI(p), y: curCPI(p), r: (8 + 18 * Math.sqrt(p.bac / mx)) * Math.max(0.7, k), color: bandColor(p.band), label: p.id.slice(1), tip: tipP(p), id: p.id })) }); } },
  sector: { title: 'Budget by sector', draw(g, w, h, { list }) {
    const items = SECTORS.map(s => ({ label: s, value: list.filter(p => p.sector === s).reduce((a, p) => a + p.bac, 0), color: SECTOR_COLORS[s] })).filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    const tot = items.reduce((a, i) => a + i.value, 0);
    return C.donut(g, w, h, { items, center: money(tot, 0), sub: 'total budget', fmt: v => v.toFixed(0) }); } },
  spend: { title: 'Monthly spend: actual and forecast (USD M)', draw(g, w, h, { P }) {
    const a = T - 11, b = Math.min(MONTHS.length, T + 7);
    const vals = P.monthlySpend.slice(a, b), labels = MONTHS.slice(a, b);
    return C.columns(g, w, h, { labels, values: vals, marker: T - a, colors: vals.map((_, i) => a + i <= T ? '#a78bfa' : 'rgba(167,139,250,0.35)'), fmt: v => v.toFixed(0) }); } },
  risk: { title: 'Risk heat map (likelihood × impact)', draw(g, w, h, { P }) { return C.heatmap(g, w, h, { matrix: P.riskMatrix }); } },
  live: { title: 'Live site feed (simulated)', draw(g, w, h, { list }) {
    const act = list.filter(p => p.finishFcst > T), rowH = Math.min(26, (h - 18) / Math.max(1, act.length)), hits = [];
    g.font = `600 10px ${C.TH.font}`; g.fillStyle = C.TH.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('Project', 2, 8); g.fillText('Crew', w * 0.2, 8); g.fillText('Equipment utilisation', w * 0.38, 8);
    act.forEach((p, i) => { const y = 18 + i * rowH + rowH / 2;
      g.font = `${Math.min(12, rowH * 0.5)}px ${C.TH.font}`; g.fillStyle = C.TH.text; g.textAlign = 'left'; g.fillText(p.id, 2, y);
      g.fillText(fmt(p.live.crew, 0), w * 0.2, y);
      const bx = w * 0.38, bw = w * 0.5, u = p.live.util / 100;
      g.fillStyle = 'rgba(255,255,255,.08)'; C.rr(g, bx, y - rowH * 0.22, bw, rowH * 0.44, 4); g.fill();
      g.fillStyle = u < 0.5 ? PAL.watch : PAL.ok; C.rr(g, bx, y - rowH * 0.22, bw * u, rowH * 0.44, 4); g.fill();
      g.fillStyle = C.TH.text; g.textAlign = 'right'; g.fillText(p.live.util + '%', w - 2, y);
      hits.push({ x: 0, y: y - rowH / 2, w, h: rowH, html: `<b>${p.id} ${p.name}</b><br>Crew on site: ${p.live.crew}<br>Equipment utilisation: ${p.live.util}%`, id: p.id }); });
    return hits; } },
  hse: { title: 'Safety & quality', draw(g, w, h, { list, P }) {
    const items = [['Man-hours', fmt(P.hse.manHours / 1e6, 2) + ' M'], ['Lost-time injuries', P.hse.lti], ['TRIR', P.hse.trir.toFixed(2)],
      ['Open NCRs', list.reduce((s, p) => s + p.quality.ncr, 0)], ['Open RFIs', list.reduce((s, p) => s + p.quality.rfi, 0)], ['Change orders', list.reduce((s, p) => s + p.quality.changeOrders, 0)]];
    const cols = 3, cw = w / cols, ch = h / 2;
    items.forEach(([k, v], i) => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.fillStyle = 'rgba(255,255,255,.05)'; C.rr(g, x + 4, y + 4, cw - 8, ch - 8, 10); g.fill();
      g.fillStyle = C.TH.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.min(26, ch * 0.3)}px ${C.TH.font}`; g.fillText(v, x + cw / 2, y + ch * 0.45);
      g.fillStyle = C.TH.muted; g.font = `${Math.min(12, ch * 0.15)}px ${C.TH.font}`; g.fillText(k, x + cw / 2, y + ch * 0.75); });
    return [{ x: 0, y: 0, w, h, html: 'TRIR = recordable injuries × 200,000 ÷ man-hours' }]; } },
  alerts: { title: 'Alerts feed', draw(g, w, h) {
    const rowH = 24, n = Math.floor((h - 4) / rowH);
    ALERTS.slice(0, n).forEach((a, i) => { const y = 4 + i * rowH + rowH / 2, c = a.lvl === 'risk' ? PAL.risk : a.lvl === 'watch' ? PAL.watch : '#38bdf8';
      g.fillStyle = c; g.beginPath(); g.arc(8, y, 4, 0, 7); g.fill();
      g.fillStyle = C.TH.muted; g.font = `11px ${C.TH.font}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(a.time.toLocaleTimeString('en-GB'), 18, y); g.fillStyle = C.TH.text; g.fillText(a.msg, 82, y); });
    if (!ALERTS.length) { g.fillStyle = C.TH.muted; g.font = `12px ${C.TH.font}`; g.fillText('Waiting for live updates…', 10, 16); }
    return []; } },
  kpis: { title: 'Key performance indicators', draw(g, w, h, { P }) {     // used on the 3D wall
    const ks = kpiList(P), cols = 4, cw = w / cols, ch = h / 2;
    ks.forEach((k, i) => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.fillStyle = 'rgba(255,255,255,.06)'; C.rr(g, x + 5, y + 5, cw - 10, ch - 10, 12); g.fill();
      g.fillStyle = C.TH.muted; g.font = `${Math.min(13, ch * 0.13)}px ${C.TH.font}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(k.k, x + 16, y + 16);
      g.fillStyle = k.bad ? '#ff8a90' : C.TH.text; g.font = `700 ${Math.min(30, ch * 0.3)}px ${C.TH.font}`; g.fillText(k.v, x + 16, y + ch * 0.34);
      g.fillStyle = C.TH.muted; g.font = `${Math.min(12, ch * 0.12)}px ${C.TH.font}`; g.fillText(k.s, x + 16, y + ch * 0.72); });
    return []; } },
  clock: { title: 'Control room clock', draw(g, w, h) {
    const now = new Date(), cx = w * 0.3, cy = h / 2, R = Math.min(w * 0.26, h * 0.42);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.sin(a) * R * 0.85, cy - Math.cos(a) * R * 0.85); g.lineTo(cx + Math.sin(a) * R * 0.95, cy - Math.cos(a) * R * 0.95); g.stroke(); }
    const hand = (a, l, wd, c) => { g.strokeStyle = c; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * l, cy - Math.cos(a) * l); g.stroke(); };
    const s = now.getSeconds(), m = now.getMinutes() + s / 60, hr = (now.getHours() % 12) + m / 60;
    hand(hr / 12 * Math.PI * 2, R * 0.5, 5, '#e6efff'); hand(m / 60 * Math.PI * 2, R * 0.75, 3, '#e6efff'); hand(s / 60 * Math.PI * 2, R * 0.85, 1.5, '#38bdf8'); g.lineCap = 'butt'; g.lineWidth = 1;
    g.fillStyle = C.TH.text; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `700 ${Math.min(44, h * 0.2)}px ${C.TH.font}`;
    g.fillText(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), w * 0.6, h * 0.36);
    g.font = `${Math.min(16, h * 0.08)}px ${C.TH.font}`; g.fillStyle = C.TH.muted; g.fillText(now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), w * 0.6, h * 0.56);
    g.fillText('Data date: ' + DATA_DATE, w * 0.6, h * 0.7);
    return []; } },
};

export function ctxFor(list) { const P = portfolio(list); P.n = list.length; return { list, P }; }
