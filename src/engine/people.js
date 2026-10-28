// Heat given off by a person, split into sensible and latent, from the PMV heat balance of
// ISO 7730 / ANSI/ASHRAE Standard 55-2023 (Fanger) at the room condition. Used for air-conditioned
// rooms in the ASHRAE profile. Body surface 1.8 m² (average adult), mean radiant = air temperature.
export function occupantGain(met, clo, ta, rh, { vel = 0.1, area = 1.8 } = {}) {
  const tr = ta;
  const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235));
  const icl = 0.155 * clo, m = met * 58.15, mw = m;
  const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(vel);
  const taa = ta + 273, tra = tr + 273;
  let tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);
  const p1 = icl * fcl, p2 = p1 * 3.96, p3 = p1 * 100, p4 = p1 * taa, p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;
  let xn = tcla / 100, xf = tcla / 50, hc = hcf, n = 0;
  while (Math.abs(xn - xf) > 0.00015 && n++ < 150) {
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25;
    hc = hcf > hcn ? hcf : hcn;
    xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc);
  }
  const tcl = 100 * xn - 273;
  const diff = 3.05e-3 * (5733 - 6.99 * mw - pa);            // skin diffusion
  const sweat = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;         // comfort sweating
  const latResp = 1.7e-5 * m * (5867 - pa);                    // latent respiration
  const dryResp = 0.0014 * m * (34 - ta);                       // sensible respiration
  const radi = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4);
  const conv = fcl * hc * (tcl - ta);
  const latent = Math.max(0, diff + sweat + latResp) * area;
  const sensible = Math.max(0, m * area - latent);              // total heat = metabolic rate at steady state
  const radiantFraction = radi > 0 ? radi / Math.max(1e-9, radi + conv + dryResp) : 0;
  return { total: m * area, sensible, latent, radiantFraction };
}
