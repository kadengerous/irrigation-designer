# Rain Bird sprays, special patterns and bubblers — 2026-10-10

Final research result: **58 active models plus deprecated 1408; all 370 stored performance rows freshly compared, all 370 matching their selected official source tuples. No new numerical row correction is proposed.** This verifies transcription and the documented source selections; it does not erase actual manufacturer conflicts or certify unpublished operating configurations. R-VAN, rotors and bodies belong to the other audit sections.

## Coverage and sources

| Family | Models | Stored rows | Fresh primary source |
|---|---:|---:|---|
| HE-VAN | 4 | 64 | [Performance chart](https://www.rainbird.com/sites/default/files/media/documents/2018-02/chart_HE-VAN.pdf), pp.1–3 |
| VAN | 7 | 112 | [Performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/van-series-spray-nozzles-performance-charts.pdf), pp.1–4 |
| U-Series | 12 | 48 | [Performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/u-series-spray-nozzles-performance-charts.pdf), pp.1–2 |
| MPR, FLT, strips, streams | 27 | 108 | [Performance chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_1.pdf), pp.1–4 |
| SQ | 4 | 32 | [D42033 10/21](https://www.rainbird.com/sites/default/files/media/documents/2022-01/sq-nozzle-tech-spec-102121-web_1.pdf), p.2 |
| 1300A-F | 1 | 6 | [D50005EO 2/21](https://www.rainbird.com/sites/default/files/media/documents/2021-02/ts_1400_1300af.pdf), p.1 |
| 1400 | 3 active + 1 deprecated | 0 | Same spec plus [current model listing](https://www.rainbird.com/products/1400-series-pressure-compensating-bubbler) |

`spray-baseline-catalog.json` is the captured input; `spray-row-checks.json` contains 734 extracted US/metric source tuples and all 370 comparisons. `spray-row-audit.py` reproduces that comparison offline. Canonical SI uses the selected published metric L/min, or exact US conversion where previously justified. There are 336 metric and 34 US-derived active table rows. Secondary printed m³/h is preserved as source evidence while canonical m³/h is derived from L/min. Distinct regional pressure grids are never merged.

## Behavior requiring correction

The current [HE-VAN product page](https://www.rainbird.com/products/he-van-high-efficiency-variable-arc-nozzles) confirms mechanical adjustment from 0° to 360° and matched precipitation. The [VAN product page](https://www.rainbird.com/products/van-series-variable-arc-nozzles) confirms 0°–330° for 4/6/8-VAN, 0°–360° for 10/12/15/18-VAN, and the MPR relationship specifically for 12/15/18-VAN.

The pre-audit lookup's small-sector estimate is restricted to Hunter HE. That incorrectly makes all Rain Bird settings below the first 90° table row unavailable. For the four HE-VAN and three matched VAN sizes, use the clearly labelled estimate `Q90 × requestedArc / 90` at the same pressure and unreduced radius. It is an engineering interpretation of matched precipitation, not a separately published manufacturer row. Keep pressure interpolation bounded. Zero remains shutoff.

For 4/6/8/10-VAN, do not invent proportional flow below 90°. Mechanical geometry is permitted; all tabulated arcs at a given pressure share the same nominal radius. A reference-sector radius can support geometry with unknown flow, explicitly distinguished from a mechanically invalid angle. Automatic hydraulic matching must retain the unknown-flow warning and avoid certifying this setting as matched precipitation.

## Radius, pressure and footprint

The [currently linked HE-VAN specification](https://www.rainbird.com/media/4680), p.1, permits 25% radius reduction. VAN and MPR charts repeat that larger reductions are not recommended. They do not publish a reduced-radius discharge law. Retain `flowPolicy: unknown`, and do not interpret a successful mechanical reduction as verified flow. HE-VAN also warns that the screw may need adjustment to obtain the tabulated radius and flow when the arc is less than maximum.

All 28 current circular Rain Bird models with this reduction policy already store `rMin = 0.75 × minimum full-throw row`; their existing global minimum does not truncate any pressure-specific 25% interval. No new radius-floor data patch is needed. U-Series has an adjustment screw but no verified quantitative reduction limit in the reviewed sources; preserve the absent reduction policy. Do not borrow the 25% limit for SQ or flood bubblers.

Ordinary MPR strips have pressure-specific width/length rectangles and no published precipitation columns. The screw statement is not a formula for scaling both dimensions. Retain manual placement and the verified rectangular dimensions. Exact left/right origin placement is retained from the previous visual audit, not represented as freshly visually rechecked here.

MPR stream bubbler values apply at the adjusted 1.5 m throw, tested on 4-inch pop-ups. Equal table discharge does not establish pressure compensation. Discrete streams are not filled circular sectors. Existing `coverageKind: streams` and `placementSupported: false` avoid awarding an invented wetted footprint. No discharge/geometry extrapolation is proposed.

## SQ and flood bubblers

The [SQ specification](https://www.rainbird.com/sites/default/files/media/documents/2022-01/sq-nozzle-tech-spec-102121-web_1.pdf) still contains the previously documented HLF conflicts. Four small-setting flow rows remain hydraulically unverified. The large setting retains the complete corroborated US grid, with its four inconsistent no-overlap precipitation values withheld. Keep separate nozzle gating; whole-model Needs Review must not suppress independently verified square geometry or the usable large-setting flow. The idempotent proposed patch makes HLF geometry verification explicit.

SQ has two discrete settings, not a continuous radius screw curve. Published performance is at 6-inch / approximately 0.15 m mounting height. No other height curve is published. Quarter, half, three-quarter and full footprints remain square-derived; the half pattern uses a side-offset rectangle. Its application rate is without overlap. A pressure-compensating label never overrides the pressure-specific table.

[1300A-F](https://www.rainbird.com/products/1300a-f-adjustable-full-circle-bubbler) permits screw adjustment and shutoff. Its six-row table describes the published configuration, not arbitrary screw positions. The current source's 0.3–0.9 m value is spacing, not a dimensioned wetting radius. Preserve point geometry and unknown precipitation. A water-volume runtime is meaningful; depth requires an independently known irrigated area.

[1400](https://www.rainbird.com/products/1400-series-pressure-compensating-bubbler) confirms unchanged discharge over 20–90 psi and no user flow adjustment. Retain the exact conversions of 0.25/0.50/1.00 GPM for 1401/1402/1404. Older linked documents still mention 1408; current models omit it. Preserve Deprecated and its historical 2 GPM value. This run did not retrieve a new explicit discontinuation notice.

## Source conflicts and color evidence

Retain the complete US selections for 5H, 5Q, 10H, 10Q, 1300A-F, SQ-3QTR and large SQ-HLF. Fresh originals reproduce the conflicting metric columns, so the prior field-level decisions remain necessary. No manufacturer-issued erratum is claimed.

The [U-Series file in the 2023-11 URL directory](https://www.rainbird.com/sites/default/files/media/documents/2023-11/u-series_tech_spec_d37038j_-_rev11-7-2023.pdf) prints U-8 precipitation copied from U-10 despite different radius/flow. Its footer is 4/11; the URL is not proof of an engineering revision. Retain the specific performance chart's U-8 precipitation, independently repeated in the [official 2022 catalog](https://www.rainbird.com/sites/default/files/media/documents/2022-06/r461-071678-22_2022cat_full_fin_web-1.pdf). Do not replace rows merely because a URL appears newer.

The 2019 spray poster prints 8-VAN as 360°, while the current product page and performance chart consistently limit it to 330°. Retain 330°. The HE-VAN product page also contains a misplaced promotional sentence about R-VAN and 45 psi; retain HE-VAN's explicit 15–30 psi specification instead.

All 59 color records were checked for evidence provenance. Published color names for 44 models have fresh official text corroboration. Fifteen retain earlier manufacturer-photo evidence without pretending that pixels were freshly checked: VAN colors, 9SST, FLT and bubbler housing colors. The native PDF screenshot returned reference text only. No browser or alternate download was attempted. All hex values remain display approximations. SQ color identifies the lower insert, not its black housing; a cap color never implies hydraulic compatibility.

## Regression cases for integration

- HE-VAN-12, 2.1 bar, 3.7 m, 60°: estimated 1.493333 L/min from the published 90° row; 77° also usable and labelled estimated.
- 12-VAN, 2.1 bar, 3.7 m, 60°: estimated 1.5 L/min. Retain native table results at 90°.
- 4/6/8/10-VAN at 60°: mechanical geometry supported, hydraulic result unknown. 8-VAN above 330° remains invalid.
- A supported radius reduction on HE-VAN or VAN keeps geometry but makes discharge unknown; never reuse full-radius flow silently.
- SQ-HLF small setting: verified geometry with unknown discharge. Large setting: known flow with unknown no-overlap precipitation. Check an older saved snapshot as well as current catalog selection.
- SQ quarter/full and MPR strips remain their square/rectangular footprints; no sector conversion. No interpolation between SQ settings.
- 1401/1402/1404 keep constant flow within their operating range; 1300A-F uses pressure-table flow and does not claim known screw-position flow.

Only this audit's spray-prefixed documents were written. Root owns runtime integration and tests; this research did not perform browser QA or modify shared catalog/runtime files.
