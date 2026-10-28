// Heat Load Studio — calculation engine, profile "ASHRAE".
// Refrigerated rooms: ASHRAE Handbook—Refrigeration (2026), refrigerated-facility loads.
// Air-conditioned rooms: ASHRAE Handbook—Fundamentals (2025), Ch. 18 radiant time series (RTS) method,
// Ch. 14 climatic data and clear-sky model, Ch. 1 psychrometrics; Standard 62.1 ventilation.
// Every default that the handbooks leave to the designer is listed in `basis` so the report can show it.
import { stateTRH, stateTWb, stateTW, pAtm, mix } from './psychro.js';
import { thickness, foodByName, forkliftFactor, forecastLinear } from './v125.js';
import { dayOfYear21, sunPosition, clearSky, onSurface, DAILY_FRACTION, ORIENT, solAir } from './solar.js';
import { conductionTimeSeries, construction } from './conduction.js';
import { radiantTimeSeries } from './rts.js';
import { occupantGain } from './people.js';
import { STATIONS, DEFAULT_STATION } from '../data/climate.js';

export const ASHRAE_ENGINE = 'ashrae-0.1.0';

export const EDITIONS = [
  { key: 'ref', title: 'ASHRAE Handbook—Refrigeration', year: 2026, be: 2569, use: 'Refrigerated-facility loads; thermal properties of foods' },
  { key: 'fun', title: 'ASHRAE Handbook—Fundamentals', year: 2025, be: 2568, use: 'Ch. 1 psychrometrics, Ch. 14 climatic design data, Ch. 18 cooling load (RTS), Ch. 26 surface films' },
  { key: 's55', title: 'ANSI/ASHRAE Standard 55-2023', year: 2023, be: 2566, use: 'Thermal comfort zone (PMV)' },
  { key: 's621', title: 'ANSI/ASHRAE Standard 62.1-2025', year: 2025, be: 2568, use: 'Outdoor air for air-conditioned rooms (ventilation rate procedure)' },
];

// Refrigeration chapter, allowance for sun effect (K added to the outdoor temperature)
export const SUN_EFFECT = { dark: { E: 5, S: 3, W: 5, roof: 11 }, medium: { E: 4, S: 3, W: 4, roof: 9 }, light: { E: 3, S: 2, W: 3, roof: 5 } };
const SUN_COL = { E: 'E', NE: 'E', SE: 'E', S: 'S', W: 'W', SW: 'W', NW: 'W' };
// Surface film coefficients, still air / 24 km/h wind (Fundamentals Ch. 26), W/m²·K
export const FILM = { vertical: 8.29, up: 9.26, down: 6.13, wind: 34.0 };

// Standard 62.1 Table 6-1 (values as published for 62.1-2022; confirm against 62.1-2025).
// Rp L/s·person, Ra L/s·m², default occupant density per 100 m².
const D = (perKft2) => Math.round((perKft2 * 100 / 92.903) * 10) / 10;
export const OCCUPANCY = [
  ['Office space', 2.5, 0.3, D(5)], ['Conference/meeting', 2.5, 0.3, D(50)], ['Reception areas', 2.5, 0.3, D(30)],
  ['Telephone/data entry', 2.5, 0.3, D(60)], ['Main entry lobbies', 2.5, 0.3, D(10)], ['Break rooms (general)', 2.5, 0.3, D(25)],
  ['Classrooms (age 9 plus)', 5, 0.6, D(35)], ['Lecture classroom', 3.8, 0.3, D(65)], ['Computer lab', 5, 0.6, D(25)], ['Libraries', 2.5, 0.6, D(10)],
  ['Restaurant dining rooms', 3.8, 0.9, D(67)], ['Cafeteria/fast-food dining', 3.8, 0.9, D(67)],
  ['Sales (retail)', 3.8, 0.6, D(15)], ['Supermarket', 3.8, 0.3, D(8)], ['Mall common areas', 3.8, 0.3, D(33)],
  ['Sorting, packing, light assembly', 3.8, 0.6, D(7)], ['Lobbies/prefunction', 3.8, 0.3, D(30)], ['Places of religious worship', 2.5, 0.3, D(120)],
  ['Health club/aerobics room', 10, 0.3, D(20)],
].map(([name, Rp, Ra, density]) => ({ name, Rp, Ra, density }));

