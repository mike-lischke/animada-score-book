/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedSwitch, type ISegmentOption } from "../../src/components/ui/framework/SegmentedSwitch.js";

describe("SegmentedSwitch", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    const options: Array<ISegmentOption<string>> = [
        { value: "grid", label: "Grid", title: "Show the score as a note grid (G)" },
        { value: "staff", label: "Staff", title: "Show the score as staff notation (S)" },
    ];

    /**
     * @param value The value the switch marks as chosen.
     * @param className Extra class names for the switch.
     *
     * @returns The rendered switch and the callback it reports to.
     */
    const renderSwitch = (value: string, className?: string): {
        container: Element; onChange: ReturnType<typeof vi.fn>;
    } => {
        const onChange = vi.fn();
        renderResult = render(
            <SegmentedSwitch options={options} value={value} onChange={onChange} className={className} />,
        );

        return { container: renderResult.container, onChange };
    };

    /**
     * @param container The rendered switch.
     *
     * @returns The segment buttons, in display order.
     */
    const segments = (container: Element): HTMLElement[] => {
        return [...container.querySelectorAll<HTMLElement>(".segmented-switch-segment")];
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("renders a dot, a caption and a tooltip for every choice", () => {
        const { container } = renderSwitch("grid");
        const buttons = segments(container);

        expect(buttons.map((button) => {
            return button.querySelector(".segmented-switch-label")?.textContent;
        })).toEqual(["Grid", "Staff"]);
        expect(buttons.map((button) => {
            return button.getAttribute("title");
        })).toEqual(["Show the score as a note grid (G)", "Show the score as staff notation (S)"]);
        expect(buttons.every((button) => {
            return button.querySelector(".segmented-switch-dot") !== null;
        })).toBe(true);
    });

    it("marks the chosen choice alone", () => {
        const { container } = renderSwitch("staff");
        const buttons = segments(container);

        expect(buttons.map((button) => {
            return button.getAttribute("aria-pressed");
        })).toEqual(["false", "true"]);
        expect(buttons[0].classList.contains("is-selected")).toBe(false);
        expect(buttons[1].classList.contains("is-selected")).toBe(true);
    });

    it("reports the value of the clicked choice", () => {
        const { container, onChange } = renderSwitch("grid");

        fireEvent.click(segments(container)[1]);

        expect(onChange).toHaveBeenCalledWith("staff");
    });

    it("keeps the class names of its user", () => {
        const { container } = renderSwitch("grid", "track-view-mode-switch");

        expect(container.querySelector(".segmented-switch")?.classList.contains("track-view-mode-switch")).toBe(true);
    });

    it("puts the thumb under the chosen choice and follows a change", () => {
        const { container } = renderSwitch("grid");
        const buttons = segments(container);
        const thumb = container.querySelector<HTMLElement>(".segmented-switch-thumb")!;

        // jsdom measures nothing, so the test states the boxes of the choices itself.
        Object.defineProperty(buttons[0], "offsetLeft", { configurable: true, value: 3 });
        Object.defineProperty(buttons[0], "offsetWidth", { configurable: true, value: 63 });
        Object.defineProperty(buttons[1], "offsetLeft", { configurable: true, value: 68 });
        Object.defineProperty(buttons[1], "offsetWidth", { configurable: true, value: 67 });

        renderResult!.rerender(
            <SegmentedSwitch options={options} value="staff" onChange={() => {
                //
            }} />,
        );

        expect(thumb.style.left).toBe("68px");
        expect(thumb.style.width).toBe("67px");
        expect(thumb.classList.contains("is-placed")).toBe(true);
        expect(segments(container)[1].classList.contains("is-selected")).toBe(true);
    });
});
