// Tiny canvas chart library. Every function draws into a 2D context of size w×h
// and returns "hits" (areas with tooltip HTML) so the dashboard can show tooltips.
import { TH, PAL } from './palette.js';
export { TH, PAL };
const F = (px, w = 400) => `${w} ${px}px ${TH.font}`;
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
const short = (v) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);

export function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------- line / area chart with data-date marker ----------
export function lineChart(g, w, h, { labels, series, marker, yFmt = short, yTitle, legend = true }) {
  const hits = [], padL = 44, padR = 12, padT = legend ? 26 : 10, padB = 24;
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const max = niceMax(Math.max(...all, 0) * 1.05), n = labels.length;
  const X = i => padL + (i / (n - 1)) * (w - padL - padR), Y = v => padT + (1 - v / max) * (h - padT - padB);
  g.font = F(11); g.textBaseline = 'middle';
  for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = Y(v); g.strokeStyle = TH.grid; g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
    g.fillStyle = TH.muted; g.textAlign = 'right'; g.fillText(yFmt(v), padL - 6, y); }
  const step = Math.ceil(n / Math.max(2, Math.floor((w - padL) / 52)));
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = 0; i < n; i += step) { g.fillStyle = TH.muted; g.fillText(labels[i], X(i), h - padB + 6); }
  if (marker != null) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(marker), padT); g.lineTo(X(marker), h - padB); g.stroke(); g.setLineDash([]);
    g.fillStyle = TH.text; g.font = F(10, 600); g.textAlign = 'left'; g.fillText('Data date', X(marker) + 4, padT + 2); }
  series.forEach(s => {
    g.strokeStyle = s.color; g.lineWidth = s.width || 2.2; g.setLineDash(s.dashed ? [6, 4] : []);
    g.beginPath(); let started = false;
    s.values.forEach((v, i) => { if (v == null) { started = false; return; } started ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); started = true; });
    g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    if (s.fill) { const grad = g.createLinearGradient(0, padT, 0, h - padB); grad.addColorStop(0, s.color + '55'); grad.addColorStop(1, s.color + '00');
      const idx = s.values.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
      if (idx.length) { g.beginPath(); g.moveTo(X(idx[0]), Y(0)); idx.forEach(i => g.lineTo(X(i), Y(s.values[i]))); g.lineTo(X(idx.at(-1)), Y(0)); g.closePath(); g.fillStyle = grad; g.fill(); } }
  });
  if (legend) { let x = padL; g.font = F(11); g.textBaseline = 'middle'; g.textAlign = 'left';
    series.filter(s => !s.hideLegend).forEach(s => { g.strokeStyle = s.color; g.lineWidth = 3; g.setLineDash(s.dashed ? [5, 3] : []); g.beginPath(); g.moveTo(x, 11); g.lineTo(x + 16, 11); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      g.fillStyle = TH.text; g.fillText(s.name, x + 20, 11); x += 30 + g.measureText(s.name).width; }); }
  for (let i = 0; i < n; i++) {
    const rows = series.filter(s => s.values[i] != null && !s.hideLegend).map(s => `<i style="background:${s.color}"></i>${s.name}: <b>${yFmt(s.values[i])}</b>`);
    if (rows.length) hits.push({ x: X(i) - (w - padL - padR) / n / 2, y: padT, w: (w - padL - padR) / n, h: h - padT - padB, html: `<b>${labels[i]}</b><br>${rows.join('<br>')}` });
  }
  return hits;
}

