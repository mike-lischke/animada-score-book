/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";

export interface ITrackControlsProps extends ICommonUIProperties {
    undoManager: UndoManager;
    track: ISbDmTrack;
    overlayName: string;
}

export class TrackControls extends UIComponent<ITrackControlsProps> {
    public render(): ComponentChild {
        const { track, overlayName, undoManager } = this.props;

        return (
            <div className="track-controls">
                <Button className="push-button gray"
                    onClick={() => {
                        undoManager.edit({
                            type: "EditCommand_ArrangementRemoveTrack",
                            arrangement: track.arrangement,
                            removeTrack: track
                        });
                    }}
                >Remove track</Button>
                <Button className="push-button gray"
                    onClick={() => {
                        undoManager.edit({
                            type: "EditCommand_TrackClear",
                            track,
                            command: "clear"
                        });
                        Overlay.toggleOverlay(overlayName, "hide");
                    }}
                >Clear track</Button>
                <Button className="push-button gray"
                    onClick={() => {
                        Overlay.toggleOverlay(overlayName, "hide");
                    }}
                >Cancel</Button>
            </div>
        );
    }
};
