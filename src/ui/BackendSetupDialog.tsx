/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../supplement/Semaphore.js";
import { Button } from "../components/ui/framework/Button.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { ProgressIndicator } from "../components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { DatabaseEngine, isValidDatabaseEngine } from "../server/database.js";

const engineLabels: Record<DatabaseEngine, string> = {
    [DatabaseEngine.MySQL]: "MySQL",
    [DatabaseEngine.MariaDB]: "MariaDB",
    [DatabaseEngine.Postgres]: "PostgreSQL",
};

enum BackendSetupState {
    /** Waiting for the state of the backend. */
    Loading,

    /** Waiting for the user. */
    Ready,

    /** Creating the schema. */
    Initialising,

    /** The schema exists. */
    Done,

    /** The last request failed. */
    Error,
}

/** Why the backend setup dialog was opened, which decides what it offers. */
export enum BackendSetupMode {
    /** The backend has no usable configuration, so the dialog only states why. */
    Fatal,

    /** The configuration is usable but the schema is missing. */
    Initialize,

    /** The schema is broken, so the dialog offers to rebuild it. */
    Reset,
}

interface IBackendSetupDialogState {
    mode: BackendSetupMode;
    phase: BackendSetupState;
    engine: DatabaseEngine;
    host: string;
    port: string;
    database: string;
    errorMessage: string;
}

/** The part of the health response the dialog reads. */
interface IHealthResponse {
    status: string;
    configLoaded: boolean;
    configError?: string;
    initialized: boolean;
    dbError?: string;
    engine: string;
    host: string;
    port: number;
    database: string;
}

interface IBackendSetupDialogProperties extends ICommonUIProperties {
}

export class BackendSetupDialog extends UIComponent<IBackendSetupDialogProperties, IBackendSetupDialogState> {
    private dialogRef = createRef<Dialog | null>();
    private signal?: Semaphore<"done" | "reset">;

    public constructor(props: IBackendSetupDialogProperties) {
        super(props);

        this.state = {
            mode: BackendSetupMode.Initialize,
            phase: BackendSetupState.Loading,
            engine: DatabaseEngine.MySQL,
            host: "",
            port: "",
            database: "",
            errorMessage: "",
        };
    }

    /**
     * Opens the dialog and returns a promise that resolves when the user takes action.
     *
     * @param options The dialog configuration.
     * @param options.mode The job the dialog has to do.
     * @param options.configError Why the configuration is unusable.
     * @param options.dbError The database problem to show.
     *
     * @returns "reset" when the user asks for a database reset, "done" otherwise.
     */
    public async show(options: {
        mode: BackendSetupMode; configError?: string; dbError?: string;
    }): Promise<"done" | "reset"> {
        this.signal = new Semaphore<"done" | "reset">();
        this.setState({
            mode: options.mode,
            phase: BackendSetupState.Loading,
            errorMessage: options.configError ?? options.dbError ?? "",
        }, () => {
            this.dialogRef.current?.open();
            void this.checkBackendStatus();
        });

        return this.signal.wait();
    }

    public render(): ComponentChild {
        const content = this.renderContent();
        const actions = this.renderActions();

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
                    <Icon src={UIIcon.Database} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Backend Setup
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

    private renderContent(): ComponentChild {
        const { mode, phase, errorMessage } = this.state;

        switch (phase) {
            case BackendSetupState.Loading: {
                return <Label caption="Checking the backend connection …" />;
            }

            case BackendSetupState.Initialising: {
                return (
                    <>
                        <Label caption="Setting up database tables …" />
                        <ProgressIndicator linear />
                    </>
                );
            }

            case BackendSetupState.Done: {
                return (
                    <>
                        <Label caption="Database setup complete." />
                        <Icon
                            src={UIIcon.Check}
                            style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-success)" }}
                        />
                    </>
                );
            }

            case BackendSetupState.Error: {
                return this.renderErrorBox(errorMessage);
            }

            case BackendSetupState.Ready:
            default: {
                if (mode === BackendSetupMode.Fatal) {
                    return this.renderConfigMissing();
                }

                return this.renderConfigSummary();
            }
        }
    }