// ---------- horizontal bars (sorted, optional diverging) ----------
export function barH(g, w, h, { items, fmt = short, labelW = 40, onBarText = true }) {
  const hits = [], padT = 6, padB = 6, n = items.length, rowH = (h - padT - padB) / n;
  const min = Math.min(0, ...items.map(i => i.value)), max = Math.max(0, ...items.map(i => i.value));
  const negPad = min < 0 ? 38 : 4, span = (max - min) || 1, x0 = labelW + negPad + (-min / span) * (w - labelW - negPad - 46), scale = (w - labelW - negPad - 46) / span;
  g.font = F(Math.min(12, rowH * 0.6)); g.textBaseline = 'middle';
  items.forEach((it, i) => {
    const y = padT + i * rowH, bw = it.value * scale, bh = Math.max(3, rowH * 0.62);
    g.fillStyle = TH.muted; g.textAlign = 'left'; g.fillText(it.label, 2, y + rowH / 2);
    g.fillStyle = it.color; rr(g, Math.min(x0, x0 + bw), y + (rowH - bh) / 2, Math.max(2, Math.abs(bw)), bh, 3); g.fill();
    if (onBarText) { g.fillStyle = TH.text; g.textAlign = it.value >= 0 ? 'left' : 'right'; g.fillText(fmt(it.value), it.value >= 0 ? x0 + bw + 5 : x0 + bw - 5, y + rowH / 2); }
    hits.push({ x: 0, y, w, h: rowH, html: it.tip || `<b>${it.label}</b>: ${fmt(it.value)}`, id: it.id });
  });
  g.strokeStyle = TH.axis; g.beginPath(); g.moveTo(x0, padT); g.lineTo(x0, h - padB); g.stroke();
  return hits;
}

