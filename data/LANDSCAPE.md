# Landscape catalog

`landscape-plants.json` contains reviewed horticultural records. Add records here without changing UI code; a content revision automatically imports them into D1 on the next catalog request. Existing records are updated by their stable `id`. Runtime search also adds taxonomy records from iNaturalist to the separate `landscape_plants` table. All clients read the same catalog through `GET /api/landscape`.

Each record follows `PlantRecord` in `src/lib/landscape-types.ts`. Species and cultivars have distinct IDs. A cultivar is not assigned a species' size or irrigation data without a source that actually applies to that cultivar. `null` means unknown, and is rendered as “Нет данных”. Russian/Latin names, cultivar and aliases participate in one Unicode-normalized search, independently of category.

Photos have a source page, author and license. Checked bundled photos are in `public/landscape`; the inspector includes photo credits. The plan uses the decorative overhead artwork in `public/plants`; botanical records and their photographs remain separate from this visual library. External taxonomy results can have missing photos or horticultural fields; these are explicitly identified as missing. When an external record is inspected, a matching NC State Extension species profile can supply factual dimensions and growing conditions. A differing species/cultivar title is rejected. Taxonomy does not imply a water category or a mature size.

Quantitative water records require a range, unit, source URL and applicable conditions. A generic category is never converted to litres. `plantIrrigationInput()` joins the instance's actual diameter, project climate/season, local exposure/soil and irrigation method for a future calculation module. Zone assignment is stored separately from the botanical recommendation. No automatic demand calculation is enabled.

Drawing objects live in `CadDrawing.plants`, retaining a catalog ID and source snapshot. They use the existing project persistence, undo/redo and project export/import. Local project storage behavior is intentionally consistent with previous app versions. The catalog itself is persisted in D1. The public catalog API accepts GET only, and only trusted server-side source adapters insert records.

The appended Drizzle migration creates the catalog and query cache; migrations contain no seed data. Do not edit an applied migration. API errors are recoverable and cannot replace a project or its plant snapshots.


## Furniture, lighting, decor and equipment

`src/data/landscape-objects.json` contains the 66 non-plant library records. A stable ID selects one transparent overhead image in `public/landscape`, localized names in every locale dictionary, a category, a library subcategory and a physical footprint shape. Artwork provenance is in `landscape-artwork.json`. Original imagegen PNGs are retained byte-for-byte in source; lossless WebP delivery copies preserve their dimensions, every visible pixel and full alpha channel. `landscape-delivery.json` records the checked encodings; `scripts/encode-landscape-delivery.mjs` reproduces and verifies them using Sharp. Add future objects through these records and assets; category layers are independent of library subcategories.

Instances live in `CadDrawing.landscapeObjects`. Position, length, width and rotation are editable parameters stored in metres and degrees. Size defaults preserve the alpha-cropped artwork's proportions; dimensions are initial planning sizes, not manufacturer measurements. Circular records expose diameter. Suitable rectangular records allow explicit independent length/width edits. Rotation and resize are about the centre, and drag updates produce one undo commit on release.

The first object creates its category layer. Visibility is display-only; locks prevent object changes. Furniture, decor and equipment default to `noIrrigation=true`; lighting and the existing plants do not. The rotated occupied footprint is subtracted from the irrigation target, including for automatic placement and coverage diagnostics. It never modifies the sprinkler's water-jet footprint. Rectangle, circle, hexagon, concave corner-kitchen and irregular stone footprints share the same geometry in snapping and coverage.

The canvas and SVG-based PNG/JPEG/PDF exporters use the identical lossless image and alpha bounds. Embedded exports deduplicate images by catalog ID. No plant catalogue records or images are replaced by this extension. Favorites and recent selections are persisted as library preferences, separate from project geometry.
