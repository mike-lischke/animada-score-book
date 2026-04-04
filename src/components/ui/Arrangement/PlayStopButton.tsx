/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Button } from "../framework/Button.js";
import { PredefinedImage } from "../framework/Image.js";
import { Image } from "../framework/Image.js";

export interface IPlayStopButtonProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
}

export class PlayStopButton extends UIComponent<IPlayStopButtonProperties> {
    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;
        this.addSubscription(arrangementPlayer, this.playStateChanged);
    }

    public override componentDidUpdate(previousProps: Readonly<IPlayStopButtonProperties>): void {
        const { arrangementPlayer } = this.props;
        if (previousProps.arrangementPlayer !== arrangementPlayer) {
            this.removeSubscription(previousProps.arrangementPlayer, this.playStateChanged);
            this.addSubscription(arrangementPlayer, this.playStateChanged);
        }
    }

    public override render(): ComponentChild {
        const { id, arrangementPlayer } = this.props;

        const isPlaying = arrangementPlayer.state === "playing" || arrangementPlayer.state === "counting";

        let playButton;
        if (isPlaying) {
            playButton = (
                <Button
                    imageOnly
                    round
                    id={id}
                    className="softButton shadow-md"
                    data-tooltip="Stop playback"
                    style={{ margin: "0 8px" }}
                    onClick={() => {
                        arrangementPlayer.stop();
                    }}>
                    <Image key="pauseButton" src={PredefinedImage.PauseImage} data-tooltip="inherit" />
                </Button>
            );
        } else {
            playButton = (
                <Button
                    imageOnly
                    round
                    id={id}
                    className="softButton shadow-md"
                    data-tooltip="Start playback with the selected tempo and volume settings."
                    style={{ margin: "0 8px" }}
                    onClick={() => {
                        void arrangementPlayer.play();
                    }}>
                    <Image key="playButton" src={PredefinedImage.PlayImage} data-tooltip="inherit" />
                </Button>
            );
        }

        return playButton;
    }

    private playStateChanged = () => {
        this.forceUpdate();
    };
}
