# Cowart Image Map Coverage

Use this reference whenever `cowart-image-gen` creates a `cowartImageMap` sidecar. The bitmap generator returns only pixels; the map is a selector contract that Codex authors after inspecting the final image.

## Goal

Make the overlay useful for direct selection. A user should be able to hover or click the parts they would naturally name in an edit request, not only the headline and one large scene box.

## Coverage Pass

After the final bitmap is generated, do a visual inventory before writing JSON:

1. Text: all meaningful visible copy, labels, numbers, UI text, poster text, and captions.
2. Modules: major structural zones such as header, hero image, product panel, chart area, sidebar, card, full interior scene, or footer.
3. Prominent internal objects: clearly visible objects inside those modules that a user is likely to select or annotate.

For each candidate, ask whether the object is visually distinct and actionable. If yes, add an `area` region even when it already sits inside a larger `module` region. Overlap is allowed because the overlay is a semantic selector, not an image segmentation mask.

## Object-Level Heuristics

Include object-level regions for clear, actionable objects:

- Interior and poster scenes: sofa, chair, cabinet, coffee table, rug, lamp, vase, bowl, books, plant, window, wall art, framed picture, mirror, shelf, decor grouping.
- Product images: product body, label, cap, handle, screen, control, packaging, accessory, hero prop.
- UI mockups: button, input, card, nav item, chart, table, toolbar, modal, icon group.
- Diagrams and infographics: node, connector group, legend, axis label, callout, illustration panel.
- Ads and covers: hero subject, badge, CTA, price tag, logo area, feature block, supporting prop.

Omit candidates that are too small to click reliably, purely decorative texture, mostly hidden, or ambiguous after visual inspection. If a clear object is partly occluded but still likely to be referenced, include the visible bounding rectangle and lower `confidence`.

## Region Count Targets

These are guidance targets, not hard limits:

- Simple icon/product cutout: 1-4 regions.
- Poster, ad, cover, UI panel, or product scene: 6-14 regions.
- Dense dashboard, infographic, interior scene, or annotated concept board: 10-20 regions.

If the image contains obvious sub-objects, avoid stopping at 3-6 broad regions. If the map grows beyond about 20 regions, keep the most actionable objects and omit low-value decoration.

## Bbox Style

Use a tight rectangular bbox around the visible object or text. Do not include large empty surroundings just to make selection easier; the overlay already handles hover affordance. For text, fit the actual glyph line or block. For framed objects, include the frame if the user would treat it as part of the object.

Use stable, specific ids:

- Good: `headline`, `subtitle`, `primary-wall-art`, `small-wall-art`, `table-lamp`, `ceramic-vase`, `lounge-chair`, `walnut-sideboard`, `coffee-table`, `plant-left`.
- Weak: `object-1`, `decor`, `image-area`, `scene-detail`, `misc`.

## Example: Mid-Century Interior Poster

A useful map for a generated interior poster should include text regions and internal objects, for example:

- `headline` as `text`
- `subtitle` as `text`
- `footer` as `text`
- `interior-scene` as `module`
- `lounge-chair` as `area`
- `walnut-sideboard` as `area`
- `primary-wall-art` as `area`
- `small-wall-art` or `right-wall-art` as `area`
- `table-lamp` as `area`
- `ceramic-vase` as `area`
- `left-plant` or `right-plant` as `area`
- `coffee-table` as `area`
- `tabletop-books` or `bowl` as `area` when clearly visible

Do not use one `Walnut sideboard and wall art` rectangle as the only representation of the lamp, vase, framed art, books, and cabinet when those objects are clearly visible. Keep the broad region if useful, but add object-level regions for the obvious selectable parts.
