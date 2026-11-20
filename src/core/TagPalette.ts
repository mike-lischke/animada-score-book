/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** One colour of the fixed tag palette. */
export interface ITagColour {
    /** The name the palette gives the colour. */
    readonly name: string;

    /** The colour itself. A badge tints its background with it and paints its caption with it. */
    readonly color: string;
}

/**
 * The fixed set of colours a tag can wear. A tag stores the index of its colour, never a colour value, so the palette
 * can change without touching the data. Every entry is a mid tone, so each serves as tint and as caption in a light and
 * in a dark theme.
 */
export class TagPalette {
    /** The colours, in the order the colour index of a tag counts them. */
    public static readonly colours: readonly ITagColour[] = [
        { name: "flag-red", color: "#d62828" },
        { name: "vivid-tangerine", color: "#f77f00" },
        { name: "dark-teal", color: "#005f73" },
        { name: "dark-cyan", color: "#0a9396" },
        { name: "golden-orange", color: "#ee9b00" },
        { name: "burnt-caramel", color: "#ca6702" },
        { name: "rusty-spice", color: "#bb3e03" },
        { name: "oxidized-iron", color: "#ae2012" },
        { name: "brown-red", color: "#9b2226" },
        { name: "fern", color: "#588157" },
        { name: "hunter-green", color: "#3a5a40" },
        { name: "pine-teal", color: "#344e41" },
    ];

    /**
     * @returns How many colours the palette holds.
     */
    public static get count(): number {
        return TagPalette.colours.length;
    }

    /**
     * @param value A colour index as a caller sent it.
     *
     * @returns The index when it names a palette colour, undefined otherwise.
     */
    public static optionalIndex(value: unknown): number | undefined {
        if (typeof value !== "number" || !TagPalette.isValidIndex(value)) {
            return undefined;
        }

        return value;
    }

    /**
     * @param value A colour index as a caller stored or proposed it.
     *
     * @returns Whether the index names a colour of the palette.
     */
    public static isValidIndex(value: number): boolean {
        return Number.isInteger(value) && value >= 0 && value < TagPalette.count;
    }

    /**
     * @param index The colour index of a tag. An index outside the palette wraps around, so a stored index always
     * resolves to a colour.
     *
     * @returns The colour of that index.
     */
    public static colourAt(index: number): ITagColour {
        const wrapped = ((Math.trunc(index) % TagPalette.count) + TagPalette.count) % TagPalette.count;

        return TagPalette.colours[wrapped];
    }
}
