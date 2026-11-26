// Shared colours. Everything (charts, gauges, 3D panels, twin) reads from PAL / TH at draw time,
// so changing the theme or palette re-colours the whole app.
export const PALETTES = {
  standard: { label: 'Standard', risk: '#f0505a', watch: '#f5a524', ok: '#2fbf7a' },
  cb:       { label: 'Colour-blind safe', risk: '#D55E00', watch: '#E69F00', ok: '#0072B2' },
  contrast: { label: 'High contrast', risk: '#ff1f3d', watch: '#ffd400', ok: '#00c853' },
};
export const HOLO = {          // Level 2 hologram styles (and the 3D glass panels)
  blue:    { label: 'Blue glass',   a: 'rgba(40,48,110,0.95)', b: 'rgba(12,16,44,0.95)', border: 'rgba(160,200,255,0.45)', title: '#cfe0ff', text: '#e6efff', muted: '#93a4c3', grid: 'rgba(255,255,255,0.08)', accent: 0x38bdf8, base: 0x1b2a6b },
  violet:  { label: 'Violet neon',  a: 'rgba(70,20,110,0.95)', b: 'rgba(25,8,45,0.95)',  border: 'rgba(230,120,255,0.7)',  title: '#f3d1ff', text: '#fbeaff', muted: '#c9a3dd', grid: 'rgba(255,200,255,0.10)', accent: 0xd946ef, base: 0x3b0f5c },
  emerald: { label: 'Emerald',      a: 'rgba(8,70,60,0.95)',   b: 'rgba(4,28,26,0.95)',  border: 'rgba(110,255,200,0.6)',  title: '#c8ffe9', text: '#e9fff6', muted: '#8cc9b2', grid: 'rgba(200,255,230,0.10)', accent: 0x10b981, base: 0x0b4a3c },
  light:   { label: 'Light glass',  a: 'rgba(255,255,255,0.96)', b: 'rgba(226,234,248,0.96)', border: 'rgba(60,90,160,0.45)', title: '#1d2a4a', text: '#0f1a33', muted: '#55627d', grid: 'rgba(0,0,0,0.08)', accent: 0x2563eb, base: 0xc7d4ee },
};
export const PAL = { ...PALETTES.standard };
export const TH = { text: '#e6efff', muted: '#93a4c3', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.22)',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' };
export const SETTINGS = { mode: 'dark', palette: 'standard', holo: 'blue' };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('storylab-theme') || '{}')); } catch { }

const DARK_TH = { text: '#e6efff', muted: '#93a4c3', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.22)' };
const LIGHT_TH = { text: '#0f1a33', muted: '#55627d', grid: 'rgba(0,0,0,0.08)', axis: 'rgba(0,0,0,0.25)' };
// glass used for the Level 3 wall follows the page mode; Level 2 uses SETTINGS.holo
export const wallGlass = () => SETTINGS.mode === 'light' ? HOLO.light : HOLO.blue;

const listeners = [];
export const onTheme = f => listeners.push(f);
export function applyTheme(patch = {}) {
  Object.assign(SETTINGS, patch);
  try { localStorage.setItem('storylab-theme', JSON.stringify(SETTINGS)); } catch { }
  Object.assign(PAL, PALETTES[SETTINGS.palette] || PALETTES.standard);
  Object.assign(TH, SETTINGS.mode === 'light' ? LIGHT_TH : DARK_TH);
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('light', SETTINGS.mode === 'light');
    const r = document.documentElement.style; r.setProperty('--risk', PAL.risk); r.setProperty('--watch', PAL.watch); r.setProperty('--ok', PAL.ok);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', SETTINGS.mode === 'light' ? '#eef2fa' : '#0b0f24');
  }
  listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}
// draw with a given glass style's text colours, then restore
export function withGlass(style, fn) { const keep = { ...TH }; Object.assign(TH, { text: style.text, muted: style.muted, grid: style.grid }); try { return fn(); } finally { Object.assign(TH, keep); } }