// Metabolic rates, met (Fundamentals Ch. 9 table of typical activities)
export const ACTIVITIES = [
  { value: 'seated', label: 'Seated, quiet (1.0 met)', met: 1.0 },
  { value: 'office', label: 'Typing, office work (1.1 met)', met: 1.1 },
  { value: 'standing', label: 'Filing, standing (1.4 met)', met: 1.4 },
  { value: 'walking', label: 'Walking about (1.7 met)', met: 1.7 },
  { value: 'machine', label: 'Machine work (1.8 met)', met: 1.8 },
  { value: 'packing', label: 'Lifting / packing (2.1 met)', met: 2.1 },
];
// Lighting heat split by luminaire (ASHRAE RP-1282, Fisher & Chantrasrisalai): fraction to return air,
// and radiant fraction of the part that enters the room (radiant + visible over 1 − return air)
export const LUMINAIRES = [
  { value: 'surface', label: 'Surface mounted (T5HO) / LED batten', ra: 0, rad: (0.27 + 0.23) / 1 },
  { value: 'pendant', label: 'Pendant, direct/indirect', ra: 0, rad: (0.32 + 0.23) / 1 },
  { value: 'recessed-louver', label: 'Recessed, parabolic louver, non-vented', ra: 0.31, rad: (0.22 + 0.20) / 0.69 },
  { value: 'recessed-lens', label: 'Recessed, acrylic lens, non-vented', ra: 0.56, rad: (0.12 + 0.20) / 0.44 },
  { value: 'downlight', label: 'Downlights, compact fluorescent', ra: 0.86, rad: (0.04 + 0.10) / 0.14 },
];

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const n0 = (x) => num(x) ?? 0;
const safe = (f, fb = 0) => { try { const r = f(); return Number.isFinite(r) ? r : fb; } catch { return fb; } };
export const isAC = (room) => room.roomType === 'Air Conditioning';

// ---------- defaults for the ASHRAE-only inputs ----------
export function ashOf(room) {
  const a = room.ash || {};
  const ac = isAC(room);
  const def = ['N', 'E', 'W', 'S'];
  return {
    sf: num(a.sf) ?? (ac ? 0 : 10),
    runHours: num(a.runHours),
    groundR: num(a.groundR) ?? 1.0,
    walls: [0, 1, 2, 3].map((i) => ({ orient: 'N', colour: 'medium', construction: 'panel', ...{ orient: def[i] }, ...(a.walls?.[i] || {}),
      win: { area: 0, U: 5.8, SHGC: 0.7, panes: 1, iac: 1, ...(a.walls?.[i]?.win || {}) } })),
    roof: { exposed: false, colour: 'medium', construction: 'metal-roof-attic', ...(a.roof || {}) },
    people: { activity: ac ? 'office' : 'machine', hours: ac ? null : 24, frequent: false, sens: null, lat: null, ...(a.people || {}) },
    lighting: { Wm2: null, hours: ac ? null : 24, luminaire: 'surface', ...(a.lighting || {}) },
    fanHours: num(a.fanHours) ?? 24,
    defrost: { mode: 'auto', kW: null, perDay: null, minutes: null, fraction: 0.5, ...(a.defrost || {}) },
    ac: { category: 'Office space', people: null, ventLs: null, ach: 0.3, occStart: 8, occEnd: 18, supplyT: 13, Ez: 1.0, equipW: 0, equipRad: 0.5, clo: 0.5, ...(a.ac || {}) },
  };
}
export function projectAsh(project) {
  return { station: DEFAULT_STATION, month: 'peak', diversity: 1, ...(project.ash || {}) };
}

