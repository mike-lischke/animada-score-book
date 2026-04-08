/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IUISettings } from "../../src/core/AppStorage.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SettingsDialog } from "../../src/ui/SettingsDialog.js";

interface ISettingsDialogTestInstance extends SettingsDialog {
    dialogRef: { current: { open: () => void; } | null; };
    handleClose: (returnValue: string) => void;
    temporarySettingsChange: () => void;
}

const installSynchronousSetState = (dialog: SettingsDialog): void => {
    const instance = dialog as SettingsDialog & {
        setState: (update: Partial<SettingsDialog["state"]>, callback?: () => void) => void;
    };

    instance.setState = ((update: Partial<SettingsDialog["state"]>, callback?: () => void) => {
        instance.state = { ...instance.state, ...update };
        callback?.();
    }) as typeof instance.setState;
};

describe.sequential("SettingsDialog (class)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("open loads settings, applies the default theme, and opens the dialog", () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({
            viewSettings: { arrangementViewSettings: { zoomLevel: 120 } },
        });

        const dialog = new SettingsDialog({}) as ISettingsDialogTestInstance;
        const openSpy = vi.fn();
        installSynchronousSetState(dialog);
        dialog.dialogRef.current = { open: openSpy };

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

        const dialog = new SettingsDialog({}) as ISettingsDialogTestInstance;
        installSynchronousSetState(dialog);
        dialog.state = {
            currentSettings: {
                theme: "Light+",
                viewSettings: { arrangementViewSettings: { zoomLevel: 130 } },
            },
            previousSettings: JSON.parse(JSON.stringify(originalSettings)) as IUISettings,
        };

        dialog.handleClose("cancel");
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

        const dialog = new SettingsDialog({}) as ISettingsDialogTestInstance;
        installSynchronousSetState(dialog);
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

        dialog.handleClose("save");

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

        const dialog = new SettingsDialog({}) as ISettingsDialogTestInstance;
        dialog.state = {
            currentSettings: {
                theme: "Solarized Light",
                viewSettings: { arrangementViewSettings: { zoomLevel: 105 } },
            },
            previousSettings: {},
        };

        dialog.temporarySettingsChange();

        expect(executeSpy).toHaveBeenCalledWith("settingsChanged", {
            theme: "Solarized Light",
            viewSettings: { arrangementViewSettings: { zoomLevel: 105 } },
        });
    });
});
