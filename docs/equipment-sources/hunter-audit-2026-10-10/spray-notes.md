# Hunter sprays and bubblers — fresh audit, 2026-10-10

Scope: 62 active records / 400 stored rows: Pro Adjustable 2 / 70; Pro HE 5 / 100; Pro Fixed 21 / 105; Short Radius 6 / 30; ordinary strips 6 / 30; Bubblers & Streams 22 / 65. Seven archived records are separately inventoried (8A/10A/12A/15A/17A, S-8A/S-16A). MP, rotors and spray bodies are outside this audit.

## Source and unit decision

Fresh official US product tables account for all 400 existing rows. 399 match numerically after their existing SI conversion; the remaining 17A-HE triangle value was intentionally null because the HTML value is inconsistent. The app rounds US pressure to one decimal bar. Metric product pages have different pressure grids, not merely translated units: HE and Adjustable 1.0/1.5/2.1/2.5/3.0 bar; Fixed, Short and Strip 1.0/1.5/2.0/2.1/2.5 bar. Retain the coherent freshly checked US grids; do not splice metric throw or discharge into a US row. The report does not assert that every printed table cell is free of manufacturer errors.

`spray-row-checks.json` captures all 400 baseline rows, their official US source tuples and comparisons. `spray-model-coverage.json` inventories every active and archived model. `spray-source-manifest.json` identifies the 12 primary sources. `spray-audit.py` reruns the comparison against the current catalog without network access; after integration it should find fewer differences and is not a substitute for the captured baseline. Source table excerpts were fetched with the native web tool; no CLI network or browser automation was used.

## Confirmed numerical corrections

