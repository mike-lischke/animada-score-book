/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { ArrangementIdentity, ArrangementSaveState } from "../../src/components/ui/Header/ArrangementIdentity.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { createInstrument } from "../unit-test-helpers.js";

const statsCaption = "4/4 • 1 bar • 2 s";

describe("ArrangementIdentity", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    /**
     * Renders the identity of a fresh arrangement.
     *
     * @param editMode Whether the title is editable.
     * @param saveState The save state the chip shows.
     *
     * @returns The rendered container.
     */
    const renderIdentity = (editMode = false,
        saveState = ArrangementSaveState.Unchanged): Element => {
        const dataModel = new ScoreBookDataModel();
        const arrangement = dataModel.startNewArrangement([createInstrument("0", 0, 0)], { title: "Samba Test" });

        renderResult = render(
            <ArrangementIdentity
                arrangement={arrangement}
                dataModel={dataModel}
                editMode={editMode}
                stats={statsCaption}
                saveState={saveState}
            />,
        );

        return renderResult.container;
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("shows the arrangement name and its stats below", () => {
        const container = renderIdentity();

        expect(container.querySelector("#arrangementIdentityTitle")?.textContent).toBe("Samba Test");
        expect(container.querySelector("#scoreStats")?.textContent).toBe(statsCaption);
    });

    it("lets the title be edited in edit mode", () => {
        const container = renderIdentity(true);

        expect(container.querySelector<HTMLInputElement>("#arrangementIdentityTitle")?.value).toBe("Samba Test");
    });

    it("names the chip after the save state", () => {
        const chipOf = (state: ArrangementSaveState): HTMLElement => {
            renderResult?.unmount();
            renderResult = null;

            return renderIdentity(false, state).querySelector<HTMLElement>(".arrangementSaveChip")!;
        };

        expect(chipOf(ArrangementSaveState.Unchanged).textContent).toBe("Unchanged");
        expect(chipOf(ArrangementSaveState.Saved).textContent).toBe("Saved");
        expect(chipOf(ArrangementSaveState.Unsaved).textContent).toBe("Unsaved changes");
    });

    it("marks the chip with its own class", () => {
        const chipOf = (state: ArrangementSaveState): HTMLElement => {
            renderResult?.unmount();
            renderResult = null;

            return renderIdentity(false, state).querySelector<HTMLElement>(".arrangementSaveChip")!;
        };

        expect(chipOf(ArrangementSaveState.Unchanged).classList.contains("arrangementSaveChip-unchanged")).toBe(true);
        expect(chipOf(ArrangementSaveState.Saved).classList.contains("arrangementSaveChip-saved")).toBe(true);
        expect(chipOf(ArrangementSaveState.Unsaved).classList.contains("arrangementSaveChip-unsaved")).toBe(true);
    });
});
