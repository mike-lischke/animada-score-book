/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import logo from "/logo.svg";

import { render } from "preact";

import { App } from "./App.js";
import { Container } from "./components/ui/framework/Container.js";
import { Message } from "./components/ui/framework/Message.js";
import { ChildAlignment, MessageType, Orientation } from "./components/ui/framework/ui-types.js";

const root = document.getElementById("app")!;
interface ISerializedError {
    tag?: string;
    message: string;
    source?: string | EventTarget | null;
    lineno?: number;
    colno?: number;
    stack?: string;
}

const renderFatal = (error?: unknown) => {
    let text;

    if (error instanceof Error) {
        text = `${error.name}: ${error.message}\n${error.stack}`;
    } else {
        const e = error as ISerializedError;
        text =
            `Message: ${e.message}\n` +
            (e.source ? `Source: ${e.source}\n` : "") +
            (e.lineno != null ? `Line: ${e.lineno}\n` : "") +
            (e.colno != null ? `Column: ${e.colno}\n` : "") +
            (e.stack ? `Stack: ${e.stack}\n` : "");
    }

    console.error("Global fatal error:", text);
    render(
        <Message messageType={MessageType.Error}>
            <Container
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Center}
            >
                <p>{text}</p>
            </Container>
        </Message>,
        root
    );
};

window.onerror = (message, source, lineno, colno, error) => {
    const txt = typeof message === "string" ? message : String(message);
    if (txt.includes("Script error") || txt.includes("ethereum")) {
        // Special handling for third‑party ethereum errors, which are common and not actionable for us.
        // Seen only on Brave browser so far, which injects a script for its built‑in crypto wallet.
        console.warn("Ignored third‑party ethereum error:", txt, source);

        return true;
    }

    if (error instanceof Error) {
        renderFatal(error);
    } else {
        renderFatal({
            message: String(message),
            source,
            lineno: lineno ?? undefined,
            colno: colno ?? undefined,
        });
    }

    return true;
};

window.onunhandledrejection = (event) => {
    renderFatal(event.reason);
};

try {
    if (/(iPad|iPhone|iPod)/g.test(navigator.userAgent)) {
        await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    }

    render(<App />, root);
} catch {
    render(
        <Message messageType={MessageType.Info}>
            <Container
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Center}
            >
                <img
                    src={logo}
                    alt="App Icon"
                    style="width: 300px; height: 300px; margin-bottom: 20px;"
                />
                <p>
                    <b>Animada Score Book</b> needs your permission to play sound on iOS devices.
                    Without that permission, the app cannot function correctly.
                </p>
            </Container>
        </Message >,
        root
    );
}
