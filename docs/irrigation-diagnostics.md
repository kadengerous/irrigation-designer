# Irrigation diagnostics

The diagnostic engine returns stable codes, SI metrics and temporary geometry. It never persists translated messages, recolours objects, changes assignments or edits project geometry. UI filters and grouping operate on the same whole-project result. Shared issues appear in each affected zone but count once in the summary. A missing input is information, not a passed engineering check.

## Manufacturer basis (reviewed 2026-09-21)

- [Hunter residential design guide](https://www.hunterirrigation.com/sites/default/files/design_guide_Residential_System_LIT-226-US.pdf): printed pages 6, 8 and 9 discuss separation of fixed sprays from rotors/rotating nozzles, head-to-head spacing and splitting zone flow within the source capacity.
- [Standard MP Rotator](https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle): nominal matched precipitation of approximately 10 mm/h.
- [MP800](https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-mp800-nozzle): nominal matched precipitation of approximately 20 mm/h. PRS30 is a valid option for smaller radii; the preferred pressure is not treated as the only allowed pressure.
- Model/nozzle pressure and radius checks use the existing verified catalog performance rows and their individual source links. Published table limits describe the supported design-data range, not a claim about mechanical failure outside it. Interior pressure values without published performance data are not interpolated into a definitive result.

## Geometry and attribution

Closed CAD irrigation regions are unioned, holes and non-irrigated regions subtracted. Legacy polygon projects are read directly so editing migration cannot discard hidden shapes or their original region types. A site outline alone is not automatically a watered lawn. Explicit drip/bubbler regions require separate wetted-area information.

All installed heads participate regardless of visibility or zone. Rotated strips use their pressure-specific dimensions and nozzle origin. Circular sectors and curved targets are tessellated, normally within 2 mm chord error, with an 8192-vertex safety ceiling per curve. Dry-area subtraction allows only that numerical arc error, not an agronomic tolerance. Areas are approximate geometric values; wind, obstructions to airborne water, hydraulic losses and actual application uniformity are not simulated.

Dry components are attributed to zones participating in the same connected irrigation region, including shared regions. Unassigned regions remain in the whole-project group. Overspray is the union outside the project-wide target, computed per zone without counting intersecting footprints twice within that zone. Geometry errors produce an incomplete-check notice rather than leaving partial area errors visible.

Head-to-head candidates are a conservative relative-neighbour graph on connected irrigation land. Both sectors must face each other; the connecting segment must remain in the irrigated region, checked at boundary crossings including holes. Arbitrary nearby pairs, wrong-facing neighbours without a proven obligation, and large overlap do not produce warnings. This infers likely neighbours; it is not a substitute for a designer's explicit spacing plan. Shortage is distance minus the relevant head's current radius.

## Hydraulic and agronomic scope

Zone flow is compared only when all contributing discharge values and available source flow are known. Radius/arc-adjusted estimates remain labelled as estimates. Unknown equipment invalidates completeness instead of silently contributing zero. Source pressure is not compared directly with pressure at the head without pipe-loss data.

MP Standard mixed with MP800, and fixed sprays mixed with rotors or rotating nozzles, have explicit compatibility errors. Different precipitation values for other equipment are shown as reference information with their model/nozzle identifiers. Since table precipitation assumes reference spacing, unequal chart values alone are not asserted to prove incompatible field application rates.

Runoff requires user-supplied soil, slope and site-specific intake rate (`meta.infiltrationMmHr`, canonical mm/h). Only documented MP nominal matched rates are currently comparable without additional layout application data. A rate above intake produces a potential-runoff warning with an explicit spacing/cycle-and-soak qualification. Other equipment requests a verified application rate; no soil-name lookup, invented slope adjustment or geometric-overlap percentage is substituted for it.

## UI and verification

The opaque, scrollable results dialog, source links and temporary detail card are shared by phone, tablet and desktop. Arabic/Hebrew use logical layout and RTL navigation, never mirrored project geometry. Numbers and engineering units are formatted at display boundaries. Changes to the project, selection, workspace or Escape clear the transient highlight. Return-to-results reruns against the current project.

`scripts/irrigation-diagnostics.test.mjs` covers cross-zone coverage, all regions and exclusions, strip/curved geometry, numerical shortages, conservative neighbours, manufacturer data, missing-input behavior, persistence, unit independence and server-rendered results in all 20 languages. Browser automation is unavailable in the current approved environment; no visual browser verification is claimed.