// ---------- vertical columns (supports actual vs forecast) ----------
export function columns(g, w, h, { labels, values, colors, fmt = short, marker }) {
  const hits = [], padL = 36, padR = 6, padT = 10, padB = 22, n = values.length;
  const max = niceMax(Math.max(...values.map(v => v || 0)) * 1.1), bw = (w - padL - padR) / n;
  g.font = F(10); g.textBaseline = 'middle';
  for (let k = 0; k <= 3; k++) { const v = max * k / 3, y = padT + (1 - v / max) * (h - padT - padB);
    g.strokeStyle = TH.grid; g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke(); g.fillStyle = TH.muted; g.textAlign = 'right'; g.fillText(fmt(v), padL - 5, y); }
  values.forEach((v, i) => { if (v == null) return; const x = padL + i * bw, bh = (v / max) * (h - padT - padB);
    g.fillStyle = colors[i]; rr(g, x + bw * 0.16, h - padB - bh, bw * 0.68, bh, 3); g.fill();
    if (i % Math.ceil(n / 8) === 0) { g.fillStyle = TH.muted; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(labels[i], x + bw / 2, h - padB + 5); g.textBaseline = 'middle'; }
    hits.push({ x, y: padT, w: bw, h: h - padT - padB, html: `<b>${labels[i]}</b><br>${i > marker ? 'Forecast' : 'Actual'} spend: <b>$${fmt(v)}M</b>` }); });
  if (marker != null) { const x = padL + (marker + 1) * bw; g.strokeStyle = 'rgba(255,255,255,.45)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, padT); g.lineTo(x, h - padB); g.stroke(); g.setLineDash([]); }
  return hits;
}

// ---------- donut ----------
export function donut(g, w, h, { items, center, sub, fmt = short, legend = true }) {
  const hits = [], tot = items.reduce((s, i) => s + i.value, 0);
  const lw = legend ? Math.min(150, w * 0.45) : 0, cx = (w - lw) / 2, cy = h / 2, R = Math.min(cx, cy) - 6, r = R * 0.62;
  if (R <= 4) return hits;
  let a = -Math.PI / 2;
  items.forEach(it => { const da = it.value / tot * Math.PI * 2;
    g.beginPath(); g.arc(cx, cy, R, a, a + da); g.arc(cx, cy, r, a + da, a, true); g.closePath(); g.fillStyle = it.color; g.fill();
    g.strokeStyle = 'rgba(10,14,30,.9)'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
    hits.push({ arc: [cx, cy, r, R, a, a + da], html: `<b>${it.label}</b><br>$${fmt(it.value)}M · ${(it.value / tot * 100).toFixed(1)}%` }); a += da; });
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = TH.text; g.font = F(Math.max(12, R * 0.3), 700); g.fillText(center, cx, cy - (sub ? R * 0.1 : 0));
  if (sub) { g.font = F(Math.max(10, R * 0.13)); g.fillStyle = TH.muted; g.fillText(sub, cx, cy + R * 0.22); }
  if (legend) { const lh = Math.min(20, (h - 10) / items.length); g.font = F(Math.min(11.5, lh * 0.65)); g.textAlign = 'left';
    items.forEach((it, i) => { const y = (h - lh * items.length) / 2 + i * lh + lh / 2, x = w - lw + 8;
      g.fillStyle = it.color; rr(g, x, y - 5, 10, 10, 2); g.fill(); g.fillStyle = TH.text; g.fillText(`${it.label}`, x + 15, y);
      g.fillStyle = TH.muted; g.textAlign = 'right'; g.fillText((it.value / tot * 100).toFixed(0) + '%', w - 2, y); g.textAlign = 'left'; }); }
  return hits;
}

// ---------- semicircle gauge ----------
export function gauge(g, w, h, { value, min = 0, max = 2, bands, label, fmt = v => v.toFixed(2), target }) {
  const cx = w / 2, R = Math.min(w / 2 - 16, (h - 34) / 1.45), cy = Math.max(R + 6, (h - (R * 1.45 + 30)) / 2 + R), lw = R * 0.17;
  if (R <= 4) return [];
  const ang = v => Math.PI + (Math.min(max, Math.max(min, v)) - min) / (max - min) * Math.PI;
  bands.forEach(([a, b, c]) => { g.beginPath(); g.arc(cx, cy, R, ang(a), ang(b)); g.strokeStyle = c + '55'; g.lineWidth = lw; g.stroke(); });
  const col = (bands.find(([a, b]) => value >= a && value < b) || bands.at(-1))[2];
  g.beginPath(); g.arc(cx, cy, R, Math.PI, ang(value)); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
  if (target != null) { const t = ang(target); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + Math.cos(t) * (R - lw * 0.8), cy + Math.sin(t) * (R - lw * 0.8)); g.lineTo(cx + Math.cos(t) * (R + lw * 0.8), cy + Math.sin(t) * (R + lw * 0.8)); g.stroke(); }
  const t = ang(value); g.strokeStyle = TH.text; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * R * 0.66, cy + Math.sin(t) * R * 0.66); g.stroke();
  g.fillStyle = TH.text; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill(); g.lineWidth = 1;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.textBaseline = 'top'; g.font = F(Math.max(14, R * 0.3), 700); g.fillStyle = col; g.fillText(fmt(value), cx, cy + 9); g.textBaseline = 'alphabetic';
  g.font = F(Math.max(10, Math.min(13, R * 0.15)), 600); g.fillStyle = TH.muted; g.textBaseline = 'top'; g.fillText(label, cx, Math.min(h - 16, cy + 12 + R * 0.34)); g.textBaseline = 'alphabetic';
  g.font = F(9.5); g.fillStyle = TH.muted; g.fillText(fmt(min), cx - R, cy + 13); g.fillText(fmt(max), cx + R, cy + 13);
  return [{ x: 0, y: 0, w, h, html: `<b>${label}</b>: ${fmt(value)}` }];
}

