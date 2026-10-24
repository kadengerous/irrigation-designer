# Rain Bird R-VAN and compatibility audit — 2026-10-10

Scope: all nine active R-VAN models, both stored hydraulic datasets, and the current Rain Bird group membership. This audit changes evidence files only. Runtime selection, placement and simulation changes belong to the integrating task.

## Result and recommended changes

All **198 published metric rows** match both `src/data/rain-bird-rvan-performance.json` and `src/data/equipment/rain-bird-rvan.json`: **396 row-copy comparisons, zero hydraulic differences**. Pressure, sector where published, throw/dimensions, flow, square precipitation and triangular precipitation were compared. All **18 strip width × length rows** also match the canonical `stripPerformance` data. The SI derivatives in the canonical records agree with the same source rows. No hydraulic table replacement is proposed. See `rvan-row-comparison.json` and the independently transcribed `rvan-official-metric-reference.json`.

`rvan-recommended-patches.json` proposes explicit absolute radius floors for six sector models, nominal strip-length corrections for three models, and verification-date updates in both files. It separately identifies corner-strip angular normalization as a geometric inference. `rvan-model-coverage.json` records the complete nine-model coverage and remaining source limits.

## Sector limits and pressure-specific geometry

The [current product page](https://www.rainbird.com/products/r-van-rotary-nozzles) and [metric technical specification D41159B](https://www.rainbird.com/media/5918) identify adjustable sectors as **45–270°** and separate full-circle models as **360°**. There is no supported 271–359° bridge. All models operate at **2.1–3.8 bar**, with **3.1 bar recommended**.

| Models | Published rows | Reduced-radius floor | Full throw at 2.1 / 2.4 / 2.8 / 3.1 / 3.4 / 3.8 bar, m |
| --- | ---: | ---: | --- |
| R-VAN14 / R-VAN14-360 | 54 / 6 | 2.4 m | 4.0 / 4.0 / 4.3 / 4.3 / 4.6 / 4.6 |
| R-VAN18 / R-VAN18-360 | 54 / 6 | 4.0 m | 4.9 / 4.9 / 5.2 / 5.2 / 5.5 / 5.5 |
| R-VAN24 / R-VAN24-360 | 54 / 6 | 5.2 m | 5.8 / 6.1 / 6.7 / 7.0 / 7.3 / 7.3 |

These are absolute minimum radii, not a universal reduction percentage. Add `radiusAdjustment.minimumRadiusM` without changing `minimumRatio: 0`. The upper limit must come from the selected-pressure row, rather than the series-wide maximum. For example, R-VAN24 at 2.1 bar reaches 5.8 m, not 7.3 m. Do not extend the pressure table beyond its endpoints. The [metric chart](https://www.rainbird.com/sites/default/files/media/documents/2025-10/026579_rb_rvanperformancechartupdate_metric_f.pdf) supplies nine adjustable-sector samples, including 45° and 60°; interpolation between supported sectors is different from extrapolation below 45°.

The performance chart's minimum-radius footnote misnames R-VAN18-360 in the 2.4 m sentence. The technical specification explicitly associates **R-VAN14-360** with 2.4 m and **R-VAN18-360** with 4.0 m. The [US technical specification](https://www.rainbird.com/media/5917) corroborates the respective 8 / 13 / 17 ft limits. This is a source typo, not a reason to lower R-VAN18-360 to 2.4 m.

The [official store](https://store.rainbird.com/sprinklers/rotary-nozzles.html?product_list_mode=list) describes precipitation matching across radius, arc and pattern. However, no quantitative reduced-radius flow curve was found. Preserve `flowPolicy: "unknown"`; do not label a derived flow or a reduced-radius 10 mm watering time as manufacturer-published data. Native-table time for 10 mm is a derived quantity, `600 / precipitationMmH` minutes, with the table's spacing assumptions retained.

## Strip geometry

| Model | Rows | Nominal rectangle at 3.1 bar | Current rNom → proposed |
| --- | ---: | --- | --- |
| R-VAN-SST | 6 | 1.5 × 9.1 m, origin at middle of long edge | 9.8 → 9.1 m |
| R-VAN-LCS | 6 | 1.5 × 4.6 m, left corner pattern | 4.9 → 4.6 m |
| R-VAN-RCS | 6 | 1.5 × 4.6 m, right corner pattern | 4.9 → 4.6 m |

The current pressure-dependent rectangles and their offsets are correct. Current `rNom` values instead use the 3.8 bar maximum-pressure length; align that metadata with the 3.1 bar nominal dimensions. A strip's scalar length is a catalog proxy, not its circular spray radius. Its width also varies with pressure, so geometry must read both dimensions.

Official sources identify LCS/RCS as corner strips without printing a numeric sector angle. Their corner-origin rectangles occupy one quadrant. Changing internal `arcMin`, `arcMax` and row arc tags from 180° to 90° is therefore a defensible **geometric normalization**, not a newly discovered manufacturer-specified circular arc. Preserve the rectangular simulation and published flow unchanged. SST retains its half-plane 180° envelope. Keep all three out of radius-and-sector automatic placement.

The strip chart's two precipitation columns describe straight-line and triangular arrangements with 50% overlap. They are not generic circular square/triangle calculations. Do not infer universal same-zone matching from the identical column values. The technical specification illustrates strip size adjustment, but supplies no numeric lower bound or independent width/length adjustment law; no new strip-reduction rule is proposed.

## Colors, bodies and source limits

The [official catalog color bands](https://www.rainbird.com/sites/default/files/media/documents/2022-02/d41409_2022_intl_turf_catalog_v6.pdf) associate R-VAN14 with blue, R-VAN18 with tan and R-VAN24 with magenta. The current [metric specification illustrations](https://www.rainbird.com/sites/default/files/media/documents/2025-10/026549_rb_rvantechspecsheet_metric_f.pdf) agree on the blue/tan/dark-red families and show gray/black strips. Keep the current colors. Exact hex values are application approximations; the individual LCS light-gray / RCS dark-gray / SST black assignments were not independently pixel-verified in this audit. No precise official color-standard claim is made.

Current body exclusions are supported by the official store: 1804/1806/1812 and risers/adapters are listed, while 1802/1803 are explicitly excluded. Retain those exclusions, including short PRS variants. The technical specification recommends 1800 or RD1800 with 45 psi regulation. A regulated body must not increase inadequate available pressure. Multiple water-stream trajectories span 4–34°; keeping the single `trajectoryDeg` field null is more accurate than inventing one angle.

The metric chart is the numeric canonical source. Current US documents were used to corroborate limits and patterns, not exhaustively re-compared row by row. Metric/US rounding differences alone are not errors. No browser UI verification, source-page download through shell commands, or catalog mutation was performed.

## Rain Bird compatibility groups

Read-only inventory: **70 active models**, 72 group entries, no unassigned model and no duplicate model/nozzle configuration. The two extra entries arise because 5004-PC and 5004+PC expose disjoint ordinary and MPR nozzle sets. See `rvan-group-coverage.json` for every model and nozzle.

| Top-level group | Current entries / nozzle configurations | Contents and matching condition |
| --- | ---: | --- |
| Rotary MPR | 11 / 33 | Nine R-VAN models plus the two 5000 bodies' MPR configurations. Strips remain manual and layout-dependent. |
| Spray MPR | 42 / 42 | HE-VAN, U-Series, fixed MPR, MPR strips, and 12/15/18-VAN. Strip layouts require their own overlap check. |
| VAN 4–10 | 4 / 4 | 4/6/8/10-VAN. Same tab does not establish universal matching; evaluate actual pressure, sector and precipitation. |
| SQ Series | 4 / 8 | Square-pattern products and their two throw options; use square geometry and edge-to-edge layout. |
| Rotors | 7 / 70 | Ordinary 3500/5000/5000 Plus/5000 Plus PRS/Falcon 6504/8005 configurations. No blanket matched-family promise. |
| Bubblers | 4 / 4 | 1300 and 1400 localized watering; choose by plant demand and emitter flow rather than sector precipitation. |

The [5000 MPR source](https://www.rainbird.com/media/4173) explicitly permits same-zone use with R-VAN. Its quarter, third, half and full racks correspond to **90 / 120 / 180 / 360°**. Match the installed rotor arc to the chosen nozzle design arc; do not proportionally scale a fixed rotor nozzle's flow when its arc changes. The 5000 PRS catalog configuration has no verified MPR rack here and correctly remains outside this automatic MPR subset. The published precipitation rates are nominally matched, not numerically identical in every row.

The [HE-VAN page](https://www.rainbird.com/products/he-van-high-efficiency-variable-arc-nozzles) confirms compatibility with U-Series and MPR. The [VAN page](https://www.rainbird.com/products/van-series-variable-arc-nozzles) extends that claim specifically to 12/15/18-VAN, not 4/6/8/10. These statements support the existing split. The [MPR strip performance sheet](https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_1.pdf) publishes dimensions and flow, without a strip precipitation table; calculated strip precipitation must not be presented as the manufacturer's circular MPR class.

The [SQ product description](https://www.rainbird.com/products/sq-series-square-pattern-nozzles) specifies square coverage and edge-to-edge installation. The [1300/1400 specification](https://www.rainbird.com/sites/default/files/media/documents/2021-02/ts_1400_1300af.pdf) describes watering trees, shrubs and flowers with trickle/umbrella patterns. Their separate layout/localized groups remain appropriate.

Current runtime safeguards agree with these conditions: `matchedPrecipitationClass` excludes strip/square/point/stream coverage, and rotor MPR classification requires the exact design arc. The declared MPR class is used at recommended pressure; otherwise actual supported hydraulic data determine compatibility. Automatic selection remains scoped to the top-level group, and inner series choices only control browsing. No group reassignment is proposed.
