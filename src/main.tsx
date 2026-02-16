/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./App.css";

import logo from "/logo.svg";

import { render } from "preact";

import { App } from "./App.js";
import { Container } from "./components/ui/framework/Container.js";
import { Message } from "./components/ui/framework/Message.js";
import { ChildAlignment, MessageType, Orientation } from "./components/ui/framework/ui-types.js";
import { convertErrorToString } from "./core/utils.js";

const root = document.getElementById("app")!;

const renderFatal = (error?: unknown) => {
    const text = convertErrorToString(error);
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
    renderFatal(error);

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
