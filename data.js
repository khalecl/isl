// PRACTICE DATA — invented for training. "Atlas Projects Group" is a fictional company.
// Units: USD millions. BAC = budget at completion, PV = planned value to date,
// AC = actual cost to date, pc = physical percent complete (0–1).
// Earned Value Management (EVM) formulas are applied below.

export const COMPANY = 'Atlas Projects Group';

const RAW = [
  { id: 'P01', name: 'Coastal Desalination Plant',  sector: 'Utilities',  bac: 140, pc: 0.55, pv: 82, ac: 98 },
  { id: 'P02', name: 'Metro Line Extension',        sector: 'Transport',  bac: 210, pc: 0.40, pv: 92, ac: 101 },
  { id: 'P03', name: 'Regional Hospital Wing',      sector: 'Health',     bac: 95,  pc: 0.70, pv: 64, ac: 68 },
  { id: 'P04', name: 'Solar Farm 150 MW',           sector: 'Energy',     bac: 120, pc: 0.80, pv: 94, ac: 90 },
  { id: 'P05', name: 'Logistics Warehouse Hub',     sector: 'Industrial', bac: 45,  pc: 0.90, pv: 41, ac: 39 },
  { id: 'P06', name: 'University Science Block',    sector: 'Education',  bac: 60,  pc: 0.65, pv: 40, ac: 44 },
  { id: 'P07', name: 'Gas Compression Station',     sector: 'Energy',     bac: 85,  pc: 0.50, pv: 50, ac: 54 },
  { id: 'P08', name: 'Smart Office Tower',          sector: 'Commercial', bac: 110, pc: 0.35, pv: 44, ac: 47 },
  { id: 'P09', name: 'Wastewater Network Upgrade',  sector: 'Utilities',  bac: 70,  pc: 0.60, pv: 45, ac: 46 },
  { id: 'P10', name: 'Wind Farm Substation',        sector: 'Energy',     bac: 38,  pc: 0.75, pv: 30, ac: 27 },
  { id: 'P11', name: 'Bridge Rehabilitation',       sector: 'Transport',  bac: 52,  pc: 0.45, pv: 30, ac: 31 },
  { id: 'P12', name: 'Data Centre Shell',           sector: 'Commercial', bac: 75,  pc: 0.30, pv: 26, ac: 22 },
];

// Cost-health bands used throughout the app (also the model answer for Level 3).
export const BANDS = [
  { key: 'risk',  label: 'At risk',  rule: 'CPI below 0.85',       color: '#e5484d' },
  { key: 'watch', label: 'Watch',    rule: 'CPI 0.85 to 0.95',     color: '#f5a524' },
  { key: 'ok',    label: 'On track', rule: 'CPI 0.95 or above',    color: '#30a46c' },
];

export function bandOf(cpi) {
  if (cpi < 0.85) return 'risk';
  if (cpi < 0.95) return 'watch';
  return 'ok';
}

export const PROJECTS = RAW.map(p => {
  const ev = p.bac * p.pc;            // earned value
  const cpi = ev / p.ac;              // cost performance index
  const spi = ev / p.pv;              // schedule performance index
  const eac = p.bac / cpi;            // estimate at completion
  const overrun = eac - p.bac;        // forecast overrun (+) or saving (-)
  return { ...p, ev, cpi, spi, eac, overrun, band: bandOf(cpi) };
});

export const SECTORS = [...new Set(PROJECTS.map(p => p.sector))];

export const fmt = (n, d = 1) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
