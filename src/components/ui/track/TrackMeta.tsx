/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import wrenchIcon from "../../../assets/images/icons/wrench.svg";

import type { JSX } from "preact/jsx-runtime";

import type { TrackView } from "../../../core/index.js";
import { getTrackColour } from "../../../ui/track-colour.js";
import { SoloMuteButtons } from "./SoloMuteButtons.js";

export function TrackMeta({ track, toggleControls }: { track: TrackView, toggleControls: () => void; }): JSX.Element {
    const instrumentName = track.instrument.displayName;

    return (
        <div
            className="track-meta"
            style={{ backgroundColor: getTrackColour(track) }}
        >
            {instrumentName}
            <div className="buttons-wrapper">
                <SoloMuteButtons />
                <button className="options-button push-button small gray" onClick={toggleControls}>
                    <img src={wrenchIcon} alt="options" />
                </button>
            </div>
        </div>
    );
}
