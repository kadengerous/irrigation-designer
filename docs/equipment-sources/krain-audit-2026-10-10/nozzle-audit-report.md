# K-Rain nozzle audit — 2026-10-10

All **58 active nozzle models and 404 performance rows** were independently compared with freshly retrieved official 2026 PDF table text. There are **zero unaccounted-for transcription differences**. The comparison includes pressure, radius/dimensions, flow, square/triangular precipitation and arc; derived kPa and m³/h were also checked. This is not a declaration that every printed source cell is correct: the existing field corrections, unavailable precipitation and disputed rows remain necessary.

| Family | Models | Rows | Result |
| --- | ---: | ---: | --- |
| Rotary Nozzle Series | 12 | 105 | Current metric rows retained, including pressure-specific radii above nominal ranges |
| Fully Adjustable Rotary Nozzles | 3 | 27 | Current rows retained, including corroborated RN300 radius correction |
| KVF | 6 | 96 | Current rows retained; one square precipitation cell remains null |
| KV | 5 | 80 | Current rows retained; no KV5 performance table found |
| Fixed Pattern Nozzles | 32 | 96 | Twelve FN12 flow corrections retained; 14 P12/P15 rows still disputed; two High Low footprints unresolved |

The scoped catalog has 49 Verified and nine Needs Review items. Seven of the latter have a total of 14 disputed hydraulic rows and use per-row gating; the other two have sound hydraulic dimensions/flow but unsupported exact High Low geometry. Thus 390 rows have usable hydraulic source selections, including four High Low flow records that do not authorize placement. No disputed row may be deleted and bridged by interpolation.

## Sources and method

