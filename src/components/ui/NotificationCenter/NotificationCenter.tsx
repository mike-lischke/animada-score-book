/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild, type RefObject } from "preact";

import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export enum NotificationType {
    Information,
    Warning,
    Error,
}

/** A collection of values to show as a message. */
export interface INotification {
    /** The type of message to show. */
    type: NotificationType;

    /** The text of the message. */
    text: string;

    /**
     * A value in milliseconds after which the message toast is removed. Only valid for message types other than
     * error and warning.
     */
    timeout?: number;

    /** Values to show as buttons below the text. */
    items?: string[];
}

/** The base interface for all toasts. There are extended variants for the main list and the history. */
interface INotificationToast {
    /** Used to uniquely identify the toast for rendering and among lists. */
    id: number;

    details: INotification;

    /** Used when removing the toast. First it is hidden and in a second step it is removed from the list. */
    state: "normal" | "adding" | "removing";

    ref: RefObject<HTMLDivElement>;

    /** The resolver to call when the toast is closed. */
    resolve: (value: string | undefined) => void;
}

interface IHistoryToast extends INotificationToast {
    /** True if the toast has never been acted upon (no user action, not displayed in the history yet). */
    isNew: boolean;
}

/** Only used in the main list for auto-closing a toast. */
interface ITimedToast extends INotificationToast {
    /** Used to auto-hide the toast. */
    timer?: ReturnType<typeof setTimeout>;
}

interface INotificationCenterState {
    mainList: ITimedToast[];

    /**
     * A list of toasts that were automatically hidden because the user did not act on them. The user can later show
     * missed messages and act on them, if needed.
     *
     * Previous messages remain in this list until the list is cleared or the user took action on them.
     */
    history: IHistoryToast[];

    /** Show the history list instead of the live list. */
    showHistory: boolean;

    /** Don't show notifications other than in the history list and errors. */
    silent: boolean;
}

const singleton = createRef<NotificationCenter>();

/**
 * A class for displaying unobtrusive messages to the user. It also allows the user to dismiss the message
 * and to ask simple yes/no questions. Use this whenever you need to inform the user about something that is not
 * critical to the current task.
 *
 * For critical messages use the (modal) `Dialog` class.
 */
export class NotificationCenter extends UIComponent<ICommonUIProperties, INotificationCenterState> {
    private static typeToIconMap = new Map<NotificationType, UIIcon>([
        [NotificationType.Error, UIIcon.Error],
        [NotificationType.Information, UIIcon.Info],
        [NotificationType.Warning, UIIcon.Warning],
    ]);
    private static nextToastId = 0;

    private autoHideTimeout = 15000; // 15 seconds to hide any unhandled message.
    private containerRef = createRef<HTMLDivElement>();

    public constructor(props: ICommonUIProperties) {
        super(props);
        this.state = {
            mainList: [],
            history: [],
            showHistory: false,
            silent: false,
        };
    }

    public static showInfo(text: string): Promise<string | undefined> {
        return singleton.current!.showNotification({
            type: NotificationType.Information,
            text,
        });
    }

    public static showWarning(text: string): Promise<string | undefined> {
        return singleton.current!.showNotification({
            type: NotificationType.Warning,
            text,
        });
    }

    public static showError(text: string): Promise<string | undefined> {
        return singleton.current!.showNotification({
            type: NotificationType.Error,
            text,
        });
    }

    public override componentDidMount(): void {
        document.addEventListener("keydown", this.handleKeyDown);
        requisitions.register("statusBarItemClicked", this.statusBarButtonClick);
        requisitions.register("showInfo", this.handleShowInfo);
        requisitions.register("showWarning", this.handleShowWarning);
        requisitions.register("showError", this.handleShowError);

        this.updateStatusBarItem();
    }

    public override componentWillUnmount(): void {
        document.removeEventListener("keydown", this.handleKeyDown);
        requisitions.unregister("statusBarItemClicked", this.statusBarButtonClick);
        requisitions.unregister("showInfo", this.handleShowInfo);
        requisitions.unregister("showWarning", this.handleShowWarning);
        requisitions.unregister("showError", this.handleShowError);
    }

