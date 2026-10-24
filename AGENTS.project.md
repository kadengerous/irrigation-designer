# Project requirements

## Application settings and UI scale

Use rem for interface text, icons, control dimensions and spacing, including
Tailwind arbitrary values. `src/lib/ui-scale.ts` applies the user's UI size at
the document root; use `uiPixels` only when positioning UI in measured viewport
coordinates. Never apply CSS zoom/scale to the canvas or change project geometry,
pan or pixels per metre when changing UI size. Keep viewport media queries in px.
Settings have one opaque frame shared by Interface, Units and Language, with
scrolling inside the content area on constrained screens. Preserve technical
canvas colours when switching themes. Keep all nine themes available: crystal,
pearl, sage, ice, sand, lavender, light, mint and graphite. The obsolete matte
preference maps to mint; lavender replaces its duplicate in the chooser. Keep
technical canvas colours independent of these interface palettes.

## Localization is part of every feature

From 2026-09-19, all existing and new user-facing surfaces must support all 20 languages: English (en), Russian (ru), Spanish (es), Brazilian Portuguese (pt-BR), French (fr), Italian (it), German (de), Arabic (ar), Turkish (tr), Polish (pl), Simplified Chinese (zh-CN), Dutch (nl), Czech (cs), Greek (el), Hungarian (hu), Romanian (ro), Slovak (sk), Hebrew (he), Ukrainian (uk), and Japanese (ja). The shared registry is `src/lib/locale-config.ts`.
Use stable internal identifiers and
central translation keys for labels, hints, dialogs, errors, accessibility text,
catalogs, search and exports. Never put display-language strings into logic.
Preserve user-authored names. Translate generated names at display time.

Use professional CAD, landscape and irrigation terminology, language-appropriate
fonts, flexible controls, wrapping, localized numbers and dates. Keep the language
independent of metric/US customary engineering units. Store geometry and hydraulic
values in canonical SI units; convert only at input/output boundaries.

Every new translation key must exist in all 20 languages before release, including
catalog descriptions, documentation titles, errors, warnings and accessibility.
Do not inherit an English dictionary to disguise missing translations. Only
declared brand names, file formats and standard symbols may be shared.
Run `node --test scripts/reference-localization.test.mjs scripts/locale-units.test.mjs`
to check coverage, interpolation, locale-aware input/output and shared panels.
Check both phone and tablet/desktop workflows and long/CJK labels. Preserve
scientific plant names when no verified common name exists in the selected language.

Equipment model/series names and equipment library category names are a deliberate
exception: use the original English catalog name unchanged in every locale,
including cards, plan labels, estimates and exports. UI parameters, descriptions,
the All filter and generated zone names remain localized. User zone names never change.

## Workspace sections and reference drawings

Top-level navigation: Reference | Plan, Landscape, Irrigation. Reference is an
auxiliary preparation panel, separated visually. No numbered stages or mandatory
sequence. Automatic placement belongs inside Irrigation.

Reference drawings are optional. PDF imports with multiple pages require page
selection. Setup supports translation, uniform scaling, rotation, transparency
and calibration against two points. Calibration changes only the reference,
preserves existing geometry, and locks the reference. Visibility/transparency stay
editable when locked. Underlays never intercept drawing input while locked.

Warn before unlocking a calibrated reference: resizing clears calibration and
requires setting its scale again. Moving and rotating preserve calibration.
Keep resizing available after confirmation. Use red for reference deletion and
the locked-padlock icon; cross the hidden-reference eye with a red line.

## Complete dictionaries and bidirectional UI

Canonical messages live in `src/lib/locales/{locale}.json`. Add each new key to
all 20 dictionaries in the same change; never copy an English dictionary as a
fallback. `src/lib/locale-config.ts` owns language codes, direction and formatting
locales. Migrate historical `pt`/`zh` preferences to `pt-BR`/`zh-CN`.
Arabic and Hebrew require RTL DOM direction, Radix direction context, logical
spacing, mirrored navigation and panels. Never mirror the design geometry or
change stored coordinates. Keep Latin model identifiers and numbers isolated.
Check Latin, Cyrillic, Chinese, Japanese, Arabic and Hebrew text, including long
labels, native digits, exported reports and saved user-authored names.
