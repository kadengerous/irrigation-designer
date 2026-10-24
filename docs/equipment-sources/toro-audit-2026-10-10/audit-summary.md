# Toro catalog and placement audit — 2026-10-10

Scope: every current Toro entry in this application, not every product Toro manufactures. The 257 entries comprise 102 PSN/PSN+ nozzles, 102 legacy O/O-T nozzles, 13 T5 RapidSet rotor variants and 40 separate 570Z bodies. All 1,596 stored performance rows were compared with official documents. No numeric performance replacement was justified. All verified source fields retain their provenance; detailed access limits and conflicting older sources are recorded in the three reports below.

- [PSN/PSN+ source audit](psn-report.md): 408 rows, 102 model identities, 48 strip dimension rows.
- [O/O-T source and compatibility audit](legacy-audit.md): 408 rows, 102 identities, 48 strip dimension rows, complete group coverage.
- [T5 and 570Z source audit](rotor-audit-notes.md): 780 rows across 13 variants (60 unique physical rows), 40 body specifications.

## Integrated corrections

1. Toro Precision's exact nominal 30 psi table point is shared by both nozzle threads and compatible Hunter PRS30 / Toro 570Z PR/PRX bodies. Exact legacy 2.1 bar is interpreted consistently in flow, radius, strips, defaults, body changes, automatic selection, compatibility, diagnostics and UI. Adjacent actual pressure settings remain interpolated; T5 and other brands are unchanged. Migration preserves raw saved pressure.
2. Toro manual pressure controls now observe the chosen body's operating range and regulator, including a saved body snapshot and compatible Hunter bodies. Impossible saved overpressure stays stored for review and produces no false flow or coverage.
3. PSN circular nozzles allow the officially specified maximum 25% radius reduction. The family-level mechanical rule is applied to the selected pressure's throw; reduced discharge remains unknown. No legacy O reduction law or pressure-compensation claim is transferred to PSN.
4. T5's 25% reduction uses the installed nozzle's throw at selected pressure. For 1.0LA at 25 psi, 7.62 m reduces to 5.715 m. The old global native-radius minimum no longer blocks this setting. Reduced T5 discharge remains unknown.
5. O/O-T keeps its absolute designated-radius reduction floor, including older snapshots without an explicit minimumRadiusM. Strip nozzles retain rectangular geometry and manual-only placement. Library filtering and diagnostic minimums follow the same operating bounds.
6. Verified colors and sectors retain their existing presentation; the audit found no omissions or duplicated configurations in the 217 placeable entries. The model verification date is refreshed for all 257 records. T5 coverage citations now point to the current installation manual.

## Verification

111 unique regression tests passed across 17 files. This includes all 1,596 manual table configurations, 3,000 eligible automatic-selection radius endpoints, all 156 T5 model/nozzle reduction combinations, body limits and snapshots, compatibility, undo/redo, invalid configurations, rectangular and circular simulation boundaries, and real SSR panels in all 20 locales with bar/psi. Shared Hunter/Rain Bird, diagnostics, units and localization checks passed. Two pre-existing test expectations were updated: full chart pressure fixtures require unregulated bodies, and Toro female defaults now use the exact 30 psi table point. TypeScript checking passed.

Browser visual QA remains unavailable due the earlier automatic approval block; no alternate browser or network path was used. UI verification here is React SSR, while placement interactions and simulation use their actual state/geometry handlers. This is not a claim of an interactive browser inspection.

## Retained uncertainty

- There is no verified reduced-radius discharge table for PSN+ or T5; geometry can be valid while hydraulic calculation remains unknown.
- The separate minimum inlet margin for nominal 570Z PR/PRX regulation was not found; no Rain Bird threshold is borrowed.
- CV inclusion on T5S-RS and T5SE-RS remains explicitly unverified.
- Toro names colors but does not specify exact display hex values. Rotor insert colors remain unknown; verified cap colors are not relabelled as insert colors.
- Older conflicting PSN15-F tables remain documented. The current US product attachment remains the chosen full-radius source; no manufacturer erratum or hardware revision is asserted.

Build and publication status are recorded in the task's Sites deployment result.
