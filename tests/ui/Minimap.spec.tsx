/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Minimap, type IVisibleBarRange } from "../../src/components/ui/Minimap/Minimap.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmNoteEvent, type ISbDmTimeParams,
    type ISbDmTrack, type ISbDmTrackMeasure
} from "../../src/core/ScoreBookDataModel.js";
import type { IScoreMetrics } from "../../src/player/TimeCoordinator.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import type { SelectionManager } from "../../src/ui/SelectionManager.js";

/**
 * Creates a minimal mock ISbDmTimeParams for testing.
 *
 * @param length The number of bars in the arrangement.
 * @returns A mocked time params object.
 */
const makeTimeParams = (length: number): ISbDmTimeParams => {
    return {
        timeSignature: "4/4",
        tempo: 120,
        length,
        pulse: "1/4",
        stepResolution: 8,
        timings: Array(length).fill(null).map((_, i) => {
            return {
                bar: i + 1,
                step: 1,
            };
        }),
        isValid: () => {
            return true;
        },
    };
};

/**
 * Creates a minimal mock ISbDmTrack for testing.
 *
 * @param arrangement The parent arrangement.
 * @returns A mocked track object.
 */
const makeTrack = (arrangement: ISbDmArrangement): ISbDmTrack => {
    return {
        type: SbDmEntityType.Track,
        id: 1,
        name: "Test Track",
        volume: 1,
        effectiveVolume: 1,
        arrangement,
        instrument: {
            type: SbDmEntityType.Instrument,
            id: 1,
            typeId: "inst",
            displayOrder: 0,
            displayName: "Test Instrument",
            image: {
                type: SbDmEntityType.InstrumentImage,
                id: 1,
                filePath: "test.png",
            },
            color: "blue",
            state: {
                initialized: true,
                isLeaf: true,
                expanded: false,
                expandedOnce: false,
            },
            noteStyles: {},
            range: [21, 108],
        },
        measures: [],
        clear: vi.fn(),
        getNoteAt: () => {
            return undefined;
        },
        get notes() {
            return (function* () {
                // Empty iterator for test.
            })();
        },
    };
};

const makePolyrhythmFixture = (
    track: ISbDmTrack,
): { measure: ISbDmTrackMeasure; } => {
    const event = {
        type: SbDmEntityType.NoteEvent,
        id: 11,
        measureNumber: 1,
        start: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 8 },
        track,
        timing: { bar: 1, step: 1 },
        audioData: {
            id: "1",
            audioBuffer: null,
            instrument: track.instrument,
        },
    } as ISbDmNoteEvent;

    const measure = {
        type: SbDmEntityType.TrackMeasure,
        id: 13,
        number: 1,
        meter: {
            beats: 4,
            beatUnits: 4,
            stepResolution: 8,
            beatGroups: [2, 2, 2, 2],
        },
        steps: Array.from({ length: 8 }, (_, index) => {
            return { index, noteStyleId: index === 0 ? "1" : undefined };
        }),
        subdivisions: [],
        events: [event],
    } as ISbDmTrackMeasure;

    return { measure };
};

/**
 * Creates a minimal mock ISbDmArrangement for testing.
 *
 * @param barCount The number of bars in the arrangement.
 * @param trackCount The number of tracks in the arrangement.
 * @returns A mocked arrangement object.
 */
const makeArrangement = (barCount: number, trackCount: number): ISbDmArrangement => {
    const timeParams = makeTimeParams(barCount);
    const arrangement: ISbDmArrangement = {
        type: SbDmEntityType.Arrangement,
        id: 1,
        title: "Test Arrangement",
        tracks: [],
        timeParams,
        mainVolume: 100,
        loop: false,
        useMetronome: false,
        countIn: false,
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        applyArrangementSnapshot: vi.fn(),
        measureLabels: {},
    };

    // Add tracks after arrangement is created
    arrangement.tracks = Array(trackCount).fill(null).map((_, i) => {
        const track = makeTrack(arrangement);
        (track as { id: number; }).id = i + 1;
        (track as { name: string; }).name = `Track ${i + 1}`;

        return track;
    });

    return arrangement;
};

/**
 * Creates a minimal mock IScoreMetrics for testing.
 *
 * @returns A mocked score metrics object.
 */
