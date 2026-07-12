/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";
import WaveSurfer from "wavesurfer.js";

import { type ICommonUIProperties, UIComponent } from "../framework/UIComponent.js";

export interface IWaveformPlayerProps extends ICommonUIProperties {
    /** A URL to download the audio from. This is mutual exclusive with `media`. */
    url?: string;

    /** The class name of a media element to get audio from. This is mutual exclusive with `url`. */
    media?: string;
}

interface IWaveformPlayerState {
    loading: boolean;
    duration: number;
}

export class WaveformPlayer extends UIComponent<IWaveformPlayerProps, IWaveformPlayerState> {
    private containerRef = createRef<HTMLDivElement>();
    private wavesurfer?: WaveSurfer;

    private seekTimeout?: ReturnType<typeof setTimeout>;

    public constructor(props: IWaveformPlayerProps) {
        super(props);
        this.state = {
            loading: true,
            duration: 0,
        };
    }

    public override componentDidMount() {
        this.initWaveform();
    }

    public override componentDidUpdate(prevProps: IWaveformPlayerProps, prevState: IWaveformPlayerState): void {

        const { url, media } = this.props;
        if (prevProps.url !== url || prevProps.media !== media) {
            this.initWaveform();
        }
    }

    public override componentWillUnmount() {

        if (this.wavesurfer) {
            this.wavesurfer.destroy();
            this.wavesurfer = undefined;
        }
    }

    public override render(): ComponentChild {
        return (
            <div id="waveform-player">
                <div ref={this.containerRef} />
                <div id="time">0:00</div>
                <div id="duration">0:00</div>
                <div id="hover"></div>
            </div>
        );
    }

    private initWaveform() {
        if (!this.containerRef.current) {
            return;
        }

        const { url, media } = this.props;

        // Remove existing instance if any.
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
        }

        this.setState({ loading: true, duration: 0 });

        const height = 120; // The height of the waveform in pixels.
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        // Define the waveform gradient. The resulting canvas will be twice as high (for two graphs, if enabled).
        // So we have to account for that in the gradient definition.
        const gradient = ctx.createLinearGradient(0, 0, 0, 2 * height);
        gradient.addColorStop(0, "#656666");
        gradient.addColorStop(0.5, "#656666");
        gradient.addColorStop(0.5, "#ffffff");
        gradient.addColorStop(0.51, "#ffffff");
        gradient.addColorStop(0.51, "#B1B1B1");
        gradient.addColorStop(1, "#B1B1B1");

        // Define the progress gradient
        const progressGradient = ctx.createLinearGradient(0, 0, 0, 2 * height);
        progressGradient.addColorStop(0, "#EE772F");
        progressGradient.addColorStop(0.5, "#EB4926");
        progressGradient.addColorStop(0.5, "#ffffff");
        progressGradient.addColorStop(0.51, "#ffffff");
        progressGradient.addColorStop(0.51, "#F6B094");
        progressGradient.addColorStop(1, "#F6B094");

        let mediaElement: HTMLMediaElement | undefined;
        if (media) {
            mediaElement = document.getElementById(media) as HTMLMediaElement;
        }

        ;

        const ws = WaveSurfer.create({
            container: this.containerRef.current,
            waveColor: gradient,
            progressColor: progressGradient,
            cursorColor: "#333",
            height,
            barWidth: 2,
            barRadius: 2,
            dragToSeek: { debounceTime: 500 },
            normalize: false,
            media: mediaElement,
            url,
        });

        ws.on("ready", () => {
            this.setState({ loading: false, duration: ws.getDuration() });
        });

        ws.on("error", (e) => {
            console.error("WaveSurfer error", e);
        });

        ws.on("interaction", () => {
            if (this.seekTimeout !== undefined) {
                clearTimeout(this.seekTimeout);
            }

            this.seekTimeout = setTimeout(() => {
                void ws.play();
            }, 300);
        });

        // Hover effect
        {
            const hover = document.querySelector<HTMLDivElement>("#hover")!;
            const waveform = document.querySelector("#waveform-player")!;
            waveform.addEventListener("pointermove", (e: Event) => {
                hover.style.width = `${(e as PointerEvent).offsetX}px`;
            });
        }

        // Current time & duration
        {
            const formatTime = (seconds: number) => {
                const minutes = Math.floor(seconds / 60);
                const secondsRemainder = Math.round(seconds) % 60;
                const paddedSeconds = `0${secondsRemainder}`.slice(-2);

                return `${minutes}:${paddedSeconds}`;
            };

            const timeEl = document.querySelector("#time")!;
            const durationEl = document.querySelector("#duration")!;

            ws.on("decode", (duration: number) => {
                return (durationEl.textContent = formatTime(duration));
            });

            ws.on("timeupdate", (currentTime: number) => {
                return (timeEl.textContent = formatTime(currentTime));
            });
        }

        this.wavesurfer = ws;
        //await ws.load(url);
    }

    private togglePlay = () => {
        void this.wavesurfer?.playPause();
    };

}
