/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { registerMp3Encoder } from "@mediabunny/mp3-encoder";
import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeAudio, Input, Mp3OutputFormat, Output } from "mediabunny";

// const blob = await exportSongToMp3(duration, scheduleSong);
// const url = URL.createObjectURL(blob);
// <a href={url} download="song.mp3">Download</a>

export class MP3Export {
    private sampleRate = 44100;

    /**
     * Exports a song to an MP3 file.
     *
     * @param songDuration The duration of the song in seconds.
     * @param scheduleSong A function that schedules the song's audio events.
     *
     * @returns A Promise that resolves to a Blob containing the MP3 file.
     */
    public async exportSongToMp3(
        songDuration: number,
        scheduleSong: (ctx: BaseAudioContext) => void | Promise<void>
    ): Promise<Blob> {
        const audioBuffer = await this.renderSongToAudioBuffer(songDuration, scheduleSong);
        const wavBlob = this.audioBufferToWavBlob(audioBuffer);
        const mp3Blob = await this.wavBlobToMp3Blob(wavBlob);

        return mp3Blob;
    }

    private async renderSongToAudioBuffer(
        songDuration: number,
        scheduleSong: (ctx: BaseAudioContext) => void | Promise<void>
    ): Promise<AudioBuffer> {
        const offline = new OfflineAudioContext(2, this.sampleRate * songDuration, this.sampleRate);

        await scheduleSong(offline);

        const renderedBuffer = await offline.startRendering();

        return renderedBuffer;
    }

    /**
     * Converts an AudioBuffer to a WAV file represented as an ArrayBuffer.
     *
     * @param buffer The AudioBuffer to convert.
     *
     * @returns An ArrayBuffer containing the WAV file data.
     */
    private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
        const channelCount = buffer.numberOfChannels;
        const length = (buffer.length * channelCount * 2) + 44;
        const out = new ArrayBuffer(length);
        const view = new DataView(out);

        let offset = 0;
        const writeString = (s: string) => {
            for (let i = 0; i < s.length; i++) {
                view.setUint8(offset++, s.charCodeAt(i));
            }
        };

        // RIFF header.
        writeString("RIFF");
        view.setUint32(offset, 36 + (buffer.length * channelCount * 2), true);
        offset += 4;

        writeString("WAVE");
        writeString("fmt ");

        // PCM chunk size.
        view.setUint32(offset, 16, true);
        offset += 4;

        // Format = PCM.
        view.setUint16(offset, 1, true);
        offset += 2;

        view.setUint16(offset, channelCount, true);
        offset += 2;

        view.setUint32(offset, buffer.sampleRate, true);
        offset += 4;

        view.setUint32(offset, buffer.sampleRate * channelCount * 2, true);
        offset += 4;

        view.setUint16(offset, channelCount * 2, true);
        offset += 2;

        // Bits per sample.
        view.setUint16(offset, 16, true);
        offset += 2;

        writeString("data");
        view.setUint32(offset, buffer.length * channelCount * 2, true); offset += 4;

        // PCM data (Float32 → Int16).
        const interleaved = new Float32Array(buffer.length * channelCount);
        for (let ch = 0; ch < channelCount; ch++) {
            buffer.getChannelData(ch).forEach((sample, i) => {
                interleaved[(i * channelCount) + ch] = sample;
            });
        }
        let idx = 0;
        while (offset < length) {
            const s = Math.max(-1, Math.min(1, interleaved[idx++]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }

        return out;
    }

    /**
     * Converts an AudioBuffer to a WAV file represented as a Blob.
     *
     * @param audioBuffer The AudioBuffer to convert.
     *
     * @returns A Blob containing the WAV file data.
     */
    private audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
        const wavArrayBuffer = this.audioBufferToWav(audioBuffer);
        const wavBlob = new Blob([wavArrayBuffer], { type: "audio/wav" });

        return wavBlob;
    }

    private async wavBlobToMp3Blob(wavBlob: Blob): Promise<Blob> {
        await this.ensureMp3Encoder();

        const input = new Input({
            source: new BlobSource(wavBlob),
            formats: ALL_FORMATS,
        });

        const output = new Output({
            format: new Mp3OutputFormat(),
            target: new BufferTarget(),
        });

        const { Conversion } = await import("mediabunny");

        const conversion = await Conversion.init({ input, output });
        await conversion.execute();

        const mp3ArrayBuffer = output.target.buffer!; // ArrayBuffer with MP3.

        return new Blob([mp3ArrayBuffer], { type: "audio/mpeg" });
    }

    private async ensureMp3Encoder(): Promise<void> {
        if (!(await canEncodeAudio("mp3"))) {
            registerMp3Encoder();
        }
    }
}
