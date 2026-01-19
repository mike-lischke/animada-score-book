/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, it, expect, vi } from "vitest";

import { AudioBufferPlayer } from "../../src/player/AudioBufferPlayer.js";

class StubGainNode {
    public connectedDest: AudioNode | null = null;
    public connectCalledCount = 0;
    public gain = {
        setTargetAtTime: vi.fn()
    };
    public connect(dest: AudioNode) {
        this.connectedDest = dest;
        this.connectCalledCount++;
    }
}

class StubAudioBufferSourceNode {
    public buffer: AudioBuffer | null = null;
    public connectedNode: AudioNode | null = null;
    public connectCalledCount = 0;
    public start = vi.fn();
    private endedCallbacks: Array<() => void> = [];

    public connect(node: AudioNode) {
        this.connectedNode = node;
        this.connectCalledCount++;
    }

    public addEventListener(event: string, cb: () => void) {
        if (event === "ended") {
            if (!this.endedCallbacks.includes(cb)) {
                this.endedCallbacks.push(cb);
            }
        }
    }

    public triggerEnded() {
        this.endedCallbacks.forEach((cb) => {
            cb();
        });
    }
}

class StubAudioContext {
    public destination: AudioNode = {} as AudioNode;
    public constructor(
        private readonly sourceNode: StubAudioBufferSourceNode,
        private readonly gainNode: StubGainNode
    ) { }

    public createBufferSource(): StubAudioBufferSourceNode {
        return this.sourceNode;
    }

    public createGain(): StubGainNode {
        return this.gainNode;
    }
}

describe("AudioBufferPlayer", () => {
    it("starts playback at the specified time and connects nodes", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const stubCtx = new StubAudioContext(source, gain);
        const ctx = stubCtx as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 1.5);
        expect(source.start).toHaveBeenCalledWith(1.5);
        expect(source.connectedNode).toBe(gain);
        expect(gain.connectedDest).toBe(stubCtx.destination);
        expect(player).toBeTruthy();
    });

    it("uses default start time 0 when not provided", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        // time omitted
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const player = new AudioBufferPlayer(buffer, ctx);
        expect(source.start).toHaveBeenCalledWith(0);
    });

    it("registers onEnded callback and invokes it when ended", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        const fn = vi.fn();
        player.onEnded(fn);

        source.triggerEnded();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("invokes multiple distinct onEnded listeners once each", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        player.onEnded(fn1);
        player.onEnded(fn2);

        source.triggerEnded();
        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);
    });

    it("registering the same onEnded listener twice triggers only once", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        const fn = vi.fn();
        player.onEnded(fn);
        player.onEnded(fn);

        source.triggerEnded();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("stop() fades gain rapidly to avoid popping", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        player.stop();
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.05);
    });

    it("stop() is idempotent and can be called twice", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        player.stop();
        player.stop();
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(2);
    });

    it("connects source->gain and gain->destination exactly once", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const player = new AudioBufferPlayer(buffer, ctx, 0);
        expect(source.connectCalledCount).toBe(1);
        expect(gain.connectCalledCount).toBe(1);
    });

    it("onEnded added after end event does not fire retroactively", () => {
        const source = new StubAudioBufferSourceNode();
        const gain = new StubGainNode();
        const ctx = new StubAudioContext(source, gain) as unknown as AudioContext;
        const buffer = {} as AudioBuffer;

        const player = new AudioBufferPlayer(buffer, ctx, 0);
        source.triggerEnded();

        const fn = vi.fn();
        player.onEnded(fn);
        expect(fn).toHaveBeenCalledTimes(0);
    });
});
