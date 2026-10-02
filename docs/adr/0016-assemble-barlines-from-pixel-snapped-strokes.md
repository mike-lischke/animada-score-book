# ADR-0016: Assemble barlines from pixel-snapped strokes measured against the font's barline glyphs

- Status: accepted
- Date: 2026-10-01
- Supersedes: ADR-0014, the part that has barlines take their measures from the font's engraving defaults alone
- Related: ADR-0014, `src/core/ScoreSymbols.ts`, `src/core/smufl/SmuflFontLoader.ts`,
  `src/components/ui/framework/BarlineView.tsx`
- Relevant when: score rendering, barlines, repeat barlines, final barline, fonts, engraving metrics, staff view

## Context

A font's barline glyphs are thinner than a pixel at score size, so the browser anti-aliases them and they look
fuzzy. The engraving defaults ADR-0014 measures barlines by state a stroke separation wider than the font's own
repeat glyphs draw, so a barline built from them alone looks wrong next to the font.

## Decision

We will assemble every barline from the parts the symbol catalogue lists: strokes in the thickness the engraving
defaults state, rounded to whole pixels, and the repeat dots as the font's glyph. The stroke separation is what the
font's glyph for the same barline leaves of its ink width after the parts and dot gaps. The font loader publishes
width and separation per barline as CSS variables.

## Invariants

- Barline strokes land on the pixel grid; only the round repeat dots are glyphs.
- The width and separation of a barline follow a font change, like every glyph does.
- A barline the font has no glyph for, or that has no gap between strokes, uses the separation the engraving
  defaults state.
- The catalogue is the only place that states which parts a barline consists of and which edge it stands on.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Strokes snapped to pixels, separation measured against the font's glyph (chosen) | Sharp strokes that still match the font's proportions |
| The font's barline glyphs | Rejected: sub-pixel strokes render fuzzy |
| Strokes measured by the engraving defaults alone | Rejected: repeat strokes stand visibly too far apart |

## Consequences

- Positive: crisp barlines whose proportions follow the selected font.
- Trade-off: barline geometry depends on CSS variables the loader measures at load time.