    public render(): ComponentChild {
        const { showHistory } = this.state;

        const className = this.generateFinalClassName([
            "notificationCenter",
            this.classFromProperty(showHistory, "history"),
        ]);

        let content;
        if (showHistory) {
            content = this.renderHistory();
        } else {
            content = this.renderMainToasts();
        }

        return (
            <Container
                innerRef={this.containerRef}
                className={className}
                orientation={Orientation.TopDown}
            >
                {content}
            </Container>
        );
    }

    public showNotification(details: INotification): Promise<string | undefined> {
        return new Promise((resolve) => {
            this.addToast(details, resolve);
        });
    }

    public toggleHistory = (): void => {
        const { history, showHistory } = this.state;

        if (!showHistory) {
            for (const toast of history) {
                toast.isNew = false;
            }
        }

        this.setState({ history, showHistory: !showHistory }, () => {
            this.updateStatusBarItem();
        });
    };

    /**
     * Resolves and removes all stored messages.
     */
    public clearHistory = (): void => {
        const { history, mainList } = this.state;
        const historyIds = new Set(history.map((toast) => {
            return toast.id;
        }));

        for (const toast of history) {
            toast.resolve(undefined);
        }

        // Also remove corresponding entries from the main list, clearing any pending timers.
        const newMainList = mainList.filter((toast) => {
            if (historyIds.has(toast.id)) {
                if (toast.timer) {
                    clearTimeout(toast.timer);
                }

                return false;
            }

            return true;
        });

        this.setState({ history: [], mainList: newMainList }, () => {
            this.updateStatusBarItem();
        });
    };

