# K-Rain nozzle audit — checked 2026-10-06

## Coverage and method

The audit freshly downloaded the current official 2026 English product catalog and ten linked nozzle/bubbler documents. The ten documents previously held by the project have identical SHA-256 hashes to the earlier downloads; the bubbler brochure is additional. `source-manifest.json` records URLs, bytes and hashes. The current catalog tables were independently extracted again, with visual checking of the special-pattern and bubbler layouts.

All **58 existing nozzle models / 404 performance rows** were compared field by field with the current metric tables (pressure, radius, flow, arc and both precipitation columns). **No unexplained transcription differences were found.** The 13 deliberate, previously justified field selections remain correct: 12 FN-12 flow cells use a matching official brochure metric table corroborated by current US values, and RN300-ADJ at 360°/3.5 bar uses the corroborated 8.53 m radius. The current FN-12F radius 3.4 m at 1.7 bar is retained even though the current US table says 12 ft; the companion brochure corroborates 11 ft / 3.4 m. This is field-by-field corroboration, not blanket imperial or dated-document precedence.

Files: `row-audit.json`, `raw-current-metric-rows.json`, `raw-current-us-rows.json`, `raw-strip-dimensions.json`, `model-audit.json`, `retained-field-decisions.json`.

## Changes ready to apply

`proposed-sparse-patches.json` provides item fields under `set`, nozzle metadata by exact nozzle `id`, and row flags under `performanceRowPatches` with index and pressure/arc guards. It does not replace any existing hydraulic numbers.

- Refresh source check dates for 58 models.
- Add official named-color provenance for 50 models and their nozzles. Hex codes are application approximations, never manufacturer RGB specifications. Normalize Grey spelling to the source's Gray. Eight fixed special-pattern colors remain unverified and use neutral `Unknown` / `#64748b`; do not infer ordinary P15 black for a P15CS/ES/SS/HL model.
- Fully Adjustable RN100/200/300-ADJ: the documented adjustment is up to 30% radius reduction. Global minimum envelopes are 2.772, 3.416 and 5.544 m respectively (70% of the lowest verified row radius). At a particular pressure/arc, minimum radius is 70% of that row's radius. The model's old unadjusted minimum must not clamp away that range. The source does not say “30% of original designated radius” (unlike the Toro terminology discussed previously). Matched precipitation is explicitly stated through patterns and distances; an area-based adjusted-flow calculation is a derived implementation, not a measured reduced-radius table.
- Enable partial hydraulic verification for seven P12/P15 models. **14 disputed rows** stay unavailable; **14 sound rows** in the same models become usable. Every row of those seven models is explicitly flagged, and `performanceReview: "per-row"` is added. Preserve disputed rows as barriers to interpolation.

## Exact unresolved hydraulic rows

`unresolved-rows.json` is the integration-ready exact list, including model, nozzle, row index, pressure, arc, disputed field, both unit values, reason and sources.

- P12Q/H/TQ/F: radius at 2.1 and 2.8 bar, rows 2/3, all four arcs. Metric 4.3/4.6 m conflicts with 13/14 ft; the linked older brochure uses a different pressure sequence.
- P15H: pressure at rows 2/3; metric 2.8/3.4 bar appears alongside US 30/40 PSI.
- P15TQ: radius at row 0 / 1.4 bar; metric 3.4 m conflicts with 13 ft.
- P15F: row 0 radius conflict and rows 2/3 pressure conflicts as above.

The sound rows preserve their original pressure, radius, flow and precipitation values. Do not simply delete disputed rows and interpolate across the resulting gap. Pressure disagreement can leave an apparent hole even where the independent US row would seem usable; no correction is selected without sufficient corroboration.

## Precipitation and special geometry

