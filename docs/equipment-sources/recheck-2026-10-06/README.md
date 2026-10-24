# Toro follow-up and K-Rain audit — 2026-10-06

Scope: all 84 previously installed K-Rain records (58 nozzles, 9 rotors,
17 bodies), five new Tree Bubblers, and unresolved Toro PSN15 full-circle
and T5 shrub check-valve questions. This is not an exhaustive catalog of
every product sold by either manufacturer.

## Toro source selection

PSN15-F and PSN15T-F now use the current product-linked PSN performance
chart. Its May 2026 PDF metadata and matching May 2026 SKU list postdate
the November 2025-created 2026 catalogue. Current numbers were already
stored: no hydraulic cells changed. Both models are Verified within the
chart's 20–50 psi range; older 60–70 psi rows are not merged. This is a
documented source-priority decision, not a manufacturer-issued erratum or
evidence of a hardware revision. Competing tables are in `toro-followup/`.
T5S-RS and T5SE-RS factory check-valve inclusion remains unverified; their
hydraulics remain valid. No manufacturer contact was sent.

## K-Rain data and organization

Fresh comparison covers all 764 original full-radius rows and 162 reduced
rotor rows. Previously corroborated corrections and 108 intentionally null
precipitation cells are retained. No new numerical transcription errors
were found. All 17 bodies were checked. Three PR41 feature labels were
corrected to PR40; pressure remains the documented 2.8 bar.

Seven exclusive, nonempty tabs cover 70 placeable models: Rotary Nozzles
(15), KVF Nozzles (6), KV Nozzles (5), Fixed Pattern Nozzles (24), Strip
Nozzles (6), Rotors (9), Bubblers (5). Rotary strips stay with rotary
nozzles; ordinary strips no longer duplicate Specialty. Male/female
thread variants remain distinct. Old category preferences map correctly
on phone and tablet/desktop.

Four new compensated Tree Bubblers use published metric flows 0.95, 1.9,
3.8 and 7.6 L/min over 1.4–3.5 bar. Cubic-metre flow is derived consistently
from L/min. TB-ADJ has conflicting flow limits and no setting curve: flow
remains unknown. All five use point geometry and direct riser mounting.
No spray radius, area precipitation or target-depth runtime is inferred
from the manufacturer's recommended spacing.

## Verification at the operating point

Seven P12/P15 models have 14 conflicting full-radius rows; RPS Select has
two and SuperPro has one. SuperPro also has three conflicting reduced
rows. Raw reference rows remain present; full-radius conflicts carry a
warning symbol. Calculations reject disputed points and adjacent pressure
interpolation, never skip across them. Other operating points of these
models remain usable, with selected-point verification text. Automatic
selection checks the actual point before using a partially reviewed model.

K-Rain radius adjustment now follows the selected pressure/nozzle throw,
including inspector, live canvas editing and committed state. The family
minimum full-throw radius no longer clips valid reduced settings. Exact
published reduced endpoints supply flow; unpublished rotor adjustments
do not. Fully Adjustable RN supports the documented 30% reduction and
explicitly labels its matched-precipitation flow as an estimate.

When verified full-radius circular rotor flow/radius are available but
precipitation is absent, the inspector may show a labelled head-to-head
estimate: square = 60 × L/min × 360 / (arc × radius²); triangle = square /
(√3/2). Raw nulls and zone grouping are unchanged. Reduced settings and
disputed points never receive this fallback. Strip precipitation remains
unavailable without a published rate or defensible spacing basis.

## Colors, descriptions and simulation

Added color provenance for 50 existing nozzle models and 86 rotor nozzles.
Eight fixed special-pattern colors remain unknown and neutral. Bubbler
black is visually supported by the official catalog photo; RGB swatches
are approximations, not factory color codes. Verified color updates apply
to matching saved models only for presentation; hydraulic snapshots are
not migrated. High-Low, RPS Select and both bubbler types have specific
sourced descriptions in all 20 languages.

Supported previews are bounded by pressure, nozzle, arc and radius. Strip
dimensions and origins follow pressure-specific tables. Continuous full
circle is supported for MiniPro, RPS75, RPS75i, ProPlus and SuperPro. PR
variants inherit their documented family's mechanism; that inference is
recorded. RPS50 and RPS Select lack an explicit full-circle motion statement:
verified coverage remains, but 360° animation is withheld with an explanation.
Partial sectors still animate. Particle speed and density are illustrative,
not measured ballistics or uniformity. High-Low exact geometry stays
unsupported; KV5 remains unavailable for hydraulic placement without a
usable performance table.

## Validation

All 84 focused and regression tests pass, including all original and reduced
rows, interpolation barriers, automatic selection, exclusive categories,
bubblers, rotated particles, rotor motion, colors, snapshot immutability,
live/committed radius adjustment, Rain Bird, Toro, units and all 20 languages.
TypeScript passes. Packaging is checked by the publication workflow.
Browser visual QA remains unavailable because the session's policy check
cannot complete; no alternate browser or deployed-URL fetch bypass is used.

Exact URLs, unresolved fields, original values, comparison results, hashes
and interpretation limits are in `nozzles/`, `rotors/` and `toro-followup/`.
