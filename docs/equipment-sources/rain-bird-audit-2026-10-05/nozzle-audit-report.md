# Rain Bird standalone nozzle audit — 2026-10-05

Ready for integration. This audit covers all 68 existing standalone nozzle/bubbler models and 72 selectable nozzle settings. It excludes rotors and spray bodies, which have a separate audit. No checkout files were edited.

## Coverage and method

Independently re-extracted 571 existing performance rows from official Rain Bird PDFs: 64 HE-VAN, 112 VAN, 48 U-Series, 108 MPR including strip/flat/stream variants, 198 R-VAN, 32 SQ, and 9 1300A-F rows. All 571 matched the catalog's original selected source values. This establishes transcription accuracy, not that conflicting manufacturer columns are automatically correct. Also checked all four 1400 nominal compensated flows.

Source selection is field-specific: published document identity, internally coherent units, and independently corroborating official tables take priority over an unexplained preference for metric or US data. URL upload years and PDF timestamps do not establish an engineering revision. Conversions use 1 US gal = 3.785411784 L, 1 ft = 0.3048 m, and 1 psi = 0.0689475729317831 bar. Diagnostic interpolation between US pressure points was used only to investigate unit discrepancies, never to invent replacement rows.

The 2026 catalog examined is the homeowner/retail catalog. Its available HE-VAN and strip tables corroborate existing data; it contains no authoritative correction of the disputed SQ professional table. The current R-VAN metric chart is D42102 07/24, uploaded in 2025. The /media/5908 US chart resolves to D41099 01/18, so it must not be labeled a 2025 revision.

## Ready corrections

`hydraulic-patches.json` contains six model patches; `hydraulic-source-selections.json` preserves rejected metric/source rows and exact source references.

| Model | Material manufacturer conflict | Proposed usable source |
|---|---|---|
| 5H | Metric 2.1 bar gives 0.9 L/min, while US 30 psi gives 0.20 gpm and its printed precipitation supports the lower rate. | Complete four-row US grid, exact SI conversion. |
| 5Q | Metric 1.0 bar gives 0.4 L/min, while US 15 psi gives 0.07 gpm and its printed precipitation supports the lower rate. | Complete four-row US grid, exact SI conversion. |
| 10H | Metric 1.0 bar gives 2.4 L/min alongside 0.13 m³/h; US 15 psi gives 0.58 gpm. | Complete four-row US grid, exact SI conversion. |
| 10Q | Metric 1.0–2.1 bar repeats 1.2 L/min while both US gpm and metric m³/h rise. | Complete four-row US grid, exact SI conversion. |
| 1300A-F | Metric unit columns disagree, including 2.5 bar / 0.39 m³/h versus 6.0 L/min; existing 4.0-bar limit excludes the published 4.1-bar endpoint. | Complete six-row 10–60 psi table, exact SI conversion, independently repeated in the official performance chart. |
| SQ-HLF | Small setting is inconsistent in both unit tables. Large setting's gph/gpm and metric L/min corroborate each other. | Preserve small setting as hydraulic Needs Review; use complete large-setting US grid. Withhold inconsistent no-overlap precipitation. |

MPR evidence: [official performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_1.pdf), pages 1–2, corroborated by D40917 5/16 tech spec. These are documented selections between conflicting official tables, not manufacturer-issued errata. Replacement pressure/radius bounds follow the selected grid; no rows are merged across mismatched pressures.

