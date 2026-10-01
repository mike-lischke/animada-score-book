/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Loads the SMuFL fonts the score is drawn with and publishes the active font's CSS family list.
 *
 * The catalogue in `public/fonts/smufl/index.json` is the only font list, so this loader registers the
 * fonts it needs through the FontFace API instead of hard-coding `@font-face` rules. The family list is
 * published as the CSS variable `--music-font-family`, which keeps the drawing components free of any
 * loader plumbing.
 *
 * Browser only: without the FontFace API the loader reports itself as unable to draw.
 */

import { staffSpacePx } from "../MeasureLayout.js";
import {
    BarlinePart, glyphInkSpacesVariablePrefix, glyphInkVariablePrefix, ScoreSymbols, ScoreSymbolSource,
} from "../ScoreSymbols.js";
import {
    SmuflFontMetrics, type ISmuflEngravingDefaults, type ISmuflFontMetrics,
    type ISmuflGlyphMetrics
} from "./SmuflFontMetrics.js";
import { SmuflGlyph, SmuflGlyphs } from "./SmuflGlyphs.js";
import { SmuflFonts, type ISmuflFontIndex, type ISmuflFontIndexEntry } from "./SmuflFonts.js";

/** The CSS variable the drawing components read their font from. */
export const musicFontFamilyVariable = "--music-font-family";

/** The catalogue's URL. Files in `public/` are served from the site root. */
const defaultIndexUrl = "/fonts/smufl/index.json";

/** The folder a font file is served from. */
const fontFolderUrl = "/fonts/smufl/";

/**
 * The band a font draws its own barline glyphs for: the four staff spaces between the outer lines of a five-line
 * staff, which is the band a barline spans.
 */
const barlineGlyphSpaces = 4;

/**
 * The CSS variables the score's geometry reads, and the engraving default each is taken from. The
 * stylesheets keep their own value as a fallback, for the time before the metrics have arrived.
 */
const engravingVariables: ReadonlyArray<readonly [keyof ISmuflEngravingDefaults, string]> = [
    ["staffLineThickness", "--staff-line-thickness"],
    ["stemThickness", "--stem-thickness"],
    ["beamThickness", "--beam-thickness"],
    ["beamSpacing", "--beam-spacing"],
    ["legerLineThickness", "--leger-line-thickness"],
    ["legerLineExtension", "--leger-line-extension"],
    ["thinBarlineThickness", "--barline-thin-thickness"],
    ["thickBarlineThickness", "--barline-thick-thickness"],
    ["barlineSeparation", "--barline-separation"],
    ["repeatBarlineDotSeparation", "--repeat-dot-separation"],
    ["bracketThickness", "--bracket-thickness"],
    ["tupletBracketThickness", "--tuplet-bracket-thickness"],
];

/**
 * The prefix a glyph's stem anchor is published under: `--stem-anchor-` and the glyph's name in
 * lower case, with `x-` or `y-` in between, e.g. `--stem-anchor-y-noteheadblack`. Both values are
 * in px and relative to the note's anchor point: `x` is how far right of it the stem sits, `y` how
 * far above the baseline the stem ends.
 */
export const stemAnchorVariablePrefix = "--stem-anchor-";

/**
 * The prefix a glyph's stem end is published under: `--stem-end-` and the glyph's name in lower case,
 * e.g. `--stem-end-y-flag8thup`. A flag hangs on the stem, and the font states where the stem's end
 * sits in the flag's ink: `x` is how far right of the glyph's origin it sits, `y` how far above it.
 */
export const stemEndVariablePrefix = "--stem-end-";

/** A font the user can pick, with the family list that draws it. */
export interface ISmuflFontChoice extends ISmuflFontIndexEntry {
    /** The CSS family list that draws this font, with the catalogue's fallback appended. */
    fontFamily: string;
}

/** How to set the loader up when the app starts. */
export interface ISmuflFontLoaderOptions {
    /** The font to start with, as last chosen. Omitted means the catalogue's default. */
    fontId?: string;

