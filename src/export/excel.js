// Excel export: patch the Load Calculation V1.25 master in place (XML level).
// One copy of sheet "for copy" per room, values written only into input cells,
// plus an "App extras" sheet (decision D3). Works in browser and Node: pass a JSZip class.

const MASTER_SHEET = 'xl/worksheets/sheet2.xml';         // "for copy"
const MASTER_RELS = 'xl/worksheets/_rels/sheet2.xml.rels';
const MASTER_DRAWING = 'xl/drawings/drawing1.xml';
const MASTER_DRAWING_RELS = 'xl/drawings/_rels/drawing1.xml.rels';
const CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const REL_SHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WALL = ['D', 'G', 'J', 'M'];
const PROD = ['D', 'F', 'H', 'J', 'L'];

// ---------- room -> input cells (value-only) ----------
export function inputCells(room, meta = {}) {
  const c = {};
  const put = (ref, v) => { if (v !== undefined && v !== null && v !== '') c[ref] = v; };
  put('G3', meta.userName); put('G4', meta.dateSerial);
  put('J3', room.name); put('J4', room.roomType);
  put('J9', room.T); put('J10', room.RH); put('J12', room.H); put('J13', room.W); put('J14', room.L);
  put('J17', room.makeUp?.T); put('J18', room.makeUp?.RH); put('J19', room.makeUp?.CMH);
  put('M9', room.ceiling?.T); put('M10', room.ceiling?.RH); put('M11', room.ceiling?.type);
  put('M15', room.floor?.T); put('M16', room.floor?.RH); put('M17', room.floor?.type); put('M19', room.floor?.convection);
  (room.walls || []).forEach((w, i) => {
    const col = WALL[i]; if (!col || !w) return;
    put(`${col}22`, w.T); put(`${col}23`, w.type);
    (w.doors || []).forEach((d, j) => {
      if (!d || j > 1) return; const b = j === 0 ? 29 : 38;
      put(`${col}${b}`, d.RH); put(`${col}${b + 1}`, d.count); put(`${col}${b + 2}`, d.E);
      put(`${col}${b + 3}`, d.openMin); put(`${col}${b + 4}`, d.W); put(`${col}${b + 5}`, d.H);
    });
  });
  (room.products || []).slice(0, 5).forEach((p, i) => {
    const col = PROD[i];
    put(`${col}48`, p.category); put(`${col}49`, p.name); put(`${col}50`, p.tIn); put(`${col}51`, p.tOut);
    put(`${col}52`, p.ton); put(`${col}53`, p.hours); put(`${col}58`, p.respiration);
  });
  put('D63', room.workers); put('D66', room.fanMotorKW);
  if (room.forklift) { put('G62', room.forklift.kW); put('G63', room.forklift.hours); put('G64', room.forklift.kgPerPallet); put('G65', room.forklift.tonPerDay); }
  (room.equipment || []).slice(0, 10).forEach((e, i) => {
    const [kc, fc] = i < 5 ? ['I', 'J'] : ['L', 'M']; const r = 62 + (i % 5);
    put(`${kc}${r}`, e.kW); put(`${fc}${r}`, e.factor);
  });
  put('L76', room.safetyFactor);
  return c;
}

// results from calcRoomV125 -> cached values for summary formula cells (so previews show numbers)
export function cachedCells(r) {
  const s = r.transmission.surfaces, d = r.infiltration.doors, p = r.product.items, e = r.equipment, t = r.totals;
  const v = { C69: s[0].q, C70: s[1].q, C71: s[2].q, C72: s[3].q, C73: s[4].q, C74: s[5].q, C75: r.transmission.total,
    F77: r.infiltration.makeUp.q, F78: r.infiltration.total, I74: r.product.total,
    L69: e.lighting, L70: e.workers, L71: e.fan, L72: e.motors, L73: e.total, L75: t.total, L77: t.afterSF, L79: t.required, P5: t.afterSF, P6: t.required };
  d.forEach((x, i) => { v[`F${69 + i}`] = x.q; });
  for (let i = 0; i < 5; i++) v[`I${69 + i}`] = p[i]?.q ?? 0;
  if (t.runHours != null) v.L78 = t.runHours;
  return v;
}

