/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScoreNavigator } from "../../src/components/ui/Navigation/ScoreNavigator.js";
import type { IScoreViewport } from "../../src/supplement/Requisitions.js";

/** The rail width the tests lay out with, in CSS px. */
const railWidth = 400;

describe("ScoreNavigator", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the navigator and gives its rail a measurable geometry, which jsdom does not provide.
     *
     * @param viewport The viewport the navigator shows.
     * @param onMove Receives the positions the navigator reports.
     * @param barCount The number of measures to draw.
     *
     * @returns The rail element.
     */
    const renderNavigator = (viewport: IScoreViewport, onMove: (position: number) => void,
        barCount = 4): HTMLDivElement => {
        renderResult = render(<ScoreNavigator barCount={barCount} viewport={viewport} onMove={onMove} />);

        const rail = renderResult.container.querySelector<HTMLDivElement>(".scoreNavigator")!;
        rail.getBoundingClientRect = () => {
            return {
                x: 0, y: 0, width: railWidth, height: 20,
                top: 0, right: railWidth, bottom: 20, left: 0,
                toJSON: () => {
                    return {};
                },
            };
        };

        // jsdom does not implement pointer capture.
        rail.setPointerCapture = (): void => {
            // Nothing to do.
        };

        return rail;
    };

    const windowOf = (rail: HTMLDivElement): HTMLDivElement => {
        return rail.querySelector<HTMLDivElement>(".scoreNavigatorWindow")!;
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("draws one tick per measure and a window for the viewport", () => {
        const rail = renderNavigator({ position: 0.5, width: 0.25, startBar: 2, endBar: 2 }, vi.fn());

        expect(rail.querySelectorAll(".scoreNavigatorTick")).toHaveLength(4);
        expect(windowOf(rail).style.left).toBe("37.5%");
        expect(windowOf(rail).style.width).toBe("25%");
    });

    it("covers the whole rail while the viewport shows the complete score", () => {
        const rail = renderNavigator({ position: 0, width: 1, startBar: 1, endBar: 4 }, vi.fn());

        expect(windowOf(rail).style.left).toBe("0%");
        expect(windowOf(rail).style.width).toBe("100%");
    });

    it("drags the window and reports the position it moved to", () => {
        const onMove = vi.fn();
        const rail = renderNavigator({ position: 0.5, width: 0.25, startBar: 2, endBar: 2 }, onMove);

        // Grab the window in its middle (it spans 37.5%..62.5%) and move it to a quarter of the rail.
        fireEvent.pointerDown(rail, { button: 0, clientX: 200, pointerId: 7 });
        fireEvent.pointerMove(document, { clientX: 100, pointerId: 7 });

        expect(onMove).toHaveBeenCalledTimes(1);
        expect(onMove.mock.calls[0][0]).toBeCloseTo(0.125 / 0.75, 5);

        fireEvent.pointerUp(document, { pointerId: 7 });
    });

    it("centers the window on a press outside it", () => {
        const onMove = vi.fn();
        const rail = renderNavigator({ position: 0.5, width: 0.25, startBar: 2, endBar: 2 }, onMove);

        // The right edge of the rail: the window cannot follow that far, so the position clamps to the end.
        fireEvent.pointerDown(rail, { button: 0, clientX: railWidth, pointerId: 3 });

        expect(onMove).toHaveBeenCalledWith(1);

        fireEvent.pointerUp(document, { pointerId: 3 });
    });

    it("clamps a press at the left edge to the start", () => {
        const onMove = vi.fn();
        const rail = renderNavigator({ position: 0.5, width: 0.25, startBar: 2, endBar: 2 }, onMove);

        fireEvent.pointerDown(rail, { button: 0, clientX: 0, pointerId: 4 });

        expect(onMove).toHaveBeenCalledWith(0);

        fireEvent.pointerUp(document, { pointerId: 4 });
    });

    it("ignores a drag that does not belong to the started pointer", () => {
        const onMove = vi.fn();
        const rail = renderNavigator({ position: 0.5, width: 0.25, startBar: 2, endBar: 2 }, onMove);

        fireEvent.pointerDown(rail, { button: 0, clientX: 200, pointerId: 7 });
        fireEvent.pointerMove(document, { clientX: 100, pointerId: 9 });

        expect(onMove).not.toHaveBeenCalled();

        fireEvent.pointerUp(document, { pointerId: 7 });
    });
});
