/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITrackMetaProps extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
    track: ISbDmTrack;
    toggleControls: () => void;
}

export class TrackMeta extends UIComponent<ITrackMetaProps> {
    public render(): ComponentChild {
        const { track } = this.props;

        const instrumentName = track.instrument.displayName;
        const iconPath = track.instrument.image.filePath;

        return (
            <Container
                className="track-meta"
                style={{ backgroundColor: track.instrument.color }}
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.Center}
                crossAlignment={ChildAlignment.Center}
            >
                <Icon
                    className="trackInstrumentIcon"
                    src={iconPath}
                    data-tooltip={instrumentName}
                    width={40}
                    height={40}
                />
            </Container>
        );
    }
}
