/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { type ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

interface ILoginDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called when login succeeds. */
    onLoginSuccess?: () => void;

    /** Called when the user chooses to continue anonymously. */
    onContinueAnonymous?: () => void;
}

interface ILoginDialogState {
    username: string;
    password: string;
    errorMessage: string;
}

/**
 * A modal dialog for user authentication, styled like {@link SettingsDialog}.
 */
export class LoginDialog extends UIComponent<ILoginDialogProperties, ILoginDialogState> {
    private dialogRef = createRef<Dialog>();
    private passwordRef = createRef<HTMLElement>();
    private loginSucceeded = false;

    public constructor(props: ILoginDialogProperties) {
        super(props);

        this.state = {
            username: "",
            password: "",
            errorMessage: "",
        };
    }

    /**
     * Opens the dialog and resets all fields.
     */
    public open(): void {
        this.loginSucceeded = false;
        this.setState({ username: "", password: "", errorMessage: "" }, () => {
            this.dialogRef.current?.open();
        });
    }

    public render(): ComponentChild {
        const { username, password, errorMessage } = this.state;

        return (
            <Dialog
                ref={this.dialogRef}
                id="loginDialog"
                onClose={this.handleClose}
                actions={[
                    <Button id="login-button-anonymous" value="anonymous" caption="Continue Anonymously" />,
                    <Button id="login-button-login" type="button" caption="Log In" onClick={this.handleLoginClick} />,
                ]}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Account} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Sign In
                </Container>

                <Container className="settings-card" orientation={Orientation.TopDown}>
                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label className="settings-row-label" caption="Username" style={{ minWidth: "80px" }} />
                        <Input
                            id="login-username"
                            value={username}
                            placeholder="Enter your username"
                            autoFocus
                            autoComplete
                            style={{ padding: "3px" }}
                            onChange={this.handleUsernameChange}
                            onConfirm={this.handleUsernameConfirm}
                        />
                    </Container>

                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label className="settings-row-label" caption="Password" style={{ minWidth: "80px" }} />
                        <Input
                            id="login-password"
                            innerRef={this.passwordRef}
                            value={password}
                            placeholder="Enter your password"
                            password
                            autoComplete
                            style={{ padding: "3px" }}
                            onChange={this.handlePasswordChange}
                            onConfirm={this.handlePasswordConfirm}
                        />
                    </Container>

                    {errorMessage && (
                        <Container
                            className="settings-row"
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label
                                caption={errorMessage}
                                style={{ color: "var(--color-error)", fontSize: "13px" }}
                            />
                        </Container>
                    )}
                </Container>
            </Dialog>
        );
    }

    private handleUsernameChange = (_e: Event, props: { value?: string; }): void => {
        this.setState({ username: props.value ?? "", errorMessage: "" });
    };

    private handleUsernameConfirm = (_e: KeyboardEvent, _props: { value?: string; }): void => {
        this.passwordRef.current?.focus();
    };

    private handlePasswordChange = (_e: Event, props: { value?: string; }): void => {
        this.setState({ password: props.value ?? "", errorMessage: "" });
    };

    private handlePasswordConfirm = (_e: KeyboardEvent, _props: { value?: string; }): void => {
        void this.attemptLogin();
    };

    private handleClose = (_returnValue: string): void => {
        if (this.loginSucceeded) {
            return;
        }

        // "anonymous", "" (Escape key), or "cancel" — continue anonymously.
        const { onContinueAnonymous } = this.props;
        onContinueAnonymous?.();
    };

    private handleLoginClick = (): void => {
        void this.attemptLogin();
    };

    private async attemptLogin(): Promise<void> {
        const { dataModel, onLoginSuccess } = this.props;
        const { username, password } = this.state;

        if (!username.trim() || !password) {
            this.setState({ errorMessage: "Username and password are required." });

            return;
        }

        const success = await dataModel.login(username.trim(), password);

        if (success) {
            this.loginSucceeded = true;
            this.dialogRef.current?.close(false);
            onLoginSuccess?.();

            return;
        }

        this.setState({ errorMessage: "Invalid username or password." });
    }
}
