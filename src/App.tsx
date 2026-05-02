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

import { ArrangementEditControls } from "./components/ui/Arrangement/ArrangementEditControls.js";
import { ArrangementPlayControls } from "./components/ui/Arrangement/ArrangementPlayControls.js";
import { ArrangementTitle } from "./components/ui/Arrangement/ArrangementTitle.js";
import { ArrangementViewer } from "./components/ui/Arrangement/ArrangementViewer.js";
import { PlayStopButton } from "./components/ui/Arrangement/PlayStopButton.js";
import { ConfirmDialog } from "./components/ui/composites/ConfirmDialog.js";
import {
    ValueDialog, ValueEditorEntryType, type IValueEditorValueEntry
} from "./components/ui/composites/ValueDialog.js";
import { Codicon } from "./components/ui/framework/Codicon.js";
import { CollapsingTopContainer } from "./components/ui/framework/CollapsingTopContainer.js";
import { DialogResponseClosure } from "./components/ui/framework/Dialog.js";
import { DrawerSidebar } from "./components/ui/framework/DrawerSidebar.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { TooltipProvider } from "./components/ui/framework/Tooltip.js";
import { Overlay } from "./components/ui/Overlay.js";
import { AppStorage, type IUISettings } from "./core/AppStorage.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { BananaDrumUrlImporter } from "./core/serialisation/BananaDrumUrlImporter.js";
import type { IArrangementSnapshot, ISerialisedArrangement } from "./core/types/general.js";
import { UndoManager } from "./core/UndoManager.js";
import { convertErrorToString } from "./core/utils.js";
import { ArrangementPlayer } from "./player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "./player/types.js";
import { escapeStack } from "./supplement/EscapeStack.js";
import { requisitions } from "./supplement/Requisitions.js";
import { emptySongString } from "./ui/index.js";
import { ModeManager } from "./ui/ModeManager.js";
import { MouseHandler } from "./ui/MouseHandler.js";
import { ScoreLibrary } from "./ui/ScoreLibrary.js";
import { SelectionManager } from "./ui/SelectionManager.js";
import { SettingsDialog } from "./ui/SettingsDialog.js";

enum DisplayMode {
    Standard,
    Editing
}

interface IAppState {
    ready: boolean;
    serializedArrangement?: ISerialisedArrangement;

    editingTitle: boolean;

    displayMode: DisplayMode;
    sidebarOpen: boolean;

    headerPinned: boolean;
}

const newSong: ISerialisedArrangement = { composition: emptySongString, version: 2, title: "New Song" };

export class App extends UIComponent<{}, IAppState> {
    private scoreLibraryRef = createRef<DrawerSidebar>();
    private settingsDialogRef = createRef<SettingsDialog>();
    private valueDialogRef = createRef<ValueDialog>();
    private confirmDialogRef = createRef<ConfirmDialog>();

    private dataModel = new ScoreBookDataModel();

    private services: ScoreBookUiServices;
    private arrangementPlayer?: ArrangementPlayer;
    private undoManager?: UndoManager;
    private stopCurrentScoreAutoSave?: () => void;

    private mouseHandler?: MouseHandler;

    private justFinishedEditingTitle = false;

    private currentPlayRange?: { startBar: number; endBar: number; };
    private selectedThemePreference = "Light+";
    private systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    public constructor(props: {}) {
        super(props);

        this.state = {
            ready: false,
            editingTitle: false,
            displayMode: DisplayMode.Standard,
            sidebarOpen: false,
            headerPinned: false,
        };

        const selectionManager = new SelectionManager();
        this.services = {
            selectionManager,
            modeManager: new ModeManager(selectionManager),
        };

        this.initEventHandlers();
    }

    public override componentDidMount() {
        this.selectedThemePreference = AppStorage.loadUISettings()?.theme ?? "Light+";
        this.applyThemePreference(this.selectedThemePreference);
        this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);
        escapeStack.attach();
        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("playRangeChanged", this.handlePlayRangeChanged);