The current HE product page links a [US cut sheet in Hunter's 2025-05 directory](https://www.hunterirrigation.com/sites/default/files/2025-05/RC-198-ProHE-SS-US-Web.pdf). Its same 20/25/30/35/40 psi grid resolves four HTML-cell errors without mixing regional tables:

| Model | Arc | Source pressure | Corrected field | Official cell | SI |
|---|---:|---:|---|---:|---:|
| 8A-HE | 360° | 40 psi | flow | 1.36 GPM | 5.148160026 L/min |
| 10A-HE | 270° | 20 psi | triangular precipitation | 1.92 in/h | 48.768 mm/h |
| 10A-HE | 270° | 25 psi | triangular precipitation | 2.13 in/h | 54.102 mm/h |
| 17A-HE | 360° | 40 psi | triangular precipitation | 2.04 in/h | 51.816 mm/h |

Pages: 8A and 10A on PDF page 1; 17A on page 2. `spray-he-pdf-crosscheck.json` compares all 100 HE rows. Exact proposed changes are in `spray-proposed-patches.json`. Flow m³/h is derived from the selected L/min to maintain SI consistency. The native screenshot call returned only reference text in this environment; these are PDF text/table comparisons, not a claimed visual render inspection.

## Arc and radius controls

[Pro Adjustable](https://www.hunterirrigation.com/irrigation-product/nozzles/pro-adjustable-nozzles) retains active 4A and 6A, mechanical 0–360°. The current [2026-05 US sheet](https://www.hunterirrigation.com/sites/default/files/2026-05/RC-244-SS-Nozzles-ProAdj-US.pdf) publishes 45/90/120/180/240/270/360° rows. Thus 45–89° can use bounded interpolation; 1–44° has valid mechanical geometry but no published flow row or family MPR claim supporting proportional extrapolation. Zero is not a placeable coverage sector. The page explicitly identifies the five larger legacy Adjustable models as phased out in 2026.

[Pro HE](https://www.hunterirrigation.com/en-metric/irrigation-product/nozzles/pro-high-efficiency-nozzles) explicitly matches precipitation across its adjustable arc and supports full shutoff at 0°. Keep the existing clearly labelled proportional estimate below the first 90° row for 1–89°; it is not a separately measured row. Keep pressure interpolation inside the selected source grid. Matching across changed screw radius or changed pressure is not separately guaranteed.

[Pro Fixed](https://www.hunterirrigation.com/irrigation-product/nozzles/pro-fixed-nozzles) has exactly the existing discrete Q=90°, T=120°, H=180°, F=360° records. 5 has Q/H/F, 8/10/12/15 have Q/T/H/F, 17 has Q/H. Do not turn fixed models into continuously adjustable sectors. The 12/15 sheet headings mention 240°/270°, but no such current model or performance row is included; that heading does not authorize invented catalog records.

[Hunter's radius-adjustment instructions](https://www.hunterirrigation.com/en-metric/support/spray-nozzle-radius-adjustment) support screw reduction up to 25% for spray nozzles. Use the selected pressure's throw × 0.75, not a floor from the smallest unadjusted throw. This applies to HE, ordinary Adjustable, Fixed and Short Radius spray families. No reduced-radius discharge curve or unchanged-flow guarantee was found. The existing unchanged-flow output remains an explicitly labelled interpolation/modelling assumption, not manufacturer performance data. This audit does not propose changing that established runtime policy to unknown. The current Adjustable PDF additionally warns that adjusting the screw may be necessary to obtain catalog radius and flow; the table does not promise a fully-open-screw condition. Do not apply this spray-screw rule to flood/stream bubblers or scale both strip dimensions by an invented ratio.

## Special footprints and precipitation basis

[Short Radius](https://www.hunterirrigation.com/irrigation-product/nozzles/short-radius-micro-spray-nozzles) publishes one precipitation column expressly without overlap. It is not square-spacing precipitation. Existing runtime `precipBasis:single` labels it correctly, but the raw column is stored misleadingly as `precipSquareMmH`. A future atomic cleanup can move it to `precipNoOverlapMmH`, keep square/triangle null, and adapt the display lookup together; this report does not propose a standalone data-only change that would break the current correct label. Published 2Q/2H/4Q/4H/6Q/6H patterns remain fixed 90/180°.

[Ordinary strips](https://www.hunterirrigation.com/irrigation-product/nozzles/strip-pattern-nozzles) publish six width×length tables, all 30 existing values match the US page. No square/triangle precipitation is published. Existing pressure-dependent rectangles and manual-only selection are appropriate. Their stored arc180 is internal orientation metadata, not a claim that their wetted shape is a semicircle. Do not infer precipitation from throw alone. Diagram orientation still requires a viewable manufacturer diagram before calling left/right origins independently reverified.

[Bubblers](https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles) confirm 20 pressure-compensated models and the 1.0–4.8 bar range; the app's 3 identical rows represent that published constant range, not 3 measured operating points. AFB has adjustable output below 2 GPM and no fixed throw/flow row: preserve unknowns. PCB/PCB-R are ½-inch riser devices; PCN/MSBN are female-thread nozzle devices for Pro-Spray bodies.

The [current bubbler-nozzle sheet](https://www.hunterirrigation.com/sites/default/files/2025-10/RC-235-SS-Sprays-MSBN-V-US-WEB.pdf) identifies MSBN as multi-stream, MSBN-V as two streams, and 5-CST-B as dual-stream. Their current filled-sector coverage is misleading: set `coverageKind:streams`, retain source throw/flow and manual placement, and do not credit a uniformly irrigated sector. The PDF explicitly labels the baseline MSBN table as installed on PROS-04 (4-inch pop-up). MSBN-V has a documented 6-inch pop-up exception: 25V reaches 2 ft and 50V reaches 3 ft; current fixed 1.5/2.5 ft radii omit this body-height dependency. Other heights are not separately tabulated. Retain the documented nominal baseline with its body-height limitation; do not invent a height curve or claim every compatible body height has separately verified throw.

## Final coverage and remaining limitations

All 62 active models and 400 stored rows were checked. The same-grid PDF comparison covers all 100 HE, 70 Adjustable and 105 Fixed rows. Adjustable and Fixed have no additional numerical discrepancies. Four HE row corrections and nine stream-geometry corrections are supplied as sparse patches. The 20 constant-flow models contribute 60 expanded rows; they are range statements rather than three independent tests. AFB has no performance row and remains unknown.

The report preserves unresolved or unpublished fields: strip diagram origins were not visually reverified; nonbaseline MSBN body-height throws remain unverified except the explicit two 6-inch exceptions; AFB's full pressure operating limit is not established by the current selected evidence. The current product page separately confirms PCB-20-R as a 2 GPM reclaimed-water variant. Archived stream models have no active table in the scoped current pages and remain excluded. Official snippets distinguish female nozzle threads from the body's ½-inch pipe inlet; the app's universal “½-inch female” label on spray nozzles should not be interpreted as verified nozzle-thread diameter.

Metric pages contain independent anomalies (for example Fixed5H at1.0bar lists0.40m³/h against0.60L/min, Fixed8T at2.5bar lists33mm/h triangular against37square). These unused regional cells are not silently substituted into the selected coherent US data. HE metric rows also differ in pressure and contain HTML/PDF disagreements. No correction in this report is calculated from a guessed formula or inferred cross-regional pressure equivalence.

No new unchecked models, sector curves or discharge curves were added. Only audit documents were written by this agent; root integrates and tests application changes.
