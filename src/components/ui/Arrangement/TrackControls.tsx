/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITrackControlsProperties extends ICommonUIProperties {
    tracks: ISbDmTrack[];
    innerRef?: preact.RefObject<HTMLDivElement>;
}

/** Icon and track-specific controls. */
export class TrackControls extends UIComponent<ITrackControlsProperties> {
    public render() {
        const { tracks, innerRef } = this.props;

        const controls = tracks.map((track) => {
            const instrumentName = track.instrument.displayName;
            const iconPath = track.instrument.image.filePath;

            return (
                <Container
                    className="trackControls"
                    style={{ borderColor: track.instrument.color }}
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

        });

        return (
            <Container innerRef={innerRef} className="trackControlsList" orientation={Orientation.TopDown}>
                {controls}
            </Container>
        );
    }
}
