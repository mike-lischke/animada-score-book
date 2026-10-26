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

    it("renders with the minimum props", () => {
        expect(renderFooter()).toMatchSnapshot();
    });

    it("renders with all props set", () => {
        const container = renderFooter({
            className: "zen-footer",
            barCount: 8,
            zoom: 150,
            version: "2.0.0",
            zenMode: true,
            onToggleZenMode: vi.fn(),
            notifications: { newCount: 2, totalCount: 4, silent: true, showHistory: true },
        });

        expect(container).toMatchSnapshot();
    });

    it("renders the compact footer", () => {
        expect(renderFooter({ compact: true })).toMatchSnapshot();
    });

    it("places the Zen toggle immediately after the zoom controls", () => {
        const container = renderFooter();
        const zoom = container.querySelector(".appFooterZoom");
        const button = container.querySelector("#zenModeButton");

        expect(zoom?.nextElementSibling).toBe(button);
        expect(button?.getAttribute("aria-pressed")).toBe("false");
        expect(button?.getAttribute("title")).toBe("Enter Zen mode");
        expect(button?.querySelector("svg")?.getAttribute("data-icon")).toBe("ScreenFull");
    });

    it("renders the active Zen toggle with the exit icon", () => {
        const container = renderFooter({ zenMode: true, onToggleZenMode: vi.fn() });
        const button = container.querySelector("#zenModeButton");

        expect(button?.getAttribute("aria-pressed")).toBe("true");
        expect(button?.getAttribute("title")).toBe("Exit Zen mode");
        expect(button?.querySelector("svg")?.getAttribute("data-icon")).toBe("ScreenNormal");
    });

    it("shows the visible range the viewer reports", async () => {
        const container = renderFooter();

        expect(container.querySelector(".appFooterRange")?.textContent).toBe("Bar 1 of 16");

        await requisitions.execute("scoreViewportChanged", {
            position: 0, width: 0.125, startBar: 1, endBar: 2,
        });

        await waitFor(() => {
            expect(container.querySelector(".appFooterRange")?.textContent).toBe("Bars 1 – 2 of 16");
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
            expect(container.querySelector(".appFooterRange")?.textContent).toBe("Bar 2 of 16");
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

    it("folds zoom and version into the overflow menu when compact", () => {
        const container = renderFooter({ compact: true });

        // Position, navigator, Zen mode and notifications stay in the strip.
        expect(container.querySelector(".appFooterRange")).toBeTruthy();
        expect(container.querySelector(".appFooterNavigator")).toBeTruthy();
        expect(container.querySelector("#zenModeButton")).toBeTruthy();
        expect(container.querySelector("#showNotificationHistory")).toBeTruthy();

        expect(container.querySelector(".appFooterZoom")).toBeNull();
        expect(container.querySelector(".appFooterVersionButton")).toBeNull();
        expect(container.querySelector(".footerOverflowMenu")).toBeTruthy();

        const items = Array.from(container.querySelectorAll(".footerOverflowMenu li"));
        expect(items.map((item) => {
            return item.textContent.trim();
        })).toEqual(["Zoom out", "Zoom in", "Reset zoom100%", "Version 1.5.0", "Release Notes"]);
    });

    it("reports zoom steps and the reset from the compact menu", () => {
        const onZoomChange = vi.fn();
        const container = renderFooter({ compact: true, zoom: 120, onZoomChange });
        const links = container.querySelectorAll<HTMLAnchorElement>(".footerOverflowMenu li > a");

        fireEvent.click(links[0]);
        expect(onZoomChange).toHaveBeenCalledWith(110);

        fireEvent.click(links[1]);
        expect(onZoomChange).toHaveBeenCalledWith(130);

        expect(links[2].parentElement?.textContent.trim()).toBe("Reset zoom120%");

        fireEvent.click(links[2]);
        expect(onZoomChange).toHaveBeenCalledWith(100);
    });

    it("disables the compact zoom steps at the outer bounds", () => {
        const container = renderFooter({ compact: true, zoom: 50 });
        const links = container.querySelectorAll<HTMLAnchorElement>(".footerOverflowMenu li > a");

        expect(links[0].getAttribute("aria-disabled")).toBe("true");
        expect(links[1].getAttribute("aria-disabled")).toBeNull();

        renderResult?.unmount();

        const otherContainer = renderFooter({ compact: true, zoom: 150 });
        const otherLinks = otherContainer.querySelectorAll<HTMLAnchorElement>(".footerOverflowMenu li > a");

        expect(otherLinks[0].getAttribute("aria-disabled")).toBeNull();
        expect(otherLinks[1].getAttribute("aria-disabled")).toBe("true");
    });

    it("opens the release notes from the compact menu", () => {
        const onShowReleaseNotes = vi.fn();
        const container = renderFooter({ compact: true, onShowReleaseNotes });
        const links = container.querySelectorAll<HTMLAnchorElement>(".footerOverflowMenu li > a");

        fireEvent.click(links[4]);

        expect(onShowReleaseNotes).toHaveBeenCalledTimes(1);
    });
});
