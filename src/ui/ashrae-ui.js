// UI for the ASHRAE profile: per-room inputs, results panel, comparison with V1.25, standards list.
import { html, Num, Sel, kW, fmt } from './fields.js';
import { ashOf, projectAsh, isAC, OCCUPANCY, ACTIVITIES, LUMINAIRES, EDITIONS, SUN_EFFECT } from '../engine/ashrae.js';
import { CONSTRUCTIONS, ROOF_CONSTRUCTIONS } from '../engine/conduction.js';
import { STATIONS } from '../data/climate.js';
import { MONTHS } from '../engine/compare.js';
import { stateTWb } from '../engine/psychro.js';

const ORIENTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const COLOURS = [{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'dark', label: 'Dark' }];
// write into room.ash at a path, creating objects on the way
const put = (r, path, v) => { r.ash = r.ash || {}; let o = r.ash; for (let i = 0; i < path.length - 1; i++) { const k = path[i]; if (o[k] == null) o[k] = typeof path[i + 1] === 'number' ? [] : {}; o = o[k]; } o[path[path.length - 1]] = v; };

export function AshraeInputs({ room, project, set }) {
  const a = ashOf(room), ac = isAC(room);
  const S = (path) => (v) => set((r) => put(r, path, v));
  const extWalls = room.walls.map((w, i) => (w.source === 'outside' ? i : null)).filter((i) => i != null);
  return html`<section class="card ash" id="sec-ashrae">
    <h3>ASHRAE inputs <span class="th">${ac ? 'ห้องแอร์: RTS (Fundamentals 2025)' : 'ห้องเย็น: Refrigeration 2026'}</span></h3>
    <p class="note">These values are used only by the ASHRAE profile. The V1.25 sheet and its Excel export do not change.</p>
    <div class="grid">
      <${Num} label="Safety factor (ASHRAE)" unit="%" value=${a.sf} min=${0} onChange=${S(['sf'])} hint=${ac ? 'RTS gives the peak hourly load; add a margin only if the design brief asks for one' : 'Handbook: generally 10 %, on transmission, infiltration, product and internal loads'} />
      ${!ac && html`<${Num} label="Running time" unit="h/day" value=${room.ash?.runHours ?? null} placeholder=${String(a.runHours ?? (room.roomType === 'Freezer - Trolley' ? 24 : (room.T ?? 99) <= 5 ? 20 : 24))} min=${1} max=${24} onChange=${S(['runHours'])} hint="Empty = V1.25 rule (20 h at 5 °C and below). Set from the defrost plan." />`}
    </div>

    ${!ac && html`
      <div class="sub">Sun on outside walls and roof <span class="th">Handbook table: K added to outdoor temperature</span></div>
      ${extWalls.length === 0 ? html`<p class="note">No wall is set to "Outside", so no sun effect.</p>` : html`<div class="grid">
        ${extWalls.map((i) => html`<${Sel} label=${`Wall ${i + 1} faces`} value=${a.walls[i].orient} options=${ORIENTS} onChange=${S(['walls', i, 'orient'])} />
          <${Sel} label=${`Wall ${i + 1} colour`} value=${a.walls[i].colour} options=${COLOURS} onChange=${S(['walls', i, 'colour'])} hint=${`+${SUN_EFFECT[a.walls[i].colour]?.[{ E: 'E', NE: 'E', SE: 'E', S: 'S', W: 'W', SW: 'W', NW: 'W' }[a.walls[i].orient]] ?? 0} K`} />`)}
      </div>`}
      <div class="grid">
        <${Sel} label="Ceiling" value=${a.roof.exposed} options=${[{ value: false, label: 'Under a roof space (ceiling temperature above)' }, { value: true, label: 'Exposed roof, outdoor air + sun' }]} onChange=${S(['roof', 'exposed'])} />
        ${a.roof.exposed && html`<${Sel} label="Roof colour" value=${a.roof.colour} options=${COLOURS} onChange=${S(['roof', 'colour'])} hint=${`+${SUN_EFFECT[a.roof.colour]?.roof ?? 0} K`} />`}
      </div>
      <div class="grid">
        <${Num} label="Ground resistance under floor" unit="m²K/W" value=${a.groundR} min=${0} onChange=${S(['groundR'])} hint="About 1 m of soil (k ≈ 1 W/m·K). Floor temperature is set in Envelope." />
      </div>
      <div class="sub">Doors <span class="th">D_t = n (P·θp + 60·θo) / 3600</span></div>
      ${room.walls.every((w) => w.doors.every((d) => !(d && d.count > 0))) ? html`<p class="note">No doors.</p>` : html`<div class="grid">
        ${room.walls.map((w, i) => w.doors.map((d, j) => d && d.count > 0 && html`
          <${Num} label=${`W${i + 1} door ${j + 1}: passages`} unit="/h" value=${d.P ?? null} placeholder="1" onChange=${(v) => set((r) => { r.walls[i].doors[j].P = v; })} />
          <${Num} label=${`W${i + 1} door ${j + 1}: time per passage θp`} unit="s" value=${d.thetaP ?? null} placeholder="15" onChange=${(v) => set((r) => { r.walls[i].doors[j].thetaP = v; })} hint="15 to 25 s conventional, 5 to 10 s high-speed" />`))}
      </div>`}
      <div class="sub">Lights, people, fans, defrost</div>
      <div class="grid">
        <${Num} label="Lighting" unit="W/m²" value=${room.ash?.lighting?.Wm2 ?? null} placeholder="V1.25 table" onChange=${S(['lighting', 'Wm2'])} />
        <${Num} label="Lights on" unit="h/day" value=${a.lighting.hours} onChange=${S(['lighting', 'hours'])} />
        <${Num} label="People in room" unit="h/day" value=${a.people.hours} onChange=${S(['people', 'hours'])} />
        <${Sel} label="Frequent entry and exit" value=${a.people.frequent} options=${[{ value: false, label: 'No' }, { value: true, label: 'Yes, × 1.25' }]} onChange=${S(['people', 'frequent'])} />
        <${Num} label="Fans running" unit="h/day" value=${a.fanHours} onChange=${S(['fanHours'])} hint="Used when the actual fan motor kW is entered" />
        <${Sel} label="Defrost load" value=${a.defrost.mode} options=${[{ value: 'auto', label: 'Handbook range (% of load)' }, { value: 'heater', label: 'From heater data' }]} onChange=${S(['defrost', 'mode'])} />
        ${a.defrost.mode === 'heater' && html`
          <${Num} label="Defrost heaters" unit="kW" value=${a.defrost.kW} onChange=${S(['defrost', 'kW'])} />
          <${Num} label="Defrosts per day" value=${a.defrost.perDay} onChange=${S(['defrost', 'perDay'])} />
          <${Num} label="Minutes each" unit="min" value=${a.defrost.minutes} onChange=${S(['defrost', 'minutes'])} />
          <${Num} label="Share of heat to the room" value=${a.defrost.fraction} onChange=${S(['defrost', 'fraction'])} hint="From the coil supplier" />`}
      </div>`}

    ${ac && html`
      <div class="sub">Occupancy and outdoor air <span class="th">Standard 62.1 ventilation rate procedure</span></div>
      <div class="grid">
        <${Sel} label="Occupancy category" value=${a.ac.category} options=${OCCUPANCY.map((o) => ({ value: o.name, label: `${o.name} (${o.Rp} L/s·p + ${o.Ra} L/s·m²)` }))} onChange=${S(['ac', 'category'])} />
        <${Num} label="People" value=${room.ash?.ac?.people ?? null} placeholder=${`${Math.round(((OCCUPANCY.find((o) => o.name === a.ac.category)?.density || 0) * (room.W || 0) * (room.L || 0)) / 100)} (default density)`} onChange=${S(['ac', 'people'])} />
        <${Sel} label="Activity" value=${a.people.activity} options=${ACTIVITIES} onChange=${S(['people', 'activity'])} />
        <${Num} label="Clothing" unit="clo" value=${a.ac.clo} onChange=${S(['ac', 'clo'])} />
        <${Num} label="Occupied from" unit="h" value=${a.ac.occStart} min=${0} max=${24} onChange=${S(['ac', 'occStart'])} />
        <${Num} label="Occupied to" unit="h" value=${a.ac.occEnd} min=${0} max=${24} onChange=${S(['ac', 'occEnd'])} />
        <${Num} label="Zone air distribution Ez" value=${a.ac.Ez} onChange=${S(['ac', 'Ez'])} hint="1.0 ceiling supply of cool air" />
        <${Num} label="Outdoor air (override)" unit="L/s" value=${room.ash?.ac?.ventLs ?? null} placeholder=${(() => { const o = OCCUPANCY.find((x) => x.name === a.ac.category) || OCCUPANCY[0]; const ar = (room.W || 0) * (room.L || 0); const pz = room.ash?.ac?.people ?? Math.round((o.density * ar) / 100); return `${Math.round((o.Rp * pz + o.Ra * ar) / (a.ac.Ez || 1))} (Std 62.1)`; })()} onChange=${S(['ac', 'ventLs'])} />
        <${Num} label="Infiltration" unit="ACH" value=${a.ac.ach} onChange=${S(['ac', 'ach'])} />
        <${Num} label="Supply air temperature" unit="°C" value=${a.ac.supplyT} onChange=${S(['ac', 'supplyT'])} />
      </div>
      <div class="sub">Lights and equipment</div>
      <div class="grid">
        <${Num} label="Lighting" unit="W/m²" value=${room.ash?.lighting?.Wm2 ?? null} placeholder="V1.25 table" onChange=${S(['lighting', 'Wm2'])} />
        <${Sel} label="Luminaire" value=${a.lighting.luminaire} options=${LUMINAIRES} onChange=${S(['lighting', 'luminaire'])} />
        <${Num} label="Equipment" unit="W" value=${a.ac.equipW} onChange=${S(['ac', 'equipW'])} />
        <${Num} label="Equipment radiant fraction" value=${a.ac.equipRad} min=${0} max=${1} onChange=${S(['ac', 'equipRad'])} hint="ASHRAE range 0.2 to 0.8" />
      </div>
      <div class="sub">Walls and windows <span class="th">ผนังที่เลือก Outside เท่านั้นที่โดนแดด</span></div>
      <div class="walls">
        ${room.walls.map((w, i) => html`<div class="wall">
          <b>Wall ${i + 1}</b><span class="hint">${w.source === 'outside' ? 'outside' : 'partition, steady'}</span>
          <${Sel} label="Construction" value=${a.walls[i].construction} options=${CONSTRUCTIONS} onChange=${S(['walls', i, 'construction'])} />
          ${w.source === 'outside' && html`
            <${Sel} label="Faces" value=${a.walls[i].orient} options=${ORIENTS} onChange=${S(['walls', i, 'orient'])} />
            <${Sel} label="Colour" value=${a.walls[i].colour} options=${COLOURS} onChange=${S(['walls', i, 'colour'])} />
            <${Num} label="Window area" unit="m²" value=${a.walls[i].win.area} min=${0} onChange=${S(['walls', i, 'win', 'area'])} />
            ${a.walls[i].win.area > 0 && html`
              <${Num} label="Window U" unit="W/m²K" value=${a.walls[i].win.U} onChange=${S(['walls', i, 'win', 'U'])} />
              <${Num} label="SHGC (normal)" value=${a.walls[i].win.SHGC} onChange=${S(['walls', i, 'win', 'SHGC'])} />
              <${Sel} label="Panes" value=${a.walls[i].win.panes} options=${[1, 2]} onChange=${S(['walls', i, 'win', 'panes'])} />
              <${Num} label="Inside shade IAC" value=${a.walls[i].win.iac} onChange=${S(['walls', i, 'win', 'iac'])} hint="1 = no blinds" />`}`}
        </div>`)}
      </div>
      <div class="grid">
        <${Sel} label="Ceiling" value=${a.roof.exposed} options=${[{ value: false, label: 'Under a roof space (ceiling temperature above)' }, { value: true, label: 'Exposed roof, sol-air' }]} onChange=${S(['roof', 'exposed'])} />
        ${a.roof.exposed && html`<${Sel} label="Roof construction" value=${a.roof.construction} options=${ROOF_CONSTRUCTIONS} onChange=${S(['roof', 'construction'])} />
          <${Sel} label="Roof colour" value=${a.roof.colour} options=${COLOURS} onChange=${S(['roof', 'colour'])} />`}
      </div>`}
  </section>`;
}

