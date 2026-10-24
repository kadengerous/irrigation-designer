# Rain Bird rotor and spray-body audit — 2026-10-05

The proposed replacement subset contains **28 records: seven rotor models and 21 spray bodies**. All 26 existing records were checked; two explicitly listed PRS bodies were added. The four existing rotor `Needs Review` statuses resolve to `Verified` after the field-level decisions below. This does **not** verify missing reduced-radius flow or conflicting precipitation: those remain unknown.

Apply `proposed-catalog-items.json` **by item ID**, preserving the parallel nozzle/bubbler audit. No checkout files were edited.

## Coverage and changes

- 7 existing rotor records, 94 model/nozzle entries and all 567 performance rows retained.
- 371 unique technical rows checked: 311 current-spec rows plus 60 MPR rows. MPR rows also matched the current-site-linked commercial catalog, yielding 120 MPR source checks with no differences.
- 19 existing 1800 bodies checked; 1802-PRS (51 mm) and 1803-PRS (76 mm) added from explicit manufacturer listings.
- 3 L/min cells changed: standard 5000 #6 at 4.5 bar in two models, and 5000 PRS #4 at 3.0 bar.
- 26 precipitation cells set to null in 13 rows, across the two standard 5000 records and PRS record.
- One harmless published precipitation rounding update, 12.6 to 13 mm/h.
- All 567 m³/h fields normalized from the selected L/min value so the runtime has consistent units. Original manufacturer unit columns are retained in `baseline-rotors-bodies.json`, `raw-catalog-performance-rows.json`, PDFs and extraction files.
- All 94 nozzle entries now carry verified color evidence. Hexadecimal values are display approximations, not manufacturer color standards.

## Field-level decisions

