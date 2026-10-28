// Calculation report (English). Print → "Save as PDF". Every part shows formula, substituted values, result, reference.
import { html } from './fields.js';
import { eachRoom, MASTER_DEFAULTS, sourceLabel } from '../model.js';
import { ENGINE_VERSION } from '../engine/v125.js';

const f = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const n = (x, d = 2) => (Number.isFinite(x) ? (x < 0 ? `(${f(x, d)})` : f(x, d)) : '—');
const TR = 3.5169;
const REF = {
  trans: 'ASHRAE Handbook—Refrigeration, Refrigeration Load chapter (transmission); conductivity k and thickness from Load Calculation V1.25, Table 1',
  infil: 'ASHRAE Handbook—Refrigeration, Refrigeration Load chapter: infiltration through doorways (Gosney & Olama); Df and E per V1.25 Table 2',
  psy: 'Moist-air properties: V1.25 psychrometric tables (5 °C × 10 % RH grid, bilinear interpolation)',
  prod: 'ASHRAE Handbook—Refrigeration, Thermal Properties of Foods (initial freezing point, specific heats, latent heat) via V1.25 product table',
  people: 'ASHRAE Handbook—Refrigeration, Refrigeration Load chapter: heat from people q = 272 − 6t (W/person)',
  equip: 'Load Calculation V1.25: lighting factor (Table 6), fan motor estimate (Table 5), forklift (Table 7), motor factor (Table 8)',
};

function Formula({ lines }) { return html`<pre class="fx">${lines.join('\n')}</pre>`; }