// ---------- low-level sheet XML patching ----------
const colNum = (ref) => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const rowNum = (ref) => +/(\d+)$/.exec(ref)[1];
function cellXml(ref, style, value) {
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}
function findCell(xml, ref) {
  const open = `<c r="${ref}"`;
  const i = xml.indexOf(open);
  if (i < 0) return null;
  const gt = xml.indexOf('>', i);
  const selfClose = xml[gt - 1] === '/';
  const end = selfClose ? gt + 1 : xml.indexOf('</c>', gt) + 4;
  const head = xml.slice(i, gt + 1);
  const style = (/ s="(\d+)"/.exec(head) || [])[1];
  return { start: i, end, head, body: xml.slice(i, end), style, isFormula: xml.slice(i, end).includes('<f') };
}
export function setInputValue(xml, ref, value) {
  const c = findCell(xml, ref);
  if (c) {
    if (c.isFormula && !DROPDOWN_FORMULA_INPUTS.has(ref)) throw new Error(`Refusing to overwrite formula cell ${ref}`);
    return xml.slice(0, c.start) + cellXml(ref, c.style, value) + xml.slice(c.end);
  }
  return insertCell(xml, ref, cellXml(ref, null, value));
}
// Cells that hold a default formula but carry a dropdown, i.e. the template invites typing over them.
const DROPDOWN_FORMULA_INPUTS = new Set(['D23', 'G23', 'J23', 'M23', 'M17', 'M11']);

function insertCell(xml, ref, cxml) {
  const r = rowNum(ref), col = colNum(ref);
  const rowOpen = new RegExp(`<row r="${r}"[^>]*?(/?)>`).exec(xml);
  if (!rowOpen) {
    // insert a new row before the first row with a larger number
    const re = /<row r="(\d+)"/g; let m, at = xml.indexOf('</sheetData>');
    while ((m = re.exec(xml))) if (+m[1] > r) { at = m.index; break; }
    return xml.slice(0, at) + `<row r="${r}">${cxml}</row>` + xml.slice(at);
  }
  if (rowOpen[1] === '/') return xml.slice(0, rowOpen.index) + rowOpen[0].replace('/>', '>') + cxml + '</row>' + xml.slice(rowOpen.index + rowOpen[0].length);
  const rowStart = rowOpen.index + rowOpen[0].length, rowEnd = xml.indexOf('</row>', rowStart);
  const re = /<c r="([A-Z]+\d+)"/g; re.lastIndex = rowStart; let m, at = rowEnd;
  while ((m = re.exec(xml)) && m.index < rowEnd) if (colNum(m[1]) > col) { at = m.index; break; }
  return xml.slice(0, at) + cxml + xml.slice(at);
}
// Remove cached results from every formula cell, so any spreadsheet app must calculate them.
export function stripCachedValues(xml) {
  // handles <v>…</v> and the empty form <v/> (Excel writes it for "" results)
  return xml.replace(/(<c [^>]*?)( t="(?:str|e|b|n)")?(>(?:<f[^>]*\/>|<f[^>]*>[^<]*<\/f>))(?:<v>[^<]*<\/v>|<v\/>)/g, '$1$3');
}
export function setCachedValue(xml, ref, value) {
  const c = findCell(xml, ref);
  if (!c || !c.isFormula || !Number.isFinite(value)) return xml;
  let body = c.body.replace(/ t="(str|e|b)"/, '').replace(/<v>[^<]*<\/v>|<v\/>/g, '');
  body = body.replace('</c>', `<v>${value}</v></c>`);
  return xml.slice(0, c.start) + body + xml.slice(c.end);
}

// Excel-strict structural check of a worksheet: one value per cell, cells in column order.
export function assertSheetXml(xml, name = 'sheet') {
  const problems = [];
  const reCell = /<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g; let m, lastRow = -1, lastCol = 0;
  while ((m = reCell.exec(xml))) {
    const col = colNum(m[1]), row = +m[2];
    if (row !== lastRow) { lastRow = row; lastCol = 0; }
    if (col <= lastCol) problems.push(`${m[1]}${m[2]} out of order`);
    lastCol = col;
    const body = m[3] || '';
    if ((body.match(/<v[ >\/]/g) || []).length > 1) problems.push(`${m[1]}${m[2]} has 2 values`);
    if ((body.match(/<f[ >\/]/g) || []).length > 1) problems.push(`${m[1]}${m[2]} has 2 formulas`);
    if (problems.length > 5) break;
  }
  if (problems.length) throw new Error(`Excel export check failed on "${name}": ${problems.join(', ')}`);
}