export function AshraeResults({ room, ash, v125, cmp }) {
  if (!ash) return html`<aside class="results" aria-label="Results"><p class="note">Enter temperature and RH to calculate.</p></aside>`;
  const t = ash.totals, parts = ash.parts, pos = parts.reduce((s, p) => s + Math.max(0, p[2]), 0) || 1;
  const COL = ['var(--c-trans)', 'var(--c-inf)', 'var(--c-prod)', 'var(--c-eq)', '#6B5BD2'];
  return html`<div class="ashres">
    <div class="big"><span class="lab">Required capacity · ASHRAE</span><b>${kW(t.required)}</b><span class="u">kW</span></div>
    <div class="sub2">${kW(t.required / 3.5169)} TR${ash.kind === 'ac' ? ` · peak ${MONTHS[ash.peak.month - 1].slice(0, 3)} ${ash.peak.hour}:00 · SHR ${kW(ash.peak.SHR, 2)}` : ` · run ${t.runHours} h/day · SF ${t.safetyFactor} %`}</div>
    ${cmp && html`<div class="cmpline">V1.25 ${kW(cmp.v125)} kW → ASHRAE ${kW(cmp.ashrae)} kW <b class=${cmp.delta >= 0 ? 'up' : 'down'}>${cmp.delta >= 0 ? '+' : '−'}${kW(Math.abs(cmp.delta))} kW (${cmp.pct >= 0 ? '+' : '−'}${kW(Math.abs(cmp.pct), 0)} %)</b></div>`}
    <div class="stack" role="img" aria-label="Load split by part">${parts.map((p, i) => html`<span style=${`width:${Math.max(0, p[2]) / pos * 100}%;background:${COL[i]}`}></span>`)}</div>
    <table class="parts"><tbody>
      ${parts.map((p, i) => html`<tr><td><i style=${`background:${COL[i]}`}></i>${p[1]}</td><td class="n">${kW(p[2])}</td><td class="n mut">${kW(Math.max(0, p[2]) / pos * 100, 0)} %</td></tr>`)}
      ${ash.kind === 'ac' ? html`
        <tr class="sum"><td>Coil load at peak</td><td class="n">${kW(t.total)}</td><td></td></tr>
        <tr><td>Room sensible / latent</td><td class="n">${kW(ash.peak.roomS / 1000)} / ${kW(ash.peak.roomL / 1000)}</td><td></td></tr>
        <tr><td>Outdoor air</td><td class="n">${kW(ash.ventilation.used, 0)} L/s</td><td></td></tr>
        <tr><td>Supply air at ${ash.peak.supplyT} °C</td><td class="n">${kW(ash.peak.supplyLs, 0)} L/s</td><td></td></tr>
        <tr><td>+ ${t.safetyFactor} % margin</td><td class="n"><b>${kW(t.required)}</b></td><td></td></tr>`
      : html`
        <tr class="sum"><td>Load segments</td><td class="n">${kW(t.segments)}</td><td></td></tr>
        <tr><td>× (1 + ${t.safetyFactor} %) + fans + defrost</td><td class="n">${kW(t.afterSF)}</td><td></td></tr>
        <tr><td>× 24 / ${t.runHours} h</td><td class="n"><b>${kW(t.required)}</b></td><td></td></tr>`}
    </tbody></table>
  </div>`;
}

