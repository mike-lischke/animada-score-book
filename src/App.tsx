/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "@vscode/codicons/dist/codicon.css";
import "./App.scss";
import "./tailwind.css";

import timbauImage from "./assets/images/instrument-icons/timbau.svg";

import { createRef } from "preact";

import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { Button } from "./components/ui/framework/Button.js";
import { Container } from "./components/ui/framework/Container.js";
import { Label } from "./components/ui/framework/Label.js";
import { ProgressIndicator } from "./components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";

import { ArrangementPlayControls } from "./components/ui/Arrangement/ArrangementPlayControls.js";
import { ArrangementTitle } from "./components/ui/Arrangement/ArrangementTitle.js";
import { ArrangementViewer } from "./components/ui/Arrangement/ArrangementViewer.js";
import { ValueEditorEntryType, type IValueEditorValueEntry } from "./components/ui/composites/ValueDialog.js";
import { Codicon } from "./components/ui/framework/Codicon.js";
import { Dialog, DialogResponseClosure, DialogType } from "./components/ui/framework/Dialog.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { TooltipProvider } from "./components/ui/framework/Tooltip.js";
import { Overlay } from "./components/ui/Overlay.js";
import { ShareButton } from "./components/ui/ShareButton.js";
import { AppStorage } from "./core/AppStorage.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { getSerialisedArrangementFromParams } from "./core/serialisation/url.js";
import type { ISerialisedArrangement } from "./core/types/snapshots.js";
import { UndoManager } from "./core/UndoManager.js";
import { convertErrorToString } from "./core/utils.js";
import { ArrangementPlayer } from "./player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "./player/types.js";
import { DialogHost } from "./ui/DialogHost.js";
import { emptySongString } from "./ui/index.js";
import { ModeManager } from "./ui/ModeManager.js";
import { MouseHandler } from "./ui/MouseHandler.js";
import { ScoreLibrary } from "./ui/ScoreLibrary.js";
import { SelectionManager } from "./ui/SelectionManager.js";
import { SettingsDialog } from "./ui/SettingsDialog.js";
import { ArrangementEditControls } from "./components/ui/Arrangement/ArrangementEditControls.js";

enum DisplayMode {
    Standard,
    Editing
}

interface IAppState {
    ready: boolean;
    serializedArrangement?: ISerialisedArrangement;

    theme: string;
    editingTitle: boolean;

    displayMode: DisplayMode;
}

const newSong: ISerialisedArrangement = { composition: emptySongString, version: 2, title: "New Song" };

export class App extends UIComponent<{}, IAppState> {
    private scoreLibraryRef = createRef<Dialog>();
    private settingsDialogRef = createRef<SettingsDialog>();

    private dataModel = new ScoreBookDataModel();

    private services: ScoreBookUiServices;
    private arrangementPlayer?: ArrangementPlayer;
    private undoManager?: UndoManager;

    private mouseHandler?: MouseHandler;

    private justFinishedEditingTitle = false;

    public constructor(props: {}) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const theme = settings.theme ?? "Light+";
        this.state = {
            ready: false,
            theme,
            editingTitle: false,
            displayMode: DisplayMode.Standard,
        };

        const selectionManager = new SelectionManager();
        this.services = {
            selectionManager,
            modeManager: new ModeManager(selectionManager),
        };

