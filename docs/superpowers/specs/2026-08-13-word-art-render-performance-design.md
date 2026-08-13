# Word Art Render Performance Design

## Goal

Keep Word Art Cloud responsive while retaining dense vector-mask packing.

## Root Cause

The renderer builds a 4px occupancy map by repeatedly rebuilding a shape's
outline during each point-in-shape check. It then gives every candidate all
available cells to scan. On an 800×500 canvas this causes hundreds of
milliseconds of synchronous map construction followed by millions of placement
checks, blocking the browser event loop.

## Design

1. Build each vector outline once per render and pass that cached point list to
   all shape checks.
2. Use an 8px occupancy map. Its 4× reduction in cells remains sufficient for
   5–10px filler text because box-fit checks sample the true vector outline.
3. Limit each tier to a deterministic, evenly distributed set of candidate
   points: 1,200 primary, 1,600 medium, and 2,000 filler points at most.
4. Render one tier per `requestAnimationFrame` callback. The tab becomes
   interactive between primary, medium, and filler placement work.
5. Keep a synchronous fallback for environments without `requestAnimationFrame`.

## Testing

- Cached point-in-shape checks accept the same inside/outside samples as the
  uncached helper.
- A generated map uses the requested 8px cell size and limits returned
  candidate points to the tier cap.
- Renderer source schedules tier work through `requestAnimationFrame` and keeps
  the synchronous fallback.

## Constraints

- Preserve existing masks, colour palettes, controls, local rendering, and PNG
  export.
- Do not add dependencies or external requests.