export function ComparisonCard({ project, rows }) {
  const list = rows.filter((x) => x.cmp);
  if (!list.length) return null;
  const sum = (k) => list.reduce((s, x) => s + x.cmp[k], 0);
  return html`<section class="card" id="sec-compare">
    <h3>V1.25 vs ASHRAE <span class="th">ต่างกันเท่าไร และเพราะอะไร</span></h3>
    <div class="tbl"><table><thead><tr><th>Room</th><th>Type</th><th class="n">V1.25 kW</th><th class="n">ASHRAE kW</th><th class="n">Difference</th><th>Main reasons</th></tr></thead><tbody>
      ${list.map((x) => html`<tr><td><a href=${`#/p/${project.id}/r/${x.room.id}`}>${x.room.name}</a></td><td>${x.room.roomType}</td><td class="n">${kW(x.cmp.v125)}</td><td class="n">${kW(x.cmp.ashrae)}</td>
        <td class="n"><b class=${x.cmp.delta >= 0 ? 'up' : 'down'}>${x.cmp.delta >= 0 ? '+' : '−'}${kW(Math.abs(x.cmp.delta))} (${x.cmp.pct >= 0 ? '+' : '−'}${kW(Math.abs(x.cmp.pct), 0)} %)</b></td>
        <td><ul class="reasons">${x.cmp.reasons.slice(0, 3).map((r) => html`<li>${r}</li>`)}</ul></td></tr>`)}
    </tbody><tfoot><tr><td colspan="2">Project</td><td class="n">${kW(sum('v125'))}</td><td class="n">${kW(sum('ashrae'))}</td><td class="n"><b>${kW(sum('ashrae') - sum('v125'))}</b></td><td></td></tr></tfoot></table></div>
    <p class="note">Both columns use the same room data. The full breakdown for each room is on its page and in the report.</p>
  </section>`;
}

