/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";

/** What a reload attempt found out. */
export enum ConfirmationReloadResult {
    /** The confirmation link has not been opened yet, so the installation still waits. */
    NotConfirmed,

    /** The operator is signed in and the application continues. */
    SignedIn,

    /** The credentials were refused, so the login dialog takes over. */
    LoginRequired,
}

export interface IEmailConfirmationDialogProperties extends ICommonUIProperties {
    /** The address the confirmation link was sent to. */
    email: string;

    /**
     * True on phones (viewport up to 600 px), which renders the narrow layout. Tablets and desktops use the wide
     * layout.
     */
    compact?: boolean;

    /** Whether a request is running, which disables the resend action. */
    loading?: boolean;

    /** The failure of the last request, if any. */
    errorMessage?: string;

    /** A neutral confirmation, such as the note that a new link went out. */
    notice?: string;

    /** Called when the operator asks for another link. */
    onResend: () => void;

    /**
     * Re-checks the installation after the operator confirmed the link. Without it the reload falls back to
     * reloading the document.
     */
    onReload?: () => Promise<ConfirmationReloadResult>;
}

interface IEmailConfirmationDialogState {
    reloading: boolean;

    /** What the last reload attempt found out, when it did not end the dialog. */
    reloadMessage: string;

    /** True right after the address was copied, which turns the copy button into a confirmation. */
    copied: boolean;

    /** True once the backend reports the administrator, so the first step is done and the second one is current. */
    confirmed: boolean;
}

/** The state of one step in the next-steps list, which decides its marker color and content. */
enum ConfirmationStepState {
    /** The step waits for the operator. */
    Pending = "pending",

    /** The step is the one to do now. */
    Active = "active",

    /** The step is done. */
    Done = "done",
}

/**
 * Tells the operator that a confirmation link is on its way, and that opening it finishes the installation. Phones
 * get a stacked sheet, tablets and desktops a wider layout with the steps side by side.
 */
