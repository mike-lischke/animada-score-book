/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import wrenchIcon from "../../../assets/images/icons/wrench.svg";

import type { ComponentChild } from "preact";

import { getTrackColour } from "../../../ui/track-colour.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import { SoloMuteButtons } from "./SoloMuteButtons.js";
import type { ITrackView } from "../../../Core/types/general.js";

export interface ITrackMetaProps extends IComponentProperties {
    track: ITrackView;
    toggleControls: () => void;
}

export class TrackMeta extends ComponentBase<ITrackMetaProps> {
    public render(): ComponentChild {
        const { track, toggleControls } = this.props;

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
}
