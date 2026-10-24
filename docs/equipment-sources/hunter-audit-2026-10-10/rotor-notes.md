# Hunter rotor and body audit — 2026-10-10

Audited catalog baseline: `78f89a7d94396de843dde1466ef0caff5cfd5f59`. Research and audit outputs only; this audit did not edit catalogs or runtime code.

## Coverage and result

- **23 active rotor records, 176 included nozzle configurations, all 755 stored performance rows checked.** Pressure-specific radius, flow, square and triangular precipitation, and the table's reference arc agree with the current official source tables.
- **2 archived records** (I-50 and I-50-ON) have no calculation rows. Hunter still labels the family discontinued. Do not add guessed performance or reactivate them. Their archive-only sector/radius/pressure metadata are stale; sparse corrections are supplied separately.
- **58 spray-body records**: PS Ultra 3, Pro-Spray 15, PRS30 20, PRS40 20. Model pop-up height, CV/SI/FloGuard/reclaimed flags and family pressure limits were checked. No data correction found.
- **35 rotor mounting choices in 21 mapping groups** were checked. The explicit metric nominal heights (for example Golf B 8 cm and G85 9.5 cm) are intentional rather than exact inch conversions.
- No optional nozzle rack absent from the application is reported as an error.

Files:
- `rotor-row-checks.json`: every checked row, original numerical source values, converted values, source URL and source extraction line.
- `rotor-row-patches.json`: **empty**, because there are no verified numerical row discrepancies.
- `rotor-coverage.json`: every rotor and body model, row counts, arc/pressure/radius bounds, reduction evidence, mounting options and caveats.
- `rotor-proposed-patches.json`: 17 active-model reduction restrictions and 9 archived metadata corrections; each carries id, field, old/new, reason and URL. The conservative restrictions are explicitly distinguished from manufacturer-proven prohibitions.
- `rotor-check-rows.py` and `rotor-build-report.py`: reproducible local comparison and coverage generation. They write only these audit files.
- `rotor-source-*.txt`: native web-tool source extractions. No CLI network or browser was used.

## Corrections and limits

### I-80 individual nozzles cannot be reduced

