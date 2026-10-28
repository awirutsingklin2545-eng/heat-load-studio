// Transient conduction through layered constructions, used to generate the conduction time series
// (CTS) of a wall or roof and, in rts.js, the radiant time series (RTS) of a room.
// Method: one-dimensional finite differences (backward Euler), run steady-periodic over a 24 h
// cycle with a unit triangular temperature pulse, as in the periodic response factor approach
// behind the ASHRAE CTS/RTS tables (Spitler & Fisher). Layers: { L (m), k (W/m·K), rho (kg/m³), c (kJ/kg·K) }
// or a pure resistance { R (m²·K/W) }.

export const H_IN = 8.29;   // inside surface, still air, combined (Fundamentals Ch. 26)
export const H_OUT = 17;    // outside surface used with sol-air temperature (Fundamentals Ch. 18)
export const H_C_IN = 3.08, H_R_IN = 5.21; // split of the inside combined coefficient

export function rValue(layers) { return layers.reduce((s, l) => s + (l.R != null ? l.R : l.L / l.k), 0); }
export function uValue(layers, hi = H_IN, ho = H_OUT) { return 1 / (1 / hi + rValue(layers) + 1 / ho); }

// Node chain from the INSIDE face (index 0) outward. Returns capacitances C (J/m²K) and the
// conductances G[i] between node i and i+1 (W/m²K).
export function buildChain(layersOutToIn, { maxNodes = 60 } = {}) {
  const layers = [...layersOutToIn].reverse(); // inside first
  const C = [0], G = [];
  for (const l of layers) {
    if (l.R != null) { G.push(1 / l.R); C.push(0); continue; }
    const diff = l.k / (l.rho * l.c * 1000);                   // m²/s
    const pen = Math.sqrt(diff * 3600);                          // 1-hour penetration depth
    const n = Math.max(2, Math.min(maxNodes, Math.ceil(l.L / Math.max(pen / 4, 0.002))));
    const dx = l.L / n, cap = l.rho * l.c * 1000 * dx;
    for (let i = 0; i < n; i++) { C[C.length - 1] += cap / 2; G.push(l.k / dx); C.push(cap / 2); }
  }
  return { C, G };
}

// Solve one backward-Euler step of a chain: a·T = d (tridiagonal), in place. Boundary links:
// left (node 0) to Tl through gl, right (last node) to Tr through gr (gl/gr may be 0).
function stepChain(T, C, G, dt, gl, Tl, gr, Tr, src0, a, b, c, d) {
  const n = T.length;
  for (let i = 0; i < n; i++) {
    const gL = i === 0 ? gl : G[i - 1], gR = i === n - 1 ? gr : G[i];
    a[i] = i === 0 ? 0 : -G[i - 1];
    c[i] = i === n - 1 ? 0 : -G[i];
    b[i] = C[i] / dt + gL + gR;
    d[i] = (C[i] / dt) * T[i];
  }
  d[0] += gl * Tl + src0; d[n - 1] += gr * Tr;
  for (let i = 1; i < n; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
  T[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) T[i] = (d[i] - c[i] * T[i + 1]) / b[i];
}

const tri = (tHours) => { let x = ((tHours % 24) + 24) % 24; if (x > 12) x -= 24; return Math.max(0, 1 - Math.abs(x)); };

// Conduction time series: response of the inside heat flow to a unit triangular sol-air pulse,
// with the inside air held at 0. Returns { cts[24] (sum 1), U }.
const ctsCache = new Map();
export function conductionTimeSeries(layersOutToIn, { hi = H_IN, ho = H_OUT, dt = 60 } = {}) {
  const key = JSON.stringify([layersOutToIn, hi, ho]);
  if (ctsCache.has(key)) return ctsCache.get(key);
  const { C, G } = buildChain(layersOutToIn);
  const n = C.length, T = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  const steps = Math.round(86400 / dt), per = Math.round(3600 / dt);
  let prev = null, out = null;
  for (let day = 0; day < 80; day++) {
    out = new Array(24).fill(0);
    for (let s = 1; s <= steps; s++) {
      const t = (s * dt) / 3600;
      stepChain(T, C, G, dt, hi, 0, ho, tri(t), 0, a, b, c, d);
      if (s % per === 0) out[(s / per) % 24] = hi * T[0];
    }
    if (prev && out.every((v, i) => Math.abs(v - prev[i]) < 1e-10)) break;
    prev = out;
  }
  const sum = out.reduce((x, y) => x + y, 0);
  const res = { cts: out.map((v) => v / sum), U: uValue(layersOutToIn, hi, ho), sumRaw: sum };
  ctsCache.set(key, res);
  return res;
}

// Typical constructions (outside → inside). Material values are typical figures for common products;
// check them against the actual datasheet. The k of PU/EPS comes from the project master when given.
export function construction(kind, opts = {}) {
  const kIns = opts.kIns ?? 0.026, tIns = (opts.thk ?? 100) / 1000;
  const steel = { L: 0.0005, k: 45, rho: 7800, c: 0.5 };
  const plaster = { L: 0.015, k: 0.72, rho: 1860, c: 0.84 };
  switch (kind) {
    case 'panel': return [steel, { L: tIns, k: kIns, rho: 40, c: 1.4 }, steel];
    case 'brick': return [plaster, { L: 0.1, k: 0.72, rho: 1920, c: 0.84 }, plaster];
    case 'brick-double': return [plaster, { L: 0.2, k: 0.72, rho: 1920, c: 0.84 }, plaster];
    case 'block-aac': return [plaster, { L: 0.1, k: 0.13, rho: 600, c: 1.0 }, plaster];
    case 'concrete': return [{ L: 0.15, k: 1.73, rho: 2300, c: 0.88 }];
    case 'metal-roof-attic': return [steel, { R: 0.18 }, { L: tIns, k: kIns, rho: 40, c: 1.4 }, steel];
    case 'concrete-roof': return [{ L: 0.15, k: 1.73, rho: 2300, c: 0.88 }, { L: 0.05, k: 0.035, rho: 30, c: 1.4 }, plaster];
    case 'glass': return [{ R: Math.max(0.001, 1 / (opts.U || 5.8) - 1 / H_IN - 1 / H_OUT) }];
    default: return [steel, { L: tIns, k: kIns, rho: 40, c: 1.4 }, steel];
  }
}
export const CONSTRUCTIONS = [
  { value: 'panel', label: 'Insulated sandwich panel (steel / insulation / steel)' },
  { value: 'brick', label: 'Brick 100 mm, plastered both sides' },
  { value: 'brick-double', label: 'Brick 200 mm, plastered both sides' },
  { value: 'block-aac', label: 'Lightweight concrete block 100 mm, plastered' },
  { value: 'concrete', label: 'Concrete 150 mm' },
];
export const ROOF_CONSTRUCTIONS = [
  { value: 'panel', label: 'Insulated sandwich panel roof, exposed' },
  { value: 'metal-roof-attic', label: 'Metal sheet roof, air space, insulation' },
  { value: 'concrete-roof', label: 'Concrete slab 150 mm + 50 mm insulation, exposed' },
];
