/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { ProgressIndicator } from "../components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { DatabaseEngine } from "../server/database.js";

export interface IBackendSetupResult {
    engine: DatabaseEngine;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

export enum BackendSetupState {
    /** Still checking backend status. */
    Checking,

    /** Backend is reachable and initialised — nothing to do. */
    Ready,

    /** Backend reachable but not initialised — show setup form. */
    NeedsSetup,

    /** Backend not reachable at all. */
    Unreachable,

    /** Testing the connection (spinner). */
    Testing,

    /** Initialising the database (spinner). */
    Initialising,

    /** Asking user to confirm overwrite of existing data. */
    ConfirmOverwrite,

    /** Setup completed successfully. */
    Done,

    /** An error occurred. */
    Error,
}

interface IBackendSetupDialogState {
    phase: BackendSetupState;
    engine: DatabaseEngine;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    errorMessage: string;
    /** True after a successful connection test, so the form shows a green indicator. */
    lastTestSucceeded: boolean;
    /** Whether the password field is currently visible. */
    showPassword: boolean;
    /** Whether Caps Lock is currently active. */
    capsLockOn: boolean;
}

const engineLabels: Record<DatabaseEngine, string> = {
    [DatabaseEngine.MySQL]: "MySQL",
    [DatabaseEngine.MariaDB]: "MariaDB",
    [DatabaseEngine.Postgres]: "PostgreSQL",
};

const defaultPorts: Record<DatabaseEngine, number> = {
    [DatabaseEngine.MySQL]: 3306,
    [DatabaseEngine.MariaDB]: 3306,
    [DatabaseEngine.Postgres]: 5432,
};

interface IBackendSetupDialogProperties extends ICommonUIProperties {
    onSetupComplete?: () => void;
}

export class BackendSetupDialog extends UIComponent<IBackendSetupDialogProperties, IBackendSetupDialogState> {
    private dialogRef = createRef<Dialog>();

    public constructor(props: IBackendSetupDialogProperties) {
        super(props);

        this.state = {
            phase: BackendSetupState.Checking,
            engine: DatabaseEngine.MySQL,
            host: "127.0.0.1",
            port: 3306,
            database: "animada_score_book",
            user: "root",
            password: "",
            errorMessage: "",
            lastTestSucceeded: false,
            showPassword: false,
            capsLockOn: false,
        };
    }

    /** Opens the dialog and starts the health check. */
    public open(): void {
        this.setState({ phase: BackendSetupState.Checking, errorMessage: "", }, () => {
            this.dialogRef.current?.open();
            void this.checkBackendStatus();
        });

        document.addEventListener("keydown", this.handleGlobalKeyDown);
        document.addEventListener("keyup", this.handleGlobalKeyUp);
    }

    public render(): ComponentChild {
        const { phase, engine, host, port, database, user, password, errorMessage } = this.state;

        const isBusy = phase === BackendSetupState.Checking
            || phase === BackendSetupState.Testing
            || phase === BackendSetupState.Initialising;

        const canEdit = phase === BackendSetupState.NeedsSetup
            || phase === BackendSetupState.Unreachable
            || phase === BackendSetupState.Error;

        let content: ComponentChild;

        switch (phase) {
            case BackendSetupState.Checking: {
                content = (
                    <>
                        <Label caption="Checking backend connection …" />
                        <ProgressIndicator linear />
                    </>
                );

                break;
            }

            case BackendSetupState.Ready: {
                content = (
                    <>
                        <Label caption="Backend is already configured and running." />
                        <Icon
                            src={Codicon.Check}
                            style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-success)" }}
                        />
                    </>
                );

                break;
            }

            case BackendSetupState.Unreachable: {
                content = (
                    <Container orientation={Orientation.LeftToRight} crossAlignment={ChildAlignment.Center}>
                        <Icon
                            src={Codicon.Warning}
                            style={{
                                fontSize: "24px",
                                fontWeight: 800,
                                color: "var(--color-warning)",
                                marginRight: "8px",
                            }}
                        />
                        <Label caption="Backend is not reachable. Is it running?" />
                    </Container>
                );

                break;
            }

            case BackendSetupState.NeedsSetup:
            case BackendSetupState.Error: {
                content = this.renderSetupForm(engine, host, port, database, user, password, canEdit, errorMessage);

                break;
            }

            case BackendSetupState.Testing: {
                content = (
                    <>
                        <Label caption="Testing database connection…" />
                        <ProgressIndicator linear />
                    </>
                );

                break;
            }

            case BackendSetupState.Initialising:
                content = (
                    <>
                        <Label caption="Creating database tables…" />
                        <ProgressIndicator linear />
                    </>
                );

                break;

            case BackendSetupState.Done: {
                content = (
                    <>
                        <Label caption="Database setup complete! You can now use the app." />
                        <Icon
                            src={Codicon.Check}
                            style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-success)" }}
                        />
                    </>
                );

                break;
            }