// ---------- refrigerated rooms ----------
function calcRefrigeration(room, project, data) {
  const a = ashOf(room), basis = [], notes = [];
  const p = pAtm(project.altitude || 0);
  const T = num(room.T), RH = num(room.RH), H = num(room.H), W = num(room.W), L = num(room.L);
  const type = room.roomType, isABF = type === 'Freezer - Trolley', isLoading = type === 'Loading Dock';
  const rp = T != null && RH != null ? stateTRH(T, RH, p) : null;
  const k = (m) => data.k[m];
  const ceilType = room.ceiling?.type ?? 'EPS';

  // transmission, U with surface films
  const surfaces = [];
  const U3 = (hi, Lm, km, ho) => 1 / (1 / hi + Lm / km + (ho ? 1 / ho : 0));
  const surf = (name, Tout, sun, matType, thk, U, A, films) => {
    const dT = n0(Tout) + sun - n0(T);
    const raw = safe(() => (U * A * dT) / 1000);
    surfaces.push({ name, Tout, sun, type: matType, thickness: thk, k: k(matType), U, A, dT, raw, q: raw > 0 ? raw : 0, films });
  };
  const cT = thickness(data, T, ceilType);
  if (a.roof.exposed) {
    const sun = SUN_EFFECT[a.roof.colour]?.roof ?? 0;
    surf('Ceiling (exposed roof)', project.outdoor?.T, sun, ceilType, cT, safe(() => U3(FILM.down, cT / 1000, k(ceilType), FILM.wind)), n0(W) * n0(L), 'inside 6.13, outside 34.0');
  } else {
    surf('Ceiling', room.ceiling?.T ?? 45, 0, ceilType, cT, safe(() => U3(FILM.down, cT / 1000, k(ceilType), FILM.down)), n0(W) * n0(L), 'inside 6.13, roof space 6.13');
  }
  const floorType = room.floor?.type ?? (T != null && T >= 10 ? 'Concrete' : ceilType);
  const fT = floorType === 'Concrete' ? 200 : thickness(data, T, floorType);
  surf('Floor', room.floor?.T ?? 30, 0, floorType, fT, safe(() => 1 / (1 / FILM.up + fT / 1000 / k(floorType) + a.groundR)), n0(W) * n0(L), `inside 9.26, ground ${a.groundR} m²·K/W`);
  for (let i = 0; i < 4; i++) {
    const w = room.walls?.[i] || {}, aw = a.walls[i];
    const wt = w.type ?? ceilType, th = thickness(data, T, wt);
    const outside = w.source === 'outside';
    const col = SUN_COL[aw.orient];
    const sun = outside && col ? SUN_EFFECT[aw.colour]?.[col] ?? 0 : 0;
    const len = i === 0 || i === 3 ? L : W;
    surf(`Wall ${i + 1}`, num(w.T), sun, wt, th, safe(() => U3(FILM.vertical, th / 1000, k(wt), outside ? FILM.wind : FILM.vertical)), safe(() => H * len), outside ? `inside 8.29, outside 34.0; ${aw.orient} wall, ${aw.colour}` : 'both sides 8.29');
  }
  const transmission = surfaces.reduce((s, x) => s + x.q, 0);

  // infiltration
  const doors = [];
  for (let i = 0; i < 4; i++) {
    const w = room.walls?.[i] || {};
    for (let j = 0; j < 2; j++) {
      const d = (w.doors || [])[j] || {};
      if (!(n0(d.count) > 0)) continue;
      const Tin = num(w.T);
      const ip = Tin != null ? stateTRH(Tin, n0(d.RH), p) : null;
      const hi = ip?.h ?? NaN, rho_i = ip?.rho ?? NaN, h_r = rp?.h ?? NaN, rho_r = rp?.rho ?? NaN;
      const A = n0(d.W) * n0(d.H);
      const Fm = safe(() => (2 / (1 + (rho_r / rho_i) ** (1 / 3))) ** 1.5);
      const qFull = safe(() => 0.221 * A * (hi - h_r) * rho_r * Math.sqrt(Math.max(0, 1 - rho_i / rho_r)) * Math.sqrt(9.81 * n0(d.H)) * Fm);
      const P = num(d.P) ?? 1, thetaP = num(d.thetaP) ?? 15, thetaO = n0(d.openMin);
      const Dt = (n0(d.count) * (P * thetaP + 60 * thetaO)) / 3600;
      const Df = Math.abs(n0(Tin) - n0(T)) >= 11 ? 0.8 : 1.1;
      const E = n0(d.E);
      const qDoor = safe(() => qFull * Dt * Df * (1 - E));
      const gapArea = n0(d.H) * 0.01 * 2 + (n0(d.W) - 0.01) * 0.01 * 2;
      const gapLs = gapArea * 0.5 * 1000;
      const qGap = safe(() => Math.max(0, n0(d.count) * rho_r * (gapLs / 1000) * (hi - h_r)));
      const q = isLoading ? qGap : Math.max(0, qDoor);
      doors.push({ name: `Wall ${i + 1} Door ${j + 1}`, wall: i + 1, slot: j + 1, W: n0(d.W), H: n0(d.H), openMin: thetaO, P, thetaP, Tin, RH: num(d.RH), count: n0(d.count), A, hi, rho_i, h_r, rho_r, Fm, qFull, Dt, Df, E, qDoor, loading: isLoading, gapArea, gapCMH: gapLs * 3.6, qGap, q });
    }
  }
  const mu = room.makeUp || {};
  const mp = num(mu.T) != null && num(mu.RH) != null ? stateTRH(mu.T, mu.RH, p) : null;
  const qMakeUp = mp && rp ? Math.max(0, (mp.rho * n0(mu.CMH) / 3600) * (mp.h - rp.h)) : 0;
  const infiltration = doors.reduce((s, x) => s + x.q, 0) + qMakeUp;

  // product (consistent freezing-point tests; −2 °C when the food table gives no freezing point)
  const items = (room.products || []).slice(0, 5).map((pr, idx) => {
    const f = pr.name ? foodByName(data, pr.name) : null;
    const tf = f ? (f[2] === '—' ? -2 : f[2]) : null;
    const cA = f ? f[3] : null, cB = f ? (f[4] === '—' ? 0 : f[4]) : null, Lf = f ? f[6] : null;
    const tin = num(pr.tIn), tout = num(pr.tOut);
    const rate = safe(() => pr.ton / pr.hours, null), kgs = rate == null ? 0 : rate / 3.6;
    let qa = 0, ql = 0, qb = 0;
    if (f && tin != null && tout != null && tf != null) {
      if (tout >= tf) qa = kgs * cA * (tin - tout);
      else {
        if (tin > tf) qa = kgs * cA * (tin - tf);
        if (tin >= tf) ql = kgs * Lf;
        qb = kgs * cB * (Math.min(tin, tf) - tout);
      }
    }
    const qr = (n0(pr.ton) * n0(pr.respiration)) / 1000;
    return { idx: idx + 1, category: pr.category, name: pr.name, tf, cA, cB, latent: Lf, tin, tout, ton: num(pr.ton), hours: num(pr.hours), rate, qa, ql, qb, qr, q: qa + ql + qb + qr };
  });
  const product = items.reduce((s, x) => s + x.q, 0);

  // internal loads
  const lpd = num(a.lighting.Wm2) ?? data.lighting[type] ?? 0;
  const lightH = num(a.lighting.hours) ?? 24, peopleH = num(a.people.hours) ?? 24;
  const qLight = safe(() => (lpd * n0(W) * n0(L) / 1000) * (lightH / 24));
  const perPerson = (272 - 6 * n0(T)) * (a.people.frequent ? 1.25 : 1);
  const qWorker = safe(() => (perPerson * n0(room.workers) / 1000) * (peopleH / 24));
  const fk = room.forklift || {};
  const fkFactor = forkliftFactor(type, W, L, H, fk);
  const qMotors = safe(() => (room.equipment || []).slice(0, 10).reduce((s, e) => s + n0(e.kW) * n0(e.factor), 0) + n0(fk.kW ?? 7) * fkFactor);
  const internal = qLight + qWorker + qMotors;
  const segments = transmission + infiltration + product + internal;

  // equipment-related: fans and defrost (outside the safety factor, as the handbook applies it to the four segments)
  let qFan, fanBasis;
  if (n0(room.fanMotorKW) > 0) { qFan = n0(room.fanMotorKW) * (a.fanHours / 24); fanBasis = `actual fan motors × ${a.fanHours}/24 h`; }
  else if (!isABF) { qFan = n0(data.fanFactor[type]) * segments; fanBasis = `estimate, ${Math.round(n0(data.fanFactor[type]) * 100)} % of load (V1.25 Table 5)`; }
  else { const f = forecastLinear(Math.max(n0(W), n0(L)) * 20000, data.abf); qFan = f < 0 ? 0 : f * 1.03; fanBasis = 'estimate from V1.25 fan record (blast freezer)'; }
  let qDefrost, defrostBasis;
  if (a.defrost.mode === 'heater' && num(a.defrost.kW) > 0) {
    qDefrost = (n0(a.defrost.kW) * n0(a.defrost.perDay) * n0(a.defrost.minutes) / 60 / 24) * n0(a.defrost.fraction);
    defrostBasis = `${a.defrost.kW} kW × ${a.defrost.perDay}/day × ${a.defrost.minutes} min × ${a.defrost.fraction} to room ÷ 24 h`;
  } else {
    const t = n0(T);
    const frac = t >= -1 ? 0.05 : t <= -30 ? 0.15 : 0.05 + ((-1 - t) / 29) * 0.10;
    qDefrost = T != null && T <= 5 ? frac * (segments + qFan) : 0;
    defrostBasis = T != null && T <= 5 ? `${Math.round(frac * 1000) / 10} % of load (handbook range: about 5 % above −1 °C, over 15 % near −30 °C)` : 'no defrost above 5 °C';
  }

  const sf = a.sf;
  const afterSF = segments * (1 + sf / 100) + qFan + qDefrost;
  const runHours = a.runHours ?? (T == null ? null : isABF ? 24 : T <= 5 ? 20 : 24);
  const required = safe(() => afterSF * 24 / runHours);
  const total = segments + qFan + qDefrost;

  basis.push(['Surface films', 'Fundamentals Ch. 26: 8.29 vertical, 9.26 up, 6.13 down, 34.0 outdoor wind (W/m²·K)']);
  basis.push(['Floor on ground', `inside film 9.26 W/m²·K plus ground resistance ${a.groundR} m²·K/W (app default 1.0, about 1 m of soil with k ≈ 1 W/m·K) to the floor temperature entered`]);
  basis.push(['Sun effect', 'Refrigeration handbook table, added to outdoor temperature of outside walls and exposed roofs']);
  basis.push(['Door passages', 'P = 1 per hour and θp = 15 s per passage unless entered (handbook: 15 to 25 s conventional, 5 to 10 s high-speed doors)']);
  basis.push(['Safety factor', `${sf} % on transmission, infiltration, product and internal loads; fans and defrost added after`]);
  basis.push(['Running time', a.runHours ? `${a.runHours} h/day (entered)` : `${runHours} h/day (same rule as V1.25: the handbook leaves it to the designer)`]);
  if (doors.some((d) => d.loading)) basis.push(['Dock doors', 'direct flow through a 1 cm seal gap at 0.5 m/s, continuous']);

  return {
    engine: ASHRAE_ENGINE, profile: 'ASHRAE', kind: 'refrigeration', pressure: p,
    psychro: { room: rp && { T, RH, h: rp.h, v: rp.v, rho: rp.rho }, makeUp: mp && { T: mu.T, RH: mu.RH, h: mp.h, v: mp.v, rho: mp.rho } },
    transmission: { surfaces, total: transmission },
    infiltration: { doors, makeUp: { ...mu, q: qMakeUp }, total: infiltration },
    product: { items, total: product },
    internal: { lighting: qLight, lpd, lightHours: lightH, workers: qWorker, perPerson, peopleHours: peopleH, motors: qMotors, forkliftFactor: fkFactor, total: internal },
    equipRelated: { fan: qFan, fanBasis, defrost: qDefrost, defrostBasis, total: qFan + qDefrost },
    equipment: { lighting: qLight, workers: qWorker, fan: qFan, motors: qMotors, defrost: qDefrost, forkliftFactor: fkFactor, total: internal + qFan + qDefrost },
    parts: [['transmission', 'Transmission', transmission], ['infiltration', 'Infiltration', infiltration], ['product', 'Product', product], ['internal', 'Internal', internal], ['equip', 'Fans + defrost', qFan + qDefrost]],
    totals: { segments, total, safetyFactor: sf, afterSF, runHours, required },
    basis, notes,
  };
}