    private renderActions(): ComponentChild[] {
        const { mode, phase } = this.state;

        switch (phase) {
            case BackendSetupState.Loading:
            case BackendSetupState.Initialising: {
                return [];
            }

            case BackendSetupState.Done: {
                return [
                    <Button id="backend-setup-close" value="close" caption="Close" />,
                ];
            }

            case BackendSetupState.Error: {
                return [
                    <Button id="backend-setup-retry" caption="Try again" isDefault onClick={this.handleRetry} />,
                ];
            }

            case BackendSetupState.Ready:
            default: {
                if (mode === BackendSetupMode.Fatal) {
                    return [];
                }

                if (mode === BackendSetupMode.Reset) {
                    return [
                        <Button
                            id="backend-setup-reset"
                            caption="Reset Database"
                            onClick={(e) => {
                                e.preventDefault();
                                this.signal?.notify("reset");
                                this.dialogRef.current?.close(true);
                            }}
                        />,
                        <Button id="backend-setup-cancel" value="cancel" caption="Close" />,
                    ];
                }

                return [
                    <Button
                        id="backend-setup-init"
                        caption="Initialize Database"
                        isDefault
                        onClick={(e) => {
                            e.preventDefault();
                            void this.submitSetup();
                        }}
                    />,
                ];
            }
        }
    }

    private renderConfigSummary(): ComponentChild {
        const { engine, host, port, database, errorMessage } = this.state;

        const rows = [
            { label: "Engine", value: engineLabels[engine] },
            { label: "Host", value: host },
            { label: "Port", value: port },
            { label: "Database", value: database },
        ];

        const rowItems = rows.map((row) => {
            return (
                <Container
                    key={row.label}
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Label className="backend-setup-row-label" caption={row.label} />
                    <Label className="backend-setup-row-value" caption={row.value} />
                </Container>
            );
        });

        const errorBox = errorMessage.length > 0 ? this.renderErrorBox(errorMessage) : undefined;

        return (
            <Container className="form-card" orientation={Orientation.TopDown}>
                {errorBox}
                {rowItems}
            </Container>
        );
    }

    private renderConfigMissing(): ComponentChild {
        const { errorMessage } = this.state;

        const detail = errorMessage.length > 0 ? this.renderErrorBox(errorMessage) : undefined;

        return (
            <Container orientation={Orientation.TopDown} crossAlignment={ChildAlignment.Center}>
                <Icon
                    src={UIIcon.Error}
                    style={{ fontSize: "48px", color: "var(--color-error)", marginBottom: "12px" }}
                />
                <Label caption="Backend configuration is missing or invalid." heading wrap />
                {detail}
                <Label
                    caption="Create backend-config.json in the server directory and restart the process."
                    style={{ marginTop: "8px" }}
                    wrap
                />
            </Container>
        );
    }

    private renderErrorBox(message: string): ComponentChild {
        return (
            <Container
                className="text-error bg-error/10 rounded p-2"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                style={{ marginBottom: "12px" }}
            >
                <Icon src={UIIcon.Error} style={{ fontSize: "16px", marginRight: "8px" }} />
                <Label caption={message} wrap />
            </Container>
        );
    }

    private handleClose = (): void => {
        this.signal?.notify("done");
    };

    private async checkBackendStatus(): Promise<void> {
        try {
            const res = await fetch("/api?action=health");

            if (!res.ok) {
                this.setState({ phase: BackendSetupState.Error, errorMessage: "Backend not reachable." });

                return;
            }

            const data = await res.json() as IHealthResponse;
            const engine = isValidDatabaseEngine(data.engine) ? data.engine : DatabaseEngine.MySQL;

            this.setState({
                phase: BackendSetupState.Ready,
                engine,
                host: data.host,
                port: data.port > 0 ? String(data.port) : "",
                database: data.database,
                errorMessage: data.configError ?? data.dbError ?? "",
            });
        } catch {
            this.setState({ phase: BackendSetupState.Error, errorMessage: "Backend not reachable." });
        }
    }

    private async submitSetup(): Promise<void> {
        this.setState({ phase: BackendSetupState.Initialising, errorMessage: "" });

        try {
            const res = await fetch("/api?action=setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "initialize" }),
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string; };

                this.setState({
                    phase: BackendSetupState.Ready,
                    errorMessage: data.error ?? "Failed to initialize database.",
                });

                return;
            }

            this.setState({ phase: BackendSetupState.Done });
        } catch {
            this.setState({ phase: BackendSetupState.Ready, errorMessage: "Backend not reachable." });
        }
    }

    private handleRetry = (): void => {
        this.setState({ phase: BackendSetupState.Loading }, () => {
            void this.checkBackendStatus();
        });
    };

}
