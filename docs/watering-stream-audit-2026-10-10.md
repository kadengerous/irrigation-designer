# Watering stream appearance audit — 2026-10-10

This review covers the appearance of the water, not a new hydraulic model. It
supplements `watering-preview-sources.md` and the equipment source audits.
Official manufacturer pages were read with the native web tool. No product video
was measured, and no exact droplet size, stream count, secondary throw ratio,
flight time or rotation period is claimed from those pages.

## Source-backed appearance

| Equipment class | Manufacturer evidence | Rendering interpretation |
| --- | --- | --- |
| Hunter MP Standard, MP800 and related multi-stream nozzles | [Standard MP Rotator](https://www.hunterirrigation.com/en-metric/irrigation-product/mp-rotator/standard-mp-rotator-nozzle) describes rotating streams with multiple trajectories; individual streams serve different distances. The same page emphasizes wind resistance and prevention of misting. | Several narrow connected streams with staggered near, middle and far reaches. Let each stream widen and break into droplets near its end. Small splashes support the visible stream rather than replacing it with a uniform fog. MP800 and strip model applicability remains in the existing model source map. |
| Rain Bird R-VAN, including rotary strips | [R-VAN](https://www.rainbird.com/rvan) describes multi-stream rotation, thicker streams and larger droplets. The [technical specification](https://www.rainbird.com/sites/default/files/media/documents/2021-06/r-van-product-family-tech-spec-5-d41159-01-30-18.pdf) also distinguishes normal operation from misting or fogging. | Connected rotating streams with droplet breakup; rectangular variants keep their pressure-specific footprint. No broad mist cloud or invented overspray beyond the stored coverage. |
| K-Rain Rotary Nozzle Series and Fully Adjustable RN | [Rotary nozzles](https://www.krain.com/rotary-nozzles) identify multi-stream delivery. [Fully Adjustable RN](https://www.krain.com/fully-adjustable-rotary-nozzles) identifies multiple streams and viscous damping across operating conditions. | A rotating stream presentation is supported. Reuse the visual near-to-far stream grammar, while keeping its lane count and relative reaches explicitly illustrative. Do not infer pressure-dependent motor speed from damping language. |
| Toro Precision PSN, PSN+ and legacy O Precision sprays | [Precision Series](https://www.toro.com/en-ca/product/Precision-Series-Spray-Nozzles) describes H₂O-chip oscillation with no moving parts and larger, consistent droplets. The [manufacturer brochure](https://media.toro.com/CatalogDocuments/Product%20Literature/PSN-brochure.pdf) explains that the high-frequency oscillation becomes individually visible under strobe illumination. [Toro's PSN+ introduction](https://newsroom.toro.com/en/news/2025-us/04-25-25-toros-newest-innovation-makes-psn-series-nozzles-even-bettert) confirms the same operating principle. | Keep an apparently stationary fan or strip. Dense fine texture can convey water motion, but a slow rotating or oscillating MP-like head would misrepresent this mechanism. The renderer is not a stroboscopic view. |
| Rain Bird HE-VAN and ordinary stationary spray nozzles | [HE-VAN](https://www.rainbird.com/products/he-van-high-efficiency-variable-arc-nozzles) describes low trajectory, large wind-resistant droplets and gentle close-in watering. Other fixed/adjustable spray classes retain their existing model-specific stationary sector mapping. | A continuous translucent fan with fine radial texture and distributed droplets, stationary in angle. Keep the head's actual sector and throw. Do not give a fixed spray mechanical rotation. |
| Rain Bird U-Series | [U-Series](https://www.rainbird.com/products/u-series-high-efficiency-dual-orifice-nozzles) identifies a second outlet for watering close to the nozzle. The [manufacturer catalog](https://www.rainbird.com/sites/default/files/media/documents/2018-11/TurfCatalog2019-SprayNozzles.pdf) describes the two outlets forming continuous coverage. | A stationary fan with an additional visible close-in layer. This is not a pair of rotating pencil jets; precise relative output is not specified here. |
| Residential and larger gear rotors | [Rain Bird 5000](https://www.rainbird.com/products/5000-series) describes large droplets and close-in watering along its main stream. [Toro T5](https://www.toro.com/en/product/T5P2-0) describes its Airfoil nozzle guiding water below the main stream. [K-Rain SuperPro](https://www.krain.com/superpro-rotary-sprinkler/superpro-with-chlorine-resistant-seal-10003--cr) confirms partial reversing and continuous full-circle operation for that model. | A substantial coherent moving jet, finer trailing water, and progressive spread/breakup farther out. Flight history should follow the direction at emission rather than rotate all airborne water rigidly. Existing catalog flags continue to decide reversal versus continuous rotation for each rotor; do not apply the SuperPro mechanism to all rotors. |
| Hunter forward/opposed multi-nozzle rotors | [Hunter I-80](https://www.hunterirrigation.com/irrigation-product/rotors/i-80) distinguishes forward-facing triple nozzles from the opposing I-80-ON arrangement. The existing source map documents other rotor variants. | Preserve the model's forward/opposed arrangement while adding coherent water paths and breakup to every supported stream. Relative secondary reach and width remain visual parameters. |
| Hunter MSBN and stream bubblers | [Hunter bubblers](https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles) distinguish stationary multi-stream, dual V-pattern, trickle and umbrella products. | Supported stream bubblers use short stationary coherent streams with local terminal breakup. Do not rotate them. Unsupported or unverified stream geometry remains unavailable. |
| Local flood/tree bubblers | The [Hunter bubbler table](https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles) distinguishes trickle PCN/PCB 25/50 from umbrella 10/20; AFB can provide both. [K-Rain's manufacturer explanation](https://www.krain.com/blog/4-different-lawn-sprinkler-nozzles) identifies an umbrella pattern for Tree Bubblers. | A small local bubbling/trickling or umbrella effect. No long-range jet, invented wetted engineering radius or manufactured precipitation value. An adjustable product without a saved pattern setting remains a schematic local effect. |

## Implementation boundaries

- Microdroplets are a visual texture. Many small marks can make terminal breakup
  readable, but they should concentrate around the water paths, especially their
  ends. They do not establish measured aerosol production, evaporation or drift.
- Stream widening, density, alpha, color, exact lane count, speed and flight time
  are artistic parameters. The existing approximate-preview notice remains true.
- Stationary fans, rotary streams, gear rotors and local bubblers must remain
  visually distinct. Use the existing special square and rectangular footprints;
  do not replace those shapes with circular clipping.
- Unsupported operating geometry, disputed source rows, hidden heads and known
  unknown rotation mechanisms keep their existing exclusions. More elaborate
  paint must not grant unsupported equipment a simulated footprint.
- Pressure, flow, precipitation, radius, arc, body selection and automatic
  selection calculations are unaffected by stream styling.
- Keep elapsed-time animation, stable independent phases, live head translation,
  reduced-motion behavior and shared phone/tablet/desktop rendering. Visual
  quality must not depend on changing saved geometry or re-rendering project state
  for every frame.

## Existing-code review

Before this update, `wateringJets`/`wateringJetPath` drew connected ribbons only
for `rotor` and `opposed`. The `multi` and `strip-multi` profiles used individual
moving particles, even though the source map already identified multiple
rotating streams. That explains the user's observation that MP-like products
looked like detached flying drops. Adding connected paths to those profiles is
the principal appearance correction supported by this audit.

All sources above were consulted as textual manufacturer evidence. Browser
visual QA was unavailable under the task's approval restrictions; this source
review does not claim an observed browser rendering or measured physical match.

## Implementation verification

The final code passed 97 automated tests and TypeScript validation. Every one of
the 461 placeable catalog models was inspected: 460 have a supported animation and
one retains its unknown-pattern exclusion. The stream tests check 2,567,136 path
points, finite coordinates, sector/strip/square clipping, unsupported operating
points, time-of-emission motion, actual-radius scaling, stationary fans,
U-Series near/far layers and unchanged hydraulic/project values. Existing
manufacturer, automatic-placement, localization and visibility tests also pass.

Actual ReactKonva WateringHead scene functions were rendered through native
Canvas for visual inspection at two times per model, plus an enlarged MP motion
sequence. Final streams taper into visible tiny breakup rather than flat flags.
The same eight-head benchmark at 18/36/72 pixels per metre changed from median
132.8/133.1/133.2 ms in baseline v445 to 7.62/10.44/12.75 ms after replacing thousands
of compound droplet curves with simple flecks. This is a native paint benchmark,
not a browser frame-rate guarantee. `watering-stream-validation-2026-10-10.json`
retains exact measurements and scope. The saved image fixtures remain outside
production assets; the reproducible script is `scripts/render-watering-streams.mjs`.

Three stale test assumptions were repaired after confirming baseline behavior:
AFB was already excluded, several animation fixtures incorrectly combined an
I-20 nozzle/body with spray IDs, and the older Hunter-only sector test predated
the subsequently audited Rain Bird/K-Rain small-sector support. No runtime
validation was relaxed to accommodate these tests.

## Follow-up: distant visibility and dense inter-stream spray

The user's follow-up to published version 446 requests thicker streams and many
more tiny droplets between them. Ribbon width now scales by 1.9, with a small
screen minimum limited by footprint size. Microdroplet populations increase
from 2,400 to 7,200 for rotary nozzles, 1,800 to 5,400 for rotors/stream bubblers,
and 2,880 to 5,760 for stationary sprays. Actual drawing work still follows the
visible footprint area. Flood bubblers retain their local effect.

Fine spray now includes broad Cartesian dispersion in every direction alongside
a close breakup layer. Distal concentration and time-of-emission motion remain;
38–39% of sampled MP/R-VAN/RN microdroplets lie more than 2% of the saved radius
away from a stream core, and 17–18% lie more than 5% away. Overflow is discarded,
rather than accumulated on sector, strip or square borders. These particles are
an explicitly requested visual embellishment, not measured mist or wind drift.

The follow-up passed 37 scoped tests and TypeScript validation, including the
461-model geometry audit, independent dispersion, square spray retention,
visibility, localization and units. Native frames were inspected at 6/12/18/36
pixels per metre, plus eight model examples and three MP motion frames. Native
eight-head median paint time is 12.44/18.39/22.18 ms at 18/36/72 pixels per metre,
versus 7.55/9.99/12.00 ms in version 446. The denser effect costs more paint time;
these measurements do not establish browser frame rate. Browser QA remains
unavailable after the earlier automatic approval rejection; no alternative
browser path was attempted. Exact follow-up evidence is retained separately in
`watering-density-validation-2026-10-10.json`.
