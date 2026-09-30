/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The SMuFL glyphs the score draws, grouped by the symbol family they serve.
 *
 * SMuFL fixes a glyph's name and its codepoint once, so both live here: a font is checked against the
 * codepoint in its character map, while the metrics and the drawing address a glyph by name. Which of
 * these glyphs the score draws, and what draws them, is the symbol catalogue's business.
 * The codepoints are taken from the SMuFL specification's `glyphnames.json`.
 */

/** A group of related symbols, which is the granularity at which a font is usable or not. */
export enum SmuflGlyphFamily {
    StandardNoteheads,
    PercussionNoteheads,
    Rests,
    Flags,
    AugmentationDot,
    PercussionClef,
    TimeSignature,
    Tremolo,
    GhostParentheses,
    Accent,
    MeasureRepeat,
}

/** SMuFL glyph names, spelled exactly as SMuFL defines them. */
export enum SmuflGlyph {
    NoteheadWhole = "noteheadWhole",
    NoteheadHalf = "noteheadHalf",
    NoteheadBlack = "noteheadBlack",

    NoteheadXWhole = "noteheadXWhole",
    NoteheadXHalf = "noteheadXHalf",
    NoteheadXBlack = "noteheadXBlack",
    NoteheadDiamondWhole = "noteheadDiamondWhole",
    NoteheadDiamondHalf = "noteheadDiamondHalf",
    NoteheadDiamondBlack = "noteheadDiamondBlack",
    NoteheadDiamondWhite = "noteheadDiamondWhite",
    NoteheadSquareWhite = "noteheadSquareWhite",
    NoteheadSquareBlack = "noteheadSquareBlack",
    NoteheadTriangleUpWhole = "noteheadTriangleUpWhole",
    NoteheadTriangleUpHalf = "noteheadTriangleUpHalf",
    NoteheadTriangleUpWhite = "noteheadTriangleUpWhite",
    NoteheadTriangleUpBlack = "noteheadTriangleUpBlack",

    RestWhole = "restWhole",
    RestHalf = "restHalf",
    RestQuarter = "restQuarter",
    Rest8th = "rest8th",
    Rest16th = "rest16th",
    Rest32nd = "rest32nd",

    Flag8thUp = "flag8thUp",
    Flag16thUp = "flag16thUp",
    Flag32ndUp = "flag32ndUp",

    AugmentationDot = "augmentationDot",

    UnpitchedPercussionClef1 = "unpitchedPercussionClef1",

    TimeSig0 = "timeSig0",
    TimeSig1 = "timeSig1",
    TimeSig2 = "timeSig2",
    TimeSig3 = "timeSig3",
    TimeSig4 = "timeSig4",
    TimeSig5 = "timeSig5",
    TimeSig6 = "timeSig6",
    TimeSig7 = "timeSig7",
    TimeSig8 = "timeSig8",
    TimeSig9 = "timeSig9",
    TimeSigCommon = "timeSigCommon",
    TimeSigCutCommon = "timeSigCutCommon",

    Tremolo1 = "tremolo1",
    Tremolo2 = "tremolo2",
    Tremolo3 = "tremolo3",

    NoteheadParenthesisLeft = "noteheadParenthesisLeft",
    NoteheadParenthesisRight = "noteheadParenthesisRight",

    ArticAccentAbove = "articAccentAbove",

    Repeat1Bar = "repeat1Bar",
    Repeat2Bars = "repeat2Bars",
}

/** What a font has to provide for a single glyph. */
export interface ISmuflGlyphDefinition {
    family: SmuflGlyphFamily;

    /** The glyph's codepoint in the SMuFL private use area. */
    codepoint: number;
}

/** The vocabulary of SMuFL symbols the score draws, and what a font has to provide for them. */
export class SmuflGlyphs {
    /** Every glyph the score draws. */
    public static readonly all: readonly SmuflGlyph[] = Object.values(SmuflGlyph) as SmuflGlyph[];

    /** The symbol families the score draws from. */
    public static readonly families: readonly SmuflGlyphFamily[];

    /**
     * The glyphs that carry a stem. A font has to give them a stem anchor, otherwise the stem cannot
     * be attached to the head. Whole notes have no stem and are therefore absent.
     */
    public static readonly stemmedNoteheads: readonly SmuflGlyph[] = [
        SmuflGlyph.NoteheadHalf,
        SmuflGlyph.NoteheadBlack,
        SmuflGlyph.NoteheadXHalf,
        SmuflGlyph.NoteheadXBlack,
        SmuflGlyph.NoteheadDiamondHalf,
        SmuflGlyph.NoteheadDiamondBlack,
        SmuflGlyph.NoteheadDiamondWhite,
        SmuflGlyph.NoteheadSquareWhite,
        SmuflGlyph.NoteheadSquareBlack,
        SmuflGlyph.NoteheadTriangleUpHalf,
        SmuflGlyph.NoteheadTriangleUpWhite,
        SmuflGlyph.NoteheadTriangleUpBlack,
    ];

    /**
     * The engraving defaults the score's geometry reads. A font has to define them; the values differ
     * per font, which is the point of reading them from the font instead of hard-coding pixels.
     */
    public static readonly requiredEngravingDefaults: readonly string[] = [
        "staffLineThickness",
        "stemThickness",
        "beamThickness",
        "beamSpacing",
        "legerLineThickness",
        "legerLineExtension",
        "thinBarlineThickness",
        "thickBarlineThickness",
        "barlineSeparation",
        "bracketThickness",
        "tupletBracketThickness",
    ];

