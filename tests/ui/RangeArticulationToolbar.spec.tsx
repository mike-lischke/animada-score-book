/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RangeArticulationToolbar } from "../../src/components/ui/Arrangement/RangeArticulationToolbar.js";
import { RangeArticulationTool, requisitions } from "../../src/supplement/Requisitions.js";

describe("RangeArticulationToolbar", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("matches the baseline snapshot with minimal props", () => {
        renderResult = render(<RangeArticulationToolbar />);

        expect(renderResult.container.firstElementChild).toMatchSnapshot();
    });

    it("matches the baseline snapshot with all props set", () => {
        renderResult = render(
            <RangeArticulationToolbar className="custom-range-tools" data-testid="range-tools" />,
        );

        expect(renderResult.container.firstElementChild).toMatchSnapshot();
    });

    it("activates a mode and cancels before placement", async () => {
        const announced: RangeArticulationTool[] = [];
        const observer = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", observer);
        try {
            renderResult = render(<RangeArticulationToolbar />);
            fireEvent.click(renderResult.container.querySelector<HTMLButtonElement>(
                "button[data-tooltip='Draw crescendo / decrescendo hairpin']",
            )!);

            await waitFor(() => {
                expect(renderResult?.container.textContent).toContain("Click a note to place a hairpin");
            });

            expect(announced).toEqual([RangeArticulationTool.Hairpin]);

            const cancelButton = [...renderResult.container.querySelectorAll<HTMLButtonElement>("button")]
                .find((button) => {
                    return button.textContent === "Cancel";
                });
            expect(cancelButton).toBeTruthy();
            fireEvent.click(cancelButton!);
            await waitFor(() => {
                expect(announced).toEqual([RangeArticulationTool.Hairpin, RangeArticulationTool.None]);
                expect(renderResult?.container.textContent).not.toContain("Click a note to place a hairpin");
            });
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", observer);
        }
    });

    it("ends an active placing mode when the toolbar unmounts", async () => {
        const announced: RangeArticulationTool[] = [];
        const observer = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", observer);

        try {
            renderResult = render(<RangeArticulationToolbar />);
            fireEvent.click(renderResult.container.querySelector<HTMLButtonElement>(
                "button[data-tooltip='Place forte (f)']",
            )!);
            await waitFor(() => {
                expect(announced).toEqual([RangeArticulationTool.Forte]);
            });

            renderResult.unmount();
            renderResult = null;

            expect(announced).toEqual([RangeArticulationTool.Forte, RangeArticulationTool.None]);
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", observer);
        }
    });
});
