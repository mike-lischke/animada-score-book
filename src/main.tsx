/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./app.css";

import logo from "./assets/images/animada-logo.svg";

import { render } from "preact";

import { App } from "./App.js";
import { Message } from "./components/ui/Message/Message.js";
import { MessageType } from "./components/general-types.js";
import { Container, ContentAlignment, Orientation } from "./components/ui/Container/Container.js";

try {
    if (/(iPad|iPhone|iPod)/g.test(navigator.userAgent)) {
        await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    }

    render(<App />, document.getElementById("app")!);
} catch {
    render(
        <Message type={MessageType.Info}>
            <Container
                orientation={Orientation.TopDown}
                crossAlignment={ContentAlignment.Center}
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
        document.getElementById("app")!
    );
}