The [2026 Product Catalog](https://www.krain.com/content/files/images/landingpages/catalogs/2026%20product%20catalog%20english.pdf), printed pp37–49, was retrieved through the native web tool. All line numbers covering the scoped tables were collected without gaps. `nozzle-source-table-extract.json` preserves the numeric table text and exact source line numbers. `nozzle-verify.py` parses those independent source tables, applies only documented field selections, and compares every active catalog row. `nozzle-row-checks.json` preserves 404 individual comparisons and 373 current US counterparts for circular rows. Strip/high-low dimensions are checked against the metric tables instead of being treated as circular radii.

The [Rotary metric sales sheet](https://www.krain.com/content/files/images/landingpages/nozzles/rotary%20nozzles/02-24-rotary%20nozzle_salessheet%20-%20metric_r.pdf), [Fully Adjustable brochure](https://www.krain.com/content/files/images/landingpages/nozzles/fully%20adjustable%20rotary%20nozzles/fully%20adjustable%20rotary%20nozzle%20product%20brochure.pdf), [KVF brochure](https://www.krain.com/content/files/images/landingpages/nozzles/kvf%20nozzles/kvf%20nozzle%20product%20brochure.pdf), [KV brochure](https://www.krain.com/content/files/images/landingpages/nozzles/kv%20nozzles/kv%20nozzle%20product%20brochure.pdf) and [Fixed Pattern performance brochure](https://www.krain.com/content/files/images/landingpages/nozzles/fixed/fixed%20nozzle%20performance%20data.pdf) were freshly reopened. Manufacturer family/product pages were also reopened. Undated brochure revisions were not assumed newer than the dated catalog.

No external CLI fetch, browser automation or browser workaround was used. This pass checked fresh accessible PDF text, not a newly rendered visual trace of the High Low diagram. Its exact curve remains unavailable; the existing conservative exclusion is retained.

## Confirmed field selections and unresolved cells

* FN-12Q/H/TQ/F: all 12 active flows agree with the linked fixed-nozzle brochure p2 and current US GPM. The current catalog metric flow column remains inconsistent. Retain Q 2.0/2.3/2.5, H 4.0/4.5/4.9, TQ 6.0/6.8/7.4 and F 7.9/9.1/9.8 L/min at 1.4/1.7/2.1 bar. Retain FN-12F radius 3.4 m at 1.7 bar: the companion publishes 11 ft/3.4 m and current metric agrees, while current US says 12 ft. This is a per-field choice, not blanket US precedence.
* RN300-ADJ, 360°, 3.5 bar: retain 8.53 m. Companion p2 explicitly prints 28 ft/8.53 m and current US also prints 28 ft; current metric 8.83 m is not selected. Current precipitation is retained; the old brochure's precipitation columns are not substituted.
* KVF6, 90°, 1.72 bar: retain square precipitation null and triangular 194 mm/h. The current metric pair 156/194 and US pair 6.16/7.65 are not mutually consistent under their stated rounding. Hydraulic pressure/radius/flow remain sound. No replacement precipitation value is asserted.
* RN100-ADJ-210-270, 210°, 3.4 bar: current metric square/triangle 13/15 is consistent with the metric sales sheet and with the adjacent RN100 90–210 model's same 210° row. The US triangular 0.53 in/h differs; retain the corroborated metric 15. This is a source note, not a catalog-number change.
* P12Q/H/TQ/F, 2.1 and 2.8 bar: metric radii 4.3/4.6 m still disagree with current US 13/14 ft. The companion uses a different pressure/performance sequence and cannot establish a replacement for these eight rows.
* P15H: the last two metric rows have 2.8/3.4 bar but corresponding current US rows say 30/40 psi. P15F has the same two pressure conflicts. No corrected pressure is invented.
* P15TQ and P15F, 1.4 bar: metric radius 3.4 m conflicts with current US 13 ft. These two rows remain unresolved. Together with the preceding P15 rows, the retained hydraulic gate covers 14 rows total.
* P15HL and FN-15HL: preserve dimensions/flows at the explicitly printed 1.5 and 2.0 bar points, not converted US 20/30 psi. The linked brochure repeats those metric points and supplies the lower 1.5 × 9.8 m dimensions at 2.0 bar. The upper 4.6 × 9.8 m outline cannot be asserted to be a radius-4.6 m semicircle. Preserve `placementSupported:false`; 180° and `radiusM` are schema placeholders, not proof of a circular sector. Ordinary center/end/side strips retain their published rectangles and orientation metadata.

## Arc and pressure behavior

The 2026 comparison p37 specifies mechanical 0–360° for KV/KVF. Their first measured arc is 90°. Ordinary interpolation among published arcs does not create a measured row below 90°. In particular, the source tables do not support a family-wide proportional-flow law: KV/KVF discharge and, for several models, radius vary non-proportionally with arc. Keep below-90° discharge unknown.

For a conservative geometry-only extension, require identical native radius at every published arc at the selected pressure, including both pressure endpoints used for interpolation. This is an explicitly limited geometry inference, not a manufacturer measurement at 60°/77°. Exact equal-radius table pressures are enumerated in `nozzle-model-coverage.json`; KV10/12/15/17 have none. KVF8 is equal at 1.38 and 2.07 bar but not at the intermediate 1.72 point, so interpolation must not bridge that exception. Zero arc remains non-operational.

KV/KVF pressure labels pair 20/30/40/50 psi with 1.38/2.07/2.76/3.45 bar. KVF also has 25 psi/1.72 bar. Catalog and [KVF page](https://www.krain.com/kvf-nozzles) call recommended 30 psi **2.1 bar**. Normalizing only exact nominal aliases 1.4→1.38, 2.1→2.07, 2.8→2.76 and 3.5→3.45 within KV/KVF reconciles regulated-body settings with the same manufacturer test condition. It must not clamp arbitrary nearby values or normalize the separate 1.5/2.0-bar special-pattern tables. The old KVF brochure mispairs 25/30/40 psi with 2.07/2.76/3.45 bar; current catalog corrected paired unit tables govern.

Fully Adjustable RN mechanically supports **80–360°**, confirmed by the [product page](https://www.krain.com/fully-adjustable-rotary-nozzles) and 2026 p42. The same sources claim matched precipitation across patterns/distances. Extending 90° reference flow to 80–89° proportionally is therefore a defensible explicitly calculated estimate; it is not a new published performance row. Do not extend below 80°. The dated catalog explicitly recommends 30 psi/2.1 bar, whereas the live undated page says 40 psi/2.8 bar. Retain catalog 2.1 bar with the disagreement disclosed; calling the page officially superseded would overstate the evidence.

Rotary Nozzle Series has separate 90–210°, 210–270° and fixed-360° models, plus three strips. No 270–359° bridge or blanket below-90° extension is justified. Pressure-specific source radii govern even when the advertised model range is smaller.

## Radius reduction, colors and interfaces

2026 p42 and the Fully Adjustable page support up-to-30% radius reduction. Retain minimum radius = 0.7 × the selected pressure/arc radius; `rMin` must not introduce an extra nominal floor. Matched-precipitation flow scaling is an estimate from a stated family property, not a published reduced-radius flow table. The undated brochure redundantly says both 25% and 30%; current dated catalog and live page agree on 30%.

New Rotary Series sources confirm radius adjustment and matched precipitation after adjustment but do not provide a quantitative percentage or a pressure-specific reduced endpoint table. Advertised nominal minima are not sufficient to assert a universal reduction limit at every pressure/arc. Keep that limitation explicit; do not borrow the Fully Adjustable 30% limit. KV/KVF/fixed sources say the adjustment screw can reduce radius but publish no quantitative minimum or adjusted flow curve. No 25%/unchanged-flow assumption is introduced. Rectangular/composite patterns are not reduced by a circular-radius formula.

All **50 named nozzle colors** are verified from the current catalog/product model lists; the remaining eight fixed special-pattern colors stay Unknown. Stored hex values are illustrative swatches, not measured manufacturer color specifications. Female-threaded RN/KVF/FN fit male-threaded risers (K-Rain Pro-S/NP); male-threaded KV/P fit female-threaded risers (K-Spray). This establishes attachment compatibility, not hydraulic same-zone compatibility.

The [KV5 product page](https://www.krain.com/kv-nozzles/variable-arc-male-nozzle-5-kv5) confirms a 5 ft male variable-arc nozzle and a 30 psi recommendation. It still supplies no performance table; current 2026 pp46–47 and the linked KV brochure also omit KV5 rows. Keep it outside the computational catalog until pressure/radius/flow evidence is available. The five scoped KV records are KV8/10/12/15/17.

## Proposed integration and checks

`nozzle-proposed-patches.json` contains only audit-date/color-date refreshes and a more precise Fully Adjustable recommendation-conflict note. It contains no replacements for the 404 active numeric rows and no clearing of current review flags. Runtime recommendations above were sent to the parent separately; this agent did not edit shared catalog/runtime files.

Run `python3 docs/equipment-sources/krain-audit-2026-10-10/nozzle-verify.py`: expected 58 models, 404 rows, zero selected-source differences and 14 disputed hydraulic rows. Regression cases should include KVF at regulated nominal 2.1 and 2.8 bar; exact table-boundary aliases; KVF6/KVF10/KV8 below90° geometry with unknown flow; KV10/12/15/17 geometry refusal below90°; KVF8's unequal-radius intermediate pressure; RN80°/89° and rejection79°; RN30% pressure-relative reduction; strips at exactly1.5/2.0 bar; per-row barriers around all14 conflicts; and unchanged High Low placement exclusion.
