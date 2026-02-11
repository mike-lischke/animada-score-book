/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { ConfirmDialog } from "../components/ui/composites/ConfirmDialog.js";
import { ValueDialog, type IValueEditorValueEntry } from "../components/ui/composites/ValueDialog.js";
import {
    DialogType, type DialogResponseClosure, type IDialogRequest, type IDialogResponse
} from "../components/ui/framework/Dialogs/Dialog.js";
import { UIComponent } from "../components/ui/framework/UIComponent.js";
import { Semaphore } from "../supplement/Semaphore.js";

/**
 * A component to host certain application wide common dialogs in a central place.
 * They are all accessible via requisitions.
 */
export class DialogHost extends UIComponent {
    private static instance?: DialogHost;

    // Used like a stack. Last element is the element which was focused before the dialog was opened.
    private focusedElements: Array<Element | null> = [];

    private confirmDialogRef = createRef<ConfirmDialog>();
    private confirmDialogSignal: Semaphore<IDialogResponse> | undefined | null;

    private promptDialogRef = createRef<ValueDialog>();
    private promptDialogSignal: Semaphore<IDialogResponse> | undefined | null;

    public constructor(props: {}) {
        // Make the DialogHost a singleton and allow access to it via class methods.
        if (DialogHost.instance) {
            return DialogHost.instance;
        }

        super(props);
        DialogHost.instance = this;
    }

    public static showConfirmDialog = async (
        title: string,
        message: string,
        buttons: { accept?: string; refuse?: string; alternative?: string; default?: string; },
        description?: string[],
        values?: Record<string, unknown>,
    ): Promise<DialogResponseClosure> => {
        if (!this.instance) {
            throw new Error("DialogHost instance not initialized.");
        }

        if (this.instance.confirmDialogSignal !== undefined) {
            throw new Error("Confirm dialog already active.");
        }

        this.instance.confirmDialogSignal = new Semaphore<IDialogResponse>();
        this.instance.confirmDialogRef.current?.show(
            message,
            buttons,
            title,
            description,
            values,
        );

        const response = await this.instance.confirmDialogSignal.wait();

        return response.closure;
    };

    /**
     * Directly shows one of the standard dialog and allows to wait for the user's response.
     *
     * @param request The request with the data for the dialog.
     *
     * @returns A promise which resolves to the user's response.
     */
    public static showDialog = async (request: IDialogRequest): Promise<IDialogResponse> => {
        if (!this.instance) {
            throw new Error("DialogHost instance not initialized.");
        }

        switch (request.type) {
            case DialogType.Confirm: {
                if (this.instance.confirmDialogSignal !== undefined) {
                    throw new Error("Confirm dialog already active.");
                }

                this.instance.confirmDialogSignal = new Semaphore<IDialogResponse>();
                this.instance.runConfirmDialog(request);

                return this.instance.confirmDialogSignal.wait();
            }

            case DialogType.Prompt: {
                if (this.instance.promptDialogSignal !== undefined) {
                    throw new Error("Prompt dialog already active.");
                }

                this.instance.promptDialogSignal = new Semaphore<IDialogResponse>();
                this.instance.runPromptDialog(request);

                return this.instance.promptDialogSignal.wait();
            }

            default: {
                throw new Error(`Unknown dialog type: ${request.type}`);
            }
        }
    };

    public render(): ComponentChild {
        const dialogs: ComponentChild[] = [
            <ConfirmDialog
                key="confirmDialog"
                ref={this.confirmDialogRef}
                onClose={this.handleConfirmDialogClose}
            />,
            <ValueDialog
                key="promptDialog"
                ref={this.promptDialogRef}
                onClose={this.handleValueDialogClose}
            />,
        ];

        return (
            <>
                {dialogs}
            </>
        );
    }

    /**
     * Configures and runs a confirmation dialog.
     *
     * Supported entries in the request are:
     *   - parameters.title The dialog's title.
     *   - parameters.prompt The text to show for the confirmation.
     *   - parameters.accept Optional text for the accept button (default: "OK").
     *   - parameters.refuse Optional text for the refuse button (default: "Cancel").
     *   - parameters.alternative Optional text for the accept button (no default).
     *   - parameters.default Optional text for the button that should be auto focused.
     *   - request.description An array of strings to be shown as additional information.
     *   - request.data: A dictionary that is forwarded to the response handler.
     *
     * @param request The request with the data for the dialog.
     */
    private runConfirmDialog = (request: IDialogRequest): void => {
        this.focusedElements.push(document.activeElement);

        this.confirmDialogRef.current?.show(
            request.parameters?.prompt as string | undefined ?? "",
            {
                accept: request.parameters?.accept as string,
                refuse: request.parameters?.refuse as string,
                alternative: request.parameters?.alternative as string,
                default: request.parameters?.default as string,
            },
            request.parameters?.title as string,
            request.description,
            { id: request.id, ...request.data, type: request.type },
        );
    };

    private runPromptDialog = (request: IDialogRequest): void => {
        this.focusedElements.push(document.activeElement);

        this.promptDialogRef.current?.show(
            request.id,
            (request.parameters?.title ?? "") as string,
            (request.parameters?.entries ?? []) as IValueEditorValueEntry[],
        );
    };

    private handleConfirmDialogClose = (closure: DialogResponseClosure,
        data?: Record<string, unknown>): void => {
        const element = this.focusedElements.pop();

        const response: IDialogResponse = {
            id: data?.id as string | undefined ?? "",
            type: DialogType.Confirm,
            closure,
            data,
        };

        this.confirmDialogSignal?.notifyAll(response);
        this.confirmDialogSignal = undefined;

        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
            element.focus();
        }
    };

    private handleValueDialogClose = (id: string, closure: DialogResponseClosure,
        values: IValueEditorValueEntry[]): void => {
        const element = this.focusedElements.pop();

        const response: IDialogResponse = {
            id,
            type: DialogType.Prompt,
            closure,
            data: values.length > 0 ? { values } : undefined,
        };

        this.promptDialogSignal?.notifyAll(response);
        this.promptDialogSignal = undefined;

        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
            element.focus();
        }
    };
}
