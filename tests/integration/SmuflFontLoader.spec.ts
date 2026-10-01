/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmuflFontMetrics } from "../../src/core/smufl/SmuflFontMetrics.js";
import { SmuflGlyph } from "../../src/core/smufl/SmuflGlyphs.js";
import { musicFontFamilyVariable, SmuflFontLoader } from "../../src/core/smufl/SmuflFontLoader.js";

/** A catalogue with a default font and two fonts to pick from. */
const catalogue = {
    version: 1,
    fonts: [
        {
            id: "bravura",
            name: "Bravura",
            file: "Bravura.woff2",
            format: "woff2",
            metadata: "Bravura-metadata.json",
            metrics: "Bravura-metrics.json",
            version: "1.482",
            copyright: "Copyright (c) Steinberg.",
            license: { spdx: "OFL-1.1", file: "Bravura-OFL.txt" },
            source: "https://example.com/bravura",
            isDefault: true,
        },
        {
            id: "leipzig",
            name: "Leipzig",
            file: "Leipzig.woff2",
            format: "woff2",
            metadata: "Leipzig-metadata.json",
            metrics: "Leipzig-metrics.json",
            version: "5.2",
            license: { spdx: "OFL-1.1", file: "Leipzig-LICENSE.txt" },
            source: "https://example.com/leipzig",
        },
        {
            id: "gootville",
            name: "Gootville",
            file: "Gootville.otf",
            format: "opentype",
            metadata: "Gootville-metadata.json",
            metrics: "Gootville-metrics.json",
            version: "1.3",
            license: { spdx: "OFL-1.1", file: "Gootville-readme.txt" },
            source: "https://example.com/gootville",
        },
    ],
};

/**
 * @param staffLineThickness The value the fonts are told apart by.
 *
 * @returns The engraving defaults a metrics file has to hold.
 */
const createEngravingDefaults = (staffLineThickness: number) => {
    return {
        staffLineThickness,
        stemThickness: 0.12,
        beamThickness: 0.5,
        beamSpacing: 0.25,
        legerLineThickness: 0.16,
        legerLineExtension: 0.4,
        thinBarlineThickness: 0.16,
        thickBarlineThickness: 0.5,
        barlineSeparation: 0.4,
        repeatBarlineDotSeparation: 0.16,
        bracketThickness: 0.5,
        tupletBracketThickness: 0.16,
    };
};

/**
 * Builds the metrics of one font. Only Bravura describes a black notehead, which is the glyph the
 * fallback tests use.
 *
 * @param fontName The font the metrics belong to.
 * @param staffLineThickness The value that tells the fonts apart.
 * @param restHeight The height the font states for its quarter rest.
 * @param hasBlackNotehead Whether the font describes a black notehead.
 * @param hasFlag Whether the font describes an eighth flag.
 *
 * @returns The metrics file as the generator writes it.
 */
const createMetrics = (fontName: string, staffLineThickness: number, restHeight: number,
    hasBlackNotehead: boolean, hasFlag = true) => {
    const glyphs: Record<string, unknown> = {
        [SmuflGlyph.RestQuarter]: { bBoxNE: [1.08, restHeight], bBoxSW: [0.004, -restHeight] },

        // The repeat dots and the barline glyphs the drawn barlines are measured against: the strokes of a
        // repeat stand closer together than the font's barlineSeparation states.
        [SmuflGlyph.RepeatDots]: { bBoxNE: [0.4, 2.68], bBoxSW: [0, 1.272] },
        [SmuflGlyph.BarlineFinal]: { bBoxNE: [1.06, 4], bBoxSW: [0, 0] },
        [SmuflGlyph.RepeatRight]: { bBoxNE: [1.464, 4], bBoxSW: [0, 0] },
        [SmuflGlyph.RepeatRightLeft]: { bBoxNE: [2.428, 4], bBoxSW: [0, 0] },
    };

    if (hasBlackNotehead) {
        glyphs[SmuflGlyph.NoteheadBlack] = {
            bBoxNE: [1.18, 0.5], bBoxSW: [0, -0.5], stemUpSE: [1.18, 0.168], stemDownNW: [0, -0.168],
        };
    }

    if (hasFlag) {
        glyphs[SmuflGlyph.Flag8thUp] = {
            bBoxNE: [1.056, 0.036], bBoxSW: [0, -3.24], stemUpNW: [0, -0.04],
        };
    }

    return {
        version: 1,
        fontName,
        fontVersion: "1.0",
        engravingDefaults: createEngravingDefaults(staffLineThickness),
        glyphs,
    };
};

