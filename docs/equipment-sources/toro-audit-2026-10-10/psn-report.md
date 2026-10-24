# Toro Precision / PSN+ audit — 10 October 2026

All **102 existing PSN variants / 408 stored performance rows** match the current dedicated Toro chart freshly reopened through the web research tool. This represents 51 patterns × four pressures × two thread variants: 90 circular models and 12 strips. All 102 model identities, fixed-sector codes, thread designations, named colors, trajectories, table pressure limits, operating limits and native radius summaries match. No numerical performance correction is proposed.

`psn-verify.py` independently parses the fresh chart text and compares exact US-to-SI conversions, including both precipitation columns, against every current row. It also checks every strip dimension at all four pressures and verifies the 102 SKUs in the current model list. It writes only `psn-*` evidence here and makes no network request. Decimal conversion is rounded to the catalog's six decimal places; published US data remains a coherent source set. Published irregularities, including non-monotonic flow/radius and rounded precipitation, are retained rather than replaced with a calculated curve.

## Proposed correction: radius reduction geometry

The official [Toro Australia PSN+ product page](https://www.toroirrigationsolutions.com.au/homeowner/psn-series-nozzles/) explicitly states **“Radius Reduction: 25% maximum”** under Specifications. Its [linked PSN+ brochure](https://www.toroirrigationsolutions.com.au/wp-content/uploads/2025/12/PSN-Brochure-Spread-3.pdf), pages 2–3, identifies the same PSN5/8/10/12/15 families and male/female Q/H/F SKUs. The page describes the PSN+ family, with no arc-specific reduction exclusion; extending the mechanical limit to the current family's nine fixed arcs is a family-level interpretation, not a measured reduced-radius table. The current US model list independently confirms all nine arcs. The site's linked privacy policy identifies Toro Australia Pty Ltd, and the brochure gives Toro Australia contact details and a toro.com email address.

For the **90 circular PSN models**, propose `radiusAdjustment.minimumRatio:0.75` with `flowPolicy:'unknown'`. Preserve all source rows and existing verification decisions. The lower bound is 75% of the selected pressure's published native throw. Example: PSN5-Q at 30 psi has native throw 1.70688 m, so its reduction bound is 1.28016 m; the native table-wide `rMin:1.40208` is not the adjustment floor. Runtime must include Toro in the pressure-relative radius rule. Smaller radius must return unknown flow and require hydraulic verification, rather than copy full-radius flow, assume constant precipitation, or borrow the legacy O-model reduction law.

The Australian webpage's pressure-compensation wording and 275–500 kPa / 350 kPa recommendation conflict with its own linked brochure's 138–517 kPa / 207 kPa values. These fields are **not adopted**. They do not constitute a contrary radius-reduction statement. No reduced-flow curve, reduced-radius precipitation guarantee, or optional-PCD curve was verified for current PSN+.

For the **12 strips**, leave geometry unchanged. A maximum radius-reduction percentage alone does not specify how to shrink width, length and nozzle origin. Keep pressure-specific rectangle dimensions and manual placement; do not turn the placeholder `arcDeg:180` into sector coverage.

## Current source selection and conflicts

The [current US product page](https://www.toro.com/en/product/Precision-Series-Spray-Nozzles) still directly links [PSN-SS-CHARTS26-ONLY](https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e) and [26-1045-IRC](https://cdn.thetorocompany.com/api/assetstorage/623_40a88c26-9e2a-4212-918c-b86a065f0536). Current measured pressures are 20/30/40/50 psi; operating range is separately specified as 20–75 psi, recommended 30 psi. Do not extrapolate a hydraulic table to the operating maximum or merge older 60/70 psi points. General product-page nominal radius/flow/precipitation summaries do not override pressure-specific rows.

PSN15-F and PSN15T-F remain Verified under the previously documented current-source selection. Fresh access confirms 30/40/50 psi rows respectively at 2.31/2.35/2.40 gpm and 15.0/15.2/15.3 ft. The [older dedicated US brochure](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx), page 5, still has 1.94/2.25/2.51 gpm and 14.1/14.5/15.0 ft. The Australian brochure repeats those older PSN15-F values. Retain the competing rows in `toro-source-conflicts.json`; do not claim a manufacturer erratum or a proven hardware revision. The current product attachment takes precedence, supported by the prior 6 October PDF metadata audit. That metadata was not freshly downloaded this turn. The large 2026 full catalog was inaccessible through the web tool due its size, and no network workaround was attempted.

## Color, interface, category and simulation

The current model list explicitly names 5 ft Red, 8 ft Green, 10 ft Blue, 12 ft Brown, 15 ft Black, and special patterns Grey. All 102 item and nozzle color names match. Hexadecimal values are display approximations; Toro does not publish those values. Trajectories are respectively 5/10/15/20/27 degrees, with 20 degrees for strips. Color identifies the throw/pattern family, not variable arc or pressure compensation.

The current model list's T suffix means Toro male thread; blank means female thread. All 51+51 current assignments agree. The [official PSN microsite](https://psn.toro.com/) confirms compatibility across Toro, Rain Bird and Hunter through the appropriate thread variants. Existing selected Hunter body families for female nozzles and Toro 570Z for male nozzles remain mechanically defensible; thread compatibility does not alone establish a common irrigation-zone precipitation class.

PSN is a fixed spray nozzle using fast oscillating water streams with no moving mechanical parts, as the current US product page states. It should retain simultaneous sector/strip coverage, not a sweeping rotor animation. Separate 60/90/120/150/180/210/240/270/360-degree SKUs are fixed patterns: there is no adjustable interval between them.

Both precipitation columns are published square/triangular layout reference rates. Preserve the measured values, including those above the nominal one-inch family claim. No precise strip spacing/overlap footnote was found in the current chart; do not label strip rates as single-head no-overlap values or promise project-wide uniform precipitation. Existing strip origin coordinates were visually established in the 6 October audit. This turn freshly confirms the named LCS/RCS/SST patterns and all 48 stored footprint rows; the web screenshot operation did not expose image pixels to this session, so origin pixels are not represented as freshly reverified.

## Files and scope

- `psn-proposed-patches.json`: 102 sparse model date/color provenance updates, including the 90 mechanical radius-policy changes; no performance replacements.
- `psn-source-rows.json`, `psn-row-checks.json`: all 204 unique manufacturer tuples and 408 catalog comparisons.
- `psn-model-coverage.json`, `psn-color-evidence.json`: every current PSN identity and checked fields.
- `psn-source-manifest.json`, `psn-*-web.txt`: current access results and explicit source limitations.
- `psn-summary.json`: machine-readable counts and limitations.

No catalog, runtime, UI, or shared files were edited. No browser, shell download, or listening server was used.
