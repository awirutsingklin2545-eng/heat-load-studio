# Heat Load Studio

Refrigeration and air-conditioning heat load calculator.
Installable web app (PWA), works offline, keeps every project on the user's own device.

**Open the app:** https://awirutsingklin2545-eng.github.io/heat-load-studio/

## Status — v0.1 (P0 preview)

| Part | State |
|---|---|
| Calc engine, profile "V1.25 parity" | Done. Matches Load Calculation V1.25 on 64 golden cases (all 8 room types), tolerance 1e-9 |
| Excel export into the V1.25 master | Done. One sheet per room + "App extras"; only input cells written; 15,443 formulas per sheet untouched |
| Master template | Loaded by the user on first run, stored in the browser (IndexedDB). Never uploaded, never in this repo |
| Projects, multi-floor UI, psychro chart, glass/AC, PDF report | Next phases (P1–P6) |

## Privacy

The company template and project data stay on the device. This repository is public, so it contains code only:
`.gitignore` blocks `*.xlsx` and extracted data tables.

## Tests

```bash
npm install
npm test                                   # CI-safe unit tests
python3 tools/extract.py MASTER.xlsx src/data/v125.json
python3 tools/golden.py MASTER.xlsx /tmp/golden 64       # needs LibreOffice
HLS_MASTER=MASTER.xlsx npm test            # + 64 parity cases
```

## Calculation references
ASHRAE Handbook—Fundamentals 2025, ASHRAE Handbook—Refrigeration 2026, ANSI/ASHRAE 55-2023, 62.1-2025, 90.1-2025;
Load Calculation V1.25.
