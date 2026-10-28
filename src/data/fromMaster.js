// Read the lookup tables the V1.25 engine needs directly from the user's master workbook.
// Nothing proprietary ships with the app: tables come from the file the user loads.

const colNum = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function sharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(xml))) {
    const t = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
    out.push(unesc(t));
  }
  return out;
}

// Returns a getter (ref) => value using cached values of the sheet.
function cellReader(sheetXml, sst) {
  const cells = new Map();
  const re = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
  while ((m = re.exec(sheetXml))) {
    const [, ref, attrs, body] = m;
    if (!body) continue;
    const t = (/ t="(\w+)"/.exec(attrs) || [])[1];
    let v;
    if (t === 'inlineStr') v = unesc(((/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)) || [])[1] ?? '');
    else {
      const raw = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      if (raw === undefined) continue;
      if (t === 's') v = sst[+raw];
      else if (t === 'str' || t === 'e') v = unesc(raw);
      else if (t === 'b') v = raw === '1';
      else v = Number(raw);
    }
    cells.set(ref, v);
  }
  return (ref) => cells.get(ref);
}

export async function extractV125(JSZip, bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rid = (/<sheet name="for copy"[^>]*r:id="(rId\d+)"/.exec(wb) || [])[1];
  if (!rid) throw new Error('Sheet "for copy" not found — is this Load Calculation V1.25?');
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
  const sheetPath = 'xl/' + target.replace(/^\/?xl\//, '');
  const sst = zip.file('xl/sharedStrings.xml') ? sharedStrings(await zip.file('xl/sharedStrings.xml').async('string')) : [];
  const v = cellReader(await zip.file(sheetPath).async('string'), sst);
  const at = (c, r) => v(`${colName(c)}${r}`);
  const nn = (x) => (x === undefined ? null : x);

  const T = [], h = [], vv = [];
  for (let r = 91; r <= 115; r++) {
    T.push(at(colNum('BX'), r));
    h.push(Array.from({ length: 12 }, (_, j) => at(colNum('BY') + j, r)));
    vv.push(Array.from({ length: 12 }, (_, j) => at(colNum('CM') + j, r)));
  }
  const RH = Array.from({ length: 12 }, (_, j) => at(colNum('BY') + j, 90));
  const foods = [];
  for (let r = 88; r <= 315; r++) {
    const n = at(colNum('AI'), r);
    if (n === undefined || n === null || n === '') continue;
    foods.push([n, ...Array.from({ length: 6 }, (_, j) => nn(at(colNum('AJ') + j, r)))]);
  }
  const categories = {};
  for (let c = colNum('BB'); c <= colNum('BN'); c++) {
    const name = at(c, 88); const items = [];
    for (let r = 89; r <= 148; r++) { const x = at(c, r); if (x !== undefined && x !== null && x !== 0 && x !== '') items.push(x); }
    categories[name] = items;
  }
  const k = {}; for (let r = 100; r <= 104; r++) k[v(`Q${r}`)] = v(`R${r}`);
  const thkPS = []; for (let r = 88; r <= 94; r++) thkPS.push([v(`FE${r}`), v(`FF${r}`)]);
  const thkPU = []; for (let r = 88; r <= 92; r++) thkPU.push([v(`FH${r}`), v(`FI${r}`)]);
  const roomTypes = [], fanFactor = {}, lighting = {}, protection = [];
  for (let r = 88; r <= 95; r++) { roomTypes.push(v(`FB${r}`)); fanFactor[v(`FB${r}`)] = nn(v(`FC${r}`)); }
  for (let r = 59; r <= 66; r++) lighting[v(`P${r}`)] = v(`R${r}`);
  for (let r = 19; r <= 26; r++) protection.push([v(`P${r}`), v(`S${r}`)]);
  const abf = [];
  for (let r = 89; r <= 474; r++) { const x = v(`DR${r}`), y = v(`DS${r}`); if (typeof x === 'number' && typeof y === 'number') abf.push([x, y]); }
  const data = { psy: { T, RH, h, v: vv }, foods, categories, k, thkPS, thkPU, roomTypes, fanFactor, lighting, protection, abf };
  validate(data);
  return data;
}

function validate(d) {
  const bad = [];
  if (d.psy.T.length !== 25 || d.psy.T[0] !== -60) bad.push('psychrometric table');
  if (d.foods.length < 100) bad.push('food table');
  if (d.roomTypes.length !== 8) bad.push('room types');
  if (!d.k.EPS || !d.k.PU) bad.push('insulation k values');
  if (d.abf.length < 2) bad.push('ABF fan data');
  if (bad.length) throw new Error(`Master file is missing: ${bad.join(', ')}. Use the original Load Calculation V1.25.`);
}
