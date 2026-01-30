/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "@vscode/codicons/dist/codicon.css";
import "./App.css";

import titleImage from "./assets/images/Animada.svg";

import { createRef } from "preact";

import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { Button } from "./components/ui/framework/Button.js";
import { Container } from "./components/ui/framework/Container.js";
import { Image } from "./components/ui/framework/Image.js";
import { Label } from "./components/ui/framework/Label.js";
import { ProgressIndicator } from "./components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";

import { Codicon } from "./components/ui/framework/Codicon.js";
import { Dialog } from "./components/ui/framework/Dialog/Dialog.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { CheckState, Switch } from "./components/ui/framework/Switch/Switch.js";
import { TooltipProvider } from "./components/ui/framework/Tooltip.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { getSerialisedArrangementFromParams } from "./core/serialisation/url.js";
import type { ISerialisedArrangement } from "./core/types/snapshots.js";
import { AnimadaScoreBookUi } from "./ui/AnimadaScoreBookUi.js";
import { AppContext } from "./ui/index.js";
import { ScoreLibrary } from "./ui/ScoreLibrary.js";
import { demoSongString } from "./demo-song.js";

interface IAppState {
    ready: boolean;
    serializedArrangement?: ISerialisedArrangement;

    theme: "light" | "dark";
}

export class App extends UIComponent<{}, IAppState> {
    private scoreLibraryRef = createRef<Dialog>();
    private dataModel = new ScoreBookDataModel();

    public constructor(props: {}) {
        super(props);

        this.state = {
            ready: false,
            theme: "light",
        };

        //const library = getLibrary();
        //library.load();
    }

    public override componentDidMount() {
        void this.dataModel.initialize().then(() => {
            const serializedArrangement =
                getSerialisedArrangementFromParams(new URL(window.location.href).searchParams);
            this.setState({
                ready: true,
                serializedArrangement,
            }, () => {
                const { theme } = this.state;
                document.body.setAttribute("data-theme", theme);
            });
        });
    }

    public render() {
        const { ready, serializedArrangement, theme } = this.state;

        if (!ready) {
            return <ProgressIndicator />;
        }

        const arrangement = serializedArrangement ?? { composition: demoSongString, version: 2, title: "Demo Song" };

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
                            <Image id="titleLogo" src={titleImage} />
                            <Label id="appTitle">Score Book</Label>
                            <Switch
                                id="themeSwitch"
                                type="switch"
                                title="Switch to dark mode"
                                checkState={theme === "dark" ? CheckState.Checked : CheckState.Unchecked}
                                onChange={this.handleThemeChange}
                            />
                            <Button
                                id="githubLink"
                                title="View on GitHub"
                                imageOnly={true}
                                role="switch"
                                onClick={this.handleGithubClick}
                            >
                                <Icon src={Codicon.GithubInverted} />
                            </Button>
                        </Container>

                        <Container id="toolbar" orientation={Orientation.LeftToRight}>
                            <Button
                                id="scoreLibraryButton"
                                caption="Score Library"
                                onClick={this.handleScoreLibraryClick}
                            />
                            <Button
                                id="instrumentEditor"
                                caption="Instrument Editor"
                                onClick={this.handleInstrumentEditorClick}
                            />
                        </Container>
                        <AnimadaScoreBookUi serializedArrangement={arrangement} />
                    </Container>
                    <Dialog
                        ref={this.scoreLibraryRef}
                    >
                        <AppContext.Provider
                            value={{
                                dataModel: this.dataModel
                            }}>

                            <ScoreLibrary
                                onAction={this.handleScoreLibraryAction}
                            />
                        </AppContext.Provider>
                    </Dialog>
                    <TooltipProvider />
                </ErrorBoundary>
            </AppContext.Provider>
        );
    }

    private handleGithubClick = () => {
        window.open("https://github.com/mike-lischke/animada-score-book", "_blank");
    };

    private handleThemeChange = (e: InputEvent, checkState: CheckState) => {
        this.setState({
            theme: checkState === CheckState.Checked ? "dark" : "light",
        }, () => {
            const { theme } = this.state;
            document.body.setAttribute("data-theme", theme);
        });
    };

    private handleScoreLibraryClick = () => {
        this.scoreLibraryRef.current?.open();
    };

    private handleInstrumentEditorClick = () => {
        alert("Instrument Editor is not yet implemented.");
    };

    private handleScoreLibraryAction = (action: string, data: ISbDmScoreFolder | ISbDmScore) => {
        switch (action) {
            case "edit": {
                this.scoreLibraryRef.current?.close(false);
                //this.dataModel.loadArrangementIntoEditor(data);

                break;
            }

            case "play": {
                this.scoreLibraryRef.current?.close(false);

                if (data.type === SbDmEntityType.Score) {
                    const params = new URLSearchParams(data.content);
                    const serializedArrangement = getSerialisedArrangementFromParams(params);
                    this.setState({ serializedArrangement });

                    return;
                }

                break;
            }
        };
    };
}
