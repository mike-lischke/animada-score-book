/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import type { JSX } from "preact/jsx-runtime";
import { NoteStyle } from "../../../../../bananadrum-core/src/prod/index.js";

export function NoteStyleSymbolViewer({ noteStyle }: { noteStyle?: NoteStyle; }): JSX.Element | null {
    if (!noteStyle) {
        return null;
    }

    const { symbol } = noteStyle;
    if (symbol) {
        if (symbol.src) {
            return <img className="note-style-symbol" src={symbol.src} alt={symbol.string} />;
        }
        if (symbol.string) {
            return <span className="note-style-symbol">{symbol.string}</span>;
        }
    }

    return <span className="note-style-symbol">{noteStyle.id}</span>;
}
