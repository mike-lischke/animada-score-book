/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { EditEntryMode } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Icon } from "../framework/Icon.js";
import { Swap } from "../framework/Swap.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IEntryModeButtonProps extends ICommonUIProperties {
    /** The entry mode that is in effect. The grid view always reports overwrite. */
    entryMode: EditEntryMode;

    /** True while the mode cannot be switched, which is the case in the grid view. */
    locked?: boolean;
}

/**
 * Switches how note entry makes room: insert pushes the content behind the entry position, overwrite
 * replaces it. The button is a swap, so it animates between its two icons the way the play button
 * does. Overwrite is the mode that changes the content, so it carries the mark the note length
 * buttons use for their active value.
 */
export class EntryModeButton extends UIComponent<IEntryModeButtonProps> {
    public render(): ComponentChild {
        const { entryMode, locked } = this.props;

        const isOverwrite = entryMode === EditEntryMode.Overwrite;
        const tooltip = isOverwrite
            ? "Overwrite mode: new notes replace the content at the cursor"
            : "Insert mode: new notes push the content behind the cursor";

        return (
            <GooeyGroup className="entryModeGooey" background="var(--color-base-200)">
                <Swap
                    id="entryModeButton"
                    className="entryModeButton"
                    isOn={isOverwrite}
                    isMarked={isOverwrite}
                    disabled={locked}
                    data-tooltip={tooltip}
                    offContent={<Icon src={UIIcon.ArrowExpandRight} width={20} height={20} data-tooltip="inherit" />}
                    onContent={<Icon src={UIIcon.SwapHorizontal} width={20} height={20} data-tooltip="inherit" />}
                    onChange={(isOn) => {
                        void requisitions.execute("editEntryModeChanged",
                            isOn ? EditEntryMode.Overwrite : EditEntryMode.Insert);
                    }}
                />
            </GooeyGroup>
        );
    }
}
