// PRACTICE DATA — invented for training. "Atlas Projects Group" is a fictional company.
// Units: USD millions unless stated. Monthly calendar Jan 2025 → Dec 2029.
// Earned Value Management (EVM): PV planned value, EV earned value, AC actual cost,
// CPI = EV/AC, SPI = EV/PV, EAC = BAC/CPI.

export const COMPANY = 'Atlas Projects Group';
export const MONTHS = [];
for (let y = 2025; y <= 2029; y++) for (let m = 0; m < 12; m++)
  MONTHS.push(new Date(y, m, 1).toLocaleString('en-US', { month: 'short' }) + ' ' + String(y).slice(2));
export const T = 21;                    // data date index = Oct 2026 (month-end status)
export const DATA_DATE = MONTHS[T];

const RAW = [
  { id: 'P01', name: 'Coastal Desalination Plant', sector: 'Utilities', region: 'Middle East & Africa', pm: 'A. Okafor', bac: 140, pc: 0.55, pv: 82, ac: 98, start: 3 },
  { id: 'P02', name: 'Metro Line Extension', sector: 'Transport', region: 'Europe', pm: 'L. Moreau', bac: 210, pc: 0.40, pv: 92, ac: 101, start: 6 },
  { id: 'P03', name: 'Regional Hospital Wing', sector: 'Health', region: 'North America', pm: 'J. Patel', bac: 95, pc: 0.70, pv: 64, ac: 68, start: 2 },
  { id: 'P04', name: 'Solar Farm 150 MW', sector: 'Energy', region: 'Asia-Pacific', pm: 'M. Tanaka', bac: 120, pc: 0.80, pv: 94, ac: 90, start: 4 },
  { id: 'P05', name: 'Logistics Warehouse Hub', sector: 'Industrial', region: 'Europe', pm: 'S. Novak', bac: 45, pc: 0.90, pv: 41, ac: 39, start: 8 },
  { id: 'P06', name: 'University Science Block', sector: 'Education', region: 'North America', pm: 'R. Silva', bac: 60, pc: 0.65, pv: 40, ac: 44, start: 5 },
  { id: 'P07', name: 'Gas Compression Station', sector: 'Energy', region: 'Latin America', pm: 'C. Mendes', bac: 85, pc: 0.50, pv: 50, ac: 54, start: 7 },
  { id: 'P08', name: 'Smart Office Tower', sector: 'Commercial', region: 'Asia-Pacific', pm: 'H. Lim', bac: 110, pc: 0.35, pv: 44, ac: 47, start: 9 },
  { id: 'P09', name: 'Wastewater Network Upgrade', sector: 'Utilities', region: 'Europe', pm: 'K. Berg', bac: 70, pc: 0.60, pv: 45, ac: 46, start: 4 },
  { id: 'P10', name: 'Wind Farm Substation', sector: 'Energy', region: 'Europe', pm: 'E. Larsen', bac: 38, pc: 0.75, pv: 30, ac: 27, start: 10 },
  { id: 'P11', name: 'Bridge Rehabilitation', sector: 'Transport', region: 'North America', pm: 'D. Brooks', bac: 52, pc: 0.45, pv: 30, ac: 31, start: 8 },
  { id: 'P12', name: 'Data Centre Shell', sector: 'Commercial', region: 'Middle East & Africa', pm: 'N. Haddad', bac: 75, pc: 0.30, pv: 26, ac: 22, start: 12 },
];

export const BANDS = [
  { key: 'risk', label: 'At risk', rule: 'CPI below 0.85', color: '#f0505a' },
  { key: 'watch', label: 'Watch', rule: 'CPI 0.85 to 0.95', color: '#f5a524' },
  { key: 'ok', label: 'On track', rule: 'CPI 0.95 or above', color: '#2fbf7a' },
];
export const bandOf = cpi => cpi < 0.85 ? 'risk' : cpi < 0.95 ? 'watch' : 'ok';
export const bandColor = k => BANDS.find(b => b.key === k).color;
export const bandLabel = k => BANDS.find(b => b.key === k).label;
export const SECTOR_COLORS = { Utilities: '#38bdf8', Transport: '#a78bfa', Health: '#f472b6', Energy: '#facc15', Industrial: '#fb923c', Education: '#34d399', Commercial: '#60a5fa' };

// deterministic pseudo-random numbers so every trainee sees the same data
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const S = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);   // S-curve (smoothstep)
function invS(f) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; S(m) < f ? lo = m : hi = m; } return (lo + hi) / 2; }

