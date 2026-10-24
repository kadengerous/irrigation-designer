# Rain Bird rotor and R-VAN precipitation recheck — 2026-10-05

Read-only audit of seven rotor models and nine R-VAN models: **765 rows and 1,530 precipitation cells**. All 1,504 currently non-null square/triangle cells match the retained official metric tables. The remaining 26 cells, across 13 rows, are existing source conflicts. No newly verified manufacturer cell replacement was found. `rotors.json` contains the complete per-model inventory, exact 13 missing rows, source URLs/pages, raw conflicting numbers, separately calculated approximations and 18 published strip-rate proposals. `rotors-row-checks.json` records every checked row.

Current official sources were reopened on 2026-10-05; existing source extractions in the prior audit directories were compared against all current catalog rows. The current 5000 product page still links the same dedicated chart, and the current 2023 technical specification repeats the disputed #8 values. Searching official Rain Bird metric catalogs did not locate a corrected grid.

## Sources and table assumptions

- [3500 technical specification](https://www.rainbird.com/media/4634), PDF p2: 180° operation, square/triangle spacing at 50% throw diameter, zero wind. All 36 rows have rates.
- [5000 technical specification](https://www.rainbird.com/media/4635), PDF pp3–6: standard and low-angle rotor rates use the same 180° / 50%-diameter basis. Standard #8 cells at 2.0, 2.5, 3.0, 3.5 and 4.0 bar remain conflicted, duplicated across 5004-PC and 5004+PC; PRS #8 cells at 2.0, 2.5 and 3.0 bar remain conflicted in 5004+PCR.
- [5000 MPR chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/5000-series-mpr-nozzle-performance-chart.pdf), PDF pp1–2: rates correspond to each quarter/third/half/full nozzle arc and 50%-diameter spacing. All 120 catalog copies have rates.
- [Falcon 6504 chart](https://www.rainbird.com/media/4170), PDF p2: 180° / 50%-diameter basis. All 120 PC/FC catalog copies have rates. For an actual full-circle rotor, the app's 180/360 adjustment is a calculation, not a second factory table.
- [8005 technical specification](https://www.rainbird.com/media/4636), PDF p2: 180° / 50%-diameter basis. All 79 rows have rates.
- [R-VAN current metric chart](https://www.rainbird.com/sites/default/files/media/documents/2025-10/026579_rb_rvanperformancechartupdate_metric_f.pdf), PDF p2: all 198 rows have both displayed rate columns. Sector models use square and triangular layouts at 50% throw diameter. **LCS, SST and RCS use straight-line spacing with 50% overlap**, so their rates must be presented as strip application rates, not generic square/triangle rates. Published notes also state testing on 10.2 cm pop-ups, zero wind, and that manufacturer data include interpolation/extrapolation.

## Safe UI calculation for the 13 conflicted rotor rows

A separate, clearly labelled approximation is supportable while the manufacturer fields remain null. [Rain Bird's rotor guide](https://www.rainbird.com/media/2428), PDF p2, explicitly gives precipitation equations with the 360/arc factor and runtime = desired depth × 60 / precipitation. Its [metric precipitation equations](https://www.rainbird.com/sites/default/files/media/documents/2020-11/precipitation-rate-equations.pdf), p1, and [design explanation](https://www.rainbird.com/professionals/irrigation-design-tip-sprinkler-spacing-patterns) give the metric units and triangular row spacing.

For verified full-radius flow at the selected pressure, assume head-to-head spacing S = radius:

- Square approximation = 60 × flowLMin × 360 / (arcDeg × S²).
- Triangular approximation = square / (sqrt(3)/2). The manufacturer rounds this geometric factor to 0.866.
- Runtime for 10 mm = 600 / applicationMmHr.

Example: 5004-PC, #8, 2.0 bar, radius 11.8 m, flow 24 L/min, 180° gives **20.6837 / 23.8835 mm/h**, and **29.0083 / 25.1220 minutes** for square/triangle layouts. The conflicting factory row prints 32 / 37 mm/h; the approximation is not a verified correction to that row.

Use the actual selected arc once. Keep calculations separate from raw tables, valid published values and stored project snapshots. Pressure interpolation must remain labelled as such. Do not derive reduced-radius discharge when the manufacturer has not published it; if `computeFlow` returns unknown discharge, no precipitation or runtime fallback should bypass that result. Avoid this sector formula for strips, square patterns, point bubblers or unsupported specialty patterns. These are regular-layout reference values, not measured whole-site precipitation or a distribution-uniformity-corrected irrigation schedule.

## R-VAN strips

At 2.1 / 2.4 / 2.8 / 3.1 / 3.4 / 3.8 bar, all three strip models publish **16 / 14 / 15 / 16 / 16 / 14 mm/h** under their stated straight-line overlap basis. That gives 10 mm reference runtimes **37.5 / 42.8571 / 40 / 37.5 / 37.5 / 42.8571 minutes**. The source has separate pressure-specific dimensions and flow, included in `rotors.json` for each model and row.

The current `computeFlow` explicitly discards all precipitation for `precipBasis === 'strip'`; the resulting missing runtime is an application presentation issue, not missing source data. Add a separate `applicationMmHr` / strip basis output, retaining null square/triangle diagnostics. Do not present square and triangular copies of the same strip rate.

## Integrated rotor body

All seven rotor records describe integrated rotor assemblies with their own inlet and rise. Their right-panel text should describe that existing assembly. A recommendation to add a separate spray body is redundant and may mislead; spray-body selection belongs to interchangeable spray/rotary nozzle models.
