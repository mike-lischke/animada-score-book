/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IUISettings } from "../../src/core/AppStorage.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import * as utils from "../../src/core/utils.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SettingsDialog } from "../../src/ui/SettingsDialog.js";

class TestableSettingsDialog extends SettingsDialog {
    public testHandleClose(returnValue: string): void {
        // @ts-expect-error, because we are accessing a private method.
        this.handleClose(returnValue);
    }

    public testTemporarySettingsChange(): void {
        // @ts-expect-error, because we are accessing a private method.
        this.temporarySettingsChange();
    }

    public testSetDialogOpenHandler(open: () => void): void {
        // @ts-expect-error, because we are accessing a private field.
        this.dialogRef.current = { open };
    }
}

const installSynchronousSetState = (dialog: TestableSettingsDialog): void => {
    const instance = dialog as TestableSettingsDialog & {
        setState: (update: Partial<SettingsDialog["state"]>, callback?: () => void) => void;
    };

    instance.setState = ((update: Partial<SettingsDialog["state"]>, callback?: () => void) => {
        instance.state = { ...instance.state, ...update };
        callback?.();
    }) as typeof instance.setState;
};

describe.sequential("SettingsDialog (class)", () => {
    let renderResult: RenderResult | null;

    const createDialog = (): TestableSettingsDialog => {
        const dialog = new TestableSettingsDialog({});
        installSynchronousSetState(dialog);

        return dialog;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        let nextId = 3;
        vi.spyOn(utils, "getNewId").mockImplementation(() => {
            return nextId++;
        });
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("open loads settings, applies the default theme, and opens the dialog", () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({
            viewSettings: { arrangementViewSettings: { zoomLevel: 120 } },
        });

        const dialog = createDialog();
        const openSpy = vi.fn();
        dialog.testSetDialogOpenHandler(openSpy);

        dialog.open();

        expect(dialog.state.currentSettings).toEqual({
            theme: "Light+",
            viewSettings: { arrangementViewSettings: { zoomLevel: 120 } },
        });
        expect(dialog.state.previousSettings).toEqual({
            viewSettings: { arrangementViewSettings: { zoomLevel: 120 } },
        });
        expect(openSpy).toHaveBeenCalledOnce();
    });

    it("cancel restores previous settings and notifies listeners with a cloned snapshot", async () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const originalSettings: IUISettings = {
            theme: "Dark+",
            viewSettings: { arrangementViewSettings: { zoomLevel: 90 } },
        };

        const dialog = createDialog();
        dialog.state = {
            currentSettings: {
                theme: "Light+",
                viewSettings: { arrangementViewSettings: { zoomLevel: 130 } },
            },
            previousSettings: JSON.parse(JSON.stringify(originalSettings)) as IUISettings,
        };

        dialog.testHandleClose("cancel");
        await Promise.resolve();

        expect(dialog.state.currentSettings).toEqual(originalSettings);
        expect(dialog.state.currentSettings).not.toBe(dialog.state.previousSettings);
        expect(executeSpy).toHaveBeenCalledWith("settingsChanged", {
            theme: "Dark+",
            viewSettings: { arrangementViewSettings: { zoomLevel: 90 } },
        });
    });

    it("save persists current settings and refreshes previous settings without notifying", () => {
        const saveSpy = vi.spyOn(AppStorage, "saveUISettings").mockImplementation(() => {
            // Prevent localStorage writes during the test.
        });
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);

        const dialog = createDialog();
        dialog.state = {
            currentSettings: {
                theme: "Quiet Light",
                viewSettings: { arrangementViewSettings: { zoomLevel: 110 } },
            },
            previousSettings: {
                theme: "Light+",
                viewSettings: { arrangementViewSettings: { zoomLevel: 100 } },
            },
        };

        dialog.testHandleClose("save");

        expect(saveSpy).toHaveBeenCalledWith({
            theme: "Quiet Light",
            viewSettings: { arrangementViewSettings: { zoomLevel: 110 } },
        });
        expect(dialog.state.previousSettings).toEqual(dialog.state.currentSettings);
        expect(dialog.state.previousSettings).not.toBe(dialog.state.currentSettings);
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it("temporarySettingsChange forwards the current settings to requisitions", () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);

        const dialog = createDialog();
        dialog.state = {
            currentSettings: {
                theme: "Solarized Light",
                viewSettings: { arrangementViewSettings: { zoomLevel: 105 } },
            },
            previousSettings: {},
        };

        dialog.testTemporarySettingsChange();

        expect(executeSpy).toHaveBeenCalledWith("settingsChanged", {
            theme: "Solarized Light",
            viewSettings: { arrangementViewSettings: { zoomLevel: 105 } },
        });
    });

    it("renders the settings dialog structure", () => {
        renderResult = render(<TestableSettingsDialog />);

        expect(renderResult.container.querySelector("#settingsDialog")).toBeTruthy();
        expect(renderResult.container.querySelector("#settingsGrid")).toBeTruthy();
        expect(renderResult.container.querySelector("#settings-button-cancel")).toBeTruthy();
        expect(renderResult.container.querySelector("#settings-button-save")).toBeTruthy();
    });

    it("matches snapshot for default rendering", () => {
        let nextId = 1;
        vi.spyOn(utils, "getNewId").mockImplementation(() => {
            return nextId++;
        });

        renderResult = render(<TestableSettingsDialog />);

        expect(renderResult.container.firstElementChild).toMatchSnapshot();
    });
});