1300 evidence: [D50005EO 2/21](https://www.rainbird.com/sites/default/files/media/documents/2021-02/ts_1400_1300af.pdf) and [1300A-F performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/1300a-f-performance-chart.pdf). The 0.3–0.9 m figure is spacing, not a measured wetting radius. Retain point geometry and screw-setting-dependent flow.

SQ evidence: [D42033 10/21](https://www.rainbird.com/sites/default/files/media/documents/2022-01/sq-nozzle-tech-spec-102121-web_1.pdf), page 2. Large HLF setting: 20/30/40/50 psi, 4/4/4.5/4.5 ft, 10.2/10.7/10.7/10.7 gph. Small HLF setting must remain available but excluded from hydraulic calculations: the metric table disagrees between L/h and L/min, and the US table also disagrees between gph and gpm. Gate both `performanceAt` and final flow calculation by selected nozzle status. Model-level verification cannot replace this check. Existing SQ square-side-offset geometry and QTR/FUL data remain; previously verified SQ-3QTR US selection remains.

`constraint-patches.json` contains four HE-VAN radius-reduction patches and nine R-VAN body-exclusion patches. HE-VAN tech spec explicitly permits up to 25% reduction; no reduced-radius flow formula is published. R-VAN's [official family listing](https://store.rainbird.com/sprinklers/rotary-nozzles.html?product_list_mode=list) explicitly excludes 1802 and 1803 for all nine models. Applying those base-model exclusions to 1802-PRS and 1803-PRS is recorded as a compatibility inference. Keep 4/6/12-inch compatible families.

`nominal-flow-patches.json` makes the four 1400 nominal SI unit pairs mathematically coherent from published nominal US gpm while preserving rounded source m³/h separately. Keep 1408 Deprecated and its historical flow; never silently substitute lower-flow 1404.

Most secondary m³/h conflicts in old spray tables do not invalidate their L/min column. For example, U-10F at 2.0 bar and 10-VAN at 2.0 bar / 270° closely match US L/min interpolated to that pressure; their m³/h appears associated with a different rounded pressure point. These diagnostic cases are preserved in `unit-column-audit.json`. Keep validated L/min; compute canonical m³/h from L/min rather than treating copied secondary units as independent truth.

## Colors and visuals

`color-patches.json` covers all 68 models and all 72 selections. Each has color source URL and verification date. `color-evidence.json` distinguishes published color names from visual descriptions and identifies the colored component. Every hex code is an approximate display choice, not a manufacturer RGB specification.

Material corrections: 9SST, 8H-FLT and 8Q-FLT are gray. Current R-VAN24/24-360 rings are magenta/burgundy; the older yellow R-VAN1724 is a different model. SQ coding is the bottom insert (QTR purple, HLF brown, 3QTR gray, FUL red); its top/housing is black. 1300/1400 housing is black, with no invented per-flow cap code.

Local official reference renders:

- `spray-poster.png`: VAN, HE-VAN, U-Series, MPR, specialty and stream identification, D41505 4/19.
- `rvan-current.png`: all nine current R-VAN models, D42102 07/24 page 1.
- `sq-full-line.png`: SQ construction and bottom identification inserts.
- `sq-table.png`: SQ pressure/flow tables.
- `bubbler.png`: 1300/1400 housing photo.

The associated PDFs, extracted text, and source URL/hash manifest are retained beside these files.

## Explicit remaining unknowns

- SQ-HLF small-setting flow and disputed no-overlap precipitation remain unknown.
- Stream bubblers have discrete streams. Their continuous filled footprint and stream width are unpublished; keep unsupported placement rather than substituting a sector.
- Manually reduced-radius discharge remains unknown where no manufacturer formula/table exists.
- A compatibility statement does not establish exact nozzle thread pitch.
- No quantitative U-Series radius-reduction limit was found; do not borrow another family's 25% figure.
- Do not infer constant SQ flow solely from pressure-compensating marketing; use the pressure-specific table.

No blanket verification/date normalization is required. Retained hydraulic rows may keep their original verification date. New color and constraint evidence uses 2026-10-05, and changed hydraulic models carry that date. `audit-summary.json` and `model-audit.json` provide machine-readable coverage and decisions. All patch arrays were checked for valid JSON, unique model targets, and finite numeric values. Reapply the final six hydraulic patches, including newly added 5Q; do not regenerate them from already patched checkout data.