        this.initEventHandlers();
    }

    public override componentDidMount() {
        const { theme } = this.state;
        document.documentElement.setAttribute("data-theme", theme);

        void this.dataModel.initialize().then(() => {
            const serializedArrangement =
                getSerialisedArrangementFromParams(new URL(window.location.href).searchParams);
            this.loadScorebook(serializedArrangement ?? newSong);
            this.setState({ ready: true });
        });
    }

    public render() {
        const { ready, displayMode } = this.state;

        if (!ready) {
            return <ProgressIndicator />;
        }

        const arrangementView = this.arrangementPlayer!.arrangementView;
        const scoreMetrics = this.arrangementPlayer!.scoreMetrics;

        let titleBlock;
        if (this.arrangementPlayer) {
            titleBlock = <Container
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.Center}
                crossAlignment={ChildAlignment.Center}>
                <ArrangementTitle
                    id="mainArrangementTitle"
                    arrangement={arrangementView}
                    data-tip="expand"
                    undoManager={this.undoManager!}
                    editMode={displayMode === DisplayMode.Editing}
                    onEditEnd={this.onEditEnd}
                />
            </Container>;
        }

        const bars = scoreMetrics.bars === 1 ? "1 bar" : `${scoreMetrics.bars} bars`;
        const scoreStats = `${scoreMetrics.beatsPerBar}/${scoreMetrics.beatsPerBar} • ${bars} • ` +
            `${Math.round(100 * scoreMetrics.realTimeLength) / 100} s`;

        return (
            <ErrorBoundary>
                <Container
                    id="appRoot"
                    orientation={Orientation.TopDown}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Container
                            id="headerContent"
                            className="rounded-3xl shadow-md border border-base-200/70"
                        >
                            <Container
                                id="toolbarButtons"
                                orientation={Orientation.TopDown}
                                mainAlignment={ChildAlignment.Center}
                                className="bg-base-100/80 p-2"
                            >
                                <Button
                                    imageOnly
                                    className="btn-ghost"
                                    data-tooltip="Display Options"
                                    onClick={this.handleDisplayOptionsClick}
                                >
                                    <Icon src={Codicon.Gear} data-tooltip="inherit" />
                                </Button>
                                <Button
                                    id="scoreLibraryButton"
                                    imageOnly
                                    className="btn-ghost"
                                    data-tooltip="Score Library"
                                    onClick={this.handleScoreLibraryClick}
                                >
                                    <Icon src={Codicon.Library} data-tooltip="inherit" />
                                </Button>
                                <Button
                                    id="instrumentEditor"
                                    imageOnly
                                    className="btn-ghost"
                                    data-tooltip="Instrument Editor"
                                    disabled
                                    onClick={this.handleInstrumentEditorClick}
                                >
                                    <Icon src={timbauImage} width={24} height={24} data-tooltip="inherit" />
                                </Button>
                                <ShareButton />
                            </Container>
                            <Container
                                id="appTitleContainer"
                                orientation={Orientation.TopDown}
                                crossAlignment={ChildAlignment.Stretch}
                            >
                                <Container>
                                    <img id="titleLogo" src="/logo.svg" />
                                    <Label className="appTitle top">ANIMADA</Label>
                                </Container>
                                <Container>
                                    <Label className="appTitle bottom">Score</Label>
                                    <Label className="appTitle bottom accent">Book</Label>
                                </Container>
                                <Container crossAlignment={ChildAlignment.Center} id="arrangementStats">
                                    {scoreStats}
                                </Container>

                            </Container>
                            <Container
                                orientation={Orientation.TopDown}
                                mainAlignment={ChildAlignment.Center}
                            >
                                <ArrangementPlayControls
                                    arrangementPlayer={this.arrangementPlayer!}
                                    services={this.services}
                                    undoManager={this.undoManager!}
                                />
                            </Container>
                            <Container
                                id="arrangementPalette"
                                className="flex-1 p-1 pr-2"
                                orientation={Orientation.TopDown}
                                mainAlignment={ChildAlignment.Start}
                                crossAlignment={ChildAlignment.End}
                            >
                                {titleBlock}
                                {displayMode === DisplayMode.Editing && <ArrangementEditControls
                                    arrangementPlayer={this.arrangementPlayer!}
                                    services={this.services}
                                    undoManager={this.undoManager!}
                                />}
                            </Container>
                        </Container>
                    </Container>

                    {this.arrangementPlayer && <ArrangementViewer
                        arrangementPlayer={this.arrangementPlayer}
                        services={this.services}
                        undoManager={this.undoManager!}
                    />}

                </Container>
                <Dialog
                    ref={this.scoreLibraryRef}
                >
                    <ScoreLibrary
                        onAction={this.handleScoreLibraryAction}
                        dataModel={this.dataModel}
                    />
                </Dialog>
                <TooltipProvider />
                <DialogHost />
                <SettingsDialog ref={this.settingsDialogRef} onSettingsChanged={this.handleSettingsChanged} />
            </ErrorBoundary>
        );
    }

    private handleGithubClick = () => {
        window.open("https://github.com/mike-lischke/animada-score-book", "_blank");
    };

    private handleScoreLibraryClick = () => {
        this.scoreLibraryRef.current?.open();
    };

    private handleInstrumentEditorClick = () => {
        alert("Instrument Editor is not yet implemented.");
    };

    private handleDisplayOptionsClick = () => {
        this.settingsDialogRef.current?.open();
    };

    private handleSettingsChanged = () => {
        const settings = AppStorage.loadUISettings() ?? {};
        const theme = settings.theme ?? "light";
        this.setState({ theme });
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

                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (navigator.clipboard?.readText) {
                            const clipboardText = await navigator.clipboard.readText();
                            if (clipboardText && clipboardText.trim().length > 0) {
                                try {
                                    new URL(clipboardText);
                                    content = clipboardText;
                                } catch {
                                    // Not a valid URL, ignore.
                                }
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

                    this.loadScorebook(serializedArrangement ?? newSong);
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

    private loadScorebook(arrangementToLoad: ISerialisedArrangement) {
        if (this.arrangementPlayer) {
            this.arrangementPlayer.dispose();
        }

        const arrangement = this.dataModel.loadArrangement(arrangementToLoad);
        this.undoManager = new UndoManager(arrangement, this.dataModel.instruments);
        this.arrangementPlayer = new ArrangementPlayer(arrangement);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        this.setState({ serializedArrangement: arrangementToLoad });

    }

    private initEventHandlers(): void {
        window.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });
        window.addEventListener("keyup", (event) => {
            this.handleKeyUp(event);
        });

        this.mouseHandler = new MouseHandler(this.services.modeManager, this.services.selectionManager);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "Escape": {
                Overlay.closeAllOverlays();
                this.services.selectionManager.deselectAll();
                this.services.modeManager.deletePolyrhythmMode = false;

                break;
            }

            case " ": {
                if (this.arrangementPlayer) {
                    if (this.arrangementPlayer.currentTiming === null) {
                        this.arrangementPlayer.play();
                    } else {
                        this.arrangementPlayer.stop();
                    }
                }
                event.preventDefault(); // This is to prevent spaces getting written in number inputs

                break;
            }

            case "Alt": {
                this.services.modeManager.deletePolyrhythmMode = true;
                event.preventDefault();

                break;
            }

            case "Backspace":
            case "Delete": {
                if (!(event.target instanceof HTMLInputElement)) {
                    this.undoManager?.edit({
                        type: "EditCommand_ArrangementClearSelection",
                        arrangement: this.undoManager.arrangement,
                        clearSelection: this.services.selectionManager.selections
                    });
                    this.services.selectionManager.deselectAll();
                }

                break;
            }

            // Undo/Redo: We have different conventions between Mac and Windows
            // Windows: ctrl+z / ctrl+y
            // Mac: command+z / command+shift+z
            // We allow overlap for maximum cross-browser consistency, except where it actually causes confusion
            case "z": {
                if (event.ctrlKey || event.metaKey) {
                    if (event.shiftKey) {
                        this.undoManager?.redo();
                    } else {
                        // Standard redo on Mac, and no problem to allow it on Windows
                        this.undoManager?.undo();
                    } // With ctrl, this doesn't even trigger on Mac. Seems harmless to include it anyway.
                }
                break;
            }

            case "y": {
                // We do not allow command+y to redo on Mac
                // On Chrome, Firefox, and Safari, it triggers browser things, and so is very confusing to also redo
                if (event.ctrlKey) {
                    this.undoManager?.redo();
                }

                break;
            }
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (event.key === "Alt") {
            this.services.modeManager.deletePolyrhythmMode = false;
        }
    }

    private onEditEnd = () => {
        this.setState({ editingTitle: false });
        this.justFinishedEditingTitle = true;
        setTimeout(() => {
            return this.justFinishedEditingTitle = false;
        }, 100);
    };

    private onClickEditTitle = () => {
        if (!this.justFinishedEditingTitle) {
            this.setState({ editingTitle: true });
        }
    };
}