    /** The URL of the font catalogue. */
    indexUrl?: string;
}

/** Loads the fonts of one catalogue, with the metrics the score is drawn from. */
export class SmuflFontLoader {
    private index?: ISmuflFontIndex;
    private active?: ISmuflFontIndexEntry;
    private readonly loaded = new Set<string>();
    private readonly unusable = new Set<string>();

    /** The metrics of every font that has been read, by font id. */
    private readonly metricsById = new Map<string, ISmuflFontMetrics>();

    /** Set while the fonts nothing draws with yet are loading, so they are loaded only once. */
    private preloading?: Promise<void>;

    /** @returns The CSS font family list to draw with, or an empty string while no font is ready. */
    public get familyStack(): string {
        const { index, active } = this;
        if (index === undefined || active === undefined) {
            return "";
        }

        return SmuflFonts.familyStack(index, active);
    }

    /** @returns The id of the font the score is drawn with, or undefined while none is ready. */
    public get activeId(): string | undefined {
        return this.active?.id;
    }

    /**
     * @returns The engraving defaults the score's geometry is drawn from, in px, or undefined while
     * no font is ready.
     */
    public get engravingDefaults(): ISmuflEngravingDefaults | undefined {
        return this.metricsFor(this.activeId)?.engravingDefaults
            ?? this.metricsFor(this.defaultId)?.engravingDefaults;
    }

    /**
     * @param glyph The glyph to measure.
     *
     * @returns What the font states about the glyph, in staff spaces. A glyph the selected font does
     * not describe is measured with the default font's metrics, the same font that draws it.
     */
    public glyphMetrics(glyph: SmuflGlyph): ISmuflGlyphMetrics | undefined {
        return this.metricsFor(this.activeId)?.glyphs[glyph] ?? this.metricsFor(this.defaultId)?.glyphs[glyph];
    }

    /**
     * @returns The fonts the user can pick from. A font that failed to load is not offered, so
     * choosing it cannot fail.
     */
    public get choices(): ISmuflFontChoice[] {
        const { index } = this;
        if (index === undefined) {
            return [];
        }

        const usable = index.fonts.filter((entry) => {
            return !this.unusable.has(entry.id);
        });

        return usable.map((entry) => {
            return { ...entry, fontFamily: SmuflFonts.familyStack(index, entry) };
        });
    }

    /**
     * Reads the catalogue and loads the font the score starts with.
     *
     * Never throws: a font that cannot be loaded leaves the score without a music font instead of
     * keeping the app from starting.
     *
     * @param options The font to start with and the catalogue to read.
     */
    public async initialize(options: ISmuflFontLoaderOptions = {}): Promise<void> {
        const { fontId, indexUrl = defaultIndexUrl } = options;

        try {
            const response = await fetch(indexUrl);
            const raw: unknown = await response.json();
            const result = SmuflFonts.readIndex(raw);
            if (result.index === undefined) {
                console.warn(`SmuflFontLoader: ${result.errors.join("; ")}`);

                return;
            }

            this.index = result.index;

            // A font that is gone or broken falls back to the catalogue's default, so a stale
            // setting never leaves the score without a font.
            if (!await this.select(fontId)) {
                await this.select();
            }

            // The remaining fonts are only needed to show them, so they load next to the app.
            void this.preload();
        } catch (error) {
            console.warn(`SmuflFontLoader: cannot read ${indexUrl}`, error);
        }
    }

    /**
     * Loads a font and makes it the one the score is drawn with. The catalogue's default font is loaded
     * as well, because it is the fallback for every glyph the selected font does not cover.
     *
     * @param id The id of the font to select, or undefined for the catalogue's default.
     *
     * @returns Whether the font was loaded and is now the active one.
     */
    public async select(id?: string): Promise<boolean> {
        const { index } = this;
        if (index === undefined) {
            return false;
        }

        const entry = id === undefined
            ? SmuflFonts.defaultEntry(index)
            : index.fonts.find((candidate) => {
                return candidate.id === id;
            });

        if (entry === undefined) {
            return false;
        }

        const fallback = SmuflFonts.defaultEntry(index);
        if (fallback !== undefined) {
            await Promise.all([this.register(fallback), this.loadMetrics(fallback)]);
        }

        if (!await this.register(entry)) {
            return false;
        }

        await this.loadMetrics(entry);
        this.active = entry;
        this.publish();

        return true;
    }

