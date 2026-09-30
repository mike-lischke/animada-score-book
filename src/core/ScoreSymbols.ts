/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The notation symbols the score draws, and the one source each symbol is drawn from.
 *
 * A symbol is either a glyph of the selected music font or a path the score draws itself. Both kinds
 * are addressed by the same name here and drawn by the same component, so a symbol exists exactly
 * once: adding one means adding one entry to this catalog, never a second way of drawing it.
 *
 * The measures of an own path are in staff spaces, the unit a music font is built on as well, so a
 * custom symbol scales with the font the score is drawn with.
 */

import { NoteDisplayType } from "./ScoreBookDataModel.js";
import { NoteLength } from "./rest-notation.js";
import { SmuflGlyph } from "./smufl/SmuflGlyphs.js";

/** A notation symbol the score draws, named by what it is in the score. */
export enum ScoreSymbol {
    /** The two strokes that open a percussion staff. */
    PercussionClef,

    /** The digits of a time signature, and the common time signature they form with a 4 over a 4. */
    TimeSignatureZero,
    TimeSignatureOne,
    TimeSignatureTwo,
    TimeSignatureThree,
    TimeSignatureFour,
    TimeSignatureFive,
    TimeSignatureSix,
    TimeSignatureSeven,
    TimeSignatureEight,
    TimeSignatureNine,
    TimeSignatureCommon,

    /** The noteheads of the standard values, drawn by the music font. */
    NoteheadWhole,
    NoteheadHalf,
    NoteheadBlack,

    /**
     * The percussion noteheads. A font carries these shapes as well, but its heads have a different
     * house style than the ones the score is read with, so the score draws its own.
     */
    NoteheadSquare,
    NoteheadTriangle,
    NoteheadCross,
    NoteheadDiamond,

    /** The rests, one per standard value. */
    RestWhole,
    RestHalf,
    RestQuarter,
    RestEighth,
    RestSixteenth,
    RestThirtySecond,

    /** The flags of the unbeamed values, which hang on the end of their stem. */
    FlagEighth,
    FlagSixteenth,
    FlagThirtySecond,

    /** What sits around the notes: the augmentation dot, the ghost note's parentheses, the accent. */
    AugmentationDot,
    GhostParenthesisLeft,
    GhostParenthesisRight,
    Accent,

    /** The marks a play technique draws over the head: the slap and rimshot cross, the buzz roll. */
    TechniqueCross,
    RimShotCross,
    PressRollStrokes,
}

/** What draws a symbol. */
export enum ScoreSymbolSource {
    /** A glyph of the selected music font. */
    MusicFontGlyph,

    /** A path the score draws itself. */
    OwnPath,
}

/**
 * How a glyph sits in the box it is drawn into. Both kinds state the glyph's ink, which is centred on
 * the box's centre line vertically; only the horizontal edge differs. The values name the edge, because
 * a drawing turns the anchor into the CSS class that places the ink.
 */
export enum GlyphAnchor {
    /** Centred in the box, which is how a clef, a time signature or a rest sits. */
    Centre = "centre",

    /** Starting on the box's left edge, which is how a glyph a stem ends in is hung on that stem. */
    LeftEdge = "left-edge",

    /** Ending on the box's right edge, which is how a notehead meets its stem. */
    RightEdge = "right-edge",
}

/** How an own path is inked. */
export enum OwnPathInk {
    Filled,
    Stroked,
}

/** An own path, in the units of its own ink box. */
export interface IOwnPathDefinition {
    /** Width of the path's ink box, in staff spaces. */
    width: number;

    /** Height of the path's ink box, in staff spaces. */
    height: number;

    /** SVG path data in those units, with the origin at the box's top left corner. */
    data: string;

    ink: OwnPathInk;

    /** Width of the stroke in staff spaces. Stroked paths only. */
    strokeWidth?: number;

    /** Whether a stroked path draws its ends rounded. */
    roundEnds?: boolean;
}

/** A symbol that a glyph of the music font draws. */
export interface IMusicFontGlyphSource {
    source: ScoreSymbolSource.MusicFontGlyph;

