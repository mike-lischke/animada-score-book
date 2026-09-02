/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./App.scss";
import "./print.scss";
import "./tailwind.css";

import timbauImage from "./assets/images/instrument-icons/timbau.svg";

import { createRef, type ComponentChild } from "preact";
import { lazy, Suspense } from "preact/compat";

import { ErrorBoundary } from "./components/ui/ErrorBoundary.js";
import { Button } from "./components/ui/framework/Button.js";
import { Container } from "./components/ui/framework/Container.js";
import { Dropdown, type IDropdownItem } from "./components/ui/framework/Dropdown.js";
import { GooeyGroup } from "./components/ui/framework/GooeyGroup.js";
import { Label } from "./components/ui/framework/Label.js";
import { ProgressIndicator } from "./components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";
import { renderNotificationCenter } from "./components/ui/NotificationCenter/NotificationCenter.js";
import { renderStatusBar, Statusbar } from "./components/ui/Statusbar/Statusbar.js";
import { StatusBarAlignment, type IStatusBarItem } from "./components/ui/Statusbar/StatusBarItem.js";

import { ArrangementPlayControls } from "./components/ui/Arrangement/ArrangementPlayControls.js";
import { ArrangementTitle } from "./components/ui/Arrangement/ArrangementTitle.js";
import { ArrangementViewer } from "./components/ui/Arrangement/ArrangementViewer.js";
import { NoteStyleBar } from "./components/ui/Arrangement/NoteStyleBar.js";
import { UndoRedoControls } from "./components/ui/Arrangement/UndoRedoControls.js";
import { ConfirmDialog } from "./components/ui/composites/ConfirmDialog.js";
import { NewScoreDialog } from "./components/ui/composites/NewScoreDialog.js";
import {
    ValueDialog, ValueEditorEntryType, type IValueEditorValueEntry
} from "./components/ui/composites/ValueDialog.js";
import { DialogResponseClosure } from "./components/ui/framework/Dialog.js";
import { DrawerSidebar } from "./components/ui/framework/DrawerSidebar.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { TooltipProvider } from "./components/ui/framework/Tooltip.js";
import { UIIcon } from "./components/ui/framework/UIIcon.js";
import { PrintDialog } from "./components/ui/Print/PrintDialog.js";
import { PrintView, type IPrintOptions } from "./components/ui/Print/PrintView.js";
import { AppStorage, type IUISettings } from "./core/AppStorage.js";
import { Arrangement, type IArrangementCreationOptions } from "./core/Arrangement.js";
import { getSharedAudioContext } from "./core/audio-context.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmInstrument, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { PasteResultKind, ScoreClipboard, SubdivisionPasteMode, type IPasteResult } from "./core/ScoreClipboard.js";
import { ArrangementMigrator } from "./core/serialisation/migration/ArrangementMigrator.js";
import { stringifyPackedArrangement, tryParsePackedArrangement } from "./core/serialisation/snapshot-packing.js";
import { mixerStepIndex, tutorialSteps } from "./core/TutorialSteps.js";
import type { IArrangementSnapshot } from "./core/types/general.js";
import { UndoManager } from "./core/UndoManager.js";
import { convertErrorToString } from "./core/utils.js";
import { ArrangementPlayer } from "./player/ArrangementPlayer.js";
import { AudioBufferPlayer } from "./player/AudioBufferPlayer.js";
import { escapeStack } from "./supplement/EscapeStack.js";
import { requisitions } from "./supplement/Requisitions.js";
import { AdminSetupDialog } from "./ui/AdminSetupDialog.js";
import { BackendDisconnectedDialog } from "./ui/BackendDisconnectedDialog.js";
import { BackendSetupDialog } from "./ui/BackendSetupDialog.js";
import { LoginDialog } from "./ui/LoginDialog.js";
import { PermissionEditor } from "./ui/PermissionEditor.js";
import { SelectionManager } from "./ui/SelectionManager.js";
import { SettingsDialog } from "./ui/SettingsDialog.js";
import { TutorialWizard } from "./ui/TutorialWizard.js";
import { UserGroupEditor } from "./ui/UserGroupEditor.js";
import { Separator } from "./components/ui/Separator.js";

