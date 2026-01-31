/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { vi } from "vitest";

export class AudioContextMock {
    public static now = 0;
    public state: AudioContextState = "suspended";
    public destination: AudioNode = {} as AudioNode;
    public get currentTime(): number {
        return AudioContextMock.now;
    }
    public resume = vi.fn(() => {
        return Promise.resolve().then(() => {
            this.state = "running";
        });
    });
}

Object.defineProperty(globalThis, "AudioContext", {
    value: AudioContextMock,
    writable: true,
    enumerable: true,
});
