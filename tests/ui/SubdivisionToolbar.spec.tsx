/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SubdivisionToolbar } from "../../src/components/ui/Arrangement/SubdivisionToolbar.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";

const triggerButton = (container: Element): HTMLButtonElement => {
    return container.querySelector<HTMLButtonElement>("button")!;
};

describe.sequential("SubdivisionToolbar", () => {
    let renderResult: RenderResult | null;
    let selectionManager: SelectionManager;

    beforeEach(() => {
        renderResult = null;
        selectionManager = new SelectionManager();
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders a disabled creation dropdown when nothing is selected", () => {
        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("enables the dropdown for a single note selection", () => {
        selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 7,
            startStep: 0,
            endStep: 0,
        });

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(false);

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const duplet = dropdownItems.find((item) => {
            return item.textContent === "Duplet";
        });
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(duplet?.getAttribute("aria-disabled")).toBeNull();
        expect(triplet?.getAttribute("aria-disabled")).toBe("true");
    });

    it("allows tuplets that fit inside a selected subdivision slot", () => {
        selectionManager.selectSingleNote({
            granularity: SelectionGranularity.Note,
            bar: 1,
            trackId: 7,
            startStep: 0,
            endStep: 0,
            start: { numerator: 1, denominator: 24 },
        });

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(triplet?.getAttribute("aria-disabled")).toBeNull();
    });

    it("enables the dropdown for a contiguous selection within one track", () => {
        const entries: ISelectionEntry[] = [0, 1].map((step) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: 7,
                startStep: step,
                endStep: step,
            };
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(false);
    });

    it("disables the dropdown for a selection that spans multiple tracks", () => {
        const entries: ISelectionEntry[] = [7, 8].map((trackId) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId,
                startStep: 0,
                endStep: 0,
            };
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        expect(triggerButton(renderResult.container).disabled).toBe(true);
    });

    it("keeps subdivisions in the menu but disables those exceeding two notes per grid cell", () => {
        const entries: ISelectionEntry[] = [0, 1, 2].map((step) => {
            return {
                granularity: SelectionGranularity.Note,
                bar: 1,
                trackId: 7,
                startStep: step,
                endStep: step,
            };
        });

        selectionManager.replaceSelection(entries);

        renderResult = render(
            <SubdivisionToolbar selectionManager={selectionManager} />,
        );

        const dropdownItems = [...renderResult.container.querySelectorAll<HTMLAnchorElement>("a")];
        const nontuplet = dropdownItems.find((item) => {
            return item.textContent === "Nontuplet";
        });
        const triplet = dropdownItems.find((item) => {
            return item.textContent === "Triplet";
        });

        expect(nontuplet?.getAttribute("aria-disabled")).toBe("true");
        expect(triplet?.getAttribute("aria-disabled")).toBeNull();
    });
});
