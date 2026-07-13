/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef } from "preact";

import { Codicon } from "../components/ui/framework/Codicon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { StatusDialog, type IStatusContent } from "../components/ui/composites/StatusDialog.js";
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
 * connection is re-established. Uses {@link StatusDialog} for rendering.
 */
export class BackendDisconnectedDialog
    extends UIComponent<IBackendDisconnectedDialogProperties, IBackendDisconnectedDialogState> {

    private statusRef = createRef<StatusDialog>();
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
            this.statusRef.current?.show(this.buildContent());
            this.startPolling();
        });
    }

    public override componentWillUnmount(): void {
        this.stopTimers();
    }

    public render() {
        const { onReconnected } = this.props;

        return (
            <StatusDialog
                ref={this.statusRef}
                dialogId="backendDisconnectedDialog"
                onClose={() => {
                    if (this.closingIntentionally) {
                        onReconnected?.();
                    }
                }}
                closeOnEscape={false}
            />
        );
    }

    private buildContent(): IStatusContent {
        const { phase, attemptCount, errorDetail } = this.state;

        switch (phase) {
            case DisconnectPhase.Disconnected: {
                return {
                    icon: Codicon.Error,
                    title: "Backend Connection Lost",
                    message: "The application cannot function without the backend.",
                    detail: errorDetail || undefined,
                    showSpinner: true,
                };
            }

            case DisconnectPhase.Reconnecting: {
                return {
                    icon: Codicon.Sync,
                    title: "Backend Connection Lost",
                    message: "The application cannot function without the backend.",
                    detail: `Reconnecting… (attempt ${attemptCount})`,
                    showSpinner: true,
                };
            }

            case DisconnectPhase.Reconnected: {
                return {
                    icon: Codicon.Check,
                    title: "Backend Connection Restored!",
                    message: "Resuming normal operation…",
                };
            }
        }
    }

    private handleBackendRestored(): void {
        const { onReconnected } = this.props;

        this.setState({ phase: DisconnectPhase.Reconnected });
        this.statusRef.current?.update(this.buildContent());
        void requisitions.execute("showInfo", "Backend connection restored.");

        this.dismissTimer = setTimeout(() => {
            this.closingIntentionally = true;
            this.statusRef.current?.dismiss();
            onReconnected?.();
        }, reconnectedDisplayMs);
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
                const data = await res.json() as {
                    status: string; initialized: boolean; dbStatus?: string; dbError?: string;
                };

                if (data.status === "ok" && data.initialized) {
                    this.stopTimers();
                    this.handleBackendRestored();

                    return;
                }

                // The backend is reachable but the database is not — show a specific detail.
                if (data.dbStatus === "db_unreachable" && data.dbError) {
                    this.setState({
                        phase: DisconnectPhase.Disconnected,
                        errorDetail: data.dbError,
                    });
                    this.statusRef.current?.update(this.buildContent());

                    return;
                }
            }

            this.setState((prev) => {
                return {
                    phase: DisconnectPhase.Reconnecting,
                    attemptCount: prev.attemptCount + 1,
                };
            });
            this.statusRef.current?.update(this.buildContent());
        } catch {
            this.setState((prev) => {
                return {
                    phase: DisconnectPhase.Reconnecting,
                    attemptCount: prev.attemptCount + 1,
                };
            });
            this.statusRef.current?.update(this.buildContent());
        }
    }

    private startPolling(): void {
        this.stopTimers();

        this.pollTimer = setInterval(() => {
            void this.checkBackend();
        }, reconnectIntervalMs);
    }
}
