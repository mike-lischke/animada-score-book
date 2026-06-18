/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderStatusBar, Statusbar } from "../../src/components/ui/Statusbar/Statusbar.js";
import { StatusBarAlignment } from "../../src/components/ui/Statusbar/StatusBarItem.js";
import type { IStatusBarDisposable } from "../../src/components/ui/Statusbar/Statusbar.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe.sequential("Statusbar", () => {
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

    it("throws when createStatusBarItem called before mounted", () => {
        expect(() => {
            Statusbar.createStatusBarItem({ text: "early" });
        }).toThrow("Statusbar is not mounted");
    });

    it("throws when setStatusBarMessage called before mounted", () => {
        expect(() => {
            Statusbar.setStatusBarMessage("early");
        }).toThrow("Statusbar is not mounted");
    });

    it("renders the statusbar DOM structure", () => {
        const { container } = render(renderStatusBar());

        expect(container.querySelector(".statusbar")).not.toBeNull();
        expect(container.querySelector(".statusbar-left")).not.toBeNull();
        expect(container.querySelector(".statusbar-right")).not.toBeNull();
    });

    it("adds an item and renders it on the left side by default", async () => {
        const { container } = render(renderStatusBar());

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "left.item", text: "Hello" });
        });

        const leftContainer = container.querySelector(".statusbar-left")!;
        expect(leftContainer.textContent).toContain("Hello");

        await act(() => {
            item.dispose(); 
        });
        expect(container.textContent).not.toContain("Hello");
    });

    it("renders right-aligned items on the right side", async () => {
        const { container } = render(renderStatusBar());

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({
                id: "right.item", text: "Right", alignment: StatusBarAlignment.Right,
            });
        });

        const rightContainer = container.querySelector(".statusbar-right")!;
        expect(rightContainer.textContent).toContain("Right");

        await act(() => {
            item.dispose(); 
        });
        expect(container.textContent).not.toContain("Right");
    });

    it("show and hide toggle visibility", async () => {
        const { container } = render(renderStatusBar());

        let item: { hide: () => void; show: () => void; dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "toggle.item", text: "Toggle" });
        });

        expect(container.textContent).toContain("Toggle");

        await act(() => {
            item.hide(); 
        });
        expect(container.textContent).not.toContain("Toggle");

        await act(() => {
            item.show(); 
        });
        expect(container.textContent).toContain("Toggle");

        await act(() => {
            item.dispose(); 
        });
        expect(container.textContent).not.toContain("Toggle");
    });

    it("removes items on dispose", async () => {
        const { container } = render(renderStatusBar());

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "dispose.item", text: "Gone" });
        });

        expect(container.textContent).toContain("Gone");

        await act(() => {
            item.dispose(); 
        });
        expect(container.textContent).not.toContain("Gone");
    });

    it("shows a temporary message that hides after default timeout", async () => {
        const { container } = render(renderStatusBar());

        await act(() => {
            Statusbar.setStatusBarMessage("Loading...");
        });

        expect(container.textContent).toContain("Loading...");

        await act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(container.textContent).not.toContain("Loading...");
    });

    it("accepts a custom timeout", async () => {
        const { container } = render(renderStatusBar());

        await act(() => {
            Statusbar.setStatusBarMessage("Quick", 1000);
        });

        expect(container.textContent).toContain("Quick");

        await act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(container.textContent).not.toContain("Quick");
    });

    it("reuses the message item on subsequent setStatusBarMessage calls", async () => {
        const { container } = render(renderStatusBar());

        let disposable: IStatusBarDisposable;
        await act(() => {
            disposable = Statusbar.setStatusBarMessage("First");
        });

        expect(container.textContent).toContain("First");

        await act(() => {
            void Statusbar.setStatusBarMessage("Second", 2000);
        });

        expect(container.textContent).toContain("Second");
        expect(container.textContent).not.toContain("First");

        const messageItems = container.querySelectorAll("#msg\\.statusBarMessage");
        expect(messageItems).toHaveLength(1);

        await act(() => {
            disposable.dispose(); 
        });
        expect(container.textContent).not.toContain("Second");
    });

    it("setStatusBarMessage hides when disposable is called", async () => {
        const { container } = render(renderStatusBar());

        let disposable: IStatusBarDisposable;
        await act(() => {
            disposable = Statusbar.setStatusBarMessage("Disposable");
        });

        expect(container.textContent).toContain("Disposable");

        await act(() => {
            disposable.dispose(); 
        });
        expect(container.textContent).not.toContain("Disposable");
    });

    it("setStatusBarMessage hides when promise resolves", async () => {
        const { container } = render(renderStatusBar());

        let resolvePromise!: () => void;
        const promise = new Promise<void>((resolve) => {
            resolvePromise = resolve;
        });

        await act(() => {
            Statusbar.setStatusBarMessage("Promise", promise);
        });

        expect(container.textContent).toContain("Promise");

        await act(async () => {
            resolvePromise();
            await Promise.resolve();
        });

        expect(container.textContent).not.toContain("Promise");
    });

    it("sorts items by priority (higher first), then disposes them", async () => {
        const { container } = render(renderStatusBar());

        let low: { dispose: () => void; };
        let high: { dispose: () => void; };
        let mid: { dispose: () => void; };
        await act(() => {
            low = Statusbar.createStatusBarItem({ id: "low", text: "Low", priority: 0 });
            high = Statusbar.createStatusBarItem({ id: "high", text: "High", priority: 100 });
            mid = Statusbar.createStatusBarItem({ id: "mid", text: "Mid", priority: 50 });
        });

        const items = container.querySelectorAll(".statusbar-left .statusbar-item");
        const texts = Array.from(items).map((el) => {
            return el.textContent;
        });

        expect(texts).toEqual(["High", "Mid", "Low"]);

        await act(() => {
            low.dispose(); high.dispose(); mid.dispose(); 
        });

        const remaining = container.querySelectorAll(".statusbar-left .statusbar-item");
        expect(remaining).toHaveLength(0);
    });

    it("renders codicon icons from $(name) syntax", async () => {
        const { container } = render(renderStatusBar());

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "icon.item", text: "$(check) Done" });
        });

        expect(container.querySelector(".codicon-check")).not.toBeNull();
        expect(container.textContent).toContain("Done");

        await act(() => {
            item.dispose(); 
        });
        expect(container.textContent).not.toContain("Done");
    });

    it("adds spin modifier for ~spin suffix", async () => {
        const { container } = render(renderStatusBar());

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "spin.item", text: "$(sync~spin) Loading" });
        });

        const icon = container.querySelector(".codicon-sync");

        expect(icon).not.toBeNull();
        expect(icon!.classList.contains("codicon-modifier-spin")).toBe(true);

        await act(() => {
            item.dispose(); 
        });
        expect(container.querySelector(".codicon-sync")).toBeNull();
    });

    it("clickable items have button role, non-clickable do not", async () => {
        const { container } = render(renderStatusBar());

        let clickableItem: { dispose: () => void; };
        let plainItem: { dispose: () => void; };
        await act(() => {
            clickableItem = Statusbar.createStatusBarItem({
                id: "clickable", text: "Click", command: "test.cmd",
            });
            plainItem = Statusbar.createStatusBarItem({ id: "plain", text: "Plain" });
        });

        const clickable = container.querySelector("#clickable")!;
        const plain = container.querySelector("#plain")!;

        expect(clickable.getAttribute("role")).toBe("button");
        expect(clickable.getAttribute("tabIndex")).toBe("0");
        expect(plain.getAttribute("role")).toBeNull();

        await act(() => {
            clickableItem.dispose(); plainItem.dispose(); 
        });
        expect(container.querySelector("#clickable")).toBeNull();
        expect(container.querySelector("#plain")).toBeNull();
    });

    it("fires statusBarItemClicked on click", async () => {
        const { container } = render(renderStatusBar());

        const callback = vi.fn(() => {
            return Promise.resolve(true);
        });

        requisitions.register("statusBarItemClicked", callback);

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "cmd.item", text: "Cmd", command: "my.cmd" });
        });

        const el = container.querySelector("#cmd\\.item")!;

        fireEvent.click(el);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({ command: "my.cmd" }),
        );

        await act(() => {
            item.dispose(); 
        });
    });

    it("fires on Enter key for clickable items", async () => {
        const { container } = render(renderStatusBar());

        const callback = vi.fn(() => {
            return Promise.resolve(true);
        });

        requisitions.register("statusBarItemClicked", callback);

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "key.item", text: "Key", command: "key.cmd" });
        });

        const el = container.querySelector("#key\\.item")!;

        fireEvent.keyDown(el, { key: "Enter" });

        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({ command: "key.cmd" }),
        );

        await act(() => {
            item.dispose(); 
        });
    });

    it("does not fire for items without a command", async () => {
        const { container } = render(renderStatusBar());

        const callback = vi.fn(() => {
            return Promise.resolve(true);
        });

        requisitions.register("statusBarItemClicked", callback);

        let item: { dispose: () => void; };
        await act(() => {
            item = Statusbar.createStatusBarItem({ id: "no-cmd.item", text: "No Cmd" });
        });

        const el = container.querySelector("#no-cmd\\.item")!;

        fireEvent.click(el);

        expect(callback).not.toHaveBeenCalled();

        await act(() => {
            item.dispose(); 
        });
    });
});
