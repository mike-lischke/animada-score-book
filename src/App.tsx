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
import { Dialog, DialogResponseClosure, DialogType } from "./components/ui/framework/Dialogs/Dialog.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { CheckState, Switch } from "./components/ui/framework/Switch/Switch.js";
import { TooltipProvider } from "./components/ui/framework/Tooltip.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { getSerialisedArrangementFromParams } from "./core/serialisation/url.js";
import type { ISerialisedArrangement } from "./core/types/snapshots.js";
import { convertErrorToString } from "./core/utils.js";
import { AnimadaScoreBookUi } from "./ui/AnimadaScoreBookUi.js";
import { AppContext, emptySongString } from "./ui/index.js";
import { ScoreLibrary } from "./ui/ScoreLibrary.js";
import { DialogHost } from "./ui/DialogHost.js";
import { ValueEditorEntryType, type IValueEditorValueEntry } from "./components/ui/composites/ValueDialog.js";

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

        const arrangement = serializedArrangement ?? { composition: emptySongString, version: 2, title: "New Song" };

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
                    <DialogHost />
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

    private handleScoreLibraryAction = async (action: string, data?: ISbDmScoreFolder | ISbDmScore,
        parent?: ISbDmScoreFolder): Promise<boolean> => {

        // If no data is provided, it can be "addFolder" or "import".
        if (!data || action === "addFolder") {
            switch (action) {
                case "addFolder": {
                    let newFolderName: string | undefined;
                    const result = await DialogHost.showDialog({
                        id: "addFolderDialog",
                        type: DialogType.Prompt,
                        parameters: {
                            title: "Add New Folder",
                            entries: [{
                                type: ValueEditorEntryType.Title,
                                id: "folderNameDescription",
                                content: "Enter the new folder name:",
                            },
                            {
                                type: ValueEditorEntryType.Value,
                                id: "folderName",
                                content: "New Folder",
                            }],
                        },
                    });

                    if (result.closure === DialogResponseClosure.Accept && result.data) {
                        newFolderName = (result.data.values as IValueEditorValueEntry[])
                            .find((entry) => {
                                return entry.id === "folderName";
                            })?.content as string;
                    }

                    if (!newFolderName) {
                        return false;
                    }

                    if (newFolderName && newFolderName.trim().length > 0) {
                        try {
                            await this.dataModel.addScoreFolder(newFolderName.trim(), parent);
                        } catch (error) {
                            const message = convertErrorToString(error);
                            alert(message);

                            return false;
                        }

                        return true;
                    }

                    return false;

                }

                case "import": {
                    if (parent) {
                        // See if the clipboard has a valid score URL.
                        let content = "";
                        const clipboardText = await navigator.clipboard.readText();
                        if (clipboardText && clipboardText.trim().length > 0) {
                            try {
                                new URL(clipboardText);
                                content = clipboardText;
                            } catch {
                                // Not a valid URL, ignore.
                            }
                        }

                        const result = await DialogHost.showDialog({
                            id: "importScoreDialog",
                            type: DialogType.Prompt,
                            parameters: {
                                title: "Import Score",
                                entries: [{
                                    type: ValueEditorEntryType.Title,
                                    id: "importScoreDescription",
                                    content: `Score URL:`,
                                    displayWidth: 2,
                                },
                                {
                                    type: ValueEditorEntryType.Value,
                                    id: "scoreUrl",
                                    content,
                                    placeholder: "https://<host-name>/?t=...",
                                    displayWidth: 6,
                                }],
                            },
                        });

                        let url: string | undefined;

                        if (result.closure === DialogResponseClosure.Accept && result.data) {
                            url = (result.data.values as IValueEditorValueEntry[])
                                .find((entry) => {
                                    return entry.id === "scoreUrl";
                                })?.content as string;
                        }

                        if (url && url.trim().length > 0) {
                            try {
                                const params = new URL(url).searchParams;
                                const title = params.get("t") ?? "Imported Score";
                                await this.dataModel.addScore(title, params.toString(), parent);

                                return true;
                            } catch (error) {
                                const message = convertErrorToString(error);
                                alert(message);

                                return false;
                            }
                        }
                    }

                    return false;
                }

                default:
            }

            return false;
        }

        switch (action) {
            case "edit": {
                if (data.type === SbDmEntityType.ScoreFolder) {
                    const result = await DialogHost.showDialog({
                        id: "renameFolderDialog",
                        type: DialogType.Prompt,
                        parameters: {
                            title: "Rename Folder",
                            entries: [{
                                type: ValueEditorEntryType.Title,
                                id: "renameFolderDescription",
                                content: "Enter the new folder name:",
                            },
                            {
                                type: ValueEditorEntryType.Value,
                                id: "folderName",
                                content: data.name,
                            }],
                        },
                    });

                    let newName: string | undefined;

                    if (result.closure === DialogResponseClosure.Accept && result.data) {
                        newName = (result.data.values as IValueEditorValueEntry[])
                            .find((entry) => {
                                return entry.id === "folderName";
                            })?.content as string;
                    }

                    if (newName && newName.trim().length > 0) {
                        await this.dataModel.renameEntry(data, newName.trim());
                    }
                } else {
                    this.scoreLibraryRef.current?.close(false);
                }

                break;
            }

            case "play": {
                this.scoreLibraryRef.current?.close(false);

                if (data.type === SbDmEntityType.Score) {
                    const params = new URLSearchParams(data.content);
                    const serializedArrangement = getSerialisedArrangementFromParams(params);
                    this.setState({ serializedArrangement });
                }

                break;
            }

            case "remove": {
                await data.refresh?.();

                const result = await DialogHost.showDialog({
                    id: "deleteConfirmDialog",
                    type: DialogType.Confirm,
                    title: "Delete Confirmation",
                    description: [
                        `Are you sure you want to delete '${data.name}'? This action cannot be undone.`,
                    ],
                    parameters: {
                        accept: "Delete",
                        refuse: "Cancel",
                    },
                });

                if (result.closure !== DialogResponseClosure.Accept) {
                    return false;
                }

                try {
                    await this.dataModel.deleteEntry(data);
                } catch (error) {
                    const message = convertErrorToString(error);
                    alert(message);

                    return false;
                }

                break;
            }

            default:
        };

        return true;
    };
}