export function Report({ project, results, data }) {
  const rows = [...eachRoom(project)].map((x) => ({ ...x, ...results.get(x.room.id) }));
  const tot = rows.reduce((s, x) => { const r = x.result; if (!r) return s; s.req += r.totals.required; s.ex += (x.room.extras.glass || 0) + (x.room.extras.defrost || 0) + (x.room.extras.packaging || 0); return s; }, { req: 0, ex: 0 });
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return html`<div class="report">
    <div class="rtool noprint">
      <a class="btn ghost" href=${`#/p/${project.id}`}>← Back to project</a>
      <button class="btn" id="printpdf" onClick=${() => window.print()}>Save as PDF</button>
      <span class="note">In the print window choose <b>Destination: Save as PDF</b>, paper <b>A4</b>, and untick <b>Headers and footers</b>.</span>
    </div>

    <section class="rpage cover">
      <div class="rbrand"><img src="icons/icon-192.png" alt="" /><span>Heat Load Studio</span></div>
      <h1>Refrigeration Heat Load Calculation</h1>
      <h2>${project.name}</h2>
      <table class="kv"><tbody>
        <tr><th>Client</th><td>${project.client || '—'}</td></tr>
        <tr><th>Site</th><td>${project.site || '—'}</td></tr>
        <tr><th>Job no.</th><td>${project.jobNo || '—'}</td></tr>
        <tr><th>Prepared by</th><td>${project.engineer || '—'}</td></tr>
        <tr><th>Revision / date</th><td>Rev ${project.revision} · ${date}</td></tr>
        <tr><th>Calculation basis</th><td>Load Calculation V1.25 (parity) · engine ${ENGINE_VERSION}</td></tr>
        <tr><th>Outdoor design</th><td>${project.outdoor?.T ?? '—'} °C DB / ${project.outdoor?.RH ?? '—'} % RH</td></tr>
        <tr><th>Default values</th><td>${project.defaultsConfirmed ? 'Checked by the engineer for this project' : 'NOT YET CONFIRMED for this project'}</td></tr>
      </tbody></table>
      <div class="bigsum"><div><span>Total required capacity</span><b>${f(tot.req)} kW</b></div><div><span>Refrigeration tons</span><b>${f(tot.req / TR)} TR</b></div><div><span>Rooms</span><b>${rows.length}</b></div></div>
      ${tot.ex ? html`<p>Loads outside V1.25 (glass, defrost, packaging): ${f(tot.ex)} kW → grand total ${f(tot.req + tot.ex)} kW.</p>` : ''}
    </section>

    <section class="rpage">
      <h2>1. Summary</h2>
      ${project.buildings.map((b) => b.floors.map((fl) => {
        const fr = rows.filter((x) => x.floor.id === fl.id); if (!fr.length) return null;
        const s = fr.reduce((a, x) => { const r = x.result; if (!r) return a; a.t += r.transmission.total; a.i += r.infiltration.total; a.p += r.product.total; a.e += r.equipment.total; a.tot += r.totals.total; a.req += r.totals.required; return a; }, { t: 0, i: 0, p: 0, e: 0, tot: 0, req: 0 });
        return html`<table class="rt"><caption>${b.name} · ${fl.name}</caption>
          <thead><tr><th>Room</th><th>Type</th><th class="r">T °C</th><th class="r">Trans. kW</th><th class="r">Infil. kW</th><th class="r">Product kW</th><th class="r">Equip. kW</th><th class="r">Total kW</th><th class="r">SF %</th><th class="r">Run h</th><th class="r">Required kW</th><th class="r">TR</th></tr></thead>
          <tbody>${fr.map((x) => { const r = x.result; return html`<tr><td>${x.room.name}</td><td>${x.room.roomType}</td><td class="r">${x.room.T ?? '—'}</td><td class="r">${n(r?.transmission.total)}</td><td class="r">${n(r?.infiltration.total)}</td><td class="r">${n(r?.product.total)}</td><td class="r">${n(r?.equipment.total)}</td><td class="r">${n(r?.totals.total)}</td><td class="r">${r?.totals.safetyFactor ?? '—'}</td><td class="r">${r?.totals.runHours ?? '—'}</td><td class="r"><b>${n(r?.totals.required)}</b></td><td class="r">${n((r?.totals.required || 0) / TR)}</td></tr>`; })}</tbody>
          <tfoot><tr><td colspan="3">${fl.name} total</td><td class="r">${n(s.t)}</td><td class="r">${n(s.i)}</td><td class="r">${n(s.p)}</td><td class="r">${n(s.e)}</td><td class="r">${n(s.tot)}</td><td></td><td></td><td class="r"><b>${n(s.req)}</b></td><td class="r">${n(s.req / TR)}</td></tr></tfoot>
        </table>`;
      }))}
      <p class="small">Required capacity per room = (sum of parts) × (1 + safety factor) × 24 / running hours. Floor totals are sums of room requirements.</p>
      <h3>Default values used for new rooms</h3>
      <table class="rt narrow"><thead><tr><th>Item</th><th class="r">Value</th><th>V1.25 cell</th></tr></thead>
        <tbody>${MASTER_DEFAULTS.map((d) => html`<tr><td>${d.label}</td><td class="r">${d.value} ${d.unit}</td><td>${d.cell}</td></tr>`)}</tbody></table>
    </section>

    ${rows.map((x, idx) => html`<${RoomSheet} no=${idx + 1} x=${x} project=${project} data=${data} />`)}

    <section class="rpage">
      <h2>${rows.length + 2}. Notes and references</h2>
      <ol class="small">
        <li>This calculation reproduces Load Calculation V1.25 (sheet "for copy") cell by cell. It was verified against the workbook recalculated in Microsoft Excel and LibreOffice (64 test cases, all room types).</li>
        <li>Psychrometric properties come from the V1.25 tables (5 °C × 10 % RH grid) with bilinear interpolation; ASHRAE equations differ by less than 2 % on the reference case.</li>
        <li>Known V1.25 simplifications kept in this edition: floor with convection uses h = 1.6 W/m²K on both faces; door passage time fixed at 10 s per door per hour; negative transmission (heat flowing out) is counted as zero; no solar gain, glazing, defrost or packaging load inside V1.25 (entered separately as "loads outside V1.25").</li>
        <li>References: ASHRAE Handbook—Refrigeration 2026 (refrigeration load; thermal properties of foods); ASHRAE Handbook—Fundamentals 2025 (psychrometrics); Load Calculation V1.25 tables 1–8.</li>
      </ol>
      <p class="small">Prepared with Heat Load Studio ${ENGINE_VERSION}. Check all inputs against the project TOR before use.</p>
    </section>
  </div>`;
}

function RoomSheet({ no, x, project, data }) {
  const { room, result: r, warnings = [] } = x;
  if (!r) return html`<section class="rpage"><h2>${no + 1}. ${room.name}</h2><p>No result.</p></section>`;
  const s = r.transmission.surfaces, t = r.totals, e = r.equipment;
  const hr = r.psychro.room;
  const doors = r.infiltration.doors.filter((d) => d.count > 0);
  const prods = r.product.items.filter((p) => p.name);
  const mu = r.infiltration.makeUp;
  const fanEst = !(room.fanMotorKW > 0);
  const isABF = room.roomType === 'Freezer - Trolley';
  const fanPct = data.fanFactor[room.roomType] || 0;
  const fanBase = r.transmission.total + r.infiltration.total + r.product.total + e.lighting + e.workers + e.motors;
  const extras = (room.extras.glass || 0) + (room.extras.defrost || 0) + (room.extras.packaging || 0);
  let sec = 0; const S = (title) => `${no + 1}.${++sec} ${title}`;
  return html`<section class="rpage room">
    <h2>${no + 1}. ${room.name} <span class="tag">${room.roomType}</span></h2>
    <p class="small">${x.building.name} · ${x.floor.name}</p>
    <div class="cols">
      <table class="kv"><tbody>
        <tr><th>Room condition</th><td>${room.T ?? '—'} °C / ${room.RH ?? '—'} % RH</td></tr>
        <tr><th>Size W × L × H</th><td>${f(room.W)} × ${f(room.L)} × ${f(room.H)} m</td></tr>
        <tr><th>Floor area / volume</th><td>${f((room.W || 0) * (room.L || 0))} m² / ${f((room.W || 0) * (room.L || 0) * (room.H || 0))} m³</td></tr>
        <tr><th>Safety factor</th><td>${t.safetyFactor} %</td></tr>
      </tbody></table>
      <div class="result"><span>Required capacity</span><b>${f(t.required)} kW</b><span>${f(t.required / TR)} TR · run ${t.runHours ?? '—'} h/day</span></div>
    </div>

    <h3>${S('Room air (psychrometric)')}</h3>
    <${Formula} lines=${[`Room ${room.T} °C / ${room.RH} %:  h_r = ${f(hr?.h, 2)} kJ/kg,  v = ${f(hr?.v, 4)} m³/kg,  ρ_r = 1/v = ${f(hr?.rho, 4)} kg/m³`]} />
    <p class="ref">${REF.psy}</p>

    <h3>${S('Transmission')}</h3>
    <table class="rt"><thead><tr><th>Surface</th><th>Other side</th><th>Insulation</th><th class="r">L mm</th><th class="r">k W/m·K</th><th class="r">U W/m²K</th><th class="r">A m²</th><th class="r">ΔT K</th><th class="r">q kW</th></tr></thead>
      <tbody>${s.map((q, i) => html`<tr><td>${q.name}</td><td>${i >= 2 ? sourceLabel(project, room.walls[i - 2]) : `${q.Tout} °C`}</td><td>${q.type}</td><td class="r">${q.thickness ?? '—'}</td><td class="r">${f(q.k, 3)}</td><td class="r">${f(q.U, 3)}</td><td class="r">${f(q.A)}</td><td class="r">${f(q.dT, 1)}</td><td class="r">${q.raw < 0 ? html`0.00 <span class="small">(${f(q.raw)})</span>` : f(q.q)}</td></tr>`)}</tbody>
      <tfoot><tr><td colspan="8">Transmission total</td><td class="r"><b>${f(r.transmission.total)}</b></td></tr></tfoot></table>
    <${Formula} lines=${[
      'U = k / L (walls, ceiling, floor without convection)      U_floor,conv = 1 / (1/1.6 + L/k + 1/1.6)',
      'q = U × A × (T_other − T_room) / 1000   [kW];  negative q is counted as 0 (V1.25)',
      ...s.filter((q) => q.A > 0 && q.U > 0).slice(0, 3).map((q) => `${q.name}: ${f(q.U, 3)} × ${f(q.A)} × (${q.Tout} − ${room.T}) / 1000 = ${f(q.raw, 3)} kW`),
    ]} />
    <p class="ref">${REF.trans}</p>

    <h3>${S('Infiltration')}</h3>
    ${doors.length === 0 && !(mu.CMH > 0) ? html`<p>No doors or make-up air.</p>` : ''}
    ${doors.map((d) => d.loading ? html`
      <${Formula} lines=${[`${d.name} (loading dock, 1 cm gap method): ${d.count} door(s)`,
        `Gap area A_gap = 2·H·0.01 + 2·(W − 0.01)·0.01 = ${f(d.gapArea, 3)} m²;  airflow = A_gap × 0.5 m/s × 3600 = ${f(d.gapCMH, 1)} m³/h`,
        `q = n × ρ_r × (V/3600) × (h_i − h_r) = ${d.count} × ${f(d.rho_r, 4)} × (${f(d.gapCMH, 1)}/3600) × (${f(d.hi)} − ${f(d.h_r)}) = ${f(d.q, 3)} kW`]} />`
      : html`
      <${Formula} lines=${[`${d.name}: ${d.count} door(s) ${f(d.W)} × ${f(d.H)} m, air in ${d.Tin} °C / ${d.RH} % → h_i = ${f(d.hi)} kJ/kg, ρ_i = ${f(d.rho_i, 4)} kg/m³`,
        `q_full = 0.221·A·(h_i − h_r)·ρ_r·(1 − ρ_i/ρ_r)^0.5·(g·H)^0.5·F_m`,
        `       = 0.221 × ${f(d.A)} × (${f(d.hi)} − ${f(d.h_r)}) × ${f(d.rho_r, 4)} × (1 − ${f(d.rho_i, 4)}/${f(d.rho_r, 4)})^0.5 × (9.81 × ${f(d.H)})^0.5 × ${f(d.Fm, 4)} = ${f(d.qFull)} kW`,
        `F_m = [2 / (1 + (ρ_r/ρ_i)^(1/3))]^1.5 = ${f(d.Fm, 4)}`,
        `D_t = n × (10 + θ_o × 60) / 3600 = ${d.count} × (10 + ${d.openMin} × 60) / 3600 = ${f(d.Dt, 4)}`,
        `D_f = ${d.Df} (|ΔT| ${Math.abs((d.Tin ?? 0) - room.T) >= 11 ? '≥' : '<'} 11 K),  E = ${d.E}`,
        `q = q_full × D_t × D_f × (1 − E) = ${f(d.qFull)} × ${f(d.Dt, 4)} × ${d.Df} × ${f(1 - d.E, 3)} = ${f(d.q, 3)} kW`]} />`)}
    ${mu.CMH > 0 && html`<${Formula} lines=${[`Make-up air ${mu.CMH} m³/h at ${mu.T} °C / ${mu.RH} % → h = ${f(r.psychro.makeUp?.h)} kJ/kg`,
      `q = ρ_r × (V/3600) × (h_in − h_r) = ${f(hr?.rho, 4)} × (${mu.CMH}/3600) × (${f(r.psychro.makeUp?.h)} − ${f(hr?.h)}) = ${f(mu.q, 3)} kW`]} />`}
    <p class="total">Infiltration total = <b>${f(r.infiltration.total)} kW</b></p>
    <p class="ref">${REF.infil}</p>

    <h3>${S('Product')}</h3>
    ${prods.length === 0 ? html`<p>No product load.</p>` : prods.map((p) => html`<${Formula} lines=${[
      `Product ${p.idx}: ${p.category} / ${p.name}, ${f(p.ton)} ton in ${f(p.hours, 1)} h → ṁ = ${f(p.rate, 4)} ton/h = ${f((p.rate || 0) / 3.6, 4)} kg/s;  T ${p.tin} → ${p.tout} °C`,
      `t_f = ${p.tf} °C, c_above = ${p.cA}, c_below = ${p.cB} kJ/kg·K, h_if = ${p.latent} kJ/kg`,
      `Q1 above freezing = ṁ·c_above·ΔT = ${f(p.qa, 3)} kW`,
      `Q2 latent         = ṁ·h_if          = ${f(p.ql, 3)} kW`,
      `Q3 below freezing = ṁ·c_below·ΔT = ${f(p.qb, 3)} kW`,
      `Q4 respiration    = m·q_resp / 1000 = ${f(p.ton)} × ${room.products[p.idx - 1]?.respiration ?? 0} / 1000 = ${f(p.qr, 3)} kW`,
      `Product ${p.idx} total = ${f(p.q, 3)} kW`]} />`)}
    <p class="total">Product total = <b>${f(r.product.total)} kW</b></p>
    <p class="ref">${REF.prod}</p>

    <h3>${S('People, lighting and equipment')}</h3>
    <${Formula} lines=${[
      `Lighting  = ${e.lightingFactor ?? 0} W/m² × ${f(room.W)} × ${f(room.L)} m² / 1000 = ${f(e.lighting, 3)} kW`,
      `People    = (272 − 6 × ${room.T}) × ${room.workers || 0} / 1000 = ${f(e.workers, 3)} kW`,
      `Motors    = Σ kW × factor + forklift ${room.forklift?.kW ?? 7} kW × ${f(e.forkliftFactor, 4)} = ${f(e.motors, 3)} kW`,
      fanEst ? (isABF ? `Fan (ABF) = forecast from V1.25 fan database at ${f(Math.max(room.W || 0, room.L || 0) * 20000, 0)} m³/h × 1.03 = ${f(e.fan, 3)} kW`
        : `Fan       = ${fanPct} × (trans. + infil. + product + lighting + people + motors) = ${fanPct} × ${f(fanBase, 3)} = ${f(e.fan, 3)} kW`)
        : `Fan       = actual air cooler fan motors = ${f(e.fan, 3)} kW`,
      `Equipment total = ${f(e.total, 3)} kW`]} />
    <p class="ref">${REF.people}. ${REF.equip}.</p>

    <h3>${S('Required capacity')}</h3>
    <${Formula} lines=${[
      `Q_total    = ${f(r.transmission.total)} + ${f(r.infiltration.total)} + ${f(r.product.total)} + ${f(e.total)} = ${f(t.total)} kW`,
      `Q_SF       = Q_total × (1 + ${t.safetyFactor}/100) = ${f(t.afterSF)} kW`,
      `Q_required = Q_SF × 24 / ${t.runHours} h = ${f(t.required)} kW  (${f(t.required / TR)} TR)`,
      ...(extras ? [`+ loads outside V1.25 (glass ${f(room.extras.glass || 0)}, defrost ${f(room.extras.defrost || 0)}, packaging ${f(room.extras.packaging || 0)}) = ${f(t.required + extras)} kW`] : [])]} />
    ${warnings.length > 0 && html`<div class="warnbox"><b>Checks</b><ul>${warnings.map((w) => html`<li>${w.level.toUpperCase()}: ${w.text}</li>`)}</ul></div>`}
  </section>`;
}
