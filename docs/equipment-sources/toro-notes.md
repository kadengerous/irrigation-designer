# Toro research, verified 2026-10-04

All authored files are confined to this folder. All hydraulic numbers come from official Toro files, reached from current toro.com and specifier.toro.com product pages. Their current document downloads use the official cdn.thetorocompany.com asset host; no third-party product values were used.

## Ready data

- `catalog-items.json`: 257 CatalogItem-compatible records; 204 spray nozzle variants, 13 complete T5 rotor/body models, 40 570Z body models. IDs are `toro:MODEL`, original SKU in `modelId`. 255 records Verified; PSN15-F and PSN15T-F Needs Review. 1,596 performance rows including repeated thread/body variants.
- `toro-psn-current-performance.json`: latest PSN-SS-CHARTS26-ONLY chart, 102 male/female variants, 408 rows. Exactly 45 sector patterns and six strip patterns, each at 20/30/40/50 psi, repeated across the two thread forms. 26-1045-IRC supplies current model list and operating specs.
- `toro-psn-o-model-performance.json`: explicitly named O-* older/base models from 25-1045-IRC, 102 variants / 408 rows. O models still appear in the current 2026 price list. They are not claimed discontinued. Keep separate from PSN+; their data differ.
- `toro-psn-plus-dedicated-performance.json`: dedicated PSN+ data from 25-1045-IRC pp 4-5: 30 male/female variants / 150 rows (5 nominal radii, Q/H/F, five pressures 30/40/50/60/70 psi). This older reference is deliberately NOT unioned into the 2026 catalog rows.
- `toro-t5-nozzle-performance.json`: all 12 inserts, 60 rows from current linked 20-1009-IRC: 8 standard at 25 degrees, 4 low-angle at 10 degrees, five pressures 25/35/45/55/65 psi. Current catalog repeats these unchanged for each complete rotor model.
- `toro-570z-body-models.json`: 40 exact pop-up body SKUs from 22-1021-IRC; basic/LP, PR, XF, PRX, check valve and side-inlet variants. Only explicitly printed combinations were used.
- `toro-t5-body-models.json`: 13 literal current rotor model rows, with 127 mm lawn/stainless, 12-inch high-pop (304.8 mm converted), and shrub versions (zero pop-up travel).
- `source-conflicts.json`: all six disagreeing common-pressure rows for PSN15-F and PSN15T-F (three pressures times two threads).

## Essential interpretation

The specifier price-list URL ending `2025.pdf` currently contains a **2026** price list. It explicitly describes sector PSN codes as PSN Plus with Debris Guard. The latest main product page provides the 26-1045-IRC sell sheet and 2026 chart; those define the catalog's PSN namespace. A still-live older filename `16-1045-PSN-Sell-Sheet.ashx` currently contains 25-1045-IRC, with separate O and PSN+ tables. URL filenames alone are not document dates.

The PSN15-F latest 2026 row at 30 psi says 2.31 gpm, 15.0 feet. The dedicated PSN+ 2025 table says 1.94 gpm, 14.1 feet. At 40 and 50 psi the values differ too. The current catalog retains the latest values but flags both thread variants Needs Review. Do not silently merge, average, or label them wholly verified. No other overlapping current/PSN+ row conflict was found.

PSN operating envelope is 20-75 psi, but the current table only covers 20-50 psi. Recommended pressure is 30 psi in the current sell sheet; the generic web page says 30-40 psi. Use the specific sell sheet. The catalog's recommendedPressureMin/Max uses the measured-table interval; the full operating envelope is preserved in raw fields. Do not extrapolate table values to 75 psi.

The older O-model bidding specification explicitly allows up to 25% reduction of the **original designated radius**, maintaining precipitation. That supports `matched-precipitation` for sector O models only. It does not provide measured reduced-radius flows. Newer PSN+ documents examined do not repeat the reduction law, so PSN+ has minimumRatio 1 and unknown flow policy. No strip-resize law was inferred.

T5 arc range is 40-360 degrees; current recommended pressure is 45 psi, current range is 25-65 psi. It is a reversible full-circle rotor. Current 20-1009-IRC controls over older sheets with 25-70 psi. The generic T5P5.0 web page has a field `Pressure Regulation 45 psi`; no regulation device is established in the detailed documentation, so no integrated regulator is invented. April 2015 official T5 RapidSet bidding spec allows 25% radius reduction but gives no changed-flow law. This is encoded with `flowPolicy: unknown`. Published precipitation is based on 180-degree operation and head-to-head spacing. Use actual flow unchanged when varying arc only; precipitation changes with watered angle, not total nozzle discharge.

