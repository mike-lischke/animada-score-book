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

import { SmuflFonts, type ISmuflFontIndex, type ISmuflFontIndexEntry } from "./SmuflFonts.js";

/** The CSS variable the drawing components read their font from. */
export const musicFontFamilyVariable = "--music-font-family";

/** The catalogue's URL. Files in `public/` are served from the site root. */
const defaultIndexUrl = "/fonts/smufl/index.json";

/** The folder a font file is served from. */
const fontFolderUrl = "/fonts/smufl/";

/** Loads the fonts of one catalogue and makes the score's font available to the stylesheets. */
export class SmuflFontLoader {
    private index?: ISmuflFontIndex;
    private active?: ISmuflFontIndexEntry;
    private readonly loaded = new Set<string>();
    private readonly unusable = new Set<string>();

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
     * Reads the catalogue and loads the font the score starts with.
     *
     * Never throws: a font that cannot be loaded leaves the score without a music font instead of
     * keeping the app from starting.
     *
     * @param indexUrl The URL of the font catalogue.
     */
    public async initialize(indexUrl: string = defaultIndexUrl): Promise<void> {
        try {
            const response = await fetch(indexUrl);
            const raw: unknown = await response.json();
            const result = SmuflFonts.readIndex(raw);
            if (result.index === undefined) {
                console.warn(`SmuflFontLoader: ${result.errors.join("; ")}`);

                return;
            }

            this.index = result.index;

            const entry = SmuflFonts.defaultEntry(result.index);
            if (entry !== undefined) {
                await this.select(entry.id);
            }
        } catch (error) {
            console.warn(`SmuflFontLoader: cannot read ${indexUrl}`, error);
        }
    }

    /**
     * Loads a font and makes it the one the score is drawn with. The catalogue's default font is loaded
     * as well, because it is the fallback for every glyph the selected font does not cover.
     *
     * @param id The id of the font to select.
     *
     * @returns Whether the font was loaded and is now the active one.
     */
    public async select(id: string): Promise<boolean> {
        const { index } = this;
        const entry = index?.fonts.find((candidate) => {
            return candidate.id === id;
        });

        if (index === undefined || entry === undefined) {
            return false;
        }

        const fallback = SmuflFonts.defaultEntry(index);
        if (fallback !== undefined) {
            await this.register(fallback);
        }

        if (!await this.register(entry)) {
            return false;
        }

        this.active = entry;
        this.publish();

        return true;
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
    }
}