The current [I-80 installation instructions](https://www.hunterirrigation.com/sites/default/files/2023-09/rc-099-ic-i-80-us-web.pdf), page 1, explicitly require swapping nozzles to change radius. Change the adapter's `minimumRatio` from .75 to **1** for I-80, I-80-SS and I-80-ON. The same manual confirms 70–360° for adjustable I-80 and no arc adjustment for the ON variant. Existing arc data are correct.

### Residential rotor reduction is verified; the global rule is not

[Hunter's rotor FAQ](https://www.hunterirrigation.com/rotor-frequently-asked-questions) names PGJ, SRM, PGP, PGP Ultra and I-20 and documents maximum 25% screw reduction. These six records including I-20-SS can retain `.75`.

[I-25 instructions](https://www.hunterirrigation.com/en-metric/support/commercial-rotors-i-25-adjust) and [I-40 instructions](https://www.hunterirrigation.com/support/commercial-rotors-i-40-adjust) establish adjustable radius, but the reviewed model instructions do not quantify the permitted reduction. Reviewed I-90, Golf B and ST documentation does not establish a continuous 25% reduction for the included standard nozzle configurations. A runtime ratio of **1** is the conservative supported domain until a model-specific numeric allowance is documented; it does not mean every one of these products is physically incapable of adjustment.

I-90's documented 15% reduction for a **different low-angle nozzle orientation** must not be treated as a continuous radius screw adjustment. Optional low-angle configurations are not included in the application and were not added.

For documented residential reduction, do **not** use `item.rMin` as an absolute reduced-radius floor: that number is the lowest unreduced table throw. PGJ 0.50 at the catalog's 2.8 bar point has 4.572 m table radius, so .75 gives **3.429 m**, whereas the existing family floor incorrectly restricts it to 4.2672 m. Explicit row/minimum-radius overrides still take precedence.

No reviewed source establishes a universal unchanged-flow guarantee for every reduced setting. If the existing unchanged-discharge model is retained, it must remain an explicitly labelled calculation assumption, not a separately published row. Published precipitation remains tied to the table throw and layout. Hunter's [reduced-radius technical note](https://www.hunterirrigation.com/sites/default/files/tech_irrigation_notes_reduced_sprinkler_radius.pdf) also explains that diffuser adjustment changes distribution; geometric coverage is not a verified uniformity guarantee.

### Regulated bodies

- [PS Ultra](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/ps-ultra): 1.4–4.8 bar inlet operating range, unregulated.
- [Pro-Spray](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm): 1–7 bar, unregulated.
- [PRS30](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm-prs30): 1–7 bar inlet range, nominal **2.1 bar outlet**.
- [PRS40](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm-prs40): 1–7 bar inlet range, nominal **2.8 bar outlet**.

The inlet operating range must not allow manual nozzle settings above the selected regulator's nominal outlet. A regulator cannot boost low available supply. The automatic rule using nominal output only when supply reaches it is a reasonable idealized selection rule; it is not a network-loss calculation.

No pressure-regulated PGP/I-20 PRB body options are present in this catalog scope, so the optional PRB inlet/outlet tables were not substituted for ordinary rotor tables.

## Source interpretation

The stored landscape/golf rotor tables are converted from **US PSI/ft/GPM tables**, not the separate metric pressure grids. This audit retains the existing one-decimal **nominal bar pressure labels**; they are not exact PSI conversions. Comparing the same array indices to a regional metric grid would create false corrections. Every source pressure is retained in the row-check artifact.

ST-1600 uses the official metric table. Its published L/min matches all 30 rows. The stored m³/h is consistently calculated as L/min × .06; the source rounds its m³/h column more coarsely. No patch is warranted for that rounding.

I-80-ON illustrates why table pressure and operating specifications must remain separate: the current product specification starts at 65 PSI, while nozzle 23 includes measured 50/60 PSI rows. Keep the current 4.5 bar minimum and do not let those lower points bypass the operating constraint.

The STG-900 metric page has mixed yard/inch-rate headings and separately states a minimum at the **swing-joint inlet**. The application rows match the official shared ST-90/STG-900 US chart, which is the chosen performance source. Do not reinterpret swing-joint inlet pressure as nozzle-table pressure.

All active catalog arc bounds match model-specific specifications: PGJ/SRM/PGP-ADJ 40–360; PGP Ultra/I-20/I-25/I-40 adjustable models 50–360; I-80 adjustable 70–360; I-90 ADV/ST 40–360; G75 50–360; G85 60–360. I-40-ON, I-80-ON, I-90-36V, G70 and G80 are full-circle only.

## Suggested regression coverage

1. I-80/I-80-SS/I-80-ON accept the table radius at a supported pressure and reject any reduced radius with the same nozzle.
2. PGJ 0.50 at 2.8 bar permits 3.429 m and rejects values below the documented 75% limit; the raw family `rMin` does not override it.
3. I-40-ON/I-80-ON/I-90-36V/G70/G80 reject 180°; adjustable variants retain their correct model minimum sectors.
4. At 3.4 bar I-80 nozzle 23 can use its table row, while I-80-ON remains excluded by the higher operating minimum despite retaining raw lower-pressure source rows.
5. Manual pressure changes with PRS30/PRS40 cannot produce nozzle working pressure above 2.1/2.8 bar; unregulated body pressure remains bounded by its inlet rating and the nozzle's supported domain.
6. Full-circle precipitation uses the row's actual reference arc. In particular I-80 and Golf B source rows use 360°, whereas PGJ/PGP/I-20/I-25/I-40 adjustable and ST use 180°.
7. Archived I-50 entries remain deprecated and noncalculable after metadata corrections.

