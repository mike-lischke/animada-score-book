/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { Image, PredefinedImage } from "../framework/Image.js";
import { Swap } from "../framework/Swap.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

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

        const className = this.generateFinalClassName([
            "playStopButton",
            this.classFromProperty(isPlaying, ["", "swap-active"])
        ]);

        const playButton = (
            <Swap
                id={id}
                className={className}
                isOn={isPlaying}
                offContent={
                    <Image
                        src={PredefinedImage.PlayImage}
                        width={40}
                        height={40}
                    />

                }
                onContent={
                    <Image
                        src={PredefinedImage.PauseImage}
                        width={40}
                        height={40}
                    />
                }
                onChange={(isOn) => {
                    if (isOn) {
                        void arrangementPlayer.play();
                    } else {
                        arrangementPlayer.stop();
                    }
                }}
            />);

        return playButton;
    }

    private playStateChanged = () => {
        this.forceUpdate();
    };
}
