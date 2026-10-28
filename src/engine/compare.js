// V1.25 versus ASHRAE, room by room: the same inputs through both engines, with the reasons for
// each difference worked out from the two results (not a fixed text).
const n0 = (x) => (Number.isFinite(x) ? x : 0);

export function compareRoom(room, v, a) {
  if (!v || !a) return null;
  const rows = [], reasons = [];
  const pct = (x, y) => (y ? ((x - y) / Math.abs(y)) * 100 : 0);
  if (a.kind === 'refrigeration') {
    const vInternal = v.equipment.lighting + v.equipment.workers + v.equipment.motors;
    rows.push(['Transmission', v.transmission.total, a.transmission.total]);
    rows.push(['Infiltration', v.infiltration.total, a.infiltration.total]);
    rows.push(['Product', v.product.total, a.product.total]);
    rows.push(['Lights, people, motors', vInternal, a.internal.total]);
    rows.push(['Evaporator fans', v.equipment.fan, a.equipRelated.fan]);
    rows.push(['Defrost', 0, a.equipRelated.defrost]);
    rows.push(['Total before safety factor', v.totals.total, a.totals.total]);
    // reasons, largest first
    const sun = a.transmission.surfaces.reduce((s, x) => s + (x.sun > 0 ? (x.U * x.A * x.sun) / 1000 : 0), 0);
    if (sun > 0.005) reasons.push([sun, `Sun effect on outside walls and roof adds ${sun.toFixed(2)} kW. V1.25 uses the plain outdoor temperature.`]);
    const film = a.transmission.total - sun - v.transmission.total;
    if (Math.abs(film) > 0.005) reasons.push([film, `Surface films (and the ground resistance under the floor) change U${a.transmission.surfaces[1] && v.transmission.surfaces[1] ? `; floor U ${v.transmission.surfaces[1].U.toFixed(3)} → ${a.transmission.surfaces[1].U.toFixed(3)} W/m²K` : ''}: ${signed(film)} kW.`]);
    const vd = v.infiltration.doors.filter((d) => d.count > 0), ad = a.infiltration.doors;
    const dDoor = ad.reduce((s, d) => s + d.q, 0) - vd.reduce((s, d) => s + d.q, 0);
    if (Math.abs(dDoor) > 0.005) {
      const ex = ad.find((d) => !d.loading);
      reasons.push([dDoor, ex ? `Door open-time factor uses ${ex.P} passage(s) × ${ex.thetaP} s plus ${ex.openMin} min standing open per hour; V1.25 fixes 10 s per door. Air enthalpy and density come from the ASHRAE equations at site pressure, with density of moist air (1 + W)/v where V1.25 uses 1/v. Doors: ${signed(dDoor)} kW.`
        : `Dock door gap: the same 1 cm gap on both sides (V1.25 uses W − 0.025 m on wall 1 door 1). Doors: ${signed(dDoor)} kW.`]);
    }
    const dMU = a.infiltration.makeUp.q - v.infiltration.makeUp.q;
    if (Math.abs(dMU) > 0.005) reasons.push([dMU, `Make-up air mass flow uses the density of the incoming air (V1.25 uses room air density): ${signed(dMU)} kW.`]);
    const dP = a.product.total - v.product.total;
    if (Math.abs(dP) > 0.005) reasons.push([dP, `Product: consistent freezing-point tests and −2 °C where no freezing point is listed: ${signed(dP)} kW.`]);
    const dI = a.internal.total - vInternal;
    if (Math.abs(dI) > 0.005) reasons.push([dI, `Lights and people use the entered hours per day${a.internal.perPerson !== (272 - 6 * n0(room.T)) ? ' and the 1.25 factor for frequent entry' : ''}: ${signed(dI)} kW.`]);
    const dF = a.equipRelated.fan - v.equipment.fan;
    if (Math.abs(dF) > 0.005) reasons.push([dF, `Fan heat follows the fan running hours or a load that now includes defrost and film changes: ${signed(dF)} kW.`]);
    if (a.equipRelated.defrost > 0.005) reasons.push([a.equipRelated.defrost, `Defrost heat is added (${a.equipRelated.defrostBasis}). V1.25 has no defrost load.`]);
    const sfV = v.totals.total * v.totals.safetyFactor / 100, sfA = a.totals.segments * a.totals.safetyFactor / 100;
    if (Math.abs(sfA - sfV) > 0.005) reasons.push([sfA - sfV, `Safety factor: ${a.totals.safetyFactor} % on the four load segments only (ASHRAE) instead of ${v.totals.safetyFactor} % on everything (V1.25): ${signed(sfA - sfV)} kW.`]);
    if (a.totals.runHours !== v.totals.runHours) reasons.push([0, `Running time ${a.totals.runHours} h/day instead of ${v.totals.runHours} h/day.`]);
  } else {
    rows.push(['Envelope conduction', v.transmission.total, a.parts[0][2]]);
    rows.push(['Window solar', 0, a.parts[1][2]]);
    rows.push(['Infiltration + outdoor air', v.infiltration.total, a.parts[2][2]]);
    rows.push(['People, lights, equipment', v.equipment.total - v.equipment.fan, a.parts[3][2]]);
    rows.push(['Fan (V1.25 estimate)', v.equipment.fan, 0]);
    rows.push(['Total before safety factor', v.totals.total, a.totals.total]);
    reasons.push([0, `V1.25 sizes an air-conditioned room with the cold-room method: one steady condition, no sun on walls or glass, no latent heat from people, no outdoor air for ventilation, a fan allowance as a share of load, ${v.totals.safetyFactor} % safety factor.`]);
    reasons.push([0, `ASHRAE RTS works hour by hour on the design day: peak coil load in ${MONTHS[a.peak.month - 1]} at ${a.peak.hour}:00, outdoor ${a.peak.To.toFixed(1)} °C. Room sensible ${(a.peak.roomS / 1000).toFixed(2)} kW, latent ${(a.peak.roomL / 1000).toFixed(2)} kW (SHR ${a.peak.SHR.toFixed(2)}), outdoor air ${((a.peak.ventS + a.peak.ventL) / 1000).toFixed(2)} kW.`]);
    if (a.parts[1][2] > 0.005) reasons.push([a.parts[1][2], `Solar gain through windows: ${a.parts[1][2].toFixed(2)} kW at the peak hour.`]);
  }
  rows.push(['Required capacity', v.totals.required, a.totals.required]);
  return {
    rows: rows.map(([label, x, y]) => ({ label, v125: x, ashrae: y, delta: y - x })),
    reasons: reasons.sort((p, q) => Math.abs(q[0]) - Math.abs(p[0])).map((r) => r[1]),
    v125: v.totals.required, ashrae: a.totals.required, delta: a.totals.required - v.totals.required, pct: pct(a.totals.required, v.totals.required),
  };
}
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
