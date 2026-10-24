# K-Rain rotor audit — 2026-10-10

Scope: MiniPro, RPS50, RPS75, RPS75-PR, RPS75i, RPS75i-PR, RPS-Select, ProPlus and SuperPro currently stored in `src/data/equipment/k-rain.json`. Research files only were changed. No application or catalogue edit, deployment, browser or CLI network request was performed.

## Complete comparison and proposed changes

All **9 models, 90 nozzle entries, 360 full-radius rows and 162 published -30% rows** were compared against fresh native-web extraction of the [official 2026 catalogue](https://www.krain.com/content/files/images/landingpages/catalogs/2026%20product%20catalog%20english.pdf). Both metric and US sets contain 522 operating points. The stored-data comparison checks 3,852 numeric cells, retaining original source line/page and column-separator repairs. All existing numerical differences are the previously justified seven RPS75 flow corrections plus derived m³/h, and 107 intentionally unavailable precipitation fields.

`rotor-proposed-patches.json` contains **three targeted changes**, without invented numeric replacements:

| Model / point | Field | Proposal |
| --- | --- | --- |
| RPS75-PR | pressureBasis | Set to `inlet` |
| RPS75i-PR | pressureBasis | Set to `inlet` |
| RPS75i, standard #1.5, 3.4 bar, full radius | precipSquareMmH | 7 → null |

The pressure interpretation follows the dedicated PR tables: input pressures continue above the nominal regulator setting while performance plateaus. This is a documented table interpretation, not a manufacturer-issued correction notice. Preserve the complete measured inlet-pressure domain; do not cap it at 3.1 bar or replace it with an assumed outlet-pressure curve. Keep 2.8 bar explicitly an application default, not a manufacturer recommendation.

Two existing disputed SuperPro reduced radii are 9.8 m versus 31 ft (9.4488 m), and 10.7 m versus 32 ft (9.7536 m). Both exceed the combined precision of the printed units. Their full-radius counterparts agree and remain usable. Keep raw values, but exclude these reduced endpoints and interpolation across them. No authoritative replacement was found.

RPS75i #1.5's metric square value 7 disagrees with US 0.31 in/h (7.874 mm/h). A square-spacing diagnostic using the published 10.7 m and 7.6 L/min, including their rounding intervals, gives 7.84–8.09 mm/h. This supports withholding this isolated field, not replacing the published value with a calculation. Triangle, radius and flow remain usable. This raises unavailable precipitation fields from 107 to 108.

The existing flags already leave 357 full-radius and 159 reduced points with verified radius/flow; six points remain disputed. This audit reconfirms all six rather than adding new row flags. These counts concern hydraulic/geometry status, not complete precipitation availability.

## Previous decisions rechecked

The [RPS75 Rev.12 setting sheet](https://www.krain.com/content/files/images/landingpages/rotors/rps75/rps75%20setting%20instructions.pdf) independently publishes the seven selected metric flows, corroborated by the current catalogue's US table. Keep 20.8/22.7 L/min for standard #6 at 4.1/4.8 bar; 28.8/31.0 for standard #8; 14.4 for LA #3 at 4.1 bar; and 30.3/32.6 for LA #6 at 4.1/4.8 bar. Use the final visible table region (native lines184–235), not hidden legacy extraction. The manual's LA #6 final US 8.3 GPM conflicts with its own 32.6 L/min; current catalogue 8.6 GPM corroborates the selected metric value.

The [RPS-Select brochure](https://www.krain.com/content/files/images/landingpages/rotors/rps%20select/rps%20select%20product%20brochure.pdf) still repeats the two contradictory 2.8-bar radii. It cannot resolve standard #1.0 (10.4 m versus 37 ft) or #3.0 (12.2 m versus 41 ft). Keep both row flags. Its matched-precipitation claim is conditional on choosing the appropriate built-in nozzle for the arc; do not scale the discharge of a fixed selected nozzle merely because the arc changes.

SuperPro standard #3.0 at 2.1 bar remains disputed at both full and reduced radius. The [older SuperPro brochure](https://www.krain.com/content/files/images/landingpages/rotors/superpro/superpro%20product%20brochure.pdf) describes a different performance set, including different flows, and cannot supply replacement values for the current green-nozzle table. It does confirm manual flow control and continuous full-circle operation. No broad model flag is cleared.

Existing 107 unavailable precipitation cells remain justified: 96 in RPS75-PR, five RPS75i full-radius square values, five RPS75i-PR reduced fields and one SuperPro reduced field. Preserve metric PR low-angle triangular rates where consistent; the US PR low-angle triangle column repeats square values. Very small US/metric differences can follow independently rounded hydraulic inputs and do not justify blanket removal.

## Constraints, reduction and presentation

Current model pages in the catalogue agree with stored operating/recommended bounds, arc limits, inlet size, riser travel and trajectories. All stored rows are inside the 1.4–6.9 bar operating envelope, while measured nozzle domains remain narrower. Headline family radius ranges do not override pressure-specific table radii. Current nominal arcs are 40–360°; old MiniPro instructions showing 30° do not override current specifications. Older marketing pressure maxima and trajectories are retained as source differences, not imported over the current catalogue.

The [manufacturer FAQ](https://www.krain.com/faqs) supports up to 25% radius reduction by the retention screw and warns against more than three turns. Its RPS75i flow-control instructions support up to 50% reduction; the SuperPro brochure confirms the same feature for that model. Retain minimum ratios 0.75 for ordinary rotors and 0.5 for RPS75i/SuperPro. Generic proportionate-flow language does not define a complete numerical curve. Use exact validated -30% endpoints at their printed radii; do not synthesize a 0.7-radius endpoint, especially where RPS75i publishes whole metres. Other reduced-radius discharge remains unknown.

Both PR variants regulate nominally at 45 psi, offered on the six-inch family option. This does not imply flat flow below the plateau. Intelligent Flow Technology is manual control, not a pressure regulator. No independent nominal-regulation minimum-inlet threshold or complete pressure-loss curve was established. The copied `PR Low Angle` heading under SuperPro does not justify inventing a SuperPro PR model.

Current nozzle-rack text verifies red for P52775/P16001101/P51399 and green for P16001110: **86 interchangeable-nozzle colors**. The four RPS-Select built-in selections have no verified color code. `rotor-color-evidence.json` preserves color names and approximate display-hex semantics. No operating color is inferred from a blue flush cap or product photograph.

Fresh written specifications explicitly confirm continuous full-circle operation for [MiniPro](https://www.krain.com/content/files/images/landingpages/written%20specifications/minipro%20gear%20drive%20rotor%20product%20specifications.pdf), [RPS75](https://www.krain.com/content/files/images/landingpages/written%20specifications/rps75%20gear%20drive%20rotor%20product%20specifications.pdf) and [RPS75i](https://www.krain.com/content/files/images/landingpages/written%20specifications/rps75i%20gear%20drive%20rotor%20product%20specifications.pdf). Their PR variants inherit the documented family mechanism as an identified inference. Current ProPlus/SuperPro catalogue text explicitly says continuous 360°. [RPS50](https://www.krain.com/content/files/images/landingpages/written%20specifications/rps50%20gear%20drive%20rotor%20product%20specifications.pdf) and [RPS-Select](https://www.krain.com/content/files/images/landingpages/written%20specifications/rps%20select%20gear%20drive%20rotor%20product%20specifications.pdf) remain unknown at 360°; general reversing-mechanism wording alone is insufficient.

## Integration checks

1. Both PR models retain 3.5/4.1/4.8-bar inlet rows where published, while displaying 45 psi nominal regulation separately.
2. The two existing flagged SuperPro reduced endpoints return unknown flow and cannot be bridged by interpolation; their full-radius rows and other reduced points remain valid.
3. RPS75i #1.5 at 3.4 bar retains radius/flow/triangle while square rate is unknown (or explicitly calculated through the application's existing calculated-rate path).
4. Existing RPS-Select/SuperPro row gates still reject exact disputed rows and interpolation crossing them.
5. Pressure edits retain per-nozzle measured bounds; reduced radii use the selected-pressure full throw multiplied by the documented minimum ratio.
6. Full-circle rotation remains unknown only for RPS50/RPS-Select; unknown animations must not become continuous by a generic fallback.

`rotor-check.py` reproduces raw and stored comparisons. `rotor-source-manifest.json` lists 21 fresh official extracts and hashes. No attempted source retrieval used a previously blocked transport.

## Classification correction and date refresh

The initial narrative incorrectly classified the SuperPro #6/#8 reduced flags as new. Both are already `Needs Review` in HEAD `7231506d1a7d236c986ea5c00bcb41d7d35a8f31` and in this audit’s original `rotor-row-checks.json` snapshot. They are retained evidence, not proposed patches. The actual changes are two pressure-basis labels and one isolated precipitation null.

`rotor-verification-refresh.json` proposes 95 date-only refreshes to 2026-10-10: model `verifiedOn` for all nine audited rotors and nozzle `colorVerifiedOn` for the 86 explicitly verified red/green nozzle records. Review status and unknown fields remain intact. No date is added to the four unknown RPS-Select colors, unknown model/body colors, or absent nozzle-level `verifiedOn` fields. Date refresh records this audit date; it does not assert every field is resolved.
