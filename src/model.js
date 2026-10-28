// Project data model, V1.25 defaults, validation and warnings. Pure functions.
export const SCHEMA = 1;
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Defaults are the values the V1.25 master already carries in its input cells.
// They must be confirmed once per project (refrigeration-estimating workflow rule).
export const MASTER_DEFAULTS = [
  { key: 'ceiling.T', label: 'Ceiling surface temperature', value: 45, unit: '°C', cell: 'M9' },
  { key: 'ceiling.RH', label: 'Ceiling RH', value: 60, unit: '%', cell: 'M10' },
  { key: 'ceiling.type', label: 'Insulation type (ceiling, walls default)', value: 'EPS', unit: '', cell: 'M11' },
  { key: 'floor.T', label: 'Floor temperature', value: 30, unit: '°C', cell: 'M15' },
  { key: 'floor.RH', label: 'Floor RH', value: 60, unit: '%', cell: 'M16' },
  { key: 'floor.convection', label: 'Floor convection', value: 'Yes', unit: '', cell: 'M19' },
  { key: 'safetyFactor', label: 'Safety factor', value: 15, unit: '%', cell: 'L76' },
  { key: 'forklift.kW', label: 'Forklift power', value: 7, unit: 'kW', cell: 'G62' },
  { key: 'forklift.hours', label: 'Loading time / day', value: 8, unit: 'h', cell: 'G63' },
  { key: 'forklift.kgPerPallet', label: 'Product weight / pallet', value: 600, unit: 'kg', cell: 'G64' },
];

// Template Table 3 (recommended door opening time, min/hr)
export const OPEN_MIN_HINT = { 'Freezer - IQF': 0, 'Freezer - Trolley': 0, 'Chilled Room': 15, 'Cold Room': 15, 'Ante Room': 10, 'Processing Area': 15, 'Loading Dock': 15, 'Air Conditioning': 15 };
// Template Table 2 (effectiveness of doorway protective device)
export const DOOR_E = [
  { E: 0, label: 'No protection (E = 0)' },
  { E: 0.7, label: 'Air curtain / ASRS door (0.7)' },
  { E: 0.8, label: 'Plastic curtain, cold room (0.8)' },
  { E: 0.85, label: 'Air lock room before cold room (0.85)' },
  { E: 0.95, label: 'Plastic curtain fully closed (0.95)' },
  { E: 0.475, label: 'Plastic curtain open 50 % (0.475)' },
];
export const INSULATION = ['EPS', 'XPS', 'PU', 'PIR', 'Concrete'];
export const LIMITS = { walls: 4, doorsPerWall: 2, products: 5, equipment: 10 };

export function newRoom(name = 'Room 1', roomType = 'Cold Room') {
  return {
    id: uid(), name, roomType, T: null, RH: null, H: null, W: null, L: null,
    ceiling: { T: 45, RH: 60, type: 'EPS' },
    floor: { T: 30, RH: 60, convection: 'Yes' },           // floor.type absent = V1.25 auto (Concrete if T ≥ 10 °C)
    walls: [0, 1, 2, 3].map(() => ({ T: null, source: 'outside', doors: [{}, {}] })), // type absent = same as ceiling; source: 'outside' | roomId | null (manual)
    products: [], workers: 0, fanMotorKW: null,
    forklift: { kW: 7, hours: 8, kgPerPallet: 600, tonPerDay: null },
    equipment: [], makeUp: { T: null, RH: null, CMH: null }, safetyFactor: 15,
    extras: { glass: 0, defrost: 0, packaging: 0 }, notes: '',
  };
}
export function newFloor(name = 'Floor 1') { return { id: uid(), name, rooms: [newRoom('Room 1')] }; }
export function newProject(name = 'New project') {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA, id: uid(), name, client: '', site: '', engineer: '', jobNo: '', notes: '',
    createdAt: now, updatedAt: now, revision: 'A', defaultsConfirmed: false, profile: 'V1.25 parity',
    outdoor: { T: 35, RH: 60 }, altitude: 0,
    buildings: [{ id: uid(), name: 'Building 1', floors: [newFloor('Floor 1')] }],
  };
}

// Walls linked to "Outside" or to another room take that temperature; their doors take its RH
// unless the user typed the door RH (rhManual). Runs after every edit.
export function syncLinks(p) {
  const byId = new Map([...eachRoom(p)].map((x) => [x.room.id, x.room]));
  for (const { room } of eachRoom(p)) {
    for (const w of room.walls) {
      if (w.source == null) continue;
      const src = w.source === 'outside' ? p.outdoor : byId.get(w.source);
      if (!src || src === room) { w.source = null; continue; }
      w.T = src.T ?? null;
      for (const d of w.doors) if (d && d.count > 0 && !d.rhManual) d.RH = src.RH ?? null;
    }
  }
  return p;
}
export function sourceLabel(p, w) {
  if (w.source === 'outside') return `Outside ${p.outdoor?.T ?? '—'} °C / ${p.outdoor?.RH ?? '—'} %`;
  const r = w.source && findRoom(p, w.source)?.room;
  return r ? `${r.name} ${r.T ?? '—'} °C / ${r.RH ?? '—'} %` : 'Manual';
}

export function* eachRoom(project) {
  for (const b of project.buildings) for (const f of b.floors) for (const r of f.rooms) yield { building: b, floor: f, room: r };
}
export function findRoom(project, roomId) {
  for (const x of eachRoom(project)) if (x.room.id === roomId) return x;
  return null;
}

