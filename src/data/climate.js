// ASHRAE climatic design conditions used by the ASHRAE profile.
// Source: 2025 ASHRAE Handbook—Fundamentals (SI), Chapter 14 climatic design data, as published per
// station on ashrae-meteo.info (read 2026-10-28). Monthly values are Jan..Dec.
export const STATIONS = {
  '484560': {
    name: 'Bangkok Don Mueang Intl, Thailand', wmo: '484560', edition: '2025 ASHRAE Handbook—Fundamentals', period: '1999–2023',
    lat: 13.913, lon: 100.607, elev: 3, stdP: 101.29, tz: 7,
    cooling: {
      db04: 37.1, mcwb04: 26.5, db1: 36.3, mcwb1: 26.6, db2: 35.5, mcwb2: 26.5,
      wb04: 29.4, mcdb_wb04: 33.6, dp04: 28.4, hr04: 24.8, mcdb_dp04: 31.8, enth04: 96.3, mcdb_enth04: 33.5,
      hottestMonth: 4, hottestRange: 8.6,
    },
    monthly: {
      db04: [34.4, 35.9, 37.3, 38.4, 38.1, 36.4, 35.7, 35.5, 35.2, 35.0, 35.1, 34.4],
      mcwb04: [24.4, 25.4, 25.1, 25.8, 26.8, 26.3, 26.8, 26.8, 26.9, 26.1, 25.6, 25.0],
      db2: [33.5, 34.8, 36.3, 37.2, 36.7, 35.3, 34.7, 34.5, 34.2, 33.9, 33.9, 33.4],
      mcwb2: [24.2, 25.2, 25.9, 26.6, 26.9, 26.6, 26.7, 26.7, 26.7, 26.0, 25.6, 24.6],
      mdbr: [8.8, 8.9, 8.5, 8.6, 7.8, 7.4, 7.0, 7.1, 7.2, 6.8, 7.3, 8.2],
      mcdbr5: [9.3, 9.5, 9.4, 9.2, 8.7, 8.3, 7.8, 7.9, 8.2, 7.7, 7.9, 8.4],
      mcwbr5: [3.2, 3.2, 3.2, 3.4, 3.0, 3.0, 2.9, 2.9, 3.2, 2.8, 2.9, 2.7],
      taub: [0.526, 0.630, 0.680, 0.611, 0.515, 0.463, 0.457, 0.458, 0.467, 0.534, 0.490, 0.480],
      taud: [2.017, 1.743, 1.662, 1.842, 2.133, 2.307, 2.328, 2.315, 2.280, 2.068, 2.189, 2.168],
      ebnNoon: [769, 706, 684, 732, 792, 826, 833, 841, 839, 774, 797, 800],
      ednNoon: [169, 231, 256, 214, 157, 130, 128, 131, 136, 165, 142, 143],
    },
  },
};
export const DEFAULT_STATION = '484560';
