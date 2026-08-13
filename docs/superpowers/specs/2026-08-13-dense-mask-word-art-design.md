# Dense Mask Word Art Design

## Goal

Make every Word Art mask render as a dense, recognizable silhouette by placing
words only when their rendered bounds fit inside the selected mask, then filling
remaining space with progressively smaller repeated tokens.

## Scope

- Applies to every existing mask: heart, star, lightbulb, cloud, diamond,
  circle, and apple.
- Preserves the existing frequency-based prominence of the first occurrence of
  each token and the existing color palettes, shape controls, refresh action,
  and PNG export.
- Does not change the separate interactive tag-based word cloud or server-side
  response aggregation.

## Architecture

The canvas renderer remains in `js/modules/teacherStageResponses.js`. It will
replace its single spiral placement loop with a deterministic three-pass layout
pipeline. A shape-fit helper will sample the candidate word rectangle rather
than checking only its centre. A collision helper will enforce a small, shared
gap between placed bounds.

### Candidate construction

`buildWordArtCandidates(tokens)` will return candidate objects with text,
frequency rank, prominence tier, preferred font size, and rotation preference.
It creates:

1. One large primary candidate for each token.
2. A capped set of medium repeated candidates weighted by token frequency.
3. Small filler candidates, repeated until a fixed density target is reached.

Primary candidates are placed first so frequently used terms retain visual
importance. Filler candidates do not affect data aggregation; they only reuse
the same token text to fill the mask.

### Placement

`placeWordArtCandidate(...)` will try a deterministic set of centre-out spiral
positions. It will attempt the candidate's preferred font size, then reduce the
size through bounded fallback steps. For each attempt it will:

1. Measure the actual text bounds for its orientation.
2. Reject the candidate unless sampled points across its axis-aligned bounds
   are inside the selected mask.
3. Reject the candidate if its padded bounds collide with a previously placed
   word.
4. Draw and record the accepted candidate.

The three passes use different size ranges and attempt budgets. This allows
small candidates to occupy narrow boundary regions that cannot hold headline
terms, including star points and the top lobes and lower tip of the heart.

### Mask consistency

The existing `isInsideShape(nx, ny, shape)` remains the single source of truth
for geometry. `fitsInsideShape(box, centre, radius, shape)` samples all four
corners, edge midpoints, and centre of each candidate rectangle. The resulting
behaviour is shared across all masks without per-shape rendering branches.

## Failure handling

- Empty token input continues to render the existing informative empty state.
- A candidate that cannot be placed after its bounded retries is skipped; the
  renderer continues to later, smaller candidates.
- A rendering pass cannot exceed fixed candidate and search-attempt limits, so
  a long class response cannot stall the browser UI.

## Testing

Add focused Node tests for exported pure layout helpers:

- all sampled bounds of an accepted candidate are inside the requested mask;
- overlapping padded bounds are rejected;
- candidate construction includes primary, medium, and small filler tiers with
  bounded counts;
- font-size fallback can place a smaller candidate when its preferred size
  cannot fit;
- existing token-frequency tests continue to pass.

Browser verification will use each mask control and confirm that the rendered
silhouette is visibly dense, the refresh action is deterministic for identical
input, and PNG download preserves the canvas result.

## Constraints

- No new client dependency.
- Keep rendering local to the browser; do not add an AI or database request.
- Retain the 800 by 500 CSS canvas display size and device-pixel-ratio export
  behaviour.
