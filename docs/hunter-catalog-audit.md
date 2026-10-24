# Hunter catalog audit

## Recheck — 2026-10-10

Rechecked all 104 active emitters: 19 MP items / 222 rows, 62 sprays and bubblers / 400 rows, and 23 rotors / 755 rows. Also checked 58 spray bodies and 35 rotor mounting variants. Current official US tables remain the coherent source for most models; ST-1600 uses its metric table. Separate regional tables have different pressure grids and must not be spliced together. Full evidence, comparison fixtures, source discrepancies and model coverage are in [the audit folder](equipment-sources/hunter-audit-2026-10-10/).

Implemented corrections:

- MP-LCS-515 and MP-RCS-515 are fixed 90° corner strips; retain their rectangular footprint and manual placement.
- Four Pro HE cells follow the current linked US cutsheet: 8A-HE full-circle flow at 40 psi; 10A-HE triangular precipitation at 270°/20 and 25 psi; 17A-HE triangular precipitation at 360°/40 psi.
- Documented 25% reduction is relative to the current pressure/sector throw for MP, Adjustable, HE, Fixed, Short Radius and the documented residential rotors. MP800SR's explicit minimum-radius/minimum-flow rows take priority. The marketing minimum radius no longer overrides the physical setting.
- I-80 nozzles cannot be reduced. Large-rotor families without a verified numerical reduction limit use only their nozzle/pressure throw until that limit is documented. This conservative restriction is not a claim that every such product physically lacks an adjustment screw.
- Manual controls and automatic selection respect PRS30/PRS40 outlet limits. Saved overpressure is preserved for review and cannot produce a verified flow, animated watering or coverage claim. End-point snapping checks radius against the resulting sector angle.
- MSBN and 5-CST-B remain illustrative individual streams; they do not credit a filled irrigated sector. MSBN-25V/50V use the discrete published 150 mm pop-up throws (0.6096/0.9144 m). No height-interpolation curve is invented.
- Archived I-50 metadata were corrected without enabling archived equipment or inventing performance rows. Saved equipment snapshots remain authoritative.

Limits retained explicitly: two I-80-ON/nozzle23 source rows at 50/60 psi conflict with the product's 65 psi minimum and remain unavailable for design. Pro Adjustable 4A/6A sectors below 45° have no supported discharge basis for automatic selection; HE's separately documented matched-precipitation estimate below 90° remains enabled. Reduced spray/residential-rotor discharge remains a labelled calculation assumption using the nominal nozzle flow, not a separately measured reduced-flow table. MSBN heights other than the documented 100/150 mm cases have no independent throw chart. Short Radius's existing no-overlap display remains correctly labelled despite its legacy internal column name.

Regression coverage exercises all 1,377 stored rows (the two conflicting I-80-ON rows are explicitly rejected), pressure and radius endpoints, automatic selection, body limits, both sector directions, contour snapping, persistence/undo and invalid simulation inputs. Browser inspection is unavailable because the environment's approval review blocks browser access; automated interaction-handler and server-rendered checks are used without bypassing that restriction.

## Historical audit — 2026-09-18

The notes below describe the original import; the recheck above supersedes their historical UI and adjustment-policy statements.

Scope: all 104 currently placeable records in Irrigation Designer, including MP Rotator, spray nozzles, rotors, golf/ST and bubblers. Archived records remain readable in projects but have no unverified performance rows. The four body-only records are not performance emitters.

## Data and source rules

- `src/data/hunter-catalog.json` contains the separate, versioned factual catalog. Each active item and nozzle links to its official Hunter source.
- Metric rows are used where available; US charts are converted using 1 ft = 0.3048 m, 1 US gal = 3.785411784 L, 1 in = 25.4 mm. PSI pressure steps use Hunter's displayed rounded metric equivalents (e.g. 40 PSI / 2.8 bar). Differences in table rounding are retained rather than silently corrected.
- Actual head pressure, nozzle and sweep determine the lookup. No extrapolation outside published pressure rows; pressure is selected only from published rows; intermediate arcs are explicitly marked as interpolation.
- Rotor flow is independent of sweep; precipitation is scaled from the chart's stated reference sector. MP/spray adjustable-arc flow is interpolated between published arc rows.
- Radius reduction estimates are identified as estimates. MP800SR uses the separate minimum-radius/minimum-flow rows. Nominal table values are never labelled as a measured field result.
- Precipitation is shown separately for square and triangular spacing. Short-radius charts without overlap are labelled accordingly. Strip geometry is separate; strip precipitation is left unavailable rather than relabelled as square spacing.
- Runtime is 60 × target depth (mm) / precipitation (mm/h); it is not a fixed product specification.
- Unknown flow does not become 0 or an assumed 8 L/min. Zone/pump totals containing unknown flow show no data. No zone area is invented from a proportion of head counts.

