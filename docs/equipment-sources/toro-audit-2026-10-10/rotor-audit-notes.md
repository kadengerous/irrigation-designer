# Toro T5 RapidSet and 570Z audit — 2026-10-10

Scope: the current catalogue's 13 T5 models and 40 570Z bodies. No application or catalogue file was edited by this audit. Other Toro families are audited separately.

## Result and coverage

- All 13 rotors carry 12 nozzle configurations: 156 model/nozzle entries, 780 pressure rows, 60 unique manufacturer rows. All 6,240 stored numeric cells match fresh official source values after SI conversion to six decimals (tolerance 0.00000101).
- All 40 body records pass pressure, nominal height, model feature and thread checks. All 53 exact model identifiers also occur in the current official 2026 price list. Additional SKUs in that list are outside this task's existing catalogue scope.
- No radius, flow, pressure or precipitation correction is proposed. All 120 unique precipitation cells are consistent with printed whole-foot radius, two-decimal flow and rate precision; diagnostic arithmetic does not replace published numbers.
- `rotor-check.py` reproduces the row, model and body comparisons. Evidence and exact comparison results are in `rotor-source-rows.json`, `rotor-row-checks.json`, `rotor-model-checks.json`, `rotor-body-checks.json` and `rotor-precipitation-checks.json`.

## Current T5 rules

The [current linked T5 sheet](https://cdn.thetorocompany.com/api/assetstorage/623_82540b95-decc-419e-981e-b9f5fb6dfa25) has 25–65 psi operating limits, 45 psi recommendation, 40–360° arcs, eight standard 25° and four low-angle 10° nozzles. Every stored pressure row lies within operating limits. Standard nozzle names are 1.5/2.0/2.5/3.0/4.0/5.0/6.0/8.0; low-angle names 1.0LA/1.5LA/2.0LA/3.0LA. Table column order is triangular then square. Factory sizes encoded in exact SKUs are respected; a selected nozzle for a less-nozzle `LN` SKU is an application choice, not a factory-installation assertion. No pressure regulator is documented for these T5 bodies.

The [RapidSet bidding specification](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Rotors/T5-RapidSet-Series/T5-RapidSet-Series-Sprinkler-Bidding-Specs.ashx) permits 25% radius reduction. Keep `minimumRatio: 0.75` and `flowPolicy: unknown`; no reduced-radius discharge curve was found. The variable stator concerns rotation speed and must not be interpreted as constant discharge or pressure compensation.

The [installation manual](https://www.toro.com/getpub/128192), form 373-0765 Rev. A, explicitly bases rates on half-circle operation and spacing equal to half the diameter. A changed arc does not mean changing the same installed nozzle's discharge. Derived rates for other arcs must remain distinguishable from published 180° values.

## 570Z limits and regulation

The [current 570Z sheet](https://cdn.thetorocompany.com/api/assetstorage/623_d96f613f-4053-4dcd-887c-4b324d0cb3d3) supports 20–75 psi for standard bodies and 15–75 psi for the seven stored LP bodies. Fifteen PR/PRX models regulate nominal nozzle pressure to 30 psi; the other 25 have no such regulator. X-Flow closes after nozzle loss and is not a pressure regulator. A 45 psi nozzle recommendation does not change a PR/PRX body's 30 psi setting. No separate minimum inlet pressure for guaranteed regulation or inlet/output loss curve was found; leave that threshold unknown. Do not import another manufacturer's threshold.

COM check valves hold 10 ft of elevation and are incompatible with side-inlet/shrub configurations; no incompatible combination is present among these 40 records. The `nozzleThread: male` field describes the required nozzle, not the body outlet. Heights 50/75/100/150/300 mm are nominal catalogue conventions rather than exact inch conversions.

## Retained uncertainty and document precedence

The [December 2013 specification](https://media.toro.com/CatalogDocuments/Specifications/T5-bid-spec.pdf) explicitly includes RapidSet and reversing full-circle operation. Its older 70 psi upper pressure is superseded by the current dedicated sheet's 65 psi. It also says shrub CV is standard, whereas the [current T5S-RS page](https://www.toro.com/en/product/T5S-RS) says no CV while incorrectly showing lawn pop-up dimensions for the shrub. The current dedicated sheet and exact-SKU price list do not settle this conflict. Keep CV unknown for T5S-RS and T5SE-RS; this accessory uncertainty does not invalidate their shared nozzle hydraulics.

The manual identifies the RapidSet dark-gray turret cover; the older specification explicitly identifies lavender effluent covers. The [2026 price list](https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf) lists the black 570Z replacement cap. Preserve cap-source semantics and approximate display hex values; no individual T5 nozzle-insert color coding was verified.

The current 2026 full catalogue link failed native web retrieval. This report does not claim a fresh full-catalogue read. Current linked dedicated sheets and the current price list were read successfully; the manifest records retrieval failures separately. No blocked browser or CLI network route was used.

## Runtime finding and proposed integration

T5's permitted minimum must be 75% of the selected-pressure row radius. For example, 1.0LA at 25 psi has 7.62 m full throw and a permitted 5.715 m reduced radius. A global 7.62 m family floor incorrectly excludes it. Root's current working-tree change now applies pressure-relative reduction to Toro and isolates the legacy O nominal floor. No runtime change was made by this audit.

`rotor-proposed-patches.json` contains zero required catalogue or row replacements, optional current-manual provenance updates, retained unknowns and focused regression cases. `rotor-source-manifest.json` records source URLs and local extract hashes; `rotor-color-evidence.json` preserves the distinction between verified color names and approximate UI shades.
