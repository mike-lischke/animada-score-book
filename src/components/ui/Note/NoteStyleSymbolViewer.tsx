/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { INoteStyle } from "../../../Core1/types/general.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";

export interface INoteStyleSymbolViewerProps extends IComponentProperties {
    noteStyle?: INoteStyle;
}

export class NoteStyleSymbolViewer extends ComponentBase<INoteStyleSymbolViewerProps> {
    public override render(): ComponentChild {
        const { noteStyle } = this.props;

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
}
