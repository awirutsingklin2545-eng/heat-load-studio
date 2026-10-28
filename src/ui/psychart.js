// Psychrometric chart (SVG). Dry bulb on x, humidity ratio on y, saturation and RH curves,
// enthalpy and specific-volume lines, ASHRAE 55 comfort zone, and the design points of a room
// or project. Properties come from src/engine/psychro.js (ASHRAE Fundamentals 2025, Ch. 1).
import { useMemo, useState } from 'preact/hooks';
import { html, fmt } from './fields.js';
import { Ws, enthalpy, stateTRH, t_from_hW, comfortZone, pAtm, pws, W_from_pw } from '../engine/psychro.js';

const SIZE = { full: [640, 430, { l: 34, r: 46, t: 14, b: 34 }], small: [360, 340, { l: 22, r: 30, t: 10, b: 30 }] };
const COLORS = { room: '#0B8F7A', outdoor: '#E0601B', door: '#1F6FD1', makeup: '#B7791F', other: '#6B5BD2', supply: '#2AA3C9' };
const zoneCache = new Map();
function zones(p) {
  const key = Math.round(p * 10);
  if (!zoneCache.has(key)) zoneCache.set(key, [comfortZone(0.5, { p }), comfortZone(1.0, { p })]);
  return zoneCache.get(key);
}

// points: [{ key, label, t, RH, kind }], links: [[fromKey, toKey]]
export function PsyChart(props) {
  const [big, setBig] = useState(false);
  const [std, setStd] = useState(false);
  const { title, compact } = props;
  const tools = (inModal) => html`<span class="pc-tools"><button class="link" onClick=${() => setStd(!std)}>${std ? 'Fit to points' : 'Standard range'}</button>${inModal ? html`<button class="btn" onClick=${() => setBig(false)}>Close</button>` : html`<button class="link" onClick=${() => setBig(true)}>Enlarge</button>`}</span>`;
  return html`<div class=${`pc ${compact ? 'pc-compact' : ''}`}>
    <div class="pc-head"><b>${title || 'Psychrometric chart'}</b>${tools(false)}</div>
    <${ChartBody} ...${props} std=${std} small=${!!compact} />
    ${big && html`<div class="pc-modal" onClick=${(e) => { if (e.target === e.currentTarget) setBig(false); }}>
      <div class="pc-modal-in"><div class="pc-head"><b>${title || 'Psychrometric chart'}</b>${tools(true)}</div><${ChartBody} ...${props} std=${std} small=${false} table /></div></div>`}
  </div>`;
}

