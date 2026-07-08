/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Semaphore } from "../supplement/Semaphore.js";
import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { ProgressIndicator } from "../components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { DatabaseEngine } from "../server/database.js";

const engineLabels: Record<string, string> = {
    [DatabaseEngine.MySQL]: "MySQL",
    [DatabaseEngine.MariaDB]: "MariaDB",
    [DatabaseEngine.Postgres]: "PostgreSQL",
};

enum BackendSetupState {
    /** Config missing or unreadable — nothing can be done. */
    Fatal,
    NeedsSetup,
    Initialising,
    Done,
    Error,
}

type BackendSetupMode = "fatal" | "initial" | "admin";

interface IBackendConfig {
    engine: string;
    host: string;
    port: number;
    database: string;
}

interface IBackendSetupDialogState {
    phase: BackendSetupState;
    mode: BackendSetupMode;
    config: IBackendConfig | undefined;
    hasData: boolean;
    errorMessage: string;
    configError: string;
}

interface IBackendSetupDialogProperties extends ICommonUIProperties {
}

export class BackendSetupDialog extends UIComponent<IBackendSetupDialogProperties, IBackendSetupDialogState> {
    private dialogRef = createRef<Dialog>();
    private signal?: Semaphore<"done" | "reset">;

    public constructor(props: IBackendSetupDialogProperties) {
        super(props);

        this.state = {
            phase: BackendSetupState.NeedsSetup,
            mode: "initial",
            config: undefined,
            hasData: false,
            errorMessage: "",
            configError: "",
        };
    }

    /**
     * Opens the dialog and returns a promise that resolves when the user takes action.
     *
     * @param options              The dialog configuration.
     * @param options.mode         The setup mode (fatal, initial, admin).
     * @param options.configError  An optional config error message.
     * @param options.dbError      An optional database error message.
     *
     * @returns "reset" when the user clicks Reset Database, "done" when setup completes.
     */
    public async show(options: {
        mode: BackendSetupMode; configError?: string; dbError?: string;
    } = { mode: "initial" }): Promise<"done" | "reset"> {
        this.signal = new Semaphore<"done" | "reset">();
        this.setState({
            mode: options.mode,
            errorMessage: options.dbError ?? "",
            configError: options.configError ?? "",
        }, () => {
            this.dialogRef.current?.open();
            void this.checkBackendStatus();
        });

        return this.signal.wait();
    }

    public render(): ComponentChild {
        const { phase, config, errorMessage, mode, configError } = this.state;

        const isBusy = phase === BackendSetupState.Initialising;

        let content: ComponentChild;

        switch (phase) {
            case BackendSetupState.Fatal: {
                content = (
                    <Container orientation={Orientation.TopDown} crossAlignment={ChildAlignment.Center}>
                        <Icon
                            src={Codicon.Error}
                            style={{ fontSize: "48px", color: "var(--color-error)", marginBottom: "12px" }}
                        />
                        <Label caption="Backend configuration is missing or invalid." heading wrap />
                        <Label
                            caption={configError || "Create a backend-config.json file and restart the server."}
                            style={{ marginTop: "8px" }} wrap
                        />
                    </Container>
                );

                break;
            }

            case BackendSetupState.NeedsSetup:
            case BackendSetupState.Error: {
                content = this.renderConfigView(config, errorMessage);

                break;
            }

            case BackendSetupState.Initialising: {
                content = (
                    <>
                        <Label caption="Setting up database tables …" />
                        <ProgressIndicator linear />
                    </>
                );

                break;
            }

            case BackendSetupState.Done: {
                content = (
                    <>
                        <Label caption="Database setup complete." />
                        <Icon
                            src={Codicon.Check}
                            style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-success)" }}
                        />
                    </>
                );

                break;
            }

            default:
        }

        let actions: ComponentChild[];

        if (phase === BackendSetupState.Fatal) {
            actions = [];
        } else if (phase === BackendSetupState.Done) {
            actions = [
                <Button id="backend-setup-close" value="close" caption="Close" />,
            ];
        } else if (isBusy) {
            actions = [];
        } else if (mode === "initial") {
            actions = [
                <Button
                    id="backend-setup-init"
                    caption="Initialize Database"
                    disabled={isBusy}
                    onClick={(e) => {
                        e.preventDefault();
                        void this.initializeDatabase();
                    }}
                />,
            ];
        } else {
            actions = [
                <Button
                    id="backend-setup-reset"
                    caption="Reset Database"
                    disabled={isBusy}
                    onClick={(e) => {
                        e.preventDefault();
                        this.signal?.notify("reset");
                        this.dialogRef.current?.close(true);
                    }}
                />,
                <Button id="backend-setup-cancel" value="cancel" caption="Close" />,
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

    private renderConfigView(config: IBackendConfig | undefined, errorMessage: string): ComponentChild {
        if (!config) {
            return (
                <Container orientation={Orientation.LeftToRight} crossAlignment={ChildAlignment.Center}>
                    <Icon
                        src={Codicon.Warning}
                        style={{
                            fontSize: "24px", fontWeight: 800,
                            color: "var(--color-warning)", marginRight: "8px",
                        }}
                    />
                    <Label caption="Could not read backend configuration." />
                </Container>
            );
        }

        const rows: Array<{ label: string; value: string; }> = [
            { label: "Engine", value: engineLabels[config.engine] ?? config.engine },
            { label: "Host", value: config.host },
            { label: "Port", value: String(config.port) },
            { label: "Database", value: config.database },
        ];

        return (
            <Container className="form-card" orientation={Orientation.TopDown}>
                {errorMessage && (
                    <Container
                        className="text-error bg-error/10 rounded p-2"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        style={{ marginBottom: "12px" }}
                    >
                        <Icon src={Codicon.Error} style={{ fontSize: "16px", marginRight: "8px" }} />
                        <Label caption={errorMessage} wrap />
                    </Container>
                )}

                {rows.map((row) => {
                    return (
                        <Container
                            key={row.label}
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label caption={row.label} style={{ opacity: 0.7, fontSize: "13px" }} />
                            <Label caption={row.value} style={{ fontFamily: "monospace", fontSize: "13px" }} />
                        </Container>
                    );
                })}
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
                this.setState({ errorMessage: "Backend not reachable." });

                return;
            }

            const data = await res.json() as {
                status: string; configLoaded: boolean; configError?: string;
                initialized: boolean; engine: string;
                host: string; port: number; database: string;
                hasData: boolean;
            };

            if (!data.configLoaded) {
                this.setState({
                    phase: BackendSetupState.Fatal,
                    configError: data.configError ?? "Could not read backend-config.json.",
                });

                return;
            }

            const config: IBackendConfig = {
                engine: data.engine,
                host: data.host,
                port: data.port,
                database: data.database,
            };

            this.setState({
                phase: BackendSetupState.NeedsSetup, config,
                hasData: data.hasData,
            });
        } catch {
            this.setState({ errorMessage: "Backend not reachable." });
        }
    }

    private async initializeDatabase(): Promise<void> {
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
                    phase: BackendSetupState.Error,
                    errorMessage: data.error ?? "Failed to initialize database.",
                });

                return;
            }

            this.setState({ phase: BackendSetupState.Done });
        } catch {
            this.setState({
                phase: BackendSetupState.Error,
                errorMessage: "Backend not reachable.",
            });
        }
    }

}