/** The metrics of the three fonts, keyed by the file the loader fetches them from. */
const metricsByFile: Record<string, unknown> = {
    "Bravura-metrics.json": createMetrics("Bravura", 0.13, 1.492, true),
    "Leipzig-metrics.json": createMetrics("Leipzig", 0.08, 1.2, false),
    "Gootville-metrics.json": createMetrics("Gootville", 0.13, 1.492, false),
};

/**
 * Makes the catalogue URL answer with a body that fails to parse, which is how a broken catalogue
 * reaches the loader.
 */
const respondWithBrokenBody = (): void => {
    vi.stubGlobal("fetch", vi.fn(() => {
        return Promise.resolve({
            json: () => {
                return Promise.reject(new Error("not JSON"));
            },
        });
    }));
};

/**
 * Makes the catalogue URL answer with the given catalogue and every metrics URL with the metrics of
 * the font that file belongs to.
 *
 * @param body The parsed catalogue the catalogue URL answers with.
 */
const respondWithIndex = (body: unknown = catalogue): void => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
        const file = url.split("/").pop() ?? "";

        return Promise.resolve({
            json: () => {
                return Promise.resolve(metricsByFile[file] ?? body);
            },
        });
    }));
};

class FontFaceStub {
    public readonly family: string;
    public readonly source: string;

    public constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
    }

    public load(): Promise<FontFaceStub> {
        if (unloadableFamilies.has(this.family)) {
            return Promise.reject(new Error(`cannot load ${this.family}`));
        }

        loadedFaces.push(this);

        return Promise.resolve(this);
    }
}

/** Families whose face refuses to load, so the loader has to report them as unusable. */
const unloadableFamilies = new Set<string>();

/** The faces that were actually loaded. */
const loadedFaces: FontFaceStub[] = [];

/** The faces that were registered in the document. */
const registeredFaces: FontFaceStub[] = [];

