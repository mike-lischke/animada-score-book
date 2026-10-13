/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ToolsBar } from "../../src/components/ui/Arrangement/ToolsBar.js";
import { RangeArticulationTool, requisitions } from "../../src/supplement/Requisitions.js";

/** A tool of the bar: how to name it, the mode it starts and the status it shows. */
interface IToolCase {
    tooltip: string;
    tool: RangeArticulationTool;
    caption: string;
    status: string;
}

const tools: IToolCase[] = [
    {
        tooltip: "Draw a crescendo hairpin",
        tool: RangeArticulationTool.Crescendo,
        caption: "Crescendo",
        status: "Click a note to place a crescendo",
    },
    {
        tooltip: "Draw a decrescendo hairpin",
        tool: RangeArticulationTool.Decrescendo,
        caption: "Decrescendo",
        status: "Click a note to place a decrescendo",
    },
    {
        tooltip: "Place forte (f)",
        tool: RangeArticulationTool.Forte,
        caption: "Forte",
        status: "Click a note or rest to place forte",
    },
];

describe("ToolsBar", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    /**
     * @param tooltip The tooltip naming the tool.
     *
     * @returns The button of that tool.
     */
    const toolButton = (tooltip: string): HTMLButtonElement => {
        return renderResult!.container.querySelector<HTMLButtonElement>(`button[title="${tooltip}"]`)!;
    };

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("matches the baseline snapshot with minimal props", () => {
        renderResult = render(<ToolsBar />);

        expect(renderResult.container.firstElementChild).toMatchSnapshot();
    });

    it("matches the baseline snapshot with all props set", () => {
        renderResult = render(<ToolsBar className="custom-range-tools" data-testid="range-tools" />);

        expect(renderResult.container.firstElementChild).toMatchSnapshot();
    });

    it("heads the bar and offers every tool", () => {
        renderResult = render(<ToolsBar />);

        expect(renderResult.container.querySelector(".toolsBarHeading")?.textContent).toBe("Tools");

        for (const entry of tools) {
            expect(toolButton(entry.tooltip).textContent).toContain(entry.caption);
        }
    });

    it("activates a mode and cancels before placement", async () => {
        const announced: RangeArticulationTool[] = [];
        const observer = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", observer);
        try {
            renderResult = render(<ToolsBar />);
            fireEvent.click(toolButton(tools[0].tooltip));

            await waitFor(() => {
                expect(renderResult?.container.textContent).toContain(tools[0].status);
            });

            expect(announced).toEqual([tools[0].tool]);

            const cancelButton = [...renderResult.container.querySelectorAll<HTMLButtonElement>("button")]
                .find((button) => {
                    return button.textContent === "Cancel";
                });
            expect(cancelButton).toBeTruthy();
            fireEvent.click(cancelButton!);
            await waitFor(() => {
                expect(announced).toEqual([tools[0].tool, RangeArticulationTool.None]);
                expect(renderResult?.container.textContent).not.toContain(tools[0].status);
            });
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", observer);
        }
    });

    it("names every tool in the status and marks only it as active", async () => {
        renderResult = render(<ToolsBar />);

        for (const entry of tools) {
            fireEvent.click(toolButton(entry.tooltip));

            await waitFor(() => {
                expect(toolButton(entry.tooltip).classList.contains("is-active")).toBe(true);
            });

            // The active tool carries the status dot the mockup shows, the others stay plain.
            expect(toolButton(entry.tooltip).querySelector(".toolsBarToolDot")).toBeTruthy();
            expect(renderResult.container.querySelector(".toolsModeStatus")?.textContent).toContain(entry.status);

            for (const other of tools) {
                if (other.tool !== entry.tool) {
                    expect(toolButton(other.tooltip).classList.contains("is-active")).toBe(false);
                    expect(toolButton(other.tooltip).querySelector(".toolsBarToolDot")).toBeNull();
                }
            }
        }
    });

    it("reports an active tool with the dot of the status", async () => {
        renderResult = render(<ToolsBar />);

        expect(renderResult.container.querySelector(".toolsModeStatus")).toBeNull();

        fireEvent.click(toolButton(tools[0].tooltip));

        await waitFor(() => {
            expect(renderResult?.container.querySelector(".toolsModeStatus")).toBeTruthy();
        });

        // Like the editing switch, the status states the mode it reports with a dot.
        expect(renderResult.container.querySelector(".toolsModeStatusDot")).toBeTruthy();
    });

    it("ends an active placing mode when the toolbar unmounts", async () => {
        const announced: RangeArticulationTool[] = [];
        const observer = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", observer);

        try {
            renderResult = render(<ToolsBar />);
            fireEvent.click(toolButton("Place forte (f)"));
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
