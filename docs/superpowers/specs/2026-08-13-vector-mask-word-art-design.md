# Vector Mask Word Art Design

## Goal

Render all seven Word Art templates as crisp, dense silhouettes by replacing
their simplified region equations with vector paths and using an occupancy map
to fill narrow and outer regions with small words.

## Scope

- Refine heart, star, lightbulb, cloud, DNA, circle, and apple templates.
- Keep the current shape selector, palettes, local token aggregation, refresh
  action, and PNG export.
- Preserve the current heart's overall appearance while improving its packing
  density.
- Do not introduce an image asset or external dependency.

## Root Cause

The current renderer uses basic mathematical inclusion tests. The star is a
radial alternating-radius approximation, while the lightbulb, cloud, and apple
combine circles and rectangles. Words are searched from the centre through the
same spiral for every candidate. This makes the mask boundary imprecise and
leaves tapered and concave areas sparse even when small filler candidates are
available.

## Architecture

The canvas renderer in `js/modules/teacherStageResponses.js` will build a
shape-specific `Path2D` at the current display size, rasterize it into a
low-resolution offscreen occupancy map, and place words against that map.

### Vector paths

`createWordArtShapePath(ctx, shape, cx, cy, radius)` returns a `Path2D` for the
chosen template:

- Heart: two cubic upper lobes with a pointed lower tip.
- Star: a regular concave five-point star using alternating outer and inner
  radii.
- Lightbulb: a curved bulb, a narrowing neck, and a connected base.
- Cloud: overlapping Bézier lobes and a rounded lower edge.
- DNA: a thick double-helix silhouette with crossbars included in the outline.
- Circle: a standard circular path.
- Apple: two upper lobes, an indented top, curved body, leaf, and stem.

The existing normalised shape predicate will be retired from drawing decisions.
It may remain only temporarily for compatibility with pure helper tests until
those tests use the occupancy map instead.

### Occupancy map

`createMaskMap(ctx, path, width, height, scale)` will rasterize each path to a
small canvas. It exposes:

- `canPlace(box)`: every sampled cell of the candidate box is inside the mask
  and currently unused;
- `occupy(box)`: mark the accepted box and a small gap as unavailable;
- `availableCells(tier)`: supply centre-biased cells for primary terms and
  edge-prioritized cells for filler terms.

The map is internal to a render pass and is rebuilt when the user changes the
shape or presses refresh.

### Placement pipeline

The existing three candidate tiers remain, but positions come from mask-map
cells rather than one shared spiral:

1. Primary terms use central interior cells and large type.
2. Medium terms use all remaining interior cells, with horizontal and vertical
   orientations.
3. Filler terms choose edge and narrow-region cells first, using 5–10px type
   and bounded size fallback.

All candidates have fixed limits and a finite sample count. A candidate that
cannot fit is skipped after its size fallback is exhausted.

## Error Handling and Performance

- Empty input preserves the current empty-canvas message.
- A failed candidate never prevents later candidates from filling the mask.
- The occupancy scale, candidate count, and samples per candidate are fixed to
  keep rendering responsive in the browser.
- If `Path2D` or offscreen rasterisation is unavailable, the renderer uses the
  existing normalised predicate as a compatibility fallback.

## Testing

- Each supported shape produces a non-empty mask with both interior and edge
  cells.
- Placement accepts a box within a mask and rejects a box outside or already
  occupied.
- Filler candidates are generated with smaller font sizes than primary terms.
- Renderer integration calls the vector-path and mask-map placement pipeline.
- Existing response-token aggregation tests remain valid under their current
  student-coverage contract.

## Constraints

- No external API, image asset, or runtime dependency.
- Continue rendering at 800×500 CSS pixels with high-DPI export.
- Render locally in the browser only.
