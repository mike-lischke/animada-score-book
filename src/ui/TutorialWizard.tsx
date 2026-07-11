/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Component, ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Portal } from "../components/ui/framework/Portal.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";

import type { ITutorialStep } from "../core/TutorialSteps.js";

export interface ITutorialWizardProps {
    steps: ITutorialStep[];
    tutorialEnabled: boolean;
    onTutorialEnabledChange: (enabled: boolean) => void;
    onClose: (completed: boolean) => void;
    onStepChange?: (stepIndex: number) => void;
}

interface ITutorialWizardState {
    currentStep: number;
    targetRect?: DOMRect;
}

export class TutorialWizard extends Component<ITutorialWizardProps, ITutorialWizardState> {
    private portalRef = createRef<Portal>();
    private resizeObserver?: ResizeObserver;
    private observedElement?: Element;

    public constructor(props: ITutorialWizardProps) {
        super(props);

        this.state = {
            currentStep: 0,
        };
    }

    public override componentDidMount(): void {
        this.syncObserver();
        window.addEventListener("scroll", this.readTargetRect, { passive: true });
    }

    public override componentDidUpdate(_prevProps: ITutorialWizardProps, prevState: ITutorialWizardState): void {
        const { currentStep } = this.state;

        if (prevState.currentStep !== currentStep) {
            this.syncObserver();
        }
    }

    public override componentWillUnmount(): void {
        this.resizeObserver?.disconnect();
        window.removeEventListener("scroll", this.readTargetRect);
    }

    public render(): ComponentChild {
        const { steps } = this.props;
        const { currentStep, targetRect } = this.state;
        const isLastStep = currentStep >= steps.length - 1;
        const step = steps[currentStep];

        return (
            <Portal ref={this.portalRef} onClose={this.handlePortalClose}>
                {targetRect && this.renderMarker(step, targetRect)}
                <div class="tutorial-wizard tutorial-wizard-card">
                    {this.renderTopBar()}
                    <div class="tutorial-wizard-body">
                        {this.renderStepContent(step)}
                    </div>
                    {this.renderNavigation(isLastStep)}
                </div>
            </Portal>
        );
    }

    public open(): void {
        const { onStepChange } = this.props;

        this.setState({ currentStep: 0 }, () => {
            onStepChange?.(0);
            this.portalRef.current?.open({
                backgroundOpacity: 0,
                closeOnEscape: true,
                closeOnPortalClick: false,
            });
        });
    }

    public close(completed: boolean): void {
        this.cleanupObserver();
        this.portalRef.current?.close(!completed);
    }

    private cleanupObserver(): void {
        const { targetRect } = this.state;

        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.observedElement = undefined;
        if (targetRect) {
            this.setState({ targetRect: undefined });
        }
    }

    private syncObserver(): void {
        const { steps } = this.props;
        const { currentStep, targetRect } = this.state;
        const step = steps[currentStep];

        if (!step.targetSelector) {
            this.resizeObserver?.disconnect();
            this.observedElement = undefined;
            if (targetRect) {
                this.setState({ targetRect: undefined });
            }

            return;
        }

        const element = document.querySelector(step.targetSelector);
        if (element === this.observedElement) {
            this.readTargetRect();

            return;
        }

        this.resizeObserver?.disconnect();
        this.observedElement = element ?? undefined;

        if (element) {
            this.resizeObserver ??= new ResizeObserver(() => {
                this.readTargetRect();
            });

            this.resizeObserver.observe(element);
        }

        this.readTargetRect();
    }

    private readTargetRect = (): void => {
        if (!this.observedElement) {
            return;
        }

        const rect = this.observedElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const { targetRect: prev } = this.state;
        if (!prev) {
            this.setState({ targetRect: rect });

            return;
        }

        if (prev.left !== rect.left || prev.top !== rect.top
            || prev.width !== rect.width || prev.height !== rect.height) {
            this.setState({ targetRect: rect });
        }
    };

    private renderMarker(step: ITutorialStep, targetRect: DOMRect): ComponentChild {
        const padding = 8;
        const isRect = step.markerShape === "rect";

        let width: number;
        let height: number;

        if (isRect) {
            width = targetRect.width + (padding * 2);
            height = targetRect.height + (padding * 2);
        } else {
            const size = Math.max(targetRect.width, targetRect.height) + (padding * 2);
            width = size;
            height = size;
        }

        const left = targetRect.left + (targetRect.width / 2) - (width / 2);
        const top = targetRect.top + (targetRect.height / 2) - (height / 2);
        const shapeClass = isRect ? "tutorial-marker-rect" : "tutorial-marker-circle";

        return (
            <div
                class={`tutorial-marker ${shapeClass}`}
                style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                }}
            />
        );
    }

    private renderStepContent(step: ITutorialStep): ComponentChild {
        const { currentStep } = this.state;
        const { steps } = this.props;

        return (
            <Container orientation={Orientation.TopDown} className="tutorial-wizard-step">
                <div className="tutorial-wizard-step-number">
                    Step {currentStep + 1} of {steps.length}
                </div>
                <h2 className="tutorial-wizard-step-title">{step.title}</h2>
                <p className="tutorial-wizard-step-description">{step.description}</p>
            </Container>
        );
    }

    private renderTopBar(): ComponentChild {
        const { onClose } = this.props;

        return (
            <div class="tutorial-wizard-topbar">
                <Container
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    className="tutorial-wizard-topbar-left"
                >
                    <Icon src={Codicon.Lightbulb} className="tutorial-wizard-icon" />
                    <span class="tutorial-wizard-title">Tutorial</span>
                </Container>
                <Button
                    imageOnly
                    className="du-btn-ghost"
                    onClick={() => {
                        onClose(false);
                    }}
                >
                    <Icon src={Codicon.ChromeClose} />
                </Button>
            </div>
        );
    }

    private renderNavigation(isLastStep: boolean): ComponentChild {
        const { onClose, tutorialEnabled, onTutorialEnabledChange } = this.props;

        return (
            <div class="tutorial-wizard-navigation">
                <Container
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    className="tutorial-wizard-checkbox-area"
                >
                    <Checkbox
                        id="tutorialWizardEnabled"
                        checked={tutorialEnabled}
                        onChange={onTutorialEnabledChange}
                    />
                    <span class="tutorial-wizard-checkbox-label">Show on startup</span>
                </Container>
                <Container
                    orientation={Orientation.LeftToRight}
                    className="tutorial-wizard-nav-buttons"
                >
                    <Button
                        id="tutorialWizardCancel"
                        className="du-btn-ghost"
                        caption="Cancel"
                        onClick={() => {
                            onClose(false);
                        }}
                    />
                    <Button
                        id="tutorialWizardNext"
                        caption={isLastStep ? "Finish" : "Next"}
                        isDefault
                        onClick={this.handleNext}
                    />
                </Container>
            </div>
        );
    }

    private handleNext = (): void => {
        const { steps, onClose, onStepChange } = this.props;
        const { currentStep } = this.state;

        if (currentStep >= steps.length - 1) {
            onClose(true);

            return;
        }

        const nextStep = currentStep + 1;
        this.setState({ currentStep: nextStep }, () => {
            onStepChange?.(nextStep);
        });
    };

    private handlePortalClose = (): void => {
        this.cleanupObserver();
    };
}