## Corrected mappings and limits

- PGJ/SRM use their own 14° data; PGP Ultra/I-20 use blue standard nozzle racks instead of the red PGP-ADJ table.
- I-40/I-80 opposing-nozzle variants and G-75/G-85 have separate performance rows, not duplicated neighboring-model rows. I-80 precipitation references full-circle operation.
- I-90 and ST tables include their published nozzle ranges; ST-1600 has actual flow/radius/precipitation rows.
- MP Corner and MP strip flows corrected; MP800SR minimum-radius flow retained. Short-radius 4Q/4H color corrected to light green.
- MSBN radii converted from feet. Flood/umbrella PCB/PCN/AFB have no manufacturer-published coverage radius and therefore no invented circular footprint. AFB flow is adjustable (<2 GPM), not a fixed 2 GPM.
- Missing official color identification uses neutral gray with “Нет данных”. A chosen nozzle's color drives both its center and coverage.
- Hunter's Pro HE online chart has a contradictory triangular precipitation entry at 17A-HE, 360°, 40 PSI (1.53 in/h versus 1.77 square). That one value is null pending clarification; flow and square value remain sourced.
- Sources may offer additional low-angle, short-radius and special nozzle racks; the app contains the standard racks listed in its catalog, not every optional Hunter accessory.
- Old saved nozzle IDs are preserved and flagged for review if the corresponding rack was incorrect; the app does not silently swap the chosen model or erase project geometry.
- Pressure and radius sliders include both exact endpoints. For fixed nozzles, limits follow the selected nozzle/sector. For replaceable rotor racks (including Golf/ST), they span the model’s published compatible nozzles at the current settings; the application selects a supported nozzle without changing the rotor model. These are supported calculation ranges, not a claim that the tables cover every mechanical operating condition.
- Automatic selection first preserves the requested pressure and radius as closely as available data permit. Among feasible nozzles, it targets the previous water-per-area using `Qtarget = Qprevious × arc/arcPrevious × (radius/radiusPrevious)²`, then prefers less radius reduction. This is an application selection heuristic, not a guarantee of matched field precipitation. Actual displayed flow always comes from the selected nozzle table; only the target is scaled. A continuous slider drag uses one fixed reference and one undo entry. Explicit manual nozzle choices remain honored until the next parameter adjustment. Hunter’s [I-20 table notes](https://www.hunterirrigation.com/irrigation-product/rotors/i-20) document the change in precipitation with sector at fixed nozzle flow.
- Irrigation objects are added manually only after dragging from the library; tapping the canvas or holding without displacement does not place an object. Catalog cards still open the inspector. Footer selection, text, dimension, tape measure, layers and grid controls retain the irrigation workspace. Marquee selection prioritizes visible sprinklers in that workspace when the box includes sprinkler centers.
- Full-circle and point emitters have no rotation control; rectangular strips retain rotation. Catalog strip symbols show both the rectangular footprint and the emitter position. Catalog cards sort by maximum range, descending (strip length for rectangular patterns).
- Series photos/descriptions and Hunter documents use the shared information sidebar. Jet trajectory remains read-only inside the collapsed performance reference. Pop-up height is no longer a user-facing control; existing project/BOM data is retained.

## Official sources

| Catalog models | Official source |
| --- | --- |
| MP1000-90, MP1000-210, MP1000-360, MP2000-90, MP2000-210, MP2000-360, MP3000-90, MP3000-210, MP3000-360, MP3500-90, MP-CORNER | [Hunter](https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle) |
| MP-LCS-515, MP-RCS-515, MP-SS-530 | [Hunter](https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle) |
| MP800SR-90, MP800SR-360 | [Hunter](https://www.hunterirrigation.com/node/38356) |
| MP815-90, MP815-210, MP815-360 | [Hunter](https://www.hunterirrigation.com/node/434666) |
| 4A, 6A | [Hunter](https://www.hunterirrigation.com/irrigation-product/nozzles/pro-adjustable-nozzles) |
| 8A-HE, 10A-HE, 12A-HE, 15A-HE, 17A-HE | [Hunter](https://www.hunterirrigation.com/irrigation-product/pro-high-efficiency-nozzles) |
| 5Q, 5H, 5F, 8Q, 8T, 8H, 8F, 10Q, 10T, 10H, 10F, 12Q, 12T, 12H, 12F, 15Q, 15T, 15H, 15F, 17Q, 17H | [Hunter](https://www.hunterirrigation.com/irrigation-product/nozzles/pro-fixed-nozzles) |
| 2Q, 2H, 4Q, 4H, 6Q, 6H | [Hunter](https://www.hunterirrigation.com/irrigation-product/nozzles/short-radius-micro-spray-nozzles) |
| CS-530, ES-515, LCS-515, RCS-515, SS-530, SS-918 | [Hunter](https://www.hunterirrigation.com/irrigation-product/nozzles/strip-pattern-nozzles) |
| PGJ | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/pgj) |
| SRM | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/srm) |
| PGP-ADJ | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/pgp-adj) |
| PGP-ULTRA, I-20, I-20-SS | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/i-20) |
| I-25, I-25-SS | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/i-25) |
| I-40, I-40-ON, I-40-SS | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/i-40) |
| I-80, I-80-ON, I-80-SS | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/i-80) |
| I-90, I-90-36V | [Hunter](https://www.hunterirrigation.com/irrigation-product/rotors/i-90) |
| G-70-B | [Hunter](https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-70-b) |
| G-75-B | [Hunter](https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-75-b) |
| G-80-B | [Hunter](https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-80-b) |
| G-85-B | [Hunter](https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-85-b) |
| ST-90, STG-900 | [Hunter](https://www.hunterirrigation.com/irrigation-product/st-system/st-90) |
| ST-1600 | [Hunter](https://www.hunterirrigation.com/irrigation-product/st-1600) |
| MSBN-25Q, MSBN-50Q, MSBN-50H, MSBN-10H, MSBN-10F, MSBN-20F, MSBN-25V, MSBN-50V, PCN-25, PCN-50, PCN-10, PCN-20, PCB-25, PCB-50, PCB-10, PCB-20, PCB-25-R, PCB-50-R, PCB-10-R, PCB-20-R, AFB, 5-CST-B | [Hunter](https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles) |

## Verification

`scripts/head-adjustment.test.mjs` checks every replaceable rotor rack at pressure/radius endpoints, Golf nozzle changes, sector-dependent selection, continuous adjustment undo, and footer tools retaining the irrigation library.

## Zone controls and pump summary

- Working pressure uses a visible blue slider. New sprinklers retain `catalogHeadDefaults`: the catalog's recommended pressure for the selected body/nozzle, also shown beside the controls. Previously saved manual pressures are preserved.
- Multi-selection exposes a bottom action panel for assigning existing sprinklers to one existing zone or deleting them. Assignment is one undoable operation; other head parameters remain unchanged. Invalid or locked destination zones cannot receive a selection. The photo in an installed sprinkler's inspector has its own delete action.
- Zone flow is the sum of nozzle flows at their current pressure/sector settings. Required pressure at the sprinklers is the highest member setting, not a simulated downstream pipe pressure. Both are derived from the current project, so source and destination zones refresh after transfer, parameter edits, deletion, undo and redo.
- The pump summary remains visible when a sprinkler is inspected. Flow uses the largest simultaneous zone demand plus the existing 10% application allowance. Pressure uses the highest sprinkler demand across zones, plus elevation (`0.0981 bar/m`) and the existing **assumed** valve/filter/lateral losses (`0.2 + 0.1 + 0.3 bar`). These allowances are explicitly disclosed under “Как рассчитано”; they are not manufacturer performance values or a calculated pipe network. No pump model is invented. Actual pipes and pump curves must determine final selection.
- The [Hunter Irrigation System Design workbook](https://www.hunterirrigation.com/sites/default/files/dg_student_guide_dom.pdf) describes summed flow and checking the critical zones for flow, elevation, distance and friction. The zone with maximum flow need not be the zone requiring the highest pressure; the summary identifies both.
- Desktop selection uses the operating system's ordinary cursor, changing to a pointing hand over an unlocked sprinkler center and a grabbing hand on press. Right-button dragging pans the viewport; wheel zoom preserves the world point under the mouse, including at zoom limits. Touch pinch and touch hit areas remain available.

`scripts/irrigation-controls.test.mjs` verifies pressure defaults, zone transfer and flow conservation, pressure demand, undo/redo, deletion, unknown-data handling and pointer-anchored wheel zoom.

`scripts/hunter-catalog.test.mjs` loads the actual application modules, places and moves every active model on an empty and a bounded drawing, verifies model retention, units, pressure/sweep behavior, missing values, strip coverage, project migration, SVG export and grid startup.

## Pressure adjustment and selection follow-up

- Changing pressure retains the user's radius reduction relative to that nozzle's nominal radius. The nominal radius is interpolated only within published pressure rows; the reduced radius follows it and is clamped to the supported reduction limits. A continuous slider gesture uses its initial head as the reference, so moving back and forth does not accumulate rounding or clamping drift. Explicit radius edits still take precedence.
- This proportional preservation is an application estimate for intermediate adjustment-screw settings, not an additional Hunter measurement. The [Standard MP Rotator specification](https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle) documents pressure-dependent radii, the recommended pressure and allowable radius reduction. Existing measured maximum/minimum rows and automatic replaceable-nozzle selection remain in use; flow values are still derived from the nozzle tables.
- Installed circular and rectangular footprints share the same selected fill/outline treatment. Rectangular strip corners remain square. Mouse hover uses an 18-pixel raw-pointer center target, independent of snapping or an initial click; hidden/locked objects do not advertise dragging. The sprinkler long-press action popup and its handles are removed; inspector and footer actions remain available.
- The recommended pressure appears above the blue working-pressure slider. The inspector begins with two explicitly labelled flow units side by side, followed by radius/strip size and working pressure, then precipitation/runtime. Dynamic calculation prose is removed from the compact card; calculation provenance remains in the flow result and this audit.
- `scripts/head-adjustment.test.mjs` now covers the MP3500-90 10-metre regression, every fixed-nozzle circular model over its pressure range, return-to-start drift, explicit radius input, undo, and mouse-center targeting at different zoom levels, in addition to the existing rotor-rack tests.

## Discrete pressure and selection update

- Working pressure is a native radio-point selector, blue, with values taken from the installed nozzle's published rows (intersection for two bounding adjustable-sector rows). There is no pressure interpolation or editable intermediate pressure. Radius/arc adjustment can still select another compatible rotor nozzle; pressure changes retain the installed nozzle and select its exact row.
- Pressure selection applies that row's nominal radius to both the inspector and the drawn footprint, with flow, both available precipitation values, runtime, zone totals and pump demand derived from the updated head. This supersedes the earlier continuous-pressure and proportional-radius-preservation behavior above. Manually reducing radius remains a separate operation with the existing explicitly estimated flow logic; it never adds pressure points to the manufacturer's table.
- Existing saved intermediate pressures are retained and flagged for review, with unavailable table calculations shown as no data. Choosing a published point resolves the warning without silently modifying projects on open.
- One or more selected sprinklers show the common footer action panel: count, zone, add/transfer, delete. Zone operations use green and deletion red in every theme. A tap on blank canvas clears marquee selection and returns to the cursor; dragging a marquee, panning, or interacting with panels does not trigger this reset.
- All native range fills end at the centre of the 20px thumb, using its actual integer tick and travel distance. The physical endpoint remains reachable when the radius interval is not an exact multiple of the step.
- Verified again against the official Standard MP Rotator and I-20 pages linked above. Tests exercise every available pressure point for every current nozzle, strict lookup, rendered-radius state, strip dimensions, flow units, precipitation, runtime, zone isolation, legacy pressure review and thumb travel. The existing placement/nozzle/zone/undo tests also pass.