    private renderMainToasts(): ComponentChild {
        const { mainList } = this.state;

        return mainList.map((toast) => {
            const details = toast.details;
            const toastClassName = this.generateFinalClassName([
                "toast",
                this.classFromProperty(details.type, [
                    "info", "warning", "error",
                ]),
                toast.state,
            ]);

            let margin: number | undefined;
            if (toast.state === "removing" && toast.ref.current) {
                margin = -toast.ref.current.offsetHeight;
            }

            const buttons = details.items?.map((item, index) => {
                return (
                    <Button
                        key={index}
                        className="itemButton"
                        caption={item}
                        isDefault={index === 0}
                        onClick={this.closeToast.bind(this, toast, item)}
                    />
                );
            }) ?? [];

            return (
                <Container
                    key={toast.id}
                    innerRef={toast.ref}
                    className={toastClassName}
                    orientation={Orientation.TopDown}
                    style={{ marginBottom: margin }}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Icon src={NotificationCenter.typeToIconMap.get(details.type)} />
                        <Label caption={details.text} wrap />
                        <Button
                            className="closeButton"
                            imageOnly
                            onClick={this.closeToast.bind(this, toast, undefined)}
                        >
                            <Icon src={UIIcon.Close} />
                        </Button>
                    </Container>
                    {buttons.length > 0 && (
                        <Container
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.End}
                        >
                            {buttons}
                        </Container>
                    )}
                </Container>
            );
        });
    }

    private renderHistory(): ComponentChild {
        const { history } = this.state;

        const newlyAdded = history.filter((toast) => {
            return toast.isNew;
        }).length;
        let caption = "";
        if (history.length === 0) {
            caption = "NO NOTIFICATIONS";
        } else if (newlyAdded === 0) {
            caption = "NO NEW NOTIFICATIONS";
        } else {
            caption = `${newlyAdded} NEW NOTIFICATION${newlyAdded > 1 ? "S" : ""}`;
        }

        const header = (
            <Container
                id="historyHeader"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <Label caption={caption} />
                <Button
                    imageOnly
                    data-tooltip="Clear All Notifications"
                    onClick={this.clearHistory}
                >
                    <Icon data-tooltip="inherit" className="actionIcon" src={UIIcon.ClearAll} />
                </Button>
                <Button
                    imageOnly
                    data-tooltip="Toggle Do Not Disturb Mode"
                    onClick={this.toggleSilentMode}
                >
                    <Icon data-tooltip="inherit" className="actionIcon" src={UIIcon.BellSlash} />
                </Button>
                <Button
                    imageOnly
                    onClick={this.toggleHistory}
                    data-tooltip="Hide Notifications (Escape)"
                >
                    <Icon data-tooltip="inherit" className="actionIcon" src={UIIcon.ChevronDown} />
                </Button>
            </Container>
        );

        const content = history.map((toast) => {
            const details = toast.details;
            const toastClassName = this.generateFinalClassName([
                "toast",
                this.classFromProperty(details.type, [
                    "info", "warning", "error",
                ]),
                toast.state,
            ]);

            const buttons = details.items?.map((item, index) => {
                return (
                    <Button
                        key={index}
                        className="itemButton"
                        caption={item}
                        isDefault={index === 0}
                        onClick={this.closeToast.bind(this, toast, item)}
                    />
                );
            }) ?? [];

            return (
                <Container
                    key={toast.id}
                    innerRef={toast.ref}
                    className={toastClassName}
                    orientation={Orientation.TopDown}
                >
                    <Container
                        orientation={Orientation.LeftToRight}
                    >
                        <Icon src={NotificationCenter.typeToIconMap.get(details.type)} />
                        <Label caption={details.text} wrap />
                        <Button
                            className="closeButton"
                            imageOnly
                            onClick={this.closeToast.bind(this, toast, undefined)}
                        >
                            <Icon src={UIIcon.Close} />
                        </Button>
                    </Container>
                    {buttons.length > 0 && (
                        <Container
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.End}
                        >
                            {buttons}
                        </Container>
                    )}
                </Container>
            );
        });

        return [
            header,
            <Container
                id="historyContainer"
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
            >
                {content}
            </Container>,
        ];
    }

    private toggleSilentMode = (): void => {
        const { silent } = this.state;
        this.setState({ silent: !silent }, () => {
            this.updateStatusBarItem();
        });
    };

    /**
     * Adding a toast not only involves adding it to the lists, but also animating it into view.
     *
     * @param details The details of the toast to add.
     * @param resolve The resolver to call when the toast is closed.
     */
    private addToast(details: INotification, resolve: (value: string | undefined) => void): void {
        const { mainList, history, showHistory, silent } = this.state;

        // We need two separate toasts, linked by the same id.
        const historyToast: IHistoryToast = {
            id: NotificationCenter.nextToastId++,
            isNew: true,
            details,
            state: "normal",
            ref: createRef<HTMLDivElement>(),
            resolve,
        };
        history.unshift(historyToast);

        // Error messages are always shown, even in silent mode.
        if (!silent || details.type === NotificationType.Error) {
            const timedToast: ITimedToast = {
                id: historyToast.id,
                details,
                state: "adding",
                ref: createRef<HTMLDivElement>(),
                resolve,
            };

            // Toasts with items or warnings and errors have a longer auto-hide timeout.
            if (details.type !== NotificationType.Error && details.type !== NotificationType.Warning
                && details.items === undefined) {
                timedToast.timer = setTimeout(() => {
                    this.closeToast(timedToast, undefined);
                }, details.timeout ?? 5000);
            } else {
                timedToast.timer = setTimeout(() => {
                    this.hideToast(timedToast);
                }, this.autoHideTimeout);
            }

            mainList.unshift(timedToast);
            if (mainList.length > 3) {
                const toast = mainList.pop();
                if (toast?.timer) {
                    clearTimeout(toast.timer);
                }
            }

            // Add the new toast to the list and trigger a re-render to bring the toast to the screen,
            // but in a hidden state so we can get its height.
            this.setState({ mainList }, () => {
                this.updateStatusBarItem();

                // Rendering of the new toast is done. Now we can animate it.
                const toast = mainList[0];

                if (toast.ref.current) {
                    // Make the toast part of the normal rendering flow and set its start position.
                    toast.ref.current.style.marginBottom = `-${toast.ref.current.offsetHeight}px`;
                    toast.ref.current.classList.remove("adding");

                    setTimeout(() => {
                        // Need a timeout to let the browser render the toast in its new position.
                        // Once done remove the manual margin and let it render normally, which will
                        // animate the toast to its final position.
                        if (toast.ref.current) {
                            toast.ref.current.style.marginBottom = "";
                            toast.state = "normal";
                            this.forceUpdate();
                        }
                    }, 0);
                }
            });
        } else {
            this.updateStatusBarItem();
            if (showHistory) {
                this.forceUpdate();
            }
        }
    }

    /**
     * Called when the user did not act on the toast and its timeout has expired. The toasts are removed
     * from the main list but kept in the history list.
     *
     * @param toast The toast to hide.
     */
    private hideToast(toast: ITimedToast): void {
        clearTimeout(toast.timer);
        toast.timer = undefined;

        toast.state = "removing";
        toast.ref.current?.addEventListener("animationend", () => {
            const { mainList } = this.state;

            const index = mainList.indexOf(toast);
            mainList.splice(index, 1);

            toast.state = "normal";

            this.setState({ mainList });
        }, { once: true });

        this.forceUpdate();
    }

    /**
     * Resolves the promise of the toast and removes the toast from the main list and the history.
     *
     * @param toast The toast to close.
     * @param value The value to resolve the promise with.
     */
    private closeToast(toast: INotificationToast, value: string | undefined): void {
        const { showHistory, mainList } = this.state;

        const hasTimer = "timer" in toast;
        if (hasTimer) {
            clearTimeout((toast as ITimedToast).timer);
        }

        // Remove the item from the lists, either directly (if the history is shown) or after the animation.
        const remove = (): void => {
            const { mainList: ml, history } = this.state;

            let index = history.findIndex((item) => {
                return item.id === toast.id;
            });
            if (index > -1) {
                history.splice(index, 1);
            }

            index = ml.findIndex((item) => {
                return item.id === toast.id;
            });
            if (index > -1) {
                ml.splice(index, 1);
            }

            toast.resolve(value);

            this.setState({ mainList: ml, history }, () => {
                this.updateStatusBarItem();
            });
        };

        toast.state = "removing";

        if (showHistory) {
            remove();
        } else {
            toast.ref.current?.addEventListener("animationend", () => {
                remove();
            }, { once: true });
            this.setState({ mainList });
        }
    }

    /**
     * A handler for global key down. We are only interested in the escape key to close the first open toast.
     *
     * @param e The keyboard event.
     */
    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            const { mainList, showHistory } = this.state;
            if (showHistory) {
                this.setState({ showHistory: false });
            } else if (mainList.length > 0) {
                this.hideToast(mainList[0]);
            }
        }
    };

    private updateStatusBarItem(): void {
        const { history, silent, showHistory } = this.state;
        const newCount = history.filter((toast) => {
            return toast.isNew;
        }).length;

        void requisitions.execute("notificationStateChanged", {
            newCount,
            totalCount: history.length,
            silent,
            showHistory,
        });
    }

    private statusBarButtonClick = (
        data: { command: string; event: MouseEvent | KeyboardEvent; }): Promise<boolean> => {
        if (data.command === "notifications:toggleHistory") {
            this.toggleHistory();

            return Promise.resolve(true);
        }

        return Promise.resolve(false);
    };

    private handleShowInfo = (text: string): Promise<boolean> => {
        void this.showNotification({
            type: NotificationType.Information,
            text,
        });

        return Promise.resolve(true);
    };

    private handleShowWarning = (text: string): Promise<boolean> => {
        void this.showNotification({
            type: NotificationType.Warning,
            text,
        });

        return Promise.resolve(true);
    };

    private handleShowError = (text: string): Promise<boolean> => {
        void this.showNotification({
            type: NotificationType.Error,
            text,
        });

        return Promise.resolve(true);
    };
}

/**
 * Renders the NotificationCenter component and assigns the singleton ref.
 *
 * @returns The NotificationCenter component.
 */
export const renderNotificationCenter = (): ComponentChild => {
    return <NotificationCenter ref={singleton} />;
};
