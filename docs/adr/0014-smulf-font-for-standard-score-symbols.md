# ADR-0014: Draw standard score symbols as glyphs of a user-selectable SMuFL font

- Status: accepted
- Date: 2026-09-28
- Related: issue #46, `src/components/ui/framework/NoteImage.tsx`, `build/fix-svg-attributes.ts`,
  `src/ui/SettingsDialog.tsx`
- Relevant when: score rendering, notation symbols, noteheads, rests, fonts, settings, print,
  engraving metrics

## Context

Standard symbols are hand-made today: two SVG sprites toggled by CSS variables, CSS shapes for the clef,
barlines, staff lines and beams, plain text for the time signature and accents, inline SVGs for the
decorations. A build-time script (`build/fix-svg-attributes.ts`, `npm run fix-svgs`) repairs the sprites
after drawing-tool exports.

Every new symbol means hand-drawing it and wiring another mechanism, and a symbol can exist twice: the
accent is a `>` character although a SMuFL font carries it as a glyph.

## Decision

We will draw standard score symbols as glyphs of a self-hosted, user-selectable SMuFL font and keep
domain pictograms (rim, body, cross-click, scraped, blown, hand techniques) as own paths, both through
one symbol catalog that maps every notation symbol to exactly one source. Stems, beams, staff lines,
barlines and tuplet brackets stay drawn geometry, but take their measures from the font's engraving
defaults and glyph anchors instead of pixel constants.

## Invariants

- Every notation symbol has exactly one source, a SMuFL glyph or a custom path; none exists in both.
- Changing the font changes every standard symbol in every notation view and nothing else.
- Custom percussion heads and pictograms do not depend on the selected font.
- Drawn geometry derives its measures from the font's engraving defaults and glyph anchors, never from
  literal pixels.
- Fonts are self-hosted under `public/fonts/smufl/` and added through its index without a source change.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Catalog over a selectable SMuFL font (chosen) | Engraved glyphs, font choice without a code change |
| Convert glyphs to SVG paths at build time | Rejected: keeps the sprite pipeline and forfeits the metrics |
| Font for every symbol, percussion heads included | Rejected: those symbols would lose the house style |

## Consequences

- Positive: standard symbols come from engraved glyphs, a new symbol is one catalog entry, the sprites
  and the repair script disappear.
- Trade-off: the app ships fonts and depends on SMuFL metrics; pixel-tuned layout and hit-testing must
  be re-derived.
- Follow-up: issue #46 covers the catalog, the font choice and the rendering specs.
