/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./App.scss";
import "./print.scss";
import "./print-preview.scss";
import "./tailwind.css";

import { createRef, type ComponentChild } from "preact";
import { lazy, Suspense } from "preact/compat";

import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { Button } from "./components/ui/framework/Button.js";
import { Container } from "./components/ui/framework/Container.js";
import { Dropdown, type IDropdownItem } from "./components/ui/framework/Dropdown.js";
import { ProgressIndicator } from "./components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";
import { NotificationCenter, renderNotificationCenter } from "./components/ui/NotificationCenter/NotificationCenter.js";
import { AppFooter } from "./components/ui/Navigation/AppFooter.js";
import { ArrangementIdentity, ArrangementSaveState } from "./components/ui/Header/ArrangementIdentity.js";

import { ArrangementPlayControls } from "./components/ui/Arrangement/ArrangementPlayControls.js";
import { AnimationDiagnostics } from "./components/ui/Arrangement/AnimationDiagnostics.js";
import { ArrangementModeBar } from "./components/ui/Arrangement/ArrangementModeBar.js";
import { ArrangementViewer } from "./components/ui/Arrangement/ArrangementViewer.js";
import { ToolsBar } from "./components/ui/Arrangement/ToolsBar.js";
import { UndoRedoControls } from "./components/ui/Arrangement/UndoRedoControls.js";
import { ConfirmDialog } from "./components/ui/composites/ConfirmDialog.js";
import { NewScoreDialog } from "./components/ui/composites/NewScoreDialog.js";
import type { ReleaseNotesDialog } from "./components/ui/composites/ReleaseNotesDialog.js";
import {
    ValueDialog, ValueEditorEntryType, type IValueEditorValueEntry
} from "./components/ui/composites/ValueDialog.js";
import { Dialog, DialogResponseClosure } from "./components/ui/framework/Dialog.js";
import { DrawerSidebar } from "./components/ui/framework/DrawerSidebar.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { Label } from "./components/ui/framework/Label.js";
import { Portal } from "./components/ui/framework/Portal.js";
import { UIIcon } from "./components/ui/framework/UIIcon.js";
import { AppStorage, type IUISettings } from "./core/AppStorage.js";
import { Arrangement, type IArrangementCreationOptions } from "./core/Arrangement.js";
import { getSharedAudioContext } from "./core/audio-context.js";
import {
    SbDmEntityType, ScoreBookChangeReason, ScoreBookDataModel, type ISbDmInstrument, type ISbDmScore,
    type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import {
    PasteOverflowMode, PasteResultKind, ScoreClipboard, SubdivisionPasteMode, type IPasteResult,
} from "./core/ScoreClipboard.js";
import { ArrangementMigrator } from "./core/serialisation/migration/ArrangementMigrator.js";
import { stringifyPackedArrangement, tryParsePackedArrangement } from "./core/serialisation/snapshot-packing.js";
import { SmuflFontLoader } from "./core/smufl/SmuflFontLoader.js";
import { EditEntryMode, TrackViewMode, type IArrangementSnapshot } from "./core/types/general.js";
import { SelectionGranularity } from "./ui/SelectionSerializer.js";
import { UndoManager } from "./core/UndoManager.js";
import { convertErrorToString } from "./core/utils.js";
import { ArrangementPlayer } from "./player/ArrangementPlayer.js";
import { AudioBufferPlayer } from "./player/AudioBufferPlayer.js";
import { escapeStack } from "./supplement/EscapeStack.js";
import { requisitions, type INotificationState } from "./supplement/Requisitions.js";
import { AdminSetupDialog } from "./ui/AdminSetupDialog.js";
import { BackendDisconnectedDialog } from "./ui/BackendDisconnectedDialog.js";
import { BackendSetupDialog, BackendSetupMode } from "./ui/BackendSetupDialog.js";
import { LoginDialog } from "./ui/LoginDialog.js";
import type { PermissionEditor } from "./ui/PermissionEditor.js";
import { PrintSession } from "./ui/PrintSession.js";
import { SelectionManager } from "./ui/SelectionManager.js";
import type { SettingsDialog } from "./ui/SettingsDialog.js";
import type { UserGroupEditor } from "./ui/UserGroupEditor.js";
import { isMobile } from "./ui/index.js";

const ScoreLibrary = lazy(() => {
    return import("./ui/ScoreLibrary.js").then((m) => {
        return { default: m.ScoreLibrary };
    });
});

// The print document and its preview are only needed while printing, so the initial bundle leaves them out.
const PrintDocument = lazy(() => {
    return import("./components/ui/Print/PrintDocument.js").then((m) => {
        return { default: m.PrintDocument };
    });
});

const PrintPreview = lazy(() => {
    return import("./components/ui/Print/PrintPreview.js").then((m) => {
        return { default: m.PrintPreview };
    });
});

enum AppPhase {
    /** Checking backend health. */
    Checking,

    /** Backend not initialised — show setup form. */
    Setup,

    /** First-time installation — no admin user exists yet. */
    AdminSetup,

    /** Backend ready, no session — show login dialog. */
    Login,

    /** App fully loaded and running. */
    Running,
}

/**
 * The dialog components `App` has loaded so far, keyed by their class name.
 *
 * A dialog's module is imported when the user opens it the first time; from then on the loaded component stays mounted
 * and is opened through its ref. The PascalCase keys are deliberate: the render tree uses them directly as components.
 */
interface IAppDialogs {
    SettingsDialog?: typeof SettingsDialog;
    UserGroupEditor?: typeof UserGroupEditor;
    PermissionEditor?: typeof PermissionEditor;
    ReleaseNotesDialog?: typeof ReleaseNotesDialog;
}

interface IAppState {
    phase: AppPhase;
    editMode: boolean;
    zenMode: boolean;
    sidebarOpen: boolean;

    /** The active arrangement view mode (grid or staff notation). */
    trackViewMode: TrackViewMode;

    /**
     * The entry mode the staff view was last set to. The grid view always works with overwrite, so the
     * mode that is in effect is derived from the view mode instead of being stored.
     */
    preferredEntryMode: EditEntryMode;

    /** Token for the active score lock, if editing. */
    lockToken?: string;

    /** Conflict info when another user holds the lock. */
    lockConflict?: { username: string; lockedAt: string; };

    /** When true, the printed document is rendered into the DOM and `window.print()` will be triggered. */
    printing: boolean;

    /** When true, the full-window print preview overlay is shown. */
    printPreviewOpen: boolean;

    /** The notification center's summary, for the footer's notification button. */
    notificationState: INotificationState;

    /** Track viewer zoom in percent, mirrored from the UI settings. */
    zoom: number;

    /** True when the header folds its secondary actions into a menu. */
    compactHeader: boolean;

    /** True when the floating bars and the footer fold controls into menus. */
    compactLayout: boolean;

    /** True once the current score was saved during this session. */
    scoreSaved: boolean;

    /** When true, the backend health endpoint was unreachable. */
    backendUnreachable: boolean;

    /** Error message shown during startup when the backend or database is unreachable. */
    startupError?: string;

    /** Dialog components loaded on demand; empty until the user opens one of them. */
    dialogs: IAppDialogs;
}

export class App extends UIComponent<{}, IAppState> {
    private scoreLibraryRef = createRef<DrawerSidebar | null>();
    private settingsDialogRef = createRef<SettingsDialog | null>();
    private backendSetupDialogRef = createRef<BackendSetupDialog | null>();
    private backendDisconnectedDialogRef = createRef<BackendDisconnectedDialog | null>();
    private loginDialogRef = createRef<LoginDialog | null>();
    private adminSetupDialogRef = createRef<AdminSetupDialog | null>();
    private userGroupEditorRef = createRef<UserGroupEditor | null>();
    private permissionEditorRef = createRef<PermissionEditor | null>();
    private exportDialogRef = createRef<Dialog | null>();
    private valueDialogRef = createRef<ValueDialog | null>();
    private confirmDialogRef = createRef<ConfirmDialog | null>();
    private newScoreDialogRef = createRef<NewScoreDialog | null>();
    private releaseNotesDialogRef = createRef<ReleaseNotesDialog | null>();

    /** Document title to restore after the native print dialog finishes. */
    private printDocumentTitle?: string;

    /** Resolves once the on-demand print document is mounted, so the native dialog waits for its content. */
    private printDocumentReady?: Promise<void>;
    private resolvePrintDocumentReady?: () => void;

    private dataModel = new ScoreBookDataModel();
    private scoreClipboard = new ScoreClipboard(this.dataModel);
    private smuflFontLoader = new SmuflFontLoader();

    /** Print settings of the application session, retained while the preview is closed. */
    private printSession = new PrintSession();

    private selectionManager: SelectionManager;
    private arrangementPlayer?: ArrangementPlayer;
    private undoManager?: UndoManager;

    private selectedThemePreference = "Light+";
    private systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    private compactHeaderQuery = window.matchMedia("(max-width: 900px)");
    private compactLayoutQuery = window.matchMedia("(max-width: 600px)");

    /** Both breakpoints can change independently, so one handler listens to each of their emitters. */
    private compactQueries = [this.compactHeaderQuery, this.compactLayoutQuery];
    private signInFromRunning = false;

    /** True while an MP3 export is running, to keep the export button disabled. */
    private exporting = false;

    public constructor(props: {}) {
        super(props);

        this.state = {
            phase: AppPhase.Checking,
            editMode: false,
            zenMode: false,
            sidebarOpen: false,
            trackViewMode: AppStorage.loadUISettings()?.viewSettings?.arrangementViewSettings?.displayMode
                ?? TrackViewMode.Grid,
            preferredEntryMode: AppStorage.loadUISettings()?.entryMode ?? EditEntryMode.Insert,
            printing: false,
            printPreviewOpen: false,
            notificationState: { newCount: 0, totalCount: 0, silent: false, showHistory: false },
            zoom: AppStorage.loadUISettings()?.viewSettings?.arrangementViewSettings?.zoomLevel ?? 100,
            compactHeader: this.compactHeaderQuery.matches,
            compactLayout: this.compactLayoutQuery.matches,
            scoreSaved: false,
            backendUnreachable: false,
            dialogs: {},
        };

        this.selectionManager = new SelectionManager(this.dataModel);

        this.initEventHandlers();
    }

    public override componentDidMount() {
        this.selectedThemePreference = AppStorage.loadUISettings()?.theme ?? "Light+";
        this.applyThemePreference(this.selectedThemePreference);
        this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);
        for (const query of this.compactQueries) {
            query.addEventListener("change", this.handleViewportResize);
        }

        window.addEventListener("afterprint", this.handleAfterPrint);
        escapeStack.setFallback(this.handleEscapeFallback);
        escapeStack.attach();

        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("notificationStateChanged", this.handleNotificationStateChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("backendDisconnected", this.handleBackendDisconnected);
        requisitions.register("authChanged", this.handleAuthChanged);
        requisitions.register("notesClicked", this.handleNoteClicked);
        requisitions.register("editModeChanged", this.handleEditModeChanged);
        requisitions.register("arrangementMutated", this.handleArrangementMutated);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.register("undoStackChanged", this.handleUndoStackChanged);
        requisitions.register("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.register("editEntryModeChanged", this.handleEntryModeChanged);

        void this.checkBackendThenInitialize();
    }

    public override shouldComponentUpdate(nextProps: {}, nextState: IAppState): boolean {
        const { editMode, zenMode, sidebarOpen, phase, trackViewMode, printing, backendUnreachable,
            startupError, preferredEntryMode, notificationState, zoom, compactHeader, compactLayout,
            scoreSaved, printPreviewOpen, dialogs } = this.state;

        return editMode !== nextState.editMode
            || zenMode !== nextState.zenMode
            || sidebarOpen !== nextState.sidebarOpen || phase !== nextState.phase
            || trackViewMode !== nextState.trackViewMode
            || preferredEntryMode !== nextState.preferredEntryMode
            || printing !== nextState.printing
            || printPreviewOpen !== nextState.printPreviewOpen
            || backendUnreachable !== nextState.backendUnreachable
            || startupError !== nextState.startupError
            || notificationState !== nextState.notificationState
            || zoom !== nextState.zoom
            || compactHeader !== nextState.compactHeader
            || compactLayout !== nextState.compactLayout
            || scoreSaved !== nextState.scoreSaved
            || dialogs !== nextState.dialogs;
    }

    public override componentWillUnmount() {
        this.selectionManager.dispose();

        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);
        this.systemThemeQuery.removeEventListener("change", this.handleSystemThemeChange);
        for (const query of this.compactQueries) {
            query.removeEventListener("change", this.handleViewportResize);
        }

        window.removeEventListener("afterprint", this.handleAfterPrint);
        escapeStack.setFallback(undefined);
        escapeStack.detach();

        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("notificationStateChanged", this.handleNotificationStateChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("backendDisconnected", this.handleBackendDisconnected);
        requisitions.unregister("authChanged", this.handleAuthChanged);
        requisitions.unregister("notesClicked", this.handleNoteClicked);
        requisitions.unregister("editModeChanged", this.handleEditModeChanged);
        requisitions.unregister("arrangementMutated", this.handleArrangementMutated);
        requisitions.unregister("undoStackChanged", this.handleUndoStackChanged);
        requisitions.unregister("trackViewModeToggled", this.handleTrackViewModeToggled);
        requisitions.unregister("editEntryModeChanged", this.handleEntryModeChanged);
    }

    public render() {
        const { phase, editMode: requestedEditMode, zenMode, sidebarOpen, trackViewMode, notificationState, zoom,
            printing, printPreviewOpen, backendUnreachable, startupError, preferredEntryMode,
            compactHeader, compactLayout, dialogs } = this.state;

        const editMode = requestedEditMode && !zenMode;
        const entryMode = this.effectiveEntryMode(trackViewMode, preferredEntryMode);
        const isRunning = phase === AppPhase.Running;
        const showAnimationDiagnostics = import.meta.env.DEV
            && new URLSearchParams(window.location.search).get("debugAnimation") === "1";

        let animationDiagnostics: ComponentChild;
        if (showAnimationDiagnostics && this.arrangementPlayer !== undefined) {
            animationDiagnostics = <AnimationDiagnostics engine={this.arrangementPlayer.animationEngine} />;
        }

        let splashContent: ComponentChild;
        switch (phase) {
            case AppPhase.Checking:
                break;

            case AppPhase.Setup:
                splashContent = (
                    <BackendSetupDialog
                        ref={this.backendSetupDialogRef}
                    />
                );

                break;

            case AppPhase.AdminSetup:
                splashContent = (
                    <AdminSetupDialog
                        ref={this.adminSetupDialogRef}
                        dataModel={this.dataModel}
                        onSetupComplete={this.handleAdminSetupComplete}
                    />
                );

                break;

            case AppPhase.Login:
                splashContent = (
                    <LoginDialog
                        ref={this.loginDialogRef}
                        dataModel={this.dataModel}
                    />
                );

                break;

            case AppPhase.Running:
                break;
        }

        let userButton: ComponentChild;
        let saveButton: ComponentChild;
        let newScoreButton: ComponentChild;
        let headerUndoRedo: ComponentChild;
        let editModeButton: ComponentChild;
        let printButton: ComponentChild;
        let exportButton: ComponentChild;
        if (isRunning) {
            userButton = this.renderUserButton();

            saveButton = <Button
                id="saveButton"
                className="headerIconButton"
                title="Save Score"
                disabled={!this.undoManager?.canUndo}
                onClick={this.handleSaveClick}
            >
                <Icon src={UIIcon.TrayArrowDown} />
            </Button>;

            newScoreButton = <Button
                id="newScoreButton"
                className="headerIconButton"
                title="New Score"
                disabled={editMode}
                onClick={this.handleNewScoreClick}
            >
                <Icon src={UIIcon.NewScore} />
            </Button>;

            if (this.arrangementPlayer) {
                const editModeButtonClass = editMode
                    ? "headerActionButton headerSwitcherButton is-active"
                    : "headerActionButton headerSwitcherButton";

                editModeButton = <Button
                    id="editModeButton"
                    className={editModeButtonClass}
                    title={editMode ? "Exit Edit Mode" : "Enter Edit Mode"}
                    data-tutorial="edit-mode"
                    onClick={this.handleEditModeToggle}
                >
                    <span className="header-mode-dot" />
                    <span className="headerActionLabel">{editMode ? "Editing" : "Edit Mode"}</span>
                </Button>;

                printButton = <Button
                    id="printButton"
                    className="headerActionButton"
                    title="Print / Export to PDF"
                    data-tutorial="print"
                    onClick={this.handlePrintClick}
                >
                    <Icon src={UIIcon.Printer} />
                    <span className="headerActionLabel">Print</span>
                </Button>;

                exportButton = <Button
                    id="exportButton"
                    className="headerActionButton is-emphasis"
                    title="Export as MP3"
                    data-tutorial="export"
                    disabled={this.exporting}
                    onClick={() => {
                        void this.handleExportClick();
                    }}
                >
                    <Icon src={UIIcon.Export} />
                    <span className="headerActionLabel">{this.exporting ? "Exporting…" : "Export"}</span>
                </Button>;
            }
        }

        if (isRunning && this.undoManager) {
            headerUndoRedo = <UndoRedoControls undoManager={this.undoManager} />;
        }

        let headerOverflow: ComponentChild;
        if (isRunning) {
            headerOverflow = this.renderHeaderOverflow();
        }

        let arrangementIdentity: ComponentChild;
        const currentArrangement = this.dataModel.arrangement;
        if (isRunning && currentArrangement) {
            arrangementIdentity = <ArrangementIdentity
                arrangement={currentArrangement}
                dataModel={this.dataModel}
                editMode={editMode}
                stats={this.arrangementStats()}
                saveState={this.arrangementSaveState()}
                compact={zenMode}
            />;
        }

        let checkingContent: ComponentChild;
        if (phase === AppPhase.Checking) {
            if (backendUnreachable) {
                checkingContent = this.renderBackendUnreachable();
            } else if (startupError) {
                checkingContent = this.renderStartupError(startupError);
            } else {
                checkingContent = (
                    <div className="progressIndicatorCard" style={{
                        position: "fixed", inset: 0, display: "flex",
                        justifyContent: "center", alignItems: "center",
                    }}>
                        <ProgressIndicator />
                    </div>
                );
            }
        }

        const headerNavigation = (
            <Container
                id="mainToolbarButtons"
                className="toolbarButtonGroup"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <img id="titleLogo" src="/logo.svg" />
                <Button
                    className="du-btn-ghost displayOptionsButton"
                    title="Settings"
                    data-tutorial="display-options"
                    onClick={this.handleDisplayOptionsClick}
                >
                    <Icon src={UIIcon.Gear} />
                </Button>
                <Button
                    id="scoreLibraryButton"
                    className="du-btn-ghost"
                    title="Score Library"
                    data-tutorial="score-library"
                    onClick={this.handleScoreLibraryClick}
                >
                    <Icon src={UIIcon.Library} />
                </Button>
                {userButton}
            </Container>
        );

        const documentButtons = (
            <Container
                id="headerDocumentButtons"
                className="toolbarButtonGroup"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                {saveButton}
                {newScoreButton}
                {headerUndoRedo}
            </Container>
        );

        let headerActions: ComponentChild;
        if (compactHeader) {
            headerActions = (
                <Container
                    id="headerActions"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    {saveButton}
                    {editModeButton}
                    {headerOverflow}
                </Container>
            );
        } else {
            headerActions = (
                <Container
                    id="headerActions"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    {documentButtons}
                    {editModeButton}
                    <div className="headerSeparator" />
                    {printButton}
                    {exportButton}
                </Container>
            );
        }

        const appHeader = zenMode
            ? undefined : this.renderAppHeader(headerNavigation, arrangementIdentity, headerActions);

        let toolsBar: ComponentChild;
        if (editMode && trackViewMode === TrackViewMode.Staff) {
            toolsBar = <ToolsBar />;
        }

        const modeBarEntryMode = editMode && trackViewMode === TrackViewMode.Staff ? entryMode : undefined;
        let modeBar: ComponentChild;
        if (!zenMode) {
            modeBar = <ArrangementModeBar
                trackViewMode={trackViewMode}
                entryMode={modeBarEntryMode}
                onTrackViewModeChange={this.handleTrackViewModeChange}
            />;
        }

        return (
            <>
                {isRunning && (
                    <ErrorBoundary>
                        <Container
                            id="appRoot"
                            className={zenMode ? "zen-mode" : undefined}
                            orientation={Orientation.TopDown}
                            crossAlignment={ChildAlignment.Stretch}
                        >
                            <DrawerSidebar
                                id="mainDrawer"
                                ref={this.scoreLibraryRef}
                                open={sidebarOpen}
                                sidebarContent={
                                    <Suspense fallback={<ProgressIndicator />}>
                                        <ScoreLibrary
                                            onAction={this.handleScoreLibraryAction}
                                            dataModel={this.dataModel}
                                        />
                                    </Suspense>
                                }
                                onOpenChange={(open) => {
                                    this.setState({ sidebarOpen: open }, () => {
                                        if (!open) {
                                            escapeStack.remove(this.onSidebarEscape);
                                        }
                                    });
                                }}
                            >
                                <Container
                                    id="appContent"
                                    className={editMode ? "score-editing" : undefined}
                                    orientation={Orientation.TopDown}
                                    crossAlignment={ChildAlignment.Stretch}
                                    style={{
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        position: "relative",
                                    }}
                                >
                                    {appHeader}
                                    <div id="appOverlay">
                                        {modeBar}
                                        {toolsBar}
                                        {animationDiagnostics}
                                        <div id="playbackControlsHost">
                                            <ArrangementPlayControls
                                                arrangementPlayer={this.arrangementPlayer!}
                                                dataModel={this.dataModel}
                                                editMode={editMode}
                                                compact={compactLayout}
                                                data-tutorial="playback"
                                            />
                                        </div>
                                    </div>
                                    <div
                                        id="viewerScrollHost"
                                        style={{
                                            flex: "1 1 auto",
                                            minHeight: 0,
                                            overflow: "auto",
                                        }}
                                    >
                                        {this.arrangementPlayer && <ArrangementViewer
                                            arrangementPlayer={this.arrangementPlayer}
                                            dataModel={this.dataModel}
                                            selectionManager={this.selectionManager}
                                            inEditMode={editMode}
                                            zenMode={zenMode}
                                            zenIdentity={zenMode ? arrangementIdentity : undefined}
                                            entryMode={entryMode}
                                        />}
                                    </div>
                                </Container>
                            </DrawerSidebar>
                            <AppFooter
                                barCount={this.arrangementPlayer?.scoreMetrics.bars ?? 0}
                                zoom={zoom}
                                compact={compactLayout}
                                zenMode={zenMode}
                                version={appVersion}
                                notifications={notificationState}
                                data-tutorial="footer"
                                onZoomChange={this.handleZoomChange}
                                onToggleZenMode={this.handleToggleZenMode}
                                onToggleNotifications={this.handleToggleNotifications}
                                onShowReleaseNotes={this.handleShowReleaseNotes}
                            />
                            {renderNotificationCenter()}
                        </Container>
                        <ValueDialog ref={this.valueDialogRef} />
                        {dialogs.SettingsDialog &&
                            <dialogs.SettingsDialog ref={this.settingsDialogRef} fontLoader={this.smuflFontLoader} />
                        }
                        <BackendDisconnectedDialog
                            ref={this.backendDisconnectedDialogRef}
                            onReconnected={() => {
                                // The app continues normally — nothing special needed.
                            }}
                        />
                        <LoginDialog
                            ref={this.loginDialogRef}
                            dataModel={this.dataModel}
                        />
                        <BackendSetupDialog
                            ref={this.backendSetupDialogRef}
                        />
                        {dialogs.UserGroupEditor &&
                            <dialogs.UserGroupEditor
                                ref={this.userGroupEditorRef}
                                dataModel={this.dataModel}
                                showUsers={this.dataModel.user?.isAdmin === true}
                            />
                        }
                        {dialogs.PermissionEditor &&
                            <dialogs.PermissionEditor
                                ref={this.permissionEditorRef}
                                dataModel={this.dataModel}
                                confirmRef={this.confirmDialogRef}
                                onSaved={(entry) => {
                                    void requisitions.execute("permChanged", entry);
                                }}
                            />
                        }
                        {
                            printPreviewOpen && this.dataModel.arrangement && this.arrangementPlayer && (
                                <Suspense fallback={undefined}>
                                    <PrintPreview
                                        dataModel={this.dataModel}
                                        arrangementPlayer={this.arrangementPlayer}
                                        selectionManager={this.selectionManager}
                                        session={this.printSession}
                                        viewMode={trackViewMode}
                                        onClose={this.handlePrintPreviewClose}
                                        onPrint={this.handlePrintPreviewPrint}
                                    />
                                </Suspense>
                            )
                        }
                        {
                            printing && this.arrangementPlayer && (
                                <Suspense fallback={undefined}>
                                    <PrintDocument
                                        dataModel={this.dataModel}
                                        arrangementPlayer={this.arrangementPlayer}
                                        selectionManager={this.selectionManager}
                                        session={this.printSession}
                                        viewMode={trackViewMode}
                                        onReady={this.handlePrintDocumentReady}
                                    />
                                </Suspense>
                            )
                        }
                    </ErrorBoundary>
                )}

                <ConfirmDialog ref={this.confirmDialogRef} />
                <NewScoreDialog ref={this.newScoreDialogRef} />
                {dialogs.ReleaseNotesDialog && <dialogs.ReleaseNotesDialog ref={this.releaseNotesDialogRef} />}
                <Dialog
                    id="exportDialog"
                    ref={this.exportDialogRef}
                    caption="Exporting Arrangement"
                    onClose={this.handleExportDialogClose}
                >
                    <Container
                        orientation={Orientation.TopDown}
                        gap={10}
                        style={{ minWidth: "280px" }}
                    >
                        <Label caption="Please wait while the MP3 file is being created..." />
                        <ProgressIndicator linear indicatorHeight={8} style={{ flex: "0 0 auto" }} />
                    </Container>
                </Dialog>

                {checkingContent}

                <Container
                    id="splashScreen"
                    className={phase === AppPhase.Setup || phase === AppPhase.AdminSetup
                        || phase === AppPhase.Login ? "splash-visible" : ""}
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.Center}
                    crossAlignment={ChildAlignment.Center}
                >
                    {!isRunning && splashContent}
                </Container>
            </>
        );
    }

    /**
     * @param target The event target to check.
     *
     * @returns True when the target accepts typed text, so shortcuts leave the key to it.
     */
    private static isEditableTarget(target: EventTarget | null): boolean {
        return target instanceof HTMLElement
            && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    }

    /**
     * Retries the backend health check after a connection failure.
     */
    private handleRetryConnection = (): void => {
        void this.setStatePromise({ backendUnreachable: false, startupError: undefined }).then(() => {
            return this.checkBackendThenInitialize();
        });
    };

    private renderAppHeader(
        navigation: ComponentChild,
        identity: ComponentChild,
        actions: ComponentChild,
    ): ComponentChild {
        return (
            <Container
                id="headerContent"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                {navigation}
                <div className="headerSeparator" />
                {identity}
                {actions}
            </Container>
        );
    }

    /**
     * Renders the menu that holds the header's secondary actions while the window is too narrow to show them.
     *
     * @returns The overflow menu.
     */
    private renderHeaderOverflow(): ComponentChild {
        const { editMode } = this.state;

        const items: IDropdownItem[] = [
            {
                label: "Settings",
                icon: <Icon src={UIIcon.Gear} />,
                onClick: this.handleDisplayOptionsClick,
            },
            {
                label: "New Score",
                icon: <Icon src={UIIcon.NewScore} />,
                disabled: editMode,
                onClick: this.handleNewScoreClick,
            },
            {
                label: "Undo",
                icon: <Icon src={UIIcon.Discard} />,
                disabled: !this.undoManager?.canUndo,
                onClick: () => {
                    this.undoManager?.undo();
                },
            },
            {
                label: "Redo",
                icon: <Icon src={UIIcon.Redo} />,
                disabled: !this.undoManager?.canRedo,
                onClick: () => {
                    this.undoManager?.redo();
                },
            },
            {
                label: "Print",
                icon: <Icon src={UIIcon.Printer} />,
                onClick: this.handlePrintClick,
            },
            {
                label: this.exporting ? "Exporting…" : "Export",
                icon: <Icon src={UIIcon.Export} />,
                disabled: this.exporting,
                onClick: () => {
                    void this.handleExportClick();
                },
            },
        ];

        return <Dropdown
            className="headerOverflowMenu"
            icon={<Icon src={UIIcon.Ellipsis} />}
            title="More actions"
            items={items}
            closeOnSelect
        />;
    }

    private renderUserButton(): ComponentChild {
        const isAdmin = this.dataModel.user?.isAdmin ?? false;

        if (this.dataModel.authenticated) {
            // The identity accent is a fixed brand pair, so its foreground is fixed as well instead of following
            // the theme's text colour.
            const userMenuStyle = isAdmin
                ? {
                    backgroundColor: "var(--color-identity)",
                    color: "var(--color-identity-content)",
                }
                : undefined;

            return <Dropdown
                id="userMenu"
                icon={<Icon src={UIIcon.Account} />}
                compact
                items={this.buildUserMenuItems()}
                closeOnSelect
                style={userMenuStyle}
            />;
        }

        return <Button
            id="signInButton"
            imageOnly
            compact
            className="du-btn-ghost"
            title="Sign In"
            onClick={this.handleSignInClick}
        >
            <Icon
                src={UIIcon.SignIn}
            />
        </Button>;
    }

    private renderBackendUnreachable(): ComponentChild {
        return (
            <div className="backend-unreachable-card" style={{
                position: "fixed", inset: 0, display: "flex",
                flexDirection: "column", justifyContent: "center", alignItems: "center",
            }}>
                <div className="backend-unreachable-content">
                    <div className="backend-unreachable-icon">⚠️</div>
                    <h2>Server Unreachable</h2>
                    <p>
                        The Animada Score Book server could not be reached.
                        Make sure the backend is running and try again.
                    </p>
                    <button className="du-btn du-btn-primary" onClick={this.handleRetryConnection}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    private renderStartupError(error: string): ComponentChild {
        return (
            <div className="backend-unreachable-card" style={{
                position: "fixed", inset: 0, display: "flex",
                flexDirection: "column", justifyContent: "center", alignItems: "center",
            }}>
                <div className="backend-unreachable-content">
                    <div className="backend-unreachable-icon">⚠️</div>
                    <h2>Connection Error</h2>
                    <pre className="startup-error-message">{error}</pre>
                    <button className="du-btn du-btn-primary" onClick={this.handleRetryConnection}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    private async checkBackendThenInitialize(): Promise<void> {
        let health: {
            status: string; configLoaded: boolean; configError?: string;
            initialized: boolean; hasUsers: boolean; dbStatus?: string; dbError?: string;
            engine?: string; host?: string; port?: number; database?: string;
        } | undefined;

        try {
            const res = await fetch("/api?action=health");
            health = await res.json() as typeof health;
        } catch {
            // Backend not reachable.
        }

        if (!health) {
            this.setState({ backendUnreachable: true });

            return;
        }

        if (!health.configLoaded) {
            await this.setStatePromise({ phase: AppPhase.Setup });
            await this.backendSetupDialogRef.current?.show({
                mode: BackendSetupMode.Fatal,
                configError: health.configError,
            });

            return;
        }

        if (health.status === "error") {
            const { dbStatus, dbError: errorMsg, engine, host, port, database } = health;

            if (dbStatus === "db_unreachable") {
                const connectionInfo = `${engine}://${host}:${port ?? ""}/${database ?? ""}`;
                this.setState({
                    startupError: `${errorMsg ?? "Database unreachable"}\n\n`
                        + `Connection: ${connectionInfo}\n`
                        + "Is the database server running and is the IP address correct?",
                });

                return;
            }

            // Schema mismatch — fall through to the dbError path below.
        }

        if (!health.initialized) {
            await this.setStatePromise({ phase: AppPhase.Setup });
            await this.backendSetupDialogRef.current?.show({
                mode: BackendSetupMode.Initial,
                dbError: health.dbError,
            });

            // Setup completed — restart the health check.
            return this.checkBackendThenInitialize();
        }

        if (health.dbError) {
            // Pipeline: logout → setup dialog → confirmation → login → reset.
            await this.dataModel.logout();
            await this.setStatePromise({ phase: AppPhase.Setup });

            const setupResult = await this.backendSetupDialogRef.current?.show({
                mode: BackendSetupMode.Admin,
                dbError: health.dbError,
            });

            if (setupResult !== "reset") {
                return;
            }

            // Skip login when there are no users (e.g., schema broken,
            // users table missing). The backend allows emergency reset without auth.
            await this.resetBackend(health.hasUsers);

            // resetBackend restarts the boot sequence itself; this health report is stale now.
            return;
        }

        if (!health.hasUsers) {
            this.setState({ phase: AppPhase.AdminSetup }, () => {
                this.adminSetupDialogRef.current?.open();
            });

            return;
        }

        const sessionRestored = await this.dataModel.restoreSession();

        if (sessionRestored) {
            await this.initializeApp();

            return;
        }

        // No active session. If a score URL parameter is present, try anonymous access first.
        const params = new URL(window.location.href).searchParams;
        const scoreIdStr = params.get("score");

        if (scoreIdStr) {
            const scoreId = Number(scoreIdStr);
            if (!isNaN(scoreId)) {
                const [score, status] = await this.dataModel.fetchScoreById(scoreId);
                if (score) {
                    await this.initializeApp();

                    return;
                }

                if (status === 403) {
                    await this.confirmDialogRef.current?.show(
                        "This score is not publicly accessible. Please sign in to continue.",
                        { accept: "Sign In" },
                        "Access Restricted",
                    );
                } else if (status === 404) {
                    await this.confirmDialogRef.current?.show(
                        "This score no longer exists. It may have been deleted.",
                        { accept: "OK" },
                        "Score Not Found",
                    );
                }
            }
        }

        this.setState({ phase: AppPhase.Login }, () => {
            void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
        });
    }

    /**
     * Opens the backend-disconnected dialog when the backend connection is lost.
     *
     * @returns Always true to signal the event was handled.
     */
    private handleBackendDisconnected = (): Promise<boolean> => {
        this.backendDisconnectedDialogRef.current?.open();

        return Promise.resolve(true);
    };

    private handleAuthChanged = (): Promise<boolean> => {
        const { phase } = this.state;

        if (!this.dataModel.authenticated && phase === AppPhase.Running) {
            this.setState({ phase: AppPhase.Login }, () => {
                void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
            });
        } else {
            this.forceUpdate();
        }

        return Promise.resolve(true);
    };

    private handleNoteClicked = (noteIds: number[]): Promise<boolean> => {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement || noteIds.length === 0) {
            return Promise.resolve(false);
        }

        const noteId = noteIds[0];

        for (const track of arrangement.tracks) {
            for (const measure of track.measures) {
                const event = measure.noteEvents.find((e) => {
                    return e.id === noteId;
                });

                if (event?.audioData?.audioBuffer) {
                    const volume = arrangement.mainVolume / 100;

                    new AudioBufferPlayer(event.audioData.audioBuffer, getSharedAudioContext(), 0, volume);

                    return Promise.resolve(true);
                }
            }
        }

        return Promise.resolve(false);
    };

    /**
     * Handles the result of a login dialog show() call for non-pipeline paths.
     *
     * @param loggedIn Whether the user logged in successfully.
     */
    private handleLoginDialogResult = (loggedIn: boolean): void => {
        if (loggedIn) {
            this.handleLoginSuccess();
        } else {
            this.handleContinueAnonymous();
        }
    };

    private handleLoginSuccess = (): void => {
        this.signInFromRunning = false;
        void this.initializeApp().then(() => {
            const group = this.dataModel.activeGroup;
            const message = group
                ? `Signed in as "${group.name}" (shared access)`
                : `Signed in as ${this.dataModel.user?.displayName ?? this.dataModel.user?.username}`;
            void requisitions.execute("showInfo", message);
        });
    };

    /**
     * Called when the user chooses to continue without logging in.
     * Hides the login dialog. The app continues with anonymous capabilities.
     */
    private handleContinueAnonymous = (): void => {
        if (this.signInFromRunning) {
            this.signInFromRunning = false;
            this.setState({ phase: AppPhase.Running });

            return;
        }

        // If a score URL parameter was present, remove it — the user chose not to sign in.
        const params = new URL(window.location.href).searchParams;
        if (params.has("score")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("score");
            window.history.replaceState(null, "", url.toString());
        }

        void this.initializeApp();
    };

    /**
     * Called when the backend setup dialog is closed.
     * If setup completed successfully, proceed with app initialisation.
     */
    private handleAdminSetupComplete = (): void => {
        void this.initializeApp();
    };

    private handleBackendSetupComplete = async (): Promise<void> => {
        try {
            const res = await fetch("/api?action=health");
            const data = await res.json() as { status: string; initialized: boolean; hasUsers: boolean; };

            if (data.initialized) {
                if (!data.hasUsers) {
                    this.setState({ phase: AppPhase.AdminSetup }, () => {
                        this.adminSetupDialogRef.current?.open();
                    });

                    return;
                }

                const sessionRestored = await this.dataModel.restoreSession();

                if (sessionRestored) {
                    await this.initializeApp();

                    return;
                }

                this.setState({ phase: AppPhase.Login }, () => {
                    void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
                });

                return;
            }
        } catch {
            // Still not ready.
        }
    };

    private async initializeApp(): Promise<void> {
        // The score is drawn with the music font from its first paint on, so the font loads next to the data.
        const musicFont = AppStorage.loadUISettings()?.musicFont;
        await Promise.all([
            this.dataModel.initialize(),
            this.smuflFontLoader.initialize({ fontId: musicFont }),
        ]);

        const params = new URL(window.location.href).searchParams;

        await this.loadInitialScore(params);
    }

    private async loadInitialScore(params: URLSearchParams): Promise<void> {
        const hasBananaDrum = params.has("a") || params.has("a2");

        let pendingWarning: string | undefined;

        if (hasBananaDrum) {
            this.loadScorebook(params);
        } else {
            const scoreIdStr = params.get("score");
            if (scoreIdStr) {
                const scoreId = Number(scoreIdStr);
                if (!isNaN(scoreId)) {
                    const [score, status] = await this.dataModel.fetchScoreById(scoreId);
                    if (score) {
                        this.loadScorebook(score);
                        this.setState({ phase: AppPhase.Running });

                        return;
                    }

                    if (status === 404) {
                        pendingWarning = "This score no longer exists. It may have been deleted.";
                    } else if (status === 403) {
                        pendingWarning = "You do not have access to this score."
                            + " Try signing in or requesting access.";
                    } else {
                        pendingWarning = "Could not load the requested score. The server may be unavailable.";
                    }
                }
            }

            this.loadScorebook(undefined);
        }

        this.setState({ phase: AppPhase.Running }, () => {
            if (pendingWarning) {
                void requisitions.execute("showWarning", pendingWarning);
            }
        });
    }

    private handleGithubClick = () => {
        window.open("https://github.com/mike-lischke/animada-score-book", "_blank");
    };

    private handleScoreLibraryClick = () => {
        // The sidebar covers the screen, so overlays that are still open would float above it.
        Portal.closeAll();

        this.setState({ sidebarOpen: true }, () => {
            escapeStack.push(this.onSidebarEscape);
        });
    };

    private handlePrintClick = () => {
        this.openPrintPreview();
    };

    private handleSaveClick = (): void => {
        void this.saveScore();
    };

    private handleNewScoreClick = (): void => {
        void this.handleNewSong();
    };

    private handleSignInClick = () => {
        this.signInFromRunning = true;
        this.setState({ phase: AppPhase.Login }, () => {
            void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
        });
    };

    private handleLogoutClick = async () => {
        await this.dataModel.logout();
        this.dataModel.reset();

        // Dispose player and undo manager so they don't hold stale references.
        if (this.arrangementPlayer) {
            this.arrangementPlayer.dispose();
            this.arrangementPlayer = undefined;
        }

        this.undoManager?.dispose();
        this.undoManager = undefined;

        this.setState({ phase: AppPhase.Login }, () => {
            void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
        });
    };

    /**
     * Runs the destructive backend reset: confirmation, a login when the backend demands one, then the
     * reset itself. The backend drops every table and rebuilds the schema, so the boot sequence has to
     * run again afterwards — the fresh database holds neither users nor scores any more.
     *
     * @param requiresLogin Whether the reset needs an admin session at the backend.
     */
    private async resetBackend(requiresLogin: boolean): Promise<void> {
        const confirmed = await this.confirmDialogRef.current?.show(
            "This will delete all scores, folders, users and groups.\n"
            + "The database tables will be recreated from scratch.",
            { accept: "Reset Database", refuse: "Cancel" },
            "Reset Database",
            ["This cannot be undone. Make sure you export your scores if you want to keep them."],
        );

        if (confirmed !== DialogResponseClosure.Accept) {
            return;
        }

        if (requiresLogin) {
            await this.setStatePromise({ phase: AppPhase.Login });

            const loggedIn = await this.loginDialogRef.current?.show(true);
            if (!loggedIn) {
                return;
            }
        }

        await this.dataModel.resetDatabase();

        // Restart the boot sequence; the health check reports the result of the reset.
        await this.checkBackendThenInitialize();
    }

    private buildUserMenuItems(): IDropdownItem[] {
        const { user, activeGroup } = this.dataModel;
        const items: IDropdownItem[] = [];

        if (activeGroup) {
            items.push({
                label: activeGroup.name,
                icon: <Icon src={UIIcon.Organization} />,
            });
        } else {
            items.push({
                label: user?.displayName ?? user?.username ?? "",
                icon: <Icon src={UIIcon.Account} />,
            });
        }

        if (user?.isAdmin) {
            items.push({
                label: "Users & Groups",
                icon: <Icon src={UIIcon.Organization} />,
                onClick: () => {
                    void this.openUserGroupEditor();
                },
            });
            items.push({
                label: "Reset Backend",
                icon: <Icon src={UIIcon.Server} />,
                onClick: () => {
                    // The menu only shows for admins, so the backend accepts the reset without a
                    // further login.
                    void this.resetBackend(false);
                },
            });
        } else if (user) {
            items.push({
                label: "My Groups",
                icon: <Icon src={UIIcon.Organization} />,
                onClick: () => {
                    void this.openUserGroupEditor();
                },
            });
        }

        items.push({
            label: "Sign Out",
            icon: <Icon src={UIIcon.SignOut} />,
            onClick: () => {
                void this.handleLogoutClick();
            },
        });

        return items;
    }

    private openPrintPreview(): void {
        if (!this.dataModel.arrangement || !this.arrangementPlayer) {
            return;
        }

        this.setState({ printPreviewOpen: true });
    }

    private handlePrintPreviewClose = (): void => {
        this.setState({ printPreviewOpen: false });
    };

    /**
     * Prints through the native dialog. The preview stays mounted, so closing or cancelling the dialog returns to
     * the unchanged preview.
     */
    private handlePrintPreviewPrint = (): void => {
        this.startPrint();
    };

    /**
     * Opens the native print dialog on the print document. The document is drawn from the preview's layout data and
     * renderers at the print scale only: the preview's magnification, controls and margin guides are not part of it.
     */
    private startPrint(): void {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return;
        }

        this.printDocumentTitle = document.title;
        document.title = `${arrangement.title} \u2014 Animada Score Book`;

        // The sheets state their own margins, running headers and page numbers, so a page holds them edge to edge.
        const pageStyle = document.createElement("style");
        pageStyle.id = "print-page-style";
        pageStyle.textContent = `@page { size: A4 ${this.printSession.pageSetup.orientation}; margin: 0; }`;
        document.head.appendChild(pageStyle);

        document.body.classList.add("printing");

        // The document is loaded on demand, so printing waits for the mount that its component reports.
        this.printDocumentReady = new Promise<void>((resolve) => {
            this.resolvePrintDocumentReady = resolve;
        });

        this.setState({ printing: true }, () => {
            void this.printAfterLayout();
        });
    }

    /**
     * Waits for the print document's fonts and layout, then opens the native print dialog.
     */
    private async printAfterLayout(): Promise<void> {
        await this.printDocumentReady;

        const fontsReady = (document as { fonts?: { ready?: Promise<unknown>; }; }).fonts?.ready
            ?? Promise.resolve();
        await fontsReady;

        // One more frame, so the print DOM is laid out before the dialog takes its snapshot.
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
                resolve();
            });
        });

        window.print();
    }

    private handleAfterPrint = (): void => {
        document.body.classList.remove("printing");
        document.getElementById("print-page-style")?.remove();

        if (this.printDocumentTitle !== undefined) {
            document.title = this.printDocumentTitle;
            this.printDocumentTitle = undefined;
        }

        this.setState({ printing: false });
    };

    /** Releases the print handshake once the on-demand document is in the DOM. */
    private handlePrintDocumentReady = (): void => {
        this.resolvePrintDocumentReady?.();
    };

    private handleDisplayOptionsClick = (): void => {
        void this.openSettingsDialog();
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        this.applyThemePreference(settings.theme);

        const zoom = settings.viewSettings?.arrangementViewSettings?.zoomLevel ?? 100;
        const { zoom: currentZoom } = this.state;
        if (zoom !== currentZoom) {
            this.setState({ zoom });
        }

        return Promise.resolve(true);
    };

    private handleTrackViewModeChange = (mode: TrackViewMode): void => {
        const settings = AppStorage.loadUISettings() ?? {};
        settings.viewSettings ??= {};
        settings.viewSettings.arrangementViewSettings ??= {};
        settings.viewSettings.arrangementViewSettings.displayMode = mode;
        AppStorage.saveUISettings(settings);

        void requisitions.execute("trackViewModeToggled", mode);
    };

    private handleTrackViewModeToggled = (mode: TrackViewMode): Promise<boolean> => {
        this.setState({ trackViewMode: mode });

        return Promise.resolve(true);
    };

    private handleEntryModeChanged = (mode: EditEntryMode): Promise<boolean> => {
        AppStorage.saveSetting("entryMode", mode);
        this.setState({ preferredEntryMode: mode });

        return Promise.resolve(true);
    };

    /**
     * Resolves the entry mode the button shows. The grid view always works with overwrite, so it never
     * offers insert.
     *
     * @param viewMode The active view mode.
     * @param preferred The mode the staff view was last set to.
     *
     * @returns The entry mode in effect.
     */
    private effectiveEntryMode(viewMode: TrackViewMode, preferred: EditEntryMode): EditEntryMode {
        return viewMode === TrackViewMode.Staff ? preferred : EditEntryMode.Overwrite;
    }

    private handleSystemThemeChange = (): void => {
        if (this.selectedThemePreference === "Auto") {
            this.applyThemePreference("Auto");
        }
    };

    /** Re-evaluates both breakpoints when the viewport size changed and updates only the flags that differ. */
    private handleViewportResize = (): void => {
        const compactHeader = this.compactHeaderQuery.matches;
        const compactLayout = this.compactLayoutQuery.matches;
        const { compactHeader: currentHeader, compactLayout: currentLayout } = this.state;

        if (compactHeader !== currentHeader || compactLayout !== currentLayout) {
            this.setState({ compactHeader, compactLayout });
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
        const { editMode } = this.state;

        // If no data is provided, it can be "addFolder" or "import".
        if (!data || action === "addFolder") {
            switch (action) {
                case "addFolder": {
                    const result = await this.valueDialogRef.current?.show(
                        "addFolderDialog",
                        "Add New Folder",
                        UIIcon.Add,
                        [{
                            type: ValueEditorEntryType.Title,
                            id: "folderNameDescription",
                            content: "Name:",
                        },
                        {
                            type: ValueEditorEntryType.Value,
                            id: "folderName",
                            content: "",
                            placeholder: "Name of the new folder",
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
                            UIIcon.CloudDownload,
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
                            }],
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

                                    // Migrate the BananaDrum link to the current
                                    // schema version and store the result as a
                                    // compact V2 snapshot.
                                    const { arrangement } = ArrangementMigrator.migrateToArrangement(
                                        params,
                                        this.dataModel.instruments,
                                    );
                                    arrangement.title = title;
                                    const content = stringifyPackedArrangement(arrangement.toSnapshot());
                                    await this.dataModel.addScore(title, content, parent);

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
                        UIIcon.Rename,
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
                            autoFocus: true,
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
                if (editMode && data.type === SbDmEntityType.Score) {
                    const exited = await this.confirmExitEditMode();

                    if (!exited) {
                        return false;
                    }
                }

                this.setState({ sidebarOpen: false }, () => {
                    escapeStack.remove(this.onSidebarEscape);
                });

                if (data.type === SbDmEntityType.Score) {
                    this.loadScorebook(data);
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

            case "managePerm": {
                const row = document.querySelector<HTMLElement>(
                    `.score-tree-entry[data-entry-type="${String(data.type)}"][data-entry-id="${data.id}"]`,
                );

                if (row) {
                    void this.openPermissionEditor(row.getBoundingClientRect(), data);
                }

                return false;
            }

            default:
        }

        ;

        return true;
    };

    /**
     * Creates the undo manager for the current arrangement. It remembers the selection of every edit,
     * so an undo puts the cursor back where the undone edit was made.
     *
     * @returns The undo manager to use.
     */
    private createUndoManager(): UndoManager {
        return new UndoManager(this.dataModel, () => {
            return this.selectionManager.serialisedSelection;
        });
    }

    private loadScorebook(source?: IArrangementSnapshot | URLSearchParams | ISbDmScore) {
        let resolvedSource: IArrangementSnapshot | URLSearchParams | ISbDmScore | undefined;

        if (source) {
            resolvedSource = source;
        } else {
            // Try to load the last opened score from localStorage, if available and no other source is provided.
            const lastScoreString = AppStorage.loadUISettings()?.currentScore;
            if (lastScoreString) {
                try {
                    resolvedSource = tryParsePackedArrangement(lastScoreString);
                } catch {
                    // Remove the invalid score from storage to prevent future errors, and proceed without loading.
                    AppStorage.saveSetting("currentScore", undefined);
                }
            }
        }

        let arrangement = this.dataModel.arrangement!;
        if (resolvedSource) {
            if (this.arrangementPlayer) {
                this.arrangementPlayer.dispose();
            }

            try {
                arrangement = this.dataModel.loadArrangement(resolvedSource);
            } catch (error) {
                const message = convertErrorToString(error);
                console.error(message);
                void requisitions.execute("showError", message);

                return;
            }
        }

        this.undoManager?.dispose();
        this.undoManager = this.createUndoManager();
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()),
        );

        this.forceUpdate();

        const { editMode } = this.state;

        const settings = AppStorage.loadUISettings();
        if (settings?.editMode && !editMode) {
            void requisitions.execute("editModeChanged", true);
        }
    }

    private initEventHandlers(): void {
        window.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });

        window.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
    }

    private onSidebarEscape = (): void => {
        this.setState({ sidebarOpen: false });
    };

    /** Runs for Escape only when no portal, popup or popover is open. */
    private handleEscapeFallback = (): void => {
        const { zenMode } = this.state;

        if (!zenMode) {
            this.selectionManager.clearSelection();
        }
    };

    private handleKeyDown(event: KeyboardEvent): void {
        const { editMode: requestedEditMode, zenMode } = this.state;
        const editMode = requestedEditMode && !zenMode;

        // Ctrl/Cmd+S saves the score in edit mode.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "s") {
            event.preventDefault();
            if (editMode) {
                void this.saveScore();
            }

            return;
        }

        // Ctrl/Cmd+P opens the print preview instead of the native print dialog.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "p") {
            event.preventDefault();
            this.openPrintPreview();

            return;
        }

        // Clipboard operations. Copy works in every mode; cut/paste require edit mode.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase();

            if (key === "x" || key === "c" || key === "v") {
                const editable = App.isEditableTarget(event.target);
                const selection = window.getSelection();
                const hasTextSelection = selection !== null && !selection.isCollapsed;

                if (!editable && !hasTextSelection) {
                    event.preventDefault();

                    if (key === "x") {
                        if (editMode) {
                            this.cutSelection();
                        }
                    } else if (key === "c") {
                        this.copySelection();
                    } else if (editMode) {
                        void this.pasteSelection();
                    }
                }

                return;
            }
        }

        // G and S switch the score view, the shortcuts the mode bar names in its tooltips.
        if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
            const key = event.key.toLowerCase();
            if ((key === "g" || key === "s") && !App.isEditableTarget(event.target)) {
                event.preventDefault();
                this.handleTrackViewModeChange(key === "g" ? TrackViewMode.Grid : TrackViewMode.Staff);

                return;
            }
        }

        switch (event.key) {
            case "Alt": {
                event.preventDefault();

                break;
            }

            // Undo/Redo: We have different conventions between Mac and Windows
            // Windows: ctrl+z / ctrl+y
            // Mac: command+z / command+shift+z
            // We allow overlap for maximum cross-browser consistency, except where it actually causes confusion
            case "z": {
                if (!zenMode && (event.ctrlKey || event.metaKey)) {
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
                if (!zenMode && event.ctrlKey) {
                    this.undoManager?.redo();
                }

                break;
            }
        }
    }

    private copySelection(): void {
        this.scoreClipboard.copy([...this.selectionManager.currentSelection.values()]);
    }

    private cutSelection(): void {
        this.scoreClipboard.cut([...this.selectionManager.currentSelection.values()]);
    }

    private async pasteSelection(): Promise<void> {
        const entries = [...this.selectionManager.currentSelection.values()];
        const { trackViewMode } = this.state;

        // The grid shortens content that does not fit its cells, while the staff keeps the copied
        // notes as they are and lets the following notes give way. The display mode is read from the
        // same setting the viewers render with, because the state value only follows the toggle.
        const displayMode = AppStorage.loadUISettings()?.viewSettings?.arrangementViewSettings?.displayMode
            ?? trackViewMode;
        const overflowMode = displayMode === TrackViewMode.Staff
            ? PasteOverflowMode.Shift
            : PasteOverflowMode.Truncate;

        // Every entry marks a single note (a click) rather than a range: the pasted content keeps
        // its length and is anchored at the selection instead of being spread over it.
        const singleNote = entries.every((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        });

        let result = this.scoreClipboard.paste(entries, { overflowMode, singleNote });

        if (result.kind === PasteResultKind.NeedsTrackCreation) {
            const confirmed = await this.confirmTrackCreation(result.missingInstrumentTypeIds ?? []);
            if (confirmed) {
                result = this.scoreClipboard.paste(entries, { createTrack: true, overflowMode, singleNote });
            }
        } else if (result.kind === PasteResultKind.NeedsSubdivisionMode) {
            const mode = await this.confirmSubdivisionMode();
            if (mode !== undefined) {
                result = this.scoreClipboard.paste(entries, { subdivisionMode: mode, overflowMode, singleNote });
            }
        }

        if (result.kind === PasteResultKind.Success && result.selectionInvalidated) {
            this.selectionManager.clearSelection();
        }

        this.showPasteResult(result);
    }

    private async confirmSubdivisionMode(): Promise<SubdivisionPasteMode | undefined> {
        const closure = await this.confirmDialogRef.current?.show(
            "The copied subdivision covers a different range than the selection. " +
            "How should it be applied?",
            {
                accept: "New Subdivision",
                alternative: "Tile Subdivision",
                refuse: "Dissolve Subdivision",
                default: "New Subdivision",
            },
            "Paste Subdivision",
        );

        switch (closure) {
            case DialogResponseClosure.Accept: {
                return SubdivisionPasteMode.NewBase;
            }

            case DialogResponseClosure.Alternative: {
                return SubdivisionPasteMode.Tile;
            }

            case DialogResponseClosure.Decline: {
                return SubdivisionPasteMode.Dissolve;
            }

            default: {
                return undefined;
            }
        }
    }

    private async confirmTrackCreation(missingInstrumentTypeIds: string[]): Promise<boolean> {
        const names = missingInstrumentTypeIds.map((typeId) => {
            return this.dataModel.instruments.find((instrument) => {
                return instrument.typeId === typeId;
            })?.displayName ?? typeId;
        }).join(", ");

        const closure = await this.confirmDialogRef.current?.show(
            `The instrument ${names} is not present in this score. ` +
            "Create a track for it and paste the content there?",
            { accept: "Create Track", refuse: "Cancel", default: "Create Track" },
            "Paste Track",
        );

        return closure === DialogResponseClosure.Accept;
    }

    private showPasteResult(result: IPasteResult): void {
        switch (result.kind) {
            case PasteResultKind.InstrumentMismatch: {
                void requisitions.execute("showWarning", "Cannot paste: at least one instrument does not match.");

                break;
            }

            case PasteResultKind.MeterMismatch: {
                void requisitions.execute("showWarning", "Cannot paste: the meter does not match.");

                break;
            }

            case PasteResultKind.TrackCountMismatch: {
                void requisitions.execute("showWarning", "Cannot paste: the track count does not match.");

                break;
            }

            case PasteResultKind.TooComplex: {
                void requisitions.execute("showWarning", "Cannot paste: the selection mixes subdivided and " +
                    "plain notes, which is too complex to transfer.");

                break;
            }
        }
    }

    private handleEditModeToggle = (): void => {
        const { editMode } = this.state;

        if (editMode) {
            void this.confirmExitEditMode();
        } else {
            void requisitions.execute("editModeChanged", true);
        }
    };

    private handleToggleZenMode = (): void => {
        const { zenMode } = this.state;
        const enabled = !zenMode;
        this.setState({ zenMode: enabled, sidebarOpen: false });
        escapeStack.remove(this.onSidebarEscape);
        void requisitions.execute("zenModeChanged", enabled);
    };

    private confirmExitEditMode = async (): Promise<boolean> => {
        if (this.undoManager?.canUndo) {
            const actions = {
                accept: "Save Changes",
                refuse: "Stay in Edit Mode",
                alternative: "Ignore Changes",
                default: "Stay in Edit Mode",
            };
            const confirmed = await this.confirmDialogRef.current?.show("You have unsaved changes. " +
                "Do you want to save before exiting?", actions);

            if (confirmed === DialogResponseClosure.Decline || confirmed === DialogResponseClosure.Cancel) {
                return false;
            }

            if (confirmed === DialogResponseClosure.Accept) {
                const saved = await this.saveScore();
                if (!saved) {
                    return false;
                }
            }

            if (confirmed === DialogResponseClosure.Alternative) {
                this.undoManager.discardChanges();
            }
        }

        AppStorage.saveSetting("editMode", false);

        const { lockToken } = this.state;

        if (lockToken) {
            const arrangement = this.dataModel.arrangement;

            if (arrangement) {
                await this.dataModel.unlockScore(arrangement.id, lockToken);
            }
        }

        this.dataModel.lockToken = undefined;
        this.setState({ editMode: false, lockToken: undefined, lockConflict: undefined });
        void requisitions.execute("editModeChanged", false);

        return true;
    };

    private handleNewSong = async (): Promise<void> => {
        const instruments = [...this.dataModel.instruments].sort((left, right) => {
            return left.displayOrder - right.displayOrder || left.displayName.localeCompare(right.displayName);
        });

        const settings = AppStorage.loadUISettings()?.scoreCreationSettings;

        const result = await this.newScoreDialogRef.current?.show({
            items: instruments.map((instrument) => {
                return {
                    id: String(instrument.id),
                    label: instrument.displayName,
                    icon: instrument.image.filePath,
                    value: instrument,
                };
            }),
            defaultSettings: settings,
        });

        if (result?.closure !== DialogResponseClosure.Accept) {
            return;
        }

        const selectedInstruments = result.selectedItems
            .map((item) => {
                return item.value as ISbDmInstrument | undefined;
            })
            .filter((instrument): instrument is ISbDmInstrument => {
                return instrument !== undefined;
            });

        if (selectedInstruments.length === 0) {
            void requisitions.execute("showWarning", "Select at least one instrument.");

            return;
        }

        AppStorage.saveSetting("scoreCreationSettings", {
            timeSignature: result.timeSignature,
            tempo: String(result.tempo),
            barCount: result.barCount,
            instruments: selectedInstruments.map((instrument) => {
                return instrument.id;
            }),
        });

        this.startNewSong(selectedInstruments, {
            title: result.title,
            timeSignature: result.timeSignature,
            pulse: result.pulse,
            stepResolution: result.stepResolution,
            length: result.barCount,
            tempo: result.tempo,
        });
    };

    private startNewSong(instruments: ISbDmInstrument[], options: IArrangementCreationOptions): void {
        if (this.arrangementPlayer) {
            this.arrangementPlayer.dispose();
        }

        const arrangement = this.dataModel.startNewArrangement(instruments, options);

        this.undoManager?.dispose();
        this.undoManager = this.createUndoManager();
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()));

        this.forceUpdate();

        void requisitions.execute("editModeChanged", true);
    }

    private handleEditModeChanged = async (enabled: boolean): Promise<boolean> => {
        AppStorage.saveSetting("editMode", enabled);

        if (enabled) {
            const arrangement = this.dataModel.arrangement;

            if (!arrangement) {
                return Promise.resolve(true);
            }

            if (arrangement.id >= 10000) {
                const data = await this.dataModel.lockScore(arrangement.id);

                if (data.success && data.token) {
                    this.dataModel.lockToken = data.token;
                    this.setState({ editMode: true, lockToken: data.token, lockConflict: undefined });

                    return Promise.resolve(true);
                }

                if (data.locked) {
                    this.setState({
                        editMode: false,
                        lockConflict: { username: data.username!, lockedAt: data.lockedAt! },
                    });

                    void requisitions.execute("showWarning",
                        `Score is being edited by ${data.username}`
                        + ` (since ${this.formatLockTimestamp(data.lockedAt!)})`);

                    return Promise.resolve(true);
                }

                // The backend refused the lock for a reason of its own. Editing without it would only fail at the
                // save, so the mode stays off and the reason is stated. A session that ended can be renewed with a
                // login; a missing permission cannot.
                if (data.status === 401) {
                    AppStorage.saveSetting("editMode", false);
                    this.setState({ editMode: false });
                    void requisitions.execute("showWarning", "Your session has ended. Log in again to edit.");
                    void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);

                    return Promise.resolve(true);
                }

                if (data.status === 403) {
                    AppStorage.saveSetting("editMode", false);
                    this.setState({ editMode: false });
                    void requisitions.execute("showError", "You do not have permission to edit this score.");

                    return Promise.resolve(true);
                }
            }

            this.setState({ editMode: true });
        } else {
            // Save before unlocking. Stay in edit mode if save fails.
            const saved = await this.saveScore();
            if (!saved) {
                return Promise.resolve(true);
            }

            const { lockToken } = this.state;

            if (lockToken) {
                const arrangement = this.dataModel.arrangement;

                if (arrangement) {
                    await this.dataModel.unlockScore(arrangement.id, lockToken);
                }
            }

            this.dataModel.lockToken = undefined;
            this.setState({ editMode: false, lockToken: undefined, lockConflict: undefined });
        }

        return Promise.resolve(true);
    };

    /**
     * Converts a MySQL TIMESTAMP string (e.g. "2026-08-11 12:34:56") to a locale-formatted
     * date string. Handles undefined/malformed input gracefully.
     *
     * @param lockedAt The raw TIMESTAMP value from the database.
     *
     * @returns A human-readable date string, or "unknown" if the input is invalid.
     */
    private formatLockTimestamp(lockedAt: string): string {
        if (!lockedAt) {
            return "unknown";
        }

        // MySQL TIMESTAMP: "2026-08-11 12:34:56" → "2026-08-11T12:34:56Z"
        // JS Date ISO: already has "T", keep as-is
        const normalised = lockedAt.includes("T") ? lockedAt : lockedAt.replace(" ", "T") + "Z";
        const date = new Date(normalised);

        if (isNaN(date.getTime())) {
            return "unknown";
        }

        return date.toLocaleString();
    }

    private async saveScore(): Promise<boolean> {
        const arrangement = this.dataModel.arrangement;
        if (!arrangement) {
            return true;
        }

        if (!this.undoManager?.canUndo) {
            return true;
        }

        try {
            const content = await this.dataModel.saveArrangement();
            if (content) {
                AppStorage.saveSetting("currentScore", content);
                this.undoManager.clearHistory();

                this.setState({ scoreSaved: true });
                void requisitions.execute("showInfo", "Score saved.");

                return true;
            }

            // The backend refused the save without content, which only happens when it could not be reached.
            void requisitions.execute("showError", "Save failed — the backend could not be reached.");

            return false;
        } catch (error) {
            const message = convertErrorToString(error);
            void requisitions.execute("showError", message);

            return false;
        }
    }

    private handleTimeParamsChange = (): Promise<boolean> => {
        this.forceUpdate();

        return Promise.resolve(true);
    };

    private handleArrangementMutated = (): Promise<boolean> => {
        this.dataModel.persistCurrentScore();

        return Promise.resolve(true);
    };

    private handleUndoStackChanged = (): Promise<boolean> => {
        this.forceUpdate();

        return Promise.resolve(true);
    };

    private handleScoreBookLoaded = (reason: ScoreBookChangeReason): Promise<boolean> => {
        // A newly loaded arrangement starts unsaved; library refreshes and renames leave the edit state alone. The
        // temporary print widths and the print track selection belong to the score that was shown before.
        if (reason === ScoreBookChangeReason.ScoreLoaded) {
            this.printSession.forgetAllArrangements();
            this.setState({ scoreSaved: false });
        }

        return Promise.resolve(true);
    };

    private handleNotificationStateChanged = (state: INotificationState): Promise<boolean> => {
        this.setState({ notificationState: state });

        return Promise.resolve(true);
    };

    private handleToggleNotifications = (): void => {
        NotificationCenter.toggleHistory();
    };

    private handleZoomChange = (zoom: number): void => {
        const settings = AppStorage.loadUISettings() ?? {};
        settings.viewSettings ??= {};
        settings.viewSettings.arrangementViewSettings ??= {};
        settings.viewSettings.arrangementViewSettings.zoomLevel = zoom;
        AppStorage.saveUISettings(settings);
        this.setState({ zoom });
        void requisitions.execute("settingsChanged", settings);
    };

    private handleShowReleaseNotes = (): void => {
        void this.openReleaseNotesDialog();
    };

    /**
     * Opens the settings dialog, importing its code on first use.
     */
    private async openSettingsDialog(): Promise<void> {
        const { dialogs } = this.state;
        if (dialogs.SettingsDialog) {
            this.settingsDialogRef.current?.open();

            return;
        }

        const { SettingsDialog } = await import("./ui/SettingsDialog.js");
        this.setState({ dialogs: { ...dialogs, SettingsDialog } }, () => {
            this.settingsDialogRef.current?.open();
        });
    }

    /**
     * Opens the users and groups editor, importing its code on first use.
     */
    private async openUserGroupEditor(): Promise<void> {
        const { dialogs } = this.state;
        if (dialogs.UserGroupEditor) {
            this.userGroupEditorRef.current?.open();

            return;
        }

        const { UserGroupEditor } = await import("./ui/UserGroupEditor.js");
        this.setState({ dialogs: { ...dialogs, UserGroupEditor } }, () => {
            this.userGroupEditorRef.current?.open();
        });
    }

    /**
     * Opens the permission editor for a score or folder, importing its code on first use.
     *
     * @param target The rectangle the editor is anchored at.
     * @param entry The score or folder the permissions belong to.
     */
    private async openPermissionEditor(target: DOMRect, entry: ISbDmScoreFolder | ISbDmScore): Promise<void> {
        const { dialogs } = this.state;
        if (!dialogs.PermissionEditor) {
            const { PermissionEditor } = await import("./ui/PermissionEditor.js");
            await new Promise<void>((resolve) => {
                this.setState({ dialogs: { ...dialogs, PermissionEditor } }, resolve);
            });
        }

        await this.permissionEditorRef.current?.open(target, entry);
    }

    /**
     * Opens the release notes, importing their code on first use.
     */
    private async openReleaseNotesDialog(): Promise<void> {
        const { dialogs } = this.state;
        if (dialogs.ReleaseNotesDialog) {
            this.releaseNotesDialogRef.current?.open();

            return;
        }

        const { ReleaseNotesDialog } = await import("./components/ui/composites/ReleaseNotesDialog.js");
        this.setState({ dialogs: { ...dialogs, ReleaseNotesDialog } }, () => {
            this.releaseNotesDialogRef.current?.open();
        });
    }

    private handleExportClick = async (): Promise<void> => {
        const { arrangementPlayer } = this;
        const arrangement = this.dataModel.arrangement;
        if (!arrangementPlayer || !arrangement || this.exporting) {
            return;
        }

        this.exporting = true;
        this.exportDialogRef.current?.open();
        this.forceUpdate();

        try {
            const blob = await arrangementPlayer.renderToBlob();
            const fileName = `${arrangement.title}.mp3`;

            if (isMobile && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
                const exportFile = new File([blob], fileName, { type: "audio/mpeg" });
                if (navigator.canShare({ files: [exportFile] })) {
                    try {
                        await navigator.share({ files: [exportFile], title: fileName });

                        return;
                    } catch (error) {
                        if (!(error instanceof DOMException) || error.name !== "AbortError") {
                            console.warn("File share failed, falling back to direct download.", error);
                        } else {
                            return;
                        }
                    }
                }
            }

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = fileName;
            anchor.rel = "noopener";
            anchor.target = "_blank";
            anchor.click();

            // Keep the URL alive briefly so Safari can consume it before revoking.
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        } catch (error) {
            console.error("MP3 export failed", error);
            void requisitions.execute("showError", "The MP3 could not be exported. Please try again.");
        } finally {
            this.exporting = false;
            this.exportDialogRef.current?.close(true);
            this.forceUpdate();
        }
    };

    /** Keeps the waiting dialog open while an export is still running. */
    private handleExportDialogClose = (): void => {
        if (this.exporting) {
            setTimeout(() => {
                this.exportDialogRef.current?.open();
            }, 0);
        }
    };

    /**
     * @returns The arrangement's performance metrics as a single caption line.
     */
    private arrangementStats(): string {
        const metrics = this.arrangementPlayer?.scoreMetrics;
        if (!metrics) {
            return "";
        }

        const bars = metrics.performedBars === 1 ? "1 bar" : `${metrics.performedBars} bars`;
        const duration = Math.round(100 * metrics.realTimeLength) / 100;

        return `${metrics.beatsPerBar}/${metrics.beatUnit} • ${bars} • ${duration} s`;
    }

    /**
     * @returns How the current score stands towards the backend: unsaved changes win over a prior save.
     */
    private arrangementSaveState(): ArrangementSaveState {
        const { scoreSaved } = this.state;
        if (this.undoManager?.canUndo) {
            return ArrangementSaveState.Unsaved;
        }

        return scoreSaved ? ArrangementSaveState.Saved : ArrangementSaveState.Unchanged;
    }

}
