/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Component, type ComponentChild } from "preact";

import { requisitions } from "../../supplement/Requisitions.js";

interface IErrorBoundaryState {
    error: string;
}

/**
 * A component to handle unhandled exceptions in any of the components.
 * Instead of replacing the UI with an error page, it shows an error notification
 * via the NotificationCenter and continues rendering the children.
 */
export class ErrorBoundary extends Component<{}, IErrorBoundaryState> {

    public constructor(props: {}) {
        super(props);

        this.state = {
            error: "",
        };
    }

    /* istanbul ignore next */
    public static override getDerivedStateFromError(error: Error): object {
        return { error: error.message };
    }

    /* istanbul ignore next */
    public override componentDidCatch(error: Error, _errorInfo: unknown): void {
        console.log("ErrorBoundary caught an error:", error, _errorInfo);
    }

    public override componentDidUpdate(): void {
        const { error } = this.state;

        if (error.length > 0) {
            void requisitions.execute("showError", error);
            this.setState({ error: "" });
        }
    }

    public render(): ComponentChild {
        const { children } = this.props;

        return children;
    }
}