export function RoomComparison({ cmp }) {
  if (!cmp) return null;
  return html`<section class="card" id="sec-roomcmp">
    <h3>V1.25 vs ASHRAE for this room</h3>
    <div class="tbl"><table><thead><tr><th>Part</th><th class="n">V1.25</th><th class="n">ASHRAE</th><th class="n">Δ kW</th></tr></thead><tbody>
      ${cmp.rows.map((r) => html`<tr class=${/Required|Total/.test(r.label) ? 'sum' : ''}><td>${r.label}</td><td class="n">${kW(r.v125)}</td><td class="n">${kW(r.ashrae)}</td><td class="n">${r.delta >= 0 ? '+' : '−'}${kW(Math.abs(r.delta))}</td></tr>`)}
    </tbody></table></div>
    <ul class="reasons">${cmp.reasons.map((r) => html`<li>${r}</li>`)}</ul>
  </section>`;
}

export function BasisCard({ project, update }) {
  const pa = projectAsh(project), st = STATIONS[pa.station];
  const basis = project.basis || 'V1.25';
  const wbRH = (db, wb) => { const s = stateTWb(db, wb); return s ? Math.round(s.RH) : null; };
  return html`<section class="card" id="sec-basis">
    <h3>Calculation basis <span class="th">เลือกมาตรฐานที่ใช้แสดงผลและออกรายงาน</span></h3>
    <div class="seg" role="radiogroup" aria-label="Calculation basis">
      ${[['V1.25', 'Load Calculation V1.25 (company worksheet)'], ['ASHRAE', 'ASHRAE (Refrigeration 2026, Fundamentals 2025)']].map(([v, l]) => html`
        <button role="radio" aria-checked=${basis === v} class=${basis === v ? 'on' : ''} id=${`basis-${v}`} onClick=${() => update((p) => { p.basis = v; })}>${l}</button>`)}
    </div>
    <p class="note">The Excel export always fills the V1.25 sheets. Both results are worked out all the time, so the comparison below is always current.</p>
    ${basis === 'ASHRAE' && html`<div class="grid">
      <${Sel} label="Weather station" value=${pa.station} options=${Object.values(STATIONS).map((s) => ({ value: s.wmo, label: `${s.name} (WMO ${s.wmo})` }))} onChange=${(v) => update((p) => { p.ash = { ...projectAsh(p), station: v }; })} />
      <${Sel} label="Design month (air-conditioned rooms)" value=${pa.month} options=${[{ value: 'peak', label: 'Find the peak month' }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]} onChange=${(v) => update((p) => { p.ash = { ...projectAsh(p), month: v }; })} />
      <div class="ro"><span class="lab">Station design (0.4 %)</span><b>${st.cooling.db04} °C DB / ${st.cooling.mcwb04} °C MCWB</b><span class="hint">${st.edition}, ${st.period}</span></div>
    </div>
    <div class="row"><button class="btn ghost" id="useashraeout" onClick=${() => update((p) => { p.outdoor.T = st.cooling.db04; p.outdoor.RH = wbRH(st.cooling.db04, st.cooling.mcwb04); })}>Use ${st.cooling.db04} °C / ${wbRH(st.cooling.db04, st.cooling.mcwb04)} % RH as the outdoor design condition</button></div>`}
  </section>`;
}

