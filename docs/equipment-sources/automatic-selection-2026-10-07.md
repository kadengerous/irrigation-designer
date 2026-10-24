# Automatic sprinkler selection — 2026-10-07

The automatic library card searches all circular sprinkler categories within the selected manufacturer. Library tabs do not constrain the tool. Preview and committed placement share the same catalog scope and selection routine.

The requested radius and arc remain unchanged. Working pressure equals available pressure unless a compatible regulated body reduces it. Inlet limits and the regulator setting are checked before selection. No pressure boost, free pressure reduction, extrapolation, unsupported pattern or disputed base row is permitted.

Known-discharge operating points rank first. If the manufacturer documents the radius adjustment but not its reduced discharge, a sound base nozzle/pressure row may support geometry-only placement. The tool explicitly warns about unknown flow and stores `needsReview:true`; discharge, precipitation and watering duration remain unknown. Editing, saving, reopening and undo/redo retain the uncertainty. Zone/pump calculations do not treat missing discharge as zero. Batch polygon layouts remain restricted to known-discharge selections.

## Rain Bird pressure-unit equivalence

Rain Bird specifies its PRS30 bodies as **30 psi (2.1 bar)**, while some nozzle charts use a different bar rounding for the same nominal setting:

- [1800 body specification](https://www.rainbird.com/products/1800-series-spray-sprinkler-bodies): PRS30 and SAM-PRS30 setting, plus inlet operating range.
- [HE-VAN chart](https://www.rainbird.com/sites/default/files/media/documents/2018-02/chart_HE-VAN.pdf), page 1: HE-VAN-8 and HE-VAN-10 pair 30 psi with 2.07 bar.
- [MPR charts](https://www.rainbird.com/sites/default/files/media/documents/2020-09/mpr-spray-nozzle-performance-charts_1.pdf), pages 1–2: 5H, 5Q, 10H and 10Q include 30 psi rows, stored as 2.068427187953493 bar from their original US chart.

Only those six nozzle models on the two explicit PRS30 body families use their existing chart pressure when automatically selected. The original performance rows are unchanged. This is not a global tolerance or a clamp for unregulated input pressure. PRS45/R-VAN already share the published 3.1 bar setting.

## Verification

Regression tests exercise arbitrary drawn radii and sectors in Hunter, Rain Bird, Toro and K-Rain; manufacturer isolation; library-tab independence; known-flow preference; documented pressure aliases; invalid pressure/radius/arc rejection; geometry-only warnings; snapshots, editing, save/reopen and undo/redo; pointer capture; and all 20 locales. Engineering tests require null zone duty when any connected discharge is unknown.

Coverage animation uses verified geometry; it does not establish a missing hydraulic discharge. Existing manufacturer simulation and catalog tests remain part of validation. Browser visual QA is unavailable because browser security-policy verification is blocked in this session.
