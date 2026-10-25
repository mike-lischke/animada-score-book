/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Component, type ComponentChild } from "preact";

import { requisitions } from "../../supplement/Requisitions.js";
import { Button } from "./framework/Button.js";

interface IErrorBoundaryState {
    error?: string;
}

/**
 * A component to handle unhandled exceptions in any of the components.
 * Reports the error and stops rendering the failed subtree until the user retries.
 */
export class ErrorBoundary extends Component<{}, IErrorBoundaryState> {

    public constructor(props: {}) {
        super(props);

        this.state = {};
    }

    /* istanbul ignore next */
    public static override getDerivedStateFromError(error: Error): object {
        return { error: error.message };
    }

    /* istanbul ignore next */
    public override componentDidCatch(error: Error, errorInfo: unknown): void {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        void requisitions.execute("showError", error.message);
    }

    public render(): ComponentChild {
        const { children } = this.props;
        const { error } = this.state;
        if (error !== undefined) {
            return (
                <div role="alert">
                    <p>{error}</p>
                    <Button caption="Retry" onClick={this.handleRetry} />
                </div>
            );
        }

        return children;
    }

    private handleRetry = (): void => {
        this.setState({ error: undefined });
    };
}
