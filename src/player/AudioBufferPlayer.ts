/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { clampValue } from "../core/utils.js";

export class AudioBufferPlayer {
    private readonly sourceNode: AudioBufferSourceNode;
    private readonly gainNode: GainNode;

    public constructor(audioBuffer: AudioBuffer, audioContext: BaseAudioContext, time = 0) {
        // Use the AudioContext factory to create the source node to avoid
        // referencing a global constructor which may not exist in some test
        // environments (Node + JSDOM / test runners).
        const src = audioContext.createBufferSource();
        src.buffer = audioBuffer;
        this.sourceNode = src;

        // When the user halts playback, if we simply stop all audio we will get popping
        // So instead we use gain, and fade the audio out rapidly
        // Maybe we should be doing this at the AudioContext level, rather than each sample...
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(audioContext.destination);
        this.gainNode.gain.value = 0.5; // Consider initial volume in future if needed
        this.sourceNode.connect(this.gainNode);
        this.sourceNode.start(clampValue(time, 0, Number.MAX_SAFE_INTEGER));
    }

    /** Fade out rapidly to avoid popping on stop playback. */
    public stop(): void {
        this.gainNode.gain.setTargetAtTime(0, 0, 0.05);
    }

    /**
     * Register a handler for when the audio buffer finishes or is stopped.
     *
     * @param callback The function to call when playback ends.
     */
    public onEnded(callback: () => void): void {
        this.sourceNode.addEventListener("ended", callback);
    }
}