// ---------- sheet names ----------
export function sheetNames(names, reserved = ['AHU Cal', 'for copy', 'Sheet1', 'Sheet2', 'App extras']) {
  const used = new Set(reserved.map((s) => s.toLowerCase()));
  return names.map((raw, i) => {
    let base = String(raw || `Room ${i + 1}`).replace(/[\[\]:*?\/\\]/g, '-').replace(/^'+|'+$/g, '').trim() || `Room ${i + 1}`;
    base = base.slice(0, 31); let name = base, k = 2;
    while (used.has(name.toLowerCase())) { const sfx = ` (${k++})`; name = base.slice(0, 31 - sfx.length) + sfx; }
    used.add(name.toLowerCase()); return name;
  });
}
const quoteSheet = (n) => `'${n.replace(/'/g, "''")}'`;

// ---------- App extras sheet ----------
function extrasSheetXml(rows, project) {
  const H = ['Room sheet', 'Building / floor', 'Room type', 'V1.25 required (kW)', 'Glass (kW)', 'Defrost (kW)', 'Packaging (kW)', 'Grand total (kW)'];
  const L = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const str = (ref, s) => `<c r="${ref}" t="inlineStr"><is><t>${esc(s)}</t></is></c>`;
  const numc = (ref, n) => `<c r="${ref}"><v>${Number.isFinite(n) ? n : 0}</v></c>`;
  const fml = (ref, f, v) => `<c r="${ref}"><f>${esc(f)}</f><v>${Number.isFinite(v) ? v : 0}</v></c>`;
  let out = `<row r="1">${str('A1', 'Heat Load Studio — App extras (loads not in V1.25)')}</row>`;
  out += `<row r="2">${str('A2', `Project: ${project.name || ''}`)}${str('D2', `Engine: ${project.engine || ''}`)}</row>`;
  out += `<row r="4">${H.map((h, i) => str(`${L[i]}4`, h)).join('')}</row>`;
  rows.forEach((r, i) => {
    const n = 5 + i, g = r.glass || 0, d = r.defrost || 0, p = r.packaging || 0;
    out += `<row r="${n}">${str(`A${n}`, r.sheet)}${str(`B${n}`, r.floor || '')}${str(`C${n}`, r.roomType || '')}${fml(`D${n}`, `${quoteSheet(r.sheet)}!L79`, r.required)}`
      + `${numc(`E${n}`, g)}${numc(`F${n}`, d)}${numc(`G${n}`, p)}${fml(`H${n}`, `SUM(D${n}:G${n})`, (r.required || 0) + g + d + p)}</row>`;
  });
  const last = 4 + rows.length, t = last + 1;
  const sum = (k) => rows.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0);
  const tots = [sum('required'), sum('glass'), sum('defrost'), sum('packaging')];
  out += `<row r="${t}">${str(`A${t}`, 'Total')}${['D', 'E', 'F', 'G', 'H'].map((c, j) => fml(`${c}${t}`, `SUM(${c}5:${c}${last})`, j < 4 ? tots[j] : tots.reduce((a, b) => a + b, 0))).join('')}</row>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="8" width="20" customWidth="1"/></cols>`
    + `<sheetData>${out}</sheetData></worksheet>`;
}

