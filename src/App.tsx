/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "@vscode/codicons/dist/codicon.css";
import "./App.css";

import logo from "./assets/images/animada-logo2.svg";

import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { Container } from "./components/ui/framework/Container.js";
import { Label } from "./components/ui/framework/Label.js";
import { Tabview, type ITabviewPage } from "./components/ui/framework/Tabview/Tabview.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";
import { ScoreBookDataModel } from "./core/ScoreBookDataModel.js";
import type { IArrangementSnapshot } from "./core/types/snapshots.js";
import { ScoreBookUi } from "./ui/AnimadaScoreBookUi.js";
import { AppContext } from "./ui/index.js";
import { InstrumentManager } from "./ui/InstrumentManager.js";
import { ScoreLibrary } from "./ui/ScoreLibrary.js";

interface IAppState {
    selectedPage: string;
    sharedArrangement?: IArrangementSnapshot;
}

export class App extends UIComponent<{}, IAppState> {
    private dataModel = new ScoreBookDataModel();

    public constructor(props: {}) {
        super(props);

        this.state = {
            selectedPage: "tab1",
        };
    }

    public render() {
        const { selectedPage, sharedArrangement } = this.state;

        const tabPages: ITabviewPage[] = [{
            id: "tab1",
            caption: "Score Library",
            content: (
                <ScoreLibrary />
            )

        }, {
            id: "tab2",
            caption: "Arrangement Player",
            content: (
                <ScoreBookUi arrangementToLoad={sharedArrangement} />
            )
        }, {
            id: "tab3",
            caption: "Instruments",
            content: (
                <InstrumentManager />
            )

        }];

        return (
            <AppContext.Provider
                value={{
                    dataModel: this.dataModel
                }}>
                <ErrorBoundary>
                    <Container
                        id="appRoot"
                        orientation={Orientation.TopDown}
                        crossAlignment={ChildAlignment.Stretch}
                    >
                        <Container
                            id="appHeader"
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <img id="titleLogo" src={logo} />
                            <Label id="appTitle" >Animada Score Book</Label>
                        </Container>

                        <Tabview
                            id="appTabview"
                            pages={tabPages}
                            selectedId={selectedPage}
                            stretchTabs={false}
                            onSelectTab={this.selectPage}
                        >
                        </Tabview>
                    </Container>
                </ErrorBoundary>
            </AppContext.Provider>
        );
    }

    private selectPage = (id: string): void => {
        this.setState({ selectedPage: id });
    };
}