// ---------- bubble scatter / quadrant ----------
export function scatter(g, w, h, { points, xLabel, yLabel, xr = [0.7, 1.15], yr = [0.7, 1.15], ref = [1, 1] }) {
  const hits = [], padL = 38, padR = 10, padT = 10, padB = 30;
  const X = v => padL + (v - xr[0]) / (xr[1] - xr[0]) * (w - padL - padR), Y = v => padT + (1 - (v - yr[0]) / (yr[1] - yr[0])) * (h - padT - padB);
  // quadrant shading
  g.fillStyle = 'rgba(240,80,90,0.08)'; g.fillRect(padL, Y(ref[1]), X(ref[0]) - padL, h - padB - Y(ref[1]));
  g.fillStyle = 'rgba(47,191,122,0.08)'; g.fillRect(X(ref[0]), padT, w - padR - X(ref[0]), Y(ref[1]) - padT);
  g.font = F(10); g.textBaseline = 'middle';
  for (let k = 0; k <= 4; k++) { const vx = xr[0] + (xr[1] - xr[0]) * k / 4, vy = yr[0] + (yr[1] - yr[0]) * k / 4;
    g.strokeStyle = TH.grid; g.beginPath(); g.moveTo(X(vx), padT); g.lineTo(X(vx), h - padB); g.moveTo(padL, Y(vy)); g.lineTo(w - padR, Y(vy)); g.stroke();
    g.fillStyle = TH.muted; g.textAlign = 'center'; g.fillText(vx.toFixed(2), X(vx), h - padB + 9); g.textAlign = 'right'; g.fillText(vy.toFixed(2), padL - 4, Y(vy)); }
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(ref[0]), padT); g.lineTo(X(ref[0]), h - padB); g.moveTo(padL, Y(ref[1])); g.lineTo(w - padR, Y(ref[1])); g.stroke(); g.setLineDash([]);
  g.fillStyle = TH.muted; g.textAlign = 'center'; g.fillText(xLabel, (padL + w - padR) / 2, h - 6);
  g.save(); g.translate(10, (padT + h - padB) / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();
  g.font = F(9, 600); g.fillStyle = 'rgba(240,80,90,.8)'; g.textAlign = 'left'; g.fillText('Over budget & late', padL + 4, h - padB - 8);
  g.fillStyle = 'rgba(47,191,122,.85)'; g.textAlign = 'right'; g.fillText('Under budget & ahead', w - padR - 4, padT + 8);
  [...points].sort((a, b) => b.r - a.r).forEach(p => { const x = X(Math.min(xr[1], Math.max(xr[0], p.x))), y = Y(Math.min(yr[1], Math.max(yr[0], p.y)));
    g.beginPath(); g.arc(x, y, p.r, 0, 7); g.fillStyle = p.color + 'aa'; g.fill(); g.strokeStyle = p.color; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
    g.fillStyle = TH.text; g.font = F(9.5, 700); g.textAlign = 'center'; g.fillText(p.label, x, y);
    hits.push({ cx: x, cy: y, r: Math.max(p.r, 10), html: p.tip, id: p.id }); });
  return hits;
}

// ---------- 5×5 risk heatmap ----------
export function heatmap(g, w, h, { matrix }) {
  const hits = [], padL = 22, padB = 22, padT = 4, cw = (w - padL - 4) / 5, ch = (h - padB - padT) / 5;
  for (let L = 0; L < 5; L++) for (let I = 0; I < 5; I++) {
    const score = (L + 1) * (I + 1), c = score >= 15 ? PAL.risk : score >= 8 ? PAL.watch : PAL.ok;
    const x = padL + I * cw, y = padT + (4 - L) * ch, n = matrix[L][I];
    g.fillStyle = c + (n ? 'cc' : '33'); rr(g, x + 2, y + 2, cw - 4, ch - 4, 4); g.fill();
    if (n) { g.fillStyle = '#0b1020'; g.font = F(Math.min(16, ch * 0.45), 700); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x + cw / 2, y + ch / 2); }
    hits.push({ x, y, w: cw, h: ch, html: `Likelihood ${L + 1} × Impact ${I + 1} = score ${score}<br><b>${n}</b> risk${n === 1 ? '' : 's'}` });
  }
  g.fillStyle = TH.muted; g.font = F(10); g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = 0; i < 5; i++) g.fillText(i + 1, padL + i * cw + cw / 2, h - padB + 3);
  g.fillText('Impact →', padL + 2.5 * cw, h - 10);
  g.textBaseline = 'middle'; for (let i = 0; i < 5; i++) g.fillText(i + 1, 8, padT + (4 - i) * ch + ch / 2);
  return hits;
}

