// Room editor (V1.25 parity inputs) and live results panel.
import { html, Num, Txt, Sel, kW, fmt } from './fields.js';
import { DOOR_E, INSULATION, OPEN_MIN_HINT, LIMITS, eachRoom } from '../model.js';
import { PsyChart, roomPoints, projectPressure } from './psychart.js';
import { AshraeInputs, AshraeResults, RoomComparison } from './ashrae-ui.js';

const WALL_SIDE = ['along length (L)', 'along width (W)', 'along width (W)', 'along length (L)'];

export function RoomEditor({ room, data, result, warnings, onChange, project, cmp }) {
  const set = (fn) => onChange((r) => { fn(r); });
  const ceilType = room.ceiling.type;
  const thk = (t, type) => {
    const tab = type === 'EPS' || type === 'XPS' ? data.thkPS : type === 'PU' || type === 'PIR' ? data.thkPU : null;
    if (t == null || !tab) return null; let v = null; for (const [x, y] of tab) if (x <= t) v = y; return v;
  };
  const floorAuto = room.T != null && room.T >= 10 ? 'Concrete' : ceilType;
  const fType = room.floor.type ?? floorAuto;
  const fThk = fType === 'Concrete' ? 200 : thk(room.T, fType);
  const surf = result?.transmission.surfaces || [];
  const others = [...eachRoom(project)].map((x) => x.room).filter((x) => x.id !== room.id);
  const srcOptions = [{ value: 'outside', label: `Outside (${project.outdoor.T} °C / ${project.outdoor.RH} %)` },
    ...others.map((o) => ({ value: o.id, label: `${o.name} (${o.T ?? '—'} °C)` })), { value: '__manual', label: 'Manual entry' }];
  return html`<div class="editor" data-room=${room.id}>
    <section class="card" id="sec-general">
      <h3>General <span class="th">ข้อมูลห้อง</span></h3>
      <div class="grid">
        <${Txt} label="Room name" value=${room.name} onChange=${(v) => set((r) => { r.name = v || 'Room'; })} />
        <${Sel} label="Room type" value=${room.roomType} options=${data.roomTypes} onChange=${(v) => set((r) => { r.roomType = v; })} hint="V1.25 list: sets lighting, fan %, forklift, ABF" />
        <${Num} label="Room temperature" unit="°C" value=${room.T} min=${-60} max=${54} onChange=${(v) => set((r) => { r.T = v; })} />
        <${Num} label="Room RH" unit="%" value=${room.RH} min=${0} max=${100} onChange=${(v) => set((r) => { r.RH = v; })} />
        <${Num} label="Height H" unit="m" value=${room.H} min=${0} onChange=${(v) => set((r) => { r.H = v; })} />
        <${Num} label="Width W" unit="m" value=${room.W} min=${0} onChange=${(v) => set((r) => { r.W = v; })} />
        <${Num} label="Length L" unit="m" value=${room.L} min=${0} onChange=${(v) => set((r) => { r.L = v; })} />
        <${Num} label="Safety factor" unit="%" value=${room.safetyFactor} min=${0} onChange=${(v) => set((r) => { r.safetyFactor = v ?? 15; })} />
      </div>
      ${room.W > 0 && room.L > 0 && html`<p class="note">Floor area ${fmt(room.W * room.L, 2)} m² · volume ${fmt(room.W * room.L * (room.H || 0), 2)} m³</p>`}
    </section>

    <section class="card" id="sec-envelope">
      <h3>Envelope <span class="th">ผนัง เพดาน พื้น</span></h3>
      <div class="sub">Ceiling</div>
      <div class="grid">
        <${Num} label="Ceiling surface temperature" unit="°C" value=${room.ceiling.T} onChange=${(v) => set((r) => { r.ceiling.T = v; })} />
        <${Sel} label="Insulation (ceiling, walls default)" value=${ceilType} options=${INSULATION.filter((x) => x !== 'Concrete')} onChange=${(v) => set((r) => { r.ceiling.type = v; })} />
        <div class="ro"><span class="lab">Thickness (Table 1)</span><b>${thk(room.T, ceilType) ?? '—'} mm</b><span class="hint">U ${kW(surf[0]?.U, 3)} W/m²K · ${kW(surf[0]?.q)} kW</span></div>
      </div>
      <div class="sub">Floor</div>
      <div class="grid">
        <${Num} label="Floor temperature" unit="°C" value=${room.floor.T} onChange=${(v) => set((r) => { r.floor.T = v; })} />
        <${Sel} label="Floor type" value=${room.floor.type ?? null} allowEmpty emptyLabel=${`Auto (V1.25): ${floorAuto}`} options=${INSULATION} onChange=${(v) => set((r) => { if (v == null) delete r.floor.type; else r.floor.type = v; })} />
        <${Sel} label="Convection" value=${room.floor.convection} options=${['Yes', 'No']} onChange=${(v) => set((r) => { r.floor.convection = v; })} hint="V1.25 uses h = 1.6 W/m²K (finding F1)" />
        <div class="ro"><span class="lab">Thickness</span><b>${fThk ?? '—'} mm</b><span class="hint">U ${kW(surf[1]?.U, 3)} W/m²K · ${kW(surf[1]?.q)} kW</span></div>
      </div>
      <div class="sub">Walls <span class="th">อุณหภูมิอีกด้านของผนัง</span></div>
      <div class="walls">
        ${room.walls.map((w, i) => html`<div class="wall">
          <b>Wall ${i + 1}</b><span class="hint">${WALL_SIDE[i]}</span>
          <${Sel} label="Other side" value=${w.source ?? '__manual'} options=${srcOptions} onChange=${(v) => set((r) => { r.walls[i].source = v === '__manual' ? null : v; })} />
          <${Num} label="Outside temperature" unit="°C" value=${w.T} onChange=${(v) => set((r) => { r.walls[i].T = v; r.walls[i].source = null; })} hint=${w.source ? 'linked — typing a value switches to manual' : ''} />
          <${Sel} label="Insulation" value=${w.type ?? null} allowEmpty emptyLabel=${`Same as ceiling (${ceilType})`} options=${INSULATION} onChange=${(v) => set((r) => { if (v == null) delete r.walls[i].type; else r.walls[i].type = v; })} />
          <span class="hint">${thk(room.T, w.type ?? ceilType) ?? '—'} mm · ${kW(surf[i + 2]?.A)} m² · <b>${kW(surf[i + 2]?.q)} kW</b></span>
        </div>`)}
      </div>
    </section>

    <section class="card" id="sec-doors">
      <h3>Doors <span class="th">ประตู (2 ชุดต่อผนัง)</span></h3>
      <p class="note">Recommended opening time for ${room.roomType} (Table 3): <b>${OPEN_MIN_HINT[room.roomType] ?? '—'} min/hr</b>${room.roomType.startsWith('Freezer') ? ' — freezer door load is covered by the safety factor in V1.25.' : ''}${room.roomType === 'Loading Dock' ? ' · Loading Dock doors use the 1 cm gap method (V1.25), not opening time.' : ''}</p>
      <div class="doors">
        ${room.walls.map((w, i) => w.doors.slice(0, LIMITS.doorsPerWall).map((d, j) => {
          if (!(d && d.count > 0)) return null;
          const res = result?.infiltration.doors[i * 2 + j];
          const D = (k, v) => set((r) => { r.walls[i].doors[j][k] = v; });
          return html`<div class="door on">
            <div class="dh"><b>Wall ${i + 1} · door ${j + 1}</b><span class="pill">${kW(res?.q)} kW</span>
              <button class="link danger" onClick=${() => set((r) => { r.walls[i].doors[j] = {}; })}>Remove</button></div>
            <div class="grid tight">
              <${Num} label="Number of doors" value=${d.count} min=${0} onChange=${(v) => D('count', v)} />
              <${Num} label="Width" unit="m" value=${d.W} onChange=${(v) => D('W', v)} />
              <${Num} label="Height" unit="m" value=${d.H} onChange=${(v) => D('H', v)} />
              <${Num} label="Opening time" unit="min/hr" value=${d.openMin} onChange=${(v) => D('openMin', v)} />
              <${Sel} label="Protection E" value=${d.E ?? 0} options=${DOOR_E.map((x) => ({ value: x.E, label: x.label }))} onChange=${(v) => D('E', v)} />
              <${Num} label="RH of air coming in" unit="%" value=${d.RH} min=${0} max=${100} onChange=${(v) => set((r) => { r.walls[i].doors[j].RH = v; r.walls[i].doors[j].rhManual = true; })}
                hint=${`Air ${w.T ?? '—'} °C (wall ${i + 1} other side)${w.source ? (d.rhManual ? ' · RH typed' : ' · RH linked') : ''}`} />
              ${w.source && d.rhManual && html`<button class="link" onClick=${() => set((r) => { r.walls[i].doors[j].rhManual = false; })}>Use linked RH</button>`}
            </div>
          </div>`;
        }))}
      </div>
      <div class="row">
        ${room.walls.map((w, i) => {
          const j = w.doors.findIndex((d) => !(d && d.count > 0));
          return j >= 0 && j < LIMITS.doorsPerWall && html`<button class="ghost" id=${`adddoor-${i + 1}`} onClick=${() => set((r) => { r.walls[i].doors[j] = { count: 1, W: null, H: null, openMin: OPEN_MIN_HINT[r.roomType] ?? null, E: 0, RH: null }; })}>+ Door on wall ${i + 1}</button>`;
        })}
      </div>
    </section>

    <section class="card" id="sec-products">
      <h3>Products <span class="th">สินค้า (สูงสุด 5)</span></h3>
      ${room.products.map((p, k) => {
        const f = data.foods.find((x) => x[0] === p.name);
        const res = result?.product.items[k];
        return html`<div class="prod">
          <div class="dh"><b>Product ${k + 1}</b><span class="pill">${kW(res?.q)} kW</span>
            <button class="link danger" onClick=${() => set((r) => { r.products.splice(k, 1); })}>Remove</button></div>
          <div class="grid tight">
            <${Sel} label="Category" value=${p.category ?? null} allowEmpty options=${Object.keys(data.categories)} onChange=${(v) => set((r) => { r.products[k].category = v; r.products[k].name = null; })} />
            <${Sel} label="Product" value=${p.name ?? null} allowEmpty options=${data.categories[p.category] || []} onChange=${(v) => set((r) => { r.products[k].name = v; })} />
            <${Num} label="Temperature in" unit="°C" value=${p.tIn} onChange=${(v) => set((r) => { r.products[k].tIn = v; })} />
            <${Num} label="Temperature out" unit="°C" value=${p.tOut} onChange=${(v) => set((r) => { r.products[k].tOut = v; })} />
            <${Num} label="Weight in" unit="ton" value=${p.ton} onChange=${(v) => set((r) => { r.products[k].ton = v; })} hint=${p.ton != null ? `${fmt(p.ton, 2)} ton` : ''} />
            <${Num} label="Cooling time" unit="h" value=${p.hours} onChange=${(v) => set((r) => { r.products[k].hours = v; })} />
            <${Num} label="Heat of respiration" unit="mW/kg" value=${p.respiration} onChange=${(v) => set((r) => { r.products[k].respiration = v; })} hint=${['Fruits', 'Vegetables'].includes(p.category) ? 'Fresh produce: enter from ASHRAE thermal properties of foods' : 'Usually 0 for meat, fish, frozen products'} />
          </div>
          ${f && html`<p class="note">ASHRAE data (from master): freezing point ${f[2] === '—' ? '— (−1 °C used)' : f[2] + ' °C'} · c above ${f[3]} · c below ${f[4]} kJ/kg·K · latent ${f[6]} kJ/kg${res ? ` · rate ${fmt(res.rate, 2)} ton/h` : ''}</p>`}
        </div>`;
      })}
      ${room.products.length < LIMITS.products && html`<button class="ghost" onClick=${() => set((r) => { r.products.push({ category: null, name: null, tIn: null, tOut: room.T, ton: null, hours: 24, respiration: null }); })}>+ Add product</button>`}
    </section>

    <section class="card" id="sec-equipment">
      <h3>People & equipment <span class="th">คน ไฟ มอเตอร์ forklift</span></h3>
      <div class="grid">
        <${Num} label="Workers" unit="person" value=${room.workers} min=${0} onChange=${(v) => set((r) => { r.workers = v ?? 0; })} hint=${`(272 − 6·T) W each = ${kW(result?.equipment.workers)} kW`} />
        <div class="ro"><span class="lab">Lighting (Table 6)</span><b>${data.lighting[room.roomType] ?? 0} W/m²</b><span class="hint">${kW(result?.equipment.lighting)} kW</span></div>
        <${Num} label="Actual air cooler fan motor" unit="kW" value=${room.fanMotorKW} min=${0} onChange=${(v) => set((r) => { r.fanMotorKW = v; })} hint=${room.fanMotorKW > 0 ? 'Using actual motor' : room.roomType === 'Freezer - Trolley' ? `ABF: airflow max(W,L) × 20,000 = ${fmt(Math.max(room.W || 0, room.L || 0) * 20000, 0)} CMH → ${kW(result?.equipment.fan)} kW` : `Estimate ${Math.round((data.fanFactor[room.roomType] || 0) * 100)} % of load: ${kW(result?.equipment.fan)} kW`} />
      </div>
      <div class="sub">Forklift (Table 7)</div>
      <div class="grid">
        <${Num} label="Forklift power" unit="kW" value=${room.forklift.kW} onChange=${(v) => set((r) => { r.forklift.kW = v; })} />
        <${Num} label="Loading time / day" unit="h" value=${room.forklift.hours} onChange=${(v) => set((r) => { r.forklift.hours = v; })} />
        <${Num} label="Product weight / pallet" unit="kg" value=${room.forklift.kgPerPallet} onChange=${(v) => set((r) => { r.forklift.kgPerPallet = v; })} />
        <${Num} label="Product passing / day" unit="ton" value=${room.forklift.tonPerDay} onChange=${(v) => set((r) => { r.forklift.tonPerDay = v; })} hint=${`Forklift factor ${kW(result?.equipment.forkliftFactor, 3)}`} />
      </div>
      <div class="sub">Equipment motors (kW × factor, max 10) <span class="th">Table 8: conveyor 1.0, other 0.3</span></div>
      <div class="eqs">
        ${room.equipment.map((e, k) => html`<div class="eq">
          <${Num} label=${`Equipment ${k + 1}`} unit="kW" value=${e.kW} onChange=${(v) => set((r) => { r.equipment[k].kW = v; })} />
          <${Num} label="Factor" value=${e.factor} onChange=${(v) => set((r) => { r.equipment[k].factor = v; })} />
          <button class="link danger" aria-label=${`Remove equipment ${k + 1}`} onClick=${() => set((r) => { r.equipment.splice(k, 1); })}>Remove</button>
        </div>`)}
      </div>
      ${room.equipment.length < LIMITS.equipment && html`<button class="ghost" onClick=${() => set((r) => { r.equipment.push({ kW: null, factor: 1 }); })}>+ Add equipment</button>`}
    </section>

    <section class="card" id="sec-air">
      <h3>Make-up air <span class="th">อากาศเติม</span></h3>
      <div class="grid">
        <${Num} label="Air temperature" unit="°C" value=${room.makeUp.T} onChange=${(v) => set((r) => { r.makeUp.T = v; })} />
        <${Num} label="Air RH" unit="%" value=${room.makeUp.RH} min=${0} max=${100} onChange=${(v) => set((r) => { r.makeUp.RH = v; })} />
        <${Num} label="Air volume" unit="CMH" value=${room.makeUp.CMH} min=${0} onChange=${(v) => set((r) => { r.makeUp.CMH = v; })} hint=${`${kW(result?.infiltration.makeUp.q)} kW`} />
      </div>
    </section>

    <section class="card" id="sec-extras">
      <h3>Loads outside V1.25 <span class="th">ไปอยู่ใน sheet App extras</span></h3>
      <p class="note">Enter kW directly for now. Glass (solar) and defrost calculators come in a later version.</p>
      <div class="grid">
        <${Num} label="Glass / solar" unit="kW" value=${room.extras.glass} onChange=${(v) => set((r) => { r.extras.glass = v ?? 0; })} />
        <${Num} label="Defrost heat" unit="kW" value=${room.extras.defrost} onChange=${(v) => set((r) => { r.extras.defrost = v ?? 0; })} />
        <${Num} label="Packaging" unit="kW" value=${room.extras.packaging} onChange=${(v) => set((r) => { r.extras.packaging = v ?? 0; })} />
      </div>
    </section>
    ${project.basis === 'ASHRAE' && html`<${AshraeInputs} room=${room} project=${project} set=${set} />`}
    <${RoomComparison} cmp=${cmp} />
  </div>`;
}

