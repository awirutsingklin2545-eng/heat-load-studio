// Heat Load Studio — app shell, routing, projects, project overview, export.
import { render } from 'preact';
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import { html, Num, Txt, Sel, kW, fmt } from './ui/fields.js';
import { RoomEditor, ResultsPanel, partsOf } from './ui/room.js';
import { calcRoomV125, ENGINE_VERSION } from './engine/v125.js';
import { exportWorkbook } from './export/excel.js';
import { extractV125 } from './data/fromMaster.js';
import * as db from './store.js';
import { newProject, newFloor, newRoom, eachRoom, findRoom, roomWarnings, toHlp, fromHlp, cloneProject, MASTER_DEFAULTS, uid, excelSerial } from './model.js';

export const APP_VERSION = '0.2.0';
const JSZip = window.JSZip;

// ---------- routing: #/  #/p/<id>  #/p/<id>/r/<roomId>  #/settings ----------
const parseRoute = () => {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'p' && p[1]) return { view: 'project', id: p[1], room: p[2] === 'r' ? p[3] : null };
  if (p[0] === 'settings') return { view: 'settings' };
  return { view: 'home' };
};
const go = (h) => { location.hash = h; };

function download(name, bytes, type) {
  const blob = new Blob([bytes], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
const safeName = (s) => String(s || 'project').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60);
const today = () => new Date().toISOString().slice(0, 10);

function calcAll(project, data) {
  const out = new Map();
  if (!data) return out;
  for (const { room } of eachRoom(project)) {
    let result = null;
    try { result = calcRoomV125(room, data); } catch (e) { console.error(e); }
    out.set(room.id, { result, warnings: roomWarnings(room, result, data) });
  }
  return out;
}

// ---------- App ----------
function App() {
  const [route, setRoute] = useState(parseRoute());
  const [data, setData] = useState(undefined);       // undefined = loading, null = no master
  const [masterBytes, setMasterBytes] = useState(null);
  const [masterErr, setMasterErr] = useState('');
  useEffect(() => { const f = () => setRoute(parseRoute()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { db.kvGet('master').then((b) => (b ? useMaster(b, true) : setData(null))).catch(() => setData(null)); }, []);
  async function useMaster(bytes, cached) {
    try {
      const d = await extractV125(JSZip, bytes);
      if (!cached) { await db.kvSet('master', bytes); await db.kvSet('masterLoadedAt', new Date().toISOString()); db.persist(); }
      setMasterBytes(bytes); setData(d); setMasterErr('');
    } catch (e) { setMasterErr(e.message || String(e)); if (cached) setData(null); }
  }
  const loadFile = async (f) => useMaster(new Uint8Array(await f.arrayBuffer()), false);

  if (data === undefined) return html`<div class="boot">Loading…</div>`;
  if (!data || route.view === 'settings') return html`<${Shell} route=${route}><${Settings} data=${data} err=${masterErr} onFile=${loadFile} /></${Shell}>`;
  if (route.view === 'project') return html`<${ProjectView} key=${route.id} route=${route} data=${data} master=${masterBytes} />`;
  return html`<${Shell} route=${route}><${Home} data=${data} /></${Shell}>`;
}

function Shell({ route, crumbs, status, children }) {
  return html`<div class="app">
    <header class="top">
      <a class="brand" href="#/"><img src="icons/icon-192.png" alt="" /><span>Heat Load Studio</span></a>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      <div class="topr">${status}<a class="iconbtn" href="#/settings" title="Master template & app">⚙︎<span class="sr">Settings</span></a></div>
    </header>
    <div class="thermal" aria-hidden="true"></div>
    ${children}
  </div>`;
}

// ---------- Settings / master ----------
function Settings({ data, err, onFile }) {
  const [loadedAt, setLoadedAt] = useState(null);
  const [selftest, setSelftest] = useState(null);
  useEffect(() => { db.kvGet('masterLoadedAt').then(setLoadedAt); }, [data]);
  useEffect(() => {
    if (!data) return;
    const g = newRoom('Golden'); Object.assign(g, { roomType: 'Cold Room', T: 2, RH: 85, H: 4, W: 8, L: 10, workers: 2 });
    g.ceiling.type = 'PU'; g.walls = [0, 1, 2, 3].map(() => ({ T: 35, doors: [{}, {}] })); g.walls[0].doors[0] = { RH: 60, count: 1, E: 0.8, openMin: 15, W: 2.5, H: 3 };
    g.products = [{ category: 'Poultry Products', name: 'Chicken', tIn: 10, tOut: 2, ton: 5, hours: 24 }]; g.makeUp = { T: 35, RH: 60, CMH: 0 };
    const r = calcRoomV125(g, data).totals.required; setSelftest({ r, pass: Math.abs(r - 30.6400317068338) < 1e-6 });
  }, [data]);
  const [over, setOver] = useState(false);
  return html`<main class="page narrow">
    <h1>${data ? 'Settings' : 'Welcome'} <span class="th">${data ? 'ตั้งค่า' : 'เริ่มต้นใช้งาน'}</span></h1>
    <section class="card">
      <h3>Master template <span class=${'pill ' + (data ? 'ok' : 'warn')}>${data ? 'loaded' : 'needed'}</span></h3>
      <p>The app reads every table (psychrometric data, foods, insulation, fan database) from <b>Load Calculation V1.25</b> and writes Excel exports into it. The file stays in this browser only. <span class="th">ไฟล์อยู่ในเครื่องนี้เท่านั้น ไม่ถูกอัปโหลด</span></p>
      <div class=${'drop ' + (over ? 'over' : '')} onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
        Drop the .xlsx here or <label class="btn"><input type="file" accept=".xlsx" hidden id="masterfile" onChange=${(e) => e.target.files[0] && onFile(e.target.files[0])} />${data ? 'Replace master' : 'Choose master file'}</label>
      </div>
      ${err && html`<p class="err">${err}</p>`}
      ${data && html`<p class="note">${data.foods.length} food items · ${data.roomTypes.length} room types · psychrometric table ${data.psy.T[0]}…${data.psy.T.at(-1)} °C · ${data.abf.length} ABF fan points${loadedAt ? ` · loaded ${new Date(loadedAt).toLocaleString()}` : ''}</p>`}
      ${selftest && html`<p>Engine self-test (golden case 30.64 kW): <span class=${'pill ' + (selftest.pass ? 'ok' : 'bad')}>${selftest.pass ? 'pass' : 'fail'} · ${kW(selftest.r, 4)} kW</span></p>`}
    </section>
    <section class="card"><h3>About</h3>
      <p class="note">App v${APP_VERSION} · engine ${ENGINE_VERSION} · profile V1.25 parity. Projects are stored on this device (IndexedDB). Export a .hlp file to back up or move a project to another computer.</p>
      ${data && html`<a class="btn" href="#/">Go to projects</a>`}
    </section>
  </main>`;
}

// ---------- Home ----------
function Home({ data }) {
  const [list, setList] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [err, setErr] = useState('');
  const reload = () => db.listProjects().then((l) => setList(l.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
  useEffect(() => { reload(); }, []);
  async function create() { const p = newProject('New project'); await db.putProject(p); go(`#/p/${p.id}`); }
  async function importHlp(f) {
    try { const p = fromHlp(await f.text()); if (await db.getProject(p.id)) { p.id = uid(); p.name += ' (imported)'; } await db.putProject(p); reload(); setErr(''); }
    catch (e) { setErr(e.message); }
  }
  if (!list) return html`<main class="page"><p>Loading projects…</p></main>`;
  return html`<main class="page">
    <div class="row between"><h1>Projects <span class="th">โปรเจกต์</span></h1>
      <div class="row"><label class="btn ghost"><input type="file" accept=".hlp,.json" hidden id="importfile" onChange=${(e) => e.target.files[0] && importHlp(e.target.files[0])} />Import .hlp</label>
      <button class="btn" id="newproject" onClick=${create}>+ New project</button></div></div>
    ${err && html`<p class="err">${err}</p>`}
    ${list.length === 0 && html`<section class="card empty"><h3>No projects yet</h3><p>Create a project, add floors and rooms, then export to the V1.25 Excel form. <span class="th">กด New project เพื่อเริ่ม</span></p></section>`}
    <div class="plist">
      ${list.map((p) => {
        const rooms = [...eachRoom(p)].length;
        return html`<article class="card pcard">
          <a class="ptitle" href=${`#/p/${p.id}`}>${p.name}</a>
          <div class="meta">${p.client || '—'}${p.jobNo ? ` · ${p.jobNo}` : ''} · ${rooms} room${rooms === 1 ? '' : 's'} · Rev ${p.revision}</div>
          <div class="kpi"><b>${p.summary ? fmt(p.summary.required, 2) : '—'}</b> kW required · updated ${new Date(p.updatedAt).toLocaleString()}</div>
          <div class="row">
            <a class="btn sm" href=${`#/p/${p.id}`}>Open</a>
            <button class="btn sm ghost" onClick=${async () => { await db.putProject(cloneProject(p)); reload(); }}>Duplicate</button>
            <button class="btn sm ghost" onClick=${() => download(`${safeName(p.name)}.hlp`, toHlp(p), 'application/json')}>Export .hlp</button>
            ${confirmDel === p.id
              ? html`<span class="confirm">Delete "${p.name}"? <button class="btn sm danger" onClick=${async () => { await db.deleteProject(p.id); setConfirmDel(null); reload(); }}>Delete</button><button class="btn sm ghost" onClick=${() => setConfirmDel(null)}>Cancel</button></span>`
              : html`<button class="btn sm ghost danger" onClick=${() => setConfirmDel(p.id)}>Delete</button>`}
          </div>
        </article>`;
      })}
    </div>
  </main>`;
}

// ---------- Project ----------
function ProjectView({ route, data, master }) {
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState('saved');
  const [missing, setMissing] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const timer = useRef(null); const latest = useRef(null);
  useEffect(() => { db.getProject(route.id).then((p) => (p ? setProject(p) : setMissing(true))); }, [route.id]);
  // warn when the same project is open in two tabs
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const ch = new BroadcastChannel('hls'); const me = uid();
    ch.onmessage = (e) => { if (e.data?.id === route.id && e.data.from !== me) { setOtherTab(true); if (e.data.type === 'hello') ch.postMessage({ type: 'here', id: route.id, from: me }); } };
    ch.postMessage({ type: 'hello', id: route.id, from: me });
    return () => ch.close();
  }, [route.id]);
  const results = useMemo(() => (project ? calcAll(project, data) : new Map()), [project, data]);

  const save = useCallback((p) => {
    latest.current = p; setStatus('saving'); clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await db.putProject(latest.current); setStatus('saved'); } catch (e) { console.error(e); setStatus('error'); }
    }, 500);
  }, []);
  useEffect(() => { const f = () => { if (latest.current && status !== 'saved') db.putProject(latest.current); }; addEventListener('pagehide', f); return () => removeEventListener('pagehide', f); }, [status]);

  const update = (fn) => setProject((prev) => {
    const p = structuredClone(prev); fn(p); p.updatedAt = new Date().toISOString();
    const res = calcAll(p, data); let req = 0; for (const v of res.values()) req += v.result?.totals.required || 0;
    p.summary = { required: req, rooms: res.size, engine: ENGINE_VERSION };
    save(p); return p;
  });

  if (missing) return html`<${Shell} route=${route}><main class="page"><p class="err">Project not found on this device.</p><a class="btn" href="#/">Back to projects</a></main></${Shell}>`;
  if (!project) return html`<${Shell} route=${route}><main class="page"><p>Loading…</p></main></${Shell}>`;
  const sel = route.room ? findRoom(project, route.room) : null;
  const statusEl = html`<span class=${'save ' + status} role="status">${{ saved: 'Saved ✓', saving: 'Saving…', error: 'Save failed' }[status]}</span>`;
  const crumbs = html`<a href="#/">Projects</a><span>›</span><a href=${`#/p/${project.id}`}>${project.name}</a>${sel && html`<span>›</span><span>${sel.floor.name}</span><span>›</span><b>${sel.room.name}</b>`}`;
  return html`<${Shell} route=${route} crumbs=${crumbs} status=${statusEl}>
    ${otherTab && html`<div class="banner warn">This project is also open in another tab or window. Edit in one place only, or the last save wins.</div>`}
    ${status === 'error' && html`<div class="banner bad">Could not save to this device. Export a .hlp backup now.</div>`}
    <div class="layout">
      <${Tree} project=${project} results=${results} sel=${sel} update=${update} />
      ${sel
        ? html`<main class="main"><${RoomEditor} room=${sel.room} data=${data} result=${results.get(sel.room.id)?.result} warnings=${results.get(sel.room.id)?.warnings || []}
            onChange=${(fn) => update((p) => fn(findRoom(p, sel.room.id).room))} /></main>
          <${ResultsPanel} room=${sel.room} result=${results.get(sel.room.id)?.result} warnings=${results.get(sel.room.id)?.warnings || []} />`
        : html`<main class="main wide"><${Overview} project=${project} results=${results} update=${update} master=${master} /></main>`}
    </div>
  </${Shell}>`;
}