**3504-PC.** All 36 full-radius rows exactly match the current [2023 technical specification](https://www.rainbird.com/media/4634), p2. Its p1 says 35% radius reduction; p3 and the [current product page](https://www.rainbird.com/products/3500-series-rotor-sprinklers) say 25%. The usable 25% envelope is supported by both sources and safely lies inside both claims. It stays at `minimumRatio: 0.75`; no 35% capability or reduced-radius flow is claimed. Top-level review is resolved for the supported behavior while the contradictory outer maximum is disclosed.

**5004-PC and 5004+PC.** All standard, low-angle and MPR rows were compared. The #6 / 4.5 bar row's 28.2 L/min conflicts with its published 1.64 m³/h. The [current technical specification](https://www.rainbird.com/media/4635), p3, independently prints 65 psi / 7.22 GPM, equal to 27.330673 L/min. The selected 1.64 m³/h converts to **27.333333 L/min**. This is an explicitly derived unit conversion, not a new measured performance claim. The two catalog model copies are corrected identically. Smaller differences in this family reflect the coarse 0.6 L/min quantization visible throughout the published metric column and are not treated as material errors.

**5004+PCR.** The #4 / 3.0 bar row prints 0.89 m³/h and 16.8 L/min in the dedicated chart, current spec p5 and 2023 commercial catalog p44. The same PRS imperial table prints 3.50 GPM at 35 psi and 4.01 GPM at 45 psi; mapping 3 bar into that bracket gives about 14.8921 L/min. This corroborates the 0.89 m³/h column rather than 16.8 L/min. The selected conversion is **14.833333 L/min** from the directly published 0.89 m³/h. The bare-rotor table is not used as a replacement PRS curve. The explicitly published constant 3.5–5.2 bar interval remains intact.

**5000 precipitation.** Standard #8 rows at 2.0, 2.5, 3.0, 3.5 and 4.0 bar, and PRS #8 rows at 2.0, 2.5 and 3.0 bar, do not agree with their own radius/flow under the stated 180° / 50%-diameter spacing basis. For example, 11.8 m and 24 L/min imply approximately 20.68 mm/h square spacing while the table prints 32. The PRS 2.5 bar table also prints square 24 versus triangular 18. No authoritative corrected precipitation cells were located. Both precipitation fields in these affected rows are null. Calculated precipitation was used only to diagnose the conflict, not substituted as manufacturer data. All pressure, radius and flow rows remain, so interpolation does not bridge deleted hydraulic points.

**6504-PC and 6504-FC.** Retain existing #6 flows of **23.33 L/min at 4.5 bar** and **24.50 L/min at 5.0 bar**. These are directly printed in the [dedicated chart](https://www.rainbird.com/media/4170), p2, and current-site-linked [2023 domestic catalog](https://www.rainbird.com/media/15300), p50. Same-row 1.40 and 1.47 m³/h corroborate them; the imperial GPM grid also agrees within rounding. The [2023 tech spec](https://www.rainbird.com/media/4668), p3, has erroneous 16.72 and 15.08 L/min cells. The remaining 58 metric rows match. The standard-speed data are kept separate from high-speed Falcon tables. Arc, 102 mm rise, 1-inch female inlet, SAM 3.1 m holdback, SS/NP variants and 25% radius-reduction rule were rechecked.

**8005.** All 79 L/min rows match the [current technical specification](https://www.rainbird.com/media/4636), dedicated chart and 2023 catalog p53. Every value is corroborated by its own imperial GPM grid mapped to the printed bar pressure: maximum difference is **0.03462 L/min**. Some m³/h cells differ by several litres/minute, so that secondary unit column is normalized from the corroborated published L/min, not used to change flow. `8005-imperial-corroboration.json` preserves every bracket, comparison and raw value. This diagnostic interpolation does not create new catalog pressure rows. The 50–330° or 360° arc gap, 127 mm rise, 1-inch female inlet, SAM 3.1 m and all twelve nozzle colors were verified. Current 2023 spec explicitly says black standard cover; the old green-cover spec was not used.

## Spray bodies and compatibility

The [1800 Tech Spec](https://www.rainbird.com/media/13671), pp1–4, and [current product page](https://www.rainbird.com/products/1800-series-spray-sprinkler-bodies) verify all existing 19 body models and the two new short PRS models. SAM operating minimum **1.7 bar stays unchanged**: the generic product-page 1.0 bar statement must not replace the specific SAM requirement. Base/PRS models retain 1.0–4.8 bar. PRS30 regulation requires **35–70 psi inlet** and P45 requires **50–70 psi inlet**; below those thresholds, the manufacturer allows pressure loss up to 6 psi, so a nominal outlet cannot be assumed.

All bodies use a 1/2-inch NPT female pipe inlet. Side inlets belong only to 1806/1812 base, PRS and P45 models; SAM models use the bottom inlet. SAM holdback is 4.2 m. The pipe inlet does not identify nozzle-interface thread dimensions.

The [current official R-VAN listing](https://store.rainbird.com/r-van24-17-24-ft-adjustable-rotary-nozzles-45-to-270-degree.html) explicitly excludes 1802 and 1803 bodies. R-VAN was removed from 1802's compatibility series and omitted on the two new short bodies. The parallel nozzle audit supplies the nozzle-side exclusion; the shared body-family ID alone must not override it.

## Colors and mechanical variants

`color-evidence.json` supplies all 94 nozzle colors; `appearance-evidence.json` separates body/cover colors from nozzle colors. Blue is the entire 3500 and standard/low-angle 5000 nozzle tree. 5000 MPR is explicitly red / green / beige for 25 / 30 / 35 feet. Falcon/8005 use black, light blue, dark green, grey, beige, light green, dark brown and dark blue for #4–18; 8005 adds red, yellow, orange and white for #20–26. Current chart colored dots are corroborated by named official parts listings. The 1800 orange element is a removable flush plug, not a permanent nozzle identity. 5000 Plus has a green cover; PRS casing identification is separate. Model options and current listed SKUs are in `model-variants.json`.

## Remaining unknowns and source limits

- Reduced-radius flow is not published for the audited rotors. Keep `flowPolicy: unknown`; never scale flow by radius or arc.
- The unused 3500 outer reduction claim remains 25% versus 35%; only the supported 25% envelope is exposed.
- The 26 conflicting precipitation fields remain null.
- No quantified 8005 radius-reduction envelope was found in the current reviewed documents.
- No manufacturer hex color specification was found.
- Factory SAM/SS/NP/shrub/FC bundles are described in variant evidence but are not fabricated as additional hydraulic catalog records.
- The currently linked commercial catalogs resolve to 2023. The 2026 PDF is the consumer-products catalog and has no 3500/5000/Falcon/8005 performance tables; its date does not supersede those sources.

`source-manifest.json` records exact official URLs, resolved URLs, byte sizes and SHA-256 hashes. The proposed JSON passes unique-ID, retained-row-count, positive hydraulic value, unit-consistency, null-cell-count and color-provenance checks. No app code, deployment or checkout files were modified.