// ---------- Gantt with plan vs forecast ----------
export function gantt(g, w, h, { rows, labels, from, to, marker }) {
  const hits = [], padL = Math.min(150, w * 0.36), padT = 18, rowH = (h - padT - 4) / rows.length;
  const X = m => padL + (m - from) / (to - from) * (w - padL - 8);
  g.font = F(10); g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let m = from; m <= to; m += 3) { g.strokeStyle = TH.grid; g.beginPath(); g.moveTo(X(m), padT); g.lineTo(X(m), h); g.stroke(); g.fillStyle = TH.muted; g.fillText(labels[m], X(m), 8); }
  rows.forEach((r, i) => { const y = padT + i * rowH + rowH / 2;
    g.fillStyle = TH.text; g.textAlign = 'left'; g.font = F(Math.min(11.5, rowH * 0.42)); g.fillText(r.label, 2, y);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(r.start), y); g.lineTo(X(r.plan), y); g.stroke(); g.lineWidth = 1;
    const diamond = (x, c, filled) => { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); if (filled) { g.fillStyle = c; g.fill(); } else { g.strokeStyle = c; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; } };
    diamond(X(r.plan), 'rgba(255,255,255,.7)', false);
    const late = r.forecast > r.plan; diamond(X(r.forecast), r.done ? PAL.ok : late ? PAL.risk : '#38bdf8', true);
    hits.push({ x: 0, y: y - rowH / 2, w, h: rowH, html: `<b>${r.label}</b><br>Plan: ${labels[r.plan]}<br>${r.done ? 'Achieved' : 'Forecast'}: ${labels[r.forecast]}${late && !r.done ? ` (<b>${r.forecast - r.plan} mo late</b>)` : ''}` }); });
  if (marker != null) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(marker), padT); g.lineTo(X(marker), h); g.stroke(); g.setLineDash([]); }
  return hits;
}

export function sparkline(g, w, h, { values, color, ref }) {
  const v = values.filter(x => x != null); if (v.length < 2) return [];
  let mn = Math.min(...v, ref ?? Infinity), mx = Math.max(...v, ref ?? -Infinity); if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
  const X = i => 2 + i / (v.length - 1) * (w - 4), Y = x => 2 + (1 - (x - mn) / (mx - mn)) * (h - 4);
  if (ref != null) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(0, Y(ref)); g.lineTo(w, Y(ref)); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = color; g.lineWidth = 1.8; g.beginPath(); v.forEach((x, i) => i ? g.lineTo(X(i), Y(x)) : g.moveTo(X(i), Y(x))); g.stroke(); g.lineWidth = 1;
  g.fillStyle = color; g.beginPath(); g.arc(X(v.length - 1), Y(v.at(-1)), 2.5, 0, 7); g.fill();
  return [];
}

// draw a chart into a <canvas> sized to its CSS box (HiDPI-aware)
export function paint(canvas, fn, opts) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (r.width < 4 || r.height < 4) return canvas._hits || [];          // hidden: skip
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  canvas._hits = fn(g, w, h, opts) || [];
  return canvas._hits;
}
export function hitTest(hits, x, y) {
  for (const h of hits || []) {
    if (h.arc) { const [cx, cy, r, R, a0, a1] = h.arc, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); let a = Math.atan2(dy, dx); while (a < a0) a += Math.PI * 2; if (d >= r && d <= R && a <= a1) return h; }
    else if (h.cx != null) { if (Math.hypot(x - h.cx, y - h.cy) <= h.r) return h; }
    else if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}