        void this.dataModel.initialize().then(() => {
            const arrangementSnapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(
                new URL(window.location.href).searchParams,
                this.dataModel.instruments
            );
            this.loadScorebook(arrangementSnapshot);
            this.setState({ ready: true });
        });
    }

    public override shouldComponentUpdate(nextProps: {}, nextState: IAppState): boolean {
        const { displayMode, sidebarOpen, ready, headerPinned } = this.state;

        return displayMode !== nextState.displayMode
            || sidebarOpen !== nextState.sidebarOpen || ready !== nextState.ready
            || headerPinned !== nextState.headerPinned;
    }

    public override componentWillUnmount() {
        super.componentWillUnmount();
        this.stopCurrentScoreAutoSave?.();
        this.stopCurrentScoreAutoSave = undefined;
        this.systemThemeQuery.removeEventListener("change", this.handleSystemThemeChange);
        escapeStack.detach();
        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("playRangeChanged", this.handlePlayRangeChanged);
    }

    public render() {
        const { ready, displayMode, sidebarOpen, headerPinned } = this.state;

        if (!ready) {
            return <ProgressIndicator />;
        }

        const arrangementView = this.dataModel.arrangement!;
        const scoreMetrics = this.arrangementPlayer!.scoreMetrics;

        let titleBlock;
        if (this.arrangementPlayer) {
            titleBlock = <Container
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.End}
                crossAlignment={ChildAlignment.Center}
                style={{ width: "100%" }}
            >
                <ArrangementTitle
                    id="mainArrangementTitle"
                    arrangement={arrangementView}
                    data-tooltip="expand"
                    undoManager={this.undoManager!}
                    editMode={displayMode === DisplayMode.Editing}
                    onEditEnd={this.onEditEnd}
                />
                <Button
                    imageOnly
                    data-role="restore-top"
                    style={{ margin: "2px 16px 0 0", width: "24px", height: "24px" }}
                    className="normal-case btn-ghost"
                    onClick={() => {
                        this.setState({ headerPinned: !headerPinned });
                    }}
                >
                    <Icon
                        src={headerPinned ? Codicon.Pinned : Codicon.Pin}
                        data-tooltip={headerPinned ? "Pinned Header" : "Automatic Header"}
                    />
                </Button>

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
                    <DrawerSidebar
                        id="mainDrawer"
                        ref={this.scoreLibraryRef}
                        open={sidebarOpen}
                        sidebarContent={
                            <ScoreLibrary
                                onAction={this.handleScoreLibraryAction}
                                dataModel={this.dataModel}
                            />
                        }
                        onOpenChange={(open) => {
                            this.setState({ sidebarOpen: open }, () => {
                                if (!open) {
                                    escapeStack.remove(this.onSidebarEscape);
                                }
                            });
                        }}
                    >
                        <CollapsingTopContainer
                            top={
                                <Container
                                    orientation={Orientation.LeftToRight}
                                    crossAlignment={ChildAlignment.Center}
                                >
                                    <Container
                                        id="headerContent"
                                        className="rounded-3xl shadow-md border border-base-200/70 gap-4"
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
                                        </Container>
                                        <Container
                                            id="appTitleContainer"
                                            orientation={Orientation.TopDown}
                                            crossAlignment={ChildAlignment.Stretch}
                                        >
                                            <Container>
                                                <img id="titleLogo" src="/logo.svg" />
                                                <Label className="appTitle top faded">ANIMADA</Label>
                                            </Container>
                                            <Container>
                                                <Label className="appTitle bottom faded">Score</Label>
                                                <Label className="appTitle bottom accent">Book</Label>
                                            </Container>
                                            <Container crossAlignment={ChildAlignment.Center} id="arrangementStats">
                                                {scoreStats}
                                            </Container>

                                        </Container>
                                        <ArrangementPlayControls
                                            arrangementPlayer={this.arrangementPlayer!}
                                            dataModel={this.dataModel}
                                            services={this.services}
                                            undoManager={this.undoManager!}
                                        />
                                        <Container
                                            id="arrangementPalette"
                                            orientation={Orientation.TopDown}
                                            mainAlignment={ChildAlignment.Start}
                                            crossAlignment={ChildAlignment.Stretch}
                                        >
                                            {titleBlock}
                                            {displayMode === DisplayMode.Editing && <ArrangementEditControls
                                                dataModel={this.dataModel}
                                                services={this.services}
                                                undoManager={this.undoManager!}
                                            />}
                                        </Container>
                                    </Container>
                                </Container>
                            }
                            collapsedTop={
                                <Container
                                    className="collapsed-header"
                                    orientation={Orientation.LeftToRight}
                                    crossAlignment={ChildAlignment.Center}
                                >
                                    <PlayStopButton
                                        id="standalonePlayButton"
                                        arrangementPlayer={this.arrangementPlayer!}
                                    />
                                    {titleBlock}
                                </Container>
                            }
                            bottom={
                                this.arrangementPlayer && <ArrangementViewer
                                    arrangementPlayer={this.arrangementPlayer}
                                    dataModel={this.dataModel}
                                    services={this.services}
                                    undoManager={this.undoManager!}
                                    touchEditingEnabled={displayMode === DisplayMode.Editing}
                                />
                            }
                            forceExpanded={headerPinned}
                        />
                    </DrawerSidebar>
                </Container>
                <TooltipProvider />
                <ValueDialog ref={this.valueDialogRef} />
                <ConfirmDialog ref={this.confirmDialogRef} />
                <SettingsDialog ref={this.settingsDialogRef} />
            </ErrorBoundary>
        );
    }

    private handleGithubClick = () => {
        window.open("https://github.com/mike-lischke/animada-score-book", "_blank");
    };

    private handleScoreLibraryClick = () => {
        this.setState({ sidebarOpen: true }, () => {
            escapeStack.push(this.onSidebarEscape);
        });
    };

    private handleInstrumentEditorClick = () => {
        alert("Instrument Editor is not yet implemented.");
    };

    private handleDisplayOptionsClick = () => {
        this.settingsDialogRef.current?.open();
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        this.applyThemePreference(settings.theme);

        return Promise.resolve(true);
    };

    private handleSystemThemeChange = (): void => {
        if (this.selectedThemePreference === "Auto") {
            this.applyThemePreference("Auto");
        }
    };

    private applyThemePreference(themePreference?: string): void {
        this.selectedThemePreference = themePreference ?? "Light+";
        const appliedTheme = this.selectedThemePreference === "Auto"
            ? (this.systemThemeQuery.matches ? "Dark+" : "Light+")
            : this.selectedThemePreference;
        document.documentElement.setAttribute("data-theme", appliedTheme);
    }

    private handleScoreLibraryAction = async (action: string, data?: ISbDmScoreFolder | ISbDmScore,
        parent?: ISbDmScoreFolder): Promise<boolean> => {

        // If no data is provided, it can be "addFolder" or "import".
        if (!data || action === "addFolder") {
            switch (action) {
                case "addFolder": {
                    const result = await this.valueDialogRef.current?.show(
                        "addFolderDialog",
                        "Add New Folder",
                        Codicon.Add,
                        [{
                            type: ValueEditorEntryType.Title,
                            id: "folderNameDescription",
                            content: "Name:",
                        },
                        {
                            type: ValueEditorEntryType.Value,
                            id: "folderName",
                            content: "Name of the new folder",
                            displayWidth: 6,
                        }],
                    );

                    if (result?.closure !== DialogResponseClosure.Accept) {
                        return false;
                    }

                    const newFolderName = (result.data.folderName as IValueEditorValueEntry).content as string;
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
                            try {
                                const clipboardText = await navigator.clipboard.readText();
                                if (clipboardText && clipboardText.trim().length > 0) {
                                    try {
                                        new URL(clipboardText);
                                        content = clipboardText;
                                    } catch {
                                        // Not a valid URL, ignore.
                                    }
                                }
                            } catch {
                                // Clipboard access denied (e.g. iOS permission not granted) — proceed
                                // with an empty pre-fill so the user can still type the URL manually.
                            }
                        }

                        const result = await this.valueDialogRef.current?.show(
                            "importScoreDialog",
                            "Import Score",
                            Codicon.CloudDownload,
                            [{
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
                            } as IValueEditorValueEntry],
                        );

                        if (result) {
                            let url: string | undefined;

                            if (result.closure === DialogResponseClosure.Accept) {
                                url = (result.data.scoreUrl as IValueEditorValueEntry).content as string;
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
                    const result = await this.valueDialogRef.current?.show(
                        "renameFolderDialog",
                        "Rename Folder",
                        Codicon.Rename,
                        [{
                            type: ValueEditorEntryType.Title,
                            id: "renameFolderDescription",
                            content: "New name:",
                            displayWidth: 2,
                        },
                        {
                            type: ValueEditorEntryType.Value,
                            id: "folderName",
                            content: data.name,
                            displayWidth: 6,
                        }],
                    );

                    if (result) {
                        let newName: string | undefined;

                        if (result.closure === DialogResponseClosure.Accept) {
                            newName = (result.data.folderName as IValueEditorValueEntry).content as string;
                        }

                        if (newName && newName.trim().length > 0) {
                            await this.dataModel.renameEntry(data, newName.trim());
                        }
                    }
                }

                break;
            }

            case "load": {
                this.setState({ sidebarOpen: false }, () => {
                    escapeStack.remove(this.onSidebarEscape);
                });

                if (data.type === SbDmEntityType.Score) {
                    const params = new URLSearchParams(data.content);
                    const arrangementSnapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(
                        params,
                        this.dataModel.instruments
                    );

                    this.loadScorebook(arrangementSnapshot ?? newSong);
                }

                break;
            }

            case "remove": {
                await data.refresh?.();

                const result = await this.confirmDialogRef.current?.show(
                    `Are you sure you want to delete '${data.name}'?`,
                    {
                        accept: "Delete",
                        refuse: "Cancel",
                    },
                    "Delete Confirmation",
                    ["This action cannot be undone.", "Make sure to export the content if you want to keep a copy."],
                );

                if (result !== DialogResponseClosure.Accept) {
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

    private loadScorebook(scoreToLoad?: ISerialisedArrangement | IArrangementSnapshot) {
        let arrangementToLoad: ISerialisedArrangement | undefined;
        let snapshotToLoad: IArrangementSnapshot | undefined;

        if (scoreToLoad) {
            if (this.isArrangementSnapshot(scoreToLoad)) {
                snapshotToLoad = scoreToLoad;
            } else {
                arrangementToLoad = scoreToLoad;
            }
        }

        if (this.arrangementPlayer) {
            const arrangementView = this.dataModel.arrangement!;
            arrangementView.timeParams.unsubscribe(this.handleTimeParamsChanged);

            this.arrangementPlayer.dispose();
        }

        this.stopCurrentScoreAutoSave?.();
        this.stopCurrentScoreAutoSave = undefined;

        if (!arrangementToLoad && !snapshotToLoad) {
            // Try to load the last opened score from localStorage, if available.
            const lastScoreString = AppStorage.loadUISettings()?.currentScore;
            if (lastScoreString) {
                try {
                    const parsed = JSON.parse(lastScoreString) as ISerialisedArrangement | IArrangementSnapshot;
                    if (this.isSerialisedArrangement(parsed)) {
                        arrangementToLoad = parsed;
                    } else if (this.isArrangementSnapshot(parsed)) {
                        snapshotToLoad = parsed;
                    }
                } catch {
                    // Failed to parse, ignore and start with a new song.
                }
            }
        }

        const resolvedArrangementToLoad = arrangementToLoad ?? newSong;
        const arrangement = this.dataModel.loadArrangement(resolvedArrangementToLoad);
        if (snapshotToLoad) {
            arrangement.applyArrangementSnapshot(snapshotToLoad, this.dataModel.instruments);
        }
        this.undoManager = new UndoManager(this.dataModel);
        this.stopCurrentScoreAutoSave = this.undoManager.topics.currentState.subscribe(() => {
            AppStorage.saveSetting("currentScore", JSON.stringify(this.undoManager!.currentState));
        });
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);
        this.dataModel.arrangement!.timeParams.subscribe(this.handleTimeParamsChanged);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        this.setState({ serializedArrangement: resolvedArrangementToLoad }, () => {
            if (snapshotToLoad) {
                AppStorage.saveSetting("currentScore", JSON.stringify(snapshotToLoad));
            } else if (resolvedArrangementToLoad === newSong) {
                AppStorage.saveSetting("currentScore", undefined);
            } else {
                AppStorage.saveSetting("currentScore", JSON.stringify(resolvedArrangementToLoad));
            }
        });
    }

    private isSerialisedArrangement(data: unknown): data is ISerialisedArrangement {
        if (!data || typeof data !== "object") {
            return false;
        }

        const candidate = data as Partial<ISerialisedArrangement>;

        return typeof candidate.composition === "string"
            && typeof candidate.version === "number";
    }

    private isArrangementSnapshot(data: unknown): data is IArrangementSnapshot {
        if (!data || typeof data !== "object") {
            return false;
        }

        const candidate = data as Partial<IArrangementSnapshot>;

        return !!candidate.timeParams && Array.isArray(candidate.tracks);
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

    private onSidebarEscape = (): void => {
        this.setState({ sidebarOpen: false });
    };

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
                    if (this.arrangementPlayer.state === "stopped") {
                        if (this.currentPlayRange) {
                            void this.arrangementPlayer.playBars(this.currentPlayRange.startBar,
                                this.currentPlayRange.endBar - this.currentPlayRange.startBar + 1);
                        } else {
                            void this.arrangementPlayer.play();
                        }
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
                        arrangement: this.dataModel.arrangement!,
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

    private handleTimeParamsChanged = () => {
        this.forceUpdate();
    };

    private handlePlayRangeChanged = (range: { from: number; to: number; } | undefined): Promise<boolean> => {
        this.currentPlayRange = range ? { startBar: range.from, endBar: range.to } : undefined;
        this.forceUpdate();

        return Promise.resolve(true);
    };
}
