/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { EditEntryMode } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IEntryModeButtonProps extends ICommonUIProperties {
    /** The entry mode that is in effect. The grid view always reports overwrite. */
    entryMode: EditEntryMode;
}

/**
 * Switches how note entry makes room: insert pushes the content behind the entry position, overwrite
 * replaces it. The button is built like the playback bar's switches: a pill naming the mode, whose status
 * dot lights up while overwrite, the mode that replaces content, is in effect.
 */
export class EntryModeButton extends UIComponent<IEntryModeButtonProps> {
    public render(): ComponentChild {
        const { entryMode } = this.props;

        const isOverwrite = entryMode === EditEntryMode.Overwrite;
        const tooltip = isOverwrite
            ? "Overwrite mode: new notes replace the content at the cursor"
            : "Insert mode: new notes push the content behind the cursor";
        const className = this.generateFinalClassName([
            "entryModeButton",
            this.classFromProperty(isOverwrite, "is-active"),
        ]);

        return (
            <Button className={className} title={tooltip} onClick={this.handleClick}>
                <span className="entryModeDot" aria-hidden="true" />
                <span className="entryModeLabel">{isOverwrite ? "Overwrite" : "Insert"}</span>
            </Button>
        );
    }

    private handleClick = (): void => {
        const { entryMode } = this.props;
        const next = entryMode === EditEntryMode.Overwrite ? EditEntryMode.Insert : EditEntryMode.Overwrite;

        void requisitions.execute("editEntryModeChanged", next);
    };
}
