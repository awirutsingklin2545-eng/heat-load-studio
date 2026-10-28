// Refrigeration load calculation report (English). The body is rendered hidden, then paged.js lays it
// out into A4 pages with running headers, page numbers and a contents page; the browser prints it
// ("Save as PDF"). Structure follows a normal engineering calculation report: cover with sign-off,
// revision record, contents, introduction, objectives, scope, references, design basis, method
// (each equation with every symbol defined), calculations per room, results, discussion,
// conclusion and appendices.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './fields.js';
import { eachRoom, findRoom, MASTER_DEFAULTS } from '../model.js';
import { ENGINE_VERSION } from '../engine/v125.js';

const TR = 3.5169;
const f = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'n/a');
const fs = (x, d = 2) => (Number.isFinite(x) && x < 0 ? `(${f(-x, d)})` : f(x, d));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const T = (x) => (x == null ? 'n/a' : `${x} °C`);
const cssStr = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
const sideName = (p, w) => (w?.source === 'outside' ? 'Outside' : (w?.source && findRoom(p, w.source)?.room?.name) || 'Adjacent space');
const docNoOf = (p) => `${p.jobNo || 'HLS'}-LC-${p.revision || 'A'}`;

// ---------- typographic helpers ----------
const V = ({ s, sub }) => html`<i>${s}</i>${sub ? html`<sub>${sub}</sub>` : ''}`;
function Eq({ no, children }) { return html`<div class="r-eq"><div class="r-eqm">${children}</div><div class="r-eqn">(${no})</div></div>`; }
function Where({ rows }) {
  return html`<table class="r-where"><tbody>${rows.map(([sym, txt, unit], i) => html`<tr><td class="w0">${i === 0 ? 'where' : ''}</td><td class="w1">${sym}</td><td>=</td><td>${txt}</td><td class="w4">${unit}</td></tr>`)}</tbody></table>`;
}
function Sub({ children }) { return html`<div class="r-sub">${children}</div>`; }

// ---------- data shaping ----------
function collect(project, results) {
  const rows = [...eachRoom(project)].map((x) => ({ ...x, ...results.get(x.room.id) })).filter((x) => x.result);
  const sum = (fn) => rows.reduce((s, x) => s + fn(x), 0);
  const tot = {
    trans: sum((x) => x.result.transmission.total), infil: sum((x) => x.result.infiltration.total),
    prod: sum((x) => x.result.product.total), equip: sum((x) => x.result.equipment.total),
    total: sum((x) => x.result.totals.total), req: sum((x) => x.result.totals.required),
    extras: sum((x) => (x.room.extras?.glass || 0) + (x.room.extras?.defrost || 0) + (x.room.extras?.packaging || 0)),
  };
  return { rows, tot };
}
const parts = (r) => [['Transmission', r.transmission.total], ['Infiltration', r.infiltration.total], ['Product', r.product.total], ['Internal', r.equipment.total]];

const TOC = [
  ['r-intro', '1', 'Introduction'], ['r-obj', '2', 'Objectives'], ['r-scope', '3', 'Scope of work'], ['r-codes', '4', 'Codes, standards and references'],
  ['r-basis', '5', 'Design basis'], ['r-method', '6', 'Calculation method'], ['r-calc', '7', 'Calculations by room'],
  ['r-results', '8', 'Results summary'], ['r-disc', '9', 'Discussion and recommendations'], ['r-concl', '10', 'Conclusion'],
  ['r-appA', 'A', 'Appendix A: Nomenclature'], ['r-appB', 'B', 'Appendix B: Property data used'], ['r-appC', 'C', 'Appendix C: Input checks'],
];
const NOMEN = [
  ['A', 'area', 'm²'], ['c₁, c₂', 'specific heat of the product above and below freezing', 'kJ/kg·K'], ['D_f', 'doorway flow factor', '-'],
  ['D_t', 'fraction of time the door is open', '-'], ['E', 'effectiveness of the door protection', '-'], ['F_m', 'density factor', '-'],
  ['F, F_FL', 'motor use factor; forklift time share', '-'], ['g', 'gravitational acceleration, 9.81', 'm/s²'], ['H', 'height', 'm'],
  ['h', 'specific enthalpy of moist air', 'kJ/kg'], ['h_if', 'latent heat of fusion', 'kJ/kg'], ['k', 'thermal conductivity', 'W/m·K'],
  ['L', 'insulation thickness; room length', 'm'], ['LF', 'lighting load per floor area', 'W/m²'], ['m, ṁ', 'product weight; product flow', 't; kg/s'],
  ['N', 'number of workers', '-'], ['n', 'number of doors', '-'], ['P', 'motor power', 'kW'], ['q, Q', 'heat flow', 'kW'],
  ['RH', 'relative humidity', '%'], ['SF', 'safety factor', '%'], ['T', 'temperature', '°C'], ['t, t_run', 'cooling time; running hours per day', 'h'],
  ['TR', 'ton of refrigeration, 3.517 kW', '-'], ['U', 'overall heat transfer coefficient', 'W/m²·K'], ['v', 'specific volume', 'm³/kg'],
  ['V̇', 'air flow', 'm³/h'], ['W', 'width', 'm'], ['ρ', 'density', 'kg/m³'], ['θ_o', 'time the door stands open each hour', 'min'],
];

