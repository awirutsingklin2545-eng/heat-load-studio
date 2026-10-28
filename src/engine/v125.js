// Heat Load Studio — calculation engine, profile "V1.25 parity".
// Reproduces sheet "for copy" of Load Calculation V1.25 cell by cell.
// Each block notes the template cells it mirrors. Pure functions only: no DOM, no I/O.

export const ENGINE_VERSION = 'v125-parity-0.1.0';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const n0 = (x) => num(x) ?? 0;
const ok = (x) => Number.isFinite(x);
const safe = (f, fallback = 0) => { try { const r = f(); return ok(r) ? r : fallback; } catch { return fallback; } };
const tryObj = (f) => { try { return f(); } catch { return null; } };

// Excel MATCH(x, sorted, 1): index of the largest value <= x, or -1.
function matchLE(x, arr) {
  let k = -1;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= x) k = i; else break;
  return k;
}
// Excel VLOOKUP(x, table, 2, TRUE)
function vlookupApprox(x, rows) {
  const k = matchLE(x, rows.map((r) => r[0]));
  if (k < 0) throw new Error('#N/A');
  return rows[k][1];
}

// ---------- Psychrometrics by table (BX91:CX115 + rows 131-164) ----------
// Bilinear interpolation exactly as the template: first along T at RH_low and RH_high, then along RH.
function tableLookup(psy, which, T, RH) {
  const Ts = psy.T, RHs = psy.RH, tab = psy[which];
  const iT = matchLE(T, Ts);
  if (iT < 0 || iT + 1 >= Ts.length) throw new Error('#N/A T');
  const tD = Ts[iT], tH = Ts[iT + 1];
  const iR = matchLE(RH, RHs);
  if (iR < 0 || iR + 1 >= RHs.length) throw new Error('#N/A RH');
  const rD = RHs[iR], rH = RHs[iR + 1];
  const atT = (j) => { const a = tab[iT][j], b = tab[iT + 1][j]; return ((b - a) / (tH - tD)) * (T - tD) + a; };
  const lo = atT(iR), hi = atT(iR + 1);
  return ((hi - lo) / (rH - rD)) * (RH - rD) + lo;
}
export function psyPoint(psy, T, RH) {
  const h = tableLookup(psy, 'h', T, RH);
  const v = tableLookup(psy, 'v', T, RH);
  return { T, RH, h, v, rho: 1 / v };
}

// ---------- helpers mirroring template lookups ----------
function thickness(data, roomT, type) {
  // D24 / M12: EPS|XPS -> FE88:FF94, PU|PIR -> FH88:FI92, else ""
  if (roomT == null) return null;
  if (type === 'EPS' || type === 'XPS') return safe(() => vlookupApprox(roomT, data.thkPS), null);
  if (type === 'PU' || type === 'PIR') return safe(() => vlookupApprox(roomT, data.thkPU), null);
  return null;
}
function foodByName(data, name) {
  // VLOOKUP(name, AI88:AO315, …, FALSE) -> first match
  return data.foods.find((f) => f[0] === name) || null;
}
function forecastLinear(x, pts) {
  const n = pts.length; if (n < 2) return NaN;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [a, b] of pts) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; }
  const b = sxy / sxx; return my + b * (x - mx);
}

// ---------- room input schema (parity profile) ----------
// walls: [w1,w2,w3,w4]; w1 & w4 run along Length (J14), w2 & w3 along Width (J13).
// each wall: { T, type, doors:[d1,d2] }, door: { RH, count, E, openMin, W, H }
export const WALL_COLS = ['D', 'G', 'J', 'M'];

