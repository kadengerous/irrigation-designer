# Catalog coverage symbols — 2026-10-10

Scope: the library's coverage thumbnails and corresponding descriptions in cards,
the inspector, and the manufacturer's performance table. The baseline is Sites
version 448, source `37b7685b73205cdd83701759f86cac19fee3db9e`.

## Cause and display rules

The old thumbnail received only a maximum angle, a strip rectangle, or a square
fraction. Its minimum displayed angle was 40°. A point bubbler's internal 0°
placeholder therefore became a fabricated wedge. The caption independently
printed that placeholder as a real sector.

Coverage is now interpreted from the complete catalog item:

- Local flood/trickle/umbrella bubblers use a local-discharge symbol, with no
  calibrated radius, enclosing coverage circle, or sector angle.
- Discrete stream bubblers use stream strokes rather than a filled area.
- Circular patterns retain their actual angle, including angles smaller than
  40°. Adjustable ranges with a zero lower endpoint remain valid ranges.
- Strips retain their width-to-length ratio and the nozzle's offset.
- SQ patterns retain the quarter, half, three-quarter cutout, or full square.
  Their dimensions are derived from the existing side-offset definition.
- Unconfirmed geometry uses a neutral symbol. In particular, K-Rain High-Low
  entries must not be presented as point bubblers merely because their stored
  fallback kind is `point`.

Thumbnails indicate shape, not a common real-world scale across different
products. Existing catalog hydraulic values and canvas simulation are unchanged.

## Catalog audit coverage

The inventory contains 613 records: 136 bodies and 477 emitters. Of the emitters,
461 are currently placeable. Shape inventory: 384 circular, 51 strip, 13 stream,
4 square, and 25 stored point entries. The point entries include 23 local
bubblers and two unconfirmed K-Rain High-Low geometries. Unsupported entries
remain unsupported.

## Manufacturer references checked

- [Rain Bird 1400](https://www.rainbird.com/products/1400-series-pressure-compensating-bubbler)
  describes trickle and umbrella discharge. Its 0.3–0.9 m spacing is not a
  per-model calibrated radius and is not converted into one.
- [Rain Bird bubbler technical specification](https://www.rainbird.com/media/4631)
  distinguishes these local patterns from nozzle radius performance tables.
- [Hunter bubbler models](https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles)
  distinguishes PCN/PCB/AFB local discharge from MSBN stream nozzles; the V
  versions have two streams and 5-CST-B has two opposed streams.
- [K-Rain bubblers](https://www.krain.com/bubblers) describes root-zone watering
  for TB models. Existing Toro strip and sector geometry is checked directly
  against the catalog's already-audited shape parameters.

## Verification

The dedicated catalog coverage tests exercise every catalog record, including
unsupported geometry and all four manufacturers. The visual contact sheet uses
the actual React-rendered SVG component, rasterized by the native canvas
library, with normal-size and enlarged examples. This is an offline component
check, not an interactive browser test.

Additional gates: card interaction and pressure/SQ presentation regressions,
20-language reference localization, independent unit preferences, TypeScript,
and the native Sites production build.

The final component/localization regression run passed 37/37 tests, and the
TypeScript check passed. All 36 examples on the native SVG contact sheet were
visually inspected. The legacy localization harness reports an unavailable HMR
socket in this sandbox; its offline assertions still completed successfully.
