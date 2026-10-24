# Rain Bird catalog and preview audit — 2026-10-05

Integrated audit of all existing Rain Bird catalog entries: 68 standalone
nozzle/bubbler models, seven rotors and 19 spray bodies. Added the manufacturer's
1802-PRS and 1803-PRS bodies, yielding 96 records. Source comparisons cover
571 nozzle performance rows, 567 rotor rows and four nominal compensated flows.
The final catalog retains selected complete source grids and explicitly unknown
fields; this is an audit of the app catalog, not a claim to include every Rain Bird
product worldwide.

## Catalog and appearance

Nine disjoint library families: R-VAN, HE-VAN, VAN, U-Series, MPR fixed, ordinary
strips, SQ, rotors and bubblers. Rotary strips stay in R-VAN; ordinary strip models
occur only in Strip Nozzles. Archived/discontinued and unsupported-footprint models
remain in source records with their status and are not silently substituted.

Colors carry official source URLs and verification dates at model/nozzle level.
Hex values are screen approximations of manufacturer color names/photos. Rotor
sector color follows the selected nozzle, not its black body or a green Plus cover.
SQ color identifies the lower insert. New transparent inline SVG illustrations
are original schematic drawings based on official appearance references, with
no separate network image request. They do not claim photographic fidelity.
Verified current appearance may update the display of an exact saved model/nozzle
ID; engineering snapshots are never silently overwritten.

## Engineering decisions

See `nozzle-audit-report.md` and `rotor-audit-report.md` for field-level source
selection and unresolved conflicts. Full source grids are kept together instead
of mixing pressures from incompatible unit tables. Canonical m³/h is calculated
from the selected L/min. Original non-equivalent secondary nozzle values are
preserved as `sourceFlowM3H`; raw rotor tables are retained in this directory.
Source-selection documents are engineering choices supported by official tables,
not manufacturer-issued errata.

SQ-HLF small setting remains selectable with a warning and unknown discharge.
Its verified square geometry is independent of its disputed flow. Large-setting
discharge is corroborated and usable; its disputed no-overlap precipitation is
withheld. Twenty-six conflicting rotor precipitation cells are also withheld.
Unpublished reduced-radius discharge and stream-bubbler footprints remain unknown.
R-VAN excludes 1802/1803 and corresponding short PRS bodies; HE-VAN supports the
published 25% radius reduction without inventing a reduced-radius flow equation.

## Validation

Rain Bird tests cover disjoint reachability, legacy category migration, source-
backed appearance, SVGs, all supported performance rows, exact flow-unit conversion,
compatible bodies, SQ setting changes, supported arc gaps, pressure/nozzle bounds,
particle containment and the real React-Konva clip on snapshot restoration.
Coverage, plan and export use the same operating-domain guard. Zero-area heads do
not suppress coverage from other sprinklers. General calculations, automatic
placement, persistence, Hunter compatibility and all 20 locales are regression
checked. Preview timing/density remains illustrative, not a calibrated fluid model.

See `../../watering-preview-sources.md` for the preview's source map and limitations.
Official document URLs, hashes, comparison rows and decisions are included in the
JSON evidence files; large source PDFs/renders remain in the local audit workspace.
