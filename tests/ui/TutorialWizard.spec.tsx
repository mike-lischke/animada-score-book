/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import type { ITutorialStep } from "../../src/core/TutorialSteps.js";
import { TutorialWizard } from "../../src/ui/TutorialWizard.js";

const makeRect = (x: number, y: number, width: number, height: number): DOMRect => {
    return {
        x, y, width, height,
        left: x, top: y, right: x + width, bottom: y + height,
        toJSON: () => {
            return {};
        },
    } as DOMRect;
};

const createSteps = (): ITutorialStep[] => {
    return [
        {
            title: "Welcome",
            description: "Welcome to the tutorial.",
        },
        {
            title: "Score Library",
            targetSelector: "[data-tutorial=\"score-library\"]",
            markerShape: "circle",
            description: "Open the score library.",
        },
        {
            title: "Playback",
            targetSelector: "[data-tutorial=\"playback\"]",
            markerShape: "rect",
            description: "Control playback.",
        },
    ];
};

/* eslint-disable @typescript-eslint/dot-notation */
class TestableTutorialWizard extends TutorialWizard {
    public testHandleNext(): void {
        this["handleNext"]();
    }

    public testHandlePortalClose(): void {
        this["handlePortalClose"]();
    }

    public testSyncObserver(): void {
        this["syncObserver"]();
    }

    public testReadTargetRect(): void {
        this["readTargetRect"]();
    }

    public testCleanupObserver(): void {
        this["cleanupObserver"]();
    }

    public testClose(completed: boolean): void {
        this["close"](completed);
    }

    public testRenderMarker(step: ITutorialStep, rect: DOMRect) {
        return this["renderMarker"](step, rect);
    }

    public getTestState(): TutorialWizard["state"] {
        return this.state;
    }

    public setTestObservedElement(element: Element): void {
        this["observedElement"] = element;
    }
}
/* eslint-enable @typescript-eslint/dot-notation */

const installSynchronousSetState = (wizard: TestableTutorialWizard): void => {
    const instance = wizard as TestableTutorialWizard & {
        setState: (
            update: Partial<TutorialWizard["state"]>,
            callback?: () => void,
        ) => void;
    };

    instance.setState = ((
        update: Partial<TutorialWizard["state"]>,
        callback?: () => void,
    ) => {
        instance.state = { ...instance.state, ...update };
        callback?.();
    }) as typeof instance.setState;
};