const MILESTONES = [['Design complete', 0.15], ['Procurement complete', 0.35], ['Construction 50%', 0.6], ['Mechanical completion', 0.85], ['Handover', 1]];
const COST_TYPES = ['Labour', 'Materials', 'Equipment', 'Subcontract', 'Indirects'];
const RISK_POOL = {
  Utilities: ['Membrane supplier delay', 'Marine permit conditions', 'Pump vibration rework', 'Power connection date'],
  Transport: ['Tunnel ground conditions', 'Traffic management approvals', 'Signalling interface', 'Utility diversions'],
  Health: ['Medical gas commissioning', 'Infection-control phasing', 'Equipment lead times'],
  Energy: ['Transformer lead time', 'Grid connection approval', 'Compressor package delay', 'Crane availability'],
  Industrial: ['Racking supplier capacity', 'Fire system approval'],
  Education: ['Lab fit-out design changes', 'Term-time noise limits', 'Fume cupboard supply'],
  Commercial: ['Façade design change', 'Lift supplier delay', 'Tenant fit-out scope', 'Cooling plant redesign'],
};

export const PROJECTS = RAW.map((p, idx) => {
  const r = rng(idx * 97 + 13);
  const ev = p.bac * p.pc, cpi = ev / p.ac, spi = ev / p.pv, eac = p.bac / cpi;
  const elapsed = T + 1 - p.start;
  const d = elapsed / invS(p.pv / p.bac);          // planned duration (months)
  const df = elapsed / invS(ev / p.bac);           // forecast duration at current pace
  const pvS = [], evS = [], acS = [], evF = [], acF = [];
  for (let m = 0; m < MONTHS.length; m++) {
    const x = (m + 1 - p.start);
    pvS.push(p.bac * S(x / d));
    if (m <= T) {
      const rr = Math.max(0, x / elapsed);
      const wig = 1 + 0.03 * Math.sin(m * 1.7 + idx) * (1 - rr);
      const k = 1 + (spi - 1) * Math.pow(rr, 0.7), c = 1 + (cpi - 1) * Math.pow(rr, 0.8);
      const e = pvS[m] * k * wig; evS.push(e); acS.push(e / c);
      evF.push(null); acF.push(null);
    } else {
      evS.push(null); acS.push(null);
      const e = p.bac * S(x / df); evF.push(e); acF.push(e / cpi);
    }
  }
  evS[T] = ev; acS[T] = p.ac; evF[T] = ev; acF[T] = p.ac;
  const finishPlan = Math.min(MONTHS.length - 1, Math.round(p.start + d - 1));
  const finishFcst = Math.min(MONTHS.length - 1, Math.round(p.start + df - 1));
  const milestones = MILESTONES.map(([name, f]) => {
    const plan = Math.round(p.start + d * invS(f) - 1), fc = Math.round(p.start + df * invS(f) - 1);
    const done = S(invS(f)) * p.bac <= ev + 0.001 && f <= p.pc;
    return { name, plan: Math.min(plan, MONTHS.length - 1), forecast: Math.min(fc, MONTHS.length - 1), done };
  });
  let shares = COST_TYPES.map(() => 0.5 + r()); const tot = shares.reduce((a, b) => a + b, 0); shares = shares.map(s => s / tot);
  const band = bandOf(cpi);
  const nRisks = band === 'risk' ? 7 + Math.floor(r() * 4) : band === 'watch' ? 4 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3);
  const risks = [];
  for (let i = 0; i < nRisks; i++) {
    const L = 1 + Math.floor(r() * 5), I = Math.min(5, 1 + Math.floor(r() * 5) + (band === 'risk' && i < 2 ? 2 : 0));
    const pool = RISK_POOL[p.sector];
    risks.push({ id: `${p.id}-R${String(i + 1).padStart(2, '0')}`, title: pool[i % pool.length] + (i >= pool.length ? ' (secondary)' : ''), L, I, score: L * I, owner: p.pm });
  }
  risks.sort((a, b) => b.score - a.score);
  const labourCost = p.ac * shares[0] * 1e6, manHours = Math.round(labourCost / 55);
  const lti = band === 'risk' ? 1 + Math.floor(r() * 2) : Math.floor(r() * 1.6);
  const recordables = lti + 1 + Math.floor(r() * 4);
  const crewBase = Math.round((p.bac / d) * 1e6 * shares[0] / (55 * 170) * (finishFcst > T ? 1 : 0.1));
  return {
    ...p, ev, cpi, spi, eac, overrun: eac - p.bac, band, vac: p.bac - eac, cv: ev - p.ac, sv: ev - p.pv,
    d, df, finishPlan, finishFcst, slip: finishFcst - finishPlan,
    series: { pv: pvS, ev: evS, ac: acS, evF, acF },
    cpiTrend: acS.slice(Math.max(p.start, T - 11), T + 1).map((a, i, arr) => { const m = Math.max(p.start, T - 11) + i; return evS[m] / a; }),
    milestones, costBreakdown: COST_TYPES.map((t, i) => ({ label: t, value: p.ac * shares[i] })),
    risks, hse: { manHours, lti, recordables, trir: recordables * 200000 / manHours, daysSinceLTI: lti ? 12 + Math.floor(r() * 120) : 300 + Math.floor(r() * 200) },
    quality: { ncr: Math.floor(r() * (band === 'risk' ? 14 : 6)), rfi: 5 + Math.floor(r() * 30), changeOrders: 2 + Math.floor(r() * (band === 'risk' ? 12 : 5)) },
    changeValue: (band === 'risk' ? 0.06 : 0.02) * p.bac * (0.5 + r()),
    crewBase: Math.max(25, crewBase), equipBase: 55 + Math.floor(r() * 35),
    live: { crew: Math.max(25, crewBase), util: 70, acDelta: 0, evDelta: 0 },
  };
});
export const SECTORS = [...new Set(PROJECTS.map(p => p.sector))];
export const REGIONS = [...new Set(PROJECTS.map(p => p.region))];
export const byId = Object.fromEntries(PROJECTS.map(p => [p.id, p]));

