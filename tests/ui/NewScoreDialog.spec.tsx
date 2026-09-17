/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ISelectionDialogItem } from "../../src/components/ui/composites/SelectionDialog.js";
import {
    NewScoreDialog, type INewScoreResult, type INewScoreShowOptions
} from "../../src/components/ui/composites/NewScoreDialog.js";
import { DialogResponseClosure } from "../../src/components/ui/framework/Dialog.js";

describe.sequential("NewScoreDialog", () => {
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

    const renderDialog = (): NewScoreDialog => {
        const ref = createRef<NewScoreDialog>();
        const Wrapper: FunctionComponent = () => {
            return <NewScoreDialog ref={ref} />;
        };

        renderResult = render(<Wrapper />);

        return ref.current!;
    };

    const show = (dialog: NewScoreDialog, options?: INewScoreShowOptions): Promise<INewScoreResult | undefined> => {
        return dialog.show(options ?? { items });
    };

    it("renders form fields, instruments and buttons", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#newScoreTitle")).toBeTruthy();
        });

        expect(document.body.querySelector("#newScoreTimeSignature")).toBeTruthy();
        expect(document.body.querySelector("#newScoreBars")).toBeTruthy();
        expect(document.body.querySelector("#newScoreTempo")).toBeTruthy();
        expect(document.body.querySelector("[data-selection-id='a']")).toBeTruthy();
        expect(document.body.querySelector("[data-selection-id='b']")).toBeTruthy();
        expect(document.body.querySelector("[data-selection-id='c']")).toBeTruthy();
        expect(document.body.querySelector("#accept")).toBeTruthy();
        expect(document.body.querySelector("#cancel")).toBeTruthy();

        fireEvent.click(document.body.querySelector("#cancel")!);
        await expect(promise).resolves.toMatchObject({ closure: DialogResponseClosure.Cancel });
    });

    it("returns the entered values and remaining instruments on accept", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#newScoreTitle")).toBeTruthy();
        });

        const titleInput = document.body.querySelector<HTMLInputElement>("#newScoreTitle")!;
        fireEvent.input(titleInput, { target: { value: "My Samba" } });

        const tempoInput = document.body.querySelector<HTMLInputElement>("#newScoreTempo")!;
        fireEvent.input(tempoInput, { target: { value: "132" } });

        const barsInput = document.body.querySelector<HTMLInputElement>("#newScoreBars")!;
        fireEvent.input(barsInput, { target: { value: "4" } });

        const signatureSelect = document.body.querySelector<HTMLSelectElement>("#newScoreTimeSignature")!;
        signatureSelect.value = "6/8";
        fireEvent.change(signatureSelect);

        // All instruments are selected by default; deselect Caixa.
        fireEvent.click(document.body.querySelector("[data-selection-id='b']")!);

        fireEvent.click(document.body.querySelector("#accept")!);

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Accept);
        expect(result?.title).toBe("My Samba");
        expect(result?.timeSignature).toBe("6/8");
        expect(result?.pulse).toBe("3/8");
        expect(result?.stepResolution).toBe(8);
        expect(result?.barCount).toBe(4);
        expect(result?.tempo).toBe(132);
        expect(result?.selectedItems.map((item) => {
            return item.id;
        })).toEqual(["a", "c"]);
    });

    it("uses defaults for title and timing on accept without edits", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#accept")).toBeTruthy();
        });

        fireEvent.click(document.body.querySelector("#accept")!);

        const result = await promise;

        expect(result?.closure).toBe(DialogResponseClosure.Accept);
        expect(result?.title).toBe("Untitled Arrangement");
        expect(result?.timeSignature).toBe("4/4");
        expect(result?.pulse).toBe("1/4");
        expect(result?.stepResolution).toBe(16);
        expect(result?.barCount).toBe(1);
        expect(result?.tempo).toBe(110);
        expect(result?.selectedItems).toHaveLength(3);
    });

    it("falls back to defaults for invalid bar count and tempo", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#newScoreTempo")).toBeTruthy();
        });

        const tempoInput = document.body.querySelector<HTMLInputElement>("#newScoreTempo")!;
        fireEvent.input(tempoInput, { target: { value: "abc" } });

        const barsInput = document.body.querySelector<HTMLInputElement>("#newScoreBars")!;
        fireEvent.input(barsInput, { target: { value: "0" } });

        fireEvent.click(document.body.querySelector("#accept")!);

        const result = await promise;

        expect(result?.barCount).toBe(1);
        expect(result?.tempo).toBe(110);
    });

    it("pre-fills the dialog from the last-used creation settings", async () => {
        const dialog = renderDialog();

        const numericItems: ISelectionDialogItem[] = [
            { id: "10", label: "Agogô" },
            { id: "1", label: "Chocalho" },
            { id: "2", label: "Tamborim" },
        ];

        const promise = dialog.show({
            items: numericItems,
            defaultSettings: {
                timeSignature: "6/8",
                tempo: "132",
                barCount: 4,
                instruments: [1, 2],
            },
        });

        await waitFor(() => {
            expect(document.body.querySelector("#newScoreTempo")).toBeTruthy();
        });

        const tempoInput = document.body.querySelector<HTMLInputElement>("#newScoreTempo")!;
        expect(tempoInput.value).toBe("132");

        const barsInput = document.body.querySelector<HTMLInputElement>("#newScoreBars")!;
        expect(barsInput.value).toBe("4");

        const signatureSelect = document.body.querySelector<HTMLSelectElement>("#newScoreTimeSignature")!;
        expect(signatureSelect.value).toBe("6/8");

        expect(document.body.querySelector("[data-selection-id='10']")!.className).not.toContain("is-selected");
        expect(document.body.querySelector("[data-selection-id='1']")!.className).toContain("is-selected");
        expect(document.body.querySelector("[data-selection-id='2']")!.className).toContain("is-selected");

        fireEvent.click(document.body.querySelector("#cancel")!);
        await promise;
    });
});
