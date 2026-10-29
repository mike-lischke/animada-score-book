/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { createRef } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    BarActionKind, BarActionStrip, type IBarActionStripProps,
} from "../../src/components/ui/Arrangement/BarActionStrip.js";
import type { IRepeatBar } from "../../src/core/types/general.js";

/** The actions every bar offers, in the order the strip draws them. */
const actionOrder = ["insert-left", "clear", "delete", "duplicate", "repeat-start", "repeat-end", "insert-right"];

describe("BarActionStrip", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the strip of a three-bar score in edit mode. The scrolling host and the action viewport are left
     * out, which is what the strip reads as "not laid out yet".
     *
     * @param props The properties that deviate from that baseline.
     *
     * @returns The rendered strip.
     */
    const renderStrip = (props: Partial<IBarActionStripProps> = {}): RenderResult => {
        renderResult = render(
            <BarActionStrip
                barCount={3}
                canDelete
                scrollHostRef={createRef<HTMLDivElement | null>()}
                actionViewportRef={createRef<HTMLDivElement | null>()}
                barCenters={() => {
                    return new Map();
                }}
                onBarAction={vi.fn()}
                {...props}
            />,
        );

        return renderResult;
    };

    /**
     * @param container The rendered strip.
     * @param bar The 1-based bar whose group is wanted.
     *
     * @returns The buttons of that bar, in the order they appear.
     */
    const buttonsOf = (container: Element, bar: number): HTMLButtonElement[] => {
        const group = container.querySelectorAll(".bar-action-group")[bar - 1];

        return [...group.querySelectorAll<HTMLButtonElement>(".bar-action-button")];
    };

    /**
     * @param container The rendered strip.
     * @param bar The 1-based bar whose group is wanted.
     * @param action The `data-action` key of the wanted button.
     *
     * @returns The button that carries that action.
     */
    const buttonOf = (container: Element, bar: number, action: string): HTMLButtonElement => {
        return buttonsOf(container, bar).find((button) => {
            return button.dataset.action === action;
        })!;
    };

    const unmountStrip = (): void => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    };

    afterEach(() => {
        unmountStrip();
    });

    it("offers one group of the same actions per bar", () => {
        const { container } = renderStrip();

        expect(container.querySelectorAll(".bar-action-group")).toHaveLength(3);

        for (const bar of [1, 2, 3]) {
            expect(buttonsOf(container, bar).map((button) => {
                return button.dataset.action;
            })).toEqual(actionOrder);
        }
    });

    it("disables the delete action only while the score cannot lose the bar", () => {
        const lastBar = renderStrip({ barCount: 1, canDelete: false });
        expect(buttonOf(lastBar.container, 1, "delete").disabled).toBe(true);

        unmountStrip();

        const manyBars = renderStrip({ canDelete: true });
        expect(buttonOf(manyBars.container, 2, "delete").disabled).toBe(false);
    });

    it("disables the repeat starts that no counterpart can pair with", () => {
        const { container } = renderStrip();

        // A section that opens needs a bar after it that closes it. A closing repeat stands alone: it repeats
        // from the bar the section opened at, or from the first bar where no bar opens one.
        expect(buttonOf(container, 1, "repeat-start").disabled).toBe(false);
        expect(buttonOf(container, 1, "repeat-end").disabled).toBe(false);
        expect(buttonOf(container, 3, "repeat-start").disabled).toBe(true);
        expect(buttonOf(container, 3, "repeat-end").disabled).toBe(false);

        // A bar with bars on both sides can do both.
        expect(buttonOf(container, 2, "repeat-start").disabled).toBe(false);
        expect(buttonOf(container, 2, "repeat-end").disabled).toBe(false);
    });

    it("draws the repeat marks the bars carry as pressed", () => {
        const repeatBars = new Map<number, IRepeatBar>([[1, { start: true }], [3, { end: true }]]);
        const { container } = renderStrip({ repeatBars });

        expect(buttonOf(container, 1, "repeat-start").classList.contains("du-btn-primary")).toBe(true);
        expect(buttonOf(container, 1, "repeat-end").classList.contains("du-btn-primary")).toBe(false);
        expect(buttonOf(container, 3, "repeat-end").classList.contains("du-btn-primary")).toBe(true);
        expect(buttonOf(container, 2, "repeat-start").classList.contains("du-btn-primary")).toBe(false);
        expect(buttonOf(container, 2, "repeat-end").classList.contains("du-btn-primary")).toBe(false);
    });

    it("reports the action and the bar of the button that was pressed", () => {
        const onBarAction = vi.fn();
        const { container } = renderStrip({ onBarAction });

        buttonOf(container, 2, "repeat-start").click();
        expect(onBarAction).toHaveBeenLastCalledWith(2, BarActionKind.RepeatStart);

        buttonOf(container, 3, "repeat-end").click();
        expect(onBarAction).toHaveBeenLastCalledWith(3, BarActionKind.RepeatEnd);

        buttonOf(container, 1, "duplicate").click();
        expect(onBarAction).toHaveBeenLastCalledWith(1, BarActionKind.Duplicate);
    });
});