    glyph: SmuflGlyph;

    anchor: GlyphAnchor;
}

/** A symbol that the score draws itself. */
export interface IOwnPathSource {
    source: ScoreSymbolSource.OwnPath;

    path: IOwnPathDefinition;
}

/** Where a symbol is drawn from. */
export type IScoreSymbolDefinition = IMusicFontGlyphSource | IOwnPathSource;

/** The ink box of a symbol, as the CSS lengths a drawing positions it by. */
export interface ISymbolBox {
    width: string;
    height: string;
}

/**
 * The prefix a glyph's ink box is published under: `--glyph-ink-`, the edge, and the glyph's name in
 * lower case, e.g. `--glyph-ink-width-noteheadblack`. A music font publishes the box of the ink it
 * draws a glyph with, so a drawing places the ink and not the box its advance width decides.
 */
export const glyphInkVariablePrefix = "--glyph-ink-";

/** The vocabulary of notation symbols the score draws, and what draws each of them. */
export class ScoreSymbols {
    /** Every symbol the score draws. A numeric enum lists its names alongside its values, hence the filter. */
    public static readonly all: readonly ScoreSymbol[] = Object.values(ScoreSymbol).filter((value) => {
        return typeof value === "number";
    });

    /** The glyphs the score draws with the music font, so a font publishes the metrics they are read with. */
    public static readonly drawnGlyphs: readonly SmuflGlyph[];

    private static readonly definitions: Readonly<Record<ScoreSymbol, IScoreSymbolDefinition>> = {
        [ScoreSymbol.PercussionClef]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.UnpitchedPercussionClef1,
            anchor: GlyphAnchor.Centre,
        },

