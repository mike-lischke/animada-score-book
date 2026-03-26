/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { Button } from "./framework/Button.js";
import { UIComponent } from "./framework/UIComponent.js";
import { Overlay } from "./Overlay.js";
import { Codicon } from "./framework/Codicon.js";
import { Icon } from "./framework/Icon.js";

export class ShareButton extends UIComponent {
    public render(): ComponentChild {
        return (
            <Button
                id="share-button"
                onClick={() => {
                    Overlay.toggleOverlay("share", "show");
                }}
                data-tooltip="Share this beat!"
                imageOnly
                className="btn-ghost"
            >
                <Icon src={Codicon.LiveShare} data-tooltip="inherit" />
            </Button >
        );
    }
}
