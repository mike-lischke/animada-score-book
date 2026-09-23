/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntryModeButton } from "../../src/components/ui/Arrangement/EntryModeButton.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe.sequential("EntryModeButton", () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the button for one mode.
     *
     * @param entryMode The mode the app reports.
     * @param locked True while the mode cannot be switched, which is the case in the grid view.
     *
     * @returns The button's label element.
     */
    const renderButton = (entryMode: EditEntryMode, locked = false): HTMLLabelElement => {
        renderResult = render(<EntryModeButton entryMode={entryMode} locked={locked} />);

        return renderResult.container.querySelector<HTMLLabelElement>(".entryModeButton")!;
    };

    const unmountButton = (): void => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    };

    afterEach(() => {
        unmountButton();
        vi.restoreAllMocks();
    });

    it("shows the icon of each mode", () => {
        const insert = renderButton(EditEntryMode.Insert);
        const offIcon = insert.querySelector(".du-swap-off svg");
        const onIcon = insert.querySelector(".du-swap-on svg");

        expect(offIcon?.getAttribute("data-icon")).toBe("ArrowExpandRight");
        expect(onIcon?.getAttribute("data-icon")).toBe("SwapHorizontal");
        expect(offIcon?.getAttribute("width")).toBe("20px");
        expect(onIcon?.getAttribute("height")).toBe("20px");
    });

    it("marks the button while overwrite is in effect", () => {
        expect(renderButton(EditEntryMode.Insert).classList.contains("du-btn-primary")).toBe(false);

        unmountButton();

        expect(renderButton(EditEntryMode.Overwrite).classList.contains("du-btn-primary")).toBe(true);
    });

    it("keeps the mark in the grid view, where the mode cannot be switched", () => {
        expect(renderButton(EditEntryMode.Overwrite, true).classList.contains("du-btn-primary")).toBe(true);
    });

    it("posts the mode the user switched to", () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const button = renderButton(EditEntryMode.Insert);

        fireEvent.click(button.querySelector("input")!);

        expect(executeSpy).toHaveBeenCalledWith("editEntryModeChanged", EditEntryMode.Overwrite);
    });
});