    /** Every glyph the score draws, with its family and its spec-fixed codepoint. */
    private static readonly definitions: Readonly<Record<SmuflGlyph, ISmuflGlyphDefinition>> = {
        [SmuflGlyph.NoteheadWhole]: { family: SmuflGlyphFamily.StandardNoteheads, codepoint: 0xE0A2 },
        [SmuflGlyph.NoteheadHalf]: { family: SmuflGlyphFamily.StandardNoteheads, codepoint: 0xE0A3 },
        [SmuflGlyph.NoteheadBlack]: { family: SmuflGlyphFamily.StandardNoteheads, codepoint: 0xE0A4 },

        [SmuflGlyph.NoteheadXWhole]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0A7 },
        [SmuflGlyph.NoteheadXHalf]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0A8 },
        [SmuflGlyph.NoteheadXBlack]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0A9 },
        [SmuflGlyph.NoteheadDiamondWhole]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0D8 },
        [SmuflGlyph.NoteheadDiamondHalf]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0D9 },
        [SmuflGlyph.NoteheadDiamondBlack]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0DB },
        [SmuflGlyph.NoteheadDiamondWhite]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0DD },
        [SmuflGlyph.NoteheadSquareWhite]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0B8 },
        [SmuflGlyph.NoteheadSquareBlack]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0B9 },
        [SmuflGlyph.NoteheadTriangleUpWhole]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0BB },
        [SmuflGlyph.NoteheadTriangleUpHalf]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0BC },
        [SmuflGlyph.NoteheadTriangleUpWhite]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0BD },
        [SmuflGlyph.NoteheadTriangleUpBlack]: { family: SmuflGlyphFamily.PercussionNoteheads, codepoint: 0xE0BE },

        [SmuflGlyph.RestWhole]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E3 },
        [SmuflGlyph.RestHalf]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E4 },
        [SmuflGlyph.RestQuarter]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E5 },
        [SmuflGlyph.Rest8th]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E6 },
        [SmuflGlyph.Rest16th]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E7 },
        [SmuflGlyph.Rest32nd]: { family: SmuflGlyphFamily.Rests, codepoint: 0xE4E8 },

        [SmuflGlyph.Flag8thUp]: { family: SmuflGlyphFamily.Flags, codepoint: 0xE240 },
        [SmuflGlyph.Flag16thUp]: { family: SmuflGlyphFamily.Flags, codepoint: 0xE242 },
        [SmuflGlyph.Flag32ndUp]: { family: SmuflGlyphFamily.Flags, codepoint: 0xE244 },

        [SmuflGlyph.AugmentationDot]: { family: SmuflGlyphFamily.AugmentationDot, codepoint: 0xE1E7 },

        [SmuflGlyph.UnpitchedPercussionClef1]: { family: SmuflGlyphFamily.PercussionClef, codepoint: 0xE069 },

        [SmuflGlyph.TimeSig0]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE080 },
        [SmuflGlyph.TimeSig1]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE081 },
        [SmuflGlyph.TimeSig2]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE082 },
        [SmuflGlyph.TimeSig3]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE083 },
        [SmuflGlyph.TimeSig4]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE084 },
        [SmuflGlyph.TimeSig5]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE085 },
        [SmuflGlyph.TimeSig6]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE086 },
        [SmuflGlyph.TimeSig7]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE087 },
        [SmuflGlyph.TimeSig8]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE088 },
        [SmuflGlyph.TimeSig9]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE089 },
        [SmuflGlyph.TimeSigCommon]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE08A },
        [SmuflGlyph.TimeSigCutCommon]: { family: SmuflGlyphFamily.TimeSignature, codepoint: 0xE08B },

        [SmuflGlyph.Tremolo1]: { family: SmuflGlyphFamily.Tremolo, codepoint: 0xE220 },
        [SmuflGlyph.Tremolo2]: { family: SmuflGlyphFamily.Tremolo, codepoint: 0xE221 },
        [SmuflGlyph.Tremolo3]: { family: SmuflGlyphFamily.Tremolo, codepoint: 0xE222 },

        [SmuflGlyph.NoteheadParenthesisLeft]: { family: SmuflGlyphFamily.GhostParentheses, codepoint: 0xE0F5 },
        [SmuflGlyph.NoteheadParenthesisRight]: { family: SmuflGlyphFamily.GhostParentheses, codepoint: 0xE0F6 },

        [SmuflGlyph.ArticAccentAbove]: { family: SmuflGlyphFamily.Accent, codepoint: 0xE4A0 },

        [SmuflGlyph.Repeat1Bar]: { family: SmuflGlyphFamily.MeasureRepeat, codepoint: 0xE500 },
        [SmuflGlyph.Repeat2Bars]: { family: SmuflGlyphFamily.MeasureRepeat, codepoint: 0xE501 },
    };

    /**
     * Looks up what a font has to provide for a glyph.
     *
     * @param glyph The glyph to look up.
     *
     * @returns The glyph's family and codepoint.
     */
    public static definition(glyph: SmuflGlyph): ISmuflGlyphDefinition {
        return SmuflGlyphs.definitions[glyph];
    }

    /**
     * Lists the glyphs of one family.
     *
     * @param family The family to list.
     *
     * @returns The glyphs that belong to the family.
     */
    public static ofFamily(family: SmuflGlyphFamily): SmuflGlyph[] {
        return SmuflGlyphs.all.filter((glyph) => {
            return SmuflGlyphs.definitions[glyph].family === family;
        });
    }

    static {
        // `families` derives from the glyph definitions, which `member-ordering` places after the public
        // fields, so it cannot be initialized alongside them. `Object.assign` leaves the property
        // read-only; a direct assignment here would be a TS2540 error.
        Object.assign(SmuflGlyphs, {
            families: [...new Set(SmuflGlyphs.all.map((glyph) => {
                return SmuflGlyphs.definitions[glyph].family;
            }))],
        });
    }
}
