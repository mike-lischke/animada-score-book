/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Component, type ComponentChild } from "preact";

import { requisitions } from "../../supplement/Requisitions.js";
import { Button } from "./framework/Button.js";
import { Icon } from "./framework/Icon.js";
import { UIIcon } from "./framework/UIIcon.js";

/** How long the "Copied" feedback of the technical details stays visible. */
const copyFeedbackDuration = 2000;

/** Public issue creation page of the project, offered to users who want to report a problem. */
const issueReportUrl = "https://github.com/mike-lischke/animada-score-book/issues/new";

interface IErrorBoundaryState {
    error?: string;
    details?: string;
    copied: boolean;
}

/**
 * A component to handle unhandled exceptions in any of the components.
 * Reports the error and stops rendering the failed subtree until the user retries.
 */
export class ErrorBoundary extends Component<{}, IErrorBoundaryState> {

    private copyResetTimer?: number;

    public constructor(props: {}) {
        super(props);

        this.state = { copied: false };
    }

    /* istanbul ignore next */
    public static override getDerivedStateFromError(error: Error): Partial<IErrorBoundaryState> {
        return {
            error: ErrorBoundary.messageOf(error),
            details: ErrorBoundary.detailsOf(error),
            copied: false,
        };
    }

    /* istanbul ignore next */
    public override componentDidCatch(error: Error, errorInfo: unknown): void {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        void requisitions.execute("showError", ErrorBoundary.messageOf(error));
    }

    public override componentWillUnmount(): void {
        this.clearCopyReset();
    }

    public render(): ComponentChild {
        const { children } = this.props;
        const { error } = this.state;

        if (error !== undefined) {
            return this.renderErrorPage();
        }

        return children;
    }

    private static messageOf(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    private static detailsOf(error: unknown): string {
        let text;
        if (error instanceof Error) {
            const heading = error.message.length > 0 ? `${error.name}: ${error.message}` : error.name;
            text = error.stack === undefined ? heading : `${heading}\n\n${error.stack}`;
        } else {
            text = String(error);
        }

        return ErrorBoundary.redactSecrets(`Animada Score Book ${appVersion}\n\n${text}`);
    }

    /**
     * Masks credentials which can end up in messages or stack traces before they are shown or copied.
     *
     * @param text The raw error text.
     *
     * @returns The text with bearer tokens and secret query parameters redacted.
     */
    private static redactSecrets(text: string): string {
        return text
            .replace(/(Bearer\s+)[\w.~+/=-]+/gi, "$1[redacted]")
            .replace(/([?&](?:access_token|refresh_token|token|password|secret|key)=)[^&\s"']+/gi, "$1[redacted]");
    }

    private renderErrorPage(): ComponentChild {
        return (
            <div className="error-boundary">
                <div className="error-boundary-panel">
                    {this.renderBrand()}
                    {this.renderMessage()}
                    {this.renderRecovery()}
                    {this.renderHelp()}
                    {this.renderDetails()}
                </div>
            </div>
        );
    }

    private renderBrand(): ComponentChild {
        return (
            <div className="error-boundary-brand">
                <img className="error-boundary-logo" src="/logo.svg" alt="" />
                <div className="error-boundary-identity">
                    <span className="error-boundary-app-name">Animada Score Book</span>
                    <span className="error-boundary-app-tagline">Scores and arrangements for bateria groups</span>
                </div>
            </div>
        );
    }

    private renderMessage(): ComponentChild {
        return (
            <div className="error-boundary-message" role="alert">
                <div className="error-boundary-heading">
                    <span className="error-boundary-badge" aria-hidden="true">
                        <Icon src={UIIcon.Warning} />
                    </span>
                    <h1 className="error-boundary-title">Something went wrong</h1>
                </div>
                <p className="error-boundary-description">
                    An unexpected error interrupted this view, so its content cannot be shown right now. You can try
                    again, reload the app or report the problem so we can fix it.
                </p>
            </div>
        );
    }

    private renderRecovery(): ComponentChild {
        return (
            <div className="error-boundary-recovery">
                <div className="error-boundary-actions">
                    <Button isDefault caption="Retry" onClick={this.handleRetry} />
                    <Button caption="Reload app" onClick={this.handleReload} />
                </div>
                <p className="error-boundary-action-hint">
                    Reloading restarts the app and may discard unsaved changes.
                </p>
            </div>
        );
    }

    private renderHelp(): ComponentChild {
        return (
            <section className="error-boundary-help" aria-labelledby="errorBoundaryHelpTitle">
                <h2 id="errorBoundaryHelpTitle" className="error-boundary-section-title">Still not working?</h2>
                <p className="error-boundary-help-text">
                    Report the problem on GitHub so we can look into it. Please mention what you were doing when the
                    error appeared, which score was open and what you expected to happen.
                </p>
                <a
                    className="error-boundary-report-link"
                    href={issueReportUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    Report this problem on GitHub
                </a>
            </section>
        );
    }

    private renderDetails(): ComponentChild {
        const { details, copied } = this.state;
        if (details === undefined) {
            return undefined;
        }

        const copyCaption = copied ? "Copied" : "Copy details";
        const copyStatusText = copied ? "Copied to clipboard" : "";

        return (
            <details className="error-boundary-details">
                <summary>Technical details</summary>
                <div className="error-boundary-details-body">
                    <pre className="error-boundary-details-text">{details}</pre>
                    <div className="error-boundary-details-actions">
                        <Button compact caption={copyCaption} onClick={this.handleCopyDetails} />
                        <span className="error-boundary-copy-status" role="status">{copyStatusText}</span>
                    </div>
                </div>
            </details>
        );
    }

    private async copyDetails(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            this.markCopied();
        } catch (error) {
            console.error("Copying the error details to the clipboard failed:", error);
        }
    }

    private markCopied(): void {
        this.clearCopyReset();
        this.setState({ copied: true });
        this.copyResetTimer = window.setTimeout(() => {
            this.setState({ copied: false });
            this.copyResetTimer = undefined;
        }, copyFeedbackDuration);
    }

    private clearCopyReset(): void {
        if (this.copyResetTimer !== undefined) {
            window.clearTimeout(this.copyResetTimer);
            this.copyResetTimer = undefined;
        }
    }

    private handleRetry = (): void => {
        this.clearCopyReset();
        this.setState({ error: undefined, details: undefined, copied: false });
    };

    private handleReload = (): void => {
        window.location.reload();
    };

    private handleCopyDetails = (): void => {
        const { details } = this.state;
        if (details !== undefined) {
            void this.copyDetails(details);
        }
    };
}
