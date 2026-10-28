// Solar geometry, ASHRAE clear-sky model and design-day temperatures.
// ASHRAE Handbook—Fundamentals (2025), Chapter 14 Climatic Design Information (clear-sky model with
// taub/taud, air mass, equation of time, declination) and Chapter 18 (sol-air temperature).
const RAD = Math.PI / 180;
export const E_SC = 1361; // W/m². Reproduces the 2025 station values of Ebn/Edn at noon to ±1 W/m² (1367 gives +3 W/m²)

export const dayOfYear21 = (m) => [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355][m - 1];

export function extraterrestrial(n) { return E_SC * (1 + 0.033 * Math.cos(RAD * (360 * (n - 3)) / 365)); }
export function declination(n) { return 23.45 * Math.sin(RAD * (360 * (n + 284)) / 365); }
export function equationOfTime(n) { // minutes
  const G = RAD * (360 * (n - 1)) / 365;
  return 2.2918 * (0.0075 + 0.1868 * Math.cos(G) - 3.2077 * Math.sin(G) - 1.4615 * Math.cos(2 * G) - 4.089 * Math.sin(2 * G));
}

// Sun position at local standard time (hours, 0..24); lon east positive, tz in hours east of UTC.
export function sunPosition(n, lst, lat, lon, tz) {
  const ast = lst + equationOfTime(n) / 60 + (lon - 15 * tz) / 15;
  const H = 15 * (ast - 12);
  const d = declination(n);
  const sb = Math.cos(lat * RAD) * Math.cos(d * RAD) * Math.cos(H * RAD) + Math.sin(lat * RAD) * Math.sin(d * RAD);
  const beta = Math.asin(Math.max(-1, Math.min(1, sb))) / RAD;
  // azimuth from south, positive west (ASHRAE convention φ)
  const cphi = (Math.sin(beta * RAD) * Math.sin(lat * RAD) - Math.sin(d * RAD)) / (Math.cos(beta * RAD) * Math.cos(lat * RAD));
  let phi = Math.acos(Math.max(-1, Math.min(1, cphi))) / RAD;
  if (H < 0) phi = -phi;
  return { beta, phi, H, ast, decl: d };
}

// ASHRAE clear-sky beam normal and diffuse horizontal irradiance (W/m²)
export function clearSky(n, beta, taub, taud) {
  if (beta <= 0) return { Eb: 0, Ed: 0 };
  const m = 1 / (Math.sin(beta * RAD) + 0.50572 * (6.07995 + beta) ** -1.6364);
  const ab = 1.454 - 0.406 * taub - 0.268 * taud + 0.021 * taub * taud;
  const ad = 0.507 + 0.205 * taub - 0.080 * taud - 0.190 * taub * taud;
  const E0 = extraterrestrial(n);
  return { Eb: E0 * Math.exp(-taub * m ** ab), Ed: E0 * Math.exp(-taud * m ** ad), m };
}

// Irradiance on a surface. tilt Σ (0 = horizontal roof, 90 = wall), surface azimuth ψ from south, + west.
// Returns beam, diffuse, reflected, total and the incidence angle θ (deg).
export function onSurface(sun, sky, tilt, psi, rhoG = 0.2) {
  const { beta, phi } = sun;
  if (beta <= 0) return { Eb: 0, Ed: 0, Er: 0, Et: 0, theta: 90 };
  const gamma = phi - psi;
  const cth = Math.cos(beta * RAD) * Math.cos(gamma * RAD) * Math.sin(tilt * RAD) + Math.sin(beta * RAD) * Math.cos(tilt * RAD);
  const Eb = Math.max(0, cth) * sky.Eb;
  let Ed;
  if (Math.abs(tilt - 90) < 1e-6) {
    const Y = Math.max(0.45, 0.55 + 0.437 * cth + 0.313 * cth * cth);
    Ed = sky.Ed * Y;
  } else {
    const Y = Math.max(0.45, 0.55 + 0.437 * cth + 0.313 * cth * cth);
    Ed = tilt <= 90 ? sky.Ed * (Y * Math.sin(tilt * RAD) + Math.cos(tilt * RAD)) : sky.Ed * Y * Math.sin(tilt * RAD);
  }
  const Er = (sky.Eb * Math.sin(beta * RAD) + sky.Ed) * rhoG * (1 - Math.cos(tilt * RAD)) / 2;
  return { Eb, Ed, Er, Et: Eb + Ed + Er, theta: Math.acos(Math.max(-1, Math.min(1, cth))) / RAD };
}

// Fraction of daily range below the peak, hour 1..24 (ASHRAE Fundamentals Ch. 14, design day profile)
export const DAILY_FRACTION = [0.87, 0.92, 0.96, 0.99, 1.00, 0.98, 0.93, 0.84, 0.71, 0.56, 0.39, 0.23, 0.11, 0.03, 0.00, 0.03, 0.10, 0.21, 0.34, 0.47, 0.58, 0.68, 0.76, 0.82];
export const hourlyDB = (db, range) => DAILY_FRACTION.map((f) => db - f * range);

// Orientation names to surface azimuth ψ (from south, + toward west)
export const ORIENT = { S: 0, SW: 45, W: 90, NW: 135, N: 180, NE: -135, E: -90, SE: -45 };

// Sol-air temperature (Ch. 18): te = to + α/ho·Et − εΔR/ho. α/ho 0.026 light, 0.052 dark (m²·K/W);
// εΔR/ho = 3.9 K for horizontal surfaces, 0 for vertical.
export const ALPHA_HO = { light: 0.026, medium: 0.039, dark: 0.052 };
export const solAir = (to, Et, colour, horizontal) => to + (ALPHA_HO[colour] ?? 0.052) * Et - (horizontal ? 3.9 : 0);