        [ScoreSymbol.TimeSignatureZero]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig0,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureOne]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig1,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureTwo]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig2,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureThree]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig3,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureFour]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig4,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureFive]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig5,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureSix]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig6,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureSeven]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig7,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureEight]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig8,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureNine]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSig9,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.TimeSignatureCommon]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.TimeSigCommon,
            anchor: GlyphAnchor.Centre,
        },

        [ScoreSymbol.NoteheadWhole]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.NoteheadWhole,
            anchor: GlyphAnchor.RightEdge,
        },
        [ScoreSymbol.NoteheadHalf]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.NoteheadHalf,
            anchor: GlyphAnchor.RightEdge,
        },
        [ScoreSymbol.NoteheadBlack]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.NoteheadBlack,
            anchor: GlyphAnchor.RightEdge,
        },

        // The square head is a square, not the ink box of noteheadSquareBlack: that box is wider than it
        // is tall, which no longer matches the technique marks drawn inside the head.
        [ScoreSymbol.NoteheadSquare]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1.4,
                height: 1.4,
                data: "M0 0 H1.4 V1.4 H0 Z",
                ink: OwnPathInk.Filled,
            },
        },
        [ScoreSymbol.NoteheadTriangle]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1.172,
                height: 1,
                data: "M0 1 L0.586 0 L1.172 1 Z",
                ink: OwnPathInk.Filled,
            },
        },
        // The cross head is a square cross, not the ink box of noteheadXBlack, which is wider than it is
        // tall: its arms meet in the corners of a square box, so the head reads as an X and not as a
        // squeezed one.
        [ScoreSymbol.NoteheadCross]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1.2,
                height: 1.2,
                data: "M0.1 0.1 L1.1 1.1 M1.1 0.1 L0.1 1.1",
                ink: OwnPathInk.Stroked,
                strokeWidth: 0.2,
                roundEnds: true,
            },
        },
        [ScoreSymbol.NoteheadDiamond]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 0.98,
                height: 1.128,
                data: "M0.49 0 L0.98 0.564 L0.49 1.128 L0 0.564 Z",
                ink: OwnPathInk.Filled,
            },
        },

        [ScoreSymbol.RestWhole]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.RestWhole,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.RestHalf]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.RestHalf,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.RestQuarter]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.RestQuarter,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.RestEighth]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Rest8th,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.RestSixteenth]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Rest16th,
            anchor: GlyphAnchor.Centre,
        },
        [ScoreSymbol.RestThirtySecond]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Rest32nd,
            anchor: GlyphAnchor.Centre,
        },

        [ScoreSymbol.FlagEighth]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Flag8thUp,
            anchor: GlyphAnchor.LeftEdge,
        },
        [ScoreSymbol.FlagSixteenth]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Flag16thUp,
            anchor: GlyphAnchor.LeftEdge,
        },
        [ScoreSymbol.FlagThirtySecond]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.Flag32ndUp,
            anchor: GlyphAnchor.LeftEdge,
        },

        [ScoreSymbol.AugmentationDot]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.AugmentationDot,
            anchor: GlyphAnchor.LeftEdge,
        },

        // Both parentheses end on the right edge of their box, so a drawing places the parenthesis's ink
        // where it wants it and not a box the font's own side bearings decide.
        [ScoreSymbol.GhostParenthesisLeft]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.NoteheadParenthesisLeft,
            anchor: GlyphAnchor.RightEdge,
        },
        [ScoreSymbol.GhostParenthesisRight]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.NoteheadParenthesisRight,
            anchor: GlyphAnchor.RightEdge,
        },

        [ScoreSymbol.Accent]: {
            source: ScoreSymbolSource.MusicFontGlyph,
            glyph: SmuflGlyph.ArticAccentAbove,
            anchor: GlyphAnchor.LeftEdge,
        },

        // The cross a slap or a rimshot draws over the head. Both are the same 14 x 14 design, scaled into
        // the space a head leaves for the technique that plays it.
        [ScoreSymbol.TechniqueCross]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1,
                height: 1,
                data: "M0.143 0.143 L0.857 0.857 M0.857 0.143 L0.143 0.857",
                ink: OwnPathInk.Stroked,
                strokeWidth: 0.214,
                roundEnds: true,
            },
        },
        [ScoreSymbol.RimShotCross]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 0.8,
                height: 0.8,
                data: "M0.114 0.114 L0.686 0.686 M0.686 0.114 L0.114 0.686",
                ink: OwnPathInk.Stroked,
                strokeWidth: 0.143,
                roundEnds: true,
            },
        },

        // The three slashes a buzz roll draws along the stem.
        [ScoreSymbol.PressRollStrokes]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1.4,
                height: 3.5,
                data: "M1.1 0.6 L0.3 1.1 M1.1 1.1 L0.3 1.6 M1.1 1.6 L0.3 2.1",
                ink: OwnPathInk.Stroked,
                strokeWidth: 0.25,
                roundEnds: true,
            },
        },
    };

    /** The symbol a time signature digit is drawn with. */
    private static readonly timeSignatureDigits: Readonly<Record<string, ScoreSymbol>> = {
        "0": ScoreSymbol.TimeSignatureZero,
        "1": ScoreSymbol.TimeSignatureOne,
        "2": ScoreSymbol.TimeSignatureTwo,
        "3": ScoreSymbol.TimeSignatureThree,
        "4": ScoreSymbol.TimeSignatureFour,
        "5": ScoreSymbol.TimeSignatureFive,
        "6": ScoreSymbol.TimeSignatureSix,
        "7": ScoreSymbol.TimeSignatureSeven,
        "8": ScoreSymbol.TimeSignatureEight,
        "9": ScoreSymbol.TimeSignatureNine,
    };

    /**
     * Looks up what draws a symbol.
     *
     * @param symbol The symbol to look up.
     *
     * @returns The symbol's source.
     */
    public static definition(symbol: ScoreSymbol): IScoreSymbolDefinition {
        return ScoreSymbols.definitions[symbol];
    }

    /**
     * @param symbol The symbol whose ink box is wanted.
     *
     * @returns The box the symbol's ink occupies, as the CSS lengths a drawing sizes the box around the ink
     * with: the box the font states for a glyph, and the box the path itself states for a path of the score.
     */
    public static inkBox(symbol: ScoreSymbol): ISymbolBox {
        const definition = ScoreSymbols.definition(symbol);
        if (definition.source === ScoreSymbolSource.OwnPath) {
            const { width, height } = definition.path;

            return {
                width: `calc(var(--staff-space) * ${width})`,
                height: `calc(var(--staff-space) * ${height})`,
            };
        }

        const glyphName = definition.glyph.toLowerCase();

        return {
            width: `var(${glyphInkVariablePrefix}width-${glyphName})`,
            height: `var(${glyphInkVariablePrefix}height-${glyphName})`,
        };
    }

    /**
     * @param digit The digit of a time signature, as a string.
     *
     * @returns The symbol the digit is drawn with, or undefined for anything that is not a single digit.
     */
    public static timeSignatureDigit(digit: string): ScoreSymbol | undefined {
        return ScoreSymbols.timeSignatureDigits[digit];
    }

    /**
     * Names the notehead a note is drawn with. The standard values are drawn by the music font, every
     * other display type by a path of the score, which has one shape per type for all values.
     *
     * @param displayType The notehead shape of the note's style.
     * @param value The note's rhythmic value.
     *
     * @returns The symbol the note's head is drawn with.
     */
    public static notehead(displayType: NoteDisplayType, value: NoteLength): ScoreSymbol {
        switch (displayType) {
            case NoteDisplayType.Square: {
                return ScoreSymbol.NoteheadSquare;
            }

            case NoteDisplayType.Triangle: {
                return ScoreSymbol.NoteheadTriangle;
            }

            case NoteDisplayType.Cross: {
                return ScoreSymbol.NoteheadCross;
            }

            case NoteDisplayType.Diamond: {
                return ScoreSymbol.NoteheadDiamond;
            }

            default: {
                switch (value) {
                    case NoteLength.Whole: {
                        return ScoreSymbol.NoteheadWhole;
                    }

                    case NoteLength.Half: {
                        return ScoreSymbol.NoteheadHalf;
                    }

                    default: {
                        return ScoreSymbol.NoteheadBlack;
                    }
                }
            }
        }
    }

    /**
     * Names the rest of a note value.
     *
     * @param value The rhythmic value of the rest.
     *
     * @returns The symbol the rest is drawn with.
     */
    public static rest(value: NoteLength): ScoreSymbol {
        switch (value) {
            case NoteLength.Whole: {
                return ScoreSymbol.RestWhole;
            }

            case NoteLength.Half: {
                return ScoreSymbol.RestHalf;
            }

            case NoteLength.Quarter: {
                return ScoreSymbol.RestQuarter;
            }

            case NoteLength.Eighth: {
                return ScoreSymbol.RestEighth;
            }

            case NoteLength.Sixteenth: {
                return ScoreSymbol.RestSixteenth;
            }

            default: {
                return ScoreSymbol.RestThirtySecond;
            }
        }
    }

    /**
     * Names the flag of a note value.
     *
     * @param value The rhythmic value of the note.
     *
     * @returns The symbol the flag is drawn with, or undefined for a value that carries no flag.
     */
    public static flag(value: NoteLength): ScoreSymbol | undefined {
        switch (value) {
            case NoteLength.Eighth: {
                return ScoreSymbol.FlagEighth;
            }

            case NoteLength.Sixteenth: {
                return ScoreSymbol.FlagSixteenth;
            }

            case NoteLength.ThirtySecond: {
                return ScoreSymbol.FlagThirtySecond;
            }

            default: {
                return undefined;
            }
        }
    }

    static {
        // `drawnGlyphs` derives from the definitions, which `member-ordering` places after the public
        // fields, so it cannot be initialized alongside them.
        Object.assign(ScoreSymbols, {
            drawnGlyphs: [...new Set(ScoreSymbols.all.flatMap((symbol) => {
                const definition = ScoreSymbols.definitions[symbol];

                return definition.source === ScoreSymbolSource.MusicFontGlyph ? [definition.glyph] : [];
            }))],
        });
    }
}