export function StandardsCard() {
  return html`<section class="card" id="sec-standards">
    <h3>Standards used <span class="th">ฉบับล่าสุด (ค.ศ. / พ.ศ.)</span></h3>
    <div class="tbl"><table><thead><tr><th>Document</th><th class="n">Edition</th><th class="n">พ.ศ.</th><th>Used for</th></tr></thead><tbody>
      ${EDITIONS.map((e) => html`<tr><td>${e.title}</td><td class="n">${e.year}</td><td class="n">${e.be}</td><td>${e.use}</td></tr>`)}
    </tbody></table></div>
  </section>`;
}

const COLS = [['Envelope', ['transmission', 'envelope']], ['Solar', ['solar']], ['Air', ['infiltration', 'air']], ['Product', ['product']], ['Internal', ['internal']], ['Fans + defrost', ['equip']]];
export function AshraeSummary({ project, rows }) {
  const val = (r, keys) => (r ? r.parts.filter((p) => keys.includes(p[0])).reduce((s, p) => s + p[2], 0) : 0);
  const tot = rows.reduce((s, x) => s + (x.ash?.totals.required || 0), 0);
  return html`<section class="card" id="sec-summary-ash">
    <div class="row between"><h3>Summary · ASHRAE <span class="th">สรุป heat load ตาม ASHRAE</span></h3>
      <div class="big inline"><b>${kW(tot)}</b> kW · <b>${kW(tot / 3.5169)}</b> TR</div></div>
    ${project.buildings.map((b) => b.floors.map((f) => {
      const fr = rows.filter((x) => x.floor.id === f.id);
      const ft = fr.reduce((s, x) => s + (x.ash?.totals.required || 0), 0);
      return html`<div class="tbl"><table class="sum"><caption>${b.name} · ${f.name}</caption>
        <thead><tr><th>Room</th><th>Type</th><th class="n">°C</th>${COLS.map(([l]) => html`<th class="n">${l}</th>`)}<th class="n">Total</th><th class="n">Required kW</th><th class="n">TR</th><th>Basis</th></tr></thead>
        <tbody>${fr.map((x) => { const r = x.ash; return html`<tr><td><a href=${`#/p/${project.id}/r/${x.room.id}`}>${x.room.name}</a></td><td>${x.room.roomType}</td><td class="n">${x.room.T ?? '—'}</td>
          ${COLS.map(([, k]) => html`<td class="n">${r ? kW(val(r, k)) : '—'}</td>`)}<td class="n">${kW(r?.totals.total)}</td><td class="n"><b>${kW(r?.totals.required)}</b></td><td class="n">${kW((r?.totals.required || 0) / 3.5169)}</td>
          <td class="mut">${r ? (r.kind === 'ac' ? `RTS peak ${MONTHS[r.peak.month - 1].slice(0, 3)} ${r.peak.hour}:00` : `SF ${r.totals.safetyFactor} %, ${r.totals.runHours} h`) : ''}</td></tr>`; })}</tbody>
        <tfoot><tr><td colspan="3">${f.name} total</td>${COLS.map(() => html`<td></td>`)}<td></td><td class="n"><b>${kW(ft)}</b></td><td class="n">${kW(ft / 3.5169)}</td><td></td></tr></tfoot></table></div>`;
    }))}
    <p class="note">Refrigerated rooms: Refrigeration handbook method, required = (segments × (1 + SF) + fans + defrost) × 24 / running hours. Air-conditioned rooms: peak hourly coil load by the RTS method. Floor totals add room peaks.</p>
  </section>`;
}
