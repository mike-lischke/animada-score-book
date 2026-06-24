/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { type ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

enum LoginMode {
    User,
    Group,
}

interface ILoginDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called when login succeeds. */
    onLoginSuccess?: () => void;

    /** Called when the user chooses to continue anonymously. */
    onContinueAnonymous?: () => void;
}

interface ILoginDialogState {
    loginMode: LoginMode;
    username: string;
    password: string;

    /** Group login fields. */
    groupName: string;
    groupPassword: string;
    groupNames: string[];
    loadingGroups: boolean;

    errorMessage: string;
}

/**
 * A modal dialog for user authentication, styled like {@link SettingsDialog}.
 */
export class LoginDialog extends UIComponent<ILoginDialogProperties, ILoginDialogState> {
    private dialogRef = createRef<Dialog>();
    private passwordRef = createRef<HTMLElement>();
    private groupPasswordRef = createRef<HTMLElement>();
    private loginSucceeded = false;

    public constructor(props: ILoginDialogProperties) {
        super(props);

        this.state = {
            loginMode: LoginMode.User,
            username: "",
            password: "",
            groupName: "",
            groupPassword: "",
            groupNames: [],
            loadingGroups: false,
            errorMessage: "",
        };
    }

    /**
     * Opens the dialog and resets all fields.
     */
    public open(): void {
        this.loginSucceeded = false;
        this.setState({
            loginMode: LoginMode.User,
            username: "",
            password: "",
            groupName: "",
            groupPassword: "",
            groupNames: [],
            loadingGroups: true,
            errorMessage: "",
        }, () => {
            this.dialogRef.current?.open();
            void this.loadGroupNames();
        });
    }

    public render(): ComponentChild {
        const { loginMode, username, password, groupName, groupPassword, groupNames, loadingGroups, errorMessage } =
            this.state;

        const groupDropdownItems: IDropdownItem[] = groupNames.map((name) => {
            return {
                label: name,
                onClick: () => {
                    this.setState({ groupName: name, errorMessage: "" }, () => {
                        this.groupPasswordRef.current?.focus();
                    });
                },
            };
        });

        return (
            <Dialog
                ref={this.dialogRef}
                id="loginDialog"
                onClose={this.handleClose}
                actions={[
                    <Button
                        id="login-button-anonymous"
                        caption="Continue Anonymously"
                        onClick={this.handleAnonymousClick}
                    />,
                    <Button
                        id="login-button-login"
                        type="button"
                        caption="Log In"
                        onClick={this.handleLoginClick}
                    />,
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

                {/* Tab switcher */}
                <Container
                    orientation={Orientation.LeftToRight}
                    style={{ marginTop: "12px", gap: "4px" }}
                >
                    <Button
                        caption="User"
                        className={loginMode === LoginMode.User ? "du-btn-active" : "du-btn-ghost"}
                        onClick={() => {
                            this.setState({ loginMode: LoginMode.User, errorMessage: "" });
                        }}
                    />
                    <Button
                        caption="Group"
                        className={loginMode === LoginMode.Group ? "du-btn-active" : "du-btn-ghost"}
                        onClick={() => {
                            this.setState({ loginMode: LoginMode.Group, errorMessage: "" });
                        }}
                    />
                </Container>

                <Container className="settings-card" orientation={Orientation.TopDown}>
                    {loginMode === LoginMode.User ? (
                        <>
                            <Container
                                className="settings-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="settings-row-label"
                                    caption="Username"
                                    style={{ minWidth: "80px" }}
                                />
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
                                <Label
                                    className="settings-row-label"
                                    caption="Password"
                                    style={{ minWidth: "80px" }}
                                />
                                <Input
                                    id="login-password"
                                    innerRef={this.passwordRef}
                                    value={password}
                                    placeholder="Enter your password"
                                    password
                                    showPasswordToggle
                                    autoComplete
                                    style={{ padding: "3px" }}
                                    onChange={this.handlePasswordChange}
                                    onConfirm={this.handlePasswordConfirm}
                                />
                            </Container>
                        </>
                    ) : (
                        <>
                            <Container
                                className="settings-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="settings-row-label"
                                    caption="Group"
                                    style={{ minWidth: "80px" }}
                                />
                                <Dropdown
                                    caption={
                                        groupName
                                            ? groupName
                                            : (loadingGroups
                                                ? "Loading…"
                                                : (groupNames.length === 0 ? "No groups available" : "Select a group"))
                                    }
                                    items={groupDropdownItems}
                                    selectedItem={groupName}
                                    closeOnSelect
                                    disabled={loadingGroups || groupNames.length === 0}
                                />
                            </Container>

                            <Container
                                className="settings-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="settings-row-label"
                                    caption="Password"
                                    style={{ minWidth: "80px" }}
                                />
                                <Input
                                    id="login-group-password"
                                    innerRef={this.groupPasswordRef}
                                    value={groupPassword}
                                    placeholder="Enter group password"
                                    password
                                    showPasswordToggle
                                    autoFocus
                                    disabled={groupNames.length === 0}
                                    style={{ padding: "3px" }}
                                    onChange={this.handleGroupPasswordChange}
                                    onConfirm={this.handleGroupPasswordConfirm}
                                />
                            </Container>
                        </>
                    )}

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

    private async loadGroupNames(): Promise<void> {
        const { dataModel } = this.props;

        try {
            const names = await dataModel.listPublicGroups();
            this.setState({ groupNames: names, loadingGroups: false });
        } catch {
            this.setState({ loadingGroups: false });
        }
    }

    private handleUsernameChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ username: props.value ?? "", errorMessage: "" });
    };

    private handleUsernameConfirm = (): void => {
        this.passwordRef.current?.focus();
    };

    private handlePasswordChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ password: props.value ?? "", errorMessage: "" });
    };

    private handlePasswordConfirm = (): void => {
        void this.attemptLogin();
    };

    private handleGroupPasswordChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ groupPassword: props.value ?? "", errorMessage: "" });
    };

    private handleGroupPasswordConfirm = (): void => {
        void this.attemptLogin();
    };

    private handleClose = (): void => {
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

    private handleAnonymousClick = (): void => {
        this.dialogRef.current?.close(true);
    };

    private async attemptLogin(): Promise<void> {
        const { dataModel, onLoginSuccess } = this.props;
        const { loginMode, username, password, groupName, groupPassword } = this.state;

        if (loginMode === LoginMode.Group) {
            if (!groupName.trim() || !groupPassword) {
                this.setState({ errorMessage: "Group and password are required." });

                return;
            }

            const success = await dataModel.groupLogin(groupName.trim(), groupPassword);

            if (success) {
                this.loginSucceeded = true;
                this.dialogRef.current?.close(false);
                onLoginSuccess?.();

                return;
            }

            this.setState({ errorMessage: "Invalid group or password." });

            return;
        }

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