## Strip geometry

Visually inspected diagram in the 2026 chart, saved locally as psn-strip-origin.png. LCS nozzle is at the left corner of the long edge; RCS at the right corner; SST is at the midpoint of the long edge. The patterns are NOT center-origin rectangles. Catalog local coordinates reproduce the manufacturer figure with x right and y down: LCS `{ox:0,oy:-w}`, RCS `{ox:-l,oy:-w}`, SST `{ox:-l/2,oy:-w}`. At zero rotation all three rectangles extend above the head, as drawn by Toro. All 4-foot widths are converted to 1.2192 m, not guessed 1.5 m. SST 4x30 at 20 psi is 4x28 feet; pressure-specific dimensions are retained.

The old app schema requires numeric radiusM and arcDeg even for rectangular nozzles. Catalog rows use along-strip extent (length for corner strips, half length for SST) and arcDeg 180 solely as compatibility metadata; actual rectangle and origin are authoritative. These must not be displayed as a manufacturer circular radius or angle. Raw normalized strip rows retain widthM/lengthM and null arcDeg, with no radiusM. Parent integration should consider exposing dimensions instead of these compatibility fields.

## Thread and body compatibility

Toro male nozzle variants have T after nominal size in PSN models and O-T prefix for O models. **570Z uses a female nozzle outlet and requires a male Toro nozzle**. Do not conflate nozzle threads with the independent 1/2-inch NPT female pipe inlet. Official bidding specification gives O female nozzles 5/8-27 UNS female thread (fits matching male stem), and O-T male nozzles 5/8-28 UNS male thread (fits matching female stem). Current PSN sell sheet verifies equivalent male Toro/female variants but does not separately print thread dimensions; current catalog labels thread gender rather than inventing exact new thread dimensions.

570Z compatibility with male Toro Precision nozzles is explicitly confirmed by current price-list heading and older official bidding specification. Female PSN and O models are explicitly listed for Rain Bird, Hunter and Irritrol spray bodies. No new cross-brand body IDs were guessed: their compatibleBodyFamilyIds is empty and nozzleThread is female. Integration should match this only to separately verified female-nozzle-compatible bodies. The supplied 40 Toro 570Z bodies safely serve the 102 male nozzle variants. No Toro body accepting female spray nozzles was verified.

570Z PR/PRX regulation is 30 psi (exact converted 2.068427 bar); LP is a low-pressure sealing spring variant and does NOT mean a pressure regulator. Heights 50/75/100/150/300 mm are Toro's nominal metric values on the current product page, with published inches and exact conversions also retained in the raw file. Check valves are not compatible with side inlet or shrub models in current body specification. No impossible combinations were generated.

## Sources

- https://www.toro.com/en/product/Precision-Series-Spray-Nozzles
- https://cdn.thetorocompany.com/api/assetstorage/623_40a88c26-9e2a-4212-918c-b86a065f0536 (26-1045-IRC PSN sell sheet)
- https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e (2026 PSN performance chart)
- https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx (actual content 25-1045-IRC)
- https://specifier.toro.com/cads/nozzles/precision_series_nozzles.doc (O-code bidding spec, precise threads and radius rule)
- https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf (actual content 2026 price list)
- https://www.toro.com/en/product/T5P5-0
- https://cdn.thetorocompany.com/api/assetstorage/623_82540b95-decc-419e-981e-b9f5fb6dfa25 (20-1009-IRC, all T5 hydraulic rows)
- https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Rotors/T5-RapidSet-Series/T5-RapidSet-Series-Sprinkler-Bidding-Specs.ashx (April 2015 RapidSet radius limit)
- https://media.toro.com/CatalogDocuments/Specifications/T5-bid-spec.pdf (December 2013, explicit head-to-head and shrub standard check valve)
- https://www.toro.com/en/product/570Z-Series
- https://cdn.thetorocompany.com/api/assetstorage/623_d96f613f-4053-4dcd-887c-4b324d0cb3d3 (22-1021-IRC, 570Z model list)
- https://psn.toro.com/ (current male/female retrofit compatibility)

The older 2013 T5 installation PDF is preserved but NOT substituted for current performance: its standard #6.0 45 psi radius is 44 feet, while current 20-1009-IRC is 46 feet. Current US table wins. All current published table rows are preserved; no metric pressure interpolation or hydraulic sqrt formula was substituted for measured data.
