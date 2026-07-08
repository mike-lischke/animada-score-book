/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Semaphore } from "../supplement/Semaphore.js";
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

    /** When true, the anonymous and cancel options are hidden — login is mandatory. */
    requireLogin: boolean;
}

/**
 * A modal dialog for user authentication, styled like {@link SettingsDialog}.
 */
export class LoginDialog extends UIComponent<ILoginDialogProperties, ILoginDialogState> {
    private dialogRef = createRef<Dialog>();
    private passwordRef = createRef<HTMLElement>();
    private groupPasswordRef = createRef<HTMLElement>();
    private loginSucceeded = false;
    private signal?: Semaphore<boolean>;

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
            requireLogin: false,
        };
    }

    /**
     * Opens the dialog and returns a promise that resolves with true when login succeeds,
     * or false when the dialog is dismissed anonymously or cancelled.
     *
     * @param requireLogin When true, the anonymous and cancel options are hidden.
     *
     * @returns A promise that resolves with the login result.
     */
    public async show(requireLogin = false): Promise<boolean> {
        this.signal = new Semaphore<boolean>();
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
            requireLogin,
        }, () => {
            this.dialogRef.current?.open();
            void this.loadGroupNames();
        });

        return this.signal.wait();
    }

    public render(): ComponentChild {
        const { loginMode, username, password, groupName, groupPassword, groupNames, loadingGroups,
            errorMessage, requireLogin } = this.state;

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

        const actions: ComponentChild[] = [];

        if (!requireLogin) {
            actions.push(
                <Button
                    id="login-button-anonymous"
                    caption="Continue Anonymously"
                    onClick={this.handleAnonymousClick}
                />,
            );
        }

        actions.push(
            <Button
                id="login-button-login"
                type="button"
                caption="Log In"
                onClick={this.handleLoginClick}
            />,
        );

        return (
            <Dialog
                ref={this.dialogRef}
                id="loginDialog"
                onClose={this.handleClose}
                actions={actions}
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

                <Container className="form-card" orientation={Orientation.TopDown}>
                    {loginMode === LoginMode.User ? (
                        <>
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="form-row-label"
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
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="form-row-label"
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
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="form-row-label"
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
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="form-row-label"
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
                            className="form-row"
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
        const { requireLogin } = this.state;

        if (this.loginSucceeded || requireLogin) {
            return;
        }

        this.signal?.notify(false);
    };

    private handleLoginClick = (): void => {
        void this.attemptLogin();
    };

    private handleAnonymousClick = (): void => {
        this.signal?.notify(false);
        this.dialogRef.current?.close(true);
    };

    private async attemptLogin(): Promise<void> {
        const { dataModel } = this.props;
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
                this.signal?.notify(true);

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
            this.signal?.notify(true);

            return;
        }

        this.setState({ errorMessage: "Invalid username or password." });
    }
}
