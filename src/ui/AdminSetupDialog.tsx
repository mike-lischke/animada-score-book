/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { ConfirmationReloadResult, EmailConfirmationDialog } from "./EmailConfirmationDialog.js";

interface IAdminSetupDialogState {
    email: string;
    password: string;
    confirmPassword: string;
    displayName: string;
    groupName: string;
    errorMessage: string;

    /** A neutral confirmation, such as the note that a new link went out. */
    notice: string;
    loading: boolean;

    /** The address a confirmation link was sent to, once the form has been submitted. */
    pendingEmail: string;
}

export interface IAdminSetupDialogProperties extends ICommonUIProperties {
    /** True on phones (viewport up to 600 px), which hands the narrower layout to the sub-dialogs. */
    compact?: boolean;

    /**
     * Called when the operator asks to continue after confirming the link. The callback checks the installation and
     * signs in; without it the confirmation dialog reloads the document.
     */
    onContinue?: (email: string, password: string) => Promise<ConfirmationReloadResult>;
}

/**
 * First-time setup dialog: asks for the initial admin and mails the link that finishes the installation. Until that
 * link is opened, the installation holds no account at all, so the dialog stays open and explains what to do.
 */
export class AdminSetupDialog extends UIComponent<IAdminSetupDialogProperties, IAdminSetupDialogState> {
    private dialogRef = createRef<Dialog | null>();
    private confirmationRef = createRef<EmailConfirmationDialog | null>();
    private groupNameRef = createRef<HTMLElement | null>();

    public constructor(props: IAdminSetupDialogProperties) {
        super(props);

        this.state = {
            email: "",
            password: "",
            confirmPassword: "",
            displayName: "",
            groupName: "",
            errorMessage: "",
            notice: "",
            loading: false,
            pendingEmail: "",
        };
    }

    /**
     * Opens the dialog and resets all fields.
     */
    public open(): void {
        this.setState({
            email: "",
            password: "",
            confirmPassword: "",
            displayName: "",
            groupName: "",
            errorMessage: "",
            notice: "",
            loading: false,
            pendingEmail: "",
        }, () => {
            this.openCurrentDialog();
        });
    }

    public render(): ComponentChild {
        const { compact } = this.props;
        const { loading, pendingEmail, notice, errorMessage } = this.state;

        if (pendingEmail !== "") {
            return (
                <EmailConfirmationDialog
                    ref={this.confirmationRef}
                    email={pendingEmail}
                    compact={compact}
                    loading={loading}
                    notice={notice}
                    errorMessage={errorMessage}
                    onResend={this.handleSendAgain}
                    onReload={this.handleReload}
                />
            );
        }

        const actions = [
            <Button
                id="admin-setup-create"
                type="button"
                key="create"
                caption="Finish Installation"
                isDefault
                disabled={loading}
                onClick={this.handleCreateClick}
            />,
        ];

        return (
            <Dialog
                ref={this.dialogRef}
                id="adminSetupDialog"
                onClose={this.handleClose}
                actions={actions}
            >
                {this.renderForm(loading)}
            </Dialog>
        );
    }

    /**
     * @param value The address as typed.
     *
     * @returns Whether the value has the shape of an email address. The backend checks again.
     */
    private static looksLikeEmail(value: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    /**
     * Opens the dialog that matches the current state, since the form and the confirmation are separate dialogs.
     */
    private openCurrentDialog(): void {
        const { pendingEmail } = this.state;

        if (pendingEmail === "") {
            this.dialogRef.current?.open();
        } else {
            this.confirmationRef.current?.open();
        }
    }

    /**
     * @param loading Whether a request is running, which disables the fields.
     *
     * @returns The form that asks for the administrator.
     */
    private renderForm(loading: boolean): ComponentChild {
        const { email, password, confirmPassword, displayName, groupName, errorMessage } = this.state;

        return (
            <>
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    style={{ marginBottom: "12px" }}
                >
                    <Icon
                        src={UIIcon.Rocket}
                        style={{ fontSize: "24px", marginRight: "8px", color: "var(--color-primary)" }}
                    />
                    Finish Installation
                </Container>

                <Label
                    caption="Admin User"
                    className="font-semibold"
                    style={{ marginTop: "4px", marginBottom: "4px" }}
                />
                <Container className="form-card" orientation={Orientation.TopDown}>
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="form-row-label"
                            caption="Email"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-email"
                            value={email}
                            placeholder="you@example.com"
                            autoFocus
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
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
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="form-row-label"
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
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="form-row-label"
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

                <Label
                    caption="Initial Group"
                    className="font-semibold"
                    style={{ marginTop: "12px", marginBottom: "4px" }}
                />
                <Container className="form-card" orientation={Orientation.TopDown}>
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label
                            className="form-row-label"
                            caption="Group Name"
                            style={{ minWidth: "100px" }}
                        />
                        <Input
                            id="admin-group"
                            innerRef={this.groupNameRef}
                            value={groupName}
                            placeholder="My first group"
                            autoComplete
                            disabled={loading}
                            style={{ padding: "3px" }}
                            onChange={this.handleChange}
                            onConfirm={this.handleGroupNameConfirm}
                        />
                    </Container>
                </Container>

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
            </>
        );
    }

    private handleChange = (e: InputEvent): void => {
        const target = e.target as HTMLInputElement;

        switch (target.id) {
            case "admin-email": {
                this.setState({ email: target.value, errorMessage: "" });
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

    private handleGroupNameConfirm = (): void => {
        void this.attemptCreate();
    };

    private handleCreateClick = (): void => {
        void this.attemptCreate();
    };

    private handleSendAgain = (): void => {
        // The backend replaces the pending confirmation, so the mail carries a new link and the old one stops working.
        void this.attemptCreate();
    };

    /**
     * @returns What the check of the installation found out; the credentials of the last submission let the callback
     * sign in right away, so the operator can start without typing them again.
     */
    private handleReload = async (): Promise<ConfirmationReloadResult> => {
        const { email, password } = this.state;
        const { onContinue } = this.props;

        if (!onContinue) {
            return ConfirmationReloadResult.NotConfirmed;
        }

        return onContinue(email.trim().toLowerCase(), password);
    };

    private handleClose = (): void => {
        // Allow closing via Escape without creating. The user can reopen via the UI.
    };

    private async attemptCreate(): Promise<void> {
        const { email, password, confirmPassword, displayName, groupName, loading, pendingEmail } = this.state;

        if (loading) {
            return;
        }

        if (!email.trim() || !password) {
            this.setState({ errorMessage: "Email address and password are required." });

            return;
        }

        if (!AdminSetupDialog.looksLikeEmail(email.trim())) {
            this.setState({ errorMessage: "Please enter a valid email address." });

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

        this.setState({ loading: true, errorMessage: "", notice: "" });

        const address = email.trim().toLowerCase();
        const res = await fetch("/api?action=createInitialAdmin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: address,
                password,
                displayName: displayName.trim() || address,
                groupName: groupName.trim() || undefined,
            }),
        });

        if (!res.ok) {
            const data = await res.json() as { error?: string; };

            this.setState({
                loading: false,
                errorMessage: data.error ?? "Failed to start the installation.",
            });

            return;
        }

        this.setState({
            loading: false,
            pendingEmail: address,
            notice: pendingEmail === "" ? "" : "A new confirmation link was sent.",
        }, () => {
            if (pendingEmail === "") {
                this.openCurrentDialog();
            }
        });
    }
}
