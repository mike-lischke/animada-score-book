/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./App.css";
import "./style.css";

import logo from "./assets/images/animada-logo.svg";

import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ComponentBase } from "./components/ui/ComponentBase/ComponentBase.js";

export class App extends ComponentBase {

    public override componentDidMount(): void {
        void import("./index.js");
    }

    public render() {
        return (
            <ErrorBoundary>
                <div id="wrapper">
                    <div>
                        <img src={logo} style="height:80pt;" />
                        <h1>Welcome to Banda Animada de Samba Chemnitz!</h1>
                        <div id="loading-message-wrapper">
                            <div id="loading-message" style="min-height:76px">
                                <p style="line-height: 76px">Loading app...</p>
                            </div>
                        </div>
                        <h3>
                            <a href="https://youtu.be/uGNWO5qGEF4" target="_blank">New feature! Triplets!</a>
                        </h3>
                    </div>
                </div>
            </ErrorBoundary>
        );
    }
}
