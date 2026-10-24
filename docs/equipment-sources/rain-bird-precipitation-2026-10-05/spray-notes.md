# Rain Bird spray precipitation review

The missing fields have three different causes. The safe fix is to preserve those distinctions.

| Group | Current source data | Safe display/calculation |
|---|---|---|
| HE-VAN, VAN, U-Series, ordinary MPR and FLT | Both square and triangular rates are already present in all 292 rows across 40 models. Rechecked against official tables with no missing or mismatched precipitation cells. | Retain the existing values. A blank result for these models is a lookup/selected-setting issue rather than absent precipitation data. |
| SQ-QTR, SQ-FUL, SQ-3QTR | Twenty-four published no-overlap rates are already stored as `precipNoOverlapMmH`, but the TypeScript row type and calculation ignore the field. | Expose a separate `applicationMmHr` with `applicationBasis: single`, label “without overlap”; square/triangle remain null. |
| SQ-HLF | Both settings contain conflicting source values; the large setting has verified discharge but disputed no-overlap precipitation. | Continue withholding the application rate and depth-based runtime. |
| Six MPR strip models | Official table gives pressure, rectangle width/length and flow; no precipitation columns. | No published square, triangle or alternative layout rate to fill. |
| Four stream bubblers and five 1300/1400 bubblers | Discrete streams or localized flow; no verified uniformly watered footprint or published precipitation rate. | Show flow. A runtime based on water volume can be computed; depth requires an independently specified irrigated area. |

The machine-readable `spray.json` includes all 292 retained square/triangle rows, the 24 safe SQ application rows, eight withheld SQ-HLF source rows, and per-model reasons for the 15 strip/bubbler omissions. `catalogRowPatches` is empty: the usable numeric values already exist. The needed change is reading and displaying the correct field, preserving it in pressure interpolation, and using the appropriate basis for runtime.

## Official references and assumptions

- [HE-VAN performance chart](https://www.rainbird.com/sites/default/files/media/documents/2018-02/chart_HE-VAN.pdf): 64 rows; square and triangular spacing at half the throw diameter, zero wind.
- [VAN performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/van-series-spray-nozzles-performance-charts.pdf): 112 rows; the same spacing convention and zero-wind condition, tested on pop-up bodies.
- [U-Series performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/u-series-spray-nozzles-performance-charts.pdf): 48 rows; radius is recommended spacing, and actual throw along the arc can vary.
- [MPR performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_1.pdf): 60 ordinary plus eight FLT rows have both precipitation columns. Page 3 stream bubblers and page 4 strips do not. The generic square/triangle footnote near the page-4 FLT table does not create missing strip columns.
- [SQ tech spec D42033 10/21](https://www.rainbird.com/sites/default/files/media/documents/2022-01/sq-nozzle-tech-spec-102121-web_1.pdf), page 2, also available as [media/13442](https://www.rainbird.com/media/13442): explicitly labels the rate as without overlap and tests at 6 inches / approximately 0.15 m above grade. [2023 catalog](https://www.rainbird.com/sites/default/files/media/documents/2022-11/d42139_2023_dom_turf_catalog_v3_eng.pdf) repeats the same US values; it provides no correction for HLF.
- [1300/1400 technical specification](https://www.rainbird.com/sites/default/files/media/documents/2021-02/ts_1400_1300af.pdf): localized flow data, no precipitation table. Published spacing must not be treated as a circular wetted radius.

## SQ consistency and limits

SQ-FUL and SQ-3QTR published US no-overlap rates agree within approximately 1% with flow divided by the documented square-based footprint. SQ-QTR is consistently about 3–6.5% higher than arithmetic using the rounded gph and dimensions, while its US and metric precipitation columns agree. It is usable as the explicitly published rate; do not describe it as independently measured or silently replace it with a calculated rate. The reason for that smaller discrepancy is unpublished.

SQ-HLF differs materially: large setting at 30 psi publishes 0.61 in/h, but 10.7 gph over its 4×8-foot footprint gives about 0.536 in/h. At 40–50 psi, the source prints 0.54 in/h against about 0.424 calculated from the same table’s verified flow and footprint. These 14–28% conflicts remain unresolved. Do not enable those rates merely because the flow is verified. The small setting has an additional flow-column conflict.

No-overlap is an application basis, not a second square-grid design rate. For SQ-3QTR retain the already selected complete US pressure grid and exact in/h conversion; do not copy metric rates onto those exact-converted pressure points.

## Runtime

A 10 mm runtime is calculated as `600 / rateMmH` minutes. It is not another missing manufacturer specification. Tie it explicitly to the selected square, triangular, or no-overlap basis. For example, the SQ-FUL large-setting published rate of 13.72 mm/h at 2.8 bar gives approximately 43.7 minutes without overlap.

For strips, `60 × flowLMin / (widthM × lengthM)` would be a calculated single-footprint average, not a manufacturer-published square/triangle value or an actual zone application rate. A zone calculation requires its sprinkler arrangement, count, overlap and irrigated area. Keep this separate from catalog headline specifications.

Checkout was read only; no app files or tests were changed.
