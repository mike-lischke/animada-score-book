/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef } from "preact";

import { Codicon } from "../components/ui/framework/Codicon.js";
import { DialogResponseClosure } from "../components/ui/framework/Dialog.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import {
    ValueDialog, ValueEditorEntryType, type IValueEditorEntry, type IValueEditorValueEntry,
} from "../components/ui/composites/ValueDialog.js";
import { type ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

interface IAdminSetupDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called when the initial admin has been created. */
    onSetupComplete: () => void;
}

/**
 * First-time setup dialog: creates the initial admin user when no users exist yet.
 * Built on {@link ValueDialog}.
 */
export class AdminSetupDialog extends UIComponent<IAdminSetupDialogProperties> {
    private valueDialogRef = createRef<ValueDialog>();

    public constructor(props: IAdminSetupDialogProperties) {
        super(props);
        this.state = {};
    }

    public open(): void {
        void this.showForm("");
    }

    public render() {
        return (
            <ValueDialog ref={this.valueDialogRef} />
        );
    }

    private buildEntries(): IValueEditorEntry[] {
        return [
            {
                type: ValueEditorEntryType.Title,
                id: "usernameTitle",
                content: "Username",
                displayWidth: 2,
            },
            {
                type: ValueEditorEntryType.Value,
                id: "username",
                content: "",
                placeholder: "Choose an admin username",
                displayWidth: 6,
            } as IValueEditorValueEntry,
            {
                type: ValueEditorEntryType.Title,
                id: "passwordTitle",
                content: "Password",
                displayWidth: 2,
            },
            {
                type: ValueEditorEntryType.Value,
                id: "password",
                content: "",
                placeholder: "At least 6 characters",
                password: true,
                displayWidth: 6,
            } as IValueEditorValueEntry,
            {
                type: ValueEditorEntryType.Title,
                id: "confirmTitle",
                content: "Confirm",
                displayWidth: 2,
            },
            {
                type: ValueEditorEntryType.Value,
                id: "confirmPassword",
                content: "",
                placeholder: "Repeat the password",
                password: true,
                displayWidth: 6,
            } as IValueEditorValueEntry,
            {
                type: ValueEditorEntryType.Title,
                id: "displayNameTitle",
                content: "Display Name",
                displayWidth: 2,
            },
            {
                type: ValueEditorEntryType.Value,
                id: "displayName",
                content: "",
                placeholder: "Administrator",
                displayWidth: 6,
            } as IValueEditorValueEntry,
        ];
    }

    private async showForm(previousError: string): Promise<void> {
        const { dataModel, onSetupComplete } = this.props;

        const result = await this.valueDialogRef.current?.show(
            "adminSetupDialog",
            "New Installation",
            Codicon.Rocket,
            this.buildEntries(),
            {
                acceptLabel: "Create Admin User",
                declineLabel: "",
                errorMessage: previousError,
                isDefault: true,
            },
        );

        if (result?.closure !== DialogResponseClosure.Accept) {
            return;
        }

        const username = (result.data.username as IValueEditorValueEntry).content as string;
        const password = (result.data.password as IValueEditorValueEntry).content as string;
        const confirmPassword = (result.data.confirmPassword as IValueEditorValueEntry).content as string;
        const displayName = (result.data.displayName as IValueEditorValueEntry).content as string;

        if (!username.trim() || !password) {
            void this.showForm("Username and password are required.");

            return;
        }

        if (username.trim().length < 3) {
            void this.showForm("Username must be at least 3 characters.");

            return;
        }

        if (password.length < 6) {
            void this.showForm("Password must be at least 6 characters.");

            return;
        }

        if (password !== confirmPassword) {
            void this.showForm("Passwords do not match.");

            return;
        }

        const res = await fetch("/api?action=createInitialAdmin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: username.trim(),
                password,
                displayName: displayName.trim() || username.trim(),
            }),
        });

        if (!res.ok) {
            const data = await res.json() as { error?: string; };

            void this.showForm(data.error ?? "Failed to create admin user.");

            return;
        }

        const data = await res.json() as {
            token: string; user: { id: number; username: string; displayName: string; isAdmin: boolean; };
            capabilities: {
                canEditScores: boolean; canManageUsers: boolean; canManageInstruments: boolean;
                canExportMP3: boolean;
            };
        };

        // Store the session directly.
        dataModel.setSession(data.token, data.user, data.capabilities);

        onSetupComplete();
    }
}