const makeScoreMetrics = (): IScoreMetrics => {
    return {
        realTimeLength: 60,
        secondsPerBar: 2,
        secondsPerStep: 0.25,
        bars: 8,
        beatsPerBar: 4,
        beatUnit: 4,
        pulsesPerBar: 4,
        stepsPerBar: 8,
        beatGroups: [2, 2, 2, 2],
        stepsPerPulse: 2,
    };
};

class TestableMinimap extends Minimap {
    public setSelectionState(_active: boolean): void {
        // Selection range was removed from Minimap — no-op.
    }

    public installViewportDom(dom: {
        scrollHost: HTMLDivElement;
        contentHost: HTMLDivElement;
        marker: HTMLDivElement;
        viewportLabel: HTMLDivElement;
        barNumber: HTMLSpanElement;
    }): void {
        // @ts-expect-error, because we are accessing a private field.
        this.minimapScrollHostRef.current = dom.scrollHost;
        // @ts-expect-error, because we are accessing a private field.
        this.contentHostRef.current = dom.contentHost;
        // @ts-expect-error, because we are accessing a private field.
        this.viewportMarkerRef.current = dom.marker;
        // @ts-expect-error, because we are accessing a private field.
        this.viewportLabelRef.current = dom.viewportLabel;
        // @ts-expect-error, because we are accessing a private field.
        this.barNumberRef.current = dom.barNumber;

        // viewportDomRefs is a cached snapshot built in refreshViewportDomRefs(). We update it directly so
        // that handleTrackViewerScrolled sees the test elements instead of the stale render-time refs.
        // @ts-expect-error, because we are accessing a private field.
        this.viewportDomRefs = {
            minimapScrollHost: dom.scrollHost,
            minimapContentHost: dom.contentHost,
            marker: dom.marker,
            viewportLabel: dom.viewportLabel,
            barNumber: dom.barNumber,
        };
    }
}

