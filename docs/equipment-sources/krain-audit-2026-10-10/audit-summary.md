# K-Rain application audit — 2026-10-10

All 89 catalog records were rechecked against fresh official K-Rain sources: 58 nozzle models, nine rotors, 17 bodies and five Tree Bubblers. The evidence covers 764 base rows plus 162 reduced-radius rows. All 70 placeable models remain in eight nonduplicating compatibility groups; 56 support sector-based automatic selection. Mechanical thread compatibility does not establish same-zone hydraulic compatibility.

## Corrections and behavior

- KV/KVF nominal pressure labels now resolve to their corresponding printed psi table points. This is limited to documented exact labels; neighboring actual pressures, other families and raw saved project values are preserved. Editing, automatic selection, displayed values and simulation share that interpretation.
- Fully Adjustable RN supports its documented 80–89° sectors with a clearly labelled matched-precipitation estimate based on the90° row. Sectors below80° remain invalid. KV/KVF sectors below90° can use geometry only when all measured arcs have identical throw at both bounding pressures; their unpublished flow remains unknown. A regression prevents coincidental curve crossings from implying verified small-sector geometry.
- K-Rain body limits and regulator ceilings now apply to manual controls, stored-head validation and simulation. The six Pro-S PR30/PR40 models keep their7.6bar physical envelope but automatic selection respects the separately documented6.9bar inlet limit for nominal regulation. No undocumented minimum regulator differential was invented.
- RPS75-PR and RPS75i-PR tables explicitly display inlet pressure, preserving their high-inlet plateau rows. RPS75i standard#1.5 at3.4bar retains radius10.7m, flow7.6L/min and triangular rate9mm/h; its contradictory square rate7 is withheld. The existing labelled calculated-precipitation path remains available.
- Manual strip editing retains the pressure-specific footprint. Diagnostics enforce each selected operating point's actual reduction floor.
- Verification dates were refreshed for all89records,50 confirmed nozzle color names and86 confirmed rotor-nozzle color names. Display hex values remain illustrative. Unverified colors were not newly certified.

## Evidence and retained uncertainty

See `nozzle-audit-report.md`, `rotor-audit-notes.md`, `body-audit.md`, their source manifests, exact patch manifests and row-level comparisons. The dated2026catalog and freshly reopened companion brochures establish the selected values. No replacement values were invented for contradictory source cells.

The17 existing disputed base rows andthree existing disputed reduced rows remain gated. The two SuperPro reduced flags reconfirmed in this audit were already present in baseline v444; they are not new changes. Four HighLow table rows have usable source flow but no verified representable footprint, so thetwo affected models remain excluded from placement. TB-ADJ flow remains unknown. Unpublished reduced-rotor discharge, unmeasured KV/KVF small-sector flow, unknown special-pattern colors and unconfirmed RPS50/RPSSelect full-circle animation mechanisms remain explicitly unresolved. Fully Adjustable RN's live webpage recommends2.8bar while the datedcatalog explicitly recommends2.1bar; the application retains the datedcatalog value and records the disagreement without claiming official supersession.

## Validation

112 unique automated tests passed. K-Rain coverage includes all764base rows,743preserved supported manual settings,1,432eligible automatic radius endpoints, all162reduced-radius points,34live/snapshot body configurations, preview→placement→undo, invalid geometry rejection, pressure-specific simulation footprints and actual React panels in20locales with bar/psi. Shared Hunter, RainBird, Toro, grouping, adjustment, diagnostics, localization and units regressions passed. The final small-sector endpoint guard was additionally retested against K-Rain and RainBird. TypeScript validation and whitespace checks passed.

Browser visual QA remains unavailable after the earlier automatic approval rejection; no alternate browser or transport was used. UI checks here render actual React components on the server and exercise the real state/geometry handlers. They do not constitute an interactive browser inspection.
