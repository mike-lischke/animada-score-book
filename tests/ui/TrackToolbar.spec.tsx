/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackToolbar, type ITrackToolbarOptions } from "../../src/components/ui/Arrangement/TrackToolbar.js";

describe("TrackToolbar", { concurrent: false }, () => {
    let renderResult: RenderResult | null;
    let toolbarRef = createRef<TrackToolbar | null>();
    let anchor: HTMLButtonElement;

    const popupElement = (): HTMLElement | null => {
        return document.body.querySelector<HTMLElement>(".track-toolbar");
    };

    const openToolbar = async (options: ITrackToolbarOptions): Promise<void> => {
        await act(() => {
            toolbarRef.current?.open(anchor, options);
        });

        await waitFor(() => {
            expect(popupElement()).toBeTruthy();
        });
    };

    beforeEach(() => {
        renderResult = null;
        toolbarRef = createRef<TrackToolbar | null>();

        // The toolbar anchors itself to a live DOM element, so the test attaches a real one.
        anchor = document.createElement("button");
        document.body.appendChild(anchor);
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        document.querySelectorAll(".portal").forEach((portal) => {
            portal.remove();
        });
        anchor.remove();
        renderResult = null;
    });

    /**
     * The component is a portal that shows nothing until it is opened, so its baseline snapshots describe the
     * open toolbar — the only state that carries content.
     */
    it("matches the baseline snapshot with minimal props", async () => {
        renderResult = render(<TrackToolbar ref={toolbarRef} />);

        await openToolbar({
            title: "Surdo",
            items: [{ id: "add", icon: <span className="testToolbarIcon" /> }],
        });

        expect(popupElement()).toMatchSnapshot();
    });

    it("matches the baseline snapshot with all props set", async () => {
        renderResult = render(<TrackToolbar ref={toolbarRef} className="custom-track-toolbar"
            id="customTrackToolbar" />);

        await openToolbar({
            title: "Repinique",
            color: "#ff8800",
            items: [
                { id: "add", tooltip: "Add", icon: <span className="testToolbarIcon" /> },
                { id: "duplicate", tooltip: "Duplicate", icon: <span className="testToolbarIcon" /> },
                { id: "clear", tooltip: "Clear", icon: <span className="testToolbarIcon" />, disabled: true },
                { id: "delete", tooltip: "Delete", icon: <span className="testToolbarIcon" />, destructive: true },
            ],
        });

        expect(popupElement()).toMatchSnapshot();
    });

    it("keeps the toolbar out of the document while it is closed", () => {
        renderResult = render(<TrackToolbar ref={toolbarRef} />);

        expect(popupElement()).toBeNull();
        expect(document.body.querySelectorAll(".portal")).toHaveLength(0);
    });

    it("shows the title, colour dot and one action per item", async () => {
        renderResult = render(<TrackToolbar ref={toolbarRef} />);

        await openToolbar({
            title: "Caixa",
            color: "#123456",
            items: [
                { id: "duplicate", tooltip: "Duplicate", icon: <span className="testToolbarIcon" /> },
                {
                    id: "delete", tooltip: "Delete", icon: <span className="testToolbarIcon" />,
                    destructive: true, disabled: true,
                },
            ],
        });

        const popup = popupElement()!;
        const actions = [...popup.querySelectorAll<HTMLButtonElement>(".selectionToolbarAction")];

        expect(popup.classList.contains("popup")).toBe(true);
        expect(popup.classList.contains("visible")).toBe(true);
        expect(popup.querySelector(".selectionToolbarInstrument")?.textContent).toBe("Caixa");
        expect(popup.querySelector<HTMLElement>(".selectionToolbarDot")?.style.backgroundColor).toBe("rgb(18, 52, 86)");
        expect(popup.querySelector(".selectionToolbarSection")).toBeNull();
        expect(actions).toHaveLength(2);
        expect(actions.map((action) => {
            return action.getAttribute("title");
        })).toEqual(["Duplicate", "Delete"]);
        expect(actions[0].classList.contains("is-destructive")).toBe(false);
        expect(actions[1].classList.contains("is-destructive")).toBe(true);
        expect(actions[0].disabled).toBe(false);
        expect(actions[1].disabled).toBe(true);
    });

    it("runs an action's handler and closes the toolbar", async () => {
        const onClick = vi.fn();
        renderResult = render(<TrackToolbar ref={toolbarRef} />);

        await openToolbar({
            title: "Agogo",
            items: [{ id: "duplicate", tooltip: "Duplicate", icon: <span className="testToolbarIcon" />, onClick }],
        });

        await act(() => {
            popupElement()!.querySelector<HTMLButtonElement>(".selectionToolbarAction")!.click();
        });

        expect(onClick).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(popupElement()).toBeNull();
        });
    });

    it("closes on Escape", async () => {
        renderResult = render(<TrackToolbar ref={toolbarRef} />);

        await openToolbar({
            title: "Chocalho",
            items: [{ id: "add", icon: <span className="testToolbarIcon" /> }],
        });

        await act(() => {
            fireEvent.keyDown(document.body, { key: "Escape" });
        });

        await waitFor(() => {
            expect(popupElement()).toBeNull();
        });
    });
});
