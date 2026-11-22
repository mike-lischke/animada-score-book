/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import {
    ArrangementIdentity, ArrangementSaveState, type IArrangementIdentityProps,
} from "../../src/components/ui/Header/ArrangementIdentity.js";
import { ScoreBookDataModel, type ISbDmArrangement } from "../../src/core/ScoreBookDataModel.js";
import type { ITagInfo } from "../../src/core/types/tags.js";
import { SystemTagKind } from "../../src/core/types/tags.js";
import { createInstrument } from "../unit-test-helpers.js";

const statsCaption = "4/4 • 1 bar • 2 s";

const tagCatalogue: ITagInfo[] = [
    { id: 1, name: "Caixa", colorIndex: 1, editable: false, assignable: true, usageCount: 0 },
    { id: 2, name: "Ensaio", colorIndex: 2, editable: true, assignable: true, usageCount: 0 },
    {
        id: 3, name: "Surdo", colorIndex: 3, systemKind: SystemTagKind.Instrument, editable: false,
        assignable: true, usageCount: 0,
    },
];

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

    /**
     * Renders the identity of a score that carries tags, on a model that only answers the two lookups it needs.
     *
     * @param tagIds The tags of the score.
     * @param compact Whether the identity renders in the compact (zen mode) shape.
     *
     * @returns The rendered container.
     */
    const renderWithTags = (tagIds: number[], compact = false): Element => {
        const dataModel = {
            findScore: () => {
                return { tagIds };
            },
            tags: tagCatalogue,
        } as unknown as ScoreBookDataModel;

        renderResult = render(
            <ArrangementIdentity
                arrangement={{ id: 5, title: "Samba Test" } as ISbDmArrangement}
                dataModel={dataModel}
                editMode={false}
                stats={statsCaption}
                saveState={ArrangementSaveState.Unchanged}
                compact={compact}
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

    it("shows the arrangement name and its stats in the title row", () => {
        const container = renderIdentity();

        expect(container.querySelector("#arrangementIdentityTitle")?.textContent).toBe("Samba Test");
        expect(container.querySelector("#scoreStats")?.textContent).toBe(statsCaption);
        expect(container.querySelector(".arrangementIdentityRow #scoreStats")).not.toBeNull();
    });

    it("shows the tags of the loaded score below its name", () => {
        const container = renderWithTags([1, 2]);
        const badges = container.querySelectorAll(".arrangementIdentityTags .tag-input-tag");

        expect(Array.from(badges, (badge) => {
            return badge.textContent;
        })).toEqual(["Caixa", "Ensaio"]);
    });

    it("leaves the instrument tags out of the score's tag line", () => {
        const container = renderWithTags([1, 3, 2]);
        const badges = container.querySelectorAll(".arrangementIdentityTags .tag-input-tag");
        const captions = Array.from(badges, (badge) => {
            return badge.textContent;
        });

        expect(captions).toEqual(["Caixa", "Ensaio"]);
    });

    it("shows the user tags below the title in compact mode", () => {
        const container = renderWithTags([1, 3, 2], true);
        const badges = container.querySelectorAll(".arrangementIdentityTags .tag-input-tag");
        const captions = Array.from(badges, (badge) => {
            return badge.textContent;
        });

        expect(captions).toEqual(["Caixa", "Ensaio"]);
    });

    it("counts only the user tags its line does not show", () => {
        const container = renderWithTags([1, 2, 1, 2, 1, 2, 3]);
        const badges = container.querySelectorAll(".arrangementIdentityTags .tag-input-tag");
        const captions = Array.from(badges, (badge) => {
            return badge.textContent;
        });

        expect(captions.length).toBe(5);
        expect(captions[4]).toBe("+2");
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
