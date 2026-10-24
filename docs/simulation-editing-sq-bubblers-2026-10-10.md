# Simulation placement, bubbler appearance and SQ controls

Follow-up to published version 447 (`8824dbad5997f42a2d3a8581bfd29b9a11dad5ac`).

## Placement during simulation

Manual placement now keeps its target and accepts the same mouse/touch canvas
click during global simulation. Existing heads stop intercepting hits while a
catalog item is armed. Placing a head leaves simulation active; the new head is
included in the existing animation immediately. Automatic placement, right/middle
pan, Space, cancellation, pinch suppression, and one-operation undo/redo retain
their existing behavior. Read-only previews remain read-only.

## Bubblers

Point/flood bubblers use compact stationary connected trickles or umbrella jets,
with moving fine breakup instead of expanding rings and round end beads. The
symbol remains screen-local and does not introduce a wetted engineering radius.
Stream bubblers retain their verified throw and fixed directions, with smaller
droplets. In simulation their marker scales down when it would otherwise cover
the entire micro-stream pattern; its pointer hit target is unchanged. The latest
thicker rotary streams and dense spray on ordinary sprinklers remain intact.

The catalog review covers 36 bubbler positions: 22 flood, 6 streams, 3 dual and
5 unverified distributions that remain excluded. Tests retain actual geometry,
pressure validation, flow and saved project values. Native images include the
actual installed white marker, drawn above water. This catches effects hidden
by that marker instead of merely inspecting isolated water paint.

## Rain Bird SQ

The [manufacturer product page](https://www.rainbird.com/products/sq-series-square-pattern-nozzles)
and [SQ specification D42033, 10/21](https://www.rainbird.com/media/13442)
document two throw settings, nominally 2.5 ft / 4 ft, and pressure-dependent
Throw Radius values. The [SQ sheet D42032, 10/21](https://www.rainbird.com/media/13443)
shows QTR/HLF/3QTR/FUL square fractions.

The existing audited geometry treats saved `r` as the offset to a square side.
Derived unrotated dimensions are QTR `r × r`, HLF `2r × r`, FUL `2r × 2r`, and
3QTR outer `2r × 2r` with one quarter omitted. Corner reach is `sqrt(2) × r`.
These are computed dimensions, not a circular watering radius. The inspector now
shows these dimensions, two wrapping throw-setting buttons, and working pressure.
It hides the continuous radius slider and duplicate nozzle select for SQ. A
localized note explains the pressure dependence and the missing 3QTR quadrant.
No performance tables, geometry or hydraulic calculations were changed.

Pressure controls now allocate their recommendation a separate wrapping row;
it no longer competes for space inside a fixed-width pressure point. Default
pressure values are not presented as manufacturer recommendations. Six new SQ
labels are translated in all 20 supported languages; units remain independent.

## Validation

- Automatic/manual placement regression suites: 19 passed.
- Library, SQ geometry/controls, pressure UI, localization and units: 30 passed.
- Water streams, zones and diagnostics: 23 passed.
- New simulation placement and bubbler suites: 8 passed.
- TypeScript validation passed.

Native bubbler frames were inspected at 6/18/36/72 pixels per metre and at two
animation times. All local flood symbols stay visible beyond the installed head
at 6–144 pixels per metre; physical stream patterns remain within their actual
throw. A 0.3 m pattern at 6 pixels per metre is inherently under two pixels in
radius and is not artificially enlarged. Nine-head native paint medians are
approximately 1.62/1.63/2.09 ms at 18/36/72 pixels per metre. These are not browser
FPS measurements. Reproduce with `scripts/render-watering-bubblers.mjs`.

Browser QA remains unavailable after the earlier automatic approval rejection;
no alternate browser or network path was attempted. SQ markup and responsive
layout rules were checked in rendered component tests, including every locale,
metric/US dimensions and bar/psi/kPa pressure units.
