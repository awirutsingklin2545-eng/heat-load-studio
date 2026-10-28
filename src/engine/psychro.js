// Moist-air properties from the equations of ASHRAE Handbook—Fundamentals (2025), Chapter 1
// Psychrometrics (SI). Saturation pressure: Hyland–Wexler (Eq. 5 over ice, Eq. 6 over water).
// Same formulation as PsychroLib, which the tests use as the reference.
// Units: t in °C, p in kPa, W in kg/kg dry air, h in kJ/kg dry air, v in m³/kg dry air.

const R_DA = 0.287042;          // kJ/kg·K, dry air (Eq. 28)
const RATIO = 0.621945;         // Mw/Mda (Eq. 20)
const T_TRIPLE = 0.01;          // °C

export const P_STD = 101.325;
// Eq. 3: standard atmospheric pressure at altitude Z (m)
export const pAtm = (Z = 0) => P_STD * (1 - 2.25577e-5 * (Number(Z) || 0)) ** 5.2559;

// Saturation vapour pressure, kPa
export function pws(t) {
  const T = t + 273.15;
  let ln;
  if (t <= T_TRIPLE) {
    ln = -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T ** 2 + 2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T);
  } else {
    ln = -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T ** 2 - 1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T);
  }
  return Math.exp(ln) / 1000;
}

export const W_from_pw = (pw, p = P_STD) => (RATIO * pw) / (p - pw);          // Eq. 20
export const pw_from_W = (W, p = P_STD) => (p * W) / (RATIO + W);
export const Ws = (t, p = P_STD) => W_from_pw(pws(t), p);                       // Eq. 23
export const enthalpy = (t, W) => 1.006 * t + W * (2501 + 1.86 * t);           // Eq. 32
export const volume = (t, W, p = P_STD) => (R_DA * (t + 273.15) * (1 + 1.607858 * W)) / p; // Eq. 26
export const t_from_hW = (h, W) => (h - 2501 * W) / (1.006 + 1.86 * W);

// Dew point: invert pws with Newton steps on ln(pw)
export function dewPoint(pw) {
  if (!(pw > 0)) return NaN;
  let t = pw > 0.6112 ? 20 : -20;
  for (let i = 0; i < 60; i++) {
    const f0 = Math.log(pws(t)) - Math.log(pw);
    const d = (Math.log(pws(t + 1e-4)) - Math.log(pws(t - 1e-4))) / 2e-4;
    const step = f0 / d; t -= step;
    if (Math.abs(step) < 1e-7) break;
  }
  return t;
}

// Wet bulb (thermodynamic): Eq. 33 (above freezing) / Eq. 35 (ice), solved by bisection
export function wetBulb(t, W, p = P_STD) {
  const Wcalc = (tw) => {
    const Wsw = Ws(tw, p);
    return tw > T_TRIPLE
      ? ((2501 - 2.326 * tw) * Wsw - 1.006 * (t - tw)) / (2501 + 1.86 * t - 4.186 * tw)
      : ((2830 - 0.24 * tw) * Wsw - 1.006 * (t - tw)) / (2830 + 1.86 * t - 2.1 * tw);
  };
  let lo = dewPoint(pw_from_W(W, p)), hi = t;
  if (!Number.isFinite(lo)) lo = -100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (Wcalc(mid) > W) hi = mid; else lo = mid;
    if (hi - lo < 1e-7) break;
  }
  return (lo + hi) / 2;
}

// Full state from dry bulb + RH (%)
export function stateTRH(t, RH, p = P_STD) {
  if (!Number.isFinite(t) || !Number.isFinite(RH)) return null;
  const pw = (Math.min(Math.max(RH, 0), 100) / 100) * pws(t);
  return stateTW(t, W_from_pw(pw, p), p);
}
export function stateTW(t, W, p = P_STD) {
  if (!Number.isFinite(t) || !Number.isFinite(W)) return null;
  const pw = pw_from_W(W, p);
  const v = volume(t, W, p);
  return {
    t, W, p, pw,
    RH: (pw / pws(t)) * 100,
    h: enthalpy(t, W),
    v,
    rho: (1 + W) / v,           // moist-air density, kg/m³
    tdp: dewPoint(pw),
    twb: wetBulb(t, W, p),
  };
}
export function stateTWb(t, twb, p = P_STD) {
  const Wsw = Ws(twb, p);
  const W = twb > T_TRIPLE
    ? ((2501 - 2.326 * twb) * Wsw - 1.006 * (t - twb)) / (2501 + 1.86 * t - 4.186 * twb)
    : ((2830 - 0.24 * twb) * Wsw - 1.006 * (t - twb)) / (2830 + 1.86 * t - 2.1 * twb);
  return stateTW(t, W, p);
}

// Ideal adiabatic mixing of two streams by dry-air mass
export function mix(a, ma, b, mb, p = P_STD) {
  const m = ma + mb; if (!(m > 0)) return null;
  const W = (a.W * ma + b.W * mb) / m, h = (a.h * ma + b.h * mb) / m;
  return stateTW(t_from_hW(h, W), W, p);
}

// ---------- thermal comfort: PMV (ISO 7730 / ANSI/ASHRAE Standard 55-2023 Normative Appendix) ----------
// ta, tr in °C, vel m/s, rh %, met, clo, wme (external work, met)
export function pmv(ta, tr, vel, rh, met, clo, wme = 0) {
  const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235));
  const icl = 0.155 * clo, m = met * 58.15, w = wme * 58.15, mw = m - w;
  const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(vel);
  const taa = ta + 273, tra = tr + 273;
  let tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);
  const p1 = icl * fcl, p2 = p1 * 3.96, p3 = p1 * 100, p4 = p1 * taa;
  const p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;
  let xn = tcla / 100, xf = tcla / 50, hc = hcf, n = 0;
  while (Math.abs(xn - xf) > 0.00015) {
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25;
    hc = hcf > hcn ? hcf : hcn;
    xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc);
    if (++n > 150) return NaN;
  }
  const tcl = 100 * xn - 273;
  const hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa);
  const hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;
  const hl3 = 1.7 * 0.00001 * m * (5867 - pa);
  const hl4 = 0.0014 * m * (34 - ta);
  const hl5 = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4);
  const hl6 = fcl * hc * (tcl - ta);
  const ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
  return ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
}
export const ppd = (v) => 100 - 95 * Math.exp(-0.03353 * v ** 4 - 0.2179 * v ** 2);

// Graphic comfort zone boundary: for each humidity ratio, the operative temperatures where PMV = ±0.5
// (Standard 55-2023 graphic method basis: tr = ta, 0.1 m/s, 1.1 met; one polygon per clothing level).
export function comfortZone(clo, { met = 1.1, vel = 0.1, p = P_STD, Wmax = 0.03 } = {}) {
  const left = [], right = [];
  const solve = (W, target) => {
    let lo = 5, hi = 40;
    const f = (t) => pmv(t, t, vel, Math.min(100, (pw_from_W(W, p) / pws(t)) * 100), met, clo) - target;
    if (f(lo) * f(hi) > 0) return NaN;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  };
  for (let W = 0; W <= Wmax + 1e-9; W += 0.0005) {
    const tl = solve(W, -0.5), tr = solve(W, 0.5);
    if (!Number.isFinite(tl) || !Number.isFinite(tr)) continue;
    const ok = (t) => Ws(t, p) >= W;                     // stay under the saturation curve
    if (ok(tl)) left.push([tl, W]);
    if (ok(tr)) right.push([tr, W]);
  }
  return { left, right, clo, met, vel };
}