describe.sequential("SmuflFontLoader", () => {
    beforeEach(() => {
        unloadableFamilies.clear();
        loadedFaces.length = 0;
        registeredFaces.length = 0;

        // The loader warns about everything it cannot use, which is the subject of some tests.
        vi.spyOn(console, "warn").mockImplementation(() => {
            // Keep the test output readable.
        });

        vi.stubGlobal("FontFace", FontFaceStub);
        Object.defineProperty(document, "fonts", {
            configurable: true,
            value: {
                add: (face: FontFaceStub) => {
                    registeredFaces.push(face);
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete (document as { fonts?: unknown; }).fonts;
    });

    it("loads the catalogue's default font and publishes it as the drawing font", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        expect(loader.activeId).toBe("bravura");
        expect(loader.familyStack).toBe("\"Bravura\"");
        expect(document.documentElement.style.getPropertyValue(musicFontFamilyVariable)).toBe("\"Bravura\"");
        expect(registeredFaces.map((face) => {
            return face.family;
        })).toContain("Bravura");
    });

    it("leaves the catalogue's default font as the fallback for a font the user picked", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize({ fontId: "leipzig" });

        expect(loader.activeId).toBe("leipzig");
        expect(loader.familyStack).toBe("\"Leipzig\", \"Bravura\"");
    });

    it("falls back to the default font when the stored one is gone", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize({ fontId: "vanished" });

        expect(loader.activeId).toBe("bravura");
    });

    it("does not offer a font that failed to load", async () => {
        respondWithIndex();
        unloadableFamilies.add("Leipzig");

        const loader = new SmuflFontLoader();
        await loader.initialize({ fontId: "leipzig" });
        await loader.preload();

        expect(loader.activeId).toBe("bravura");
        expect(loader.choices.map((choice) => {
            return choice.id;
        })).toEqual(["bravura", "gootville"]);
    });

    it("describes every font it offers", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        const leipzig = loader.choices.find((choice) => {
            return choice.id === "leipzig";
        });

        expect(leipzig?.name).toBe("Leipzig");
        expect(leipzig?.fontFamily).toBe("\"Leipzig\", \"Bravura\"");
        expect(leipzig?.license.spdx).toBe("OFL-1.1");
    });

    it("loads the remaining fonts in the background, and only once", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();
        await loader.preload();

        expect(loadedFaces.map((face) => {
            return face.family;
        })).toEqual(["Bravura", "Leipzig", "Gootville"]);

        await loader.preload();

        expect(loadedFaces).toHaveLength(3);
    });

    it("keeps the app running when the catalogue cannot be read", async () => {
        respondWithBrokenBody();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        expect(loader.activeId).toBeUndefined();
        expect(loader.familyStack).toBe("");
        expect(loader.choices).toEqual([]);
    });

    it("reports an empty font list when the catalogue is malformed", async () => {
        respondWithIndex({ version: "one", fonts: [] });

        const loader = new SmuflFontLoader();
        await loader.initialize();

        expect(loader.choices).toEqual([]);
    });

    it("publishes the engraving defaults of the drawing font, in px", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        const style = document.documentElement.style;

        // Bravura draws a staff line 0.13 staff spaces thick, at ten px per staff space, which rounds to
        // a whole pixel so that the line lands on the pixel grid.
        expect(style.getPropertyValue("--staff-line-thickness")).toBe("1px");
        expect(style.getPropertyValue("--stem-thickness")).toBe("1px");

        // The black notehead lets a stem leave it 0.168 spaces above its baseline, 0.59 spaces right
        // of the head's ink centre.
        expect(style.getPropertyValue("--stem-anchor-y-noteheadblack")).toBe("2px");
        expect(style.getPropertyValue("--stem-anchor-x-noteheadblack")).toBe("6px");

        // The ink box of a drawn glyph is what the drawing places the symbols around it by.
        expect(style.getPropertyValue("--glyph-ink-width-noteheadblack")).toBe("12px");
        expect(style.getPropertyValue("--glyph-ink-height-noteheadblack")).toBe("10px");

        // The same box in the font's own unit, for the drawings that stretch ink to a band the box states in
        // staff spaces.
        expect(style.getPropertyValue("--glyph-ink-spaces-top-noteheadblack")).toBe("0.5");
        expect(style.getPropertyValue("--glyph-ink-spaces-bottom-noteheadblack")).toBe("-0.5");

        // A flag states where the stem ends inside its ink, as lengths right of and above it.
        expect(style.getPropertyValue("--stem-end-x-flag8thup")).toBe("0px");
        expect(style.getPropertyValue("--stem-end-y-flag8thup")).toBe("0px");

        await loader.select("leipzig");

        expect(style.getPropertyValue("--staff-line-thickness")).toBe("1px");
    });

    it("publishes the geometry of the barlines the score draws, in px", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        const style = document.documentElement.style;

        // A plain barline is one stroke of the thickness the font states, rounded to a whole pixel.
        expect(style.getPropertyValue("--barline-single-width")).toBe("2px");

        // The strokes are as far apart as the font draws them: the ink of the glyph a font states for the same
        // barline, less the strokes and the dots it is assembled from, is what is left for the separation. A
        // final barline keeps the separation the font states for a thin and a thick stroke, as its glyph ink
        // covers exactly that; a repeat barline stands closer, which only its own glyph states.
        expect(style.getPropertyValue("--barline-final-separation")).toBe("4px");
        expect(style.getPropertyValue("--barline-final-width")).toBe("11px");
        expect(style.getPropertyValue("--barline-repeat-separation")).toBe("2px");
        expect(style.getPropertyValue("--barline-repeat-width")).toBe("15px");
        expect(style.getPropertyValue("--barline-repeat-both-width")).toBe("25px");
    });

    it("measures a glyph the drawing font does not describe with the default font's metrics", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();
        await loader.select("leipzig");

        // Leipzig states nothing about a black notehead, so Bravura's box and anchors stand in for it.
        expect(loader.glyphMetrics(SmuflGlyph.NoteheadBlack)).toEqual({
            bBoxNE: [1.18, 0.5],
            bBoxSW: [0, -0.5],
            stemUpSE: [1.18, 0.168],
            stemDownNW: [0, -0.168],
        });

        // The quarter rest is Leipzig's own.
        expect(loader.glyphMetrics(SmuflGlyph.RestQuarter)).toEqual({
            bBoxNE: [1.08, 1.2],
            bBoxSW: [0.004, -1.2],
        });
    });

    it("keeps drawing when a metrics file cannot be read", async () => {
        respondWithIndex();

        const loader = new SmuflFontLoader();
        await loader.initialize();

        // A metrics file the generator did not write is the same as a font that states nothing.
        expect(SmuflFontMetrics.read({ version: 99 }).metrics).toBeUndefined();
        expect(loader.activeId).toBe("bravura");
    });
});