// ---------- glazing angle dependence (Fresnel, uncoated panes, n = 1.526) ----------
function fresnelT(thetaDeg, panes) {
  const n = 1.526, th = (thetaDeg * Math.PI) / 180;
  const one = (t) => {
    const s = Math.sin(t) / n, tr = Math.asin(Math.min(1, s));
    if (t < 1e-6) { const r = ((n - 1) / (n + 1)) ** 2; return (1 - r) / (1 + r); }
    const rs = (Math.sin(t - tr) / Math.sin(t + tr)) ** 2, rpp = (Math.tan(t - tr) / Math.tan(t + tr)) ** 2;
    return ((1 - rs) / (1 + rs) + (1 - rpp) / (1 + rpp)) / 2;
  };
  return one(th) ** panes;
}
export function shgcModifier(theta, panes = 1) { return theta >= 90 ? 0 : fresnelT(theta, panes) / fresnelT(0, panes); }
export function shgcDiffuseRatio(panes = 1) {
  let s = 0, N = 90;
  for (let i = 0; i < N; i++) { const t = ((i + 0.5) * 90) / N, r = (t * Math.PI) / 180; s += shgcModifier(t, panes) * 2 * Math.cos(r) * Math.sin(r) * (Math.PI / 2 / N); }
  return s;
}

