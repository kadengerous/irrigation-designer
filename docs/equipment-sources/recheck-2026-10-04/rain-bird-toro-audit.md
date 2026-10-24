# Toro / Rain Bird flagged-model audit — 2026-10-04

Audited all 13 initially flagged records: 11 Rain Bird, 2 Toro. R-VAN has no flagged records. Checkout was not edited.

- 5 records become Verified: four MPR stream bubblers (with placement disabled), and SQ-3QTR (complete official U.S. table selected and converted to SI).
- 1 becomes Deprecated: Rain Bird 1408, explicitly dropped by primary manufacturer notice.
- 1 has verified full-radius hydraulics but retains Needs Review: 3504-PC (36/36 current-source rows match; maximum reduction conflicts).
- 6 retain unknown hydraulics and Needs Review: 5004+PCR, 6504-PC, 6504-FC, SQ-HLF, Toro PSN15-F, Toro PSN15T-F.
- Result: 7 top-level Needs Review remain. No disputed rows were removed to create interpolation gaps.

## Ready artifacts

`catalog-patches.json`: seven sparse patches, matched by id. `set.nozzles` is a complete array when present.
`corrected-records.json`: equivalent seven full records, for inspection.
`audit.json`: all 13 findings, exact source locations, counts and application requirements.
`sq-3qtr-us-raw-and-normalized.json`: all eight original U.S. rows alongside exact SI conversions.
`3504-source-comparison.json`: 36 rows compared, zero differences.
`source-manifest.json`: official URLs and local download SHA-256 hashes.

## Required runtime behavior

3504-PC requires optional `hydraulicVerificationStatus: Verified` support for the normal-radius table only. Keep top-level Needs Review and `radiusAdjustment.flowPolicy: unknown`; reducing radius still gives unknown flow. Do not infer flow changes from radius.

Respect `placementSupported: false` for all four stream bubblers. Their hydraulic tables are verified, while stream width/angles and precipitation remain unknown. Their diagrams do not justify filled sectors or rectangles.

Keep 1408 snapshots and historical flow. The official replacement 1404 has a different flow; no automatic replacement is authorized.

## Sources and exact conclusions

### rain-bird:5F-B — resolved_verified_with_unsupported_placement

All 4 metric rows verified. 6 streams; no dimensioned stream widths. Placement disabled.

