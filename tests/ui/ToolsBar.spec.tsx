/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult, waitFor } from "@testing-library/preact";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
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

/** Width of the full bar and of its compact form, as the layout mocks report them. */
const expandedWidth = 488;
const compactWidth = 200;

/** The overlay width the current test offers. */
let overlayWidth = 600;

/** The layout properties jsdom cannot compute, replaced while this file runs. */
const layoutProperties = ["offsetParent", "clientWidth", "clientHeight", "offsetWidth", "offsetHeight"] as const;

/** Original property descriptors, restored after the file. */
const originalLayout = new Map<string, PropertyDescriptor | undefined>();

const installLayoutMocks = (): void => {
    for (const name of layoutProperties) {
        originalLayout.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
    }

    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
        configurable: true,
        get(): HTMLElement | null {
            const element = this as HTMLElement;

            return element.parentElement;
        },
    });

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get(): number {
            const element = this as HTMLElement;

            return element.hasAttribute("data-test-overlay") ? overlayWidth : 0;
        },
    });

    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get(): number {
            const element = this as HTMLElement;

            return element.hasAttribute("data-test-overlay") ? 600 : 0;
        },
    });

    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get(): number {
            const element = this as HTMLElement;
            const compact = element.querySelector(".toolsBarOverflowMenu") !== null;
            if (element.classList.contains("toolsBar") || element.id === "toolsBarHost") {
                return compact ? compactWidth : expandedWidth;
            }

            return 0;
        },
    });

    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(): number {
            const element = this as HTMLElement;

            return element.classList.contains("toolsBar") || element.id === "toolsBarHost" ? 42 : 0;
        },
    });
};

const restoreLayout = (): void => {
    for (const name of layoutProperties) {
        const descriptor = originalLayout.get(name);
        if (descriptor) {
            Object.defineProperty(HTMLElement.prototype, name, descriptor);
        }
    }
};

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

    /**
     * @param width The room the overlay offers.
     *
     * @returns The bar inside an overlay of that width.
     */
    const renderInOverlay = (width: number): Element => {
        overlayWidth = width;
        renderResult = render(<div data-test-overlay>
            <ToolsBar />
        </div>);

        return renderResult.container;
    };

    /**
     * @returns The bar the user sees, not the hidden measuring twin.
     */
    const visibleBar = (): Element => {
        return renderResult!.container.querySelector("#toolsBarHost > .toolsBar")!;
    };

    beforeAll(() => {
        installLayoutMocks();
    });

    afterAll(() => {
        restoreLayout();
    });

    beforeEach(() => {
        renderResult = null;
        overlayWidth = 600;
        AppStorage.clearUISettings();
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

    it("matches the compact snapshot", () => {
        renderInOverlay(400);

        expect(visibleBar()).toMatchSnapshot();
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

    it("folds the tools into the overflow menu when the full bar does not fit", () => {
        renderInOverlay(400);

        expect(visibleBar().querySelector(".toolsBarHeading")).toBeTruthy();
        expect(visibleBar().querySelector(".toolsBarOverflowMenu")).toBeTruthy();
        expect(visibleBar().querySelector(".toolsBarTool")).toBeNull();

        // The hidden twin still renders the full bar, so the next fit can be measured.
        const probe = renderResult!.container.querySelector(".toolsBarMeasure")!;
        expect(probe.querySelectorAll(".toolsBarTool").length).toBe(3);

        const items = Array.from(visibleBar().querySelectorAll(".toolsBarOverflowMenu li"));
        expect(items[0].textContent.trim()).toBe("Crescendo");
        expect(items[1].textContent.trim()).toBe("Decrescendo");
        // The forte row carries the score symbol's glyph beside its caption.
        expect(items[2].textContent).toContain("Forte");
    });

    it("keeps the full bar while it fits", () => {
        renderInOverlay(600);

        expect(visibleBar().querySelectorAll(".toolsBarTool").length).toBe(3);
        expect(visibleBar().querySelector(".toolsBarOverflowMenu")).toBeNull();
        expect(renderResult!.container.querySelector(".toolsBarMeasure")).toBeNull();
    });

    it("moves the bar left until it fits", () => {
        AppStorage.saveSetting("toolsBarPosition", { x: 500, y: 6 });
        renderInOverlay(600);

        const host = renderResult!.container.querySelector<HTMLElement>("#toolsBarHost")!;
        expect(host.style.left).toBe(`${overlayWidth - expandedWidth - 12}px`);
        expect(host.style.top).toBe("6px");
    });

    it("starts a placing mode from the compact menu and marks it", async () => {
        const announced: RangeArticulationTool[] = [];
        const observer = (tool: RangeArticulationTool): Promise<boolean> => {
            announced.push(tool);

            return Promise.resolve(true);
        };

        requisitions.register("rangeArticulationToolChanged", observer);
        try {
            renderInOverlay(400);
            const links = visibleBar().querySelectorAll<HTMLAnchorElement>(".toolsBarOverflowMenu li > a");

            fireEvent.click(links[1]);

            await waitFor(() => {
                expect(renderResult?.container.querySelector(".toolsModeStatus")?.textContent)
                    .toContain(tools[1].status);
            });

            expect(announced).toEqual([RangeArticulationTool.Decrescendo]);
            expect(renderResult!.container.querySelector(".toolsBarOverflowDot")).toBeTruthy();

            const items = Array.from(visibleBar().querySelectorAll(".toolsBarOverflowMenu li"));
            expect(items[1].textContent.trim()).toBe("DecrescendoOn");
            expect(items[0].textContent.trim()).toBe("Crescendo");
        } finally {
            requisitions.unregister("rangeArticulationToolChanged", observer);
        }
    });
});
