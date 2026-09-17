/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { WaveformPlayer } from "../components/ui/composites/WaveformPlayer.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";

export interface ITranscriptionEditorProperties extends ICommonUIProperties {
    url: string;
}

interface ITranscriptionEditorState {
    url: string;
}

export class TranscriptionEditor extends UIComponent<ITranscriptionEditorProperties, ITranscriptionEditorState> {
    public constructor(props: ITranscriptionEditorProperties) {
        super(props);

        this.state = {
            url: "",
        };
    }

    public render(): ComponentChild {
        const { url } = this.state;

        return (
            <Container
                id="transcriptionEditor"
                orientation={Orientation.TopDown}
            >
                <Container orientation={Orientation.LeftToRight} style={{ marginBottom: "16px" }}>
                    <Icon src={UIIcon.VmRunning} style={{ fontSize: "50px", color: "cornflowerblue" }} />
                    <Icon src={UIIcon.ArrowRight} style={{ fontSize: "16px", marginTop: "auto" }} />
                    <Icon
                        src={UIIcon.Music}
                        style={{ fontSize: "30px", marginTop: "auto", color: "cornflowerblue" }}
                    />
                    <Label heading={true} style={{ marginLeft: "16px" }}>Transcribe a Song</Label>
                </Container>
                <input
                    type="file"
                    id="videoInput"
                    accept="video/*"
                    onChange={(event) => {
                        const target = event.target as HTMLInputElement;
                        if (!target.files || target.files.length === 0) {
                            return;
                        }

                        const file = target.files[0];
                        const video = document.getElementById("videoPlayer")! as HTMLVideoElement;
                        const url = URL.createObjectURL(file);

                        this.setState({ url }, () => {
                            video.load();
                        });
                    }}
                />
                <video
                    id="videoPlayer"
                    controls
                    playsinline
                    style="max-height: 300px; margin: 40px auto; display: block;"
                />
                <WaveformPlayer
                    url={url}
                    media={url ? "videoPlayer" : undefined}
                />
            </Container>

        );
    }
}
