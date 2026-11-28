/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { SetListCreateDialog } from "../../src/ui/SetListCreateDialog.js";

interface IMockDataModel {
    listShareGroups: ReturnType<typeof vi.fn>;
    createSetList: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (): IMockDataModel => {
    return {
        listShareGroups: vi.fn().mockResolvedValue([{ id: 10, name: "Bateria" }, { id: 20, name: "Fremd" }]),
        createSetList: vi.fn().mockResolvedValue({ success: true, id: 77 }),
    };
};

const asDataModel = (model: IMockDataModel): ScoreBookDataModel => {
    return model as unknown as ScoreBookDataModel;
};

/** A handler for the callbacks the tests do not exercise. */
const noop = (): void => {
    // The dialog is only read in these cases.
};

/**
 * @param id The id of the element to look up.
 *
 * @returns That element, looked up in the document.
 */
const byId = (id: string): HTMLElement => {
    const element = document.body.querySelector<HTMLElement>(`#${id}`);
    expect(element).toBeTruthy();

    return element!;
};

/**
 * @param name The name to type into the form's name field.
 */
const typeName = (name: string): void => {
    fireEvent.input(byId("setListCreateName"), { target: { value: name } });
};

describe("SetListCreateDialog", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    /**
     * @param model The mocked model the dialog works with.
     * @param onCreated What the dialog reports after a successful creation.
     *
     * @returns The rendered dialog.
     */
    const renderDialog = (model: IMockDataModel, onCreated = noop): RenderResult => {
        renderResult = render(
            <SetListCreateDialog dataModel={asDataModel(model)} open={true} onClose={noop}
                onCreated={onCreated} />,
        );

        return renderResult;
    };

    it("creates a private list when no group is chosen", async () => {
        const model = createMockDataModel();
        const onCreated = vi.fn();

        renderDialog(model, onCreated);
        await waitFor(() => {
            expect(model.listShareGroups).toHaveBeenCalled();
            expect(byId("setListShareGroup-10")).toBeTruthy();
        });

        typeName("  Auftritt  ");
        fireEvent.click(byId("setListCreateConfirm"));

        await waitFor(() => {
            expect(model.createSetList).toHaveBeenCalledWith("Auftritt", []);
            expect(onCreated).toHaveBeenCalledWith(77);
        });
    });

    it("shares the list with the groups the caller ticks", async () => {
        const model = createMockDataModel();

        renderDialog(model);
        await waitFor(() => {
            expect(byId("setListShareGroup-20")).toBeTruthy();
        });

        typeName("Auftritt");
        fireEvent.click(byId("setListShareGroup-20"));
        fireEvent.click(byId("setListCreateConfirm"));

        await waitFor(() => {
            expect(model.createSetList).toHaveBeenCalledWith("Auftritt", [20]);
        });
    });

    it("creates the list on Enter in the name field", async () => {
        const model = createMockDataModel();
        const onCreated = vi.fn();

        renderDialog(model, onCreated);
        await waitFor(() => {
            expect(byId("setListShareGroup-10")).toBeTruthy();
        });

        typeName("Auftritt");
        fireEvent.keyDown(byId("setListCreateName"), { key: "Enter" });

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalledWith(77);
        });
    });

    it("needs a name before it talks to the backend", async () => {
        const model = createMockDataModel();

        renderDialog(model);
        await waitFor(() => {
            expect(byId("setListShareGroup-10")).toBeTruthy();
        });

        typeName("   ");
        fireEvent.click(byId("setListCreateConfirm"));

        await waitFor(() => {
            expect(byId("setListCreateMessage").textContent).toBe("A set list needs a name.");
        });
        expect(model.createSetList).not.toHaveBeenCalled();
    });

    it("shows what the backend answered instead of closing", async () => {
        const model = createMockDataModel();
        const onCreated = vi.fn();
        model.createSetList.mockResolvedValue({ success: false, error: "A list with that name already exists." });

        renderDialog(model, onCreated);
        await waitFor(() => {
            expect(byId("setListShareGroup-10")).toBeTruthy();
        });

        typeName("Auftritt");
        fireEvent.click(byId("setListCreateConfirm"));

        await waitFor(() => {
            expect(byId("setListCreateMessage").textContent).toBe("A list with that name already exists.");
        });
        expect(onCreated).not.toHaveBeenCalled();
    });
});
