# Rain Bird SQ working settings — 2026-10-10

Baseline: Sites 449, source `e6b9bf6d72c8185f4ab938b0d332879ce2ebd499`.

## Behavior and correction

SQ short/long throw is a mechanical nozzle setting; working pressure is a
separate input. The inspector previously reused the general nozzle-selection
handler, resetting pressure to the nozzle's recommended table point. Selecting
the same throw setting also unnecessarily reset a deliberately chosen pressure.

SQ selection now changes only the nozzle setting. The existing shared store
preserves pressure within the supported nozzle/body range and derives the new
footprint, flow, precipitation and watering time from the selected point. A
second click on the selected setting makes no change or undo entry.

The shared pressure lookup and manufacturer data are unchanged. Both settings
can legitimately have the same flow. For SQ-QTR, the published metric table
gives 0.38 L/min at 1.4 bar, then 0.45 L/min at 2.1, 2.8 and 3.4 bar. SQ-FUL
gives 1.25, 1.51, 1.74 and 1.74 L/min respectively. The footprint and
precipitation still depend on the selected setting. We do not invent a changing
flow on a published plateau or fabricate values for unverified SQ-HLF points.

The existing SQ help text explains the independent inputs and equal-flow cases
in all 20 supported languages.

## References

- [Rain Bird SQ product description](https://www.rainbird.com/products/sq-series-square-pattern-nozzles)
- [D42033 technical specification, page 2](https://www.rainbird.com/media/13442)

## Verification

Regression checks cover real inspector button/radio callbacks and the real
project store, pressure changes, mode changes, undo, calculated totals, and
manufacturer flow plateaus. Existing pressure, head adjustment, SQ interface,
localization and independent-units checks also pass. TypeScript passes.
These are offline component/state checks; no interactive browser run was made.

Results: 4/4 SQ interaction regressions and 21/21 existing pressure, adjustment,
SQ presentation, localization and unit checks passed. SQ interaction coverage
includes all four patterns, both throw settings, 32 published pressure rows,
regulated bodies, undo/redo and an unchanged simulation state.