- **KVF6**, 90°, 1.72 bar, row 1: square precipitation remains null. Current metric 156/194 mm/h and US 6.16/7.65 in/h repeat the same incompatible square/triangle pair. Flow and radius remain supported. Do not fill square precipitation with the plausible calculated ~168 mm/h and label it published.
- **All nine strips** (RNS-RES/LES/SS plus six P15/FN-15 CS/ES/SS) have official pressure, width, length and flow, but **no published precipitation columns or explicit no-overlap application rate**. Neither catalog p40/p49 nor linked dedicated tables supplies a canonical application/spacing assumption for a single strip rate. Keep square, triangle and no-overlap rates unavailable; do not convert a rectangular area into a manufacturer-published precipitation value. `raw-strip-dimensions.json` verifies every current strip dimension row.
- Fixed strips publish 1.5 and 2.0 bar metric design points; the companion official metric brochure repeats them. Their 20/30 PSI labels are not exact conversions. Preserve the explicit metric grid and 2.0-bar selected UI default, not a 2.1-bar extrapolation.
- **P15HL / FN-15HL** have valid total flow and long/short bounding dimensions, but the curved long-throw boundary has no mathematical definition. The 4.6×9.8 m upper shape is not an exact radius-4.6 m semicircle. Keep `placementSupported:false`, geometry review, and no asserted area. The source's FN-5HL table typo is resolved by its model list and the live FN-15HL product page. No per-lobe flow split is supplied.
- No numeric radius-reduction bound or hydraulic law was found for KVF/KV/fixed nozzles; retain unknown reduced-flow behavior. Restricted-arc RN series advertises flow-control/radius adjustment but has no published reduced-radius grid or universal numerical reduction bound; do not copy the Fully Adjustable RN 30% rule into it.

## Five missing bubblers

`bubblers-catalog-ready.json` contains all five current official models. `bubblers-evidence.json` gives detailed provenance.

- TB-025, TB-05, TB-10, TB-20: compensated nominal flow **0.95 / 1.9 / 3.8 / 7.6 L/min**, throughout current 2026 catalog **1.4–3.5 bar** range. Empty performance arrays are intentional; these are manufacturer nominal constant flows, not fabricated pressure rows.
- TB-ADJ: a verified physical identity and point application, with **unknown hydraulic flow**. Current catalog and product body give 0.1–4.5 GPM, while current catalog metric gives 5–22 L/min and linked Rev.02 gives 1.36–5.9 GPM. No setting-specific table exists. Preserve the model and its uncertainty, do not silently remove it or assign a midpoint flow.
- All: riser mounting, 1/2-inch female pipe inlet, umbrella wetting pattern. Published 0.3–0.9 m **spacing is not radius**. All are represented as point applications with r=0 and no computed irrigated area. The selected 2.1-bar UI default is explicitly not a manufacturer recommendation.
- The linked older Rev.02 brochure's 20–50 PSI / 1.4–2.8 bar pressure range is internally inconsistent. The dated 2026 catalog's 1.4–3.5 bar range is selected, corroborated by 50 PSI.
- Black appearance for the five bubblers is visually confirmed in the official catalog p50 photograph; no named factory color or numeric RGB specification is claimed. Local official page image: `catalog-p50.png`.

## Additional missing product / descriptions

The current official KV5 product page confirms a **5-foot male variable-arc nozzle** (`https://www.krain.com/kv-nozzles/variable-arc-male-nozzle-5-kv5`). The current catalog and linked KV performance brochure do not provide its performance table. This is a missing-source case, not permission to copy KVF6/KV8 hydraulics. Document it as an available but unsupported model pending specifications; do not label it discontinued.

`descriptions-localized.json` contains four concise descriptions in all 20 app locales, with source/model mapping: compensated bubblers, adjustable bubbler, High-Low, and RPS Select. High-Low prose describes the two different throw portions without claiming a known exact footprint. RPS Select correctly describes its four built-in nozzles and top selector. Restricted-arc adjustable RN, fixed RN360 and RNS strips should retain separate description assignments; generic adjustable-sector wording is inaccurate for fixed full-circle and rectangular strip models.

## Main official sources

- [2026 product catalog](https://www.krain.com/content/files/images/landingpages/catalogs/2026%20product%20catalog%20english.pdf): RPS Select p16; RN p39–40; Fully Adjustable RN p42–43; KVF p44–45; KV p46–47; fixed/special p48–49; bubblers p50.
- [Fully Adjustable Rotary Nozzles](https://www.krain.com/fully-adjustable-rotary-nozzles): live page confirms 30% adjustment and matched precipitation, but its undated 2.8-bar recommendation differs from current dated catalog 2.1 bar. Keep dated catalog recommendation.
- [Fixed performance brochure](https://www.krain.com/content/files/images/landingpages/nozzles/fixed/fixed%20nozzle%20performance%20data.pdf): FN12 field corroboration and special-pattern details.
- [Bubblers](https://www.krain.com/bubblers) and [TB-ADJ](https://www.krain.com/bubblers/bubbler-adjustable-tb--adj): current availability and unresolved adjustable-flow conflict.

No checkout files were edited.
