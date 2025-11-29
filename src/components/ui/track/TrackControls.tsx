/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import type { TrackView } from "../../../core/index.js";
import { BananaDrumContext } from "../ScoreBookViewer.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import { toggleOverlay } from "../Overlay.js";

export interface ITrackControlsProps extends IComponentProperties {
    track: TrackView;
    overlayName: string;
}

export class TrackControls extends ComponentBase<ITrackControlsProps> {
    public render(): ComponentChild {
        const { track, overlayName } = this.props;

        return (
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    return (
                        <div className="track-controls">
                            <button className="push-button gray"
                                onClick={() => {
                                    bananaDrumContext?.edit({
                                        type: "EditCommand_ArrangementRemoveTrack",
                                        arrangement: track.arrangement,
                                        removeTrack: track
                                    });
                                }}
                            >Remove track</button>
                            <button className="push-button gray"
                                onClick={() => {
                                    bananaDrumContext?.edit({
                                        type: "EditCommand_TrackClear",
                                        track,
                                        command: "clear"
                                    });
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
                }}
            </BananaDrumContext.Consumer>
        );
    }
};
