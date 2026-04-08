/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IUISettings } from "../../src/core/AppStorage.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe.sequential("Requisitions (class)", () => {
    beforeEach(() => {
        requisitions.unregister();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        requisitions.unregister();
    });

    it("deduplicates identical callbacks", () => {
        const callback = vi.fn((_settings: IUISettings) => {
            return Promise.resolve(true);
        });

        requisitions.register("settingsChanged", callback);
        requisitions.register("settingsChanged", callback);

        expect(requisitions.registrations("settingsChanged")).toBe(1);
    });

    it("executes later registrations before earlier ones", async () => {
        const calls: string[] = [];

        requisitions.register("settingsChanged", (_settings: IUISettings) => {
            calls.push("first");

            return Promise.resolve(false);
        });

        requisitions.register("settingsChanged", (_settings: IUISettings) => {
            calls.push("second");

            return Promise.resolve(true);
        });

        const handled = await requisitions.execute("settingsChanged", { theme: "Light+" });

        expect(calls).toEqual(["second", "first"]);
        expect(handled).toBe(true);
    });

    it("unregisters a single callback without removing others", async () => {
        const remaining = vi.fn((_settings: IUISettings) => {
            return Promise.resolve(true);
        });
        const removed = vi.fn((_settings: IUISettings) => {
            return Promise.resolve(false);
        });

        requisitions.register("settingsChanged", remaining);
        requisitions.register("settingsChanged", removed);
        requisitions.unregister("settingsChanged", removed);

        const handled = await requisitions.execute("settingsChanged", { theme: "Light+" });

        expect(requisitions.registrations("settingsChanged")).toBe(1);
        expect(removed).not.toHaveBeenCalled();
        expect(remaining).toHaveBeenCalledOnce();
        expect(handled).toBe(true);
    });

    it("clears registrations for a request type and globally", async () => {
        const callback = vi.fn((_settings: IUISettings) => {
            return Promise.resolve(true);
        });

        requisitions.register("settingsChanged", callback);
        requisitions.unregister("settingsChanged");

        expect(requisitions.registrations("settingsChanged")).toBe(0);
        await expect(requisitions.execute("settingsChanged", { theme: "Light+" })).resolves.toBe(false);

        requisitions.register("settingsChanged", callback);
        requisitions.unregister();

        expect(requisitions.registrations("settingsChanged")).toBe(0);
    });

    it("logs rejected callbacks and still reports handled when another callback succeeds", async () => {
        const error = new Error("boom");
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
            // Suppress expected test noise.
        });

        requisitions.register("settingsChanged", (_settings: IUISettings) => {
            return Promise.reject(error);
        });
        requisitions.register("settingsChanged", (_settings: IUISettings) => {
            return Promise.resolve(true);
        });

        const handled = await requisitions.execute("settingsChanged", { theme: "Light+" });

        expect(handled).toBe(true);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Requisition callback for request type settingsChanged failed with error:",
            error,
        );

        consoleErrorSpy.mockRestore();
    });
});
