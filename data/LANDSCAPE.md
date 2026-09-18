# Landscape catalog

`landscape-plants.json` contains reviewed horticultural records. Add records here without changing UI code; a content revision automatically imports them into D1 on the next catalog request. Existing records are updated by their stable `id`. Runtime search also adds taxonomy records from iNaturalist to the separate `landscape_plants` table. All clients read the same catalog through `GET /api/landscape`.

Each record follows `PlantRecord` in `src/lib/landscape-types.ts`. Species and cultivars have distinct IDs. A cultivar is not assigned a species' size or irrigation data without a source that actually applies to that cultivar. `null` means unknown, and is rendered as “Нет данных”. Russian/Latin names, cultivar and aliases participate in one Unicode-normalized search, independently of category.

Photos have a source page, author and license. Checked bundled photos are in `public/landscape`; the inspector includes photo credits. The plan uses drafting symbols, never photographs. External taxonomy results can have missing photos or horticultural fields; these are explicitly identified as missing. When an external record is inspected, a matching NC State Extension species profile can supply factual dimensions and growing conditions. A differing species/cultivar title is rejected. Taxonomy does not imply a water category or a mature size.

Quantitative water records require a range, unit, source URL and applicable conditions. A generic category is never converted to litres. `plantIrrigationInput()` joins the instance's actual diameter, project climate/season, local exposure/soil and irrigation method for a future calculation module. Zone assignment is stored separately from the botanical recommendation. No automatic demand calculation is enabled.

Drawing objects live in `CadDrawing.plants`, retaining a catalog ID and source snapshot. They use the existing project persistence, undo/redo and project export/import. Local project storage behavior is intentionally consistent with previous app versions. The catalog itself is persisted in D1. The public catalog API accepts GET only, and only trusted server-side source adapters insert records.

The appended Drizzle migration creates the catalog and query cache; migrations contain no seed data. Do not edit an applied migration. API errors are recoverable and cannot replace a project or its plant snapshots.
