/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarTrackRow } from "../../src/components/ui/Bar/BarTrackRow.js";
import { NoteLine } from "../../src/components/ui/Track/NoteLine.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import {
    SbDmEntityType, ScoreBookDataModel, type ISbDmArrangement, type ISbDmInstrument
} from "../../src/core/ScoreBookDataModel.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { TimeCoordinator } from "../../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../../src/player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../src/player/types.js";
import { Overlay } from "../../src/components/ui/Overlay.js";
import { ModeManager } from "../../src/ui/ModeManager.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";

class TestScoreBookDataModel extends ScoreBookDataModel {
    private readonly _arrangement: ISbDmArrangement;
    private readonly _instruments: ISbDmInstrument[];

    public constructor(arrangement: ISbDmArrangement, instruments: ISbDmInstrument[]) {
        super();
        this._arrangement = arrangement;
        this._instruments = instruments;
    }

    public override get arrangement(): ISbDmArrangement {
        return this._arrangement;
    }

    public override get instruments(): ISbDmInstrument[] {
        return this._instruments;
    }
}

const createInstrument = (typeId: string, id: number, displayOrder: number): ISbDmInstrument => {
    return {
        type: SbDmEntityType.Instrument,
        id,
        typeId,
        displayOrder,
        displayName: `Instrument ${typeId}`,
        image: { type: SbDmEntityType.InstrumentImage, id: id + 1000, filePath: "" },
        color: "#0ea5e9",
        range: [0, 0],
        state: {
            initialized: true,
            isLeaf: true,
            expanded: false,
            expandedOnce: false,
        },
        noteStyles: {
            "1": {
                id: "1",
                audioBuffer: null,
                instrument: undefined as unknown as ISbDmInstrument,
            },
        },
        subscribe: vi.fn(() => {
            return () => {
                return undefined;
            };
        }),
        unsubscribe: vi.fn(() => {
            return undefined;
        }),
    };
};

describe.sequential("Polyrhythm UI Integration", () => {
    afterEach(() => {
        Overlay.closeAllOverlays();
        cleanup();
    });

    it("renders existing polyrhythms in note line and bar view", async () => {
        const instrument = createInstrument("0", 0, 0);
        instrument.noteStyles["1"].instrument = instrument;

        const snapshot: IArrangementSnapshot = {
            version: 1,
            title: "Display",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes: Array.from({ length: 16 }, () => {
                    return "0";
                }),
                polyrhythms: [],
            }],
        };

        const arrangement = Arrangement.fromSnapshot(snapshot, [instrument]);
        const track = arrangement.tracks[0];
        const start = track.getNoteAt({ bar: 1, step: 1 })!;
        const end = track.getNoteAt({ bar: 1, step: 4 })!;
        track.addPolyrhythm(start, end, 7);
        track.polyrhythms[0].notes.forEach((note) => {
            note.noteStyle = instrument.noteStyles["1"];
        });

        const dataModel = new TestScoreBookDataModel(arrangement, [instrument]);
        const undoManager = { edit: vi.fn() };

        const selectionManager = new SelectionManager();
        const services: ScoreBookUiServices = {
            selectionManager,
            modeManager: new ModeManager(selectionManager),
        };

        const timeCoordinator = new TimeCoordinator(arrangement.timeParams, { currentTime: -1 });
        const trackPlayer = new TrackPlayer(track, timeCoordinator);

        const arrangementPlayer = {
            scoreMetrics: {
                realTimeLength: 4,
                secondsPerBar: 4,
                secondsPerStep: 0.25,
                bars: 1,
                beatsPerBar: 4,
                pulsesPerBar: 4,
                stepsPerBar: 16,
                stepsPerPulse: 4,
            },
            currentTimingPublisher: { subscribe: vi.fn(), unsubscribe: vi.fn() },
            trackPlayers: new Map(),
        };

        const result = render(
            <>
                <NoteLine
                    track={track}
                    callbacks={{}}
                    trackPlayer={trackPlayer}
                    arrangementPlayer={arrangementPlayer as never}
                    services={services}
                    undoManager={undoManager as never}
                    dataModel={dataModel}
                />
                <BarTrackRow
                    track={track}
                    barNumber={1}
                    timeParams={arrangement.timeParams}
                    trackPlayer={trackPlayer}
                    arrangementPlayer={arrangementPlayer as never}
                    touchEditingEnabled={false}
                    services={services}
                    undoManager={undoManager as never}
                    dataModel={dataModel}
                />
            </>
        );

        await waitFor(() => {
            const polyrhythmViewers = result.container.querySelectorAll(".note-line .polyrhythm-viewer");
            expect(polyrhythmViewers.length).toBe(1);
        });

        await waitFor(() => {
            const fragments = result.container.querySelectorAll(".bar-track-row .polyrhythm-fragment");
            expect(fragments.length).toBe(1);
        });

        trackPlayer.dispose();
    });

    it("plays polyrhythm note events through TrackPlayer", () => {
        const instrument = createInstrument("0", 0, 0);
        instrument.noteStyles["1"].instrument = instrument;

        const snapshot: IArrangementSnapshot = {
            version: 1,
            title: "Playback",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 16,
            },
            tracks: [{
                id: 100,
                instrumentId: "0",
                notes: Array.from({ length: 16 }, () => {
                    return "0";
                }),
                polyrhythms: [],
            }],
        };

        const arrangement = Arrangement.fromSnapshot(snapshot, [instrument]);
        const track = arrangement.tracks[0];
        track.addPolyrhythm(track.getNoteAt({ bar: 1, step: 1 })!, track.getNoteAt({ bar: 1, step: 4 })!, 5);
        track.polyrhythms[0].notes.forEach((note) => {
            note.noteStyle = instrument.noteStyles["1"];
        });

        const timeCoordinator = new TimeCoordinator(arrangement.timeParams, { currentTime: -1 });
        const trackPlayer = new TrackPlayer(track, timeCoordinator);

        const events = trackPlayer.getEvents({ start: 0, end: timeCoordinator.metrics.realTimeLength });
        const audioEvents = events.filter((event) => {
            return event.kind === "audio";
        });
        const callbackEvents = events.filter((event) => {
            return event.kind === "callback";
        });

        expect(audioEvents.length).toBe(5);
        expect(callbackEvents.length).toBe(5);

        const firstCallback = callbackEvents[0];
        if (firstCallback.kind === "callback") {
            firstCallback.callback();
        }

        expect(trackPlayer.currentPolyrhythmNote).toBe(track.polyrhythms[0].notes[0]);

        trackPlayer.dispose();
    });
});
