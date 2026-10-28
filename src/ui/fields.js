// Small form components shared by the editors.
import { h } from 'preact';
import htm from 'htm';
export const html = htm.bind(h);

let seq = 0;
const nid = (p) => `${p}-${++seq}`;
const toNum = (s) => { if (s === '' || s == null) return null; const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : undefined; };

// Number field: empty -> null; keeps the user's text while typing.
export function Num({ label, value, onChange, unit, hint, min, max, step = 'any', id, placeholder, width }) {
  const fid = id || nid('n');
  const bad = value != null && ((min != null && value < min) || (max != null && value > max));
  return html`<label class="fld ${bad ? 'bad' : ''}" for=${fid} style=${width ? `--w:${width}` : ''}>
    <span class="lab">${label}</span>
    <span class="inp"><input id=${fid} aria-label=${label} type="text" inputmode="decimal" autocomplete="off" placeholder=${placeholder ?? ''}
      value=${value ?? ''} onChange=${(e) => { const n = toNum(e.target.value); if (n !== undefined) onChange(n); else e.target.value = value ?? ''; }} />
      ${unit && html`<span class="unit">${unit}</span>`}</span>
    ${hint && html`<span class="hint">${hint}</span>`}
  </label>`;
}
export function Txt({ label, value, onChange, id, placeholder, hint }) {
  const fid = id || nid('t');
  return html`<label class="fld wide" for=${fid}><span class="lab">${label}</span>
    <span class="inp"><input id=${fid} aria-label=${label} type="text" value=${value ?? ''} placeholder=${placeholder ?? ''} onChange=${(e) => onChange(e.target.value)} /></span>
    ${hint && html`<span class="hint">${hint}</span>`}</label>`;
}
// Select: options = [value] | [{value,label}]
export function Sel({ label, value, onChange, options, id, hint, allowEmpty, emptyLabel = '—', width }) {
  const fid = id || nid('s');
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const enc = (v) => (v === null || v === undefined ? '' : JSON.stringify(v));
  return html`<label class="fld" for=${fid} style=${width ? `--w:${width}` : ''}><span class="lab">${label}</span>
    <span class="inp"><select id=${fid} aria-label=${label} value=${enc(value)} onChange=${(e) => onChange(e.target.value === '' ? null : JSON.parse(e.target.value))}>
      ${allowEmpty && html`<option value="">${emptyLabel}</option>`}
      ${opts.map((o) => html`<option value=${enc(o.value)}>${o.label}</option>`)}
    </select></span>
    ${hint && html`<span class="hint">${hint}</span>`}</label>`;
}
export const kW = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