describe.sequential("Minimap (component)", () => {
    let result: RenderResult | null;
    let arrangement: ISbDmArrangement;
    let scoreMetrics: IScoreMetrics;
    let minimapRef: TestableMinimap | null;

    const selectionManagerMock: SelectionManager = {
        registerHitTester: vi.fn(),
        unregisterHitTester: vi.fn(),
    } as unknown as SelectionManager;

    const renderMinimap = (
        props: { arrangement?: ISbDmArrangement; onViewportMoved?: (position: number) => void; } = {}): void => {
        minimapRef = null;

        result = render(
            <TestableMinimap
                ref={(instance: TestableMinimap | null) => {
                    minimapRef = instance;
                }}
                arrangement={props.arrangement ?? arrangement}
                scoreMetrics={scoreMetrics}
                onViewportMoved={props.onViewportMoved}
                selectionManager={selectionManagerMock}
            />
        );

        expect(minimapRef).toBeTruthy();
    };

    const getMinimap = (): TestableMinimap => {
        expect(minimapRef).toBeTruthy();

        return minimapRef!;
    };

    const createViewportDom = (): {
        scrollHost: HTMLDivElement;
        contentHost: HTMLDivElement;
        marker: HTMLDivElement;
        viewportLabel: HTMLDivElement;
        barNumber: HTMLSpanElement;
    } => {
        const scrollHost = document.createElement("div");
        const contentHost = document.createElement("div");
        const marker = document.createElement("div");
        const viewportLabel = document.createElement("div");
        const barNumber = document.createElement("span");

        Object.defineProperty(scrollHost, "clientWidth", {
            configurable: true,
            value: 200,
        });
        Object.defineProperty(scrollHost, "scrollWidth", {
            configurable: true,
            value: 1000,
        });

        scrollHost.getBoundingClientRect = (() => {
            return {
                left: 0,
                top: 0,
                right: 200,
                bottom: 40,
                width: 200,
                height: 40,
                x: 0,
                y: 0,
                toJSON: () => {
                    return {};
                },
            } as DOMRect;
        });

        contentHost.getBoundingClientRect = (() => {
            return {
                left: 0,
                top: 0,
                right: 1000,
                bottom: 40,
                width: 1000,
                height: 40,
                x: 0,
                y: 0,
                toJSON: () => {
                    return {};
                },
            } as DOMRect;
        });

        return {
            scrollHost,
            contentHost,
            marker,
            viewportLabel,
            barNumber,
        };
    };

    beforeEach(() => {
        requisitions.unregister("playRangeChanged");
        arrangement = makeArrangement(8, 2);
        scoreMetrics = makeScoreMetrics();
        result = null;
        minimapRef = null;
    });

    afterEach(() => {
        result?.unmount();
        cleanup();
        requisitions.unregister("playRangeChanged");
        result = null;
        minimapRef = null;
    });

    describe("initialization", () => {
        it("creates a new instance with core structure", () => {
            renderMinimap();

            expect(result?.container.querySelector(".minimap")).toBeTruthy();
            expect(result?.container.querySelector("#minimapViewportMarker")).toBeTruthy();
            expect(result?.container.querySelector("#barNumber")?.textContent).toBe("1");
        });

        it("matches snapshot for default rendering", () => {
            renderMinimap();
            expect(result?.container.firstElementChild).toMatchSnapshot();
        });
    });

    describe("handleTrackViewerScrolled", () => {
        it("updates viewport marker bar number for single bar", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 3, endBar: 3 };
            minimap.handleTrackViewerScrolled(0.2, 0.25, visibleBars);

            expect(dom.barNumber.textContent).toBe("3");
        });

        it("updates viewport marker bar range for multiple bars", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 2, endBar: 5 };
            minimap.handleTrackViewerScrolled(0.2, 0.5, visibleBars);

            expect(dom.barNumber.textContent).toBe("2 - 5");
            expect(dom.marker.style.display).toBe("flex");
            expect(dom.marker.style.left).toBe("0px");
            expect(dom.marker.style.width).toBe("200px");
        });

        it("handles normalized viewport position at start", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 1, endBar: 2 };
            minimap.handleTrackViewerScrolled(0.2, 0, visibleBars);

            expect(dom.marker.style.left).toBe("0px");
            expect(dom.scrollHost.scrollLeft).toBe(0);
        });

        it("handles normalized viewport position at end", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 7, endBar: 8 };
            minimap.handleTrackViewerScrolled(0.2, 1, visibleBars);

            expect(dom.barNumber.textContent).toBe("7 - 8");
            expect(dom.marker.style.left).toBe("0px");
            expect(dom.scrollHost.scrollLeft).toBe(800);
        });

        it("hides viewport marker when full content is visible", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 1, endBar: 8 };
            minimap.handleTrackViewerScrolled(1, 0, visibleBars);

            expect(dom.marker.style.display).toBe("none");
        });
    });

    describe("componentDidUpdate", () => {
        it("updates bar viewer count on arrangement bar count change", () => {
            const newArrangement = makeArrangement(12, 2);
            renderMinimap({ arrangement: newArrangement });

            const barViewers = result?.container.querySelectorAll(".mini-bar-viewer");
            expect(barViewers?.length).toBe(12);
        });

        it("clears selection when arrangement structure changes", () => {
            renderMinimap();

            const newArrangement = makeArrangement(8, 4);
            result?.rerender(
                <TestableMinimap
                    ref={(instance: TestableMinimap | null) => {
                        minimapRef = instance;
                    }}
                    arrangement={newArrangement}
                    scoreMetrics={scoreMetrics}
                    selectionManager={selectionManagerMock}
                />
            );

            // Arrangement structure change should not throw.
            expect(result?.container.querySelector(".minimap")).toBeTruthy();
        });

        it("handles track count change", () => {
            renderMinimap();

            const newArrangement = makeArrangement(8, 4);
            result?.rerender(
                <TestableMinimap
                    ref={(instance: TestableMinimap | null) => {
                        minimapRef = instance;
                    }}
                    arrangement={newArrangement}
                    scoreMetrics={scoreMetrics}
                    selectionManager={selectionManagerMock}
                />
            );

            const trackRows = result?.container.querySelectorAll(".mini-bar-track-row");
            expect(trackRows?.length).toBe(8 * 4);
        });
    });

    describe("rendering", () => {
        it("renders bar viewers for each bar", () => {
            renderMinimap();
            expect(result?.container.querySelectorAll(".mini-bar-viewer").length).toBe(8);
        });

        it("renders the minimap structure with required elements", () => {
            renderMinimap();

            expect(result?.container.querySelector(".minimap")).toBeTruthy();
            expect(document.querySelector("#minimapViewportMarker")).toBeTruthy();
            expect(document.querySelector("#minimapViewportLabel")).toBeTruthy();
            expect(document.querySelector("#barNumber")).toBeTruthy();
        });

        it("initially hides the viewport marker when full content is visible", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            // Call handleTrackViewerScrolled to trigger marker update.
            minimap.handleTrackViewerScrolled(1, 0, { startBar: 1, endBar: 1 });

            // The test's marker (installed via installViewportDom) should have display:none.
            expect(dom.marker.style.display).toBe("none");
            expect(dom.viewportLabel.style.display).toBe("none");
        });
    });

    describe("props validation", () => {
        it("creates component with required props", () => {
            renderMinimap();
            expect(result?.container.querySelector(".minimap")).toBeTruthy();
        });

        it("handleTrackViewerScrolled updates viewport marker position", () => {
            const onViewportMoved = vi.fn();
            renderMinimap({ onViewportMoved });
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            // handleTrackViewerScrolled should update the marker without throwing.
            const visibleBars: IVisibleBarRange = { startBar: 1, endBar: 2 };
            expect(() => {
                minimap.handleTrackViewerScrolled(0.2, 0.3, visibleBars);
            }).not.toThrow();

            // Marker should be visible (viewportWidth < 1).
            expect(dom.marker.style.display).toBe("flex");
        });
    });

    describe("edge cases", () => {
        it("handles empty arrangement (no bars)", () => {
            const emptyArrangement = makeArrangement(0, 1);
            renderMinimap({ arrangement: emptyArrangement });

            const barViewers = result?.container.querySelectorAll(".mini-bar-viewer");
            expect(barViewers?.length).toBe(0);
        });

        it("handles arrangement with single bar", () => {
            const singleBarArrangement = makeArrangement(1, 1);
            renderMinimap({ arrangement: singleBarArrangement });

            const barViewers = result?.container.querySelectorAll(".mini-bar-viewer");
            expect(barViewers?.length).toBe(1);
        });

        it("renders bars with only polyrhythm notes as active", () => {
            const polyrhythmArrangement = makeArrangement(1, 1);
            const track = polyrhythmArrangement.tracks[0];
            const { measure } = makePolyrhythmFixture(track);
            (track as { measures: ISbDmTrackMeasure[]; }).measures = [measure];

            renderMinimap({ arrangement: polyrhythmArrangement });

            const activeMiniNotes = result?.container.querySelectorAll(
                ".mini-bar-track-row .mini-note-viewer[style*='blue']"
            );
            expect(activeMiniNotes?.length).toBeGreaterThan(0);
        });

        it("handles arrangement with no tracks", () => {
            const noTracksArrangement = makeArrangement(8, 0);
            renderMinimap({ arrangement: noTracksArrangement });

            expect(result?.container.querySelector(".minimap")).toBeTruthy();
        });

        it("handles large arrangement", () => {
            const largeArrangement = makeArrangement(100, 10);
            renderMinimap({ arrangement: largeArrangement });

            const barViewers = result?.container.querySelectorAll(".mini-bar-viewer");
            expect(barViewers?.length).toBe(100);
        });

        it("matches snapshot for empty arrangement", () => {
            const emptyArrangement = makeArrangement(0, 1);
            renderMinimap({ arrangement: emptyArrangement });

            expect(result?.container.firstElementChild).toMatchSnapshot();
        });
    });

    describe("selection requisitions", () => {
        it("handles viewport scrolled callback without errors", () => {
            renderMinimap();
            const minimap = getMinimap();
            const dom = createViewportDom();
            minimap.installViewportDom(dom);

            const visibleBars: IVisibleBarRange = { startBar: 1, endBar: 2 };

            // Should not throw.
            expect(() => {
                minimap.handleTrackViewerScrolled(0.2, 0.2, visibleBars);
            }).not.toThrow();

            const minimapElement = result?.container.querySelector(".minimap");
            expect(minimapElement).not.toBeNull();
        });

        it("handles missing playRangeChanged handlers gracefully", () => {
            renderMinimap({
                onViewportMoved: undefined,
            });
            const minimap = getMinimap();

            const visibleBars: IVisibleBarRange = { startBar: 1, endBar: 2 };
            minimap.handleTrackViewerScrolled(0.2, 0.2, visibleBars);
            minimap.setSelectionState(true);
            minimap.setSelectionState(false);

            const minimapElement = result?.container.querySelector(".minimap");
            expect(minimapElement).not.toBeNull();
        });
    });
});
