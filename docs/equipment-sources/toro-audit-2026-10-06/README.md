# Toro catalog and simulation audit — 2026-10-06

Follow-up: the PSN15-F / PSN15T-F source-priority question below was resolved
in the [later audit](../recheck-2026-10-06/README.md). This document preserves
the initial pass.

Scope: every Toro entry currently in IRRI: 204 spray/strip nozzle variants, 13 T5 rotor models and 40 570Z bodies. This is an audit of the installed catalog, not a claim that IRRI contains every Toro product.

## Source checks

All 1,596 catalog performance rows were independently compared with official source tables: 408 current PSN rows, 408 O-model rows and 780 T5 rows (60 distinct nozzle rows across 13 body variants). Pressure, radius, flow, square and triangular precipitation match; no numerical performance-table cells were replaced. The source rows, model/row checks, source URLs, dates, hashes, color evidence and field-level proposals are retained beside this file.

The 2026 catalogue confirms the O namespace remains distinct from PSN+. Neither thread variants nor O versus PSN+ were deleted or merged. Four exclusive tabs cover every available nozzle/rotor exactly once: Precision+ Spray Nozzles (90), Precision Spray Nozzles (90), Strip Nozzles (24), T5 RapidSet Rotors (13). No empty rotary/bubbler/specialty tabs are shown for Toro. Old category preferences map to valid new categories on phone and tablet/desktop.

## Corrections and display

- Seven 570Z LP variants: minimum body pressure corrected from 20 to 15 psi, as specified in 22-1021-IRC and the 2026 catalog. This does not extrapolate nozzle performance below its measured range.
- Three T5 CK variants: nominal metadata radius now matches the selected factory nozzle's 45 psi row; runtime defaults already used the actual selected row.
- Ninety O sector variants: minimum radius uses 75% of the original designated model radius. It no longer increases with the pressure-row throw. The existing matched-precipitation discharge model remains explicitly an estimate. No O adjustment rule is applied to PSN+ or strips.
- All 96 Toro strip rows expose both published layout-rate columns. Labels distinguish strip square/triangular layouts; the time for a target depth is a reference calculation from the table's square-layout rate. Toro does not specify precise strip spacing/overlap in these tables: no single-nozzle or 50% overlap claim is made, and zone compatibility is unchanged.
- Verified nozzle colors: 5 ft red, 8 ft green, 10 ft blue, 12 ft brown, 15 ft black, strips gray. Hex swatches approximate the named colors. T5 sectors/card symbols use documented dark-gray or lavender cap colors. Per-size T5 nozzle colors remain Unknown; the nozzle picker never borrows the cap color as a nozzle code.
- Color updates are presentation-only for matching saved models; saved hydraulic snapshots are not migrated.

## Unresolved source conflicts

PSN15-F and PSN15T-F still disagree between the current consolidated chart and the dedicated PSN+ tables, including the 2026 catalog. Both flow and radius are affected. Their raw rows remain inspectable, with Needs Review status; calculations and simulated coverage are withheld.

For T5S-RS and T5SE-RS, older bidding specifications and a current product page disagree about the shrub check valve. CV is removed from confirmed features and explicitly listed as unverified. Verified hydraulic data remains usable. Shrub installation is a riser with zero pop-up travel; no separate spray body is recommended.

## Simulation

Supported Toro spray sectors, pressure-dependent strip rectangles/origins and T5 sweeps use the selected nozzle, pressure, arc, radius and rotation. Unsupported pressure/nozzle/arc/radius and disputed geometry never produce simulated coverage in plan, export or diagnostics. T5 full-circle operation reverses at 360 degrees, per the official [T5 bidding specification](https://media.toro.com/CatalogDocuments/Specifications/T5-bid-spec.pdf); other full-circle mechanisms keep their existing behavior. A 359-degree sector no longer wraps droplets through its unwatered gap.

Particles, flight times and rotation period remain illustrative, not measured pressure-dependent ballistics or uniformity. Blue animated water is separate from equipment identification colors.

## Validation

`scripts/toro-audit.test.mjs` exercises all 1,596 rows, category completeness, bounded interpolation, actual-arc precipitation scaling, invalid configurations, every model/nozzle preview at low/high published pressure and multiple rotations, strip origins/areas, full-circle reversal, reference runtime, reduced-radius semantics, LP limits, unresolved accessories, automatic selection, and saved-model colors. Existing multibrand, Rain Bird, library interaction, pressure controls, twenty-language and independent-unit checks also pass. TypeScript and production packaging are checked before publication. Browser visual QA remains unavailable due to the session's policy-verification block.
