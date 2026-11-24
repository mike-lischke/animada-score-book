/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { ITag, ITagCompletion } from "../../src/components/ui/framework/TagInput.js";
import { TagFilterBar, type IFilterGroup } from "../../src/ui/TagFilterBar.js";

const caixa: ITag = { id: 7, caption: "Caixa", colorIndex: 2 };
const surdo: ITag = { id: 8, caption: "Surdo", colorIndex: 3 };

const completions: ITagCompletion[] = [
    { caption: "Caixa", tagId: 7, owner: "Global" },
    { caption: "Surdo", tagId: 8, owner: "Bateria" },
];

interface IHandlers {
    onAddTag: Mock<(groupIndex: number, tagId: number) => void>;
    onRemoveTag: Mock<(groupIndex: number, tagId: number) => void>;
    onAddGroup: Mock<(groupIndex: number) => void>;
    onRemoveGroup: Mock<(groupIndex: number) => void>;
    onReset: Mock<() => void>;
}

interface IBarOptions {
    hasFilter?: boolean;

    /** How many scores the list holds; omit the property to model a list that is not known yet. */
    scoreCount?: number;

    /** Whether the list is still loading, which is the only case that names an unknown count. */
    countLoading?: boolean;
}

describe("TagFilterBar", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    /**
     * @param groups The filter rows to show.
     * @param options The filter state and the score count.
     *
     * @returns The handlers the bar reports to.
     */
    const renderBar = (groups: IFilterGroup[], options: IBarOptions = {}): IHandlers => {
        const hasFilter = options.hasFilter ?? groups.length > 0;
        const scoreCount = "scoreCount" in options ? options.scoreCount : 0;
        const countLoading = options.countLoading ?? false;

        const handlers: IHandlers = {
            onAddTag: vi.fn<(groupIndex: number, tagId: number) => void>(),
            onRemoveTag: vi.fn<(groupIndex: number, tagId: number) => void>(),
            onAddGroup: vi.fn<(groupIndex: number) => void>(),
            onRemoveGroup: vi.fn<(groupIndex: number) => void>(),
            onReset: vi.fn<() => void>(),
        };

        renderResult = render(
            <TagFilterBar
                groups={groups}
                completions={completions}
                scoreCount={scoreCount}
                countLoading={countLoading}
                hasFilter={hasFilter}
                {...handlers}
            />,
        );

        return handlers;
    };

    it("offers a first row to type into even while the filter is empty", () => {
        renderBar([]);

        expect(renderResult!.container.querySelector("#scoreFilterGroup")).toBeTruthy();
    });

    it("reports a tag committed into a row with the row it belongs to", () => {
        const handlers = renderBar([{ tags: [], unavailableNames: [] }]);

        const input = renderResult!.container.querySelector<HTMLInputElement>("#scoreFilterGroup input")!;
        fireEvent.input(input, { target: { value: "Caixa" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(handlers.onAddTag).toHaveBeenCalledWith(0, caixa.id);
    });

    it("opens the tag picker when the field takes the focus", async () => {
        renderBar([{ tags: [], unavailableNames: [] }]);

        const input = renderResult!.container.querySelector<HTMLInputElement>("#scoreFilterGroup input")!;
        fireEvent.focusIn(input);

        await waitFor(() => {
            expect(document.querySelectorAll(".tag-input-picker-pill")).toHaveLength(2);
        });
    });

    it("commits the tag a pill names", async () => {
        const handlers = renderBar([{ tags: [], unavailableNames: [] }]);

        const input = renderResult!.container.querySelector<HTMLInputElement>("#scoreFilterGroup input")!;
        fireEvent.focusIn(input);

        await waitFor(() => {
            expect(document.querySelectorAll(".tag-input-picker-pill")).toHaveLength(2);
        });

        const pills = document.querySelectorAll<HTMLElement>(".tag-input-picker-pill");
        pills[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

        expect(handlers.onAddTag).toHaveBeenCalledWith(0, surdo.id);
    });

    it("leaves a tag the row already holds out of the picker", async () => {
        renderBar([{ tags: [caixa], unavailableNames: [] }]);

        const input = renderResult!.container.querySelector<HTMLInputElement>("#scoreFilterGroup input")!;
        fireEvent.focusIn(input);

        await waitFor(() => {
            const pills = Array.from(document.querySelectorAll(".tag-input-picker-pill"), (pill) => {
                return pill.textContent;
            });

            expect(pills).toEqual(["Surdo"]);
        });
    });

    it("closes the picker again when the field loses the focus", async () => {
        renderBar([{ tags: [], unavailableNames: [] }]);

        const input = renderResult!.container.querySelector<HTMLInputElement>("#scoreFilterGroup input")!;
        fireEvent.focusIn(input);
        await waitFor(() => {
            expect(document.querySelector(".tag-input-picker")).toBeTruthy();
        });

        fireEvent.focusOut(input);
        await waitFor(() => {
            expect(document.querySelector(".tag-input-picker")).toBeNull();
        });
    });

    it("reports the tag a chip's close button takes off", () => {
        const handlers = renderBar([{ tags: [caixa], unavailableNames: [] }]);

        renderResult!.container.querySelector<HTMLButtonElement>("#scoreFilterGroup .tag-input-close-button")!
            .click();

        expect(handlers.onRemoveTag).toHaveBeenCalledWith(0, caixa.id);
    });

    it("shows the rows as a plain list, without a caption between them", () => {
        renderBar([
            { tags: [caixa], unavailableNames: [] },
            { tags: [surdo], unavailableNames: [] },
        ]);

        expect(renderResult!.container.querySelectorAll(".score-filter-row")).toHaveLength(2);
        expect(renderResult!.container.querySelectorAll(".score-filter-or")).toHaveLength(0);
        expect(renderResult!.container.textContent).not.toContain("OR");
    });

    it("appends a row below the one whose button was pressed", () => {
        const handlers = renderBar([
            { tags: [caixa], unavailableNames: [] },
            { tags: [surdo], unavailableNames: [] },
        ]);

        const addButtons = renderResult!.container.querySelectorAll<HTMLButtonElement>(".score-filter-group-add");
        addButtons[0].click();

        expect(handlers.onAddGroup).toHaveBeenCalledWith(0);
    });

    it("removes the row whose button was pressed", () => {
        const handlers = renderBar([
            { tags: [caixa], unavailableNames: [] },
            { tags: [surdo], unavailableNames: [] },
        ]);

        const removeButtons =
            renderResult!.container.querySelectorAll<HTMLButtonElement>(".score-filter-group-remove");
        removeButtons[1].click();

        expect(handlers.onRemoveGroup).toHaveBeenCalledWith(1);
    });

    it("keeps the last row from being removed", () => {
        renderBar([{ tags: [caixa], unavailableNames: [] }]);

        const remove = renderResult!.container.querySelector<HTMLButtonElement>(".score-filter-group-remove");
        expect(remove?.hasAttribute("disabled")).toBe(true);
    });

    it("names the tags a row holds that the catalogue no longer offers", () => {
        renderBar([{ tags: [caixa], unavailableNames: ["#12"] }]);

        expect(renderResult!.container.querySelector(".score-filter-missing")?.textContent)
            .toContain("Not available: #12");
    });

    it("counts the visible scores and pluralises them", () => {
        renderBar([], { scoreCount: 3 });
        expect(renderResult!.container.querySelector(".score-filter-count")?.textContent).toBe("3 scores");

        cleanup();
        renderBar([], { scoreCount: 1 });
        expect(renderResult!.container.querySelector(".score-filter-count")?.textContent).toBe("1 score");
    });

    it("says that the count is not known while the list loads", () => {
        renderBar([], { scoreCount: undefined, countLoading: true });

        expect(renderResult!.container.querySelector(".score-filter-count")?.textContent).toBe("Loading…");
    });

    it("shows no count while the list is neither loaded nor loading", () => {
        renderBar([], { scoreCount: undefined });

        expect(renderResult!.container.querySelector(".score-filter-count")).toBeNull();
    });

    it("resets the filter only while a condition is set", () => {
        const handlers = renderBar([{ tags: [caixa], unavailableNames: [] }]);

        renderResult!.container.querySelector<HTMLButtonElement>("#scoreFilterReset")!.click();
        expect(handlers.onReset).toHaveBeenCalledTimes(1);

        cleanup();
        renderBar([], { scoreCount: 2 });

        expect(renderResult!.container.querySelector("#scoreFilterReset")).toBeNull();
    });

    it("offers a reset while a row holds an unavailable tag", () => {
        renderBar([{ tags: [], unavailableNames: ["#12"] }], { hasFilter: false });

        expect(renderResult!.container.querySelector("#scoreFilterReset")).toBeTruthy();
    });
});