const PARTS = [['transmission', 'Transmission', 'var(--c-trans)'], ['infiltration', 'Infiltration', 'var(--c-inf)'], ['product', 'Product', 'var(--c-prod)'], ['equipment', 'Equipment', 'var(--c-eq)']];
export function partsOf(res) { return PARTS.map(([k, label, color]) => ({ k, label, color, v: res ? res[k].total : 0 })); }

export function ResultsPanel({ project, room, result, warnings, res }) {
  const rp = roomPoints(project, room);
  if (project.basis === 'ASHRAE') {
    const ash = res?.ash;
    if (ash?.kind === 'ac' && ash.points) {
      const P = ash.points, pt = (key, label, s, kind) => s && { key, label, t: s.t, RH: s.RH, kind };
      rp.points = [pt('room', room.name, P.ra, 'room'), pt('out', `Outdoor (peak)`, P.oa, 'outdoor'), pt('ma', 'Mixed air', P.ma, 'other'), pt('sa', 'Supply air', P.sa, 'supply')].filter(Boolean);
      rp.links = [['out', 'ma'], ['room', 'ma'], ['ma', 'sa'], ['sa', 'room']];
    }
    return html`<aside class="results" aria-label="Results">
      <${AshraeResults} room=${room} ash=${ash} v125=${result} cmp=${res?.cmp} />
      ${warnings.length > 0 && html`<ul class="warns">${warnings.filter((w) => w.level === 'error').map((w) => html`<li class=${w.level}>${w.text}</li>`)}</ul>`}
      <${PsyChart} compact title=${ash?.kind === 'ac' ? 'Psychrometric chart · coil process' : 'Psychrometric chart'} p=${projectPressure(project)} points=${rp.points} links=${rp.links} comfort=${room.roomType === 'Air Conditioning'} />
    </aside>`;
  }
  const t = result?.totals;
  const parts = partsOf(result);
  const pos = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
  const extra = (room.extras.glass || 0) + (room.extras.defrost || 0) + (room.extras.packaging || 0);
  return html`<aside class="results" aria-label="Results">
    <div class="big"><span class="lab">Required capacity · V1.25</span><b>${kW(t?.required)}</b><span class="u">kW</span></div>
    <div class="sub2">${kW(t?.required / 3.5169)} TR · run ${t?.runHours ?? '—'} h/day · SF ${t?.safetyFactor ?? '—'} %</div>
    <div class="sub2">V1.25 running time: ABF 24 h · room ≤ 5 °C 20 h · above 5 °C 24 h</div>
    <div class="stack" role="img" aria-label="Load split by part">${parts.map((p) => html`<span style=${`width:${Math.max(0, p.v) / pos * 100}%;background:${p.color}`}></span>`)}</div>
    <table class="parts"><tbody>
      ${parts.map((p) => html`<tr><td><i style=${`background:${p.color}`}></i>${p.label}</td><td class="n">${kW(p.v)}</td><td class="n mut">${kW(Math.max(0, p.v) / pos * 100, 0)} %</td></tr>`)}
      <tr class="sum"><td>Total (no SF)</td><td class="n">${kW(t?.total)}</td><td></td></tr>
      <tr><td>After safety factor</td><td class="n">${kW(t?.afterSF)}</td><td></td></tr>
      <tr><td>× 24 / ${t?.runHours ?? '—'} h</td><td class="n"><b>${kW(t?.required)}</b></td><td></td></tr>
      ${extra !== 0 && html`<tr><td>+ App extras</td><td class="n">${kW(extra)}</td><td></td></tr><tr class="sum"><td>Grand total</td><td class="n"><b>${kW((t?.required || 0) + extra)}</b></td><td></td></tr>`}
    </tbody></table>
    ${warnings.length > 0 && html`<ul class="warns">${warnings.map((w) => html`<li class=${w.level}>${w.text}</li>`)}</ul>`}
    <${PsyChart} compact title="Psychrometric chart" p=${projectPressure(project)} points=${rp.points} links=${rp.links} comfort=${room.roomType === 'Air Conditioning'} />
  </aside>`;
}
