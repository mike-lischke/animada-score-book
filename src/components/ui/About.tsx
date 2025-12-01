/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import logo from "../../assets/images/animada-logo2.svg";
import githubLogo from "../../assets/images/GitHub_Invertocat_Dark.svg";

import type { ComponentChild } from "preact";

import { errorLog } from "../../Core/ErrorLog.js";
import { ComponentBase } from "./ComponentBase/ComponentBase.js";
import { Container, ContentAlignment, Orientation } from "./Container/Container.js";
import { Label } from "./Label/Label.js";

interface AboutState {
    errorReportIsVisibile: boolean;
    errorCount: number;

}
export class About extends ComponentBase<{}, AboutState> {
    public constructor(props: {}) {
        super(props);

        this.state = {
            errorCount: errorLog.getEntryCount(),
            errorReportIsVisibile: false,
        };
    }

    public override componentDidMount(): void {
        errorLog.subscribe(this.updateErrorCount);
    }

    public override componentWillUnmount(): void {
        errorLog.unsubscribe(this.updateErrorCount);
    }

    public render(): ComponentChild {
        const { errorReportIsVisibile, errorCount } = this.state;
        const errorButtonVisibilityClass = errorCount ? "" : "hidden";

        return (
            <Container
                className="aboutBox"
                orientation={Orientation.TopDown}
                crossAlignment={ContentAlignment.Center}
                onClick={this.handleClick}
            >
                <img className="logo" src={logo} />
                <Label id="headingLabel">About Animada Score Book</Label>
                <p>On your lap or in your pocket, an easy way to compose and share samba grooves</p>
                <Container>
                    <a
                        target="_blank" href="https://github.com/mike-lischke/animada-score-book"
                        rel="noreferrer">
                        Check out the code:
                        <img src={githubLogo} id="githubLogo" />
                    </a>
                </Container>
                <div className={errorButtonVisibilityClass}>
                    <button
                        id="report-error"
                        className='push-button'
                        onClick={() => {
                            this.setState({ errorReportIsVisibile: true });
                        }}
                    >There were errors! Click to view error report.</button>
                    <br /><br />
                    <div className={`display-linebreak ${errorReportIsVisibile ? "" : "hidden"}`}>
                        <p>{errorLog.getMessage()}</p>
                        <br />
                    </div>
                </div>
            </Container>
        );
    }

    private updateErrorCount = (): void => {
        this.setState({ errorCount: errorLog.getEntryCount() });
    };

    private handleClick = (e: MouseEvent | KeyboardEvent) => {
        // Don't let clicks inside the about box close the popup.
        e.stopPropagation();
    };
}