function Tree({ project, results, sel, update }) {
  const [edit, setEdit] = useState(null);
  const [ask, setAsk] = useState(null);
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const rename = (id, name, apply) => edit === id
    ? html`<input class="ren" autofocus value=${name} onBlur=${(e) => { apply(e.target.value.trim() || name); setEdit(null); }} onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(null); }} />`
    : null;
  return html`<nav class="tree" aria-label="Building tree">
    <a class=${'node proj ' + (!sel ? 'active' : '')} href=${`#/p/${project.id}`}>Project overview</a>
    ${project.buildings.map((b, bi) => html`<div class="bld">
      <div class="node b">${rename(b.id, b.name, (v) => update((p) => { p.buildings[bi].name = v; })) || html`<span>${b.name}</span>`}
        <span class="acts"><button title="Rename" onClick=${() => setEdit(b.id)}>✎</button></span></div>
      ${b.floors.map((f, fi) => html`<div class="flr">
        <div class="node f">${rename(f.id, f.name, (v) => update((p) => { p.buildings[bi].floors[fi].name = v; })) || html`<span>${f.name}</span>`}
          <span class="acts">
            <button title="Rename floor" onClick=${() => setEdit(f.id)}>✎</button>
            <button title="Move floor up" onClick=${() => update((p) => move(p.buildings[bi].floors, fi, -1))}>↑</button>
            <button title="Move floor down" onClick=${() => update((p) => move(p.buildings[bi].floors, fi, 1))}>↓</button>
            ${ask === f.id ? html`<button class="danger" onClick=${() => { update((p) => { p.buildings[bi].floors.splice(fi, 1); }); setAsk(null); go(`#/p/${project.id}`); }}>Delete floor?</button>`
              : b.floors.length > 1 && html`<button title="Delete floor" onClick=${() => setAsk(f.id)}>✕</button>`}
          </span></div>
        ${f.rooms.map((r, ri) => {
          const res = results.get(r.id); const err = res?.warnings.some((w) => w.level === 'error');
          return html`<div class=${'node r ' + (sel?.room.id === r.id ? 'active' : '')}>
            ${rename(r.id, r.name, (v) => update((p) => { p.buildings[bi].floors[fi].rooms[ri].name = v; })) ||
              html`<a href=${`#/p/${project.id}/r/${r.id}`}><span class=${'dot ' + (err ? 'bad' : 'ok')}></span>${r.name}<span class="kw">${kW(res?.result?.totals.required, 1)}</span></a>`}
            <span class="acts">
              <button title="Rename room" onClick=${() => setEdit(r.id)}>✎</button>
              <button title="Duplicate room" onClick=${() => update((p) => { const c = structuredClone(r); c.id = uid(); c.name = `${r.name} copy`; p.buildings[bi].floors[fi].rooms.splice(ri + 1, 0, c); })}>⧉</button>
              <button title="Move up" onClick=${() => update((p) => move(p.buildings[bi].floors[fi].rooms, ri, -1))}>↑</button>
              <button title="Move down" onClick=${() => update((p) => move(p.buildings[bi].floors[fi].rooms, ri, 1))}>↓</button>
              ${ask === r.id ? html`<button class="danger" onClick=${() => { update((p) => { p.buildings[bi].floors[fi].rooms.splice(ri, 1); }); setAsk(null); go(`#/p/${project.id}`); }}>Delete?</button>`
                : html`<button title="Delete room" onClick=${() => setAsk(r.id)}>✕</button>`}
            </span></div>`;
        })}
        <button class="add" onClick=${() => { const r = newRoom(`Room ${[...eachRoom(project)].length + 1}`); update((p) => { p.buildings[bi].floors[fi].rooms.push(r); }); go(`#/p/${project.id}/r/${r.id}`); }}>+ Room</button>
      </div>`)}
      <button class="add" onClick=${() => update((p) => { const fl = newFloor(`Floor ${b.floors.length + 1}`); fl.rooms = []; p.buildings[bi].floors.push(fl); })}>+ Floor</button>
    </div>`)}
  </nav>`;
}

function Overview({ project, results, update, master }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = [...eachRoom(project)].map((x) => ({ ...x, ...results.get(x.room.id) }));
  const errs = rows.filter((x) => x.warnings?.some((w) => w.level === 'error'));
  const sumParts = (list) => {
    const s = { transmission: 0, infiltration: 0, product: 0, equipment: 0, total: 0, afterSF: 0, required: 0, extras: 0 };
    for (const x of list) { const r = x.result; if (!r) continue; for (const k of ['transmission', 'infiltration', 'product', 'equipment']) s[k] += r[k].total; s.total += r.totals.total; s.afterSF += r.totals.afterSF; s.required += r.totals.required; s.extras += (x.room.extras.glass || 0) + (x.room.extras.defrost || 0) + (x.room.extras.packaging || 0); }
    return s;
  };
  const all = sumParts(rows);
  async function exportXlsx() {
    setBusy(true); setMsg(null);
    try {
      const rooms = rows.map((x) => ({ room: x.room, result: x.result, extras: x.room.extras, floor: `${x.building.name} / ${x.floor.name}` }));
      const bytes = await exportWorkbook(JSZip, master, rooms, { name: project.name, engine: ENGINE_VERSION, userName: project.engineer || undefined, dateSerial: excelSerial() });
      download(`${safeName(project.name)}_LoadCalc_V1.25_Rev${project.revision}_${today()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMsg({ ok: true, text: `Exported ${rooms.length} room sheet${rooms.length === 1 ? '' : 's'} + App extras.` });
    } catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    setBusy(false);
  }
  const P = (k, v) => update((p) => { p[k] = v; });
  return html`<div class="overview">
    <section class="card">
      <h3>Project <span class="th">ข้อมูลโปรเจกต์</span></h3>
      <div class="grid">
        <${Txt} label="Project name" value=${project.name} onChange=${(v) => P('name', v || 'Project')} />
        <${Txt} label="Client" value=${project.client} onChange=${(v) => P('client', v)} />
        <${Txt} label="Site" value=${project.site} onChange=${(v) => P('site', v)} />
        <${Txt} label="Job no." value=${project.jobNo} onChange=${(v) => P('jobNo', v)} />
        <${Txt} label="Engineer (Excel 'User Name')" value=${project.engineer} onChange=${(v) => P('engineer', v)} />
        <${Txt} label="Revision" value=${project.revision} onChange=${(v) => P('revision', v || 'A')} />
      </div>
    </section>

    <section class=${'card ' + (project.defaultsConfirmed ? '' : 'attention')}>
      <h3>Default values <span class=${'pill ' + (project.defaultsConfirmed ? 'ok' : 'warn')}>${project.defaultsConfirmed ? 'confirmed' : 'confirm for this project'}</span></h3>
      <p class="note">New rooms start with the values already in the V1.25 master. Check them against the TOR before you rely on the result. <span class="th">ยืนยันค่า default ทุกโปรเจกต์</span></p>
      <div class="tbl"><table><thead><tr><th>Item</th><th>Default</th><th>Cell</th><th>Rooms using a different value</th></tr></thead><tbody>
        ${MASTER_DEFAULTS.map((d) => {
          const get = (r) => d.key.split('.').reduce((o, k) => o?.[k], r);
          const diff = rows.filter((x) => get(x.room) !== d.value).map((x) => x.room.name);
          return html`<tr><td>${d.label}</td><td class="n">${d.value} ${d.unit}</td><td class="mono">${d.cell}</td><td>${diff.length ? diff.join(', ') : '—'}</td></tr>`;
        })}
      </tbody></table></div>
      <label class="check"><input type="checkbox" id="confirmdefaults" checked=${project.defaultsConfirmed} onChange=${(e) => P('defaultsConfirmed', e.target.checked)} /> I checked these values for this project</label>
    </section>

    <section class="card">
      <div class="row between"><h3>Summary <span class="th">สรุป heat load</span></h3>
        <div class="big inline"><b>${kW(all.required)}</b> kW · <b>${kW(all.required / 3.5169)}</b> TR</div></div>
      ${rows.length === 0 && html`<p class="note">Add a room from the left panel.</p>`}
      ${project.buildings.map((b) => b.floors.map((f) => {
        const fr = rows.filter((x) => x.floor.id === f.id); const s = sumParts(fr);
        return html`<div class="tbl"><table class="sum"><caption>${b.name} · ${f.name}</caption>
          <thead><tr><th>Room</th><th>Type</th><th class="n">°C</th><th class="n">Trans.</th><th class="n">Infil.</th><th class="n">Product</th><th class="n">Equip.</th><th class="n">Total</th><th class="n">+SF</th><th class="n">Required kW</th><th class="n">TR</th><th class="n">Extras</th><th>Split</th></tr></thead>
          <tbody>${fr.map((x) => {
            const r = x.result; const parts = partsOf(r); const pos = parts.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;
            const ex = (x.room.extras.glass || 0) + (x.room.extras.defrost || 0) + (x.room.extras.packaging || 0);
            return html`<tr><td><a href=${`#/p/${project.id}/r/${x.room.id}`}>${x.room.name}</a>${x.warnings?.some((w) => w.level === 'error') && html` <span class="pill bad">fix</span>`}</td><td>${x.room.roomType}</td><td class="n">${x.room.T ?? '—'}</td>
              ${parts.map((p) => html`<td class="n">${kW(p.v)}</td>`)}<td class="n">${kW(r?.totals.total)}</td><td class="n">${kW(r?.totals.afterSF)}</td><td class="n"><b>${kW(r?.totals.required)}</b></td><td class="n">${kW((r?.totals.required || 0) / 3.5169)}</td><td class="n">${ex ? kW(ex) : '—'}</td>
              <td><div class="mini">${parts.map((p) => html`<span style=${`width:${Math.max(0, p.v) / pos * 100}%;background:${p.color}`}></span>`)}</div></td></tr>`;
          })}</tbody>
          <tfoot><tr><td colspan="3">${f.name} total</td><td class="n">${kW(s.transmission)}</td><td class="n">${kW(s.infiltration)}</td><td class="n">${kW(s.product)}</td><td class="n">${kW(s.equipment)}</td><td class="n">${kW(s.total)}</td><td class="n">${kW(s.afterSF)}</td><td class="n"><b>${kW(s.required)}</b></td><td class="n">${kW(s.required / 3.5169)}</td><td class="n">${s.extras ? kW(s.extras) : '—'}</td><td></td></tr></tfoot>
        </table></div>`;
      }))}
      <p class="note">Floor and building totals are the sum of room peaks (refrigeration rooms run independently). Required kW = (total × (1 + SF)) × 24 / running hours, as in V1.25.</p>
    </section>

    <section class="card">
      <h3>Export <span class="th">ส่งออก</span></h3>
      ${!project.defaultsConfirmed && html`<p class="warnline">Default values are not confirmed yet.</p>`}
      ${errs.length > 0 && html`<p class="warnline">Rooms with missing data: ${errs.map((x) => x.room.name).join(', ')}. They export with blank cells.</p>`}
      <div class="row">
        <button class="btn" id="exportxlsx" disabled=${busy || rows.length === 0} onClick=${exportXlsx}>${busy ? 'Building…' : 'Excel — Load Calculation V1.25'}</button>
        <button class="btn ghost" onClick=${() => download(`${safeName(project.name)}.hlp`, toHlp(project), 'application/json')}>Project file (.hlp)</button>
        <button class="btn ghost" disabled title="Coming in a later version">PDF report (next)</button>
      </div>
      ${msg && html`<p class=${msg.ok ? 'okline' : 'err'}>${msg.text}</p>`}
      <p class="note">One sheet per room, values written into input cells only; formulas, dropdowns and the title block stay as in the master. Loads outside V1.25 go to the sheet "App extras".</p>
    </section>
  </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