const ScoreLibrary = lazy(() => {
    return import("./ui/ScoreLibrary.js").then((m) => {
        return { default: m.ScoreLibrary };
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

interface IAppState {
    phase: AppPhase;
    editMode: boolean;
    sidebarOpen: boolean;
    headerCollapsed: boolean;

    /** Token for the active score lock, if editing. */
    lockToken?: string;

    /** Conflict info when another user holds the lock. */
    lockConflict?: { username: string; lockedAt: string; };

    /** When true, the print view is rendered into the DOM and `window.print()` will be triggered. */
    printing: boolean;
    printOptions?: IPrintOptions;

    instrumentEditorEnabled: boolean;

    /** When true, the backend health endpoint was unreachable. */
    backendUnreachable: boolean;

    /** Error message shown during startup when the backend or database is unreachable. */
    startupError?: string;
}

export class App extends UIComponent<{}, IAppState> {
    private scoreLibraryRef = createRef<DrawerSidebar>();
    private settingsDialogRef = createRef<SettingsDialog>();
    private backendSetupDialogRef = createRef<BackendSetupDialog>();
    private backendDisconnectedDialogRef = createRef<BackendDisconnectedDialog>();
    private loginDialogRef = createRef<LoginDialog>();
    private adminSetupDialogRef = createRef<AdminSetupDialog>();
    private userGroupEditorRef = createRef<UserGroupEditor>();
    private permissionEditorRef = createRef<PermissionEditor>();
    private printDialogRef = createRef<PrintDialog>();
    private tutorialWizardRef = createRef<TutorialWizard>();
    private valueDialogRef = createRef<ValueDialog>();
    private confirmDialogRef = createRef<ConfirmDialog>();
    private newScoreDialogRef = createRef<NewScoreDialog>();

    /** Saved theme/title to restore after the print job finishes. */
    private printRestoreState?: { theme: string; documentTitle: string; };

    private dataModel = new ScoreBookDataModel();
    private scoreClipboard = new ScoreClipboard(this.dataModel);

    private selectionManager: SelectionManager;
    private arrangementPlayer?: ArrangementPlayer;
    private undoManager?: UndoManager;

    private currentPlayRange?: { startBar: number; endBar: number; };
    private selectedThemePreference = "Light+";
    private systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    private signInFromRunning = false;
    private statsItem?: IStatusBarItem;
    private notificationItem?: IStatusBarItem;
    private versionItem?: IStatusBarItem;

    private currentTutorialStep = 0;

    /** Scroll offset (px) at which the header starts collapsing. */
    private readonly headerCollapseThreshold = 16;

    public constructor(props: {}) {
        super(props);

        this.state = {
            phase: AppPhase.Checking,
            editMode: false,
            sidebarOpen: false,
            headerCollapsed: false,
            printing: false,
            instrumentEditorEnabled: false,
            backendUnreachable: false,
        };

        this.selectionManager = new SelectionManager(this.dataModel);

        this.initEventHandlers();
    }

    public override componentDidMount() {
        this.selectedThemePreference = AppStorage.loadUISettings()?.theme ?? "Light+";
        this.applyThemePreference(this.selectedThemePreference);
        this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);
        window.addEventListener("afterprint", this.handleAfterPrint);
        escapeStack.attach();

        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("playRangeChanged", this.handlePlayRangeChanged);
        requisitions.register("notificationStateChanged", this.handleNotificationStateChanged);
        requisitions.register("backendDisconnected", this.handleBackendDisconnected);
        requisitions.register("authChanged", this.handleAuthChanged);
        requisitions.register("notesClicked", this.handleNoteClicked);
        requisitions.register("editModeChanged", this.handleEditModeChanged);
        requisitions.register("arrangementMutated", this.handleArrangementMutated);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChange);
        requisitions.register("undoStackChanged", this.handleUndoStackChanged);

        void this.checkBackendThenInitialize();
    }

    public override shouldComponentUpdate(nextProps: {}, nextState: IAppState): boolean {
        const { editMode, sidebarOpen, phase, headerCollapsed, printing, backendUnreachable,
            startupError } = this.state;

        return editMode !== nextState.editMode
            || sidebarOpen !== nextState.sidebarOpen || phase !== nextState.phase
            || headerCollapsed !== nextState.headerCollapsed
            || printing !== nextState.printing
            || backendUnreachable !== nextState.backendUnreachable
            || startupError !== nextState.startupError;
    }

    public override componentDidUpdate(_prevProps: {}, prevState: IAppState): void {
        const { phase } = this.state;

        if (prevState.phase !== AppPhase.Running && phase === AppPhase.Running) {
            this.updateStatsItem();
            this.updateVersionItem();
        }
    }

    public override componentWillUnmount() {
        requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);
        this.systemThemeQuery.removeEventListener("change", this.handleSystemThemeChange);
        window.removeEventListener("afterprint", this.handleAfterPrint);
        escapeStack.detach();

        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("playRangeChanged", this.handlePlayRangeChanged);
        requisitions.unregister("notificationStateChanged", this.handleNotificationStateChanged);
        requisitions.unregister("backendDisconnected", this.handleBackendDisconnected);
        requisitions.unregister("authChanged", this.handleAuthChanged);
        requisitions.unregister("notesClicked", this.handleNoteClicked);
        requisitions.unregister("editModeChanged", this.handleEditModeChanged);
        requisitions.unregister("arrangementMutated", this.handleArrangementMutated);
        requisitions.unregister("undoStackChanged", this.handleUndoStackChanged);
    }

    public render() {
        const { phase, editMode, sidebarOpen, headerCollapsed, instrumentEditorEnabled, printing,
            printOptions, backendUnreachable, startupError } = this.state;
        const isRunning = phase === AppPhase.Running;
        const headerClassName = `rounded-3xl shadow-md border border-base-200/70 gap-4`
            + (headerCollapsed ? " collapsed" : "");

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

        let breadcrumb: ComponentChild;
        let userButton: ComponentChild;
        let editModeButton;
        let newSongButton;
        let isAdmin = false;
        if (isRunning) {
            isAdmin = this.dataModel.user?.isAdmin ?? false;
            breadcrumb = this.renderHeaderBreadcrumb();
            userButton = this.renderUserButton();

            if (this.arrangementPlayer) {
                newSongButton = <Button
                    plain
                    data-role="new-song"
                    className="editSaveButton large"
                    disabled={editMode}
                    data-tooltip="New Song"
                    onClick={() => {
                        void this.handleNewSong();
                    }}
                >
                    <Icon
                        src={UIIcon.Add}
                        width={24}
                        height={24}
                        data-tooltip="inherit"
                    />
                </Button>;

                editModeButton = <Button
                    plain
                    className="editSaveButton large"
                    data-tooltip={editMode ? "Exit Edit Mode" : "Enter Edit Mode"}
                    onClick={this.handleEditModeToggle}
                >
                    <Icon
                        src={UIIcon.Edit}
                        width={24}
                        height={24}
                        data-tooltip="inherit"
                    />
                </Button>;
            }
        }

        let saveButton: ComponentChild;
        let printButton: ComponentChild;
        if (isRunning && this.arrangementPlayer) {
            saveButton = <Button
                plain
                data-role="save-score"
                className="editSaveButton"
                disabled={!this.undoManager?.canUndo}
                data-tooltip="Save Score (Ctrl+S)"
                onClick={() => {
                    void this.saveScore();
                }}
            >
                <Icon
                    src={UIIcon.Save}
                    width={24}
                    height={24}
                    data-tooltip="inherit"
                />
            </Button>;

            printButton = <Button
                plain
                id="printButton"
                className="editSaveButton"
                data-tooltip="Print / Export to PDF"
                data-tutorial="print"
                onClick={this.handlePrintClick}
            >
                <Icon
                    src={UIIcon.FilePdf}
                    width={24}
                    height={24}
                    data-tooltip="inherit"
                />
            </Button>;
        }

        let instrumentEditorButton: ComponentChild;
        if (isAdmin && instrumentEditorEnabled) {
            instrumentEditorButton = <Button
                id="instrumentEditor"
                imageOnly
                className="du-btn-ghost"
                data-tooltip="Instrument Editor"
                disabled
                onClick={this.handleInstrumentEditorClick}
            >
                <Icon
                    src={timbauImage}
                    width={24}
                    height={24}
                    data-tooltip="inherit"
                />
            </Button>;
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

        return (
            <>
                {isRunning && (
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
                                    orientation={Orientation.TopDown}
                                    crossAlignment={ChildAlignment.Stretch}
                                    style={{ height: "100dvh", minHeight: 0, overflow: "hidden" }}
                                >
                                    <Container
                                        id="headerContent"
                                        orientation={Orientation.LeftToRight}
                                        className={headerClassName}
                                    >
                                        <Container
                                            id="mainToolbarButtons"
                                            orientation={Orientation.TopDown}
                                            mainAlignment={ChildAlignment.Start}
                                            className="bg-base-100/80 p-2"
                                        >
                                            <img id="titleLogo" src="/logo.svg" />
                                            <Container
                                                className="header-toolbar-extra"
                                                orientation={Orientation.TopDown}
                                                mainAlignment={ChildAlignment.Center}
                                                crossAlignment={ChildAlignment.Stretch}
                                            >
                                                <Button
                                                    imageOnly
                                                    className="du-btn-ghost"
                                                    data-tooltip="Display Options"
                                                    data-tutorial="display-options"
                                                    onClick={this.handleDisplayOptionsClick}
                                                >
                                                    <Icon
                                                        src={UIIcon.Gear}
                                                        data-tooltip="inherit"
                                                    />
                                                </Button>
                                                <Button
                                                    id="scoreLibraryButton"
                                                    imageOnly
                                                    className="du-btn-ghost"
                                                    data-tooltip="Score Library"
                                                    data-tutorial="score-library"
                                                    onClick={this.handleScoreLibraryClick}
                                                >
                                                    <Icon
                                                        src={UIIcon.Library}
                                                        data-tooltip="inherit"
                                                    />
                                                </Button>
                                                {instrumentEditorButton}
                                                {userButton}
                                            </Container>
                                        </Container>
                                        <Container
                                            className="header-content-rows"
                                            orientation={Orientation.TopDown}
                                            crossAlignment={ChildAlignment.Stretch}
                                        >
                                            {breadcrumb}
                                            <ArrangementPlayControls
                                                arrangementPlayer={this.arrangementPlayer!}
                                                dataModel={this.dataModel}
                                                editMode={editMode}
                                                data-tutorial="playback"
                                            />
                                            <Container
                                                id="editControlsHost"
                                                orientation={Orientation.LeftToRight}
                                                mainAlignment={ChildAlignment.Start}
                                                crossAlignment={ChildAlignment.Center}
                                            >
                                                <Label caption="Edit" className="header-row-label" />
                                                <GooeyGroup
                                                    className="editSaveGooey"
                                                    background="var(--color-base-200)"
                                                >
                                                    {newSongButton}
                                                    {editModeButton}
                                                    {saveButton}
                                                    {printButton}
                                                </GooeyGroup>
                                                {editMode && (
                                                    <>
                                                        <Separator
                                                            style={{ marginLeft: "16px", height: "50%" }}
                                                        />
                                                        <UndoRedoControls
                                                            undoManager={this.undoManager!}
                                                        />
                                                        <Separator
                                                            style={{ marginLeft: "16px", height: "50%" }}
                                                        />
                                                        <NoteStyleBar
                                                            dataModel={this.dataModel}
                                                            selectionManager={this.selectionManager}
                                                        />
                                                    </>)}
                                            </Container>
                                        </Container>
                                    </Container>
                                    <div
                                        id="viewerScrollHost"
                                        onScroll={this.handleViewerScroll}
                                        onWheel={this.handleViewerWheel}
                                        style={{
                                            flex: "1 1 auto",
                                            minHeight: 0,
                                            overflow: "auto",
                                            overscrollBehaviorX: "none",
                                        }}
                                    >
                                        {this.arrangementPlayer && <ArrangementViewer
                                            arrangementPlayer={this.arrangementPlayer}
                                            dataModel={this.dataModel}
                                            selectionManager={this.selectionManager}
                                            inEditMode={editMode}
                                        />}
                                    </div>
                                </Container>
                            </DrawerSidebar>
                            {renderStatusBar()}
                            {renderNotificationCenter()}
                        </Container>
                        <TooltipProvider />
                        <ValueDialog ref={this.valueDialogRef} />
                        <SettingsDialog ref={this.settingsDialogRef} />
                        <TutorialWizard
                            ref={this.tutorialWizardRef}
                            steps={tutorialSteps}
                            tutorialEnabled={AppStorage.loadUISettings()?.tutorialEnabled ?? true}
                            onTutorialEnabledChange={this.handleTutorialEnabledChange}
                            onStepChange={this.handleTutorialStepChange}
                            onClose={this.handleTutorialClose}
                        />
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
                        <PrintDialog ref={this.printDialogRef} onAccept={this.handlePrintAccept} />
                        <UserGroupEditor
                            ref={this.userGroupEditorRef}
                            dataModel={this.dataModel}
                            showUsers={this.dataModel.user?.isAdmin === true}
                        />
                        <PermissionEditor
                            ref={this.permissionEditorRef}
                            dataModel={this.dataModel}
                            confirmRef={this.confirmDialogRef}
                            onSaved={(entry) => {
                                void requisitions.execute("permChanged", entry);
                            }}
                        />
                        {
                            printing && this.dataModel.arrangement && printOptions
                            && this.arrangementPlayer && this.undoManager && (
                                <PrintView
                                    arrangement={this.dataModel.arrangement as Arrangement}
                                    options={printOptions}
                                    dataModel={this.dataModel}
                                    arrangementPlayer={this.arrangementPlayer}
                                    selectionManager={this.selectionManager}
                                />
                            )
                        }
                    </ErrorBoundary>
                )}

                <ConfirmDialog ref={this.confirmDialogRef} />
                <NewScoreDialog ref={this.newScoreDialogRef} />

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
     * Retries the backend health check after a connection failure.
     */
    private handleRetryConnection = (): void => {
        void this.setStatePromise({ backendUnreachable: false, startupError: undefined }).then(() => {
            return this.checkBackendThenInitialize();
        });
    };

    private renderHeaderBreadcrumb(): ComponentChild {
        const { editMode } = this.state;
        const arrangement = this.dataModel.arrangement!;

        return (
            <Container
                className="header-breadcrumb"
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.Start}
                crossAlignment={ChildAlignment.Center}
                gap={4}
            >
                <Label className="header-breadcrumb-root" caption="Score Library" />
                <Icon src={UIIcon.ChevronRight} width={16} height={16} />
                <ArrangementTitle
                    id="header-breadcrumb-title"
                    arrangement={arrangement}
                    dataModel={this.dataModel}
                    editMode={editMode}
                />
            </Container>
        );
    }

    private renderUserButton(): ComponentChild {
        const isAdmin = this.dataModel.user?.isAdmin ?? false;

        if (this.dataModel.authenticated) {
            return <Dropdown
                id="userMenu"
                icon={<Icon src={UIIcon.Account} />}
                items={this.buildUserMenuItems()}
                closeOnSelect
                style={{ backgroundColor: isAdmin ? "tomato" : undefined }}
            />;
        }

        return <Button
            id="signInButton"
            imageOnly
            className="du-btn-ghost"
            data-tooltip="Sign In"
            onClick={this.handleSignInClick}
        >
            <Icon
                src={UIIcon.SignIn}
                data-tooltip="inherit"
            />
        </Button>;
    }

    private handleViewerScroll = (event: Event): void => {
        const host = event.currentTarget as HTMLElement;
        const { headerCollapsed } = this.state;

        const hasOverflow = host.scrollHeight > host.clientHeight;

        if (headerCollapsed) {
            // Expand on a real scroll back to the top of a still-overflowing host. When the
            // content fits after collapsing, the browser clamps scrollTop to 0; that event must
            // not re-expand the header (the wheel handler covers that case).
            if (host.scrollTop === 0 && hasOverflow) {
                this.setState({ headerCollapsed: false });
            }
        } else if (host.scrollTop > this.headerCollapseThreshold) {
            this.setState({ headerCollapsed: true });
        }
    };

    private handleViewerWheel = (event: WheelEvent): void => {
        const host = event.currentTarget as HTMLElement;
        const { headerCollapsed } = this.state;

        // With no scrollbar (content fits when collapsed) scroll events never fire, so a
        // wheel-up gesture is the only way to re-expand the header.
        if (headerCollapsed && event.deltaY < 0 && host.scrollHeight <= host.clientHeight) {
            this.setState({ headerCollapsed: false });
        }
    };

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
                mode: "fatal",
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
                mode: "initial",
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
                mode: "admin",
                dbError: health.dbError,
            });

            if (setupResult !== "reset") {
                return;
            }

            const confirmed = await this.confirmDialogRef.current?.show(
                "This will delete all scores, folders, users and groups.\n"
                + "The database tables will be recreated from scratch.",
                { accept: "Reset Database", refuse: "Cancel" },
                "Reset Database",
                ["This cannot be undone. Make sure to export your scores if you want to keep them."],
            );

            if (confirmed !== DialogResponseClosure.Accept) {
                return;
            }

            // Skip login when there are no users (e.g., schema broken,
            // users table missing). The backend allows emergency reset without auth.
            if (health.hasUsers) {
                await this.setStatePromise({ phase: AppPhase.Login });
                const loggedIn = await this.loginDialogRef.current?.show(true);

                if (!loggedIn) {
                    return;
                }
            }

            const ok = await this.dataModel.resetDatabase();

            if (!ok) {
                // Reset failed — restart the health check so the setup dialog can show the error.
                return this.checkBackendThenInitialize();
            }

            // Restart the health check — the backend is now fresh.
            return this.checkBackendThenInitialize();
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
        await this.dataModel.initialize();

        const params = new URL(window.location.href).searchParams;
        const hasBananaDrum = params.has("a") || params.has("a2");
        const hasScoreParam = params.has("score");

        const showTutorial = !hasBananaDrum && !hasScoreParam
            && (AppStorage.loadUISettings()?.tutorialEnabled ?? true);

        if (showTutorial) {
            this.initAppState();
            this.setState({ phase: AppPhase.Running }, () => {
                this.tutorialWizardRef.current?.open();
            });

            return;
        }

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

    private handleTutorialClose = (completed: boolean): void => {
        this.tutorialWizardRef.current?.close(completed);
        this.loadScorebook(undefined);
    };

    private handleTutorialStepChange = (stepIndex: number): void => {
        const prevStep = this.currentTutorialStep;
        this.currentTutorialStep = stepIndex;

        if (stepIndex === mixerStepIndex) {
            this.toggleMixerIf(!this.isMixerExpanded());
        }

        if (prevStep === mixerStepIndex && stepIndex !== mixerStepIndex) {
            this.toggleMixerIf(this.isMixerExpanded());
        }
    };

    private isMixerExpanded(): boolean {
        return document.querySelector(".trackControlsList")?.classList.contains("expanded") ?? false;
    }

    private toggleMixerIf(condition: boolean): void {
        if (!condition) {
            return;
        }

        document.querySelector<HTMLElement>(".trackControlsToggle")?.click();
    }

    private handleTutorialEnabledChange = (enabled: boolean): void => {
        AppStorage.saveSetting("tutorialEnabled", enabled);
    };

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

    private handlePrintClick = () => {
        this.openPrintDialog();
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

        // Clear status bar item references — they belong to the old (now-unmounted) Statusbar.
        this.statsItem = undefined;
        this.notificationItem = undefined;
        this.versionItem = undefined;

        this.setState({ phase: AppPhase.Login }, () => {
            void this.loginDialogRef.current?.show().then(this.handleLoginDialogResult);
        });
    };

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
                    this.userGroupEditorRef.current?.open();
                },
            });
            items.push({
                label: "Reset Backend",
                icon: <Icon src={UIIcon.Server} />,
                onClick: () => {
                    void this.backendSetupDialogRef.current?.show({ mode: "admin" });
                },
            });
        } else if (user) {
            items.push({
                label: "My Groups",
                icon: <Icon src={UIIcon.Organization} />,
                onClick: () => {
                    this.userGroupEditorRef.current?.open();
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

    private openPrintDialog(): void {
        if (!this.dataModel.arrangement) {
            return;
        }

        const settings = AppStorage.loadUISettings() ?? {};
        const viewMode = settings.viewSettings?.arrangementViewSettings?.displayMode ?? "grid";

        const availableTracks = this.dataModel.arrangement.tracks.map((track) => {
            return { id: track.id, name: track.name || track.instrument.displayName };
        });

        this.printDialogRef.current?.open({ viewMode, }, availableTracks);
    }

    private handlePrintAccept = (options: IPrintOptions): void => {
        this.startPrint(options);
    };

    private startPrint(options: IPrintOptions): void {
        this.printRestoreState = {
            theme: this.selectedThemePreference,
            documentTitle: document.title,
        };

        // Always print with the Light+ theme for consistent, paper-friendly output.
        document.documentElement.setAttribute("data-theme", "Light+");

        // Inject a dynamic @page rule so the browser uses the chosen paper size and orientation,
        // and place a running header on every printed page: arrangement title left, "Page N" right.
        const arrangement = this.dataModel.arrangement;
        const headerTitle = (arrangement?.title ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const pageStyle = document.createElement("style");
        pageStyle.id = "print-page-style";
        pageStyle.textContent =
            `@page { ` +
            // Slightly bigger top margin so the header band fits without clipping the
            // 14pt title glyphs.
            `margin: 25mm 15mm 15mm 15mm; ` +
            `@top-left { ` +
            `content: "${headerTitle}"; ` +
            `font-family: system-ui, sans-serif; ` +
            `font-size: 14pt; ` +
            `font-weight: 700; ` +
            `color: #000; ` +
            `vertical-align: middle; ` +
            `} ` +
            `@top-right { ` +
            `content: "Page " counter(page); ` +
            `font-family: system-ui, sans-serif; ` +
            `font-size: 10pt; ` +
            `color: #444; ` +
            `vertical-align: middle; ` +
            `} ` +
            `}`;
        document.head.appendChild(pageStyle);

        // Use the arrangement title as default PDF filename.
        if (arrangement) {
            document.title = `${arrangement.title} \u2014 Animada Score Book`;
        }

        document.body.classList.add("printing");

        this.setState({ printing: true, printOptions: options }, () => {
            // Wait for layout, fonts, then trigger the browser print dialog.
            const fontsReady = (document as { fonts?: { ready?: Promise<unknown>; }; }).fonts?.ready
                ?? Promise.resolve();
            void fontsReady.then(() => {
                // One more rAF tick so the print DOM is laid out.
                requestAnimationFrame(() => {
                    window.print();
                });
            });
        });
    }

    private handleAfterPrint = (): void => {
        document.body.classList.remove("printing");

        const pageStyle = document.getElementById("print-page-style");
        if (pageStyle) {
            pageStyle.remove();
        }

        if (this.printRestoreState) {
            const { theme, documentTitle } = this.printRestoreState;
            this.applyThemePreference(theme);
            document.title = documentTitle;
            this.printRestoreState = undefined;
        }

        this.setState({ printing: false, printOptions: undefined });
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
                        } as IValueEditorValueEntry],
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
                if (!this.permissionEditorRef.current) {
                    return false;
                }

                const row = document.querySelector<HTMLElement>(
                    `.scoreTreeEntry[data-entry-type="${String(data.type)}"][data-entry-id="${data.id}"]`,
                );

                if (row) {
                    const rowRect = row.getBoundingClientRect();
                    void this.permissionEditorRef.current.open(rowRect, data);
                }

                return false;
            }

            default:
        }

        ;

        return true;
    };

    private initAppState(): void {
        this.undoManager?.dispose();
        this.undoManager = new UndoManager(this.dataModel);
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);
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
        this.undoManager = new UndoManager(this.dataModel);
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()),
        );

        this.forceUpdate();

        const { phase, editMode } = this.state;
        if (phase === AppPhase.Running) {
            this.updateStatsItem();
        }

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

    private handleKeyDown(event: KeyboardEvent): void {
        const { editMode } = this.state;

        // Ctrl/Cmd+S saves the score in edit mode.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "s") {
            event.preventDefault();
            if (editMode) {
                void this.saveScore();
            }

            return;
        }

        // Ctrl/Cmd+P opens the print preview dialog instead of the native print dialog.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "p") {
            event.preventDefault();
            this.openPrintDialog();

            return;
        }

        // Clipboard operations. Copy works in every mode; cut/paste require edit mode.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase();

            if (key === "x" || key === "c" || key === "v") {
                const target = event.target as HTMLElement | null;
                const editable = target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"
                    || target.isContentEditable);
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

        switch (event.key) {
            case "Escape": {
                this.selectionManager.clearSelection();

                break;
            }

            case "Alt": {
                event.preventDefault();

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

    private copySelection(): void {
        this.scoreClipboard.copy([...this.selectionManager.currentSelection.values()]);
    }

    private cutSelection(): void {
        this.scoreClipboard.cut([...this.selectionManager.currentSelection.values()]);
    }

    private async pasteSelection(): Promise<void> {
        const entries = [...this.selectionManager.currentSelection.values()];
        let result = this.scoreClipboard.paste(entries);

        if (result.kind === PasteResultKind.NeedsTrackCreation) {
            const confirmed = await this.confirmTrackCreation(result.missingInstrumentTypeIds ?? []);
            if (confirmed) {
                result = this.scoreClipboard.paste(entries, true);
            }
        } else if (result.kind === PasteResultKind.NeedsSubdivisionMode) {
            const mode = await this.confirmSubdivisionMode();
            if (mode !== undefined) {
                result = this.scoreClipboard.paste(entries, false, mode);
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
        this.undoManager = new UndoManager(this.dataModel);
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()));

        this.forceUpdate();

        const { phase } = this.state;
        if (phase === AppPhase.Running) {
            this.updateStatsItem();
        }

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

                void requisitions.execute("showInfo", "Score saved.");

                return true;
            }

            void requisitions.execute("showError", "Save failed — backend returned no content.");

            return false;
        } catch (error) {
            const message = convertErrorToString(error);
            void requisitions.execute("showError", message);

            return false;
        }
    }

    private handleTimeParamsChange = (): Promise<boolean> => {
        this.forceUpdate();
        this.updateStatsItem();

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

    private handlePlayRangeChanged = (range: { from: number; to: number; } | undefined): Promise<boolean> => {
        this.currentPlayRange = range ? { startBar: range.from, endBar: range.to } : undefined;
        this.forceUpdate();

        return Promise.resolve(true);
    };

    /**
     * Creates or updates the status bar item that shows the current score metrics
     * (time signature, bar count, duration) on the right side of the status bar.
     */
    private updateStatsItem(): void {
        const player = this.arrangementPlayer;
        if (!player) {
            return;
        }

        const metrics = player.scoreMetrics;
        const bars = metrics.bars === 1 ? "1 bar" : `${metrics.bars} bars`;
        const text = `${metrics.beatsPerBar}/${metrics.beatUnit} • ${bars} • ` +
            `${Math.round(100 * metrics.realTimeLength) / 100} s`;

        if (!this.statsItem) {
            try {
                this.statsItem = Statusbar.createStatusBarItem({
                    id: "scoreStats",
                    text,
                    alignment: StatusBarAlignment.Right,
                    priority: 10,
                });
            } catch {
                // Statusbar is not mounted yet — the item will be created on
                // the next updateStatsItem call (e.g. when timeParamsChanged fires).
                return;
            }
        } else {
            this.statsItem.text = text;
        }
    }

    /**
     * Creates the fixed status bar item that shows the app version. The item is created once per
     * Statusbar mount and survives because it never expires.
     */
    private updateVersionItem(): void {
        if (this.versionItem) {
            return;
        }

        try {
            this.versionItem = Statusbar.createStatusBarItem({
                id: "appVersion",
                text: `v${appVersion}`,
                tooltip: "Animada Score Book version",
                alignment: StatusBarAlignment.Right,
                priority: -10,
            });
        } catch {
            // Statusbar is not mounted yet — it will be created on the next transition to Running.
        }
    }

    private handleNotificationStateChanged = (state: {
        newCount: number; totalCount: number; silent: boolean; showHistory: boolean;
    }): Promise<boolean> => {
        const { newCount, totalCount, silent, showHistory } = state;

        let text: string;
        let tooltip: string;
        let icon: ComponentChild;

        if (showHistory) {
            tooltip = "Hide Notifications";
            text = "";
            icon = <Icon src={silent ? UIIcon.BellSlash : UIIcon.Bell} width="16px" height="16px" />;
        } else {
            if (silent) {
                icon = <Icon src={newCount === 0 ? UIIcon.BellSlash : UIIcon.BellSlashDot}
                    width="16px" height="16px" />;
            } else {
                icon = <Icon src={newCount === 0 ? UIIcon.Bell : UIIcon.BellDot}
                    width="16px" height="16px" />;
            }

            text = newCount === 0 ? "" : newCount.toString();
            tooltip = newCount === 0 ? "No" : newCount.toString();
            if (newCount === 0) {
                if (totalCount > 0) {
                    tooltip += " New Notifications";
                } else {
                    tooltip += " Notifications";
                }
            } else {
                tooltip += " New Notification" + (newCount > 1 ? "s" : "");
            }
        }

        if (!this.notificationItem) {
            this.notificationItem = Statusbar.createStatusBarItem({
                id: "showNotificationHistory",
                text,
                icon,
                tooltip,
                command: "notifications:toggleHistory",
                alignment: StatusBarAlignment.Right,
                priority: 0,
            });
        } else {
            this.notificationItem.text = text;
            this.notificationItem.icon = icon;
            this.notificationItem.tooltip = tooltip;
        }

        return Promise.resolve(true);
    };

}
