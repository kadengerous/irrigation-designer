# Toro Precision Spray O/O-T and compatibility audit — 2026-10-10

All **102 O/O-T models**, comprising **51 female and 51 male variants**, match the accessible official tables. The fresh comparison covered **204 physical source rows expanded to 408 model rows**, including **48 strip dimension rows**, with **zero numeric or metadata differences**. The complete model list was independently found in the current 2026 price list. No hydraulic, color-value or geometry replacement is proposed.

## Evidence and limits

The [official 25-1045-IRC sell sheet](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Spray-Head-Nozzles/Precision-Spray-Nozzles/16-1045-PSN-Sell-Sheet.ashx) remains available under an older filename. All source lines covering its O performance tables, pages 6–7, were freshly read and parsed into `legacy-official-rows.json`. Comparison with the current catalog is recorded per row in `legacy-row-comparison.json`; all 102 models and checked metadata are in `legacy-model-coverage.json`. The comparison includes pressure/bar/kPa, flow/L/min/m³/h, arc, radius, both precipitation columns, and strip width/length.

The [2026 price list](https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf), also served under an older filename, explicitly lists all 102 identifiers. Its pages 7–8 distinguish O-T for Toro 570Z bodies from female O for Rain Bird, Hunter and Irritrol. See `legacy-current-model-list.json`. These are distinct hardware variants, not duplicate catalog entries. Do not mark O models discontinued merely because PSN/PSN+ also exist. None of these 102 identifiers carries the P suffix for an optional pressure-compensating nozzle.

The current [2026 full catalog](https://cdn2.toro.com/en/-/media/Files/Toro/professional-contractor/Literature/26-1020-DB-ResCom-Irritrol-Catalog.ashx) exceeded the web parser's size limit. This audit does **not** claim a fresh complete read of that file. Its previously verified primary provenance remains unchanged; the accessible O sell sheet supplies fresh row corroboration. The [undated bidding DOC](https://specifier.toro.com/cads/nozzles/precision_series_nozzles.doc) is unsupported by the web parser. Its existing local official copy was read as older evidence and its hash recorded, without any external shell download. Exact source status is in `legacy-source-manifest.json`.

## Sectors, radii, colors and pressure

The 90 sector variants comprise five nominal radii × nine fixed sectors × two threads. Supported sectors are **60, 90, 120, 150, 180, 210, 240, 270 and 360°**, each a separate fixed model. No intermediate sector should be created by scaling that nozzle's arc or flow. The remaining 12 models are six strip patterns in both threads.

| Nominal size | Official color name | Trajectory | Existing absolute reduction floor |
| --- | --- | ---: | ---: |
| 5 ft | Red | 5° | 1.143 m |
| 8 ft | Green | 10° | 1.8288 m |
| 10 ft | Blue | 15° | 2.286 m |
| 12 ft | Brown | 20° | 2.7432 m |
| 15 ft | Black | 27° | 3.429 m |
| Strips | Grey | 20° | No quantitative strip-resizing rule |

The manufacturer names colors explicitly; existing hex values remain approximate UI representations. Recommended pressure is **30 psi**, with mechanical operation **20–75 psi**. The O performance chart only supports **20/30/40/50 psi**. Do not extrapolate hydraulic performance from 50 to 75 psi merely because the mechanical range is wider. Keep the pressure-specific native throw, including published nonmonotonic values.

O-10-Q has 0.26 gpm at 20 psi followed by 0.23 gpm at 30 psi. O-12-Q has throws 12.0/12.1/11.4/12.0 ft across its four pressure rows. The fresh source confirms these values. A different PSN chart or monotonic interpolation assumption is not a manufacturer erratum; no replacement is justified.

## Radius reduction and precipitation

The freshly accessible [official 13-1045-IRC specification](https://media.toro.com/CatalogDocuments/Product%20Literature/psn_ss.pdf) states a maximum 25% radius reduction with precipitation retained and matching between radius families. The existing undated bidding specification further identifies the reference as the **original designated radius**. Therefore retain the current explicit `minimumRadiusM` values above. Do not change O models to a pressure-row-relative minimum, and do not calculate the floor from `rNom`: the native 30 psi throw differs from the model label for O-5-210 and O-12-Q.

No measured reduced-radius flow table was located. Matched-precipitation flow scaling is a model derived from the stated behavior and must remain labelled as calculated. Preserve published square and triangle precipitation values rather than recalculating them from rounded flow/radius. Time for 10 mm is derived as `600 / precipitationMmH`, with the selected layout assumption retained.

All strip rectangles and origins match the official patterns: SST starts at the long-edge midpoint; LCS/RCS start at a corner. The 4×30 SST is 4×28 ft at 20 psi and 4×30 ft thereafter. Other listed patterns retain their dimensions. The stored scalar radius is half the SST length or full corner-strip length, not a circular throw. Internal arc 180° is likewise not a published circular pattern and should not govern simulation. Keep rectangular rendering and manual placement. The O strip chart prints both precipitation columns but gives no exact spacing/overlap rule; do not label them as single-head or no-overlap rates, or infer arbitrary strip-zone compatibility.

## Complete Toro group inventory

Read-only SSR inventory found **217 active placeable model entries**, **40 separate bodies**, no missing model and no duplicate model/nozzle configuration. See `legacy-group-coverage.json`.

| Top-level group | Models / nozzle configurations | Inner partitions | Rule |
| --- | ---: | ---: | --- |
| Precision Spray / PSN+ | 204 / 204 | 12 | O and PSN families, five size partitions and one strip partition for each series |
| T5 RapidSet | 13 / 156 | 1 | Rotor compatibility depends on installed nozzle, pressure, radius and actual sector |

The common Precision group is supported by the manufacturer's family-level matching claim. At recommended nominal pressure, the same-zone class can span O/PSN and male/female interfaces. Thread fit determines the body, not irrigation-zone precipitation. At other pressures, actual supported precipitation should control compatibility. Strips remain excluded from the universal matched class and automatic radius/sector selection. T5 remains separate and configured; rotor flow must not be proportionally changed when the rotor arc changes.

## Runtime finding and proposed integration

A reproduced defect separates equivalent 30 psi hardware variants. Before the integration fix, O-8-H on Hunter PRS30 used 2.1 bar and key `spray|25.4|p:2.1000`; O-T-8-H on Toro 570Z PRX used 2.068427 bar and key `toro:precision|p:2.0684`. PSN8-H also interpolated its radius to 2.5935915 m instead of its 30 psi 2.5908 m value. Defaults, automatic selection and compatible-zone matching therefore disagreed.

Normalize **only documented nominal 30 psi** for Toro Precision to its canonical 2.068427 bar table setting, including exact displayed 2.1 bar. Apply the same rule in defaults/body changes, saved-head lookup, automatic candidates, strip dimensions and hydraulic compatibility keys. Do not normalize adjacent 2.09/2.11 bar values or the PRS40 nominal setting. Regulator limits must also apply when a Toro female nozzle uses a compatible Hunter body. Preserve raw saved data where migration policy requires it, while interpreting the equivalent setting consistently.

`legacy-recommended-patches.json` contains only date refreshes for the 102 audited catalog records and explicit runtime recommendations. It preserves all hydraulic rows, distinct IDs, primary source version, colors, strip geometry and O-series absolute reduction floors. Runtime and simulation regression validation is performed by the integrating task.
