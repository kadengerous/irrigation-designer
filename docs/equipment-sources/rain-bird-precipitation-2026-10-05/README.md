# Rain Bird precipitation display recheck — 2026-10-05

Scope: all 75 Rain Bird nozzles, bubblers and rotor models currently in the catalog. Body models have no precipitation specification.

## Evidence and outcome

- `spray.json` and `spray-notes.md`: 292 published circular spray rows checked, unchanged; 24 usable SQ no-overlap application rows recovered for display. SQ-HLF remains withheld because published flow/application values conflict.
- `rotors.json`, `rotors-notes.md`, `rotors-row-checks.json`: all 765 rotor/R-VAN rows checked. All 1,504 non-null precipitation cells match the official charts. The 18 R-VAN strip rows have usable published rates for straight-line placement with 50% overlap.
- Thirteen #8 rotor rows still have conflicting printed precipitation values (5004-PC, 5004+PC and 5004+PCR). Raw source cells remain null. The inspector alone offers a clearly labelled approximation from verified flow, full throw radius, actual arc and head-to-head spacing.
- MPR strip nozzles require an actual spacing layout; area application/run time is not applicable to local bubblers. Missing values are not filled with fabricated square/triangular data.

## Calculation and separation of source data

For the explicitly labelled rotor approximation, with Q in L/min, radius R in metres and actual arc A in degrees:

`square_mm_per_hour = 60 × Q × 360 / (A × R²)`

`triangle_mm_per_hour = square_mm_per_hour / (√3 / 2)`

Runtime in minutes is `60 × target_depth_mm / application_mm_per_hour`. The inspector labels the application basis used for runtime. Published square and triangular rates remain unchanged; SQ uses its published no-overlap rate and R-VAN strips their published strip rate. Interpolated values are identified. Unknown reduced-radius hydraulics and out-of-range pressure never receive a fallback estimate.

Official method references:

- [Rain Bird sprinkler spacing patterns](https://www.rainbird.com/professionals/irrigation-design-tip-sprinkler-spacing-patterns)
- [Rain Bird precipitation and runtime formulas](https://www.rainbird.com/media/2428)

The runtime display helper does not mutate performance tables, saved equipment snapshots, zone grouping, simulated discharge or project pressures. The expandable reference table continues to show source values, with distinct square/triangular, strip or no-overlap labels.

## Related interface changes

Integrated rotors no longer recommend their own included body; pop-up height selection remains. Source links use the actual manufacturer. Pressure selection retains manufacturer checkpoints; the duplicate numeric input is removed. Existing intermediate working pressures remain stored unchanged.

Validation includes the focused `rain-bird-precipitation-display.test.mjs` suite, existing Rain Bird simulation/catalog tests, equipment library interactions, pressure/zone controls, Hunter bodies, twenty-language rendering, unit conversions, TypeScript checking and a production bundle. Browser visual QA is unavailable in this session due to the browser policy verification block.