            case BackendSetupState.ConfirmOverwrite: {
                content = (
                    <Container
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Center}
                        style={{ flex: "1 1 auto" }}
                    >
                        <Icon
                            src={Codicon.Warning}
                            style={{ fontSize: "48px", color: "var(--color-warning)", marginBottom: "12px" }}
                        />
                        <Label caption="Database already contains data." heading wrap />
                        <Label
                            caption="Initializing will delete all existing scores and folders."
                            style={{ marginTop: "4px" }} wrap
                        />
                        <Label
                            caption="Do you want to continue?"
                            style={{ marginTop: "16px" }}
                            wrap
                        />
                    </Container>
                );

                break;
            }

            default:
        }

        let actions: ComponentChild[];

        if (phase === BackendSetupState.Ready || phase === BackendSetupState.Done) {
            actions = [
                <Button id="backend-setup-close" value="close" caption="Close" />,
            ];
        } else if (phase === BackendSetupState.Unreachable) {
            actions = [
                <Button
                    id="backend-setup-retry"
                    caption="Retry"
                    onClick={(e) => {
                        e.preventDefault();
                        this.setState({ phase: BackendSetupState.Checking, errorMessage: "" }, () => {
                            void this.checkBackendStatus();
                        });
                    }}
                />,
            ];
        } else if (phase === BackendSetupState.ConfirmOverwrite) {
            actions = [
                <Button
                    id="backend-setup-confirm-overwrite"
                    caption="Yes, overwrite"
                    onClick={(e) => {
                        e.preventDefault();
                        void this.doInitializeDatabase(true);
                    }}
                />,
                <Button id="backend-setup-cancel" value="cancel" caption="Cancel" />,
            ];
        } else if (isBusy) {
            actions = [];
        } else {
            actions = [
                <Button
                    id="backend-setup-test"
                    caption="Test Connection"
                    disabled={isBusy}
                    onClick={(e) => {
                        e.preventDefault();
                        void this.testConnection();
                    }}
                />,
                <Button
                    id="backend-setup-init"
                    caption="Initialize Database"
                    disabled={isBusy}
                    onClick={(e) => {
                        e.preventDefault();
                        void this.initializeDatabase();
                    }}
                />,
                <Button id="backend-setup-cancel" value="cancel" caption="Cancel" />,
            ];
        }

        return (
            <Dialog
                ref={this.dialogRef}
                id="backendSetupDialog"
                onClose={this.handleClose}
                actions={actions}
            >
                <Container
                    id="backend-setup-header"
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Database} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Database Setup
                </Container>

                <Container
                    mainAlignment={ChildAlignment.Stretch}
                    crossAlignment={ChildAlignment.Center}
                    style={{ gap: "12px" }}
                >
                    {content}
                </Container>

            </Dialog>
        );
    }

    private removeGlobalListeners(): void {
        document.removeEventListener("keydown", this.handleGlobalKeyDown);
        document.removeEventListener("keyup", this.handleGlobalKeyUp);
    }

    private handleGlobalKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "CapsLock") {
            this.setState({ capsLockOn: e.getModifierState("CapsLock") });
        }
    };

    private handleGlobalKeyUp = (e: KeyboardEvent): void => {
        if (e.key === "CapsLock") {
            this.setState({ capsLockOn: e.getModifierState("CapsLock") });
        }
    };

    private renderSetupForm(engine: DatabaseEngine, host: string, port: number, database: string, user: string,
        password: string, canEdit: boolean, errorMessage: string): ComponentChild {
        const { lastTestSucceeded } = this.state;

        return (
            <Container className="form-card" orientation={Orientation.TopDown}>
                {errorMessage && (
                    <Container
                        className="text-error bg-error/10 rounded p-2"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ marginBottom: "12px" }}>
                        <Icon src={Codicon.Error}
                            style={{ fontSize: "16px", marginRight: "8px" }} />
                        <Label caption={errorMessage} wrap />
                    </Container>
                )}

                {lastTestSucceeded && (
                    <Container
                        className="text-success bg-success/10 rounded p-2"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ marginBottom: "12px" }}
                    >
                        <Icon src={Codicon.Check}
                            style={{ fontSize: "16px", marginRight: "8px" }} />
                        <Label caption="Connection successful. You can now initialize the database." />
                    </Container>
                )}

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">Database Engine</span>
                    <Dropdown
                        caption={engineLabels[engine]}
                        items={Object.values(DatabaseEngine).map((e) => {
                            return {
                                label: engineLabels[e],
                                onClick: () => {
                                    this.setState({
                                        engine: e,
                                        port: defaultPorts[e],
                                    });
                                },
                            };
                        })}
                        selectedItem={engineLabels[engine]}
                        closeOnSelect
                    />
                </Container>

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">Host</span>
                    <Input
                        value={host}
                        disabled={!canEdit}
                        style={{ width: "200px" }}
                        onChange={(e) => {
                            this.setState({ host: (e.target as HTMLInputElement).value });
                        }}
                    />
                </Container>

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">Port</span>
                    <Input
                        value={String(port)}
                        disabled={!canEdit}
                        style={{ width: "100px" }}
                        onChange={(e) => {
                            const v = Number((e.target as HTMLInputElement).value);

                            if (Number.isFinite(v)) {
                                this.setState({ port: v });
                            }
                        }}
                    />
                </Container>

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">Database Name</span>
                    <Input
                        value={database}
                        disabled={!canEdit}
                        style={{ width: "200px" }}
                        onChange={(e) => {
                            this.setState({ database: (e.target as HTMLInputElement).value });
                        }}
                    />
                </Container>

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">User</span>
                    <Input
                        value={user}
                        disabled={!canEdit}
                        style={{ width: "200px" }}
                        onChange={(e) => {
                            this.setState({ user: (e.target as HTMLInputElement).value });
                        }}
                    />
                </Container>

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="form-row-label">Password</span>
                    <Container orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ position: "relative", width: "200px" }}>
                        {this.state.capsLockOn && (
                            <span title="Caps Lock is on — password may be typed incorrectly"
                                style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                                <Icon src={Codicon.Warning}
                                    style={{
                                        fontSize: "14px", color: "var(--color-warning)",
                                        marginRight: "4px",
                                    }} />
                            </span>
                        )}
                        <Input
                            password={!this.state.showPassword}
                            value={password}
                            disabled={!canEdit}
                            style={{ width: "100%", paddingRight: "28px" }}
                            onChange={(e) => {
                                this.setState({ password: (e.target as HTMLInputElement).value });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "CapsLock") {
                                    // getModifierState may return stale value for the CapsLock key itself.
                                    this.setState({ capsLockOn: e.getModifierState("CapsLock") });
                                } else {
                                    this.setState({ capsLockOn: e.getModifierState("CapsLock") });
                                }
                            }}
                        />
                        <Button
                            imageOnly
                            className="btn-ghost absolute right-0"
                            style={{ position: "absolute", right: "2px", minWidth: "24px", height: "24px" }}
                            title={this.state.showPassword ? "Hide password" : "Show password"}
                            onClick={(e) => {
                                e.preventDefault();
                                this.setState({ showPassword: !this.state.showPassword });
                            }}
                        >
                            <Icon src={this.state.showPassword ? Codicon.EyeClosed : Codicon.Eye}
                                style={{ fontSize: "14px" }} />
                        </Button>
                    </Container>
                </Container>
            </Container>
        );
    }

    private handleClose = (returnValue: string): void => {
        this.removeGlobalListeners();

        if (returnValue === "retry") {
            // Re-open the dialog for the re-check; the normal retry button prevents form submission,
            // but this guards against any other path that might close the dialog with "retry".
            this.setState({ phase: BackendSetupState.Checking, errorMessage: "" }, () => {
                document.addEventListener("keydown", this.handleGlobalKeyDown);
                document.addEventListener("keyup", this.handleGlobalKeyUp);
                this.dialogRef.current?.open();
                void this.checkBackendStatus();
            });

            return;
        }

        // "cancel" from ConfirmOverwrite: go back to form.
        if (returnValue === "cancel" && this.state.phase === BackendSetupState.ConfirmOverwrite) {
            this.setState({ phase: BackendSetupState.NeedsSetup });

            return;
        }

        // "close" or "cancel": notify parent if setup is done so the app can proceed.
        if (returnValue === "close") {
            const { phase } = this.state;

            if (phase === BackendSetupState.Ready || phase === BackendSetupState.Done) {
                this.props.onSetupComplete?.();
            }
        }
    };

    private async checkBackendStatus(): Promise<void> {
        try {
            const res = await fetch("/api?action=health");

            if (!res.ok) {
                this.setState({ phase: BackendSetupState.Unreachable });

                return;
            }

            const data = await res.json() as { status: string; initialized: boolean; engine: string; };

            if (data.initialized) {
                const validEngines = new Set<string>(Object.values(DatabaseEngine));
                const engine = validEngines.has(data.engine)
                    ? data.engine as DatabaseEngine
                    : DatabaseEngine.MySQL;
                this.setState({
                    phase: BackendSetupState.Ready,
                    engine,
                });
            } else {
                this.setState({ phase: BackendSetupState.NeedsSetup });
            }
        } catch {
            this.setState({ phase: BackendSetupState.Unreachable });
        }
    }

    private async testConnection(): Promise<void> {
        const { engine, host, port, database, user, password } = this.state;

        this.setState({ phase: BackendSetupState.Testing, errorMessage: "" });

        try {
            const res = await fetch("/api?action=testConnection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ engine, host, port, database, user, password }),
            });

            const data = await res.json() as { success: boolean; error?: string; };

            if (data.success) {
                this.setState({ phase: BackendSetupState.NeedsSetup, lastTestSucceeded: true });
            } else {
                this.setState({
                    phase: BackendSetupState.Error,
                    errorMessage: data.error ?? "Connection test failed.",
                });
            }
        } catch (e) {
            this.setState({
                phase: BackendSetupState.Error,
                errorMessage: `Connection test failed: ${String(e)}`,
            });
        }
    }

    private async initializeDatabase(): Promise<void> {
        try {
            const res = await fetch("/api?action=health");
            const data = await res.json() as { status: string; initialized: boolean; hasData: boolean; };

            if (data.initialized && data.hasData) {
                this.setState({ phase: BackendSetupState.ConfirmOverwrite });

                return;
            }
        } catch {
            // Can't check — proceed anyway.
        }

        void this.doInitializeDatabase(false);
    }

    private async doInitializeDatabase(overwrite: boolean): Promise<void> {
        const { engine, host, port, database, user, password } = this.state;

        this.setState({ phase: BackendSetupState.Initialising, errorMessage: "" });

        try {
            const res = await fetch("/api?action=setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ engine, host, port, database, user, password, overwrite }),
            });

            const data = await res.json() as { success: boolean; error?: string; };

            if (data.success) {
                this.setState({ phase: BackendSetupState.Done });
            } else {
                this.setState({
                    phase: BackendSetupState.Error,
                    errorMessage: data.error ?? "Setup failed.",
                });
            }
        } catch (e) {
            this.setState({
                phase: BackendSetupState.Error,
                errorMessage: `Setup failed: ${String(e)}`,
            });
        }
    }
}