// ---------- main ----------
// rooms: [{ room, result, extras:{glass,defrost,packaging} }]
export async function exportWorkbook(JSZip, masterBytes, rooms, project = {}) {
  const zip = await JSZip.loadAsync(masterBytes);
  const master = await zip.file(MASTER_SHEET).async('string');
  const masterRels = await zip.file(MASTER_RELS).async('string');
  const drawing = await zip.file(MASTER_DRAWING).async('string');
  const drawingRels = await zip.file(MASTER_DRAWING_RELS).async('string');
  let wb = await zip.file('xl/workbook.xml').async('string');
  let wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let ct = await zip.file('[Content_Types].xml').async('string');

  // drop calcChain (Excel rebuilds it) and force full recalculation on open
  zip.remove('xl/calcChain.xml');
  wbRels = wbRels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, '');
  ct = ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '');
  wb = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => `<calcPr${a.replace(/ fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`);

  const existingSheets = (wb.match(/<sheet /g) || []).length;
  let nextSheetId = Math.max(...[...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1])) + 1;
  let fileNo = Math.max(...Object.keys(zip.files).map((f) => +((/xl\/worksheets\/sheet(\d+)\.xml$/.exec(f) || [])[1] || 0))) + 1;
  let drawNo = Math.max(...Object.keys(zip.files).map((f) => +((/xl\/drawings\/drawing(\d+)\.xml$/.exec(f) || [])[1] || 0))) + 1;

  const names = sheetNames(rooms.map((x) => x.room.name));
  let sheetTags = '', defNames = '', relTags = '', ctTags = '';
  const extrasRows = [];
  rooms.forEach(({ room, result, extras = {}, floor }, i) => {
    let xml = stripCachedValues(master.replace(/ tabSelected="1"/, ''));
    for (const [ref, val] of Object.entries(inputCells(room, project))) xml = setInputValue(xml, ref, val);
    if (result && !project.noCache) for (const [ref, val] of Object.entries(cachedCells(result))) xml = setCachedValue(xml, ref, val);
    if (i === 0) xml = xml.replace('<sheetView ', '<sheetView tabSelected="1" ');
    assertSheetXml(xml, names[i]);
    const sheetPath = `xl/worksheets/sheet${fileNo}.xml`, dPath = `xl/drawings/drawing${drawNo}.xml`;
    zip.file(sheetPath, xml);
    zip.file(`xl/worksheets/_rels/sheet${fileNo}.xml.rels`, masterRels.replace('drawing1.xml', `drawing${drawNo}.xml`));
    zip.file(dPath, drawing);
    zip.file(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, drawingRels);
    const rid = `rIdHls${i + 1}`;
    sheetTags += `<sheet name="${esc(names[i])}" sheetId="${nextSheetId++}" r:id="${rid}"/>`;
    defNames += `<definedName name="_xlnm.Print_Area" localSheetId="${existingSheets + i}">${esc(quoteSheet(names[i]))}!$A$1:$N$80</definedName>`;
    relTags += `<Relationship Id="${rid}" Type="${REL_SHEET}" Target="worksheets/sheet${fileNo}.xml"/>`;
    ctTags += `<Override PartName="/${sheetPath}" ContentType="${CT_SHEET}"/><Override PartName="/${dPath}" ContentType="${CT_DRAWING}"/>`;
    extrasRows.push({ sheet: names[i], floor, roomType: room.roomType, required: result?.totals.required, ...extras });
    fileNo++; drawNo++;
  });
  // App extras
  const exPath = `xl/worksheets/sheet${fileNo}.xml`;
  zip.file(exPath, extrasSheetXml(extrasRows, project));
  sheetTags += `<sheet name="App extras" sheetId="${nextSheetId++}" r:id="rIdHlsX"/>`;
  relTags += `<Relationship Id="rIdHlsX" Type="${REL_SHEET}" Target="worksheets/sheet${fileNo}.xml"/>`;
  ctTags += `<Override PartName="/${exPath}" ContentType="${CT_SHEET}"/>`;

  // original "for copy" keeps the blank master; make the first room the active tab
  zip.file(MASTER_SHEET, master.replace(/ tabSelected="1"/, ''));
  wb = wb.replace('</sheets>', sheetTags + '</sheets>').replace('</definedNames>', defNames + '</definedNames>')
    .replace(/activeTab="\d+"/, `activeTab="${existingSheets}"`);
  wbRels = wbRels.replace('</Relationships>', relTags + '</Relationships>');
  ct = ct.replace('</Types>', ctTags + '</Types>');
  zip.file('xl/workbook.xml', wb); zip.file('xl/_rels/workbook.xml.rels', wbRels); zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
