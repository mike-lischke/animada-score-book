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

Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: unknown) => {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
    }),
});

/*
Object.defineProperty(window, "location", {
    get: () => {
        return {
            host: "localhost",
            protocol: "http:",
            search: "", // TODO: simulate various app parameters.
        };
    },
});
*/
Object.defineProperty(window.webkitURL, "createObjectURL", {
    writable: true,
    value: vi.fn().mockImplementation((query: unknown) => {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
    }),
});

Object.defineProperty(window.webkitURL, "revokeObjectURL", {
    writable: true,
    value: vi.fn().mockImplementation((query: unknown) => {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
    }),
});

Object.defineProperty(globalThis, "DOMPoint", {
    writable: true,
    enumerable: true,
    value: vi.fn().mockImplementation((x?: number, y?: number, z?: number, w?: number) => {
        return {
            x: x ?? 0,
            y: y ?? 0,
            z: z ?? 0,
            w: w ?? 0,
            matrixTransform: vi.fn(),
            toJSON: vi.fn(),
        };
    }),
});

Object.defineProperty(globalThis, "DOMRect", {
    writable: true,
    enumerable: true,
    value: vi.fn().mockImplementation((x?: number, y?: number, width?: number, height?: number) => {
        return {
            x: x ?? 0,
            y: y ?? 0,
            width: width ?? 0,
            height: height ?? 0,
            top: y ?? 0,
            right: (x ?? 0) + (width ?? 0),
            bottom: (y ?? 0) + (height ?? 0),
            left: x ?? 0,
        };
    }),
});

Object.defineProperty(HTMLElement.prototype, "innerText", {
    get() {
        return (this as HTMLElement).textContent;
    },

    set(value: string) {
        (this as HTMLElement).textContent = value;
    },
});
