# Toro O / O-T manufacturer audit — 2026-10-06

## Outcome

All 102 current O / O-T catalog records (102 nozzle variants, 408 rows) faithfully reproduce the official O performance tables. The two complete table pages were independently extracted from both the 2025 sell sheet (pp 6–7) and 2026 full catalog (pp 80–81); all 204 physical rows match exactly between editions. Each physical row explicitly applies to the male and female threaded model pair. Comparison covered pressure in bar/kPa, flow in L/min and m³/h, radius, arc, square and triangle precipitation; all 48 strip rows additionally have verified per-pressure width and length. Zero numeric corrections proposed.

102 sparse patches refresh provenance to the 2026 catalog, verification date, official color evidence on both model and nozzle, and explanatory notes. They do not change hydraulic rows, dimensions, hex colors, compatibility IDs or verification status. Female mounting evidence is tightened to the 2026 price list's explicit O heading.

## Source identity and availability

- 2026 catalog, document 26-1020-DB, model/color/spec page 77 and O performance pp 80–81: https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Literature/26-1020-DB-ResCom-Irritrol-Catalog.ashx
- 2025 sell sheet, actual document 25-1045-IRC despite older filename, model/color page 3, O performance pp 6–7, specs page 8: https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx
- 2026 price list, served under a 2025 filename: https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf . All 102 IDs were checked for exact listed model tokens; O-T on PDF page 7, female O on page 8. Female O heading names Rain Bird, Hunter and Irritrol spray bodies.
- O bidding specification: https://specifier.toro.com/cads/nozzles/precision_series_nozzles.doc . Undated; explicitly identifies O models. Do not infer a revision year.

Fresh web retrieval attempted official URLs; the web parser rejects the 13 MB 2026 catalog solely for size. Its public PDF was retrieved by the parallel PSN agent, then independently extracted and visually checked here. See source manifest for hashes.

## O, PSN and PSN+ are not interchangeable catalog IDs

The current 2026 catalog explicitly distinguishes the O model list and tables from PSN+ model list and separate PSN+ tables (pp 78–79). The 2026 price list still lists O models; an older filename, newer PSN chart or shared nominal radius does not establish O deprecation. Preserve all 102 IDs. Standard O records here lack the P suffix and are not pressure-compensating variants. PCD rows must not be substituted. Identical hydraulic rows across two model IDs do not justify deduplication of separately listed hardware.

## Pressure, trajectory and reduction

2026 p77 confirms operating range 20–75 psi, recommended pressure 30 psi, trajectory 5/10/15/20/27 degrees for nominal 5/8/10/12/15 ft and 20 degrees for strips. Performance tables cover only 20/30/40/50 psi; 50–75 psi remains outside measured table coverage and must not be extrapolated merely because it is within mechanical operating range.

The O bid specification explicitly allows radius reduction up to 25% of the original designated radius while preserving precipitation. Thus the sector floor is 0.75 × model's nominal label radius. Existing catalog rMin already matches that floor for all 90 sector variants. A runtime max(rMin, pressure-row radius × .75) is unnecessarily restrictive above nominal. Use the explicit rMin floor for this O law. Do not derive nominal from rNom: O[-T]-5-210 rNom is the 30 psi measured 5.2 ft, and O[-T]-12-Q is 12.1 ft; designated radii remain 5 and 12 ft. No reduced-radius measurement rows are published; matched-rate flow scaling is a model derived from the explicit manufacturer behavior, not a measured row. No strip dimension adjustment law is established, so leave strip scaling disabled.

## Official colors

2026 p77 names top colors: nominal 5 ft Red; 8 Green; 10 Blue; 12 Brown; 15 Black; all six strip patterns Grey. Existing names match on all102 records and nozzles. Current hex values are UI approximations, not published manufacturer RGB/hex standards. No numerical color standard was found. The model-specific table names establish colors more strongly than sampling a photograph.

## Strip geometry and precipitation

The 2026 p81 diagram explicitly shows LCS at the left corner, RCS at the right corner, SST centered on the long edge. Existing rectangular geometry and origins match. Width is 4 ft; 4×30 SST length at20 psi is28 ft, becoming30 ft at30–50 psi. Other patterns retain their listed4×15,4×18,4×9 dimensions. Catalog radiusM is a schema surrogate: half strip length for SST, full length for corner strips; it is not a circular radius. arcDeg180 is likewise a compatibility placeholder; do not derive sectors from it.

All24 physical strip rows explicitly publish square and triangle precipitation columns, expanded to48 model rows. Preserve both published values unchanged. The O pages do not specify exact sprinkler spacing, overlap count or spacing diagram for these rates. Do not import the MPR Plus two-overlapping-head footnote or Rain Bird R-VAN no-overlap basis. Do not reclassify O rates as precipNoOverlapMmH. A UI may show explicitly source-labeled square/triangle table rates, but these must not be presented as measured single-head application, proved strip layout efficiency or a general runtime for arbitrary strip placement. Runtime derived from one displayed published layout rate must retain that layout qualification.

## Manufacturer anomalies retained transparently

O-10-Q (both threads) is0.26 gpm at20 psi and0.23 at30 psi, then0.28 at40/50. O-12-Q (both threads) radius sequence is12.0/12.1/11.4/12.0 ft. Both anomalies are identically present in2025 and2026 O tables, visually confirmed. Different PSN/PSN+ values cannot correct them. No same-model erratum or better replacement was found. Keep source numbers, add transparent notes; do not silently smooth or overwrite from formulas. Faithful transcription is distinct from proving manufacturer's rounded table internally consistent.

## Deliverables

- o-model-audit.json: every102 record, scope/status/constraints.
- o-row-checks.json: every408 catalog row, original published units, expected normalized values and result.
- o-raw-published-rows.json:204 unique physical manufacturer rows.
- o-proposed-sparse-patches.json:102 provenance/color/clarity patches; no hydraulics changed.
- o-color-evidence.json:102 official name mappings with approximate-hex qualification.
- o-source-manifest.json: exact URLs, hashes, retrieved document files.
- o-audit.py: reproducible extraction/comparison against the read-only catalog snapshot.

No checkout file edited. No browser or Sites tools used.
