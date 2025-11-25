/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useContext, useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import type { PolyrhythmView } from "../../core/index.js";
import { useEditCommand } from "../../ui/hooks/useEditCommand.js";
import { useSubscription } from "../../ui/hooks/useSubscription.js";
import { ServicesContext } from "./BananaDrumViewer.js";
import { NoteViewer } from "./note/NoteViewer.js";

export function PolyrhythmViewer({ polyrhythm }: { polyrhythm: PolyrhythmView; }): JSX.Element {
    const track = polyrhythm.start.track;
    const modeManager = useContext(ServicesContext)!.modeManager;
    const edit = useEditCommand();

    const [deleteMode, setDeleteMode] = useState(modeManager.deletePolyrhythmMode);
    useSubscription(modeManager, () => {
        setDeleteMode(modeManager.deletePolyrhythmMode);
    });

    const [isShrouded, setShrouded] = useState(checkShrouded(polyrhythm));
    useSubscription(track, () => {
        setShrouded(checkShrouded(polyrhythm));
    });

    return (
        <div id={`polyrhythm-${polyrhythm.id}`} className="polyrhythm-viewer">
            {
                deleteMode
                    ? (
                        <div className={`delete-polyrhythm-wrapper ${isShrouded ? "shrouded" : ""}`}>
                            {
                                isShrouded
                                    ? (<></>)
                                    : (
                                        <button
                                            disabled={isShrouded}
                                            className="push-button"
                                            onClick={() => {
                                                edit({
                                                    type: "EditCommand_TrackRemovePolyrhythm",
                                                    track,
                                                    removePolyrhythm: polyrhythm
                                                });
                                            }}
                                        >Delete</button>
                                    )
                            }
                        </div>
                    )
                    : (<>
                        <div className="polyrhythm-decoration" ></div>
                        <div className="polyrhythm-notes-wrapper">
                            {polyrhythm.notes.map(note => {
                                return <NoteViewer note={note} key={note.id} />;
                            })}
                        </div>
                    </>)
            }
        </div>
    );
}

function checkShrouded(polyrhythm: PolyrhythmView) {
    const track = polyrhythm.start.track;
    for (const otherPolyrhythm of track.polyrhythms) {
        if (otherPolyrhythm !== polyrhythm) {
            if (otherPolyrhythm.start.polyrhythm === polyrhythm || otherPolyrhythm.end.polyrhythm === polyrhythm) {
                return true;
            }
        }
    }

    return false;
}
