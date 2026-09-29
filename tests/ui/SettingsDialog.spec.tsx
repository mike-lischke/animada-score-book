/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IUISettings } from "../../src/core/AppStorage.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import { SmuflGlyph, SmuflGlyphs } from "../../src/core/smufl/SmuflGlyphs.js";
import { SmuflFontFormat } from "../../src/core/smufl/SmuflFonts.js";
import type { ISmuflFontChoice, SmuflFontLoader } from "../../src/core/smufl/SmuflFontLoader.js";
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

    public testSelectFont(id: string): Promise<void> {
        // @ts-expect-error, because we are accessing a private method.
        return this.selectFont(id);
    }

    public testFontInfoEnter(): void {
        // @ts-expect-error, because we are accessing a private method.
        this.handleFontInfoEnter();
    }

    public testSetDialogOpenHandler(open: () => void): void {
        // @ts-expect-error, because we are accessing a private field.
        this.dialogRef.current = { open };
    }
}

/**
 * Builds one catalogue entry, which is all the font row needs to render a font.
 *
 * @param id The font's id.
 * @param name The font's name.
 * @param isDefault Whether this is the catalogue's default font.
 *
 * @returns The font as the loader would offer it.
 */
const createFontChoice = (id: string, name: string, isDefault = false): ISmuflFontChoice => {
    return {
        id,
        name,
        file: `${name}.woff2`,
        format: SmuflFontFormat.Woff2,
        metadata: `${name}-metadata.json`,
        version: "1.0",
        copyright: `Copyright (c) ${name}.`,
        license: { spdx: "OFL-1.1", file: `${name}-OFL.txt` },
        source: `https://example.com/${id}`,
        isDefault,
        fontFamily: `"${name}", "Bravura"`,
    };
};

/**
 * Builds a loader stub that offers the given fonts and remembers the one it was switched to.
 *
 * @param choices The fonts to offer.
 * @param activeId The font to start with.
 *
 * @returns The stub, which only implements what the dialog uses, and its spies.
 */
const createFontLoader = (choices: ISmuflFontChoice[], activeId = choices[0]?.id) => {
    let active = activeId;

    const select = vi.fn((id?: string) => {
        const target = id ?? choices[0]?.id;
        if (!choices.some((choice) => {
            return choice.id === target;
        })) {
            return Promise.resolve(false);
        }

        active = target;

        return Promise.resolve(true);
    });

    const preload = vi.fn(() => {
        return Promise.resolve();
    });

    const loader = {
        choices,
        get activeId(): string | undefined {
            return active;
        },
        select,
        preload,
    } as unknown as SmuflFontLoader;

    return { loader, select, preload };
};