describe.sequential("TutorialWizard", () => {
    const createWizard = (steps: ITutorialStep[]): TestableTutorialWizard => {
        const onClose = vi.fn();
        const onStepChange = vi.fn();
        const onTutorialEnabledChange = vi.fn();

        const wizard = new TestableTutorialWizard({
            steps,
            tutorialEnabled: true,
            onTutorialEnabledChange,
            onClose,
            onStepChange,
        });
        installSynchronousSetState(wizard);

        return wizard;
    };

    describe("navigation", () => {
        it("advances to the next step on handleNext", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            expect(wizard.getTestState().currentStep).toBe(0);

            wizard.testHandleNext();

            expect(wizard.getTestState().currentStep).toBe(1);
        });

        it("calls onClose with true when finishing the last step", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            // Advance to the last step.
            wizard.testHandleNext();
            wizard.testHandleNext();

            expect(wizard.getTestState().currentStep).toBe(2);

            const { onClose } = wizard.props;
            wizard.testHandleNext();

            expect(onClose).toHaveBeenCalledWith(true);
        });

        it("calls onStepChange when advancing", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            wizard.testHandleNext();

            expect(wizard.props.onStepChange).toHaveBeenCalledWith(1);
        });

        it("calls onClose with false when cancel is invoked", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            const { onClose } = wizard.props;

            onClose(false);

            expect(onClose).toHaveBeenCalledWith(false);
        });
    });

    describe("marker rendering", () => {
        it("returns a marker with circle class for markerShape circle", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);
            const step = steps[1];

            const rect = makeRect(100, 50, 40, 40);

            const element = wizard.testRenderMarker(step, rect) as { props: { class: string; }; };

            expect(element.props.class).toContain("tutorial-marker-circle");
            expect(element.props.class).not.toContain("tutorial-marker-rect");
        });

        it("returns a marker with rect class for markerShape rect", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);
            const step = steps[2];

            const rect = makeRect(100, 50, 200, 60);

            const element = wizard.testRenderMarker(step, rect) as { props: { class: string; }; };

            expect(element.props.class).toContain("tutorial-marker-rect");
            expect(element.props.class).not.toContain("tutorial-marker-circle");
        });

        it("positions circle marker centered on the target", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);
            const step = steps[1];

            const rect = makeRect(100, 50, 40, 40);

            const element = wizard.testRenderMarker(step, rect) as {
                props: { style: { left: string; top: string; width: string; height: string; }; };
            };

            const padding = 8;
            const expectedSize = 40 + (padding * 2);
            const expectedLeft = 100 + 20 - (expectedSize / 2);
            const expectedTop = 50 + 20 - (expectedSize / 2);

            expect(element.props.style.width).toBe(`${expectedSize}px`);
            expect(element.props.style.height).toBe(`${expectedSize}px`);
            expect(element.props.style.left).toBe(`${expectedLeft}px`);
            expect(element.props.style.top).toBe(`${expectedTop}px`);
        });

        it("positions rect marker matching the target dimensions", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);
            const step = steps[2];

            const rect = makeRect(100, 50, 200, 60);

            const element = wizard.testRenderMarker(step, rect) as {
                props: { style: { left: string; top: string; width: string; height: string; }; };
            };

            const padding = 8;
            const expectedWidth = 200 + (padding * 2);
            const expectedHeight = 60 + (padding * 2);
            const expectedLeft = 100 + 100 - (expectedWidth / 2);
            const expectedTop = 50 + 30 - (expectedHeight / 2);

            expect(element.props.style.width).toBe(`${expectedWidth}px`);
            expect(element.props.style.height).toBe(`${expectedHeight}px`);
            expect(element.props.style.left).toBe(`${expectedLeft}px`);
            expect(element.props.style.top).toBe(`${expectedTop}px`);
        });
    });

    describe("observer lifecycle", () => {
        it("sets targetRect to undefined when step has no targetSelector", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            // Step 0 has no targetSelector.
            wizard.testSyncObserver();

            expect(wizard.getTestState().targetRect).toBeUndefined();
        });

        it("sets targetRect when target element is found", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            // Advance to step 1 (has targetSelector).
            wizard.testHandleNext();

            const mockElement = {
                getBoundingClientRect: () => {
                    return makeRect(10, 20, 100, 50);
                },
            } as Element;

            vi.spyOn(document, "querySelector").mockReturnValue(mockElement);

            wizard.testSyncObserver();

            const state = wizard.getTestState();

            expect(state.targetRect).toBeDefined();
            expect(state.targetRect!.left).toBe(10);
            expect(state.targetRect!.top).toBe(20);
            expect(state.targetRect!.width).toBe(100);
            expect(state.targetRect!.height).toBe(50);
        });

        it("clears targetRect via cleanupObserver", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            // Set a fake targetRect via state.
            wizard.setState({ targetRect: makeRect(0, 0, 10, 10) });

            expect(wizard.getTestState().targetRect).toBeDefined();

            wizard.testCleanupObserver();

            expect(wizard.getTestState().targetRect).toBeUndefined();
        });

        it("does not update targetRect when observer is called with same rect", () => {
            const steps = createSteps();
            const wizard = createWizard(steps);

            const rect = makeRect(10, 20, 100, 50);

            wizard.setState({ targetRect: rect });

            const stateBefore = wizard.getTestState();

            // Simulate the observer callback with the same rect.
            wizard.setTestObservedElement({
                getBoundingClientRect: () => {
                    return rect;
                },
            } as Element);
            wizard.testReadTargetRect();

            const stateAfter = wizard.getTestState();

            // State should not have changed (same reference check passes).
            expect(stateAfter.targetRect).toBe(stateBefore.targetRect);
        });
    });
});
