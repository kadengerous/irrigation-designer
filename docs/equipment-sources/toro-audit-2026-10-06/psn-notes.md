# PSN audit — 2026-10-06

## Result and scope

All **102 current PSN model variants / 408 performance rows** match the freshly fetched, currently linked **PSN-SS-CHARTS26-ONLY** table. This covers 45 circular patterns and six strip patterns at four measured pressures, duplicated for male/female threads. No numeric catalog corrections are proposed. All 102 model identities appear in the current 2026 price list; all 102 color, thread, fixed-arc, trajectory, measured-pressure range, operating-pressure range, and geometry checks pass. Sparse proposals only clarify the two unresolved model notes.

`psn-row-checks.json` independently parses the PDF numeric columns, converts exact US units, and compares every catalog row. `psn-source-rows.json` contains all 204 unique published rows. Schema-only strip radius/arc values are explicitly distinguished from the manufacturer footprint in the notes below. `psn-model-checks.json` and `psn-color-evidence.json` cover every model. `psn-audit.py` reproduces the checks without writing to the checkout. No browser or Site tools were used.

## Conflict remains: PSN15-F / PSN15T-F

The current single-sheet chart says at 30/40/50 psi respectively: flow 2.31/2.35/2.40 gpm, radius 15.0/15.2/15.3 ft. Dedicated PSN+ data in 25-1045-IRC pp 4–5 instead say 1.94/2.25/2.51 gpm and 14.1/14.5/15.0 ft. Crucially, the newly fetched **official 2026 full catalogue p 79 still repeats the latter PSN+ values**. It is not merely an abandoned 2025 discrepancy. Published precipitation also differs in at least one column at each of these pressures. No manufacturer revision/supersession notice was found that resolves this. Keep both variants Needs Review and hydraulic values unavailable; retain raw rows for inspection, and do not delete only disputed rows then interpolate over the gaps. The other 42 of 45 overlapping unique 30–50 psi rows agree exactly with the dedicated 2025 PSN+ chart. This is six variant rows of contradiction, not six independent physical patterns.

The newer consolidated chart intentionally contains 20 psi plus 30–50 psi data; do not union it with 60/70 psi rows from another table. The 2026 full catalogue also visibly prints 6.5 gpm for PSN5-F at 60 psi; that is outside the current dataset and is another reason not to extrapolate or merge sources mechanically.

## Pressure, arc, reduction and colors

Current 26-1045-IRC p 4: operating 20–75 psi, recommended 30 psi; measured current chart 20/30/40/50 psi. The app's `recommendedPressureMin/Max` currently represents the measured interval 20–50 psi and safely bounds hydraulics. Full operating range remains separately stored. Generic product page 30–40 psi recommendation is less specific than the current sell sheet. No extrapolation above 50 psi is verified by this current chart.

Fixed sectors are 60,90,120,150,180,210,240,270,360 degrees, each a separate SKU. Current sell-sheet model/color table p 3 explicitly identifies nominal 5 ft Red, 8 ft Green, 10 ft Blue, 12 ft Brown, 15 ft Black, special strips Grey. Colors represent radius/pattern families; they do not mean pressure, arc adjustability, or flow. Existing hex values are reasonable display approximations, not measured manufacturer color specifications. Trajectories 5/10/15/20/27 degrees for nominal 5/8/10/12/15 ft and 20 degrees for strips match all current records.

No current PSN/PSN+ document read here states a radius-reduction flow law. The live bidding document states 25% of original designated radius with unchanged precipitation but explicitly identifies O-X-X/O-T-XX models. It cannot safely authorize that rule for new PSN+ IDs. Retain the conservative unknown policy. `minimumRatio:1` means this software enables no unverified reduction; it should not be presented as a manufacturer claim that adjustment is physically impossible.

## Strip footprint and precipitation

Current diagram: LCS originates at the left end of the long edge, RCS at the right end, SST at the midpoint; at start0 the rectangle extends upward in app coordinates. Existing origins are correct: LCS(0,-w), RCS(-l,-w), SST(-l/2,-w). Width is4 ft = 1.2192 m. At 20 psi 4X30-SST measures 4x28 ft, then4x30ft at 30/40/50 psi. All other footprint rows match. These are rectangles, not 180-degree sectors. `arcDeg:180` and radiusM(along-strip extent) are schema compatibility values only; use dimensions for UI/geometry.

Both strip precipitation columns are explicitly printed with square/triangle symbols. Preserve both published columns. The examined documents provide **no precise strip spacing/overlap footnote**; never label them single-nozzle no-overlap rates or assert 50% overlap. Proposed UI wording identifies Toro's square/triangular strip layout and notes that actual intensity depends on spacing. A displayed time derived from these numbers must be described as a reference calculation for that table layout, not an evaluated project schedule.

## Exact current sources

- Main attachment discovery: https://www.toro.com/en/product/Precision-Series-Spray-Nozzles
- Current chart: https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e
- Current 26-1045-IRC sell sheet: https://cdn.thetorocompany.com/api/assetstorage/623_40a88c26-9e2a-4212-918c-b86a065f0536
- Current 2026 catalogue: https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Literature/26-1020-DB-ResCom-Irritrol-Catalog.ashx
- Dedicated 2025 PSN+ table: https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx
- Current 2026 price list despite 2025 filename: https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf
- O-model bidding specification: https://specifier.toro.com/cads/nozzles/precision_series_nozzles.doc

All six downloaded sources have fetch dates and SHA-256 hashes in `psn-source-manifest.json`. Source PDF pages were visually inspected for table headers, model colors, geometry origins and the conflicting 2026 row. The attached API asset host is linked directly by Toro's current product page.
