/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import restIcon from "../../../assets/images/icons/16th_rest.svg";

import type { ComponentChild } from "preact";

import type { INoteStyle } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Icon } from "../framework/Icon.js";

export interface INoteStyleSymbolViewerProps extends ICommonUIProperties {
    noteStyle?: INoteStyle;
}

export class NoteStyleSymbolViewer extends UIComponent<INoteStyleSymbolViewerProps> {
    public override render(): ComponentChild {
        const { noteStyle } = this.props;

        if (!noteStyle) {
            return <Icon className="note-style-symbol small" src={restIcon} width={16} height={16} />;
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
