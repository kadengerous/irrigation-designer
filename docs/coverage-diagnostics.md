# Coverage and directed spacing

The map is a geometric footprint calculation, not measured application intensity.
Every installed head contributes, including hidden heads and heads in other zones.
The four interior bands are disjoint: zero, exactly one, exactly two, at least three.
No coverage-count threshold other than zero creates a diagnostic issue.
The canvas and its legend show only dry, single and outside areas. Double and
triple coverage are retained in calculations but are not hatched (2026-09-23).
The green legend label is “no double irrigation coverage”, without the retired
long explanation. The floating legend contains only its title and three swatches;
missing-data notices belong to the diagnostic report, not the map legend.
An empty footprint no longer disables the complete display: a zero-radius/zero-arc
head contributes no water; a point bubbler leaves the map of other figures intact.
Its own figure is excluded from dry/single certification because the point model
has no verified area. Unknown distributions suppress uncertifiable interior bands,
while known overspray can still be shown. No last-frame geometry is retained during
movement; each map is calculated from the current immutable project state.

The report has exactly three severity cards, including empty states. Within each,
one expandable row groups each issue title across zones. Each underlying issue
keeps its own report number, equipment instances, zone names and directed link;
choosing a row focuses that exact original diagnostic, never a merged first pair.
Numbers are references within the current report, not persistent project data.

Head-to-head uses the working project radius, arc and orientation. Model catalog
policies are materialized on every catalog item as HEAD_TO_HEAD, SPECIAL or CUSTOM.
The selected nozzle can override the model policy. Unknown specialty spacing is
reported as unavailable rather than using a guessed residential rule.

Verified sources (checked 2026-09-23):

- MP standard/MP800: https://www.hunterirrigation.com/en-metric/support/mp-rotator-installation
- MP Corner exception and strip-layout-dependent application: Hunter MP Rotator
  Design Guide, page 8:
  https://www.hunterirrigation.com/sites/default/files/2024-08/LIT-461-RevJ-DG-MPR-EM-web.pdf
- Conventional residential spray and small rotor layouts:
  https://www.hunterirrigation.com/sites/default/files/design_guide_Residential_System_LIT-226-US.pdf

MP Corner is supplementary tight-corner coverage: neither ordinary bidirectional
spacing nor a mandatory second covering head is imposed on it. Strips use their
pressure-specific rotated rectangle for the map. Their special layout spacing,
golf/sports-turf spacing and bubbler distribution are not certified by the
residential checker. Such limitations are visible in the report.

## Significant links and severity

Within one stable figure ID, adjacent contour heads and relative-neighbour graph
links are considered. A third head nearer to both endpoints removes a non-contour
link. Links cannot cross holes, excluded land or separate figures. Both directions
are evaluated independently, including wrongly oriented sectors.

This topology is a conservative software interpretation, not a Hunter-prescribed
automatic neighbour-selection algorithm. Severity is also conservative: an error
on a link requires independently calculated dry geometry intersecting that link.
A numerical-width corridor (4 mm on either side) permits robust polygon clipping.
Dry areas elsewhere remain their own errors and do not prove that this pair is
responsible. A link without that evidence remains a warning, not a claim that the
entire surrounding area is uniformly irrigated.

Numerical reach tolerance is 0.002 m, matching the maximum arc tessellation error;
it is not a manufacturer spacing allowance. Point-count tests use no percentage
radius increase. Diagnostic dry-area subtraction compensates only that numerical
arc approximation. Components below 0.002² m² are ignored as numerical artifacts.
The actual working radius and project geometry are never changed by a check.

Precipitation compatibility, hydraulic flow and pressure checks remain independent.
No geometric multiplicity class is used to infer overwatering or precipitation.
