/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfirmDialog } from "../../src/components/ui/composites/ConfirmDialog.js";
import { DialogResponseClosure } from "../../src/components/ui/framework/Dialog.js";

describe.sequential("ConfirmDialog", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    const renderDialog = (): ConfirmDialog => {
        const ref = createRef<ConfirmDialog>();
        const Wrapper: FunctionComponent = () => {
            return <ConfirmDialog ref={ref} />;
        };

        renderResult = render(<Wrapper />);

        return ref.current!;
    };

    const show = (dialog: ConfirmDialog,
        buttons: { accept?: string; refuse?: string; alternative?: string; default?: string; } = {
            accept: "OK",
            refuse: "Cancel",
        }): Promise<DialogResponseClosure> => {
        return dialog.show("Delete this track?", buttons, "Remove Track",
            ["The track and all notes will be removed."]);
    };

    it("renders message, title, description and buttons", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, { accept: "Delete", refuse: "Cancel" });

        await waitFor(() => {
            expect(document.body.querySelector(".confirmDialog")).toBeTruthy();
        });

        const host = document.body.querySelector(".confirmDialog")!;

        expect(host.textContent).toContain("Delete this track?");
        expect(host.textContent).toContain("Remove Track");
        expect(host.textContent).toContain("The track and all notes will be removed.");
        expect(host.textContent).toContain("Delete");
        expect(host.textContent).toContain("Cancel");

        fireEvent.click(document.body.querySelector("#refuse")!);
        await expect(promise).resolves.toBe(DialogResponseClosure.Decline);
    });

    it("accept button resolves with Accept", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#accept")).toBeTruthy();
        });
        fireEvent.click(document.body.querySelector("#accept")!);

        await expect(promise).resolves.toBe(DialogResponseClosure.Accept);
    });

    it("refuse button resolves with Decline", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector("#refuse")).toBeTruthy();
        });
        fireEvent.click(document.body.querySelector("#refuse")!);

        await expect(promise).resolves.toBe(DialogResponseClosure.Decline);
    });

    it("alternative button resolves with Alternative", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, {
            accept: "Save",
            refuse: "Stay",
            alternative: "Ignore",
            default: "Stay",
        });

        await waitFor(() => {
            expect(document.body.querySelector("#alternative")).toBeTruthy();
        });
        fireEvent.click(document.body.querySelector("#alternative")!);

        await expect(promise).resolves.toBe(DialogResponseClosure.Alternative);
    });

    it("escape resolves with Cancel", async () => {
        const dialog = renderDialog();
        const promise = show(dialog);

        await waitFor(() => {
            expect(document.body.querySelector(".confirmDialog")).toBeTruthy();
        });
        fireEvent.keyDown(document.body, { key: "Escape" });

        await expect(promise).resolves.toBe(DialogResponseClosure.Cancel);
    });

    it("enter triggers the default button", async () => {
        const dialog = renderDialog();
        const promise = show(dialog, {
            accept: "Delete",
            refuse: "Cancel",
            default: "Cancel",
        });

        await waitFor(() => {
            expect(document.body.querySelector(".confirmDialog")).toBeTruthy();
        });
        fireEvent.keyDown(document.body, { key: "Enter" });

        await expect(promise).resolves.toBe(DialogResponseClosure.Decline);
    });
});
