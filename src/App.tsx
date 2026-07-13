/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "@vscode/codicons/dist/codicon.css";
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
import { Label } from "./components/ui/framework/Label.js";
import { ProgressIndicator } from "./components/ui/framework/ProgressIndicator.js";
import { ChildAlignment, Orientation } from "./components/ui/framework/ui-types.js";
import { UIComponent } from "./components/ui/framework/UIComponent.js";
import { renderNotificationCenter } from "./components/ui/NotificationCenter/NotificationCenter.js";
import { renderStatusBar, Statusbar } from "./components/ui/Statusbar/Statusbar.js";
import { StatusBarAlignment, type IStatusBarItem } from "./components/ui/Statusbar/StatusBarItem.js";

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
import { PrintDialog } from "./components/ui/Print/PrintDialog.js";
import { PrintView, type IPrintOptions } from "./components/ui/Print/PrintView.js";
import { AppStorage, type IUISettings } from "./core/AppStorage.js";
import { Arrangement } from "./core/Arrangement.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmScore, type ISbDmScoreFolder
} from "./core/ScoreBookDataModel.js";
import { ArrangementMigrator } from "./core/serialisation/migration/ArrangementMigrator.js";
import {
    stringifyPackedArrangement, tryParsePackedArrangement
} from "./core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "./core/types/general.js";
import { UndoManager } from "./core/UndoManager.js";
import { convertErrorToString } from "./core/utils.js";
import { getSharedAudioContext } from "./core/audio-context.js";
import { ArrangementPlayer } from "./player/ArrangementPlayer.js";
import { AudioBufferPlayer } from "./player/AudioBufferPlayer.js";
import type { ScoreBookUiServices } from "./player/types.js";
import { escapeStack } from "./supplement/EscapeStack.js";
import { requisitions } from "./supplement/Requisitions.js";
import { BackendDisconnectedDialog } from "./ui/BackendDisconnectedDialog.js";
import { BackendSetupDialog } from "./ui/BackendSetupDialog.js";
import { LoginDialog } from "./ui/LoginDialog.js";
import { AdminSetupDialog } from "./ui/AdminSetupDialog.js";
import { SelectionManager } from "./ui/SelectionManager.js";
import { SettingsDialog } from "./ui/SettingsDialog.js";
import { TutorialWizard } from "./ui/TutorialWizard.js";
import { UserGroupEditor } from "./ui/UserGroupEditor.js";
import { PermissionEditor } from "./ui/PermissionEditor.js";
import { tutorialSteps, mixerStepIndex } from "./core/TutorialSteps.js";

const ScoreLibrary = lazy(() => {
    return import("./ui/ScoreLibrary.js").then((m) => {
        return { default: m.ScoreLibrary };
    });
});

