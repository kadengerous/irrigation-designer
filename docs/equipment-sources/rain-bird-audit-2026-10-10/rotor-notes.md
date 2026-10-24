# Rain Bird rotors and 1800 bodies — 10 October 2026

Scope: all **7 current rotor records, 94 model/nozzle entries, 567 performance rows**, and **21 current 1800 body records**. The rotor data represent **371 unique official source rows**; 5000/5000 Plus and Falcon PC/FC legitimately share tables. Every row was freshly extracted through the native web document reader and compared by model, nozzle and pressure. No catalog or runtime file was edited.

`rotor-row-checks.json` preserves every current row, the fresh published counterpart, exact source line and URL, and the reason for any intentional difference. `rotor-check.py` reproduces this comparison from saved extracts. There are **zero unexplained radius/flow differences**. `rotor-proposed-patches.json` contains **15 metadata additions and 8 precipitation-field corrections**; no radius/flow replacement is proposed.

## Concrete corrections

1. **14 regulated 1800 bodies need a nominal-regulation inlet threshold.** The [currently product-linked 1800 technical specification](https://www.rainbird.com/media/13671), p4, guarantees nominal 30 psi outlet only from **35 psi inlet**, and nominal 45 psi outlet only from **50 psi inlet**. Proposed `nominalRegulationMinInletBar` values are exact SI conversions: **2.413165053** and **3.447378647**. These thresholds are distinct from the lower operating limits of the body. Below them the source allows up to 6 psi pressure loss; it does not publish an exact outlet curve. Automatic selection should use a plain compatible body, or decline the regulated candidate, rather than assume the nominal outlet at insufficient inlet pressure. A manually specified nozzle working pressure must never exceed the selected body's regulated outlet.

2. **5004+PCR pressure is the rotor inlet pressure.** Add `pressureBasis: "inlet"`. All 12 racks correctly retain a constant **3.5–5.2 bar** last interval through `pressureMaxBar` and `pressureRangeIsConstant`. The [current 5000 tech spec](https://www.rainbird.com/media/4635), pp5–6, explicitly plots flow against inlet pressure. Do not cap these table inputs at the nominal **3.1 bar nozzle outlet**. Retain the existing **2.5 bar application default**: changing it to the first metric plateau at 3.5 bar is an optional UI choice, not an audit correction or manufacturer recommendation. The imperial plateau is printed as 55–75 psi while metric is 3.5–5.2 bar; retain the chosen metric chart without pretending these are exact unit conversions.

3. **Eight additional published precipitation cells conflict with their own stated basis.** In standard 5000 and PRS #6 at **2.0 bar**, 12.4 m and 17.4 L/min imply approximately **13.58/15.68 mm/h** at 180° and head-to-head square/triangle spacing; the charts print **15/17**. This affects 5004-PC, 5004+PC and 5004+PCR. Standard #6 at **3.0 bar** prints square **13** with 13.4 m and 22.2 L/min, which imply **14.84**; its triangular 17 is consistent and stays. This affects 5004-PC and 5004+PC. The dedicated chart and current technical specification agree on these conflicting printed numbers. Even a generous ±0.3 L/min and ±0.05 m rounding envelope does not reconcile them with the printed integer rates. Null only the eight disputed precipitation fields; retain all five hydraulic rows. Diagnostic calculated rates are **not replacement manufacturer data**. A separately labelled calculated rate may still be computed by the application's explicit layout formula.

## Confirmed model constraints

| Model | Nozzles / rows | Arc | Operating metric pressure | Reduction |
| --- | ---: | --- | --- | --- |
| 3504-PC | 6 / 36 | 40–360°, reversing | 1.7–3.8 bar | Up to 25%; reduced flow unknown |
| 5004-PC | 24 / 136 | 40–360°, reversing; MPR racks use 90/120/180/360° | 1.7–4.5 bar; actual selected-rack table domain applies | Up to 25%; reduced flow unknown |
| 5004+PC | 24 / 136 | Same as 5004-PC | Same | Same |
| 5004+PCR | 12 / 60 | 40–360°, reversing | 1.7–5.2 bar inlet in dedicated PRS chart | Up to 25%; reduced flow unknown |
| 6504-PC | 8 / 60 | 40–360° | 2.1–6.2 bar; actual selected-rack table domain applies | Up to 25%; reduced flow unknown |
| 6504-FC | 8 / 60 | 360° only | Same | Same |
| 8005 | 12 / 79 | 50–330° or 360° non-reversing | 3.5–6.9 bar; actual selected-rack table domain applies | No quantified supported envelope found; retain full throw only |

All 567 stored rows lie inside these model operating domains. The 5000 standard chart starts at 2.0 bar even though the model operates from 1.7; low-angle and MPR racks have their own lower endpoints. Do not extrapolate missing rack rows. The [5000 MPR chart](https://www.rainbird.com/media/4173) has three radius families, four nozzle arcs, and five pressures each; it does not justify copying those 60 rows into the pressure-regulated model. R-VAN/MPR compatibility does not make arbitrary rotor nozzle/arc settings matched precipitation.

The [3500 product page](https://www.rainbird.com/products/3500-series-rotor-sprinklers) and tech spec p3 support 25% reduction, while tech spec p1 still says 35%. The supported 25% envelope lies within both claims; no 35% assertion is added. The [Falcon tech spec](https://www.rainbird.com/media/4668), p2, explicitly allows 25%. The [8005 product page](https://www.rainbird.com/products/8005-series) confirms its disjoint arc range, 127 mm rise, 1-inch female inlet and 3.1 m SAM holdback. Standard rotor precipitation is based on **180° operation and spacing equal to half the throw diameter**, with zero wind; MPR rows retain their published individual arcs.

## Earlier conflicts remain correctly handled

- Standard 5000 #6 at 4.5 bar retains **27.333333 L/min**, converted from published 1.64 m³/h and corroborated by the imperial grid; the inconsistent printed 28.2 L/min is not restored.
- PRS #4 at 3.0 bar retains **14.833333 L/min**, converted from published 0.89 m³/h and corroborated by the imperial grid; printed 16.8 is not restored.
- Falcon #6 at 4.5/5.0 bar retains **23.33/24.50 L/min** from the [dedicated chart](https://www.rainbird.com/sites/default/files/media/documents/2020-09/falcon-6504-series-rotors-performance-charts.pdf), supported by same-row m³/h and imperial values. The current technical specification still prints erroneous **16.72/15.08**. High-speed Falcon tables were not mixed into these records.
- The existing **26 null precipitation fields** for standard/PRS #8 remain null; the conflicting sources have not been corrected. With the eight new recommendations, 34 published precipitation fields would be withheld, while radius and flow remain usable.
- All 8005 published L/min values remain; the prior imperial-grid corroboration supports them. Conflicting secondary m³/h cells are not used to alter the selected flow. Every stored `flowM3H` is the deterministic conversion of the chosen L/min value, not an independently verified measurement.

## Bodies and appearance

The current product-linked [1800 sheet](https://www.rainbird.com/media/13671) supports **4.8 bar maximum inlet pressure** for these body families. Keep that value; an older broad specifier claim of 100 psi does not supersede the current specific sheet. SAM bodies operate from **1.7 bar**; base and non-SAM PRS bodies from **1.0 bar**. The P45 section's printed `15 psi (1.7 bar)` is an internal unit typo: 15 psi corresponds to about 1.0 bar, corroborated by the product page. PRS30 = 2.1 bar and P45 = 3.1 bar are nominal nozzle outlet pressures. The SAM-PRS paragraph's isolated `30 psi (3.1 bar)` is another unit typo; repeated model specifications clearly say 2.1 bar.

All 21 current model IDs, pop-up heights and 1/2-inch female NPT inlets were checked. Only 1806/1812 base, PRS and P45 models have side inlets; SAM variants use the bottom inlet. SAM holdback remains 4.2 m. Heights are nominal manufacturer conversions, so 102/152/305 mm versus rounded 10/15/30 cm in one sheet are not catalog errors.

No nozzle color change is proposed. MPR-25/30/35 are named red/green/beige in the current chart; Falcon colors are explicitly named in the [official parts list](https://www.rainbird.com/sites/default/files/media/documents/2018-02/part_Falcon6504.pdf), and high-flow 8005 names in its [official parts list](https://www.rainbird.com/sites/default/files/media/documents/2018-02/part_7005-8005.pdf). Existing blue 3500/5000 color evidence and current chart imagery remain in the earlier visual audit; no manufacturer-standard hexadecimal colors are claimed. 5000 Plus's green cover, black body, blue selected nozzle, and the removable orange 1800 flush plug are separate attributes. Do not recolor a nozzle using a body or flush-plug color.

## Focused integration checks

- For each of 567 rows, query the matching model/nozzle at its pressure and full radius; preserve all recorded radius/flow values and intentional precipitation unknowns.
- PRS rotor 3.5, 4.0 and 5.2 bar must select identical final-interval values; 5.3 must be rejected, and 3.1 must not be treated as an inlet cap.
- At 2.1 bar available inlet, a PRS30 body cannot claim nominal 2.1 bar nozzle output; at its 35 psi threshold it can. Repeat P45 at 3.1 bar versus 50 psi threshold. Keep plain-body fallback.
- Manual selected-body working pressure must not exceed nominal regulator output or body operating limits; changing body must revalidate the stored setting.
- Newly nulled precipitation must remain nullable through interpolation, while valid flow/radius interpolation remains available. Calculated UI rates must explicitly retain their calculated basis.
- 8005 330° and 360° are valid; 345° is invalid. Falcon FC accepts only 360°. MPR selection retains its rack-specific arc and pressure domain.
