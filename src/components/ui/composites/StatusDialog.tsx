/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Codicon } from "../framework/Codicon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import {
    ValueDialog, ValueEditorEntryType, type IValueEditorEntry,
} from "./ValueDialog.js";

/**
 * Content descriptor for a single status phase.
 */
export interface IStatusContent {
    /** Icon to show next to the title. */
    icon: Codicon;

    /** Bold title line. */
    title: string;

    /** Primary message text (wrapped). */
    message: string;

    /** Optional secondary detail (smaller, muted colour). */
    detail?: string;

    /** Whether to show a spinner below the text. */
    showSpinner?: boolean;
}

interface IStatusDialogProperties extends ICommonUIProperties {
    /** Called when the dialog is dismissed. */
    onClose?: () => void;

    /**
     * Whether Escape closes the dialog. Defaults to false — the dialog
     * reopens on Escape to prevent accidental dismissal.
     */
    closeOnEscape?: boolean;

    /** The id attribute for the underlying dialog element. Defaults to "statusDialog". */
    dialogId?: string;
}

/**
 * A modal dialog for status-only information (no user input).
 *
 * Composes {@link ValueDialog} internally to share its visual design
 * (CSS classes, caption pattern, Grid layout). Provides a simplified
 * API without the entry structure required by ValueDialog directly.
 *
 * ## Usage
 *
 * ```
 * dialog.show({ icon: Codicon.Error, title: "Error", message: "Something went wrong." });
 * dialog.update({ message: "Retrying…", showSpinner: true });
 * dialog.dismiss();
 * ```
 */
export class StatusDialog extends UIComponent<IStatusDialogProperties> {
    private valueDialogRef = createRef<ValueDialog>();
    private content: IStatusContent = { icon: Codicon.Info, title: "", message: "" };
    private closingIntentionally = false;

    public constructor(props: IStatusDialogProperties) {
        super(props);
        this.state = {};
    }

    /**
     * Opens the dialog with the given content.
     *
     * @param content The initial content to display.
     */
    public show(content: IStatusContent): void {
        const { dialogId } = this.props;

        this.closingIntentionally = false;
        this.content = content;

        void this.valueDialogRef.current?.show(
            dialogId ?? "statusDialog",
            content.title,
            content.icon,
            this.buildEntries(content),
            { hideActions: true },
        );
    }

    /**
     * Updates the content while the dialog is open.
     * Re-shows the dialog with the merged content.
     *
     * @param partial Fields to update. Omitted fields keep their current values.
     */
    public update(partial: Partial<IStatusContent>): void {
        const { dialogId } = this.props;

        this.content = {
            icon: partial.icon ?? this.content.icon,
            title: partial.title ?? this.content.title,
            message: partial.message ?? this.content.message,
            detail: partial.detail ?? this.content.detail,
            showSpinner: partial.showSpinner ?? this.content.showSpinner,
        };

        void this.valueDialogRef.current?.show(
            dialogId ?? "statusDialog",
            this.content.title,
            this.content.icon,
            this.buildEntries(this.content),
            { hideActions: true },
        );
    }

    /**
     * Closes the dialog programmatically.
     */
    public dismiss(): void {
        this.closingIntentionally = true;
        this.valueDialogRef.current?.dismiss();
        this.props.onClose?.();
    }

    public render(): ComponentChild {
        return (
            <ValueDialog ref={this.valueDialogRef} />
        );
    }

    private buildEntries(content: IStatusContent): IValueEditorEntry[] {
        const entries: IValueEditorEntry[] = [
            {
                type: ValueEditorEntryType.Description,
                id: "message",
                content: content.message,
                displayWidth: 8,
            },
        ];

        if (content.detail) {
            entries.push({
                type: ValueEditorEntryType.Description,
                id: "detail",
                content: content.detail,
                displayWidth: 8,
            });
        }

        if (content.showSpinner) {
            entries.push({
                type: ValueEditorEntryType.Spinner,
                id: "spinner",
                displayWidth: 8,
            });
        }

        return entries;
    }
}
