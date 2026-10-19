/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArrangementModeBar } from "../../src/components/ui/Arrangement/ArrangementModeBar.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import { EditEntryMode, TrackViewMode } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("ArrangementModeBar", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * @param trackViewMode The view the app shows.
     * @param entryMode The entry mode, omitted outside the staff edit view.
     *
     * @returns The rendered bar and the callback it reports view changes to.
     */
    const renderBar = (trackViewMode: TrackViewMode, entryMode?: EditEntryMode): {
        container: Element; onTrackViewModeChange: ReturnType<typeof vi.fn>;
    } => {
        const onTrackViewModeChange = vi.fn();
        renderResult = render(
            <ArrangementModeBar
                trackViewMode={trackViewMode}
                entryMode={entryMode}
                onTrackViewModeChange={onTrackViewModeChange}
            />,
        );

        return { container: renderResult.container, onTrackViewModeChange };
    };

    /**
     * @param container The rendered bar.
     * @param title The tooltip the button carries.
     *
     * @returns The segment of that tooltip.
     */
    const segment = (container: Element, title: string): HTMLElement | null => {
        return container.querySelector<HTMLElement>(`#arrangementModeBar button[title="${title}"]`);
    };

    beforeEach(() => {
        AppStorage.clearUISettings();
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("heads the view switch and names the view's shortcuts", () => {
        const { container } = renderBar(TrackViewMode.Grid);

        expect([...container.querySelectorAll(".mode-bar-heading")].map((heading) => {
            return heading.textContent;
        })).toEqual(["View"]);
        expect(container.querySelectorAll(".segmented-switch")).toHaveLength(1);
        expect(container.querySelector(".mode-bar-divider")).toBeNull();

        expect(segment(container, "Show the score as a note grid (G)")?.getAttribute("aria-pressed")).toBe("true");
        expect(segment(container, "Show the score as staff notation (S)")?.getAttribute("aria-pressed")).toBe("false");
    });

    it("adds the entry switch while editing the staff view", () => {
        const { container } = renderBar(TrackViewMode.Staff, EditEntryMode.Insert);

        expect([...container.querySelectorAll(".mode-bar-heading")].map((heading) => {
            return heading.textContent;
        })).toEqual(["View", "Entry"]);
        expect(container.querySelectorAll(".segmented-switch")).toHaveLength(2);
        expect(container.querySelector(".mode-bar-divider")).not.toBeNull();

        expect(segment(container, "Enter notes by pushing the content behind the cursor (I)")
            ?.getAttribute("aria-pressed")).toBe("true");
        expect(segment(container, "Enter notes by replacing the content at the cursor (O)")
            ?.getAttribute("aria-pressed")).toBe("false");
    });

    it("reports the view the user chooses", () => {
        const { container, onTrackViewModeChange } = renderBar(TrackViewMode.Grid);

        fireEvent.click(segment(container, "Show the score as staff notation (S)")!);
        expect(onTrackViewModeChange).toHaveBeenCalledWith(TrackViewMode.Staff);

        fireEvent.click(segment(container, "Show the score as a note grid (G)")!);
        expect(onTrackViewModeChange).toHaveBeenCalledWith(TrackViewMode.Grid);
    });

    it("posts the entry mode the user chooses", () => {
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const { container } = renderBar(TrackViewMode.Staff, EditEntryMode.Overwrite);

        fireEvent.click(segment(container, "Enter notes by pushing the content behind the cursor (I)")!);

        expect(executeSpy).toHaveBeenCalledWith("editEntryModeChanged", EditEntryMode.Insert);
    });
});
