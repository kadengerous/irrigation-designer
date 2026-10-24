# Hunter MP audit — 2026-10-10

## Scope and decision

Reviewed all **19 active MP items in the application: 16 sector models and 3 strip models**, covering **222 application performance rows**. The companion reference fixture contains 198 distinct manufacturer rows in each unit system; 210° design rows are shared by adjacent adjustable SKU variants.

**All 222 existing rows agree with the current official US tables**, converted to SI: radius, flow, flow in m³/h, both precipitation columns, and the MP800SR minimum radius/minimum flow. Numerical comparison tolerance: 0.000001 in stored SI values. Keep those tables together. Metric website values differ, sometimes materially; they are alternative official datasets, not proof that the US import is wrong.

Two confirmed catalog corrections: **MP-LCS-515 and MP-RCS-515 are fixed 90° corner strips, not 180°**. This changes display metadata and their performance-row arc tag; their shape remains rectangular. MP-SS-530 remains 180°. See the [official adjustment instructions](https://www.hunterirrigation.com/support/mp-rotatorr-nozzle-adjustment).

No application code or catalog was changed by this audit.

## Files

- `mp-official-performance-reference.json`: complete current official US and metric factual tables, source URLs and source caveats.
- `mp-model-coverage.json`: every active model, mechanical sector bounds, published design arcs, pressure grids and every pressure/arc-specific radius bound.
- `mp-recommended-patches.json`: exact old/new confirmed metadata patches; optional trajectory documentation; audit-date updates; shared radius-policy recommendation.
- `mp-metric-us-differences.json`: every application row compared with its metric alternative. These entries are **not approved replacements**.

## Complete model coverage

All rows use the existing coherent US-derived pressure grid **2.1 / 2.4 / 2.8 / 3.1 / 3.4 / 3.8 bar** (30 / 35 / 40 / 45 / 50 / 55 psi). Recommended pressure is 2.8 bar. Marketing radius ranges are descriptive; operating bounds depend on pressure and sector.

| Active item | Verified mechanical sector | Published design arcs | App rows | Audit disposition |
|---|---:|---|---:|---|
| MP1000-90 | 90–210° | 90, 180, 210 | 18 | Keep hydraulic table |
| MP1000-210 | 210–270° | 210, 270 | 12 | Keep hydraulic table |
| MP1000-360 | 360° fixed | 360 | 6 | Keep hydraulic table |
| MP2000-90 | 90–210° | 90, 180, 210 | 18 | Keep hydraulic table |
| MP2000-210 | 210–270° | 210, 270 | 12 | Keep hydraulic table |
| MP2000-360 | 360° fixed | 360 | 6 | Keep hydraulic table |
| MP3000-90 | 90–210° | 90, 180, 210 | 18 | Keep hydraulic table |
| MP3000-210 | 210–270° | 210, 270 | 12 | Keep hydraulic table |
| MP3000-360 | 360° fixed | 360 | 6 | Keep hydraulic table |
| MP3500-90 | 90–210° | 90, 180, 210 | 18 | No 210–270° or full-circle SKU in active catalog |
| MP-CORNER | 45–105° | 45, 90, 105 | 18 | Keep flow; precipitation intentionally unpublished |
| MP800SR-90 | 90–210° | 90, 180, 210 | 18 | Keep explicit minimum-radius/minimum-flow rows |
| MP800SR-360 | 360° fixed | 360 | 6 | Keep explicit minimum-radius/minimum-flow rows |
| MP815-90 | 90–210° | 90, 180, 210 | 18 | Keep hydraulic table |
| MP815-210 | 210–270° | 210, 270 | 12 | Keep hydraulic table |
| MP815-360 | 360° fixed | 360 | 6 | Keep hydraulic table |
| MP-LCS-515 | **90° fixed corner strip** | Rectangular pattern | 6 | Correct arc metadata 180→90 |
| MP-RCS-515 | **90° fixed corner strip** | Rectangular pattern | 6 | Correct arc metadata 180→90 |
| MP-SS-530 | 180° fixed side strip | Rectangular pattern | 6 | Keep hydraulic table |

The 270–360° gap is real for MP1000/2000/3000/815: 270° is the adjustable upper bound; 360° uses the full-circle SKU. MP800SR has a 210–360° gap; MP3500 has no active model above 210°. Never fill these gaps by interpolating between different SKUs. Sources: [Standard and Corner](https://www.hunterirrigation.com/node/37076), [MP800SR](https://www.hunterirrigation.com/node/38356), [MP815](https://www.hunterirrigation.com/node/434666).

Manufacturer color names agree with the catalog variants: Standard's maroon/light blue/olive; black/green/red; blue/yellow/grey; MP3500 light brown; Corner turquoise; MP800SR orange-grey/lime-grey; MP815 maroon-grey/light blue-grey/olive-grey; strips ivory/copper/brown. The website does not establish exact hexadecimal colors. An illustrated swatch is not a measured physical color specification.

## Pressure-specific adjustment limits

Hunter describes radius adjustment of **up to approximately 25% for all models** and recommends regulated 2.8-bar bodies for normal operation; the low-pressure regulated option is 2.1 bar. Do not extrapolate performance outside the source pressure interval. Source: [Standard MP product specifications](https://www.hunterirrigation.com/en-metric/irrigation-product/mp-rotator/standard-mp-rotator-nozzle).

For sector models without an explicit minimum row, the application already uses a 0.75 reduction ratio. The former `max(item.rMin, row.radiusM * 0.75)` then imposed an additional marketing-radius floor. That floor affects **35 existing pressure/arc rows** in MP2000, MP3000 and MP3500. Examples, retaining the verified US data:

| Model / sector / pressure | Native radius | 75% design bound | Old global floor |
|---|---:|---:|---:|
| MP2000 / 180° / 2.1 bar | 5.1816 m | 3.8862 m | 4.0 m |
| MP3000 / 180° / 2.1 bar | 8.2296 m | 6.1722 m | 6.7 m |
| MP3500 / 180° / 2.1 bar | 10.3632 m | 7.7724 m | 9.4 m |
| MP3500 / 180° / 2.8 bar | 10.668 m | 8.001 m | 9.4 m |

Recommendation: use the pressure/sector-specific 75% bound as a **design adjustment estimate**, rather than applying an unrelated nominal minimum again. The wording “up to approximately” is not a laboratory guarantee of exact field throw. No additional lower-radius performance rows or exact measured reduced flow have been fabricated.

**MP800SR is different:** it publishes minimum-radius and minimum-flow columns. These must take precedence over a generic 25% rule and a single advertised 1.8-m minimum. Existing US-derived minimum radii at successive pressure steps are **1.8288 / 2.1336 / 2.4384 / 2.4384 / 2.7432 / 3.048 m**. Thus a 1.83-m radius belongs to the low-pressure setting and cannot be applied at 3.8 bar. Its flow at those endpoints is published; intermediate radius/arc interpolation remains an application estimate. Source: [MP800SR minimum and maximum performance](https://www.hunterirrigation.com/node/38356).

MP815 has no published minimum-radius column in these tables. Its advertised series range is not an instruction to force every pressure row down to that range's lower endpoint.

## Metric versus US source differences

The complete alternatives are preserved without merging cells.

- Standard/Corner metric website uses **2.0 / 2.5 / 2.8 / 3.0 / 3.5 / 3.8 bar**. The official metric Design Guide instead starts at **2.1 bar**. Do not lower the operating minimum to 2.0 on the basis of the webpage alone.
- MP800SR and strip metric grids start at 2.1 and include 3.0; MP815 metric uses **3.1**, not 3.0.
- At the nominal 2.8-bar / 40-psi step, MP1000 metric radius is **4.1 m**, US radius **14 ft = 4.2672 m**. This is larger than a single decimal rounding difference.
- MP815 at that step uses **4.6 m at 90°**, **4.5 m at 180° and above** in metric; US uses **15 ft = 4.572 m** for those rows.
- MP800SR at 210° and that step gives **1.85 L/min** in metric versus **0.43 US gpm = 1.627727 L/min**. This is a substantive official-source discrepancy; do not rewrite just one side of the radius/flow pair.
- Metric strip nominal dimensions at 2.8 bar are **1.5 × 4.5 m** for corners and **1.5 × 9.0 m** for the side. Existing coherent US values are **1.524 × 4.572 m** and **1.524 × 9.144 m**.

Sources: [metric Standard/Corner](https://www.hunterirrigation.com/en-metric/node/37076), [metric MP800SR](https://www.hunterirrigation.com/en-metric/node/38356), [metric MP815](https://www.hunterirrigation.com/en-metric/node/434666), [metric strips](https://www.hunterirrigation.com/en-metric/irrigation-product/mp-rotator/mp-rotatortm-strip-nozzle).

Other publication issues:

1. The MP815 metric webpage labels precipitation “in/hr”, while the values are 20–25. The official metric guide confirms **mm/h**.
2. US MP-SS-530 at 55 psi lists **0.47 gpm** but **38.4 gph**; 0.47 gpm corresponds to 28.2 gph. The application correctly uses the GPM column. Preserve it.
3. Thirty-one metric Standard-family flow pairs exceed ordinary nearest-rounding agreement between their displayed L/min and m³/h precision. They may reflect different rounding conventions. Do not silently convert one published column and call the other wrong, or use them to overwrite the internally coherent application flow.

The [official metric Design Guide, RevJ](https://www.hunterirrigation.com/sites/default/files/2024-08/LIT-461-RevJ-DG-MPR-EM-web_0.pdf), printed pages 12–14, corroborates the metric radius/flow alternatives above and the 2.1-bar first row. Its text was read; page-image rendering was unavailable. Current 2026 catalog search excerpts also corroborate parts of the MP800 data, but full PDF extraction was unavailable, so those snippets are not used as the sole basis for any patch.

## Strip layout, precipitation and simulation cautions

The two strip precipitation columns describe layouts, not interchangeable ordinary sector-square/sector-triangle calculations. Hunter places strips with Standard MP in single-row/triangular arrangements and with MP800 in rectangular arrangements. Thread/body fit alone does not establish same-zone precipitation compatibility. Preserve the application's separate strip layout treatment. Source: [official strip product guidance](https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle).

The 90° corner metadata correction must not replace the rectangular footprint with a pie sector or enable the radius/angle automatic tool for strips. Corner MP's missing square/triangular precipitation cells remain missing; do not infer official values for that exceptional coverage pattern.

## Optional information correction

The Design Guide's printed page 4 gives trajectory values at 2.8 bar: MP800SR 18°, MP815 15°, MP1000 20°, MP2000/3000/3500 26°, MP-CORNER 14°, all three strips 16°. Current `trajectoryDeg: null` and “single angle unspecified” wording can be improved with these **nominal table values**. Preserve the distinction from individual multistream trajectories. Exact optional patches are separated from required corrections.

## Assortment boundary

Current Hunter MP800 product material includes **MP820-90, MP820-210, MP820-360**, absent from the application. This is a potential future assortment addition, not a failed audit of an active model. No archived or discontinued entries were enabled. Male-thread variants are also outside this active catalog scope; they should not be invented as separate hydraulic datasets.

## Regression recommendations for integration

1. For all 16 sector models: minimum, maximum and interior supported arcs; reject actual SKU gaps, including 271–359°.
2. At all six source pressure steps: respect each row's native maximum and pressure-dependent reduced minimum; prevent lower/upper pressure extrapolation.
3. MP800SR: retain all explicit minimum-radius and minimum-flow endpoints; reject a low-pressure minimum radius when pressure is high.
4. MP2000 180° / 2.1 bar / 3.9 m should no longer fail solely because the catalog-wide advertised minimum is 4 m. Add analogous pressure-relative checks for MP3000 and MP3500, marking reduced performance as estimated.
5. LCS/RCS cards show 90° while both manual footprint and simulated water footprint remain the correct rectangular corner strip; SS remains 180°.
6. Keep all current US-derived row values unchanged and require `verifiedOn: "2026-10-10"` on any changed item.

