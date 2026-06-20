/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef } from "preact";

import {
    ValueDialog, ValueEditorEntryType, type IValueEditorEntry, type IValueEditorValueEntry,
} from "../components/ui/composites/ValueDialog.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { DialogResponseClosure } from "../components/ui/framework/Dialog.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { type ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

interface ILoginDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called when login succeeds. */
    onLoginSuccess?: () => void;

    /** Called when the user chooses to continue anonymously. */
    onContinueAnonymous?: () => void;
}

/**
 * A modal dialog for user authentication, built on {@link ValueDialog}.
 */
export class LoginDialog extends UIComponent<ILoginDialogProperties> {
    private valueDialogRef = createRef<ValueDialog>();

    public constructor(props: ILoginDialogProperties) {
        super(props);
        this.state = {};
    }

    /**
     * Opens the dialog and starts the login flow.
     */
    public open(): void {
        void this.showLoginForm("");
    }

    public render() {
        return (
            <ValueDialog ref={this.valueDialogRef} />
        );
    }

    private buildEntries(username: string, password: string): IValueEditorEntry[] {
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
                content: username,
                placeholder: "Enter your username",
                displayWidth: 6,
                onConfirm: () => {
                    document.getElementById("password")?.focus();
                },
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
                content: password,
                placeholder: "Enter your password",
                password: true,
                displayWidth: 6,
                onConfirm: () => {
                    this.valueDialogRef.current?.triggerAccept();
                },
            },
        ];
    }

    private async showLoginForm(previousError: string): Promise<void> {
        const { dataModel, onLoginSuccess, onContinueAnonymous } = this.props;

        const result = await this.valueDialogRef.current?.show(
            "loginDialog",
            "Sign In",
            Codicon.Account,
            this.buildEntries("", ""),
            {
                acceptLabel: "Log In",
                declineLabel: "Continue Anonymously",
                errorMessage: previousError,
                isDefault: true,
            },
        );

        if (!result || result.closure === DialogResponseClosure.Cancel) {
            onContinueAnonymous?.();

            return;
        }

        if (result.closure === DialogResponseClosure.Decline) {
            onContinueAnonymous?.();

            return;
        }

        // Accept — extract values and attempt login.
        const username = (result.data.username as IValueEditorValueEntry).content as string;
        const password = (result.data.password as IValueEditorValueEntry).content as string;

        if (!username.trim() || !password) {
            void this.showLoginForm("Username and password are required.");

            return;
        }

        const success = await dataModel.login(username.trim(), password);

        if (success) {
            onLoginSuccess?.();

            return;
        }

        // Login failed — re-show with error.
        void this.showLoginForm("Invalid username or password.");
    }
}