- [PDF page 3, printed page 34](https://www.rainbird.com/media/4174): 4 rows at 1.0/1.5/2.0/2.1 bar; adjusted radius 1.5 m.
- [Printed page 4](https://www.rainbird.com/sites/default/files/media/documents/2025-06/2025_us_landscape_price_list_updated_6.5.25.pdf): All four stream bubbler models listed.

### rain-bird:5H-B — resolved_verified_with_unsupported_placement

All 4 metric rows verified. 4 streams; no dimensioned stream widths. Placement disabled.

- [PDF page 3, printed page 34](https://www.rainbird.com/media/4174): 4 rows at 1.0/1.5/2.0/2.1 bar; adjusted radius 1.5 m.
- [Printed page 4](https://www.rainbird.com/sites/default/files/media/documents/2025-06/2025_us_landscape_price_list_updated_6.5.25.pdf): All four stream bubbler models listed.

### rain-bird:5Q-B — resolved_verified_with_unsupported_placement

All 4 metric rows verified. 2 streams; no dimensioned stream widths. Placement disabled.

- [PDF page 3, printed page 34](https://www.rainbird.com/media/4174): 4 rows at 1.0/1.5/2.0/2.1 bar; adjusted radius 1.5 m.
- [Printed page 4](https://www.rainbird.com/sites/default/files/media/documents/2025-06/2025_us_landscape_price_list_updated_6.5.25.pdf): All four stream bubbler models listed.

### rain-bird:5CST-B — resolved_verified_with_unsupported_placement

All 4 metric rows verified. 2 streams; no dimensioned stream widths. Placement disabled.

- [PDF page 3, printed page 34](https://www.rainbird.com/media/4174): 4 rows at 1.0/1.5/2.0/2.1 bar; adjusted radius 1.5 m.
- [Printed page 4](https://www.rainbird.com/sites/default/files/media/documents/2025-06/2025_us_landscape_price_list_updated_6.5.25.pdf): All four stream bubbler models listed.

### rain-bird:3504-PC — partially_resolved_hydraulics

36 of 36 catalog metric rows match the current 2023 technical specification exactly. Reduction is 35% on page 1 versus 25% on page 3/product page. No conflicting pressure row deleted; interpolation remains bounded by the complete verified table.

- [PDF pages 1, 2 and 3](https://www.rainbird.com/media/4634): Page 2 complete metric table matches all six nozzles at six pressure rows. Reduction statements conflict.
- [Features](https://www.rainbird.com/products/3500-series-rotor-sprinklers): 25% radius reduction statement.

### rain-bird:SQ-3QTR — resolved_verified_with_authoritative_alternate_table

Replace all 8 metric-derived rows with the complete official U.S. table converted to SI. Current dedicated model sell sheet independently confirms selectable 2.5 ft and 4 ft throws. Metric 1.2 m radius column remains documented as a rejected source variant; no erratum claimed.

- [PDF page 2, left upper/lower U.S. tables](https://www.rainbird.com/media/13442): Full 8-row source used. Gph/gpm agreement within displayed rounding.
- [PDF pages 1–2](https://www.rainbird.com/media/13444): Explicit 3/4 square pattern and selectable 2.5 ft/4 ft throws.
- [Features/Models](https://www.rainbird.com/products/sq-series-square-pattern-nozzles): Current product page confirms SQ 3QTR and both throw settings.

### rain-bird:1408 — resolved_deprecated

Official 2023 domestic discontinuation workbook explicitly lists A16140MX / 1408 / Drop Immediately, replacement A16130MX / 1404. Saved designs must keep original 1408 hydraulics; no automatic replacement.

- [Worksheet 2023 Year End Drop Notification, row 23](https://www.rainbird.com/sites/default/files/media/documents/2023-08/2023_yearendproductdropnotification_dom_-_080823.xlsx): A16140MX | 1408 | 1408 BUBBLER | A16130MX | 1404 | Drop Immediately
- [D50005EO 2/21](https://www.rainbird.com/sites/default/files/media/documents/2021-02/ts_1400_1300af.pdf): Historical nominal 2 gpm flow specification.

### rain-bird:5004+PCR — unresolved_source_contradiction

Current D42380 PRS table has nozzle 4 at 3.0 bar: 0.89 m3/h versus 16.8 l/min (which converts to 1.008 m3/h). Nozzle 8 at 2.5 bar has square/triangle precipitation 24/18 mm/h, inconsistent with table geometry. Current non-PRS table cannot be used as replacement for this PRS body. Keep hydraulic calculation unknown; deleting a disputed row would permit interpolation across it.

- [PDF page 5, PRS metric table](https://www.rainbird.com/media/4635): Nozzle 4 / 3.0 bar: 12.7 m, 0.89 m3/h, 16.8 l/min. Nozzle 8 / 2.5 bar: 13.3 m, 1.63 m3/h, 27.0 l/min, 24/18 mm/h.

### rain-bird:6504-PC — unresolved_source_contradiction

Both official linked documents disagree on nozzle 6 flow at 4.5/5.0 bar. Standalone table gives 23.33/24.50 l/min, coherent with 1.40/1.47 m3/h. Current 2023 technical spec prints 16.72/15.08 l/min with the same m3/h. Existing catalog keeps standalone values but must retain Needs Review; no manufacturer erratum or authoritative unambiguous replacement found.

- [PDF page 2](https://www.rainbird.com/media/4170): Nozzle 6 at 4.5 and 5.0 bar: 23.33 and 24.50 l/min.
- [PDF page 3](https://www.rainbird.com/media/4668): Same rows: 16.72 and 15.08 l/min; paired m3/h remains 1.40 and 1.47.

### rain-bird:6504-FC — unresolved_source_contradiction

Both official linked documents disagree on nozzle 6 flow at 4.5/5.0 bar. Standalone table gives 23.33/24.50 l/min, coherent with 1.40/1.47 m3/h. Current 2023 technical spec prints 16.72/15.08 l/min with the same m3/h. Existing catalog keeps standalone values but must retain Needs Review; no manufacturer erratum or authoritative unambiguous replacement found.

- [PDF page 2](https://www.rainbird.com/media/4170): Nozzle 6 at 4.5 and 5.0 bar: 23.33 and 24.50 l/min.
- [PDF page 3](https://www.rainbird.com/media/4668): Same rows: 16.72 and 15.08 l/min; paired m3/h remains 1.40 and 1.47.

### rain-bird:SQ-HLF — unresolved_source_contradiction

Current metric 0.8 m setting at 2.1/2.8/3.4 bar prints 46/52/52 l/h versus 0.68/0.68/0.68 l/min. The current U.S. small-throw table also contradicts itself: 10.7 gph at 30/40/50 psi versus 0.20/0.23/0.23 gpm. Older official tables differ; neither unit system provides an unambiguous current full replacement for this model. Keep hydraulic calculation unknown and do not bridge removed rows by interpolation.

- [PDF page 2, HALF small-throw tables](https://www.rainbird.com/media/13442): Flow-unit conflicts affect multiple rows; U.S. table does not resolve them.

### toro:PSN15-F — unresolved_source_contradiction

Current 2026 PSN chart conflicts materially with dedicated 2025 PSN+ table for 15-F at common 30/40/50 psi. 2026 gives 15.0/15.2/15.3 ft and 2.31/2.35/2.40 gpm; 2025 PSN+ gives 14.1/14.5/15.0 ft and 1.94/2.25/2.51 gpm. Both thread variants share the disputed hydraulic family. The 2026 full-circle values match the older PSN table while quarter/half values match PSN+, so date alone is insufficient to establish corrected PSN+ performance. Keep Needs Review and hydraulic unknown.

- [2026 performance chart page 1, 15-F](https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e): 20/30/40/50 psi. Current Toro product-page performance link.
- [Dedicated PSN+ sell sheet, PDF page 5, 15-F](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx): 30/40/50/60/70 psi. Current specifier source.
- [Specifications/documents](https://www.toro.com/en/product/Precision-Series-Spray-Nozzles): Current official product page checked 2026-10-04.

### toro:PSN15T-F — unresolved_source_contradiction

Current 2026 PSN chart conflicts materially with dedicated 2025 PSN+ table for 15-F at common 30/40/50 psi. 2026 gives 15.0/15.2/15.3 ft and 2.31/2.35/2.40 gpm; 2025 PSN+ gives 14.1/14.5/15.0 ft and 1.94/2.25/2.51 gpm. Both thread variants share the disputed hydraulic family. The 2026 full-circle values match the older PSN table while quarter/half values match PSN+, so date alone is insufficient to establish corrected PSN+ performance. Keep Needs Review and hydraulic unknown.

- [2026 performance chart page 1, 15-F](https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e): 20/30/40/50 psi. Current Toro product-page performance link.
- [Dedicated PSN+ sell sheet, PDF page 5, 15-F](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx): 30/40/50/60/70 psi. Current specifier source.
- [Specifications/documents](https://www.toro.com/en/product/Precision-Series-Spray-Nozzles): Current official product page checked 2026-10-04.