    /**
     * Loads every font of the catalogue that nothing draws with yet, so the settings can show a font
     * before it is chosen. Runs at most once and never rejects.
     *
     * @returns A promise that resolves when the fonts are loaded or failed.
     */
    public preload(): Promise<void> {
        const { index } = this;
        if (index === undefined) {
            return Promise.resolve();
        }

        this.preloading ??= Promise.all(index.fonts.map((entry) => {
            return this.register(entry);
        })).then(() => {
            // The callers only care about the fonts being available.
        });

        return this.preloading;
    }

    /**
     * @param value A thickness or length in staff spaces.
     *
     * @returns The value in px, on the pixel grid: a fractional stroke is drawn with anti-aliasing, which makes
     * the thin lines of a score look fuzzy. A stroke never rounds down to nothing.
     */
    private static lengthToPixels(value: number): string {
        return `${Math.max(1, Math.round(value * staffSpacePx))}px`;
    }

    /**
     * @param value An offset in staff spaces, which may be zero or negative.
     *
     * @returns The value in px, rounded to whole pixels for the same reason as `lengthToPixels`.
     */
    private static offsetToPixels(value: number): string {
        return `${Math.round(value * staffSpacePx)}px`;
    }

    /**
     * @param metrics What the font states about a glyph.
     *
     * @returns The width of the glyph's ink in px, or zero when the font states no box.
     */
    private static inkWidth(metrics?: ISmuflGlyphMetrics): number {
        const { bBoxNE, bBoxSW } = metrics ?? {};
        if (bBoxNE === undefined || bBoxSW === undefined) {
            return 0;
        }

        return (bBoxNE[0] - bBoxSW[0]) * staffSpacePx;
    }

    private async register(entry: ISmuflFontIndexEntry): Promise<boolean> {
        if (this.loaded.has(entry.id)) {
            return true;
        }

        if (this.unusable.has(entry.id)) {
            return false;
        }

        const fontFace = (globalThis as { FontFace?: typeof FontFace; }).FontFace;
        if (fontFace === undefined) {
            this.unusable.add(entry.id);

            return false;
        }

        try {
            const face = new fontFace(entry.name, `url("${fontFolderUrl}${entry.file}")`, { display: "block" });
            await face.load();
            document.fonts.add(face);
            this.loaded.add(entry.id);

            return true;
        } catch (error) {
            console.warn(`SmuflFontLoader: cannot load the font "${entry.id}"`, error);
            this.unusable.add(entry.id);

            return false;
        }
    }

    private publish(): void {
        const stack = this.familyStack;
        if (stack !== "") {
            document.documentElement.style.setProperty(musicFontFamilyVariable, stack);
        }

        this.publishEngravingDefaults();
    }

    /**
     * @returns The id of the font the score uses until the user picks another one.
     */
    private get defaultId(): string | undefined {
        const { index } = this;

        return index === undefined ? undefined : SmuflFonts.defaultEntry(index)?.id;
    }

    /**
     * @param id The font to look up.
     *
     * @returns The font's metrics, when they have been read.
     */
    private metricsFor(id?: string): ISmuflFontMetrics | undefined {
        return id === undefined ? undefined : this.metricsById.get(id);
    }