// ---------- warnings (UI + report) ----------
export function roomWarnings(room, result, data) {
  const w = [];
  const need = [['T', 'Room temperature'], ['RH', 'Room RH'], ['H', 'Room height'], ['W', 'Room width'], ['L', 'Room length']];
  for (const [k, label] of need) if (room[k] == null || room[k] === '') w.push({ level: 'error', text: `${label} is empty.` });
  if (room.RH != null && (room.RH < 0 || room.RH > 100)) w.push({ level: 'error', text: 'Room RH must be 0–100 %.' });
  if (room.T != null && (room.T < -60 || room.T >= 55)) w.push({ level: 'error', text: 'Room temperature is outside the V1.25 psychrometric table (−60 to 55 °C).' });
  room.walls.forEach((wl, i) => {
    if (wl.T == null || wl.T === '') w.push({ level: 'warn', text: `Wall ${i + 1}: outside temperature is empty, so it adds no load.` });
    if ((wl.type ?? room.ceiling.type) === 'Concrete') w.push({ level: 'warn', text: `Wall ${i + 1}: V1.25 has no thickness for Concrete walls, so U = 0 (finding F18).` });
    wl.doors.forEach((d, j) => {
      if (!d || !d.count) return;
      if (!(d.W > 0) || !(d.H > 0)) w.push({ level: 'error', text: `Wall ${i + 1} door ${j + 1}: width and height are required.` });
      if (d.RH == null) w.push({ level: 'error', text: `Wall ${i + 1} door ${j + 1}: RH of the air coming in is empty. V1.25 would use 0 % and under-estimate infiltration.` });
    });
  });
  const mu = room.makeUp || {};
  if (mu.CMH > 0 && (mu.T == null || mu.RH == null)) w.push({ level: 'error', text: 'Make-up air: volume is set but temperature or RH is empty, so it adds no load.' });
  if (mu.CMH > 0 && mu.CMH < 50) w.push({ level: 'warn', text: `Make-up air is only ${mu.CMH} CMH. Check the number (use 2000 or 2,000 for two thousand).` });
  (result?.product.items || []).forEach((p) => {
    if (p.q < 0) w.push({ level: 'warn', text: `Product ${p.idx}: load is negative (T in < T out). V1.25 keeps the negative value (finding F17).` });
    if (p.tf != null && p.tin === p.tf && p.tout < p.tf) w.push({ level: 'warn', text: `Product ${p.idx}: enters exactly at its freezing point; V1.25 skips the latent heat (F6).` });
    if (p.tout != null && room.T != null && p.tout < room.T) w.push({ level: 'warn', text: `Product ${p.idx}: leaving temperature is below room air temperature.` });
    if (p.name && !(p.hours > 0)) w.push({ level: 'error', text: `Product ${p.idx}: cooling time is required.` });
  });
  for (const t of result?.transmission.surfaces || []) if (t.raw < 0) w.push({ level: 'info', text: `${t.name}: heat flows out (${t.raw.toFixed(2)} kW); V1.25 counts it as 0.` });
  if (result && !(result.totals.required > 0) && !w.some((x) => x.level === 'error')) w.push({ level: 'warn', text: 'Required capacity is zero or negative.' });
  return w;
}

// ---------- .hlp import/export ----------
export function toHlp(project) {
  return JSON.stringify({ format: 'heat-load-studio', schema: SCHEMA, exportedAt: new Date().toISOString(), project }, null, 1);
}
export function fromHlp(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('This file is not a Heat Load Studio project (.hlp).'); }
  if (o?.format !== 'heat-load-studio' || !o.project) throw new Error('This file is not a Heat Load Studio project (.hlp).');
  if (o.schema > SCHEMA) throw new Error('This project was made by a newer version of the app. Update the app first.');
  const p = migrate(o.project);
  const bad = [];
  if (typeof p.name !== 'string') bad.push('name');
  if (!Array.isArray(p.buildings)) bad.push('buildings');
  for (const { room } of eachRoom(p)) {
    if (!Array.isArray(room.walls) || room.walls.length !== 4) bad.push(`walls of ${room.name}`);
    for (const k of ['T', 'RH', 'H', 'W', 'L']) if (room[k] != null && typeof room[k] !== 'number') bad.push(`${k} of ${room.name}`);
  }
  if (bad.length) throw new Error(`Project file is damaged: ${bad.slice(0, 5).join(', ')}.`);
  return p;
}
export function migrate(p) {
  p.schema = p.schema || 1;
  p.outdoor = p.outdoor || { T: 35, RH: 60 };
  if (p.altitude == null) p.altitude = 0;
  for (const { room } of eachRoom(p)) {
    room.walls.forEach((w) => { if (!('source' in w)) w.source = null; });
    room.extras = room.extras || { glass: 0, defrost: 0, packaging: 0 };
    room.walls.forEach((w) => { w.doors = w.doors || [{}, {}]; while (w.doors.length < 2) w.doors.push({}); });
  }
  return p;
}
export function cloneProject(p) {
  const c = JSON.parse(JSON.stringify(p));
  c.id = uid(); c.name = `${p.name} (copy)`; c.createdAt = c.updatedAt = new Date().toISOString();
  for (const b of c.buildings) { b.id = uid(); for (const f of b.floors) { f.id = uid(); for (const r of f.rooms) r.id = uid(); } }
  return c;
}
export const excelSerial = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