// ---- Portfolio aggregation (respects filters) ----
export function portfolio(list) {
  const sum = f => list.reduce((s, p) => s + f(p), 0);
  const bac = sum(p => p.bac), pv = sum(p => p.pv), ev = sum(p => p.ev + p.live.evDelta), ac = sum(p => p.ac + p.live.acDelta);
  const eac = sum(p => p.bac / curCPI(p));
  const seriesSum = key => MONTHS.map((_, m) => { let any = false, s = 0; list.forEach(p => { const v = p.series[key][m]; if (v != null) { any = true; s += v; } }); return any ? s : null; });
  const months = MONTHS.map((_, m) => m);
  const monthlySpend = months.map(m => { if (m === 0) return 0; const a = seriesSum('ac'), f = seriesSum('acF');
    const cur = a[m] ?? f[m], prev = a[m - 1] ?? f[m - 1]; return cur != null && prev != null ? cur - prev : null; });
  const riskMatrix = Array.from({ length: 5 }, () => Array(5).fill(0));
  list.forEach(p => p.risks.forEach(r => riskMatrix[r.L - 1][r.I - 1]++));
  const hse = { manHours: sum(p => p.hse.manHours), lti: sum(p => p.hse.lti), rec: sum(p => p.hse.recordables) };
  hse.trir = hse.manHours ? hse.rec * 200000 / hse.manHours : 0;
  return { bac, pv, ev, ac, eac, cpi: ev / ac, spi: ev / pv, pc: ev / bac, overrun: eac - bac,
    pvS: seriesSum('pv'), evS: seriesSum('ev'), acS: seriesSum('ac'), evF: seriesSum('evF'), acF: seriesSum('acF'),
    monthlySpend, riskMatrix, hse, crew: sum(p => p.live.crew), risks: sum(p => p.risks.length),
    critical: list.reduce((s, p) => s + p.risks.filter(r => r.score >= 15).length, 0) };
}
export const curCPI = p => (p.ev + p.live.evDelta) / (p.ac + p.live.acDelta);
export const curSPI = p => (p.ev + p.live.evDelta) / p.pv;

// ---- Simulated live feed: small site-level changes every tick ----
const liveR = rng(4242);
const listeners = [];
export const onTick = f => listeners.push(f);
export const ALERTS = [];
let tickN = 0;
export function tick() {
  tickN++;
  PROJECTS.forEach(p => {
    if (p.finishFcst <= T) return;
    const rate = p.bac / p.df / 720;                    // spend per simulated hour
    const a = rate * (0.6 + liveR() * 0.8);
    p.live.acDelta += a;
    p.live.evDelta += a * p.cpi * (0.96 + liveR() * 0.08);
    p.live.crew = Math.max(10, Math.round(p.crewBase * (0.9 + liveR() * 0.2)));
    p.live.util = Math.round(Math.min(98, Math.max(35, p.equipBase + (liveR() - 0.5) * 20)));
  });
  if (tickN % 3 === 0) {
    const p = PROJECTS[Math.floor(liveR() * PROJECTS.length)];
    const kinds = [
      () => [p.band === 'risk' ? 'risk' : 'info', `${p.id} cost update: CPI now ${curCPI(p).toFixed(3)}`],
      () => ['info', `${p.id} crew on site: ${p.live.crew}`],
      () => [p.live.util < 50 ? 'watch' : 'info', `${p.id} equipment utilisation ${p.live.util}%`],
      () => p.risks[0] ? [p.risks[0].score >= 15 ? 'risk' : 'watch', `${p.id} top risk review: ${p.risks[0].title}`] : ['info', `${p.id} status report received`],
    ];
    const [lvl, msg] = kinds[Math.floor(liveR() * kinds.length)]();
    ALERTS.unshift({ lvl, msg, time: new Date() }); ALERTS.length = Math.min(ALERTS.length, 30);
  }
  listeners.forEach(f => f());
}

export const fmt = (n, d = 1) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (n, d = 1) => (n < 0 ? '−$' : '$') + fmt(Math.abs(n), d) + 'M';