function ChartBody({ points, links = [], p = 101.325, comfort = false, title, std, small, table: showTable }) {
  const [VW, VH, M] = small ? SIZE.small : SIZE.full;
  const compact = small;
  const pts = useMemo(() => points
    .map((x) => ({ ...x, s: stateTRH(Number(x.t), Number(x.RH), p) }))
    .filter((x) => x.s && Number.isFinite(x.s.W)), [JSON.stringify(points), p]);

  // axis range: standard 0..50 °C, or fitted to the points (cold rooms need the left side)
  const tMinPts = Math.min(...pts.map((x) => x.s.t), 0), tMaxPts = Math.max(...pts.map((x) => x.s.t), 35);
  const tmin = std ? -10 : Math.floor((tMinPts - 4) / 5) * 5;
  const tmax = std ? 50 : Math.min(60, Math.ceil((tMaxPts + 4) / 5) * 5);
  const wTop = Math.max(...pts.map((x) => x.s.W * 1000), comfort ? 20 : 0);
  const Wmax = std ? 30 : Math.min(40, Math.max(8, Math.ceil((Math.max(wTop * 1.25, Ws(Math.min(tmax, 32), p) * 1000 * 0.9)) / 2) * 2));

  const X = (t) => M.l + ((t - tmin) / (tmax - tmin)) * (VW - M.l - M.r);
  const Y = (Wg) => VH - M.b - (Wg / Wmax) * (VH - M.t - M.b);
  const inBox = (t, Wg) => t >= tmin && t <= tmax && Wg >= 0 && Wg <= Wmax;
  const path = (arr) => arr.filter(([t, w]) => Number.isFinite(t) && Number.isFinite(w)).map(([t, w], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(Math.min(w, Wmax)).toFixed(1)}`).join('');

  const g = useMemo(() => {
    const step = 0.5, sat = [], rh = [];
    for (let t = tmin; t <= tmax + 1e-9; t += step) sat.push([t, Ws(t, p) * 1000]);
    for (let r = 10; r < 100; r += 10) {
      const line = []; for (let t = tmin; t <= tmax + 1e-9; t += step) { const w = W_from_pw((r / 100) * pws(t), p) * 1000; if (w > Wmax) break; line.push([t, w]); }
      rh.push({ r, line });
    }
    // enthalpy lines: from saturation down to W = 0
    const hl = [];
    const hStep = (tmax - tmin) > 60 ? 20 : 10;
    for (let h = Math.ceil(enthalpy(tmin, 0) / hStep) * hStep; h <= enthalpy(tmax, Wmax / 1000); h += hStep) {
      let lo = tmin - 30, hi = tmax; // saturation temperature for this h
      for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (enthalpy(m, Ws(m, p)) > h) hi = m; else lo = m; }
      const tS = lo, wS = Math.min(Ws(tS, p) * 1000, Wmax);
      const tS2 = t_from_hW(h, wS / 1000);
      const t0 = h / 1.006;
      hl.push({ h, a: [tS2, wS], b: [t0, 0] });
    }
    return { sat, rh, hl };
  }, [tmin, tmax, Wmax, p]);

  const cz = comfort ? zones(p) : [];
  const xt = []; for (let t = Math.ceil(tmin / 5) * 5; t <= tmax; t += 5) xt.push(t);
  const yt = []; const ys = Wmax > 20 ? 4 : 2; for (let w = 0; w <= Wmax; w += ys) yt.push(w);
  const byKey = new Map(pts.map((x) => [x.key, x]));
  // merge points at the same state and keep labels from overlapping
  const marks = useMemo(() => {
    const groups = [];
    for (const x of pts) {
      const g0 = groups.find((g) => Math.abs(g.s.t - x.s.t) < 0.05 && Math.abs(g.s.W - x.s.W) < 2e-6);
      if (g0) g0.labels.push(x.label); else groups.push({ ...x, labels: [x.label] });
    }
    const fs = compact ? 12 : 10.5, cw = fs * 0.58, placed = [];
    const hit = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    for (const g of groups.sort((a, b) => b.s.W - a.s.W)) {
      g.text = g.labels.join(', ');
      const cx = X(g.s.t), cy = Y(Math.min(g.s.W * 1000, Wmax)), w = g.text.length * cw, h = fs + 2;
      const tries = [[6, -5, 'start'], [6, 13, 'start'], [-6, -5, 'end'], [-6, 13, 'end'], [6, -19, 'start'], [6, 27, 'start'], [-6, -19, 'end'], [-6, 27, 'end']];
      let pick = tries[0];
      for (const tr of tries) {
        const x0 = tr[2] === 'end' ? cx + tr[0] - w : cx + tr[0];
        const r = { x: x0, y: cy + tr[1] - fs, w, h };
        if (!hit(r) && x0 >= M.l && x0 + w <= VW - M.r + 30) { pick = tr; placed.push(r); break; }
      }
      g.cx = cx; g.cy = cy; g.lx = cx + pick[0]; g.ly = cy + pick[1]; g.anchor = pick[2];
    }
    return groups;
  }, [pts, tmin, tmax, Wmax, compact]);

  const svg = (cls) => html`<svg class=${cls} viewBox=${`0 0 ${VW} ${VH}`} role="img" aria-label=${title || 'Psychrometric chart'}>
    <defs><clipPath id="pc-clip"><rect x=${M.l} y=${M.t} width=${VW - M.l - M.r} height=${VH - M.t - M.b} /></clipPath>
      <marker id="pc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#516174" /></marker></defs>
    <rect x=${M.l} y=${M.t} width=${VW - M.l - M.r} height=${VH - M.t - M.b} fill="#FBFCFD" stroke="#C5CFDA" />
    <g clip-path="url(#pc-clip)">
      ${xt.map((t) => html`<line x1=${X(t)} x2=${X(t)} y1=${M.t} y2=${VH - M.b} stroke="#EEF2F6" />`)}
      ${yt.map((w) => html`<line x1=${M.l} x2=${VW - M.r} y1=${Y(w)} y2=${Y(w)} stroke="#EEF2F6" />`)}
      ${g.hl.map((l) => html`<line x1=${X(l.a[0])} y1=${Y(l.a[1])} x2=${X(l.b[0])} y2=${Y(l.b[1])} stroke="#C9B48A" stroke-width="0.7" stroke-dasharray="3 3" />`)}
      ${g.rh.map((c) => html`<path d=${path(c.line)} fill="none" stroke="#9FC6E8" stroke-width=${c.r === 50 ? 1 : 0.7} />`)}
      ${cz.map((z, i) => html`<path d=${path([...z.left, ...z.right.slice().reverse()]) + 'Z'} fill=${i === 0 ? 'rgba(11,143,122,.13)' : 'rgba(31,111,209,.10)'} stroke=${i === 0 ? '#0B8F7A' : '#1F6FD1'} stroke-width="1" />`)}
      <path d=${path(g.sat) + `L${X(tmax)},${Y(Wmax)}L${X(tmax)},${M.t}L${M.l},${M.t}L${M.l},${Y(Math.min(Ws(tmin, p) * 1000, Wmax))}Z`} fill="#fff" stroke="none" />
      <path d=${path(g.sat)} fill="none" stroke="#1F6FD1" stroke-width="1.6" />
      ${links.map(([a, b]) => { const A = byKey.get(a), B = byKey.get(b); return A && B && html`<line x1=${X(A.s.t)} y1=${Y(A.s.W * 1000)} x2=${X(B.s.t)} y2=${Y(B.s.W * 1000)} stroke="#516174" stroke-width="1" stroke-dasharray="4 3" marker-end="url(#pc-arrow)" />`; })}
    </g>
    ${g.rh.map((c) => { const last = c.line[c.line.length - 1]; return last && inBox(...last) && c.r % 20 === 0 ? html`<text x=${X(last[0]) - 2} y=${Y(last[1]) - 3} class="pc-rh" text-anchor="end">${c.r}%</text>` : null; })}
    ${g.hl.filter((l) => inBox(l.a[0], l.a[1]) && l.a[1] < Wmax - 0.5).map((l) => html`<text x=${X(l.a[0]) - 3} y=${Y(l.a[1]) - 3} class="pc-h" text-anchor="end">${l.h}</text>`)}
    ${cz.length > 0 && cz[0].right.length > 0 && html`<text x=${X(cz[0].right[0][0]) + 3} y=${Y(cz[0].right[0][1]) - 4} class="pc-z">0.5 clo</text>`}
    ${cz.length > 1 && cz[1].left.length > 0 && html`<text x=${X(cz[1].left[0][0]) - 3} y=${Y(cz[1].left[0][1]) - 4} class="pc-z" text-anchor="end">1.0 clo</text>`}
    ${xt.map((t) => html`<text x=${X(t)} y=${VH - M.b + 13} class="pc-ax" text-anchor="middle">${t}</text>`)}
    ${yt.map((w) => html`<text x=${VW - M.r + 4} y=${Y(w) + 3} class="pc-ax">${w}</text>`)}
    <text x=${(M.l + VW - M.r) / 2} y=${VH - 4} class="pc-lab" text-anchor="middle">Dry bulb temperature (°C)</text>
    ${small ? html`<text x=${VW - 2} y=${M.t + 22} class="pc-lab" text-anchor="end">g/kg</text>`
      : html`<text x=${VW - 6} y=${(M.t + VH - M.b) / 2} class="pc-lab" text-anchor="middle" transform=${`rotate(90 ${VW - 6} ${(M.t + VH - M.b) / 2})`}>Humidity ratio (g/kg dry air)</text>`}
    ${!small && html`<text x=${M.l + 4} y=${M.t + 11} class="pc-note">h (kJ/kg) dashed · RH curves · ${fmt(p, 2)} kPa</text>`}
    ${marks.map((x) => html`<g class="pc-pt"><circle cx=${x.cx} cy=${x.cy} r="4.2" fill=${COLORS[x.kind] || COLORS.other} stroke="#fff" stroke-width="1.2" />
      <text x=${x.lx} y=${x.ly} class="pc-pl" text-anchor=${x.anchor}>${x.text}</text>
      <title>${`${x.text}: ${fmt(x.s.t, 1)} °C, ${fmt(x.s.RH, 0)} % RH, W ${fmt(x.s.W * 1000, 2)} g/kg, h ${fmt(x.s.h, 2)} kJ/kg, Tdp ${fmt(x.s.tdp, 1)} °C, Twb ${fmt(x.s.twb, 1)} °C, v ${fmt(x.s.v, 4)} m³/kg`}</title></g>`)}
  </svg>`;

  const table = html`<div class="pc-tablewrap"><table class="pc-table"><thead><tr><th>Point</th><th class="n">DB °C</th><th class="n">RH %</th><th class="n">W g/kg</th><th class="n">h kJ/kg</th><th class="n">Tdp °C</th><th class="n">Twb °C</th><th class="n">ρ kg/m³</th></tr></thead>
    <tbody>${pts.map((x) => html`<tr><td><i style=${`background:${COLORS[x.kind] || COLORS.other}`}></i>${x.label}</td><td class="n">${fmt(x.s.t, 1)}</td><td class="n">${fmt(x.s.RH, 0)}</td><td class="n">${fmt(x.s.W * 1000, 2)}</td><td class="n">${fmt(x.s.h, 2)}</td><td class="n">${fmt(x.s.tdp, 1)}</td><td class="n">${fmt(x.s.twb, 1)}</td><td class="n">${fmt(x.s.rho, 3)}</td></tr>`)}</tbody></table></div>`;

  return html`${pts.length === 0 ? html`<p class="note">Enter a temperature and RH to plot the room.</p>` : svg('pc-svg')}
    ${(showTable || !small) && pts.length > 0 && table}
    ${comfort && !small && html`<p class="note">Comfort zones: ANSI/ASHRAE Standard 55-2023 graphic method basis (PMV −0.5 to +0.5, 1.1 met, air speed 0.1 m/s, mean radiant = air temperature).</p>`}`;
}

// Points of one room: room air, outdoor, air entering through each door, make-up air.
export function roomPoints(project, room) {
  const pts = [], links = [];
  if (room.T != null && room.RH != null) pts.push({ key: 'room', label: room.name || 'Room', t: room.T, RH: room.RH, kind: 'room' });
  const o = project.outdoor;
  if (o?.T != null && o?.RH != null) pts.push({ key: 'out', label: 'Outdoor', t: o.T, RH: o.RH, kind: 'outdoor' });
  const seen = new Set();
  room.walls.forEach((w, i) => w.doors.forEach((d, j) => {
    if (!(d && d.count > 0) || w.T == null || d.RH == null) return;
    const sig = `${w.T}/${d.RH}`;
    if (w.source === 'outside' && o && w.T === o.T && d.RH === o.RH) { links.push(['out', 'room']); return; }
    if (seen.has(sig)) return; seen.add(sig);
    const key = `d${i}${j}`;
    pts.push({ key, label: `Door W${i + 1}`, t: w.T, RH: d.RH, kind: 'door' }); links.push([key, 'room']);
  }));
  const mu = room.makeUp;
  if (mu?.CMH > 0 && mu.T != null && mu.RH != null) { pts.push({ key: 'mu', label: 'Make-up air', t: mu.T, RH: mu.RH, kind: 'makeup' }); links.push(['mu', 'room']); }
  return { points: pts, links: [...new Set(links.map((l) => l.join('>')))].map((s) => s.split('>')) };
}

export const projectPressure = (project) => pAtm(project.altitude || 0);
