# Hunter body and pop-up audit — 2026-09-19

Scope: body selection and mounting for all 104 currently placeable catalog items. Nozzle performance tables retain their separate verification date in `hunter-catalog.json`.

## Separate spray bodies

`src/data/hunter-body-models.json` records 58 individually listed models. Each record has a real SKU and pop-up height, rather than a generated combination of every suffix and height. Regional availability must still be confirmed with the supplier.

| Series | Pop-up heights, cm | Regulation | Primary Hunter source |
| --- | --- | --- | --- |
| PS Ultra | 5, 10, 15 | None | [PS Ultra](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/ps-ultra), [PSU-06](https://www.hunterirrigation.com/en-metric/irrigation-product/ps-ultra/psu-06) |
| Pro-Spray | Shrub adapter, 5, 7.5, 10, 15, 30 | None | [Pro-Spray](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm), [PROS-04-CV](https://www.hunterirrigation.com/en-metric/irrigation-product/pro-spraytm/pros-04-cv) |
| Pro-Spray PRS30 | Shrub adapter, 7.5, 10, 15, 30 | 2.1 bar | [PRS30](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm-prs30) |
| Pro-Spray PRS40 | Shrub adapter, 7.5, 10, 15, 30 | 2.8 bar | [PRS40](https://www.hunterirrigation.com/en-metric/irrigation-product/spray-bodies/pro-spraytm-prs40) |

Optional models retain CV (check valve), SI (side inlet), FloGuard and R (reclaimed-water identification) where Hunter lists them. These features are explained below the selector. Shrub adapters have zero pop-up; their installed riser height is separate from sprinkler pop-up height.

The 1/2-inch pipe inlet of a body is not its nozzle thread. The existing MP, spray and PCN/MSBN nozzle entries have standard female nozzle threads and fit these four families. HT male-thread MP variants are not in the current placeable catalog and are excluded by the compatibility function.

## Recommendations and mounting

| Existing emitter group | Default | Other choices / restriction |
| --- | --- | --- |
| MP Standard, MP800, MP Strip and Corner | PRS40 | PRS30 is supported for reduced/minimum radius; unregulated Pro-Spray and PS Ultra also fit. |
| Pro HE, Pro Adjustable 4A/6A, fixed, short-radius and strip sprays | PRS30 | Unregulated bodies also fit. PRS40 is mechanically compatible, but 2.1 bar remains the spray recommendation. |
| PCN and MSBN pressure-compensating bubbler nozzles | Pro-Spray | All four spray-body series fit; compensation already controls flow in the published operating range. |
| PCB, PCB-R and AFB bubblers | Direct riser | 1/2-inch riser mounting; no separate spray body or second body line in the estimate. |
| Conventional, golf and ST rotors | Integrated body | Only the verified heights of that rotor family are offered. |

Sources: [Standard MP Rotator](https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle), [MP Strip](https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle), [MP800SR](https://www.hunterirrigation.com/node/38356), [Pro HE](https://www.hunterirrigation.com/irrigation-product/nozzles/pro-high-efficiency-nozzles), [short-radius sprays](https://www.hunterirrigation.com/irrigation-product/nozzles/short-radius-micro-spray-nozzles), [bubblers and bubbler nozzles](https://www.hunterirrigation.com/en-metric/irrigation-product/nozzles/bubblers-bubbler-nozzles).

The selection distinguishes physical fit from recommended pressure. Choosing a different regulated family sets the corresponding pressure and recalculates performance. Changing only height within the same family keeps pressure and the designed radius. Pressure-compensating nozzles accept 2.8 bar using Hunter's published constant-flow operating range, without inventing an interpolated flow.

## Integrated rotors

`src/data/hunter-rotor-bodies.json` stores the model-specific heights, ordering identifiers and individual official URLs for PGJ, SRM, PGP-ADJ, PGP Ultra, I-20/I-20-SS, I-25/I-25-SS, I-40 variants, I-80 variants, I-90, G-70/G-75/G-80/G-85, ST-90, STG-900 and ST-1600. Plastic and stainless-steel variants do not inherit each other's height choices.

For [ST-90](https://www.hunterirrigation.com/irrigation-product/st-system/st-90) and [STG-900](https://www.hunterirrigation.com/irrigation-product/st-system/stg-900), the US model lists consistently specify 3 inches, converted to 76.2 mm. STG-900's metric model list rounds the same height inconsistently to 7.5 and 8 cm; these are not offered as two distinct bodies. ST model ordering also depends on the selected nozzle; the body selector uses the family identifier. Other records use Hunter's nominal metric heights. The discontinued I-50 is not placeable and receives no invented height options.

## Existing projects and estimates

The four legacy family identifiers remain aliases for their plain 10 cm bodies. Existing family-plus-height settings resolve to the matching real model. Unsupported legacy heights are preserved and flagged for review, never silently converted to an arbitrary 10 cm model. Changing unrelated settings preserves that warning.

The inspector and estimate use the same option labels and selection logic. Estimates separate different body and integrated-rotor heights, and exported estimates use the same names and quantities. Locked heads/zones cannot be changed through the estimate selector.

Validation: `scripts/hunter-bodies.test.mjs` checks all currently placeable items, available body choices, exact regulator pressure, nonzero flow, migration, undo, radius preservation and separate estimate quantities. Existing catalog and head-adjustment regression checks are also retained.
