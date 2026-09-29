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

/** Loads the fonts of one catalogue and makes the score's font available to the stylesheets. */
export class SmuflFontLoader {
    private index?: ISmuflFontIndex;
    private active?: ISmuflFontIndexEntry;
    private readonly loaded = new Set<string>();
    private readonly unusable = new Set<string>();

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
            await this.register(fallback);
        }

        if (!await this.register(entry)) {
            return false;
        }

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
