/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    NotificationCenter, renderNotificationCenter,
} from "../../src/components/ui/NotificationCenter/NotificationCenter.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe.sequential("NotificationCenter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.restoreAllMocks();
        requisitions.unregister();
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
        requisitions.unregister();
    });

    it("renders the notification center DOM", () => {
        const { container } = render(renderNotificationCenter());

        expect(container.querySelector(".notificationCenter")).not.toBeNull();
    });

    it("has no toasts initially", () => {
        const { container } = render(renderNotificationCenter());

        expect(container.querySelectorAll(".toast")).toHaveLength(0);
    });

    it("shows an info notification with correct icon and text", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showInfo("Info message");
        });

        const toasts = container.querySelectorAll(".toast");
        expect(toasts).toHaveLength(1);
        expect(toasts[0].textContent).toContain("Info message");
        expect(toasts[0].querySelector("svg.icon[data-icon='Info']")).not.toBeNull();
    });

    it("shows a warning notification with correct icon", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showWarning("Warning");
        });

        const toasts = container.querySelectorAll(".toast");
        expect(toasts).toHaveLength(1);
        expect(toasts[0].textContent).toContain("Warning");
        expect(toasts[0].querySelector("svg.icon[data-icon='Warning']")).not.toBeNull();
    });

    it("shows an error notification with correct icon", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showError("Error");
        });

        const toasts = container.querySelectorAll(".toast");
        expect(toasts).toHaveLength(1);
        expect(toasts[0].textContent).toContain("Error");
        expect(toasts[0].querySelector("svg.icon[data-icon='Error']")).not.toBeNull();
    });

    it("removes a toast when close button is clicked", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showInfo("Close me");
        });

        let toasts = container.querySelectorAll(".toast");
        expect(toasts).toHaveLength(1);

        const closeButton = toasts[0].querySelector(".closeButton")!;
        await act(() => {
            fireEvent.click(closeButton);
        });

        // closeToast sets state="removing" and waits for animationend.
        toasts[0].dispatchEvent(new Event("animationend"));

        await act(() => {
            // Force re-render after transitionend handler runs.
        });

        toasts = container.querySelectorAll(".toast");
        expect(toasts).toHaveLength(0);
    });

    it("limits visible toasts to 3 after older ones finish adding", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showInfo("1st");
        });
        await act(() => {
            void NotificationCenter.showInfo("2nd");
        });
        await act(() => {
            void NotificationCenter.showInfo("3rd");
        });

        // Trigger transitionend on each toast to move them from adding → normal.
        const toastsAfter3 = container.querySelectorAll(".toast");
        for (const t of toastsAfter3) {
            t.classList.remove("adding");
            t.dispatchEvent(new Event("transitionend"));
        }

        await act(() => {
            void NotificationCenter.showInfo("4th");
        });

        const toasts = container.querySelectorAll(".toast");
        expect(toasts.length).toBeLessThanOrEqual(3);
        expect(container.textContent).not.toContain("1st");
        expect(container.textContent).toContain("4th");
    });

    it("auto-hides info toast after 5 s default timeout", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showInfo("Auto-hide");
        });

        // Move past the adding state.
        const toast = container.querySelector(".toast")!;
        toast.classList.remove("adding");

        expect(container.textContent).toContain("Auto-hide");

        await act(() => {
            vi.advanceTimersByTime(6000);
        });

        // Trigger the animationend to complete removal.
        toast.dispatchEvent(new Event("animationend"));

        await act(() => {
            // Force a re-render after the event.
        });

        expect(container.querySelectorAll(".toast")).toHaveLength(0);
        expect(container.textContent).not.toContain("Auto-hide");
    });

    it("keeps error toasts visible beyond the info timeout", async () => {
        const { container } = render(renderNotificationCenter());

        await act(() => {
            void NotificationCenter.showError("Persistent");
        });

        // Move past the adding state.
        const toast = container.querySelector(".toast")!;
        toast.classList.remove("adding");

        await act(() => {
            vi.advanceTimersByTime(6000);
        });

        expect(container.querySelectorAll(".toast")).toHaveLength(1);
        expect(container.textContent).toContain("Persistent");
    });
});
