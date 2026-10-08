/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppFooter, type IAppFooterProps } from "../../src/components/ui/Navigation/AppFooter.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("AppFooter", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    const defaultProps = (overrides: Partial<IAppFooterProps> = {}): IAppFooterProps => {
        return {
            barCount: 16,
            zoom: 100,
            version: "1.5.0",
            notifications: { newCount: 0, totalCount: 0, silent: false, showHistory: false },
            onZoomChange: vi.fn(),
            onToggleNotifications: vi.fn(),
            onShowReleaseNotes: vi.fn(),
            ...overrides,
        };
    };

    const renderFooter = (overrides: Partial<IAppFooterProps> = {}): Element => {
        renderResult = render(<AppFooter {...defaultProps(overrides)} />);

        return renderResult.container;
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("shows the visible range the viewer reports", async () => {
        const container = renderFooter();

        expect(container.querySelector(".appFooterRange")?.textContent).toBe("Measure 1 of 16");

        await requisitions.execute("scoreViewportChanged", {
            position: 0, width: 0.125, startBar: 1, endBar: 2,
        });

        await waitFor(() => {
            expect(container.querySelector(".appFooterRange")?.textContent).toBe("Measures 1 – 2 of 16");
        });
    });

    it("reports a zoom step and shows the current zoom", () => {
        const onZoomChange = vi.fn();
        const container = renderFooter({ zoom: 100, onZoomChange });

        expect(container.querySelector(".appFooterZoomValue")?.textContent).toBe("100%");

        fireEvent.click(container.querySelectorAll(".appFooterZoomButton")[1]);

        expect(onZoomChange).toHaveBeenCalledWith(110);
    });

    it("stops at the outermost zoom levels", () => {
        const onZoomChangeOut = vi.fn();
        const container = renderFooter({ zoom: 50, onZoomChange: onZoomChangeOut });

        const buttons = container.querySelectorAll<HTMLButtonElement>(".appFooterZoomButton");
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(false);

        renderResult?.unmount();

        const onZoomChangeIn = vi.fn();
        const otherContainer = renderFooter({ zoom: 150, onZoomChange: onZoomChangeIn });
        const otherButtons = otherContainer.querySelectorAll<HTMLButtonElement>(".appFooterZoomButton");

        expect(otherButtons[0].disabled).toBe(false);
        expect(otherButtons[1].disabled).toBe(true);
    });

    it("shows the version and opens the release notes", () => {
        const onShowReleaseNotes = vi.fn();
        const container = renderFooter({ version: "1.5.0", onShowReleaseNotes });

        const button = container.querySelector<HTMLButtonElement>(".appFooterVersionButton")!;
        expect(button.textContent).toBe("v1.5.0");

        fireEvent.click(button);

        expect(onShowReleaseNotes).toHaveBeenCalledTimes(1);
    });

    it("toggles the notification history from its button", () => {
        const onToggleNotifications = vi.fn();
        const container = renderFooter({ onToggleNotifications });

        fireEvent.click(container.querySelector("#showNotificationHistory")!);

        expect(onToggleNotifications).toHaveBeenCalledTimes(1);
    });

    it("mirrors unread and silent notifications in the button icon", () => {
        const iconFor = (notifications: IAppFooterProps["notifications"]): string | null => {
            renderResult?.unmount();
            renderResult = null;

            const container = renderFooter({ notifications });

            return container.querySelector("#showNotificationHistory svg")?.getAttribute("data-icon") ?? null;
        };

        expect(iconFor({ newCount: 0, totalCount: 0, silent: false, showHistory: false })).toBe("Bell");
        expect(iconFor({ newCount: 2, totalCount: 5, silent: false, showHistory: false })).toBe("BellDot");
        expect(iconFor({ newCount: 2, totalCount: 5, silent: true, showHistory: false })).toBe("BellSlashDot");
        expect(iconFor({ newCount: 0, totalCount: 5, silent: true, showHistory: false })).toBe("BellSlash");
        expect(iconFor({ newCount: 0, totalCount: 5, silent: false, showHistory: true })).toBe("Bell");
    });

    it("asks the viewer to move when the navigator is used", async () => {
        const container = renderFooter();

        await requisitions.execute("scoreViewportChanged", {
            position: 0.5, width: 0.25, startBar: 2, endBar: 2,
        });

        await waitFor(() => {
            expect(container.querySelector(".appFooterRange")?.textContent).toBe("Measure 2 of 16");
        });

        const rail = container.querySelector<HTMLDivElement>(".scoreNavigator")!;
        rail.getBoundingClientRect = () => {
            return {
                x: 0, y: 0, width: 200, height: 20,
                top: 0, right: 200, bottom: 20, left: 0,
                toJSON: () => {
                    return {};
                },
            };
        };

        // jsdom does not implement pointer capture.
        rail.setPointerCapture = (): void => {
            // Nothing to do.
        };

        // Observe only the navigator's own request, after the viewport above was delivered for real.
        const executeSpy = vi.spyOn(requisitions, "execute").mockResolvedValue(true);

        // A press at the right edge is outside the window, which centers on the pressed position and clamps.
        fireEvent.pointerDown(rail, { button: 0, clientX: 200, pointerId: 5 });

        expect(executeSpy).toHaveBeenCalledWith("scoreViewportMoveRequested", 1);

        fireEvent.pointerUp(document, { pointerId: 5 });
    });
});