    /**
     * Reads a font's engraved measurements.
     *
     * Never throws: a font whose metrics cannot be read is drawn with the default font's measurements,
     * and the stylesheets keep their own values for as long as nothing was read.
     *
     * @param entry The font to read the metrics of.
     */
    private async loadMetrics(entry: ISmuflFontIndexEntry): Promise<void> {
        if (this.metricsById.has(entry.id)) {
            return;
        }

        try {
            const response = await fetch(`${fontFolderUrl}${entry.metrics}`);
            const raw: unknown = await response.json();
            const result = SmuflFontMetrics.read(raw);
            if (result.metrics === undefined) {
                console.warn(`SmuflFontLoader: ${entry.id}: ${result.errors.join("; ")}`);

                return;
            }

            this.metricsById.set(entry.id, result.metrics);
        } catch (error) {
            console.warn(`SmuflFontLoader: cannot read the metrics of "${entry.id}"`, error);
        }
    }

    /** Publishes the engraving defaults in px, which is the unit the stylesheets draw with. */
    private publishEngravingDefaults(): void {
        const defaults = this.engravingDefaults;
        if (defaults === undefined) {
            return;
        }

        const style = document.documentElement.style;
        for (const [key, variable] of engravingVariables) {
            const value = defaults[key];
            if (value !== undefined) {
                style.setProperty(variable, SmuflFontLoader.lengthToPixels(value));
            }
        }

        // A stem leaves a head where the font says: it sits a stated distance right of the head's
        // centre and ends a stated distance above its baseline, which differ per head shape.
        for (const glyph of SmuflGlyphs.stemmedNoteheads) {
            const metrics = this.glyphMetrics(glyph);
            const anchor = metrics?.stemUpSE;
            const bBoxNE = metrics?.bBoxNE;
            const bBoxSW = metrics?.bBoxSW;
            if (anchor === undefined || bBoxNE === undefined || bBoxSW === undefined) {
                continue;
            }

            const glyphName = glyph.toLowerCase();
            const inkCentre = (bBoxNE[0] + bBoxSW[0]) / 2;
            style.setProperty(`${stemAnchorVariablePrefix}x-${glyphName}`,
                SmuflFontLoader.offsetToPixels(anchor[0] - inkCentre));
            style.setProperty(`${stemAnchorVariablePrefix}y-${glyphName}`,
                SmuflFontLoader.offsetToPixels(anchor[1]));
        }

        this.publishGlyphBoxes(style);
        this.publishBarlineGeometry(style);
    }

    /**
     * Publishes the drawn geometry of every barline: how wide its ink is and how far its strokes stand apart.
     *
     * A barline is assembled from the font's engraved measurements, but the strokes of a repeat barline stand
     * closer together than those measurements state, so the glyph a font draws the same barline with is what the
     * drawn parts are measured against: its ink, less the dots, the stroke thicknesses and the distance of the
     * dots from the strokes they face, is what is left for the separation between the strokes. A glyph that the
     * font draws for another band than a barline spans says nothing about a barline, which is where the font's
     * stated separation of a thin and a thick stroke stands in.
     *
     * @param style The style of the document root.
     */
    private publishBarlineGeometry(style: CSSStyleDeclaration): void {
        const defaults = this.engravingDefaults;
        if (defaults === undefined) {
            return;
        }

        const thin = Math.round(defaults.thinBarlineThickness * staffSpacePx);
        const thick = Math.round(defaults.thickBarlineThickness * staffSpacePx);
        const dotSeparation = Math.round(defaults.repeatBarlineDotSeparation * staffSpacePx);
        const dots = Math.round(SmuflFontLoader.inkWidth(this.glyphMetrics(SmuflGlyph.RepeatDots)));
        const stated = Math.round(
            (defaults.thinThickBarlineSeparation ?? defaults.barlineSeparation) * staffSpacePx);

        for (const symbol of ScoreSymbols.all) {
            const definition = ScoreSymbols.definition(symbol);
            if (definition.source !== ScoreSymbolSource.Barline) {
                continue;
            }

            const strokes = definition.parts.map((part) => {
                switch (part) {
                    case BarlinePart.ThickStroke: {
                        return thick;
                    }

                    case BarlinePart.RepeatDots: {
                        return dots;
                    }

                    default: {
                        return thin;
                    }
                }
            });

            // A repeat reaches into the bar with its dots, so the gaps between the parts are the dots' distance
            // from the stroke they face, and the separation between the strokes.
            let strokeGaps = 0;
            let dotGaps = 0;
            for (let index = 1; index < definition.parts.length; index++) {
                const facesDots = definition.parts[index - 1] === BarlinePart.RepeatDots
                    || definition.parts[index] === BarlinePart.RepeatDots;
                if (facesDots) {
                    dotGaps++;
                } else {
                    strokeGaps++;
                }
            }

            const partsWidth = strokes.reduce((sum, width) => {
                return sum + width;
            }, 0) + (dotGaps * dotSeparation);

            const reference = this.barlineInkWidth(definition.fontGlyph);
            const separation = reference === undefined || strokeGaps === 0
                ? stated
                : Math.max(0, Math.round((reference - partsWidth) / strokeGaps));
            const width = partsWidth + (strokeGaps * separation);

            style.setProperty(`--barline-${definition.key}-width`, `${width}px`);
            style.setProperty(`--barline-${definition.key}-separation`, `${separation}px`);
        }
    }

