/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import paperPlaneIcon from "../../assets/images/icons/paper_plane_white.svg";

import type { JSX } from "preact/jsx-runtime";

import { toggleOverlay } from "./Overlay.js";

export function ShareButton(): JSX.Element {
    return (
        <button id="share-button" className="push-button" onClick={() => {
            toggleOverlay("share", "show");
        }}>
            <span>Share this beat!</span>
            <img style={{ width: "18pt", height: "18pt" }} src={paperPlaneIcon} />
        </button>
    );
}
