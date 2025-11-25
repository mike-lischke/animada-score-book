/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { createContext, type JSX } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { PolyrhythmView, TrackView } from "../../../core/index.js";
import type { TrackPlayer } from "../../../player/types.js";
import { useSubscription } from "../../../ui/hooks/useSubscription.js";
import { ArrangementPlayerContext, NoteLineMinWidth, NoteWidthContext } from "../arrangement/ArrangementViewer.js";
import { NoteViewer } from "../note/NoteViewer.js";
import { Overlay, toggleOverlay } from "../Overlay.js";
import { PolyrhythmViewer } from "../PolyrhythmViewer.js";
import { TrackControls } from "./TrackControls.js";
import { TrackMeta } from "./TrackMeta.js";

interface TrackViewerCallbacks {
    noteLineTouchStart?: (event: TouchEvent) => void;
    noteLineTouchMove?: (event: TouchEvent) => void;
    noteLineTouchEnd?: () => void;
};

export const TrackPlayerContext = createContext<TrackPlayer | null>(null);

export function TrackViewer({ trackPlayer, callbacks }: {
    trackPlayer: TrackPlayer, callbacks: TrackViewerCallbacks;
}): JSX.Element {
    const track = trackPlayer.track;
    const overlayName = `track_overlay_${track.id}`;

    const [loaded, setLoaded] = useState(track.instrument.loaded);
    useSubscription(track.instrument, () => {
        setLoaded(track.instrument.loaded);
    });

    const arrangementPlayer = useContext(ArrangementPlayerContext);
    const { audibleTrackPlayers, audibleTrackPlayersPublisher } = arrangementPlayer!;
    const [audible, setAudible] = useState(!!audibleTrackPlayers.get(track));
    useSubscription(audibleTrackPlayersPublisher, () => {
        setAudible(!!audibleTrackPlayers.get(track));
    });

    if (!loaded) {
        return PendingTrackViewer();
    }

    return (
        <TrackPlayerContext.Provider value={trackPlayer}>
            <div
                className={`track-viewer ${audible ? "audible" : "inaudible"}`}
                data-colour-group={track.instrument.colourGroup}
            >
                <div className="note-line-wrapper overlay-wrapper">
                    <NoteLine track={track} callbacks={callbacks} />
                    <Overlay name={overlayName}>
                        <TrackControls track={track} overlayName={overlayName} />
                    </Overlay>
                </div>
                <div className="scrollshadow left-scrollshadow" />
                <div className="scrollshadow right-scrollshadow" />
                <TrackMeta track={track} toggleControls={() => {
                    toggleOverlay(overlayName);
                }} />
            </div>
        </TrackPlayerContext.Provider>
    );
}

function NoteLine({ track, callbacks }: { track: TrackView, callbacks: TrackViewerCallbacks; }): JSX.Element {
    const noteLineRef = useRef<HTMLDivElement | null>(null);
    const [notes, setNotes] = useState([...track.notes]);
    const [polyrhythms, setPolyrhythms] = useState([...track.polyrhythms]);

    useSubscription(track, () => {
        setNotes([...track.notes]);
        setPolyrhythms([...track.polyrhythms]);
    });

    const minWidth = useContext(NoteLineMinWidth);

    // Polyrhythms need to reposition dynamically
    useLayoutEffect(() => {
        // Adjust polyrhythms in order, since nested polyrhythms will be repositioned based on earlier polyrhythms
        polyrhythms.forEach(polyrhythm => {
            const polyrhythmViewer = noteLineRef.current!
                .querySelector<HTMLDivElement>(`#polyrhythm-${polyrhythm.id}`)!;
            repositionPolyrhythmViewer(polyrhythm, polyrhythmViewer);
        });
    }, [polyrhythms.length, useContext(NoteWidthContext)]);

    return (
        <div
            className="note-line"
            ref={noteLineRef}
            style={{ minWidth: minWidth }}
            onTouchStart={callbacks.noteLineTouchStart}
            onTouchMove={callbacks.noteLineTouchMove}
            onTouchEnd={callbacks.noteLineTouchEnd}
        >
            <div className="polyrhythms-wrapper">
                {polyrhythms.map(polyrhythm => {
                    return <PolyrhythmViewer polyrhythm={polyrhythm} key={polyrhythm.id} />;
                })}
            </div>
            <div className="notes-wrapper">
                {notes.map(note => {
                    return <NoteViewer note={note} key={note.id} />;
                })}
            </div>
        </div>
    );
}

function repositionPolyrhythmViewer(polyrhythm: PolyrhythmView, polyrhythmViewer: HTMLDivElement) {
    const startNoteViewer = document.getElementById(`note-${polyrhythm.start.id}`);
    const endNoteViewer = document.getElementById(`note-${polyrhythm.end.id}`);

    if (!startNoteViewer || !endNoteViewer) {
        return;
    }

    let startLeft = startNoteViewer.offsetLeft;

    // Start note is inside a polyrhythm, so the offset is likely only part of the picture
    if (polyrhythm.start.polyrhythm) {
        startLeft += (startNoteViewer.closest<HTMLDivElement>(".polyrhythm-viewer")!).offsetLeft;
    }

    let endLeft = endNoteViewer.offsetLeft + endNoteViewer.offsetWidth;
    if (polyrhythm.end.polyrhythm) {
        endLeft += (endNoteViewer.closest<HTMLDivElement>(".polyrhythm-viewer")!).offsetLeft;
    }

    polyrhythmViewer.style.left = `${startLeft}px`;
    polyrhythmViewer.style.width = `calc(${endLeft - startLeft}px - var(--thick-border-width)`;
}

function PendingTrackViewer(): JSX.Element {
    return (
        <div className="track-viewer pending-track">
            <div className="track-meta">Loading...</div>
            <div className="pending-note-line" />
        </div>
    );
}
