# Toro T5 and 570Z audit — 2026-10-06

Scope: every existing 13 T5 rotor records and 40 570Z body records. Read-only checkout. No changes to synced sources, no browser-policy bypass, no deployment. The 2026 manufacturer catalog and price list were freshly downloaded by the parallel audit agent; this audit independently read the relevant pages and rendered catalog pages 69, 102 and 103 for visual checks.

## Result and files

- `rotor-proposed-patches.json`: sparse per-item fields and per-nozzle color-name patches. No hydraulic row replacements.
- `rotor-source-rows.json`: all 60 distinct published rows, original US units and exact-conversion normalized values.
- `rotor-row-checks.json`: all 780 stored rows checked, including pressure, radius, flow and both precipitation fields — 6,240 numeric cells. All match within 0.00000101, allowing the existing six-decimal conversion precision.
- `rotor-model-checks.json`: all 53 model checks, exact SKU corroboration in the 2026 price list, and individual field notes.
- `rotor-color-evidence.json`: cap/body color evidence and explicit unknown nozzle-color status.
- `rotor-source-manifest.json`: official links, retrieval method, available file hashes, source dates and visual inspection record.
- `rotor-catalog-page-{69,102,103}.png`: rendered source pages actually inspected.

## Concrete corrections

1. Seven LP bodies have a 15 psi minimum, not 20 psi: 570Z-2LP, 3LP, 4LP, 6LP, 6LPSI, 12LP and 12LPSI. Corrected minimum is 1.034214 bar. Both current sell sheet p4 and 2026 catalog p69 agree. LP describes low-pressure sealing, not an outlet regulator.
2. Three default design-radius values were inherited from nozzle 3.0 despite different selected defaults: T5PCK1.5-RS becomes 10.668 m, T5PCK2.0-RS and T5PCK2.5-RS become 11.2776 m, each at the documented 45 psi recommendation. Measured table rows were already correct. This only aligns `rNom` with the configured default nozzle.
3. T5S-RS and T5SE-RS currently claim a confirmed check valve. The December 2013 spec says all shrub models include Check-O-Matic; the live T5S-RS page says no check valve, while also incorrectly repeating lawn-model pop-up copy. Current catalog descriptions say shrub without resolving CV. Remove CV from confirmed `bodyFeatures`, preserve `unverifiedBodyFeatures:['CV']`, keep verified hydraulics and geometry. This uncertainty concerns an accessory, not nozzle discharge.
4. Add explicit `mountingKind`: integrated for 11 pop-up rotors, riser for the two shrub rotors, spray for the 40 nozzle bodies. Shrub `popUpMm:0` means no pop-up travel, not a zero physical body height.
5. Verify presentation colors at the correct scope: non-effluent RapidSet turret caps are dark gray; effluent covers lavender; 570Z body caps black. Hex values are approximate display swatches. `colorSourceKind:'cap'` prevents a cap label from becoming a false nozzle color claim. The 12 T5 insert sizes remain `Unknown` for nozzle colors; official specs identify them by molded flow numbers. The red 570Z shipping flush plug pictured in the catalog is not an installed nozzle color.

## Hydraulics and boundaries

All 60 distinct rows in the current linked [20-1009-IRC sell sheet, p3](https://cdn.thetorocompany.com/api/assetstorage/623_82540b95-decc-419e-981e-b9f5fb6dfa25) are reproduced unchanged in the [2026 Toro/Irritrol catalog, p103](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Literature/26-1020-DB-ResCom-Irritrol-Catalog.ashx). The printed precipitation columns are triangle then square. All 1,560 stored precipitation cells are published values converted from in/h, not derived estimates. The source footnote specifies 180°; head-to-head spacing is stated in the older official bidding specification. There are no missing precipitation cells or unresolved active hydraulic values in this scope.

T5 uses eight standard 25° inserts and four low-angle 10° inserts. Arc is 40–360°, current documented pressure interval 25–65 psi, recommendation 45 psi. A generic product-page field calls 45 psi “Pressure Regulation”; detailed documentation establishes a recommendation, not a regulator. Preserve current measured limits over older 25–70 psi documents. Reversible full-circle rotation does not change total nozzle discharge. Changing arc changes precipitation per covered area, not nozzle flow.

The [April 2015 RapidSet bidding specification](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Rotors/T5-RapidSet-Series/T5-RapidSet-Series-Sprinkler-Bidding-Specs.ashx), p1, permits up to 25% radius reduction. It publishes neither a reduced-radius flow table nor a proportional flow law. Preserve `minimumRatio:0.75, flowPolicy:'unknown'`; no guessed reduced-radius discharge. It also identifies inserts by molded rate markings and states the series standard factory nozzle is 3.0. Current explicit SKU suffixes and the 2026 price list override that old default where applicable.

The two `-LN` variants are explicitly Less Nozzle in the current model code and price list. Their 3.0 app default is a design selection, not a factory-installed nozzle claim. Existing UI uses “default nozzle”, so no removal of its design default was proposed. Explicit 1.5/2.0/2.5/3.0 SKUs and current high-pop product pages corroborate remaining defaults. T5SE-RS keeps the documented series 3.0 default; its dedicated current page could not be retrieved.

For 570Z, use [22-1021-IRC](https://cdn.thetorocompany.com/api/assetstorage/623_d96f613f-4053-4dcd-887c-4b324d0cb3d3), pp1/3/4, and 2026 catalog pp68–71. Heights are Toro nominal metric 50/75/100/150/300 mm, not careless inch conversions. PR/PRX nominal output is 30 psi (2.068427 bar); no separate minimum regulator inlet or pressure-drop curve was found. The 20 psi body operating minimum cannot imply 30 psi regulated output below 30 psi input. Retain the runtime physical input-pressure constraint. COM check valves hold back 10 ft and are explicitly incompatible with side-inlet bodies. The exact 40 combinations all appear in official lists; no imaginary combinations were generated.

570Z-3P-PR is absent from 2026 catalog p69 but present in current sell sheet p3 and 2026 price-list PDF p6; omission is not discontinuation. All 53 audited SKUs were found individually in the 2026 price list (its filename ends 2025). Newly listed additional variants are outside this existing-record audit.

## Compatibility and remaining uncertainty

570Z takes male Toro nozzle threads; its nozzle outlet is female. Do not confuse that with the separate 1/2-inch NPT female pipe inlet. The [official O-nozzle bidding specification](https://specifier.toro.com/cads/nozzles/precision_series_nozzles.doc) corroborates the 5/8-28 UNS female stem for male Toro inserts. T5 uses its own interchangeable rotor inserts and a 3/4-inch NPT female inlet; it is an integrated sprinkler, not a 570Z-mounted spray nozzle.

Two additional official-source differences do not affect currently stored calculations: the generic 570Z page lists flow 0.05–4.5 gpm and 25–50 psi recommended operation, while the detailed current sell sheet gives 0.5–4.5 gpm and operating limits 20–75 (15–75 LP), with 30 psi spray and 45 psi rotating-nozzle recommendations. No independent body discharge curve is published, so do not turn either generic flow range into nozzle hydraulics. The body has no intrinsic spray radius or precipitation; attached-nozzle data supplies those values.

Remaining unsupported facts: per-size T5 nozzle color code, reduced-radius flow law/table, and separate PR/PRX regulator minimum-inlet/drop curves. Two shrub CV accessory fields remain explicitly disputed. None of these justifies changing verified full-radius nozzle flow, inventing a curve, or blocking all 780 measured rows.
