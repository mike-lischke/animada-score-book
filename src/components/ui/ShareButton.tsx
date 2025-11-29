/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import paperPlaneIcon from "../../assets/images/icons/paper_plane_white.svg";

import type { ComponentChild } from "preact";

import { ComponentBase } from "./ComponentBase/ComponentBase.js";
import { Overlay } from "./Overlay.js";

export class ShareButton extends ComponentBase {
    public render(): ComponentChild {
        return (
            <button id="share-button" className="push-button" onClick={() => {
                Overlay.toggleOverlay("share", "show");
            }}>
                <span>Share this beat!</span>
                <img style={{ width: "18pt", height: "18pt" }} src={paperPlaneIcon} />
            </button >
        );
    }
}
