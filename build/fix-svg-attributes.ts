/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import fs from "node:fs";
import path from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

/**
 * Drawing programs strip hidden groups on export when they are not visible at export time.
 * The style rules below restore the canonical CSS-variable `style` attributes that control
 * notehead/rest visibility, so the sprite works correctly regardless of export state.
 */

/** Maps an element id to the CSS-variable `display` style it must carry in the repo. */
interface StyleRule {
    /** The element's `id` attribute value. */
    id: string;
    /** The exact string to write into the element's `style` attribute. */
    style: string;
}

/**
 * Removes the listed attributes from `el` and re-adds them in the given order.
 *
 * This restores canonical attribute ordering after a drawing program exports the file,
 * since many tools reorder attributes (e.g. moving `id` earlier or swapping
 * `shape-rendering` and `vector-effect`).
 *
 * @param el The SVG element whose attributes should be reordered.
 * @param attrs The attributes to touch, in the desired final order. When `value` is
 * omitted the element's existing value is preserved.
 */
const reorderAttributes = (el: HTMLElement, attrs: Array<{ name: string; value?: string; }>): void => {
    const saved = new Map(attrs.map(({ name }) => {
        return [name, el.getAttribute(name)] as const;
    }));

    attrs.forEach(({ name }) => {
        return el.removeAttribute(name);
    });

    attrs.forEach(({ name, value }) => {
        const finalValue = value ?? saved.get(name);
        if (finalValue !== undefined) {
            el.setAttribute(name, finalValue);
        }
    });
};

/**
 * The canonical CSS-variable `style` attribute value for every element that controls
 * notehead/rest visibility. These are applied last so they always win over any
 * leftover values from prior repair steps.
 */
const styleRules: Partial<Record<string, StyleRule[]>> = {
    "note.svg": [
        { id: "flag-32nd", style: "display: var(--note-show-flag-32nd, none)" },
        { id: "flag-16th", style: "display: var(--note-show-flag-16th, none)" },
        { id: "flag-8th", style: "display: var(--note-show-flag-8th, none)" },
        { id: "oval-body", style: "display: var(--note-show-oval-body, inline)" },
        { id: "oval-head-half", style: "display: var(--note-show-oval-half, none)" },
        { id: "oval-head-4th", style: "display: var(--note-show-oval-quarter, inline)" },
        { id: "oval-stem", style: "display: var(--note-show-oval-stem, inline)" },
        { id: "oval-head-whole", style: "display: var(--note-show-oval-whole, none)" },
        { id: "dot", style: "display: var(--note-show-dot, none)" },
    ],
    "rest.svg": [
        { id: "full-rest", style: "display: var(--rest-show-whole, none)" },
        { id: "half-rest", style: "display: var(--rest-show-half, none)" },
        { id: "4th-rest", style: "display: var(--rest-show-quarter, none)" },
        { id: "8th-rest", style: "display: var(--rest-show-eighth, none)" },
        { id: "16th-rest", style: "display: var(--rest-show-sixteenth, none)" },
        { id: "32nd-rest", style: "display: var(--rest-show-thirty-second, none)" },
        { id: "dot", style: "display: var(--rest-show-dot, none)" },
    ],
};

/**
 * Repairs a single exported SVG sprite file so that it matches the repo version.
 *
 * Drawing programs introduce several kinds of drift on every export:
 * - `fill`/`stroke` colours are hardcoded to `#000000` instead of `currentColor`.
 * - A bare `display="none"` attribute is added alongside the CSS-variable `style`.
 * - Hidden groups (e.g. `#diamond-body`) may be stripped entirely.
 * - Attribute order changes (e.g. `shape-rendering`/`vector-effect`, `id` position).
 *
 * The function corrects all of the above in order and writes the result back to disk.
 *
 * @param filePath Path to the SVG file to repair (relative to the project root).
 */
const fixSvgFile = (filePath: string): void => {
    // Fix colors at string level before parsing: drawing programs replace currentColor with #000000.
    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/ fill="#000000"/g, " fill=\"currentColor\"");
    content = content.replace(/ stroke="#000000"/g, " stroke=\"currentColor\"");

    const root = parse(content);
    const fileName = path.basename(filePath);

    // Remove spurious bare display="none" attributes added by drawing programs.
    // Visibility is controlled solely via the CSS-variable style attribute.
    root.querySelectorAll("[display]").forEach((el) => {
        el.removeAttribute("display");
    });

    if (fileName === "note.svg") {
        // Restore manual stroke attributes on stems and fix attribute order. Drawing
        // programs may move `id` earlier or re-introduce `shape-rendering` /
        // `vector-effect` that we deliberately removed: those make the printed stem
        // dotted on hi-DPI printers (`crispEdges` aliasing + non-scaling 1.45px).
        // Strip both and use a thicker scaling stroke instead.
        root.querySelectorAll('[id$="-stem"]').forEach((el) => {
            el.removeAttribute("shape-rendering");
            el.removeAttribute("vector-effect");
            el.setAttribute("stroke-width", "3.5");
            reorderAttributes(el, [
                { name: "id" },
                { name: "style" }, // placeholder position; overwritten by styleRules below
            ]);
        });
    }

    // Restore CSS-variable display styles (overrides any leftover values from above).
    styleRules[fileName]?.forEach(({ id, style }) => {
        root.querySelector(`#${id}`)?.setAttribute("style", style);
    });

    // node-html-parser expands self-closing tags; restore SVG convention.
    const output = root.toString().replace(/><\/path>/g, "/>");

    fs.writeFileSync(filePath, output);
    console.log(`✓ Fixed ${filePath}`);
};

["src/assets/images/notes/note.svg", "src/assets/images/notes/rest.svg"].forEach(fixSvgFile);
