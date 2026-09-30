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
 * the box's centre line vertically; only the horizontal edge differs.
 */
export enum GlyphAnchor {
    /** Centred in the box, which is how a clef or a time signature sits. */
    Centre,

    /** Ending on the box's right edge, which is how a notehead meets its stem. */
    RightEdge,
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

/** The vocabulary of notation symbols the score draws, and what draws each of them. */
export class ScoreSymbols {
    /** Every symbol the score draws. A numeric enum lists its names alongside its values, hence the filter. */
    public static readonly all: readonly ScoreSymbol[] = Object.values(ScoreSymbol).filter((value) => {
        return typeof value === "number";
    });

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
        [ScoreSymbol.NoteheadCross]: {
            source: ScoreSymbolSource.OwnPath,
            path: {
                width: 1.2,
                height: 1,
                data: "M0.1 0.1 L1.1 0.9 M1.1 0.1 L0.1 0.9",
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
}