const fontChoices: ISmuflFontChoice[] = [
    createFontChoice("bravura", "Bravura", true),
    createFontChoice("leipzig", "Leipzig"),
];

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

    const createDialog = (fontLoader?: SmuflFontLoader): TestableSettingsDialog => {
        const dialog = new TestableSettingsDialog({ fontLoader: fontLoader ?? createFontLoader(fontChoices).loader });
        installSynchronousSetState(dialog);

        return dialog;
    };

    /**
     * Renders the dialog and opens it, which is the only state in which its content exists.
     *
     * @param fontLoader The loader the dialog takes the music fonts from.
     *
     * @returns The dialog that was rendered.
     */
    const openDialog = async (fontLoader: SmuflFontLoader): Promise<TestableSettingsDialog> => {
        const dialogRef = createRef<TestableSettingsDialog>();
        const Wrapper: FunctionComponent = () => {
            return <TestableSettingsDialog ref={dialogRef} fontLoader={fontLoader} />;
        };

        renderResult = render(<Wrapper />);
        dialogRef.current?.open();

        await waitFor(() => {
            expect(document.body.querySelector("#settingsDialog")).toBeTruthy();
        });

        return dialogRef.current!;
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
            fontChoices: [],
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
            fontChoices: [],
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
            fontChoices: [],
        };

        dialog.testTemporarySettingsChange();

        expect(executeSpy).toHaveBeenCalledWith("settingsChanged", {
            theme: "Solarized Light",
            viewSettings: { arrangementViewSettings: { zoomLevel: 105 } },
        });
    });

    it("renders the settings dialog structure", async () => {
        await openDialog(createFontLoader(fontChoices).loader);

        expect(document.body.querySelector(".form-card")).toBeTruthy();
        expect(document.body.querySelector("#settings-button-cancel")).toBeTruthy();
        expect(document.body.querySelector("#settings-button-save")).toBeTruthy();
        expect(document.body.querySelector("#autoExtendOnOverflow")).toBeTruthy();
    });

    it("matches a snapshot of the offered settings", async () => {
        let nextId = 1;
        vi.spyOn(utils, "getNewId").mockImplementation(() => {
            return nextId++;
        });

        await openDialog(createFontLoader(fontChoices).loader);

        // The settings only exist while the dialog is open. Their labels are what a new setting changes,
        // and they stay readable, unlike the whole dialog markup of the portal.
        const labels = [...document.body.querySelectorAll("#settingsDialog .form-row-label")];

        expect(labels.map((label) => {
            return label.textContent;
        })).toMatchSnapshot();
    });

    it("samples every music font next to its name", async () => {
        await openDialog(createFontLoader(fontChoices).loader);

        const samples = [...document.body.querySelectorAll("#settingsDialog .music-font-sample")];

        expect(samples).toHaveLength(fontChoices.length);
        expect(samples[0].querySelectorAll(".smufl-glyph-view")).toHaveLength(6);
        expect(samples[0].querySelectorAll(".music-font-sample-staff line")).toHaveLength(2);
        expect(samples[0].querySelector("text")?.textContent)
            .toBe(String.fromCodePoint(SmuflGlyphs.definition(SmuflGlyph.UnpitchedPercussionClef1).codepoint));

        // The sample draws in the font it samples, not in the score's font.
        expect(samples[1].querySelector("text")?.getAttribute("style")).toContain("\"Leipzig\", \"Bravura\"");
    });

    it("describes the font that is in use, including its licence", async () => {
        const dialog = await openDialog(createFontLoader(fontChoices).loader);

        dialog.testFontInfoEnter();

        await waitFor(() => {
            expect(document.body.querySelector("#musicFontInfo")).toBeTruthy();
        });

        const info = document.body.querySelector("#musicFontInfo");

        expect(info?.textContent).toContain("Bravura");
        expect(info?.textContent).toContain("1.0");
        expect(info?.textContent).toContain("Copyright (c) Bravura.");
        expect(info?.textContent).toContain("OFL-1.1");
        expect(info?.textContent).toContain("https://example.com/bravura");
    });

    it("switches the font when one is picked and keeps it as the pending setting", async () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const { loader, select } = createFontLoader(fontChoices);
        const dialog = createDialog(loader);

        await dialog.testSelectFont("leipzig");

        expect(select).toHaveBeenCalledWith("leipzig");
        expect(dialog.state.currentSettings.musicFont).toBe("leipzig");
        expect(executeSpy).toHaveBeenCalledWith("settingsChanged", expect.objectContaining({
            musicFont: "leipzig",
        }));
    });

    it("keeps a font that does not load out of the settings", async () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const dialog = createDialog(createFontLoader(fontChoices).loader);

        await dialog.testSelectFont("vanished");

        expect(dialog.state.currentSettings.musicFont).toBeUndefined();
        expect(executeSpy).toHaveBeenCalledWith("showError", "The selected music font could not be loaded.");
    });

    it("puts the previewed font back when the dialog is cancelled", async () => {
        const { loader, select } = createFontLoader(fontChoices, "leipzig");
        const dialog = createDialog(loader);
        dialog.state = {
            currentSettings: { musicFont: "leipzig" },
            previousSettings: { musicFont: "bravura" },
            fontChoices,
        };

        dialog.testHandleClose("cancel");
        await Promise.resolve();

        expect(select).toHaveBeenCalledWith("bravura");
    });
});
