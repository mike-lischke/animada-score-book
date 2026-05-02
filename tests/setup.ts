/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, vi } from "vitest";

class StorageMock implements Storage {
    private data = new Map<string, string>();

    public get length(): number {
        return this.data.size;
    }

    public clear(): void {
        this.data.clear();
    }

    public getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    public key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null;
    }

    public removeItem(key: string): void {
        this.data.delete(key);
    }

    public setItem(key: string, value: unknown): void {
        this.data.set(key, String(value));
    }
}

let mockedHistoryState: unknown = null;
const localStorageMock = new StorageMock();
const sessionStorageMock = new StorageMock();

const resetBrowserStateMocks = (): void => {
    mockedHistoryState = null;
    localStorageMock.clear();
    sessionStorageMock.clear();
};

Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
});

Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageMock,
    configurable: true,
});

Object.defineProperty(window.history, "state", {
    get: () => {
        return mockedHistoryState;
    },
    configurable: true,
});

Object.defineProperty(window, "state", {
    get: () => {
        return mockedHistoryState;
    },
    set: (value: unknown) => {
        mockedHistoryState = value;
    },
    configurable: true,
});

vi.spyOn(window.history, "replaceState").mockImplementation((data: unknown) => {
    mockedHistoryState = data;
});

vi.spyOn(window.history, "pushState").mockImplementation((data: unknown) => {
    mockedHistoryState = data;
});

beforeEach(() => {
    resetBrowserStateMocks();
});

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
