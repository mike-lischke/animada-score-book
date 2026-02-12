/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

const smButtonClasses = "options-button push-button small solo-mute-button";

export interface ISoloMuteButtonsProps extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
}

interface ISoloMuteButtonsState {
    soloed: boolean;
    muted: boolean;
}

export class SoloMuteButtons extends UIComponent<ISoloMuteButtonsProps, ISoloMuteButtonsState> {
    public constructor(props: ISoloMuteButtonsProps) {
        super(props);

        this.state = {
            soloed: false,
            muted: false,
        };
    }

    public static override getDerivedStateFromProps(props: ISoloMuteButtonsProps): Partial<ISoloMuteButtonsState> {
        const soloMute = props.trackPlayer.soloMute;

        return {
            soloed: soloMute === "solo",
            muted: soloMute === "mute",
        };
    }

    public override componentDidMount(): void {
        const { trackPlayer } = this.props;
        trackPlayer.subscribe(this.muteChanged);
    }

    public override componentWillUnmount(): void {
        const { trackPlayer } = this.props;
        trackPlayer.unsubscribe(this.muteChanged);
    }

    public render(): ComponentChild {
        const { soloed, muted } = this.state;

        const soloButtonColour = soloed ? "lighter-green" : "gray";
        const muteButtonColour = muted ? "dark-blue" : "gray";

        return (
            <>
                <Button
                    className={`${smButtonClasses} ${soloButtonColour}`}
                    onClick={this.solo}>
                    S
                </Button>
                <Button
                    className={`${smButtonClasses} ${muteButtonColour}`}
                    onClick={this.mute}>
                    M
                </Button>
            </>
        );
    }

    private solo = () => {
        const { trackPlayer } = this.props;

        return trackPlayer.soloMute = (trackPlayer.soloMute === "solo" ? null : "solo");
    };

    private mute = () => {
        const { trackPlayer } = this.props;

        return trackPlayer.soloMute = (trackPlayer.soloMute === "mute" ? null : "mute");
    };

    private muteChanged = () => {
        const { trackPlayer } = this.props;

        this.setState({
            soloed: trackPlayer.soloMute === "solo",
            muted: trackPlayer.soloMute === "mute",
        });
    };
}
