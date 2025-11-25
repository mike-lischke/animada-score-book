/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import type { JSX } from "preact/jsx-runtime";
import { TrackView } from "../../../../../bananadrum-core/src/prod/index.js";
import { useEditCommand } from "../../hooks/useEditCommand.js";
import { toggleOverlay } from "../Overlay.js";

export function TrackControls(
    { track, overlayName }: { track: TrackView, overlayName: string; }): JSX.Element {
    const arrangement = track.arrangement;
    const edit = useEditCommand();

    return (
        <div className="track-controls">
            <button className="push-button gray"
                onClick={() => {
                    edit({ type: "EditCommand_ArrangementRemoveTrack", arrangement, removeTrack: track });
                }}
            >Remove track</button>
            <button className="push-button gray"
                onClick={() => {
                    edit({ type: "EditCommand_TrackClear", track, command: "clear" });
                    toggleOverlay(overlayName, "hide");
                }}
            >Clear track</button>
            <button className="push-button gray"
                onClick={() => {
                    toggleOverlay(overlayName, "hide");
                }}
            >Cancel</button>
        </div>
    );
}