// ---------- air-conditioned rooms: RTS ----------
const RF = { wall: 0.63, roof: 0.84, window: 0.63, people: 0.70 };  // radiant fractions (PHVAC 9th ed. Table 1)
function calcAC(room, project, data) {
  const a = ashOf(room), pa = projectAsh(project), ac = a.ac, basis = [], notes = [];
  const st = STATIONS[pa.station] || STATIONS[DEFAULT_STATION];
  const p = pAtm(project.altitude ?? st.elev ?? 0);
  const Tr = n0(room.T), RHr = n0(room.RH), H = n0(room.H), W = n0(room.W), L = n0(room.L);
  const rp = stateTRH(Tr, RHr, p);
  const area = W * L, vol = area * H;
  const k = (m) => data.k[m];
  const ceilType = room.ceiling?.type ?? 'EPS';
  const kIns = (t) => k(t) ?? 0.026;
  const cpAir = 1.23 * p / 101.325, lat = 3010 * p / 101.325;   // Ch. 18 standard-air constants, scaled for site pressure

  // room surfaces for RTS and conduction
  const rtsSurf = [], walls = [];
  for (let i = 0; i < 4; i++) {
    const w = room.walls?.[i] || {}, aw = a.walls[i];
    const len = i === 0 || i === 3 ? L : W;
    const outside = w.source === 'outside';
    const wt = w.type ?? ceilType, thk = thickness(data, Tr, wt) ?? 50;
    const layers = construction(aw.construction, { kIns: kIns(wt), thk });
    const winA = outside ? Math.min(n0(aw.win.area), len * H) : 0;
    const Aw = Math.max(0, len * H - winA);
    const cts = conductionTimeSeries(layers);
    walls.push({ i, outside, orient: aw.orient, colour: aw.colour, construction: aw.construction, Tadj: num(w.T), A: Aw, U: cts.U, cts: cts.cts, win: { ...aw.win, area: winA } });
    rtsSurf.push({ area: Aw, layers, boundary: outside ? 'outside' : 'partition', kind: 'wall' });
    if (winA > 0) rtsSurf.push({ area: winA, kind: 'window', U: aw.win.U, boundary: 'outside' });
  }
  const roofLayers = a.roof.exposed ? construction(a.roof.construction, { kIns: kIns(ceilType), thk: thickness(data, Tr, ceilType) ?? 50 })
    : construction('panel', { kIns: kIns(ceilType), thk: thickness(data, Tr, ceilType) ?? 50 });
  const roofCts = conductionTimeSeries(roofLayers);
  rtsSurf.push({ area, layers: roofLayers, boundary: a.roof.exposed ? 'outside' : 'partition', kind: 'ceiling' });
  rtsSurf.push({ area, layers: [{ L: 0.15, k: 1.73, rho: 2300, c: 0.88 }], boundary: 'ground', kind: 'floor' });
  const rts = radiantTimeSeries(rtsSurf);

  const cat = OCCUPANCY.find((o) => o.name === ac.category) || OCCUPANCY[0];
  const people = num(ac.people) ?? Math.round((cat.density * area) / 100);
  const act = ACTIVITIES.find((x) => x.value === a.people.activity) || ACTIVITIES[1];
  const occ = occupantGain(act.met, ac.clo ?? 0.5, Tr, RHr);
  const sensPP = num(a.people.sens) ?? occ.sensible, latPP = num(a.people.lat) ?? occ.latent;
  const lum = LUMINAIRES.find((x) => x.value === a.lighting.luminaire) || LUMINAIRES[0];
  const lpd = num(a.lighting.Wm2) ?? data.lighting[room.roomType] ?? 10;
  const Vbz = cat.Rp * people + cat.Ra * area, Voz = Vbz / (n0(ac.Ez) || 1);
  const ventLs = num(ac.ventLs) ?? Voz;
  const infLs = n0(ac.ach) * vol / 3.6;
  const occupied = (h) => { const s = n0(ac.occStart), e = n0(ac.occEnd); return s <= e ? h > s && h <= e : h > s || h <= e; }; // hour ending h

  const months = pa.month === 'peak' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [Number(pa.month)];
  let best = null;
  for (const m of months) {
    const n = dayOfYear21(m), mi = m - 1;
    const db = st.monthly.db04[mi], wb = st.monthly.mcwb04[mi], rng = st.monthly.mcdbr5[mi], wbr = st.monthly.mcwbr5[mi];
    const To = DAILY_FRACTION.map((f) => db - f * rng), Twb = DAILY_FRACTION.map((f) => wb - f * wbr);
    const Wo = To.map((t, h) => stateTWb(t, Math.min(Twb[h], t), p).W);
    const sky = [], sun = [];
    for (let h = 1; h <= 24; h++) { const s = sunPosition(n, h, st.lat, st.lon, st.tz); sun.push(s); sky.push(clearSky(n, s.beta, st.monthly.taub[mi], st.monthly.taud[mi])); }
    // hourly heat gains split into convective, radiant (nonsolar RTS) and radiant beam solar (solar RTS)
    const conv = new Array(24).fill(0), rad = new Array(24).fill(0), radSolar = new Array(24).fill(0), latent = new Array(24).fill(0);
    const comp = { wall: new Array(24).fill(0), roof: new Array(24).fill(0), part: new Array(24).fill(0), winCond: new Array(24).fill(0), solar: new Array(24).fill(0), people: new Array(24).fill(0), light: new Array(24).fill(0), equip: new Array(24).fill(0), infil: new Array(24).fill(0) };
    const add = (key, h, q, rf, solarBeam = false) => { comp[key][h] += q; if (solarBeam) radSolar[h] += q; else { rad[h] += q * rf; conv[h] += q * (1 - rf); } };
    for (const w of walls) {
      if (w.outside) {
        const psi = ORIENT[w.orient] ?? 0;
        const te = sun.map((s, h) => solAir(To[h], onSurface(s, sky[h], 90, psi).Et, w.colour, false));
        for (let h = 0; h < 24; h++) { let q = 0; for (let j = 0; j < 24; j++) q += w.cts[j] * (te[(h - j + 24) % 24] - Tr); add('wall', h, w.U * w.A * q, RF.wall); }
        if (w.win.area > 0) {
          const panes = w.win.panes || 1, ratio = shgcDiffuseRatio(panes);
          for (let h = 0; h < 24; h++) {
            add('winCond', h, w.win.U * w.win.area * (To[h] - Tr), RF.window);
            const E = onSurface(sun[h], sky[h], 90, psi);
            const beam = w.win.area * w.win.SHGC * shgcModifier(E.theta, panes) * E.Eb * n0(w.win.iac || 1);
            const diff = w.win.area * w.win.SHGC * ratio * (E.Ed + E.Er) * n0(w.win.iac || 1);
            if ((w.win.iac ?? 1) >= 0.999) { add('solar', h, beam, 1, true); add('solar', h, diff, 1); }
            else add('solar', h, beam + diff, 0.63);
          }
        }
      } else if (w.Tadj != null) {
        for (let h = 0; h < 24; h++) add('part', h, w.U * w.A * (w.Tadj - Tr), RF.wall);
      }
    }
    if (a.roof.exposed) {
      const te = sun.map((s, h) => solAir(To[h], onSurface(s, sky[h], 0, 0).Et, a.roof.colour, true));
      for (let h = 0; h < 24; h++) { let q = 0; for (let j = 0; j < 24; j++) q += roofCts.cts[j] * (te[(h - j + 24) % 24] - Tr); add('roof', h, roofCts.U * area * q, RF.roof); }
    } else {
      const Ta = num(room.ceiling?.T) ?? 45;
      for (let h = 0; h < 24; h++) add('roof', h, roofCts.U * area * (Ta - Tr), RF.roof);
    }
    for (let h = 0; h < 24; h++) {
      const on = occupied(h + 1);
      if (on) {
        add('people', h, people * sensPP, occ.radiantFraction ?? RF.people); latent[h] += people * latPP;
        add('light', h, lpd * area * (1 - lum.ra), lum.rad);
        add('equip', h, n0(ac.equipW), n0(ac.equipRad));
      }
      const qi = cpAir * infLs * (To[h] - Tr);
      add('infil', h, qi, 0); latent[h] += lat * infLs * (Wo[h] - rp.W);
    }
    const rtsConv = (src, series) => src.map((_, h) => { let s = 0; for (let j = 0; j < 24; j++) s += series[j] * src[(h - j + 24) % 24]; return s; });
    const radCL = rtsConv(rad, rts.nonsolar), solCL = rtsConv(radSolar, rts.solar);
    const roomS = conv.map((c, h) => c + radCL[h] + solCL[h]);
    for (let h = 0; h < 24; h++) {
      const on = occupied(h + 1);
      const vS = on ? cpAir * ventLs * (To[h] - Tr) : 0, vL = on ? lat * ventLs * (Wo[h] - rp.W) : 0;
      const lightRA = on ? lpd * area * lum.ra : 0;
      const coil = roomS[h] + latent[h] + vS + vL + lightRA;
      if (!best || coil > best.coil) best = { month: m, hour: h + 1, coil, roomS: roomS[h], roomL: latent[h], vS, vL, lightRA, To: To[h], Twb: Twb[h], Wo: Wo[h], comp, conv, radCL, solCL, roomSArr: roomS, latentArr: latent.slice(), ToArr: To, h };
    }
  }

  const hh = best.h;
  // cooling load of each component at the peak hour (convective now + its radiant part through RTS)
  const clOf = (key, rf, series, beam = false) => {
    const src = best.comp[key];
    let c = 0;
    for (let j = 0; j < 24; j++) {
      const q = src[(hh - j + 24) % 24];
      c += (beam ? 0 : series[j] * q * rf) + (j === 0 ? q * (1 - rf) : 0);
    }
    return c;
  };
  const cl = {
    walls: clOf('wall', RF.wall, rts.nonsolar), roof: clOf('roof', RF.roof, rts.nonsolar), partitions: clOf('part', RF.wall, rts.nonsolar),
    windowCond: clOf('winCond', RF.window, rts.nonsolar), people: clOf('people', occ.radiantFraction ?? RF.people, rts.nonsolar),
    lighting: clOf('light', lum.rad, rts.nonsolar), equipment: clOf('equip', n0(ac.equipRad), rts.nonsolar), infiltration: best.comp.infil[hh],
  };
  cl.solar = best.roomS - Object.values(cl).reduce((s, x) => s + x, 0);   // remainder = window solar (beam + diffuse)
  const roomS = best.roomS, roomL = best.roomL, vent = best.vS + best.vL;
  const coil = best.coil, sf = a.sf, required = (coil * (1 + sf / 100)) / 1000;
  const Ts = n0(ac.supplyT) || 13;
  const supplyLs = roomS > 0 ? roomS / (cpAir * (Tr - Ts)) : 0;
  const Wsup = supplyLs > 0 ? rp.W - roomL / (lat * supplyLs) : rp.W;
  const oa = stateTW(best.To, best.Wo, p);
  const ma = supplyLs > 0 ? mix(oa, Math.min(ventLs, supplyLs), rp, Math.max(0, supplyLs - ventLs), p) : null;
  const sa = stateTW(Ts, Wsup, p);

  basis.push(['Weather', `${st.name}, ${st.edition} (${st.period}), monthly 0.4 % design dry bulb with coincident wet bulb and daily ranges, 21st day`]);
  basis.push(['Solar', 'ASHRAE clear-sky model with the station taub/taud; sol-air with α/ho 0.026 light, 0.052 dark (0.039 medium, app midpoint)']);
  basis.push(['Conduction', 'conduction time series generated for each construction (typical material values; check against datasheets)']);
  basis.push(['Radiant time series', 'generated by heat balance for this room\'s surfaces (solar to floor, non-solar spread by area)']);
  basis.push(['Glazing', 'SHGC at normal incidence with Fresnel angle dependence of uncoated panes; diffuse SHGC by hemispherical average']);
  basis.push(['People', `${act.label}; sensible/latent from the PMV heat balance at room conditions (${Math.round(sensPP)} W / ${Math.round(latPP)} W per person)`]);
  basis.push(['Outdoor air', `${cat.name}: Rp ${cat.Rp} L/s·person, Ra ${cat.Ra} L/s·m², Ez ${ac.Ez} → ${Math.round(Voz)} L/s${num(ac.ventLs) != null ? ` (entered ${ac.ventLs} L/s used)` : ''}`]);
  basis.push(['Radiant fractions', 'walls/windows 63 %, roofs 84 %, people from PMV model, lighting per luminaire (RP-1282), equipment as entered']);
  if (!a.walls.some((w, i) => room.walls?.[i]?.source === 'outside')) notes.push('No wall is set to Outside, so there is no solar or outdoor conduction load through walls.');

  const env = cl.walls + cl.roof + cl.partitions + cl.windowCond;
  const peopleLat = people * latPP * (best.roomL > 0 ? 1 : 0);
  const infilLat = roomL - peopleLat;
  const air = cl.infiltration + infilLat + vent;                 // infiltration (S + L) + outdoor air (S + L)
  const internal = cl.people + peopleLat + cl.lighting + best.lightRA + cl.equipment;
  return {
    engine: ASHRAE_ENGINE, profile: 'ASHRAE', kind: 'ac', pressure: p, station: st,
    psychro: { room: { T: Tr, RH: RHr, h: rp.h, v: rp.v, rho: rp.rho }, makeUp: null },
    peak: { month: best.month, hour: best.hour, To: best.To, Twb: best.Twb, roomS, roomL, ventS: best.vS, ventL: best.vL, lightRA: best.lightRA, coil, SHR: roomS / (roomS + roomL), supplyLs, supplyT: Ts },
    cl, rts, people: { count: people, sensPP, latPP, met: act.met, radiantFraction: occ.radiantFraction }, ventilation: { Vbz, Voz, used: ventLs, category: cat }, infiltrationLs: infLs,
    hourly: { To: best.ToArr, roomS: best.roomSArr, roomL: best.latentArr },
    points: { oa, ra: rp, ma, sa },
    transmission: { surfaces: walls.map((w) => ({ name: `Wall ${w.i + 1}`, A: w.A, U: w.U, q: 0 })), total: env / 1000 },
    infiltration: { doors: [], makeUp: { q: 0 }, total: air / 1000 },
    product: { items: [], total: 0 },
    solar: { total: cl.solar / 1000 },
    equipment: { total: internal / 1000 },
    parts: [['envelope', 'Envelope conduction', env / 1000], ['solar', 'Window solar', cl.solar / 1000], ['air', 'Infiltration + outdoor air', air / 1000], ['internal', 'People, lights, equipment', internal / 1000]],
    totals: { total: coil / 1000, safetyFactor: sf, afterSF: required, runHours: 24, required },
    basis, notes,
  };
}

export function calcRoomASHRAE(room, project, data) {
  try {
    if (room.T == null || room.RH == null) return null;
    return isAC(room) ? calcAC(room, project, data) : calcRefrigeration(room, project, data);
  } catch (e) {
    console.error(e);
    return null;
  }
}