export function calcRoomV125(room, data) {
  const r = room;
  const T = num(r.T), RH = num(r.RH);
  const H = num(r.H), W = num(r.W), L = num(r.L);
  const type = r.roomType;
  const isLoading = type === 'Loading Dock';
  const isABF = type === 'Freezer - Trolley';
  const ceilType = r.ceiling?.type ?? 'EPS';
  const notes = [];

  // ---- Transmission (P87:Y97) ----
  const k = (t) => data.k[t];
  const surfaces = [];
  const ceilT = thickness(data, T, ceilType);
  const U_c = safe(() => k(ceilType) / (ceilT / 1000));
  surfaces.push(trans('Ceiling', r.ceiling?.T ?? 45, ceilType, ceilT, U_c, n0(W) * n0(L)));

  const floorType = r.floor?.type ?? (T != null && T >= 10 ? 'Concrete' : ceilType); // M17 default
  const floorT = floorType === 'Concrete' ? 200 : thickness(data, T, floorType);       // M18
  const conv = (r.floor?.convection ?? 'Yes') === 'Yes';
  const U_f = safe(() => conv ? 1 / (1 / 1.6 + (floorT / 1000) / k(floorType) + 1 / 1.6) : k(floorType) / (floorT / 1000));
  surfaces.push(trans('Floor', r.floor?.T ?? 30, floorType, floorT, U_f, n0(W) * n0(L)));

  const walls = r.walls || [];
  for (let i = 0; i < 4; i++) {
    const w = walls[i] || {};
    const wt = w.type ?? ceilType;                       // D23 = $M$11 default
    const th = thickness(data, T, wt);
    const U = safe(() => k(wt) / (th / 1000));
    const len = i === 0 || i === 3 ? L : W;              // D26=J14, G26=J13, J26=J13, M26=J14
    surfaces.push(trans(`Wall ${i + 1}`, num(w.T), wt, th, U, safe(() => H * len)));
  }
  function trans(name, Tout, matType, thk, U, A) {
    const dT = n0(Tout) - n0(T);
    const raw = safe(() => (U * A * dT) / 1000);
    return { name, Tout, type: matType, thickness: thk, k: k(matType), U, A, dT, raw, q: raw >= 0 ? raw : 0 };
  }
  const transmission = surfaces.reduce((s, x) => s + x.q, 0);           // C75

  // ---- Psychrometrics ----
  const roomPt = tryObj(() => psyPoint(data.psy, T, RH));
  const rho_r = roomPt?.rho ?? NaN, h_r = roomPt?.h ?? NaN;           // CM163, CF163

  // ---- Infiltration per door (BW119:CM128, BS166:CI175) ----
  const doors = [];
  for (let i = 0; i < 4; i++) {
    const w = walls[i] || {};
    for (let j = 0; j < 2; j++) {
      const d = (w.doors || [])[j] || {};
      const Tin = num(w.T);                                              // D28 = D22
      const pt = tryObj(() => psyPoint(data.psy, Tin, n0(d.RH)));    // IFERROR -> 0 path
      const hi = pt?.h ?? 0, rho_i = pt?.rho ?? 0;
      const A = n0(d.W) * n0(d.H);
      const Fm = safe(() => (2 / (1 + (rho_r / rho_i) ** (1 / 3))) ** 1.5);
      const qFull = safe(() => 0.221 * A * (hi - h_r) * rho_r * Math.sqrt(1 - rho_i / rho_r) * Math.sqrt(9.81 * n0(d.H)) * Fm);
      const Dt = (n0(d.count) * (10 + n0(d.openMin) * 60)) / 3600;
      const Df = safe(() => (Math.abs((Tin ?? NaN) - T) >= 11 ? 0.8 : 1.1));
      const oneMinusE = 1 - n0(d.E);
      const qDoor = safe(() => qFull * Dt * Df * oneMinusE);
      // loading-door gap: Wall 1 Door 1 uses (W-0.025) on one side — template quirk F7
      const gapW1 = i === 0 && j === 0 ? 0.025 : 0.01;
      const gapArea = n0(d.H) * 0.01 * 2 + (n0(d.W) - gapW1) * 0.01 + (n0(d.W) - 0.01) * 0.01;
      const gapCMH = gapArea * 0.5 * 3600;
      const gapOne = safe(() => { const q = rho_r * (gapCMH / 3600) * (hi - h_r); return q < 0 ? 0 : q; });
      const qGap = safe(() => n0(d.count) * gapOne);
      const q = isLoading ? qGap : qDoor;
      doors.push({ name: `Wall ${i + 1} Door ${j + 1}`, Tin, RH: num(d.RH), count: n0(d.count), A, hi, rho_i, h_r, rho_r,
        Fm, qFull, Dt, Df, E: n0(d.E), qDoor, loading: isLoading, gapArea: Math.ceil(gapArea * 1000 - 1e-9) / 1000, gapCMH, qGap, q });
    }
  }
  const mu = r.makeUp || {};
  const muPt = tryObj(() => psyPoint(data.psy, n0(mu.T), n0(mu.RH)));
  const qMakeUp = safe(() => { const q = rho_r * (n0(mu.CMH) / 3600) * (muPt.h - h_r); return q < 0 ? 0 : q; });
  const infiltration = doors.reduce((s, x) => s + x.q, 0) + qMakeUp;   // F78

  // ---- Product (BP88:BU94) ----
  const products = (r.products || []).slice(0, 5).map((p, idx) => {
    const f = p.name ? foodByName(data, p.name) : null;
    const tf = f ? (f[2] === '—' ? -1 : f[2]) : null;                    // D54
    const cA = f ? f[3] : null, cB = f ? (f[4] === '—' ? 0 : f[4]) : null, Lf = f ? f[6] : null;
    const tin = num(p.tIn), tout = num(p.tOut);
    const rate = safe(() => p.ton / p.hours, null);                      // D59 t/h
    const kgs = rate == null ? 0 : rate / 3.6;                           // (t/h)/3.6 = kg/s
    let qa = 0, ql = 0, qb = 0;
    if (f && tin != null && tout != null && tf != null) {
      if (tin >= tf && tout >= tf) qa = kgs * cA * (tin - tout);
      else if (tin >= tf && tout <= tf) qa = kgs * cA * (tin - tf);
      if (tin > tf && tout <= tf) ql = kgs * Lf;
      if (tin <= tf && tout <= tf) qb = kgs * cB * (tin - tout);
      else if (tin >= tf && tout <= tf) qb = kgs * cB * (tf - tout);
    }
    const qr = (n0(p.ton) * n0(p.respiration)) / 1000;
    const sum = safe(() => qa + ql + qb + qr);
    return { idx: idx + 1, category: p.category, name: p.name, tf, cA, cB, latent: Lf, tin, tout, ton: num(p.ton), hours: num(p.hours), rate, qa, ql, qb, qr, q: sum };
  });
  const product = products.reduce((s, x) => s + x.q, 0);                // I74

  // ---- Equipment (B61:L73) ----
  const lightF = data.lighting[type];
  const qLight = safe(() => (lightF * W * L) / 1000);                    // L69
  const qWorker = safe(() => ((272 - 6 * T) * n0(r.workers)) / 1000);    // L70
  const fk = r.forklift || {};
  const fkFactor = forkliftFactor(type, W, L, H, fk);                    // G66
  const eq = (r.equipment || []).slice(0, 10);
  const qEquipMotor = safe(() => eq.reduce((s, e) => s + n0(e.kW) * n0(e.factor), 0) + n0(fk.kW ?? 7) * fkFactor); // L72
  let qFan;
  const fanActual = n0(r.fanMotorKW);
  if (fanActual > 0) qFan = fanActual;
  else if (!isABF) qFan = safe(() => n0(data.fanFactor[type]) * (transmission + infiltration + product + qLight + qWorker + qEquipMotor));
  else {
    const flow = Math.max(n0(W), n0(L)) * 20000;                         // D65
    const f = forecastLinear(flow, data.abf);
    qFan = safe(() => (f < 0 ? 0 : f * 1.03));                           // DQ87
  }
  const equipment = qLight + qWorker + qFan + qEquipMotor;              // L73

  // ---- Totals (L75:L79) ----
  const total = infiltration + transmission + product + equipment;       // L75
  const sf = num(r.safetyFactor) ?? 15;
  const afterSF = total * (1 + sf / 100);                                // L77
  const runHours = T == null ? null : isABF ? 24 : T <= 5 ? 20 : 24;    // L78
  const required = safe(() => afterSF * (24 / runHours));               // L79

  if (walls.some((w) => w && w.type === 'Concrete')) notes.push('Wall type Concrete has no thickness in V1.25 → U = 0 (no wall load).');
  for (const p of products) if (p.tin != null && p.tf != null && p.tin === p.tf && p.tout < p.tf) notes.push(`Product ${p.idx}: enters at freezing point, V1.25 skips latent heat (F6).`);

  return {
    engine: ENGINE_VERSION, profile: 'V1.25 parity',
    psychro: { room: roomPt, makeUp: muPt },
    transmission: { surfaces, total: transmission },
    infiltration: { doors, makeUp: { ...mu, q: qMakeUp }, total: infiltration },
    product: { items: products, total: product },
    equipment: { lighting: qLight, lightingFactor: lightF, workers: qWorker, fan: qFan, motors: qEquipMotor, forkliftFactor: fkFactor, total: equipment },
    totals: { total, safetyFactor: sf, afterSF, runHours, required },
    notes,
  };
}