// ---------- report body ----------
function Body({ project, results, data }) {
  const { rows, tot } = collect(project, results);
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const rev = project.revision || 'A';
  const n = rows.length;
  const types = [...new Set(rows.map((x) => x.room.roomType.toLowerCase()))];
  const largest = rows.slice().sort((a, b) => b.result.totals.required - a.result.totals.required)[0];
  const floors = project.buildings.flatMap((b) => b.floors.map((fl) => ({ b, fl })));
  const S = (id, num, title) => html`<h2 id=${id} class="r-h2"><span class="r-num">${num}</span> ${title}</h2>`;
  const outdoorDoor = rows.flatMap((x) => x.result.infiltration.doors).find((d) => d.count > 0 && d.Tin === project.outdoor?.T && d.RH === project.outdoor?.RH);
  const usedFoods = [...new Map(rows.flatMap((x) => x.result.product.items.filter((p) => p.name).map((p) => [p.name, p]))).values()];
  const checks = rows.flatMap((x) => (x.warnings || []).map((y) => ({ room: x.room.name, ...y })));
  const loadingRooms = rows.filter((x) => x.result.infiltration.doors.some((d) => d.loading && d.count > 0 && d.wall === 1 && d.slot === 1));

  return html`<div class="r-doc">
    <section class="r-cover">
      <div class="r-brand"><img src="icons/icon-192.png" alt="" /><span>Heat Load Studio</span></div>
      <div class="r-ctitle">
        <p class="r-kicker">Calculation report</p>
        <h1>Refrigeration Heat Load Calculation</h1>
        <p class="r-cproj">${project.name}</p>
        ${(project.client || project.site) && html`<p class="r-cmeta">${[project.client, project.site].filter(Boolean).join(', ')}</p>`}
      </div>
      <table class="r-kv"><tbody>
        <tr><th>Document no.</th><td>${docNoOf(project)}</td></tr>
        <tr><th>Revision</th><td>${rev}</td></tr>
        <tr><th>Date of issue</th><td>${date}</td></tr>
        <tr><th>Job no.</th><td>${project.jobNo || 'n/a'}</td></tr>
        <tr><th>Rooms calculated</th><td>${n}</td></tr>
        <tr><th>Total required capacity</th><td><b>${f(tot.req)} kW (${f(tot.req / TR)} TR)</b></td></tr>
      </tbody></table>
      <table class="r-sign"><thead><tr><th></th><th>Name</th><th>Signature</th><th>Date</th></tr></thead><tbody>
        <tr><th>Prepared by</th><td>${project.engineer || ''}</td><td></td><td></td></tr>
        <tr><th>Checked by</th><td></td><td></td><td></td></tr>
        <tr><th>Approved by</th><td></td><td></td><td></td></tr>
      </tbody></table>
    </section>

    <section class="r-front">
      <h2 class="r-h2 r-nonum">Revision record</h2>
      <table class="r-t"><thead><tr><th>Rev.</th><th>Date</th><th>Description</th><th>Prepared</th><th>Checked</th></tr></thead>
        <tbody><tr><td>${rev}</td><td>${date}</td><td>${rev === 'A' ? 'First issue for review' : 'Revised issue'}</td><td>${project.engineer || ''}</td><td></td></tr></tbody></table>
      <h2 class="r-h2 r-nonum">Contents</h2>
      <ol class="r-toc">${TOC.map(([id, num, title]) => html`<li><a href=${`#${id}`}><span class="r-tnum">${num}</span><span class="r-ttl">${title.replace(/^Appendix \w: /, '')}</span></a></li>
        ${id === 'r-calc' ? rows.map((x, i) => html`<li class="r-tsub"><a href=${`#r-room-${i + 1}`}><span class="r-tnum">7.${i + 1}</span><span class="r-ttl">${x.room.name}</span></a></li>`) : ''}`)}</ol>
    </section>

    <section>
      ${S('r-intro', '1', 'Introduction')}
      <p>This report sizes the refrigeration for ${n === 1 ? 'one room' : `${n} rooms`} of ${project.name}${project.site ? ` at ${project.site}` : ''}${project.client ? ` for ${project.client}` : ''}. The rooms are of the following types: ${types.join(', ')}. For each room it works out how much heat has to be removed, shows the values and assumptions behind that figure, and states the refrigeration capacity the room needs.</p>
      <p>The method is the refrigeration load method of the ASHRAE Handbook as set up in the company's standard worksheet, Load Calculation V1.25. The figures were produced with Heat Load Studio (${ENGINE_VERSION}), which repeats the worksheet cell by cell. The same inputs are issued in the V1.25 Excel file for the project, so the two can be checked against each other.</p>

      ${S('r-obj', '2', 'Objectives')}
      <ol class="r-list">
        <li>Find the heat to be removed from each room at the design conditions, split into transmission, infiltration, product and internal loads.</li>
        <li>Convert that heat load into the refrigeration capacity each room needs, with the safety factor and the daily running time.</li>
        <li>Record the design conditions, construction data and assumptions, so the result can be checked and repeated.</li>
        <li>Provide the capacities for selecting the evaporators (air coolers) and condensing units.</li>
      </ol>

      ${S('r-scope', '3', 'Scope of work')}
      <p>The calculation covers the rooms listed in Table 3.1.</p>
      <table class="r-t"><caption>Table 3.1 Rooms included</caption>
        <thead><tr><th>No.</th><th>Room</th><th>Location</th><th>Room type</th><th class="r">Design</th><th class="r">W × L × H (m)</th></tr></thead>
        <tbody>${rows.map((x, i) => html`<tr><td>${i + 1}</td><td>${x.room.name}</td><td>${x.building.name}, ${x.floor.name}</td><td>${x.room.roomType}</td><td class="r">${T(x.room.T)}, ${x.room.RH ?? 'n/a'} %</td><td class="r">${f(x.room.W)} × ${f(x.room.L)} × ${f(x.room.H)}</td></tr>`)}</tbody></table>
      <p>Included for each room: heat conducted through the walls, ceiling and floor; warm air entering through doors and as make-up air; cooling and freezing of product; and heat from lights, people, forklifts, motors and evaporator fans.</p>
      <p>Not included in the V1.25 method: solar gain on outside walls and roofs, glazing, defrost heat, packaging, pull-down of a warm empty room, and heat gain to the refrigerant piping. Where a value was entered for glazing, defrost or packaging, it is reported separately as a load outside V1.25 and added only to the grand total.</p>

      ${S('r-codes', '4', 'Codes, standards and references')}
      <ol class="r-list">
        <li>ASHRAE Handbook, Refrigeration volume, chapter on refrigeration load: transmission, infiltration through doorways (Gosney and Olama), product and internal loads.</li>
        <li>ASHRAE Handbook, Refrigeration volume, chapter on thermal properties of foods: freezing point, specific heat and latent heat.</li>
        <li>ASHRAE Handbook, Fundamentals volume, chapter on psychrometrics: enthalpy and specific volume of moist air.</li>
        <li>Load Calculation V1.25 worksheet, Tables 1 to 8: insulation thickness, door protection, door opening time, products, fan motor, lighting, forklift and motor factor.</li>
      </ol>

      ${S('r-basis', '5', 'Design basis')}
      <h3 class="r-h3">5.1 Outdoor design condition</h3>
      <p>Outside walls and doors that open to outside use ${T(project.outdoor?.T)} dry bulb and ${project.outdoor?.RH ?? 'n/a'} % relative humidity. A wall next to another room uses that room's design condition.</p>
      <h3 class="r-h3">5.2 Room design conditions</h3>
      <table class="r-t"><caption>Table 5.1 Room conditions and operation</caption>
        <thead><tr><th>Room</th><th class="r">Temperature</th><th class="r">RH</th><th class="r">Safety factor</th><th class="r">Running time</th><th class="r">Workers</th></tr></thead>
        <tbody>${rows.map((x) => html`<tr><td>${x.room.name}</td><td class="r">${T(x.room.T)}</td><td class="r">${x.room.RH ?? 'n/a'} %</td><td class="r">${x.result.totals.safetyFactor} %</td><td class="r">${x.result.totals.runHours ?? 'n/a'} h/day</td><td class="r">${x.room.workers || 0}</td></tr>`)}</tbody></table>
      <h3 class="r-h3">5.3 Construction and insulation</h3>
      <p>The rooms are built from insulated sandwich panels. Panel thickness comes from V1.25 Table 1, which sets it by room temperature and insulation type. A floor in a room at 10 °C or warmer is taken as a 200 mm concrete slab with no insulation. The thermal conductivities are those of the worksheet, listed in Table 5.2.</p>
      <table class="r-t r-narrow"><caption>Table 5.2 Thermal conductivity used</caption><thead><tr><th>Material</th><th class="r">k (W/m·K)</th></tr></thead>
        <tbody>${Object.entries(data.k || {}).map(([m, k]) => html`<tr><td>${m}</td><td class="r">${f(k, 3)}</td></tr>`)}</tbody></table>
      <h3 class="r-h3">5.4 Default values</h3>
      <p>The values in Table 5.3 are the V1.25 defaults and were used wherever the room data does not say otherwise. ${project.defaultsConfirmed ? 'They have been checked against the project requirements.' : 'They have not yet been confirmed against the project requirements and should be checked before this report is issued.'}</p>
      <table class="r-t r-narrow"><caption>Table 5.3 Default values</caption><thead><tr><th>Item</th><th class="r">Value</th><th>V1.25 cell</th></tr></thead>
        <tbody>${MASTER_DEFAULTS.map((d) => html`<tr><td>${d.label}</td><td class="r">${d.value} ${d.unit}</td><td>${d.cell}</td></tr>`)}</tbody></table>
      <h3 class="r-h3">5.5 Assumptions</h3>
      <ol class="r-list">
        <li>The ceiling is taken at the ceiling temperature in Table 5.3, which allows for the hot roof space above the panels.</li>
        <li>Air entering through a door is at the condition of the space on the other side of that wall.</li>
        <li>Lights, people and equipment are taken as running for the full 24 hours.</li>
        <li>Where the evaporator fan motors are not yet known, their heat is estimated as a share of the room load (V1.25 Table 5). For a blast freezer it is estimated from the worksheet's record of fan motor power against airflow.</li>
        <li>Rooms at 5 °C and below lose about 4 hours a day to defrost, so the plant runs 20 hours. Warmer rooms and blast freezers run 24 hours.</li>
      </ol>
    </section>

    <section>
      ${S('r-method', '6', 'Calculation method')}
      <p>The load of each room is the sum of four parts: transmission, infiltration, product and internal loads. The equations below are those of the V1.25 worksheet. Each one is followed by the meaning and unit of every symbol in it.</p>

      <h3 class="r-h3">6.1 Properties of moist air</h3>
      <p>Enthalpy and specific volume are read from the psychrometric tables in V1.25, which give values every 5 °C and every 10 % RH. Between grid points the value is found by linear interpolation, first along temperature and then along humidity. Density is the inverse of specific volume:</p>
      <${Eq} no="6.1">ρ = 1 / <${V} s="v" /><//>
      <${Where} rows=${[['ρ', 'density of the air', 'kg/m³'], [html`<i>v</i>`, 'specific volume read from the table', 'm³/kg']]} />

      <h3 class="r-h3">6.2 Transmission load</h3>
      <p>Heat conducts through each wall, the ceiling and the floor from the warmer side into the room. The insulation gives nearly all of the resistance, so U is taken from the insulation layer alone:</p>
      <${Eq} no="6.2"><${V} s="U" /> = <${V} s="k" /> / <${V} s="L" /><//>
      <${Eq} no="6.3"><${V} s="q" sub="t" /> = <${V} s="U" /> × <${V} s="A" /> × (<${V} s="T" sub="o" /> − <${V} s="T" sub="r" />) / 1000<//>
      <${Where} rows=${[[html`<i>U</i>`, 'overall heat transfer coefficient', 'W/m²·K'], [html`<i>k</i>`, 'thermal conductivity of the insulation', 'W/m·K'], [html`<i>L</i>`, 'insulation thickness', 'm'], [html`<i>q</i><sub>t</sub>`, 'heat gain through the surface', 'kW'], [html`<i>A</i>`, 'surface area', 'm²'], [html`<i>T</i><sub>o</sub>`, 'temperature on the other side', '°C'], [html`<i>T</i><sub>r</sub>`, 'room temperature', '°C']]} />
      <p>Where the floor is set with convection on both faces, V1.25 adds a surface film coefficient of 1.6 W/m²·K on each side:</p>
      <${Eq} no="6.4"><${V} s="U" sub="floor" /> = 1 / (1/1.6 + <${V} s="L" />/<${V} s="k" /> + 1/1.6)<//>
      <p>When the other side is colder than the room, Eq. 6.3 gives a negative value. V1.25 counts it as zero, which errs on the safe side. The actual figure is still shown in brackets in Section 7.</p>

      <h3 class="r-h3">6.3 Infiltration load</h3>
      <p>While a door is open, cold room air spills out at the bottom and warm air comes in at the top. The ASHRAE method (Gosney and Olama) gives the heat carried in by this exchange with the door fully open:</p>
      <${Eq} no="6.5"><${V} s="q" sub="full" /> = 0.221 × <${V} s="A" /> × (<${V} s="h" sub="i" /> − <${V} s="h" sub="r" />) × ρ<sub>r</sub> × (1 − ρ<sub>i</sub>/ρ<sub>r</sub>)<sup>0.5</sup> × (<${V} s="g" /> × <${V} s="H" />)<sup>0.5</sup> × <${V} s="F" sub="m" /><//>
      <${Eq} no="6.6"><${V} s="F" sub="m" /> = [2 / (1 + (ρ<sub>r</sub>/ρ<sub>i</sub>)<sup>1/3</sup>)]<sup>1.5</sup><//>
      <p>The full-open value is then reduced for the time the door actually stands open, for the way air moves through the doorway, and for any strip curtain or air curtain:</p>
      <${Eq} no="6.7"><${V} s="D" sub="t" /> = <${V} s="n" /> × (10 + 60 × θ<sub>o</sub>) / 3600<//>
      <${Eq} no="6.8"><${V} s="q" sub="i" /> = <${V} s="q" sub="full" /> × <${V} s="D" sub="t" /> × <${V} s="D" sub="f" /> × (1 − <${V} s="E" />)<//>
      <${Where} rows=${[[html`<i>q</i><sub>full</sub>`, 'heat gain with the door fully open', 'kW'], [html`<i>A</i>`, 'door area, width × height', 'm²'], [html`<i>h</i><sub>i</sub>, <i>h</i><sub>r</sub>`, 'enthalpy of the incoming air and of the room air', 'kJ/kg'], [html`ρ<sub>i</sub>, ρ<sub>r</sub>`, 'density of the incoming air and of the room air', 'kg/m³'], [html`<i>g</i>`, 'gravitational acceleration, 9.81', 'm/s²'], [html`<i>H</i>`, 'door height', 'm'], [html`<i>F</i><sub>m</sub>`, 'density factor', '-'], [html`<i>D</i><sub>t</sub>`, 'fraction of time the door is open', '-'], [html`<i>n</i>`, 'number of doors of this size', '-'], [html`θ<sub>o</sub>`, 'time the door stands open each hour', 'min'], [html`<i>D</i><sub>f</sub>`, 'doorway flow factor: 1.1 below 11 K temperature difference, 0.8 at 11 K or more', '-'], [html`<i>E</i>`, 'effectiveness of the door protection, V1.25 Table 2', '-']]} />
      <p>The 10 s in Eq. 6.7 is the time for one passage through each door in an hour, as set in V1.25.</p>
      <p>A loading dock door is handled differently, because it seals against the truck and only leaks through the gap around the seal. V1.25 takes a 1 cm gap and an air speed of 0.5 m/s through it:</p>
      <${Eq} no="6.9"><${V} s="A" sub="gap" /> = 2 × <${V} s="H" /> × 0.01 + 2 × (<${V} s="W" /> − 0.01) × 0.01<//>
      <${Eq} no="6.10"><${V} s="q" sub="gap" /> = <${V} s="n" /> × ρ<sub>r</sub> × (<${V} s="A" sub="gap" /> × 0.5 × 3600 / 3600) × (<${V} s="h" sub="i" /> − <${V} s="h" sub="r" />)<//>
      <p>Make-up (fresh) air supplied to the room is a steady flow of outside air:</p>
      <${Eq} no="6.11"><${V} s="q" sub="ma" /> = ρ<sub>r</sub> × (<i>V̇</i> / 3600) × (<${V} s="h" sub="o" /> − <${V} s="h" sub="r" />)<//>
      <${Where} rows=${[[html`<i>W</i>`, 'door width', 'm'], [html`<i>V̇</i>`, 'make-up air flow', 'm³/h'], [html`<i>h</i><sub>o</sub>`, 'enthalpy of the make-up air', 'kJ/kg']]} />

      <h3 class="r-h3">6.4 Product load</h3>
      <p>Product brought in warmer than the room gives up heat as it cools. If it is frozen in the room, it also gives up its latent heat and then cools further below its freezing point. Heat of respiration applies only to fresh fruit and vegetables, which keep producing heat while stored.</p>
      <${Eq} no="6.12"><i>ṁ</i> = <${V} s="m" /> / <${V} s="t" /> × 1000 / 3600<//>
      <${Eq} no="6.13"><${V} s="Q" sub="1" /> = <i>ṁ</i> × <${V} s="c" sub="1" /> × (<${V} s="T" sub="in" /> − <${V} s="T" sub="f" />), or to <${V} s="T" sub="out" /> when the product stays above freezing<//>
      <${Eq} no="6.14"><${V} s="Q" sub="2" /> = <i>ṁ</i> × <${V} s="h" sub="if" /><//>
      <${Eq} no="6.15"><${V} s="Q" sub="3" /> = <i>ṁ</i> × <${V} s="c" sub="2" /> × (<${V} s="T" sub="f" /> − <${V} s="T" sub="out" />)<//>
      <${Eq} no="6.16"><${V} s="Q" sub="4" /> = <${V} s="m" /> × <${V} s="q" sub="resp" /> / 1000<//>
      <${Where} rows=${[[html`<i>ṁ</i>`, 'product flow', 'kg/s'], [html`<i>m</i>`, 'product weight brought in per batch', 't'], [html`<i>t</i>`, 'time to cool the batch', 'h'], [html`<i>c</i><sub>1</sub>, <i>c</i><sub>2</sub>`, 'specific heat above and below freezing', 'kJ/kg·K'], [html`<i>T</i><sub>in</sub>, <i>T</i><sub>out</sub>`, 'product temperature in and out', '°C'], [html`<i>T</i><sub>f</sub>`, 'initial freezing point (−1 °C where the table gives none)', '°C'], [html`<i>h</i><sub>if</sub>`, 'latent heat of fusion', 'kJ/kg'], [html`<i>q</i><sub>resp</sub>`, 'heat of respiration', 'W/t']]} />
      <p>Q<sub>2</sub> and Q<sub>3</sub> apply only when the product crosses or stays below its freezing point. The product load is Q<sub>1</sub> + Q<sub>2</sub> + Q<sub>3</sub> + Q<sub>4</sub>.</p>

      <h3 class="r-h3">6.5 Internal loads</h3>
      <${Eq} no="6.17"><${V} s="q" sub="light" /> = <i>LF</i> × <${V} s="W" /> × <${V} s="L" /> / 1000<//>
      <${Eq} no="6.18"><${V} s="q" sub="people" /> = (272 − 6 × <${V} s="T" sub="r" />) × <${V} s="N" /> / 1000<//>
      <${Eq} no="6.19"><${V} s="q" sub="motor" /> = Σ(<${V} s="P" /> × <${V} s="F" />) + <${V} s="P" sub="FL" /> × <${V} s="F" sub="FL" /><//>
      <${Eq} no="6.20"><${V} s="q" sub="fan" /> = <${V} s="f" sub="fan" /> × (<${V} s="q" sub="t" /> + <${V} s="q" sub="i" /> + <${V} s="Q" sub="product" /> + <${V} s="q" sub="light" /> + <${V} s="q" sub="people" /> + <${V} s="q" sub="motor" />)<//>
      <${Where} rows=${[[html`<i>LF</i>`, 'lighting load for the room type, V1.25 Table 6', 'W/m²'], [html`<i>W</i>, <i>L</i>`, 'room width and length', 'm'], [html`<i>N</i>`, 'number of workers in the room', '-'], [html`<i>P</i>, <i>F</i>`, 'motor power and its use factor, V1.25 Table 8', 'kW, -'], [html`<i>P</i><sub>FL</sub>`, 'forklift power', 'kW'], [html`<i>F</i><sub>FL</sub>`, 'share of the loading time the forklift spends in the room', '-'], [html`<i>f</i><sub>fan</sub>`, 'fan heat as a share of the load, V1.25 Table 5', '-']]} />
      <p>Eq. 6.18 is the heat given off by a person doing moderate work. It rises as the room gets colder, because the body works harder to keep warm. The forklift share F<sub>FL</sub> comes from the travel distance around the room, the lift height and the number of pallet trips per day. When the actual fan motor power is known, it replaces Eq. 6.20.</p>

      <h3 class="r-h3">6.6 Required capacity</h3>
      <${Eq} no="6.21"><${V} s="Q" sub="total" /> = <${V} s="q" sub="t" /> + <${V} s="q" sub="i" /> + <${V} s="Q" sub="product" /> + <${V} s="q" sub="internal" /><//>
      <${Eq} no="6.22"><${V} s="Q" sub="req" /> = <${V} s="Q" sub="total" /> × (1 + <i>SF</i>/100) × 24 / <${V} s="t" sub="run" /><//>
      <${Where} rows=${[[html`<i>SF</i>`, 'safety factor', '%'], [html`<i>t</i><sub>run</sub>`, 'running hours per day', 'h']]} />
      <p>The 24 / t<sub>run</sub> term spreads a full day's heat over the hours the plant actually runs. Tons of refrigeration are kW divided by 3.517.</p>
    </section>

    <section>
      ${S('r-calc', '7', 'Calculations by room')}
      <p>This section works through each room in turn with the equations of Section 6. Values are rounded for display; the totals are carried at full precision.</p>
      ${rows.map((x, i) => html`<${RoomCalc} no=${`7.${i + 1}`} x=${x} project=${project} data=${data} />`)}
    </section>

    <section>
      ${S('r-results', '8', 'Results summary')}
      <p>Table 8.1 gives the load of every room by part and the capacity it needs. Figure 8.1 shows the same split as bars.</p>
      <table class="r-t r-small"><caption>Table 8.1 Heat load by room (kW)</caption>
        <thead><tr><th>Room</th><th class="r">Trans.</th><th class="r">Infil.</th><th class="r">Product</th><th class="r">Internal</th><th class="r">Total</th><th class="r">With SF</th><th class="r">Run h</th><th class="r">Required</th><th class="r">TR</th></tr></thead>
        <tbody>${rows.map((x) => { const r = x.result; return html`<tr><td>${x.room.name}</td><td class="r">${fs(r.transmission.total)}</td><td class="r">${fs(r.infiltration.total)}</td><td class="r">${fs(r.product.total)}</td><td class="r">${fs(r.equipment.total)}</td><td class="r">${fs(r.totals.total)}</td><td class="r">${fs(r.totals.afterSF)}</td><td class="r">${r.totals.runHours ?? 'n/a'}</td><td class="r"><b>${fs(r.totals.required)}</b></td><td class="r">${f(r.totals.required / TR)}</td></tr>`; })}</tbody>
        <tfoot><tr><td>Total</td><td class="r">${f(tot.trans)}</td><td class="r">${f(tot.infil)}</td><td class="r">${f(tot.prod)}</td><td class="r">${f(tot.equip)}</td><td class="r">${f(tot.total)}</td><td></td><td></td><td class="r">${f(tot.req)}</td><td class="r">${f(tot.req / TR)}</td></tr></tfoot></table>
      ${floors.length > 1 && html`<table class="r-t r-narrow"><caption>Table 8.2 Required capacity by floor</caption><thead><tr><th>Building and floor</th><th class="r">Rooms</th><th class="r">kW</th><th class="r">TR</th></tr></thead><tbody>
        ${floors.map(({ b, fl }) => { const fr = rows.filter((x) => x.floor.id === fl.id); const q = fr.reduce((s, x) => s + x.result.totals.required, 0); return fr.length ? html`<tr><td>${b.name}, ${fl.name}</td><td class="r">${fr.length}</td><td class="r">${f(q)}</td><td class="r">${f(q / TR)}</td></tr>` : null; })}</tbody></table>`}
      <figure class="r-fig">
        ${rows.map((x) => { const r = x.result; const max = Math.max(...rows.map((y) => y.result.totals.total), 1); return html`<div class="r-bar"><span class="r-bl">${x.room.name}</span><span class="r-bb">${parts(r).map(([, v], k) => html`<i class=${`c${k}`} style=${`width:${(Math.max(0, v) / max) * 100}%`}></i>`)}</span><span class="r-bv">${f(r.totals.total, 1)}</span></div>`; })}
        <div class="r-legend">${parts(rows[0]?.result || { transmission: {}, infiltration: {}, product: {}, equipment: {} }).map(([p], k) => html`<span><i class=${`c${k}`}></i>${p}</span>`)}</div>
        <figcaption>Figure 8.1 Heat load of each room by part, before safety factor (kW)</figcaption>
      </figure>
      ${tot.extras > 0 && html`<p>Loads outside V1.25 entered for this project add ${f(tot.extras)} kW, which brings the grand total to ${f(tot.req + tot.extras)} kW.</p>`}

      ${S('r-disc', '9', 'Discussion and recommendations')}
      <${Discussion} rows=${rows} tot=${tot} />

      ${S('r-concl', '10', 'Conclusion')}
      <p>The ${n === 1 ? 'room' : `${n} rooms`} of ${project.name} need a total refrigeration capacity of <b>${f(tot.req)} kW (${f(tot.req / TR)} TR)</b>${tot.extras > 0 ? `, or ${f(tot.req + tot.extras)} kW with the loads outside V1.25` : ''}.${largest ? ` The largest single requirement is ${largest.room.name} at ${f(largest.result.totals.required)} kW.` : ''}</p>
      <p>Each evaporator should be selected for at least the required capacity in Table 8.1 at its room design temperature, and each condensing unit for the sum of the rooms it serves. These figures rest on the inputs in Sections 5 and 7. If the product throughput, the door use or the room conditions change, the calculation should be run again before equipment is ordered.</p>
    </section>

    <section>
      ${S('r-appA', 'A', 'Appendix A: Nomenclature')}
      <table class="r-t r-small"><thead><tr><th>Symbol</th><th>Description</th><th>Unit</th></tr></thead><tbody>
        ${NOMEN.map(([s, d, u]) => html`<tr><td><i>${s}</i></td><td>${d}</td><td>${u}</td></tr>`)}</tbody></table>

      ${S('r-appB', 'B', 'Appendix B: Property data used')}
      <table class="r-t r-small"><caption>Table B.1 Moist air at the design points (V1.25 psychrometric tables)</caption><thead><tr><th>Point</th><th class="r">T (°C)</th><th class="r">RH (%)</th><th class="r">h (kJ/kg)</th><th class="r">v (m³/kg)</th><th class="r">ρ (kg/m³)</th></tr></thead><tbody>
        ${outdoorDoor && html`<tr><td>Outdoor air</td><td class="r">${outdoorDoor.Tin}</td><td class="r">${outdoorDoor.RH}</td><td class="r">${f(outdoorDoor.hi)}</td><td class="r">${f(1 / outdoorDoor.rho_i, 4)}</td><td class="r">${f(outdoorDoor.rho_i, 4)}</td></tr>`}
        ${rows.map((x) => { const p = x.result.psychro.room; return p ? html`<tr><td>${x.room.name}</td><td class="r">${x.room.T}</td><td class="r">${x.room.RH}</td><td class="r">${f(p.h)}</td><td class="r">${f(p.v, 4)}</td><td class="r">${f(p.rho, 4)}</td></tr>` : null; })}
      </tbody></table>
      ${usedFoods.length ? html`<table class="r-t r-small"><caption>Table B.2 Product properties (ASHRAE thermal properties of foods, via V1.25 Table 4)</caption><thead><tr><th>Product</th><th class="r">T<sub>f</sub> (°C)</th><th class="r">c<sub>1</sub> (kJ/kg·K)</th><th class="r">c<sub>2</sub> (kJ/kg·K)</th><th class="r">h<sub>if</sub> (kJ/kg)</th></tr></thead><tbody>
          ${usedFoods.map((p) => html`<tr><td>${p.category}: ${p.name}</td><td class="r">${p.tf}</td><td class="r">${p.cA}</td><td class="r">${p.cB}</td><td class="r">${p.latent}</td></tr>`)}</tbody></table>` : html`<p>No product data was needed.</p>`}

      ${S('r-appC', 'C', 'Appendix C: Input checks')}
      <p>The program checks every room for missing or unusual inputs and for places where V1.25 behaves in a way the engineer should know about. The findings are listed below.</p>
      ${checks.length ? html`<table class="r-t r-small"><thead><tr><th>Room</th><th>Level</th><th>Finding</th></tr></thead><tbody>${checks.map((y) => html`<tr><td>${y.room}</td><td>${y.level}</td><td>${String(y.text).replace(/\s*[—–]\s*/g, ': ')}</td></tr>`)}</tbody></table>` : html`<p>No missing or unusual values were found.</p>`}
      ${loadingRooms.length > 0 && html`<p>For the first door on wall 1 of a loading dock, V1.25 takes the width less 0.025 m on one side of the gap instead of 0.01 m (Eq. 6.9). The difference is a few cubic metres per hour and has been kept so the result matches the worksheet (${loadingRooms.map((x) => x.room.name).join(', ')}).</p>`}
    </section>
  </div>`;
}

function RoomCalc({ no, x, project, data }) {
  const { room, result: r } = x;
  const s = r.transmission.surfaces, t = r.totals, e = r.equipment, hr = r.psychro.room;
  const doors = r.infiltration.doors.filter((d) => d.count > 0);
  const prods = r.product.items.filter((p) => p.name);
  const mu = r.infiltration.makeUp;
  const fanEst = !(room.fanMotorKW > 0), isABF = room.roomType === 'Freezer - Trolley';
  const fanPct = data.fanFactor?.[room.roomType] || 0;
  const fanBase = r.transmission.total + r.infiltration.total + r.product.total + e.lighting + e.workers + e.motors;
  const share = parts(r).map(([p, v]) => [p, v, pct(Math.max(0, v), t.total)]).sort((a, b) => b[1] - a[1]);
  const otherSide = (i) => (i < 2 ? (i === 0 ? 'Roof space' : 'Ground') : sideName(project, room.walls[i - 2]));
  const neighbours = room.walls.map((w, i) => (w.source && w.source !== 'outside' ? `wall ${i + 1} backs onto ${sideName(project, w)}` : null)).filter(Boolean);
  const outside = room.walls.map((w, i) => (w.source === 'outside' ? i + 1 : null)).filter(Boolean);
  const area = (room.W || 0) * (room.L || 0), vol = area * (room.H || 0);
  const kgs = (p) => (p.rate || 0) / 3.6;
  const fk = room.forklift?.kW ?? 7;
  let k = 0; const H = (title) => html`<h4 class="r-h4">${no}.${++k} ${title}</h4>`;

  return html`<div class="r-room">
    <h3 class="r-h3 r-roomh" id=${`r-room-${no.split('.')[1]}`}>${no} ${room.name}</h3>
    <p>${room.name} is a ${room.roomType.toLowerCase()} on ${x.floor.name} of ${x.building.name}, held at ${T(room.T)} and ${room.RH ?? 'n/a'} % RH. It is ${f(room.W)} m wide, ${f(room.L)} m long and ${f(room.H)} m high, giving ${f(area)} m² of floor and ${f(vol)} m³ of space.${outside.length ? ` ${outside.length === 1 ? 'Wall' : 'Walls'} ${outside.length === 1 ? outside[0] : `${outside.slice(0, -1).join(', ')} and ${outside[outside.length - 1]}`} ${outside.length === 1 ? 'faces' : 'face'} outside.` : ''}${neighbours.length ? ` Inside the building, ${neighbours.join(', and ')}.` : ''} ${prods.length ? `It takes ${prods.map((p) => `${f(p.ton)} t of ${String(p.name).toLowerCase()} per ${f(p.hours, 0)} h`).join(' and ')}.` : 'No product is cooled in this room.'}</p>
    ${room.notes ? html`<p>Note from the room data: ${room.notes}</p>` : ''}

    ${H('Room air')}
    <p>From the V1.25 tables at ${T(room.T)} and ${room.RH} % RH, h<sub>r</sub> = ${f(hr?.h)} kJ/kg and v = ${f(hr?.v, 4)} m³/kg, so by Eq. 6.1 ρ<sub>r</sub> = 1 / ${f(hr?.v, 4)} = ${f(hr?.rho, 4)} kg/m³.</p>

    ${H('Transmission load')}
    <table class="r-t r-small"><thead><tr><th>Surface</th><th>Other side</th><th>Insulation</th><th class="r">L (mm)</th><th class="r">U (W/m²K)</th><th class="r">A (m²)</th><th class="r">ΔT (K)</th><th class="r">q (kW)</th></tr></thead>
      <tbody>${s.map((q, i) => html`<tr><td>${q.name}</td><td>${otherSide(i)}, ${T(q.Tout)}</td><td>${q.type}</td><td class="r">${q.thickness ?? 'n/a'}</td><td class="r">${f(q.U, 3)}</td><td class="r">${f(q.A)}</td><td class="r">${f(q.dT, 1)}</td><td class="r">${q.raw < 0 ? html`0.00 ${fs(q.raw)}` : f(q.q)}</td></tr>`)}</tbody>
      <tfoot><tr><td colspan="7">Transmission load, q<sub>t</sub></td><td class="r">${f(r.transmission.total)}</td></tr></tfoot></table>
    ${(() => { const c = s[0]; return c && c.U > 0 ? html`<p>Taking the ceiling as an example, by Eq. 6.2 and 6.3:</p>
      <${Sub}>U = ${f(c.k, 3)} / ${f(c.thickness / 1000, 3)} = ${f(c.U, 3)} W/m²·K<//>
      <${Sub}>q = ${f(c.U, 3)} × ${f(c.A)} × (${c.Tout} − (${room.T})) / 1000 = ${f(c.q, 3)} kW<//>
      <p>The other surfaces are worked the same way.${s.some((q) => q.raw < 0) ? ' Surfaces with a colder space behind them would lose heat. They are counted as zero, with the actual value in brackets.' : ''}</p>` : null; })()}

    ${H('Infiltration load')}
    ${doors.length === 0 && !(mu.CMH > 0) ? html`<p>The room has no doors and no make-up air in the data, so there is no infiltration load.</p>` : ''}
    ${doors.map((d) => (d.loading ? html`
      <p>Wall ${d.wall}: ${d.count} loading dock door${d.count > 1 ? 's' : ''}, ${f(d.W)} m × ${f(d.H)} m. Outside the seal the air is at ${T(d.Tin)} and ${d.RH ?? 0} % RH, so h<sub>i</sub> = ${f(d.hi)} kJ/kg. By Eq. 6.9 the gap is ${f(d.gapArea, 3)} m², which lets in ${f(d.gapCMH, 1)} m³/h. By Eq. 6.10:</p>
      <${Sub}>q<sub>gap</sub> = ${d.count} × ${f(d.rho_r, 4)} × (${f(d.gapCMH, 1)} / 3600) × (${f(d.hi)} − ${f(d.h_r)}) = <b>${f(d.q, 3)} kW</b><//>`
      : html`
      <p>Wall ${d.wall}: ${d.count} door${d.count > 1 ? 's' : ''}, ${f(d.W)} m × ${f(d.H)} m (A = ${f(d.A)} m²), open ${d.openMin} min in each hour. The air coming in is at ${T(d.Tin)} and ${d.RH ?? 0} % RH, so h<sub>i</sub> = ${f(d.hi)} kJ/kg and ρ<sub>i</sub> = ${f(d.rho_i, 4)} kg/m³.</p>
      <${Sub}>F<sub>m</sub> = [2 / (1 + (${f(d.rho_r, 4)} / ${f(d.rho_i, 4)})<sup>1/3</sup>)]<sup>1.5</sup> = ${f(d.Fm, 4)}<//>
      <${Sub}>q<sub>full</sub> = 0.221 × ${f(d.A)} × (${f(d.hi)} − ${f(d.h_r)}) × ${f(d.rho_r, 4)} × (1 − ${f(d.rho_i, 4)} / ${f(d.rho_r, 4)})<sup>0.5</sup> × (9.81 × ${f(d.H)})<sup>0.5</sup> × ${f(d.Fm, 4)} = ${f(d.qFull)} kW<//>
      <${Sub}>D<sub>t</sub> = ${d.count} × (10 + 60 × ${d.openMin}) / 3600 = ${f(d.Dt, 4)}<//>
      <${Sub}>D<sub>f</sub> = ${d.Df}, since the temperature difference is ${f(Math.abs((d.Tin ?? 0) - room.T), 0)} K; E = ${d.E}<//>
      <${Sub}>q<sub>i</sub> = ${f(d.qFull)} × ${f(d.Dt, 4)} × ${d.Df} × (1 − ${d.E}) = <b>${f(d.q, 3)} kW</b><//>
      <p>With the door fully open the gain would be ${f(d.qFull, 1)} kW. Limiting the opening time to ${d.openMin} min per hour${d.E > 0 ? ' and the door protection' : ''} bring${d.E > 0 ? '' : 's'} it down to ${f(d.q, 2)} kW.</p>`))}
    ${mu.CMH > 0 && html`<p>Make-up air: ${f(mu.CMH, 0)} m³/h at ${T(mu.T)} and ${mu.RH} % RH, h<sub>o</sub> = ${f(r.psychro.makeUp?.h)} kJ/kg. By Eq. 6.11:</p>
      <${Sub}>q<sub>ma</sub> = ${f(hr?.rho, 4)} × (${f(mu.CMH, 0)} / 3600) × (${f(r.psychro.makeUp?.h)} − ${f(hr?.h)}) = <b>${f(mu.q, 3)} kW</b><//>`}
    ${(doors.length > 0 || mu.CMH > 0) && html`<p>Infiltration load, q<sub>i</sub> = ${f(r.infiltration.total)} kW.</p>`}

    ${H('Product load')}
    ${prods.length === 0 ? html`<p>No product is brought into this room, so the product load is zero.</p>` : prods.map((p) => html`
      <p>Product ${p.idx}, ${p.category.toLowerCase()} (${p.name}): ${f(p.ton)} t brought in at ${T(p.tin)} and cooled to ${T(p.tout)} in ${f(p.hours, 1)} h. Properties from Table B.2: T<sub>f</sub> = ${T(p.tf)}, c<sub>1</sub> = ${p.cA} and c<sub>2</sub> = ${p.cB} kJ/kg·K, h<sub>if</sub> = ${p.latent} kJ/kg.</p>
      <${Sub}>ṁ = ${f(p.ton)} / ${f(p.hours, 1)} × 1000 / 3600 = ${f(kgs(p), 4)} kg/s<//>
      ${p.qa ? html`<${Sub}>Q<sub>1</sub> = ${f(kgs(p), 4)} × ${p.cA} × (${p.tin} − (${p.tout >= p.tf ? p.tout : p.tf})) = ${f(p.qa, 3)} kW<//>` : ''}
      ${p.ql ? html`<${Sub}>Q<sub>2</sub> = ${f(kgs(p), 4)} × ${p.latent} = ${f(p.ql, 3)} kW<//>` : ''}
      ${p.qb ? html`<${Sub}>Q<sub>3</sub> = ${f(kgs(p), 4)} × ${p.cB} × ((${p.tin <= p.tf ? p.tin : p.tf}) − (${p.tout})) = ${f(p.qb, 3)} kW<//>` : ''}
      ${p.qr ? html`<${Sub}>Q<sub>4</sub> = ${f(p.ton)} × ${room.products?.[p.idx - 1]?.respiration ?? 'n/a'} / 1000 = ${f(p.qr, 3)} kW<//>` : ''}
      <p>Product ${p.idx} load = <b>${f(p.q, 3)} kW</b>.${p.ql > 0 && p.ql >= 0.5 * p.q ? ` Freezing accounts for ${pct(p.ql, p.q)} % of it.` : ''}</p>`)}

    ${H('Internal loads')}
    <p>Lighting at ${e.lightingFactor ?? 0} W/m² for a ${room.roomType.toLowerCase()} (Eq. 6.17), ${room.workers || 0} worker${room.workers === 1 ? '' : 's'} (Eq. 6.18) and motors with the forklift (Eq. 6.19):</p>
    <${Sub}>q<sub>light</sub> = ${e.lightingFactor ?? 0} × ${f(room.W)} × ${f(room.L)} / 1000 = ${f(e.lighting, 3)} kW<//>
    <${Sub}>q<sub>people</sub> = (272 − 6 × (${room.T})) × ${room.workers || 0} / 1000 = ${f(e.workers, 3)} kW<//>
    <${Sub}>q<sub>motor</sub> = ${f(Math.max(0, e.motors - fk * e.forkliftFactor), 3)} + ${fk} × ${f(e.forkliftFactor, 4)} = ${f(e.motors, 3)} kW<//>
    ${fanEst ? (isABF
      ? html`<p>The fan motors of a blast freezer are estimated from the worksheet's record of fan power against airflow. The airflow is taken as the longer room side × 20,000 = ${f(Math.max(room.W || 0, room.L || 0) * 20000, 0)} m³/h, and 3 % is added: q<sub>fan</sub> = ${f(e.fan, 3)} kW.</p>`
      : html`<p>The air cooler fan motors are not known yet, so their heat is estimated by Eq. 6.20 with f<sub>fan</sub> = ${fanPct} for this room type:</p><${Sub}>q<sub>fan</sub> = ${fanPct} × ${f(fanBase, 3)} = ${f(e.fan, 3)} kW<//>`)
      : html`<p>The air cooler fan motors are known: q<sub>fan</sub> = ${f(e.fan, 3)} kW.</p>`}
    <p>Internal load = ${f(e.lighting, 3)} + ${f(e.workers, 3)} + ${f(e.motors, 3)} + ${f(e.fan, 3)} = <b>${f(e.total, 3)} kW</b>.</p>

    ${H('Required capacity')}
    <p>By Eq. 6.21 and 6.22, with a ${t.safetyFactor} % safety factor and ${t.runHours} h of running per day:</p>
    <${Sub}>Q<sub>total</sub> = ${f(r.transmission.total)} + ${f(r.infiltration.total)} + ${f(r.product.total)} + ${f(e.total)} = ${f(t.total)} kW<//>
    <${Sub}>Q<sub>req</sub> = ${f(t.total)} × (1 + ${t.safetyFactor}/100) × 24 / ${t.runHours} = <b>${f(t.required)} kW (${f(t.required / TR)} TR)</b><//>
    <p>${share[0][0]} is the largest part of this room's load at ${share[0][2]} %, followed by ${share[1][0].toLowerCase()} at ${share[1][2]} %.</p>
  </div>`;
}

function Discussion({ rows, tot }) {
  const out = [];
  const shares = [['Transmission', tot.trans], ['Infiltration', tot.infil], ['Product', tot.prod], ['Internal load', tot.equip]].sort((a, b) => b[1] - a[1]);
  out.push(html`<p>${shares[0][0]} is the largest part of the project load at ${pct(shares[0][1], tot.total)} % of the total before safety factor. ${shares[1][0]} comes next at ${pct(shares[1][1], tot.total)} %.</p>`);
  const inf = rows.filter((x) => x.result.infiltration.total >= 0.4 * (x.result.totals.total || Infinity));
  if (inf.length) out.push(html`<p>Door infiltration is over 40 % of the load in ${inf.map((x) => `${x.room.name} (${pct(x.result.infiltration.total, x.result.totals.total)} %)`).join(', ')}. Better door protection, such as a strip curtain, an air curtain or a high-speed door, or shorter opening times would bring the required capacity down noticeably. The opening times used here should be confirmed with the operator.</p>`);
  const prod = rows.filter((x) => x.result.product.total >= 0.5 * (x.result.totals.total || Infinity));
  if (prod.length) out.push(html`<p>Product is more than half of the load in ${prod.map((x) => x.room.name).join(', ')}. The required capacity there moves almost in step with the product weight and cooling time, so those two figures should be checked against the production plan.</p>`);
  const neg = rows.filter((x) => x.result.transmission.surfaces.some((s) => s.raw < 0));
  if (neg.length) out.push(html`<p>Some surfaces of ${neg.map((x) => x.room.name).join(', ')} back onto colder rooms. V1.25 counts that heat loss as zero, which leaves a small extra margin.</p>`);
  const conv = rows.filter((x) => (x.room.floor?.convection ?? 'Yes') === 'Yes' && x.result.transmission.surfaces[1]?.q > 0);
  if (conv.length) out.push(html`<p>The floors were calculated with the V1.25 convection option (1.6 W/m²·K on each face). ASHRAE surface coefficients for still air are several times higher, so this setting may understate the floor gain. The floor is a small share of the load here, but it is worth reviewing for rooms with a large floor area.</p>`);
  const errs = rows.filter((x) => (x.warnings || []).some((w) => w.level === 'error'));
  if (errs.length) out.push(html`<p>Data is missing for ${errs.map((x) => x.room.name).join(', ')} (Appendix C). Those results are incomplete and should not be used to select equipment until the data is filled in.</p>`);
  out.push(html`<p>The capacities in this report are net cooling at the evaporator. Condensing units should be selected at the evaporating temperature chosen for each room, with an allowance for the suction line pressure drop.</p>`);
  return html`<div>${out}</div>`;
}

// ---------- @page rules (built here so the running header can carry the project name) ----------
function pageCss(project) {
  const font = `8pt "IBM Plex Sans Thai", Arial, sans-serif`;
  const box = (c) => `content: ${c}; font: ${font}; color: #516174;`;
  return `
@page { size: A4; margin: 20mm 16mm 18mm 18mm;
  @top-left { ${box(`"${cssStr(docNoOf(project))}  Rev ${cssStr(project.revision || 'A')}"`)} vertical-align: bottom; padding-bottom: 4mm; }
  @top-right { ${box(`"${cssStr(project.name)}"`)} vertical-align: bottom; padding-bottom: 4mm; }
  @bottom-left { ${box('"Refrigeration heat load calculation"')} vertical-align: top; padding-top: 4mm; }
  @bottom-right { ${box('"Page " counter(page) " of " counter(pages)')} vertical-align: top; padding-top: 4mm; }
}
@page :first { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
.r-cover { break-after: page; }
.r-front { break-after: page; }
.r-doc > section + section { break-before: page; }
.r-front + section { break-before: auto; }
.r-room { break-before: page; }
.r-h2, .r-h3, .r-h4 { break-after: avoid; }
.r-t, .r-eq, .r-sub, .r-where, .r-fig, .r-sign { break-inside: avoid; }
`;
}

// ---------- page component ----------
export function Report({ project, results, data }) {
  const src = useRef(null), out = useRef(null);
  const [state, setState] = useState('Laying out pages…');
  useEffect(() => {
    let alive = true;
    const prevTitle = document.title;
    document.title = `${docNoOf(project)} ${project.name}`;
    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        const Paged = window.PagedModule;
        if (!Paged?.Previewer) { setState('The page layout module did not load. Reload the page and try again.'); return; }
        const previewer = new Paged.Previewer();
        const flow = await previewer.preview(src.current.innerHTML, [new URL('report.css', location.href).href, { [location.href]: pageCss(project) }], out.current);
        if (alive) setState(`${flow.total} pages`);
      } catch (err) { console.error(err); if (alive) setState(`Layout failed: ${err.message}`); }
    })();
    const onClick = (ev) => { const a = ev.target.closest?.('a[href^="#r-"]'); if (a) { ev.preventDefault(); out.current?.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); } };
    const el = out.current; el.addEventListener('click', onClick);
    return () => {
      alive = false; el.removeEventListener('click', onClick); document.title = prevTitle;
      document.querySelectorAll('style[data-pagedjs-inserted-styles]').forEach((n) => n.remove());
    };
  }, []);
  return html`<div class="report-shell">
    <div class="rtool noprint">
      <a class="btn ghost" href=${`#/p/${project.id}`}>← Back to project</a>
      <button class="btn" id="printpdf" disabled=${!/ pages$/.test(state)} onClick=${() => window.print()}>Save as PDF</button>
      <span class="note" id="reportstate">${state}</span>
      <span class="note">In the print window: Destination <b>Save as PDF</b>, paper <b>A4</b>, margins <b>Default</b>, and untick <b>Headers and footers</b>.</span>
    </div>
    <div ref=${src} class="r-src" aria-hidden="true"><${Body} project=${project} results=${results} data=${data} /></div>
    <div ref=${out} class="r-pages"></div>
  </div>`;
}
