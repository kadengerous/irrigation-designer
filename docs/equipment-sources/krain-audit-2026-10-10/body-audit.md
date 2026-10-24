# K-Rain bodies, bubblers and group audit — 2026-10-10

All 17 bodies and five Tree Bubblers were compared with fresh official sources. The existing dimensional, interface and nominal-flow fields agree: Pro-S 11, NP two, K-Spray four; four fixed bubbler flow values. No pressure-specific flow rows are published for these products. Complete model and group inventories accompany this report.

## Bodies

The [2026 catalog](https://www.krain.com/content/files/images/landingpages/catalogs/2026%20product%20catalog%20english.pdf), printed pages 29–33, distinguishes nominal model height from actual riser stroke. Existing millimetre values correctly use the latter. Pro-S/NP receive female nozzles; K-Spray receives male nozzles. These mechanical interfaces do not establish zone precipitation compatibility. Bare bodies have no discharge or wetted footprint of their own; their UI pressure default is not a manufacturer recommendation.

The [Pro-S Rev.10 brochure](https://www.krain.com/content/files/images/landingpages/sprays/pro-s%20sprays/pros%20sprays%20product%20brochure.pdf) corroborates the general 110 psi body rating. However, the currently linked, undated model-specific [PR30 specification](https://www.krain.com/content/files/images/landingpages/written%20specifications/pro-s%20sprays%20pressure%20regulator%20pr30.pdf) and [PR40 specification](https://www.krain.com/content/files/images/landingpages/written%20specifications/pro-s%20sprays%20pressure%20regulator%20pr40.pdf), page 1, guarantee their nominal outlet only through 100 psi inlet. Proposed separate `nominalRegulationMaxInletBar:6.9` preserves the 7.6 bar mechanical limit while avoiding extrapolation of regulation. Neither document supplies a minimum inlet differential. The specifications identify a removable blue flushing cap, not an installed nozzle colour; no body sector should adopt that shipping-cap colour.

The [NP Rev.02 brochure](https://www.krain.com/content/files/images/landingpages/sprays/np%20sprays/np%20sprays%20product%20brochure.pdf) pairs 70 psi with an incorrect 3.5 bar. The current catalog and the correct conversion support retaining 4.8 bar. The [K-Spray brochure](https://www.krain.com/content/files/images/landingpages/sprays/k-sprays/ksprays%20product%20brochure.pdf) independently confirms its interface and body range.

## Bubblers and missing data

The [current category](https://www.krain.com/bubblers) confirms all five models and the four fixed nominal flows. These are local umbrella applications, not rotating streams or circular spray sectors. Spacing is not throw radius. Retain point geometry, no area precipitation, and no radius-sector autoselection.

TB-ADJ cannot be assigned one verified flow. Its [product page](https://www.krain.com/bubblers/bubbler-adjustable-tb--adj) conflicts between title and description; the [Rev.02 brochure](https://www.krain.com/content/files/images/landingpages/bubblers/bubblers%20product%20brochure.pdf) gives another range, and the current catalog's US and metric ranges disagree. No setting-specific curve resolves this. Preserve `Needs Review`, unknown flow and no invented constant compensation. The brochure also pairs 50 psi with an incorrect 2.8 bar; retain current-catalog 3.5 bar. Existing black appearance is not a manufacturer flow colour code. Fresh screenshot retrieval did not expose inspectable pixels, so colour verification dates are deliberately not refreshed.

## Compatibility inventory

All 70 placeable records have exactly one destination: RN 15, KVF6 one, KVF 8–17 five, KV five, fixed 24, strips six, rotors nine, bubblers five. There are no duplicates or unassigned placeable records. Two high/low strips remain intentionally excluded because no unambiguous single footprint is published. Fifty-six sector models are eligible for automatic radius/sector selection; the nine strips and five bubblers require their own manual geometry.

Keep KVF6 separated; use actual settings for KV/KVF/fixed/rotors and layout-specific checks for strips. Shared thread alone is insufficient. RPS Select also requires nozzle/arc matching, which the rotor audit covers.

Old and Fully Adjustable RN each have a manufacturer matched-precipitation claim. Neither freshly inspected source explicitly guarantees every cross-generation combination. Their common library group can remain, with current zone compatibility checks. The [Fully Adjustable page](https://www.krain.com/fully-adjustable-rotary-nozzles) recommends 2.8 bar while the dated 2026 catalog explicitly recommends 2.1 bar: retain the catalog value and record the conflict. Do not normalize these distinct working pressures together. The [older rotary specification](https://www.krain.com/content/files/images/landingpages/written%20specifications/rotary%20nozzle%20product%20specifications.pdf) concerns a previous 90–270° generation and cannot establish unrestricted mixing with the new generation.

Research used native web access only. No application or catalog files were edited by this evidence pass. Proposed additions and verification-date changes are in `body-recommended-patches.json`; unresolved manufacturer conflicts remain explicit.