    /**
     * @param glyph The glyph the symbol names, if it names one.
     *
     * @returns The width of the ink the font draws the glyph in, in px, or undefined when the glyph is not drawn
     * for the band a barline spans.
     */
    private barlineInkWidth(glyph?: SmuflGlyph): number | undefined {
        if (glyph === undefined) {
            return undefined;
        }

        const metrics = this.glyphMetrics(glyph);
        const { bBoxNE, bBoxSW } = metrics ?? {};
        if (bBoxNE === undefined || bBoxSW === undefined) {
            return undefined;
        }

        if (Math.abs((bBoxNE[1] - bBoxSW[1]) - barlineGlyphSpaces) > 0.5) {
            return undefined;
        }

        return SmuflFontLoader.inkWidth(metrics);
    }

    /**
     * Publishes what the font states about the glyphs the score draws: the ink box of each of them, and
     * where the stem ends in a glyph that carries one.
     *
     * @param style The style of the document root.
     */
    private publishGlyphBoxes(style: CSSStyleDeclaration): void {
        for (const glyph of ScoreSymbols.drawnGlyphs) {
            const metrics = this.glyphMetrics(glyph);
            const glyphName = glyph.toLowerCase();
            const { bBoxNE, bBoxSW, stemUpNW } = metrics ?? {};

            if (bBoxNE !== undefined && bBoxSW !== undefined) {
                style.setProperty(`${glyphInkVariablePrefix}width-${glyphName}`,
                    SmuflFontLoader.lengthToPixels(bBoxNE[0] - bBoxSW[0]));
                style.setProperty(`${glyphInkVariablePrefix}height-${glyphName}`,
                    SmuflFontLoader.lengthToPixels(bBoxNE[1] - bBoxSW[1]));

                // The same box in the font's own unit, which is what a drawing scales against when the ink has to
                // cover a staff band or fill an icon; the px box above is rounded to the pixel grid, which such a
                // drawing cannot afford.
                style.setProperty(`${glyphInkSpacesVariablePrefix}top-${glyphName}`, `${bBoxNE[1]}`);
                style.setProperty(`${glyphInkSpacesVariablePrefix}bottom-${glyphName}`, `${bBoxSW[1]}`);
                style.setProperty(`${glyphInkSpacesVariablePrefix}width-${glyphName}`, `${bBoxNE[0] - bBoxSW[0]}`);
            }

            if (stemUpNW !== undefined) {
                style.setProperty(`${stemEndVariablePrefix}x-${glyphName}`,
                    SmuflFontLoader.offsetToPixels(stemUpNW[0]));
                style.setProperty(`${stemEndVariablePrefix}y-${glyphName}`,
                    SmuflFontLoader.offsetToPixels(-stemUpNW[1]));
            }
        }
    }
}
