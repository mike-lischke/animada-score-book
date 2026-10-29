/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import {
    ArrangementIdentity, ArrangementSaveState, type IArrangementIdentityProps,
} from "../../src/components/ui/Header/ArrangementIdentity.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { createInstrument } from "../unit-test-helpers.js";

const statsCaption = "4/4 • 1 bar • 2 s";

describe("ArrangementIdentity", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the identity of a fresh arrangement.
     *
     * @param overrides The identity props that differ from the default header state.
     *
     * @returns The rendered container.
     */
    const renderIdentity = (overrides: Partial<IArrangementIdentityProps> = {}): Element => {
        const dataModel = new ScoreBookDataModel();
        const arrangement = dataModel.startNewArrangement([createInstrument("0", 0, 0)], { title: "Samba Test" });

        renderResult = render(
            <ArrangementIdentity
                arrangement={arrangement}
                dataModel={dataModel}
                editMode={false}
                stats={statsCaption}
                saveState={ArrangementSaveState.Unchanged}
                {...overrides}
            />,
        );

        return renderResult.container;
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders with the minimum props", () => {
        expect(renderIdentity()).toMatchSnapshot();
    });

    it("renders with all props set", () => {
        const container = renderIdentity({
            className: "zen-identity",
            editMode: true,
            stats: "6/8 • 4 bars • 12 s",
            saveState: ArrangementSaveState.Unsaved,
            compact: true,
        });

        expect(container).toMatchSnapshot();
    });

    it("puts the compact stats inside the read-only name label", () => {
        const container = renderIdentity({ compact: true, editMode: true });
        const title = container.querySelector("#arrangementIdentityTitle");

        expect(title?.tagName).not.toBe("INPUT");
        expect(title?.textContent).toBe(`Samba Test • ${statsCaption}`);
        expect(title?.querySelector(".arrangementIdentityStats")?.textContent).toBe(` • ${statsCaption}`);
        expect(container.querySelector("#scoreStats")).toBeNull();
        expect(container.querySelector(".arrangementIdentitySection")?.textContent).toBe("Score Library");
    });

    it.each([ArrangementSaveState.Unchanged, ArrangementSaveState.Saved, ArrangementSaveState.Unsaved])(
        "omits the save badge in compact mode for state %s", (saveState) => {
            const container = renderIdentity({ compact: true, saveState });

            expect(container.querySelector(".arrangement-save-chip")).toBeNull();
        },
    );

    it("shows the arrangement name and its stats below", () => {
        const container = renderIdentity();

        expect(container.querySelector("#arrangementIdentityTitle")?.textContent).toBe("Samba Test");
        expect(container.querySelector("#scoreStats")?.textContent).toBe(statsCaption);
    });

    it("lets the title be edited in edit mode", () => {
        const container = renderIdentity({ editMode: true });

        expect(container.querySelector<HTMLInputElement>("#arrangementIdentityTitle")?.value).toBe("Samba Test");
    });

    it("names the chip after the save state", () => {
        const chipOf = (state: ArrangementSaveState): HTMLElement => {
            renderResult?.unmount();
            renderResult = null;

            return renderIdentity({ saveState: state }).querySelector<HTMLElement>(".arrangement-save-chip")!;
        };

        expect(chipOf(ArrangementSaveState.Unchanged).textContent).toBe("Unchanged");
        expect(chipOf(ArrangementSaveState.Saved).textContent).toBe("Saved");
        expect(chipOf(ArrangementSaveState.Unsaved).textContent).toBe("Unsaved changes");
    });

    it("marks the chip with its own class", () => {
        const chipOf = (state: ArrangementSaveState): HTMLElement => {
            renderResult?.unmount();
            renderResult = null;

            return renderIdentity({ saveState: state }).querySelector<HTMLElement>(".arrangement-save-chip")!;
        };

        expect(chipOf(ArrangementSaveState.Unchanged).classList.contains("uiBadge-neutral")).toBe(true);
        expect(chipOf(ArrangementSaveState.Saved).classList.contains("uiBadge-success")).toBe(true);
        expect(chipOf(ArrangementSaveState.Unsaved).classList.contains("uiBadge-warning")).toBe(true);
    });
});