export class EmailConfirmationDialog extends UIComponent<IEmailConfirmationDialogProperties,
    IEmailConfirmationDialogState> {
    /** How often the dialog asks whether the confirmation link was opened. */
    private static readonly confirmationPollInterval = 3000;

    private dialogRef = createRef<Dialog | null>();
    private copyTimer?: number;
    private confirmationTimer?: number;

    public constructor(props: IEmailConfirmationDialogProperties) {
        super(props);

        this.state = {
            reloading: false,
            reloadMessage: "",
            copied: false,
            confirmed: false,
        };
    }

    public override componentDidMount(): void {
        // The link is opened in a mail client, so the dialog watches the backend instead of the page.
        void this.checkConfirmation();
        this.confirmationTimer = window.setInterval(() => {
            void this.checkConfirmation();
        }, EmailConfirmationDialog.confirmationPollInterval);
    }

    public override componentWillUnmount(): void {
        if (this.copyTimer !== undefined) {
            window.clearTimeout(this.copyTimer);
            this.copyTimer = undefined;
        }

        this.stopConfirmationPolling();
    }

    public open(): void {
        this.dialogRef.current?.open();
    }

    public close(): void {
        this.dialogRef.current?.close(false);
    }

    public render(): ComponentChild {
        const { compact } = this.props;

        if (compact) {
            return this.renderCompact();
        }

        return this.renderWide();
    }

    /**
     * @returns The phone version: a hero signet, the address, the next steps and three stacked actions.
     */
    private renderCompact(): ComponentChild {
        return (
            <Dialog
                ref={this.dialogRef}
                id="emailConfirmationDialog"
                actions={this.renderCompactActions()}
            >
                <Container className="email-confirmation-compact" orientation={Orientation.TopDown} gap={16}>
                    {this.renderCompactHero()}
                    {this.renderCompactSteps()}
                    {this.renderCompactNote()}
                    {this.renderStatus()}
                </Container>
            </Dialog>
        );
    }

    /**
     * @returns The version for tablets and desktops: a header with the setup step, the recipient box, the steps next
     * to each other and one action row.
     */
    private renderWide(): ComponentChild {
        return (
            <Dialog
                ref={this.dialogRef}
                id="emailConfirmationDialog"
                actions={this.renderWideActions()}
            >
                <Container className="email-confirmation-wide" orientation={Orientation.TopDown} gap={20}>
                    {this.renderWideHeader()}
                    {this.renderWideRecipient()}
                    {this.renderWideSteps()}
                    {this.renderWideNote()}
                    {this.renderStatus()}
                </Container>
            </Dialog>
        );
    }

    private renderCompactHero(): ComponentChild {
        const { email } = this.props;

        return (
            <Container
                className="email-confirmation-hero"
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Center}
                gap={10}
            >
                <div className="email-confirmation-signet">
                    <Icon src={UIIcon.Mail} style={{ fontSize: "30px", color: "#ffffff" }} />
                    <span className="email-confirmation-badge">
                        <span className="email-confirmation-badge-ping" />
                        <Icon src={UIIcon.Check} />
                    </span>
                </div>
                <Label className="email-confirmation-title">Check your inbox</Label>
                <Label className="email-confirmation-subtitle" wrap>
                    We sent a confirmation link that creates the administrator account and finishes the setup.
                </Label>
                <span className="email-confirmation-address">
                    <span className="email-confirmation-address-at">@</span>
                    <Label>{email}</Label>
                </span>
            </Container>
        );
    }

    private renderCompactSteps(): ComponentChild {
        const { confirmed } = this.state;
        const firstStepState = confirmed ? ConfirmationStepState.Done : ConfirmationStepState.Active;
        const secondStepState = confirmed ? ConfirmationStepState.Active : ConfirmationStepState.Pending;

        return (
            <Container className="email-confirmation-steps" orientation={Orientation.TopDown} gap={12}>
                <Label className="email-confirmation-steps-caption">Next steps</Label>
                {this.renderStep(1, firstStepState, "Open the email and confirm",
                    "Click the confirmation link in the email to finish the installation.")}
                <div className="email-confirmation-divider" />
                {this.renderStep(2, secondStepState, "Reload this page",
                    "The app does not update itself. Reload the page once you have confirmed the link.")}
            </Container>
        );
    }

    /**
     * @param number The position of the step.
     * @param state What the step still needs, which picks the marker's color and content.
     * @param title The step's headline.
     * @param description The step's explanation.
     *
     * @returns One row of the phone version's next-steps card.
     */
    private renderStep(number: number, state: ConfirmationStepState, title: string,
        description: string): ComponentChild {
        const numberClass = `email-confirmation-step-number email-confirmation-step-number-${state}`;
        const marker = state === ConfirmationStepState.Done
            ? <Icon src={UIIcon.Check} width={14} height={14} />
            : number;

        return (
            <Container
                className="email-confirmation-step"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                gap={12}
            >
                <span className={numberClass}>{marker}</span>
                <Container
                    className="email-confirmation-step-text"
                    orientation={Orientation.TopDown}
                    gap={2}
                    style={{ flex: 1 }}
                >
                    <Label className="email-confirmation-step-title">{title}</Label>
                    <Label className="email-confirmation-step-description" wrap>{description}</Label>
                </Container>
            </Container>
        );
    }

    private renderCompactNote(): ComponentChild {
        return (
            <Container
                className="email-confirmation-note"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                gap={8}
            >
                <Icon src={UIIcon.Info} width={16} height={16} style={{ marginTop: "2px" }} />
                <Label className="email-confirmation-note-text" wrap>
                    <strong>Didn't receive the email?</strong>
                    {" "}
                    Resending creates a new link. The previous link stops working right away.
                </Label>
            </Container>
        );
    }

    private renderWideHeader(): ComponentChild {
        const { confirmed } = this.state;
        const dotClass = confirmed
            ? "email-confirmation-pending-dot email-confirmation-pending-dot-done"
            : "email-confirmation-pending-dot";
        const confirmationText = confirmed ? "Confirmed" : "Waiting for confirmation";

        return (
            <Container
                className="email-confirmation-wide-header"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                gap={24}
            >
                <div className="email-confirmation-signet email-confirmation-wide-signet">
                    <Icon src={UIIcon.Mail} style={{ fontSize: "30px", color: "#ffffff" }} />
                    <span className="email-confirmation-badge">
                        <span className="email-confirmation-badge-ping" />
                        <Icon src={UIIcon.Check} />
                    </span>
                </div>
                <Container
                    className="email-confirmation-wide-heading"
                    orientation={Orientation.TopDown}
                    gap={4}
                    style={{ flex: 1 }}
                >
                    <Container
                        className="email-confirmation-chips"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        gap={8}
                    >
                        <span className="email-confirmation-step-chip">Step 2 of 2 · Setup</span>
                        <span className="email-confirmation-pending">
                            <span className={dotClass} />
                            {confirmationText}
                        </span>
                    </Container>
                    <Label className="email-confirmation-wide-title">Check your inbox</Label>
                    <Label className="email-confirmation-wide-subtitle" wrap>
                        We sent a confirmation link that creates the administrator account and finishes the setup.
                    </Label>
                </Container>
            </Container>
        );
    }

    private renderWideRecipient(): ComponentChild {
        const { email } = this.props;
        const { copied } = this.state;
        const copyIcon = copied ? UIIcon.Check : UIIcon.Copy;

        return (
            <Container
                className="email-confirmation-recipient"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                gap={12}
            >
                <span className="email-confirmation-recipient-icon">@</span>
                <Container
                    className="email-confirmation-recipient-text"
                    orientation={Orientation.TopDown}
                    gap={2}
                    style={{ flex: 1, minWidth: 0 }}
                >
                    <Label className="email-confirmation-recipient-label">Recipient address</Label>
                    <Label className="email-confirmation-recipient-address">{email}</Label>
                </Container>
                <Button
                    id="email-confirmation-copy"
                    className="email-confirmation-copy"
                    onClick={this.handleCopy}
                >
                    <Icon src={copyIcon} width={16} height={16} />
                    {copied ? "Copied" : "Copy"}
                </Button>
            </Container>
        );
    }

    private renderWideSteps(): ComponentChild {
        const { confirmed } = this.state;
        const firstStepState = confirmed ? ConfirmationStepState.Done : ConfirmationStepState.Active;
        const secondStepState = confirmed ? ConfirmationStepState.Active : ConfirmationStepState.Pending;

        const firstStep = this.renderWideStep(1, firstStepState, "Open the email and confirm",
            "Click the confirmation link in the email to finish the installation.", UIIcon.OpenInNew);
        const secondStep = this.renderWideStep(2, secondStepState, "Reload this page",
            "The app does not update itself. Reload the page once you have confirmed the link.", UIIcon.Sync);

        return (
            <Container className="email-confirmation-wide-steps" orientation={Orientation.TopDown} gap={10}>
                <Container
                    className="email-confirmation-wide-steps-heading"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={8}
                >
                    <Icon src={UIIcon.CheckAll} width={18} height={18} />
                    Next steps
                </Container>
                <Container
                    className="email-confirmation-step-cards"
                    orientation={Orientation.LeftToRight}
                    gap={12}
                >
                    {firstStep}
                    {secondStep}
                </Container>
            </Container>
        );
    }

    /**
     * @param number The position of the step.
     * @param state What the step still needs, which picks the marker's color and content.
     * @param title The step's headline.
     * @param description The step's explanation.
     * @param icon The icon that illustrates the step.
     *
     * @returns One card of the wide version's next-steps row.
     */
    private renderWideStep(number: number, state: ConfirmationStepState, title: string, description: string,
        icon: UIIcon): ComponentChild {
        const numberClass = `email-confirmation-card-number email-confirmation-card-number-${state}`;
        const iconClass = `email-confirmation-card-icon email-confirmation-card-icon-${state}`;
        const marker = state === ConfirmationStepState.Done
            ? <Icon src={UIIcon.Check} width={16} height={16} />
            : number;

        return (
            <Container
                className="email-confirmation-card"
                orientation={Orientation.TopDown}
                gap={10}
                style={{ flex: 1 }}
            >
                <Container
                    className="email-confirmation-card-head"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    style={{ justifyContent: "space-between" }}
                >
                    <span className={numberClass}>{marker}</span>
                    <span className={iconClass}>
                        <Icon src={icon} width={20} height={20} />
                    </span>
                </Container>
                <Label className="email-confirmation-card-title">{title}</Label>
                <Label className="email-confirmation-card-description" wrap>{description}</Label>
            </Container>
        );
    }

    private renderWideNote(): ComponentChild {
        return (
            <Container
                className="email-confirmation-wide-note"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Start}
                gap={12}
            >
                <span className="email-confirmation-wide-note-icon">
                    <Icon src={UIIcon.Info} width={18} height={18} />
                </span>
                <Container
                    className="email-confirmation-wide-note-text"
                    orientation={Orientation.TopDown}
                    gap={2}
                    style={{ flex: 1 }}
                >
                    <Label className="email-confirmation-wide-note-title">Didn't receive the email?</Label>
                    <Label className="email-confirmation-wide-note-body" wrap>
                        Resending creates a new link. The previous link stops working right away. Also check your spam
                        folder.
                    </Label>
                </Container>
            </Container>
        );
    }

    /**
     * @returns The notice or the failure of the last request, or nothing when there is neither.
     */
    private renderStatus(): ComponentChild {
        const { errorMessage, notice } = this.props;
        const { reloadMessage } = this.state;

        if (errorMessage) {
            return <Label className="email-confirmation-status email-confirmation-status-error" caption={errorMessage}
                wrap />;
        }

        if (reloadMessage) {
            return <Label className="email-confirmation-status" caption={reloadMessage} wrap />;
        }

        if (notice) {
            return <Label className="email-confirmation-status email-confirmation-status-success" caption={notice}
                wrap />;
        }

        return undefined;
    }

    private renderCompactActions(): ComponentChild[] {
        const { loading } = this.props;
        const { reloading } = this.state;

        return [
            <Container key="actions" className="email-confirmation-actions" orientation={Orientation.TopDown} gap={8}>
                <Button
                    id="email-confirmation-reload"
                    isDefault
                    disabled={reloading}
                    onClick={this.handleReloadClick}
                >
                    <Icon src={UIIcon.Sync} width={16} height={16} />
                    {reloading ? "Checking…" : "Reload page"}
                </Button>
                <Button
                    id="email-confirmation-mail"
                    onClick={this.handleOpenMailApp}
                >
                    <Icon src={UIIcon.Mail} width={16} height={16} />
                    Open mail app
                </Button>
                <Button
                    id="email-confirmation-resend"
                    plain
                    className="email-confirmation-resend"
                    disabled={loading}
                    onClick={this.handleResend}
                >
                    <Icon src={UIIcon.Send} width={14} height={14} />
                    Resend link
                </Button>
            </Container>,
        ];
    }

    private renderWideActions(): ComponentChild[] {
        const { loading } = this.props;
        const { reloading } = this.state;

        const secondaryActions = (
            <Container
                key="secondary"
                className="email-confirmation-actions-left"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                gap={8}
            >
                <Button
                    id="email-confirmation-mail"
                    onClick={this.handleOpenMailApp}
                >
                    <Icon src={UIIcon.Mail} width={16} height={16} />
                    Open mail app
                </Button>
                <Button
                    id="email-confirmation-resend"
                    plain
                    className="email-confirmation-resend"
                    disabled={loading}
                    onClick={this.handleResend}
                >
                    <Icon src={UIIcon.Send} width={14} height={14} />
                    Resend link
                </Button>
            </Container>
        );

        const primaryAction = (
            <Button
                key="primary"
                id="email-confirmation-reload"
                isDefault
                disabled={reloading}
                onClick={this.handleReloadClick}
            >
                <Icon src={UIIcon.Sync} width={16} height={16} />
                {reloading ? "Checking…" : "Reload page"}
            </Button>
        );

        return [
            <Container
                key="actions"
                className="email-confirmation-actions-wide"
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.SpaceBetween}
                crossAlignment={ChildAlignment.Center}
                gap={12}
            >
                {secondaryActions}
                {primaryAction}
            </Container>,
        ];
    }

    private handleCopy = (): void => {
        const { email } = this.props;

        void navigator.clipboard.writeText(email).then(() => {
            this.setState({ copied: true });

            if (this.copyTimer !== undefined) {
                window.clearTimeout(this.copyTimer);
            }

            this.copyTimer = window.setTimeout(() => {
                this.copyTimer = undefined;
                this.setState({ copied: false });
            }, 2500);
        }).catch(() => {
            // A refused clipboard leaves the button unchanged; selecting the address still works.
        });
    };

    private handleResend = (): void => {
        this.setState({ reloadMessage: "" });
        this.props.onResend();
    };

    private handleReloadClick = (): void => {
        void this.handleReload();
    };

    private handleReload = async (): Promise<void> => {
        const { onReload } = this.props;
        const { reloading } = this.state;

        if (reloading) {
            return;
        }

        if (!onReload) {
            window.location.reload();

            return;
        }

        this.setState({ reloading: true, reloadMessage: "" });

        let message = "";
        try {
            const result = await onReload();
            if (result === ConfirmationReloadResult.NotConfirmed) {
                message = "The link has not been opened yet. Open it in your inbox, then reload again.";
            }
        } catch {
            message = "Reloading failed. Check your connection and try again.";
        }

        this.setState({ reloading: false, reloadMessage: message });
    };

    private handleOpenMailApp = (): void => {
        const { email } = this.props;

        window.location.href = `mailto:${email}`;
    };

    /**
     * Asks the backend whether the administrator exists, which means the confirmation link was opened. The dialog
     * then marks the first step as done and the second one as the one to do now.
     */
    private async checkConfirmation(): Promise<void> {
        if (this.state.confirmed) {
            return;
        }

        try {
            const res = await fetch("/api?action=health");
            const health = await res.json() as { hasUsers?: boolean; };

            if (health.hasUsers === true) {
                this.stopConfirmationPolling();
                this.setState({ confirmed: true, reloadMessage: "" });
            }
        } catch {
            // The backend is unreachable; the next tick tries again.
        }
    }

    private stopConfirmationPolling(): void {
        if (this.confirmationTimer !== undefined) {
            window.clearInterval(this.confirmationTimer);
            this.confirmationTimer = undefined;
        }
    }
}
