/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "preact/compat";

import { afterEach, beforeEach, vi } from "vitest";

import { AppMode, RunMode } from "../src/core/RunMode.js";
import { localStorageMock, sessionStorageMock } from "./storage-mocks.js";

// Required by auth.ts — the JWT secret is mandatory.
// eslint-disable-next-line no-restricted-syntax
process.env.JWT_SECRET = "test-secret";

let mockedHistoryState: unknown = null;

/** The globals this file adds to: the timers a test left pending, shared by the files of one worker. */
type TimerGlobal = typeof globalThis & { asbPendingTimers?: Set<ReturnType<typeof setTimeout>>; };

const timerGlobal = globalThis as TimerGlobal;

/**
 * Tracks the timers the tests schedule. A test that does not stop its own timer would otherwise keep it running into
 * the next test file, whose environment no longer holds the globals the timer reaches for, and the error would be
 * reported for a file that has nothing to do with it.
 */
if (timerGlobal.asbPendingTimers === undefined) {
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    const scheduleTimeout = globalThis.setTimeout.bind(globalThis);

    timerGlobal.asbPendingTimers = pendingTimers;

    const trackedSetTimeout = (callback: TimerHandler, delay?: number,
        ...args: unknown[]): ReturnType<typeof setTimeout> => {
        const id = scheduleTimeout(() => {
            pendingTimers.delete(id);

            if (typeof callback === "function") {
                (callback as (...callbackArgs: unknown[]) => void)(...args);
            }
        }, delay);

        pendingTimers.add(id);

        return id;
    };

    Object.defineProperty(globalThis, "setTimeout", { configurable: true, writable: true, value: trackedSetTimeout });
}

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

    // A test runs as a session unless it enters the demo itself.
    RunMode.enter(AppMode.Normal);
});

afterEach(() => {
    const pendingTimers = timerGlobal.asbPendingTimers;
    if (pendingTimers !== undefined) {
        for (const id of pendingTimers) {
            clearTimeout(id);
        }

        pendingTimers.clear();
    }
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

// jsdom does not implement the Popover API, which the dropdown menus toggle natively.
HTMLElement.prototype.hidePopover = vi.fn();
HTMLElement.prototype.showPopover = vi.fn();
HTMLElement.prototype.togglePopover = vi.fn();

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

class ResizeObserverMock {
    public observe = vi.fn();
    public unobserve = vi.fn();
    public disconnect = vi.fn();
}

Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    enumerable: true,
    value: ResizeObserverMock,
});
