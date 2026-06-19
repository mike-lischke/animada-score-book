/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { ProgressIndicator } from "../components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { requisitions } from "../supplement/Requisitions.js";

enum DisconnectPhase {
    /** Backend connection lost — showing error and starting reconnect attempts. */
    Disconnected,

    /** Actively polling the backend. */
    Reconnecting,

    /** Backend is reachable again — showing success briefly before auto-dismiss. */
    Reconnected,
}

interface IBackendDisconnectedDialogState {
    phase: DisconnectPhase;
    attemptCount: number;
    errorDetail: string;
}

interface IBackendDisconnectedDialogProperties extends ICommonUIProperties {
    /** Called when the backend has been reconnected and the dialog is about to close. */
    onReconnected?: () => void;
}

const reconnectIntervalMs = 3000;
const reconnectedDisplayMs = 1500;

/**
 * A modal dialog shown when the backend connection is lost during normal app usage.
 * It automatically polls the backend health endpoint and dismisses itself once the
 * connection is re-established.
 */
export class BackendDisconnectedDialog
    extends UIComponent<IBackendDisconnectedDialogProperties, IBackendDisconnectedDialogState> {

    private dialogRef = createRef<Dialog>();
    private pollTimer: ReturnType<typeof setInterval> | undefined;
    private dismissTimer: ReturnType<typeof setTimeout> | undefined;
    private closingIntentionally = false;

    public constructor(props: IBackendDisconnectedDialogProperties) {
        super(props);

        this.state = {
            phase: DisconnectPhase.Disconnected,
            attemptCount: 0,
            errorDetail: "",
        };
    }

    /**
     * Opens the dialog with an optional error detail string and starts polling for reconnection.
     *
     * @param errorDetail Optional description of the error that caused the disconnect.
     */
    public open(errorDetail?: string): void {
        this.closingIntentionally = false;
        this.setState({
            phase: DisconnectPhase.Disconnected,
            attemptCount: 0,
            errorDetail: errorDetail ?? "",
        }, () => {
            this.dialogRef.current?.open();
            this.startPolling();
        });
    }

    public override componentWillUnmount(): void {
        this.stopTimers();
    }

    public render(): ComponentChild {
        const { phase, attemptCount, errorDetail } = this.state;

        let content: ComponentChild;

        switch (phase) {
            case DisconnectPhase.Disconnected:
            case DisconnectPhase.Reconnecting: {
                const statusText = phase === DisconnectPhase.Reconnecting
                    ? `Reconnecting… (attempt ${attemptCount})`
                    : "Reconnecting…";

                content = (
                    <Container orientation={Orientation.TopDown} crossAlignment={ChildAlignment.Center}>
                        <Label
                            caption="Connection to the backend server was lost."
                            heading
                            style={{ marginTop: "12px", textAlign: "center" }}
                        />
                        {errorDetail && (
                            <Label
                                caption={errorDetail}
                                wrap
                                style={{
                                    marginTop: "8px", textAlign: "center",
                                    color: "var(--color-base-500)", fontSize: "13px",
                                }}
                            />
                        )}
                        <Label
                            caption="The application cannot function without the backend."
                            style={{ marginTop: "12px", textAlign: "center" }}
                            wrap
                        />
                        <Label
                            caption="Automatic reconnection will be attempted."
                            style={{ marginTop: "4px", textAlign: "center" }}
                            wrap
                        />
                        <ProgressIndicator style={{ marginTop: "16px" }} />
                        <Label
                            caption={statusText}
                            style={{ marginTop: "8px", color: "var(--color-base-500)" }}
                        />
                    </Container>
                );

                break;
            }

            case DisconnectPhase.Reconnected: {
                content = (
                    <Container orientation={Orientation.TopDown} crossAlignment={ChildAlignment.Center}>
                        <Icon
                            src={Codicon.Check}
                            style={{ fontSize: "48px", color: "var(--color-success)" }}
                        />
                        <Label
                            caption="Backend connection restored!"
                            heading
                            style={{ marginTop: "12px" }}
                        />
                        <Label
                            caption="Resuming normal operation…"
                            style={{ marginTop: "8px", color: "var(--color-base-500)" }}
                        />
                    </Container>
                );

                break;
            }
        }

        return (
            <Dialog
                ref={this.dialogRef}
                id="backendDisconnectedDialog"
                onClose={this.handleClose}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Error} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Backend Connection Lost
                </Container>

                {content}
            </Dialog>
        );
    }

    private handleClose = (_returnValue: string): void => {
        if (this.closingIntentionally) {
            // Programmatic close after successful reconnect — let it through.
            this.closingIntentionally = false;

            return;
        }

        // Accidental close (e.g. Escape key) — re-open and keep polling.
        this.stopTimers();
        this.dialogRef.current?.open();
        this.startPolling();
    };

    private startPolling(): void {
        this.stopTimers();

        this.pollTimer = setInterval(() => {
            void this.checkBackend();
        }, reconnectIntervalMs);
    }

    private stopTimers(): void {
        if (this.pollTimer !== undefined) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }

        if (this.dismissTimer !== undefined) {
            clearTimeout(this.dismissTimer);
            this.dismissTimer = undefined;
        }
    }

    private async checkBackend(): Promise<void> {
        try {
            const res = await fetch("/api?action=health");

            if (res.ok) {
                const data = await res.json() as { status: string; initialized: boolean; };

                if (data.status === "ok" && data.initialized) {
                    // Backend is back — show success and prepare to dismiss.
                    this.stopTimers();
                    this.setState({ phase: DisconnectPhase.Reconnected });
                    void requisitions.execute("showError", "Backend connection restored.");

                    this.dismissTimer = setTimeout(() => {
                        this.closingIntentionally = true;
                        this.dialogRef.current?.close(false);
                        this.props.onReconnected?.();
                    }, reconnectedDisplayMs);

                    return;
                }
            }

            // Backend responded but not ready — keep trying.
            this.setState((prev) => {
                return {
                    phase: DisconnectPhase.Reconnecting,
                    attemptCount: prev.attemptCount + 1,
                };
            });
        } catch {
            this.setState((prev) => {
                return {
                    phase: DisconnectPhase.Reconnecting,
                    attemptCount: prev.attemptCount + 1,
                };
            });
        }
    }
}
