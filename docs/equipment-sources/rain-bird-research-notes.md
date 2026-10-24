# Rain Bird catalog research — checked 2026-10-04

All source material is from official rainbird.com product pages or their linked PDFs. `sources.json` records the downloaded document URLs and official media aliases. Document publication dates vary; the date above is the retrieval/check date, not a claim that every PDF is a 2026 edition.

`catalog-items.json` is ready for integration: **85 items, 940 performance rows, 19 spray bodies, 74 Verified and 11 Needs Review**. Shared compatible rotor nozzle racks are duplicated across catalog items; the raw files contain **744 distinct transcribed metric performance rows** and four nominal compensated-flow specifications. R-VAN's existing nine-model/198-row dataset is excluded; `rvan-constraints.json` supplements it.

| Raw file | Model/group records | Performance rows |
|---|---:|---:|
| hevan-performance.json | 4 | 64 |
| van-performance.json | 7 | 112 |
| u-performance.json | 12 | 48 |
| mpr-performance.json | 27 | 108 |
| rotor-performance.json | 7 | 311 |
| 5000-mpr-performance.json | 3 | 60 |
| sq-performance.json | 8 (four models, two throw settings) | 32 |
| bubbler-performance.json | 5 | 9 + four nominal specifications |

The rotor groups preserve 3500, 5000 standard/low-angle, 5000 PRS standard/low-angle, Falcon 6504, and 8005. The separate MPR rack preserves 25/30/35-foot radius classes with Q/T/H/F nozzles. Catalog 5000 and 5000 Plus combine their compatible standard, low-angle and MPR racks; PRS racks stay distinct. Flow through rotor nozzles must not be multiplied by arc/180; the source's 180° is the precipitation calculation basis. Source pressure-range rows are retained as constant rows with `pressureMaxBar` metadata.

## Geometry and source limits

- **SQ is square geometry.** Official D41505 4/19 poster explicitly gives FUL 5×5 or 8×8 ft, HLF 2.5×5 or 4×8 ft, QTR 2.5×2.5 or 4×4 ft. The D42032 full-line diagram shows the 3QTR L shape and sprinkler location. Thus radius is sprinkler-to-side distance, full square side is 2r, quadrant is r×r, and pattern fractions are .25/.5/.75/1. Catalog arc metadata is 90/180/270/360 solely for the interface; raw source arcs remain null. Diagram evidence is saved in `sq-full-line-page2.png` and `spray-poster-page1.png`.
- MPR strip coverage retains published width and length at each pressure, plus the diagram-based sprinkler offset. Catalog arc180 is internal compatibility metadata; it does not mean circular coverage. `radiusM` is the computed farthest rectangle corner for compatibility and is explicitly tagged; the raw strip rows have dimensions, not a fabricated circular radius.
- 5F-B/5H-B/5Q-B/5CST-B use 6/4/2/2 discrete streams. No authoritative quantified stream widths/angles were found; all four are Needs Review and use coverageKind `streams`. Their source flows are specified at an **adjusted 1.5m radius**. Constant listed flow across pressures is not evidence of pressure compensation.
- 1300A-F is point application. Published spacing .3–.9m is retained separately from radius. Catalog radius0 is an explicit point representation; raw radius is null. The table includes 4.1bar even though the stated operating maximum is 4.0bar; source row retained.
- 1401/1402/1404/1408 have nominal compensated flow, not pressure-specific table rows. Catalog `compensatedFlowLMin` converts published individual US-gpm values using 3.785411784 L/US-gallon; provenance is retained. No pressure rows were fabricated.
- Published manual reduction limits were preserved where found. No quantitative reduced-radius flow law was found for these families; `radiusAdjustment.flowPolicy` remains `unknown`. No 25% reduction limit was assumed for 8005. R-VAN minimum adjusted radii are 2.4/4.0/5.2m; see its separate constraints file.
- 19 verified 1800 body records include base, SAM, PRS30 and P45 combinations with published pop-up heights, inlet, regulated pressure and inlet requirements. Official documents verify the Rain Bird spray interface and family compatibility; thread gender, pitch and dimensions remain unspecified. No Hunter body defaults were copied.
- Missing raw recommended pressure is null. Where a catalog UI value is needed without an explicit manufacturer recommendation, a published table pressure is used with `recommendedPressureIsDefault:true`. Unknown colors use neutral #64748b/Unknown; published MPR color coding is retained with a source.

## Items requiring review

1. **SQ-HLF:** 0.8m setting at 2.1/2.8/3.4bar has materially inconsistent published L/h and L/min. Both raw values are preserved. Catalog m³/h is explicitly converted from the published L/min.
2. **SQ-3QTR:** 1.2m setting metric radius is printed .8/.9m while the imperial table and heading indicate 4/4.5ft. No correction was invented; catalog radius range therefore reflects the disputed metric rows and this model is Needs Review.
3. **3504-PC:** 2023 tech spec says 35% radius reduction on page 1 but 25% on page 3 and the current product page. The conservative documented 25% value is retained and the conflict is flagged.
4. **6504-PC / 6504-FC:** nozzle 6 at 4.5/5.0bar differs between the current-linked 2020 performance chart and 2023 technical specification. The 2020 chart's 23.33/24.50 L/min is retained; the later document prints 16.72/15.08 L/min, inconsistent with its own m³/h cells. Both catalog models are Needs Review.
5. **5004+PCR:** source table PRS nozzle 4 at 3.0bar prints .89 m³/h versus 16.80 L/min. Nozzle 8 at 2.5bar prints square 24mm/h versus triangular 18mm/h. Cells are preserved and marked for review.
6. **1408:** linked 2021 specification and current product feature text mention it, but the current model list names only 1401/1402/1404. Availability needs confirmation. Current page pressure range 1.4–6.2bar is retained; older spec rounds the same 20–90psi range to 1.5–6.0bar.
7. **Four 5 Series stream bubblers:** coverage dimensions remain unverified, as described above.

SQ-QTR and SQ-FUL are Verified, including their square geometry. Ordinary source unit rounding is preserved rather than silently reconciled. “Verified” describes checked model/source transcription, not independently measured sprinkler performance. High-speed Falcon variants and every purchasable riser/SAM/SS/rotor SKU are not separately cataloged; verified known alternatives are retained in model metadata, and no equivalent hydraulic data is inferred for unlisted variants.

## Validation and reproduction

Validated unique namespaced item IDs, official source domains, finite mandatory numbers and all performance pressure/radius/flow/arc values, ordered radius/arc limits, raw/canonical row counts, SQ metadata, and retained strip dimensions. The finalized `catalog-items.json` is authoritative. `build_catalog.py` produced the initial catalog; subsequent source-review and geometry refinements were made to that output, so do not regenerate blindly. `finalize_catalog.py` records the final strip-arc/row-status normalization but is not a replacement for every earlier refinement.

Raw tables, source PDFs, extracted text, and selected rendered evidence remain in this folder. No Site checkout or application files were changed.
