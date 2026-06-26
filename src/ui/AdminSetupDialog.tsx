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

interface IAdminSetupDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called when the initial admin has been created. */
    onSetupComplete: () => void;
}

interface IAdminSetupDialogState {
    username: string;
    password: string;
    confirmPassword: string;
    displayName: string;
    groupName: string;
    errorMessage: string;
    loading: boolean;
}

/**
 * First-time setup dialog: creates the initial admin user when no users exist yet.
 */
export class AdminSetupDialog extends UIComponent<IAdminSetupDialogProperties, IAdminSetupDialogState> {
    private dialogRef = createRef<Dialog>();
    private displayNameRef = createRef<HTMLElement>();
    private setupSucceeded = false;

    public constructor(props: IAdminSetupDialogProperties) {
        super(props);

        this.state = {
            username: "",
            password: "",
            confirmPassword: "",
            displayName: "",
            groupName: "",
            errorMessage: "",
            loading: false,
        };
    }

    /**
     * Opens the dialog and resets all fields.
     */
    public open(): void {
        this.setupSucceeded = false;
        this.setState({
            username: "",
            password: "",
            confirmPassword: "",
            displayName: "",
            groupName: "",
            errorMessage: "",
            loading: false,
        }, () => {
            this.dialogRef.current?.open();
        });
    }

    public render(): ComponentChild {
        const { username, password, confirmPassword, displayName, groupName, errorMessage, loading }
            = this.state;

        return (
            <Dialog
                ref={this.dialogRef}
                id="adminSetupDialog"
                onClose={this.handleClose}
                actions={[
                    <Button
                        id="admin-setup-create"
                        type="button"
                        key="create"
                        caption="Finish Installation"
                        isDefault
                        disabled={loading}
                        onClick={this.handleCreateClick}
                    />,
                ]}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    style={{ marginBottom: "12px" }}
                >
                    <Icon
                        src={Codicon.Rocket}
                        style={{ fontSize: "24px", marginRight: "8px", color: "var(--color-primary)" }}
                    />
                    Finish Installation
                </Container>

                {/* Admin User block */}
                <Label
                    caption="Admin User"
                    className="font-semibold"
                    style={{ marginTop: "4px", marginBottom: "4px" }}
                />
                <Container className="settings-card" orientation={Orientation.TopDown}>
                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="settings-row-label"
                            caption="Username"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-username"
                            value={username}
                            placeholder="Choose an admin username"
                            autoFocus
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
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
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-password"
                            value={password}
                            placeholder="At least 6 characters"
                            password
                            showPasswordToggle
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
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
                            caption="Confirm"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-confirm"
                            value={confirmPassword}
                            placeholder="Repeat the password"
                            password
                            showPasswordToggle
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
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
                            caption="Display Name"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-display"
                            value={displayName}
                            placeholder="Administrator"
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
                        />
                    </Container>
                </Container>

                {/* Initial Group block */}
                <Label
                    caption="Initial Group"
                    className="font-semibold"
                    style={{ marginTop: "12px", marginBottom: "4px" }}
                />
                <Container className="settings-card" orientation={Orientation.TopDown}>
                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="settings-row-label"
                            caption="Group Name"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-group"
                            innerRef={this.displayNameRef}
                            value={groupName}
                            placeholder="My first group"
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
                            onConfirm={this.handleDisplayNameConfirm}
                        />
                    </Container>
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
            </Dialog>
        );
    }

    private handleChange = (e: InputEvent): void => {
        const target = e.target as HTMLInputElement;

        switch (target.id) {
            case "admin-username": {
                this.setState({ username: target.value, errorMessage: "" });
                break;
            }

            case "admin-password": {
                this.setState({ password: target.value, errorMessage: "" });
                break;
            }

            case "admin-confirm": {
                this.setState({ confirmPassword: target.value, errorMessage: "" });
                break;
            }

            case "admin-display": {
                this.setState({ displayName: target.value });
                break;
            }

            case "admin-group": {
                this.setState({ groupName: target.value });
                break;
            }

            default:
        }
    };

    private handleDisplayNameConfirm = (): void => {
        void this.attemptCreate();
    };

    private handleCreateClick = (): void => {
        void this.attemptCreate();
    };

    private handleClose = (): void => {
        // Allow closing via Escape without creating. The user can reopen via the UI.
    };

    private async attemptCreate(): Promise<void> {
        const { dataModel, onSetupComplete } = this.props;
        const { username, password, confirmPassword, displayName, groupName, loading } = this.state;

        if (loading) {
            return;
        }

        if (!username.trim() || !password) {
            this.setState({ errorMessage: "Username and password are required." });

            return;
        }

        if (username.trim().length < 3) {
            this.setState({ errorMessage: "Username must be at least 3 characters." });

            return;
        }

        if (password.length < 6) {
            this.setState({ errorMessage: "Password must be at least 6 characters." });

            return;
        }

        if (password !== confirmPassword) {
            this.setState({ errorMessage: "Passwords do not match." });

            return;
        }

        if (groupName.length > 0 && !groupName.trim()) {
            this.setState({ errorMessage: "Group name must not be only whitespace." });

            return;
        }

        this.setState({ loading: true, errorMessage: "" });

        const res = await fetch("/api?action=createInitialAdmin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: username.trim(),
                password,
                displayName: displayName.trim() || username.trim(),
                groupName: groupName.trim() || undefined,
            }),
        });

        if (!res.ok) {
            const data = await res.json() as { error?: string; };

            this.setState({
                loading: false,
                errorMessage: data.error ?? "Failed to create admin user.",
            });

            return;
        }

        const data = await res.json() as {
            token: string; user: { id: number; username: string; displayName: string; isAdmin: boolean; };
            capabilities: {
                canEditScores: boolean; canManageUsers: boolean; canManageInstruments: boolean;
                canExportMP3: boolean;
            };
        };

        dataModel.setSession(data.token, data.user, data.capabilities);

        this.setupSucceeded = true;
        this.dialogRef.current?.close(false);

        onSetupComplete();
    }
}
