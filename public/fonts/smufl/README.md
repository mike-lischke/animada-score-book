# SMuFL fonts

Music fonts the score can be drawn with. `index.json` is the single list the app
reads; every font file it names lives in this folder next to it.

All fonts here are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)
(OFL-1.1), which permits bundling, embedding and redistribution with this app.
The license notice of each font sits next to it and must stay there: the OFL
requires the license to travel with the font. Gootville's upstream project
publishes no separate OFL text, so its own `Gootville-readme.txt` is kept as the
license evidence, verbatim.

## Fonts

| Id | Name | File | Format | Version | Source |
|---|---|---|---|---|---|
| `bravura` | Bravura | `Bravura.woff2` | woff2 | 1.482 | https://github.com/steinbergmedia/bravura |
| `eugene` | Eugene | `Eugene.otf` | OpenType | 1.44 | https://github.com/mikkopatama/eugenefont |
| `gootville` | Gootville | `Gootville.otf` | OpenType | 1.3 | https://github.com/musescore/MuseScore/tree/master/fonts/gootville |
| `leipzig` | Leipzig | `Leipzig.woff2` | woff2 | 5.2.102 | https://github.com/rism-digital/leipzig |
| `leland` | Leland | `Leland.otf` | OpenType | 0.80 | https://github.com/MuseScoreFonts/Leland |
| `petaluma` | Petaluma | `Petaluma.woff2` | woff2 | 1.065 | https://github.com/steinbergmedia/petaluma |
| `sebastian` | Sebastian | `Sebastian.otf` | OpenType | 1.35 | https://github.com/fkretlow/sebastian |

Gootville's upstream readme still carries "1.2" in its title; the version above is
the one its own metadata reports.

The files are taken unchanged from the sources above. Fonts that the source ships
as WOFF2 keep that format; the rest keep their OpenType file. Repackaging an
OpenType font into WOFF2 is a modification under the OFL and would make the
reserved font name apply, so the files are shipped as published.

## Adding a font

1. Drop the font file, its SMuFL metadata JSON and its license notice into this folder.
2. Add one entry to `fonts` in `index.json`.
3. Done — no source change, the settings dialog picks it up.

Only add fonts whose license allows redistribution and PDF/print embedding.
Commercial SMuFL fonts (e.g. November 2.0 or the Norfonts range) do not.

## Relationship to `public/fonts/`

`public/fonts/PetalumaScript.woff2` (the text font used for time signatures) is a
member of the Petaluma family and is licensed under the same terms as
`Petaluma.woff2` here.