enum DisplayMode {
    Standard,
    Editing
}

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
    editingTitle: boolean;
    displayMode: DisplayMode;
    sidebarOpen: boolean;

    headerPinned: boolean;

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

    /** Saved theme/title to restore after the print job finishes. */
    private printRestoreState?: { theme: string; documentTitle: string; };

    private dataModel = new ScoreBookDataModel();

    private services: ScoreBookUiServices;
    private arrangementPlayer?: ArrangementPlayer;
    private undoManager?: UndoManager;

    private justFinishedEditingTitle = false;

    private currentPlayRange?: { startBar: number; endBar: number; };
    private selectedThemePreference = "Light+";
    private systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    private signInFromRunning = false;
    private statsItem?: IStatusBarItem;
    private notificationItem?: IStatusBarItem;

    private currentTutorialStep = 0;

    public constructor(props: {}) {
        super(props);

        this.state = {
            phase: AppPhase.Checking,
            editingTitle: false,
            displayMode: DisplayMode.Standard,
            sidebarOpen: false,
            headerPinned: false,
            printing: false,
            instrumentEditorEnabled: false,
            backendUnreachable: false,
        };

        const selectionManager = new SelectionManager();
        this.services = {
            selectionManager,
        };

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

        void this.checkBackendThenInitialize();
    }

    public override shouldComponentUpdate(nextProps: {}, nextState: IAppState): boolean {
        const { displayMode, sidebarOpen, phase, headerPinned, printing, backendUnreachable,
            startupError } = this.state;

        return displayMode !== nextState.displayMode
            || sidebarOpen !== nextState.sidebarOpen || phase !== nextState.phase
            || headerPinned !== nextState.headerPinned
            || printing !== nextState.printing
            || backendUnreachable !== nextState.backendUnreachable
            || startupError !== nextState.startupError;
    }

    public override componentDidUpdate(_prevProps: {}, prevState: IAppState): void {
        const { phase } = this.state;

        if (prevState.phase !== AppPhase.Running && phase === AppPhase.Running) {
            this.updateStatsItem();
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
    }

    public render() {
        const { phase, displayMode, sidebarOpen, headerPinned, instrumentEditorEnabled, printing,
            printOptions, backendUnreachable, startupError } = this.state;
        const isRunning = phase === AppPhase.Running;

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

        let titleBlock;
        let isAdmin = false;
        if (isRunning) {
            const arrangementView = this.dataModel.arrangement!;
            isAdmin = this.dataModel.user?.isAdmin ?? false;

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
                                                        className="du-btn-ghost"
                                                        data-tooltip="Display Options"
                                                        data-tutorial="display-options"
                                                        onClick={this.handleDisplayOptionsClick}
                                                    >
                                                        <Icon
                                                            src={Codicon.Gear}
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
                                                            src={Codicon.Library}
                                                            data-tooltip="inherit"
                                                        />
                                                    </Button>
                                                    {instrumentEditorButton}
                                                    <Button
                                                        id="printButton"
                                                        imageOnly
                                                        className="du-btn-ghost"
                                                        data-tooltip="Print / Export to PDF"
                                                        data-tutorial="print"
                                                        onClick={this.handlePrintClick}
                                                    >
                                                        <Icon
                                                            src={Codicon.FilePdf}
                                                            data-tooltip="inherit"
                                                        />
                                                    </Button>
                                                    {this.dataModel.authenticated ? (
                                                        <Dropdown
                                                            id="userMenu"
                                                            icon={<Icon src={Codicon.Account} />}
                                                            items={this.buildUserMenuItems()}
                                                            closeOnSelect
                                                            style={{ backgroundColor: isAdmin ? "tomato" : undefined }}
                                                        />
                                                    ) : (
                                                        <Button
                                                            id="signInButton"
                                                            imageOnly
                                                            className="du-btn-ghost"
                                                            data-tooltip="Sign In"
                                                            onClick={this.handleSignInClick}
                                                        >
                                                            <Icon
                                                                src={Codicon.SignIn}
                                                                data-tooltip="inherit"
                                                            />
                                                        </Button>
                                                    )}
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

                                                </Container>
                                                <ArrangementPlayControls
                                                    arrangementPlayer={this.arrangementPlayer!}
                                                    dataModel={this.dataModel}
                                                    services={this.services}
                                                    undoManager={this.undoManager!}
                                                    data-tutorial="playback"
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
                                    services={this.services}
                                    undoManager={this.undoManager}
                                />
                            )
                        }
                    </ErrorBoundary>
                )}

                <ConfirmDialog ref={this.confirmDialogRef} />

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
                const event = measure.events.find((e) => {
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

                        this.setState({ phase: AppPhase.Running }, () => {
                            Statusbar.setStatusBarMessage("App loaded", 3000);
                        });

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
            Statusbar.setStatusBarMessage("App loaded", 3000);
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
            requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);
            this.arrangementPlayer.dispose();
            this.arrangementPlayer = undefined;
        }

        this.undoManager = undefined;

        // Clear status bar item references — they belong to the old (now-unmounted) Statusbar.
        this.statsItem = undefined;
        this.notificationItem = undefined;

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
                icon: <Icon src={Codicon.Organization} />,
            });
        } else {
            items.push({
                label: user?.displayName ?? user?.username ?? "",
                icon: <Icon src={Codicon.Account} />,
            });
        }

        if (user?.isAdmin) {
            items.push({
                label: "Users & Groups",
                icon: <Icon src={Codicon.Organization} />,
                onClick: () => {
                    this.userGroupEditorRef.current?.open();
                },
            });
            items.push({
                label: "Reset Backend",
                icon: <Icon src={Codicon.Server} />,
                onClick: () => {
                    void this.backendSetupDialogRef.current?.show({ mode: "admin" });
                },
            });
        } else if (user) {
            items.push({
                label: "My Groups",
                icon: <Icon src={Codicon.Organization} />,
                onClick: () => {
                    this.userGroupEditorRef.current?.open();
                },
            });
        }

        items.push({
            label: "Sign Out",
            icon: <Icon src={Codicon.SignOut} />,
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
                requisitions.unregister("timeParamsChanged", this.handleTimeParamsChange);

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

        this.undoManager = new UndoManager(this.dataModel);
        this.arrangementPlayer = new ArrangementPlayer(this.dataModel);
        requisitions.register("timeParamsChanged", this.handleTimeParamsChange);

        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()),
        );

        this.forceUpdate();

        const { phase } = this.state;
        if (phase === AppPhase.Running) {
            this.updateStatsItem();
        }
    }

    private initEventHandlers(): void {
        window.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });
        window.addEventListener("keyup", (event) => {
            this.handleKeyUp(event);
        });
    }

    private onSidebarEscape = (): void => {
        this.setState({ sidebarOpen: false });
    };

    private handleKeyDown(event: KeyboardEvent): void {
        // Ctrl/Cmd+P opens the print preview dialog instead of the native print dialog.
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "p") {
            event.preventDefault();
            this.openPrintDialog();

            return;
        }

        switch (event.key) {
            case "Escape": {
                Overlay.closeAllOverlays();
                this.services.selectionManager.clearSelection();

                break;
            }

            case "Alt": {
                event.preventDefault();

                break;
            }

            case "Backspace":
            case "Delete": {
                if (!(event.target instanceof HTMLInputElement)) {
                    this.undoManager?.edit({
                        type: "EditCommand_ArrangementClearSelection",
                        arrangement: this.dataModel.arrangement!,
                        clearSelection: new Map()
                    });
                    this.services.selectionManager.clearSelection();
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
        // No-op: previously reset deletePolyrhythmMode on Alt key up.
    }

    private onEditEnd = () => {
        this.setState({ editingTitle: false });
        this.justFinishedEditingTitle = true;
        setTimeout(() => {
            return this.justFinishedEditingTitle = false;
        }, 100);
    };

    private handleTimeParamsChange = (): Promise<boolean> => {
        this.forceUpdate();
        this.updateStatsItem();

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
        if (!this.arrangementPlayer) {
            return;
        }

        const metrics = this.arrangementPlayer.scoreMetrics;
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

    private handleNotificationStateChanged = (state: {
        newCount: number; totalCount: number; silent: boolean; showHistory: boolean;
    }): Promise<boolean> => {
        const { newCount, totalCount, silent, showHistory } = state;

        let text: string;
        let tooltip: string;

        if (showHistory) {
            tooltip = "Hide Notifications";
            text = silent ? "$(bell-slash)" : "$(bell)";
        } else {
            if (silent) {
                text = newCount === 0 ? "$(bell-slash)" : "$(bell-slash-dot)";
            } else {
                text = newCount === 0 ? "$(bell)" : "$(bell-dot)";
            }

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
                tooltip,
                command: "notifications:toggleHistory",
                alignment: StatusBarAlignment.Right,
                priority: 0,
            });
        } else {
            this.notificationItem.text = text;
            this.notificationItem.tooltip = tooltip;
        }

        return Promise.resolve(true);
    };

}
