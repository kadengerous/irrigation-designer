# Multibrand equipment library

The common catalog serves Hunter, Rain Bird, Toro and K-Rain. Existing Hunter IDs and the former module import remain compatible; new IDs include the manufacturer namespace. Original product and category names remain untranslated. Interface labels are supplied in all 20 supported locales.

Each catalog record preserves manufacturer, model, series, official source URL, document version, check date and verification status. Published performance rows remain separate from runtime interpolation. No extrapolation occurs outside the supported pressure/sector domain. Fixed arcs and disconnected arc ranges are enforced. Rotors keep nozzle discharge independent of sweep; precipitation uses the chart reference angle. A documented constant pressure range is resolved as compensated performance, not synthetic measured rows.

Radius reduction requires a model rule. A documented physical reduction range does not supply a discharge law: when none is published, discharge stays unknown. Published reduction endpoints are available separately; incompatible editions are never merged. Verified matched-precipitation rules explicitly label derived discharge as an estimate. Square, strip and point coverage do not inherit circular geometry. SQ offsets are sprinkler-to-side distances. Original strip origins and pressure-dependent dimensions are retained.

Manufacturer, category and simultaneous radius/sector/pressure filters share one implementation on desktop and phone. Search, favorites, recent equipment and the placed-head model selector were removed at the user’s request. Automatic selection uses the selected library scope and requires known discharge. The layout workflow validates the proposed heads against that scope and actual pressure/nozzle performance. It does not substitute another manufacturer when no candidate fits.

New placements save a full equipment snapshot and selected body snapshot. Calculations, coverage, inspection and specification resolve those snapshots on reopening, even after catalog changes. The internal model replacement operation resets nozzle/body options and enforces the new range. Legacy projects resolve their IDs once during migration. Rejected malformed snapshots remain unresolved and flagged; they are never silently replaced with a newer definition.

## Source limitations

The new datasets include 435 records (see catalog-counts.json for exact per-brand totals); bodies and thread variants are separate catalog records, not distinct hydraulic curves. Machine-readable source manifests, conflicts and detailed research notes are in equipment-sources/.

The 2026-10-04 repeat audit checks every K-Rain record and every initially flagged Rain Bird/Toro record. Full per-model and field-level evidence, original disputed values, source URLs and hashes are under equipment-sources/recheck-2026-10-04/. These are corroborated field selections, not manufacturer-issued errata.

- K-Rain: all 84 records reviewed, including 764 base and 162 reduction rows plus 17 bodies. Of 33 former flags, 22 are resolved; 73 records are now Verified. Twenty numeric hydraulic cells were corrected from independently corroborated official tables; 108 disputed precipitation cells are unavailable. Nine models retain unresolved hydraulic conflicts. P15HL/FN-15HL have verified hydraulics but unsupported exact footprints and remain excluded from placement. KV5 still lacks a located performance table and remains outside the library.
- Rain Bird SQ-3QTR uses the complete coherent official US table with explicit SI conversions and supporting product specifications. SQ-HLF, 5004+PCR, and 6504-PC/FC remain hydraulically unresolved.
- Rain Bird 3504-PC has all 36 nominal-radius hydraulic rows verified. Reduced-radius flow stays unknown because reduction limits conflict. Optional hydraulicVerificationStatus permits verified nominal hydraulics while preserving the broader warning.
- Rain Bird's four stream bubblers have verified tables but insufficient dimensioned footprints; placement is disabled. Rain Bird 1408 is archived based on the official discontinuation notice. Existing saved definitions remain unchanged and are never replaced with 1404.
- Toro PSN15-F and PSN15T-F still disagree between current official charts. These records remain flagged and have unknown hydraulic output.
- Verification badges now explain missing or inconsistent official data. No disputed pressure/radius/flow rows were deleted, so interpolation cannot bridge an excluded point. Null precipitation is never replaced with a guessed rate.

Validation includes all current Hunter regression cases, exact official row lookup, bounded interpolation, pressure/arc limits, mixed-brand zone totals, brand replacement, body matching, immutable save/reopen, SQ geometry, filtered automatic placement, units and twenty-language rendering. Browser visual QA could not run because the browser tool could not verify its administrator-enforced policy; no alternate browser route was used.

## Strip technology and zone compatibility

MP Strip appears in MP Rotator for Hunter, and in Rotary Nozzles in the combined library. R-VAN and K-Rain rotary strips use the same technology distinction. The conventional Strip Nozzles category excludes rotary strips. Hydraulic grouping uses technology independently of the library category. Unknown layout-dependent strip precipitation never makes all strip models automatically compatible; unverified combinations stay separate. Manual assignments remain possible and incompatible spray/rotary mixes are diagnosed. MP Strip is no longer treated as universally mp10 by diagnostics: Hunter documents Standard MP compatibility for single-row/triangular spacing and MP800 compatibility for rectangular spacing.

Sources: https://www.hunterirrigation.com/en-metric/support/mp-rotator-installation and https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle .
