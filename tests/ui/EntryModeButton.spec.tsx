/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntryModeButton } from "../../src/components/ui/Arrangement/EntryModeButton.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("EntryModeButton", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the button for one mode.
     *
     * @param entryMode The mode the app reports.
     *
     * @returns The rendered button.
     */
    const renderButton = (entryMode: EditEntryMode): HTMLButtonElement => {
        renderResult = render(<EntryModeButton entryMode={entryMode} />);

        return renderResult.container.querySelector<HTMLButtonElement>(".entryModeButton")!;
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

    it("names the mode it holds", () => {
        expect(renderButton(EditEntryMode.Insert).querySelector(".entryModeLabel")?.textContent).toBe("Insert");

        unmountButton();

        expect(renderButton(EditEntryMode.Overwrite).querySelector(".entryModeLabel")?.textContent).toBe("Overwrite");
    });

    it("marks the button while overwrite is in effect", () => {
        expect(renderButton(EditEntryMode.Insert).classList.contains("is-active")).toBe(false);

        unmountButton();

        expect(renderButton(EditEntryMode.Overwrite).classList.contains("is-active")).toBe(true);
    });

    it("posts the mode the user switched to", () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const button = renderButton(EditEntryMode.Insert);

        fireEvent.click(button);

        expect(executeSpy).toHaveBeenCalledWith("editEntryModeChanged", EditEntryMode.Overwrite);

        unmountButton();

        fireEvent.click(renderButton(EditEntryMode.Overwrite));

        expect(executeSpy).toHaveBeenCalledWith("editEntryModeChanged", EditEntryMode.Insert);
    });
});
