/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import { AnimadaScoreBookContext } from "../ScoreBookViewer.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import { Overlay } from "../Overlay.js";
import type { ITrackView } from "../../../Core/types/general.js";

export interface ITrackControlsProps extends IComponentProperties {
    track: ITrackView;
    overlayName: string;
}

export class TrackControls extends ComponentBase<ITrackControlsProps> {
    public render(): ComponentChild {
        const { track, overlayName } = this.props;

        return (
            <AnimadaScoreBookContext.Consumer>
                {(scoreBookContext) => {
                    return (
                        <div className="track-controls">
                            <button className="push-button gray"
                                onClick={() => {
                                    scoreBookContext?.edit({
                                        type: "EditCommand_ArrangementRemoveTrack",
                                        arrangement: track.arrangement,
                                        removeTrack: track
                                    });
                                }}
                            >Remove track</button>
                            <button className="push-button gray"
                                onClick={() => {
                                    scoreBookContext?.edit({
                                        type: "EditCommand_TrackClear",
                                        track,
                                        command: "clear"
                                    });
                                    Overlay.toggleOverlay(overlayName, "hide");
                                }}
                            >Clear track</button>
                            <button className="push-button gray"
                                onClick={() => {
                                    Overlay.toggleOverlay(overlayName, "hide");
                                }}
                            >Cancel</button>
                        </div>
                    );
                }}
            </AnimadaScoreBookContext.Consumer>
        );
    }
};
