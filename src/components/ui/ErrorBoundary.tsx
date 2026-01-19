/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Component, type ComponentChild } from "preact";

import { Label } from "./framework/Label.js";
import { Message } from "./Message.js";

import { Container } from "./framework/Container.js";
import { MessageType, Orientation } from "./framework/ui-types.js";

interface IErrorBoundaryState {
    error: string;
    stack: string;
}

/**
 * A component to handle unhandled exceptions in any of the components.
 */
export class ErrorBoundary extends Component<{}, IErrorBoundaryState> {

    public constructor(props: {}) {
        super(props);

        this.state = {
            error: "",
            stack: "",
        };
    }

    /* istanbul ignore next */
    public static override getDerivedStateFromError(error: Error): object {
        // Update state so the next render will show the fallback UI.
        return {
            error: error.message,
            stack: error.stack,
        };
    }

    /* istanbul ignore next */
    public override componentDidCatch(_error: Error, _errorInfo: unknown): void {
        // log the error errorInfo.componentStack;
        console.log("ErrorBoundary caught an error:", _error, _errorInfo);
    }

    public render(): ComponentChild {
        const { children } = this.props;
        const { error } = this.state;

        /* istanbul ignore next */
        if (error.length > 0) {
            return (
                <Container className="errorBoundary" style={{ padding: "30px" }} orientation={Orientation.TopDown}>
                    <Label className="heading">Sorry to hear you had problems running the Animada Score Book!
                        An unexpected error occurred:</Label><br />
                    <Message messageType={MessageType.Error}>{this.state.error}</Message><br />
                    <Message className="stack" messageType={MessageType.Info}>{this.state.stack}</Message><br />
                    <span>
                        If you think this is a bug in the application then please file a bug report at
                        &nbsp;the <a href="https://github.com/mike-lischke/animada-score-book/issues">
                            Animada Score Book GitHub issue tracker
                        </a>.
                    </span>
                </Container>
            );
        }

        return children;
    }
}