function forkliftFactor(type, W, L, H, fk) {
  // FL87:FP119
  const hrs = n0(fk.hours ?? 8), kgPallet = n0(fk.kgPerPallet ?? 600), tonDay = n0(fk.tonPerDay);
  const speed = ((13.5 + 15.5) / 2 / 2) / 3.6;                // FM93
  const dist = (n0(W) + n0(L)) * 2;                           // FM97
  const travel = dist / speed;                                // FM98
  const Hmm = n0(H) * 1000;
  const up = n0(H) < 4700 ? Hmm / 330 : 4700 / 330;          // FM99 (template compares m with mm)
  const down = n0(H) < 4700 ? Hmm / 540 : 4700 / 540;        // FM100
  const trips = safe(() => (tonDay * 1000) / kgPallet);       // FM107
  const f = (secTrip) => safe(() => (trips * secTrip) / (hrs * 3600));
  const M = (travel + up + down) * 1.15;                      // FM105
  const N = travel * 1.15;                                    // FN105 (ante: travel only)
  const O = (travel + 500 / 330) * 1.25;                      // FO105 (loading)
  switch (type) {
    case 'Ante Room': return f(N);
    case 'Chilled Room': case 'Cold Room': case 'Processing Area': return f(M);
    case 'Loading Dock': return f(O);
    default: return 0;
  }
}
