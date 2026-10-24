# Toro follow-up — 6 October 2026

## Model decisions

- **PSN15-F and PSN15T-F: recommend Verified for the current 20–50 psi table, including geometry.** This resolves catalog selection by documented primary-source precedence, not by proving a manufacturer erratum. Keep current numeric rows unchanged; do not merge the older 60–70 psi rows. Radius-reduction flow remains unknown.
- **T5S-RS and T5SE-RS: keep CV as an unverified body feature.** Their nozzle hydraulics remain Verified. Do not advertise a factory check valve, and do not change the feature to a definite No.

## Why current PSN data can take precedence

The [current Toro product page](https://www.toro.com/en/product/Precision-Series-Spray-Nozzles) explicitly links the [current dedicated performance chart](https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e) and [26-1045 model list](https://cdn.thetorocompany.com/api/assetstorage/623_40a88c26-9e2a-4212-918c-b86a065f0536). PDF metadata dates the chart to 8 May 2026 and the model list to 12 May 2026. The latter names both PSN15-F and PSN15T-F as 360° models; the chart covers PSN IDs in both thread variants.

The [2026 catalogue](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Literature/26-1020-DB-ResCom-Irritrol-Catalog.ashx) was created 12 November 2025 and modified 19 November 2025. Its page 79 alternatives repeat the [older dedicated chart](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/PSN-CHARTS-ONLY.ashx), created 11 November 2024. UK and Mexico product pages point to the same current May 2026 assets. This establishes a later current dedicated source rather than a vote among sources.

| psi | Current gpm / ft / square / triangle | Older PSN+ gpm / ft / square / triangle |
|---:|---|---|
| 20 | 2.20 / 14.5 / 1.0 / 1.2 | no row |
| 30 | 2.31 / 15.0 / 1.0 / 1.1 | 1.94 / 14.1 / 0.9 / 1.1 |
| 40 | 2.35 / 15.2 / 1.0 / 1.1 | 2.25 / 14.5 / 1.0 / 1.2 |
| 50 | 2.40 / 15.3 / 1.0 / 1.1 | 2.51 / 15.0 / 1.1 / 1.2 |
| 60 | no row | 2.76 / 14.8 / 1.2 / 1.4 |
| 70 | no row | 2.95 / 15.1 / 1.3 / 1.4 |

Precipitation columns are inches/hour. All four current rows reproduce both published rates with direct rounding of full-circle head-to-head arithmetic. Older rows are also consistent within displayed input precision (the 70 psi square rate requires rounding tolerance). Thus internal arithmetic does **not** establish which physical test is correct. Current 15-F values also match predecessor O15-F data; this is recorded, but neither an accidental copy nor an intended redesign can be inferred. No explicit correction notice or hardware-revision statement was found. The application should disclose its source choice and retain the competing raw table.

## Why the shrub valve still cannot be resolved

The [current exact T5S-RS page](https://www.toro.com/en/product/T5S-RS) lists Check Valve No. However, it also assigns this shrub model a five-inch pop-up specification, so the exact-model page has evident family-template contamination. The [2015 US sheet](https://media.toro.com/CatalogDocuments/Product%20Literature/t5_sell_sheet.pdf) states factory CV for shrub models, covering T5S-RS and T5SE-RS. The [April 2016 Australian sheet](https://www.toro.com.au/media/10635/t5-rapidset-rotors_sell-sheet-april2016_web.pdf) explicitly describes T5S-RS with a check valve.

The [currently linked 20-1009 sheet](https://cdn.thetorocompany.com/api/assetstorage/623_82540b95-decc-419e-981e-b9f5fb6dfa25) and current catalogue do not say whether these two exact shrub SKUs include it; generic optional-CV wording and an accessory listing cannot establish absence. The [2015 bid specification](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Rotors/T5-RapidSet-Series/T5-RapidSet-Series-Sprinkler-Bidding-Specs.ashx) is generic, describes the five-inch popup, and is not a later exact shrub correction. No dated factory change or regional distinction was located. Therefore a definite Yes or No would overstate evidence. Current factory BOM confirmation for each SKU would resolve this field; no contact was sent.

## Deliverables and scope

`proposed-patches.json`: four sparse records — two PSN status/note updates and two T5 provenance-note updates. No numeric changes. `model-evidence.json`: both competing tables, arithmetic diagnostics, exact source/model conclusions. `pdf-manifest.json`: retained official PDFs, SHA-256 and metadata. Source PDFs/text extracts are alongside the report.

Official Australian PDF text was readable through the web research tool, but direct download returned a challenge page; the response is saved as HTML, not misrepresented as a PDF. No challenge bypass, browser, Sites call, checkout write, or manufacturer contact was performed.
