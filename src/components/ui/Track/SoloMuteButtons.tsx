/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild, type ContextType } from "preact";

import { Button } from "../framework/Button.js";
import { UIComponent } from "../framework/UIComponent.js";
import { TrackPlayerContext } from "./TrackViewer.js";

const smButtonClasses = "options-button push-button small solo-mute-button";

interface ISoloMuteButtonsState {
    soloed: boolean;
    muted: boolean;
}

export class SoloMuteButtons extends UIComponent<{}, ISoloMuteButtonsState> {
    private trackPlayerContext?: ContextType<typeof TrackPlayerContext>;

    public constructor(props: {}) {
        super(props);

        this.state = {
            soloed: false,
            muted: false,
        };
    }

    public override componentWillUnmount(): void {
        this.trackPlayerContext?.unsubscribe(this.muteChanged);
    }

    public render(): ComponentChild {
        return (
            <TrackPlayerContext.Consumer>
                {(trackPlayer) => {
                    this.useContext(trackPlayer);

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
                }}
            </TrackPlayerContext.Consumer>
        );
    }

    private solo = () => {
        return this.trackPlayerContext!.soloMute = (this.trackPlayerContext!.soloMute === "solo" ? null : "solo");
    };

    private mute = () => {
        this.trackPlayerContext!.soloMute = (this.trackPlayerContext!.soloMute === "mute" ? null : "mute");
    };

    private useContext(trackPlayerContext?: ContextType<typeof TrackPlayerContext>) {
        if (this.trackPlayerContext !== trackPlayerContext) {
            this.trackPlayerContext = trackPlayerContext;

            trackPlayerContext?.subscribe(this.muteChanged);

            this.setState({
                soloed: trackPlayerContext!.soloMute === "solo",
                muted: trackPlayerContext!.soloMute === "mute",
            });
        }
    }

    private muteChanged = () => {
        this.setState({
            soloed: this.trackPlayerContext!.soloMute === "solo",
            muted: this.trackPlayerContext!.soloMute === "mute",
        });
    };
}
