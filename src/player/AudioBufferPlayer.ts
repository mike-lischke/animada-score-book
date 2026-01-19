/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export class AudioBufferPlayer {
    private readonly sourceNode: AudioBufferSourceNode;
    private readonly gainNode: GainNode;
    private readonly audioContext: AudioContext;

    public constructor(audioBuffer: AudioBuffer, audioContext: AudioContext, time = 0) {
        this.audioContext = audioContext;

        // Previously, we followed the recommend pattern: new AudioBufferSourceNode(audioContext, {buffer:audioBuffer});
        // But support for this constructor on iOS is only since 14.5
        this.sourceNode = audioContext.createBufferSource();
        this.sourceNode.buffer = audioBuffer;

        // When the user halts playback, if we simply stop all audio we will get popping
        // So instead we use gain, and fade the audio out rapidly
        // Maybe we should be doing this at the AudioContext level, rather than each sample...
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(audioContext.destination);
        // this.gainNode.gain.value = 0.25; // Consider initial volume in future if needed
        this.sourceNode.connect(this.gainNode);
        this.sourceNode.start(time);
    }

    /** Fade out rapidly to avoid popping and stop playback. */
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
