/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import { PlayerPlayState, type ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { Button } from "../framework/Button.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { requisitions } from "../../../supplement/Requisitions.js";

export interface IPlayStopButtonProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
}

export class PlayStopButton extends UIComponent<IPlayStopButtonProperties> {
    public override componentDidMount(): void {
        requisitions.register("playerStateChanged", this.handlePlayerStateChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("playerStateChanged", this.handlePlayerStateChanged);
    }

    public override render(): ComponentChild {
        const { id, arrangementPlayer } = this.props;

        const isPlaying = arrangementPlayer.state === PlayerPlayState.Playing
            || arrangementPlayer.state === PlayerPlayState.Counting;

        const className = this.generateFinalClassName([
            "play-stop-button",
            this.classFromProperty(isPlaying, "is-playing"),
        ]);

        const icon = <Icon src={isPlaying ? UIIcon.Stop : UIIcon.Play} />;
        const label = <span className="play-stop-label">{isPlaying ? "Stop" : "Play"}</span>;

        return (
            <Button
                id={id}
                className={className}
                aria-pressed={isPlaying}
                title={isPlaying ? "Stop playback" : "Play the score"}
                onClick={() => {
                    void requisitions.execute("selectionEditPopupCloseRequested", undefined);
                    if (isPlaying) {
                        arrangementPlayer.stop();

                        return;
                    }

                    void arrangementPlayer.play();
                }}
            >
                {icon}
                {label}
            </Button>
        );
    }

    private handlePlayerStateChanged = (): Promise<boolean> => {
        this.forceUpdate();

        return Promise.resolve(true);
    };

}
