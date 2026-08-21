/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { IAudioData } from "../../../core/types/general.js";
import { Icon } from "../framework/Icon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface INoteStyleSymbolViewerProps extends ICommonUIProperties {
    noteStyle?: IAudioData;
}

export class NoteStyleSymbolViewer extends UIComponent<INoteStyleSymbolViewerProps> {
    public override render(): ComponentChild {
        const { noteStyle } = this.props;

        if (!noteStyle) {
            return null;
        }

        const { symbol } = noteStyle;
        if (symbol) {
            if (symbol.src) {
                return <Icon className="note-style-symbol" src={symbol.src} alt={symbol.shortDescription}
                    {...this.dataAttributes} />;
            }

            if (symbol.shortDescription) {
                return <span className="note-style-symbol" {...this.dataAttributes}>{symbol.shortDescription}</span>;
            }
        }

        return <span className="note-style-symbol" {...this.dataAttributes}>{noteStyle.id}</span>;
    }
}
