/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    SelectionDialog, type ISelectionDialogItem, type ISelectionDialogResult
} from "../../src/components/ui/composites/SelectionDialog.js";
import { DialogResponseClosure } from "../../src/components/ui/framework/Dialog.js";

interface IShowOptions {
    multiSelect?: boolean;
    defaultItemId?: string;
}

describe.sequential("SelectionDialog", () => {
    let renderResult: RenderResult | null;

    const items: ISelectionDialogItem[] = [
        { id: "a", label: "Agogô" },
        { id: "b", label: "Caixa" },
        { id: "c", label: "Surdo" },
    ];

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    const renderDialog = (): SelectionDialog => {
        const ref = createRef<SelectionDialog>();
        const Wrapper: FunctionComponent = () => {
            return <SelectionDialog ref={ref} />;
        };

        renderResult = render(<Wrapper />);

        return ref.current!;
    };

    const show = (dialog: SelectionDialog, options: IShowOptions = {}): Promise<ISelectionDialogResult | undefined> => {
        return dialog.show({
            title: "Pick Instruments",
            message: "Choose one or more instruments.",
            items,
            acceptLabel: "OK",
            cancelLabel: "Cancel",
            ...options,
        });
    };

    it("renders title, message, items and buttons", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector(".selectionDialog")).toBeTruthy();
        });

        const host = document.body.querySelector(".selectionDialog")!;

        expect(host.textContent).toContain("Pick Instruments");
        expect(host.textContent).toContain("Choose one or more instruments.");
        expect(host.textContent).toContain("Agogô");
        expect(host.textContent).toContain("Caixa");
        expect(host.textContent).toContain("Surdo");
        expect(host.textContent).toContain("OK");
        expect(host.textContent).toContain("Cancel");

        fireEvent.click(document.body.querySelector("#cancel")!);
        await expect(promise).resolves.toMatchObject({ closure: DialogResponseClosure.Cancel });
    });

    it("single-select preselects the default item and returns the clicked item", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { defaultItemId: "b" });

        await waitFor(() => {
            expect(document.body.querySelector("[data-selection-id='b']")).toBeTruthy();
        });

        expect(document.body.querySelector("[data-selection-id='b']")!.className)
            .toContain("is-selected");

        fireEvent.click(document.body.querySelector("[data-selection-id='c']")!);

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Accept);
        expect(result?.selected?.id).toBe("c");
    });

    it("single-select cancel returns Cancel closure without a selection", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#cancel")).toBeTruthy();
        });
        fireEvent.click(document.body.querySelector("#cancel")!);

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Cancel);
        expect(result?.selected).toBeUndefined();
    });

    it("multi-select selects all by default and returns the remaining items on accept", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { multiSelect: true });

        await waitFor(() => {
            expect(document.body.querySelector("[data-selection-id='a']")).toBeTruthy();
        });

        for (const item of items) {
            expect(document.body.querySelector(`[data-selection-id='${item.id}']`)!.className)
                .toContain("is-selected");
        }

        fireEvent.click(document.body.querySelector("[data-selection-id='b']")!);
        fireEvent.click(document.body.querySelector("#accept")!);

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Accept);
        expect(result?.selectedItems?.map((item) => {
            return item.id;
        }).sort()).toEqual(["a", "c"]);
    });

    it("multi-select with defaultItemId selects only that item initially", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { multiSelect: true, defaultItemId: "c" });

        await waitFor(() => {
            expect(document.body.querySelector("[data-selection-id='c']")).toBeTruthy();
        });

        expect(document.body.querySelector("[data-selection-id='c']")!.className)
            .toContain("is-selected");
        expect(document.body.querySelector("[data-selection-id='a']")!.className)
            .not.toContain("is-selected");

        fireEvent.click(document.body.querySelector("#cancel")!);
        await promise;
    });

    it("select all and unselect all toggle the selection", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { multiSelect: true, defaultItemId: "a" });

        await waitFor(() => {
            expect(document.body.querySelector(".selectionDialog")).toBeTruthy();
        });

        const findButton = (caption: string): HTMLElement => {
            return Array.from(document.body.querySelectorAll<HTMLElement>("button")).find((button) => {
                return button.textContent === caption;
            })!;
        };

        fireEvent.click(findButton("Unselect All"));

        for (const item of items) {
            expect(document.body.querySelector(`[data-selection-id='${item.id}']`)!.className)
                .not.toContain("is-selected");
        }

        fireEvent.click(findButton("Select All"));

        for (const item of items) {
            expect(document.body.querySelector(`[data-selection-id='${item.id}']`)!.className)
                .toContain("is-selected");
        }

        fireEvent.click(document.body.querySelector("#cancel")!);
        await promise;
    });

    it("escape returns Cancel closure", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { multiSelect: true });

        await waitFor(() => {
            expect(document.body.querySelector(".selectionDialog")).toBeTruthy();
        });
        fireEvent.keyDown(document.body, { key: "Escape" });

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Cancel);
    });

    it("enter triggers the accept action", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { multiSelect: true });

        await waitFor(() => {
            expect(document.body.querySelector(".selectionDialog")).toBeTruthy();
        });
        fireEvent.keyDown(document.body, { key: "Enter" });

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Accept);
        expect(result?.selectedItems).toHaveLength(3);
    });
});
