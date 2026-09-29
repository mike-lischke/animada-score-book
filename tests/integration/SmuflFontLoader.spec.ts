/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
            version: "1.3",
            license: { spdx: "OFL-1.1", file: "Gootville-readme.txt" },
            source: "https://example.com/gootville",
        },
    ],
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
 * @param body The parsed catalogue the catalogue URL answers with.
 */
const respondWithIndex = (body: unknown = catalogue): void => {
    vi.stubGlobal("fetch", vi.fn(() => {
        return Promise.resolve({
            json: () => {
                return Promise.resolve(body);
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
});
