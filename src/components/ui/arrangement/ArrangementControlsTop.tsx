/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import pauseIcon from "../../../assets/images/icons/pause.svg";
import pencilIcon from "../../../assets/images/icons/pencil_white.svg";
import playIcon from "../../../assets/images/icons/play.svg";

import { useCallback, useContext, useRef, useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import type { ArrangementView } from "../../../core/index.js";
import { getEventEngine } from "../../../player/EventEngine.js";
import { useStateSubscription } from "../../../ui/hooks/useStateSubscription.js";
import { useSubscription } from "../../../ui/hooks/useSubscription.js";
import { ServicesContext } from "../BananaDrumViewer.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Overlay, toggleOverlay } from "../Overlay.js";
import { SelectionControls } from "../SelectionControls.js";
import { ShareButton } from "../ShareButton.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { ArrangementTitle } from "./ArrangementTitle.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";
import { TimeControls } from "./TimeControls.js";
import { UndoRedo } from "./UndoRedo.js";

const eventEngine = getEventEngine();

export function ArrangementControlsTop(): JSX.Element {
    const [playing, setPlaying] = useState(eventEngine.state === "playing");
    useSubscription(eventEngine, () => {
        setPlaying(eventEngine.state === "playing");
    });

    const arrangement: ArrangementView = useContext(ArrangementPlayerContext)!.arrangement;

    const selectionManager = useContext(ServicesContext)!.selectionManager;
    useSubscription(selectionManager, () => {
        toggleOverlay("selection_controls", selectionManager.selections.size ? "show" : "hide");
    });

    const [editingTitle, setEditingTitle] = useState(false);
    const title = useStateSubscription(arrangement, (arrangement: ArrangementView) => {
        return arrangement.title;
    });
    const titleVisible = title || editingTitle;

    const justFinishedEditingTitle = useRef(false);
    const onEditEnd = useCallback(() => {
        setEditingTitle(false);
        justFinishedEditingTitle.current = true;
        setTimeout(() => {
            return justFinishedEditingTitle.current = false;
        }, 100);
    }, []);

    const onClickEditTitle = useCallback(() => {
        if (!justFinishedEditingTitle.current) {
            setEditingTitle(true);
        }
    }, []);

    return (
        <>
            <div className={titleVisible ? "" : "hidden"}>
                <ArrangementTitle editMode={editingTitle} onEditEnd={onEditEnd} />
            </div>
            <div className="arrangement-controls arrangement-controls-top">
                {
                    playing ? (
                        <button className="playback-control push-button" onClick={() => {
                            eventEngine.stop();
                        }}>
                            <img src={pauseIcon} alt="stop" />
                        </button>
                    ) : (
                        <button className="playback-control push-button" onClick={() => {
                            void eventEngine.play();
                        }}>
                            <img src={playIcon} alt="play" />
                        </button>
                    )
                }
                <SmallSpacer />
                <TimeControls arrangement={arrangement} />
                <SmallSpacer />
                <div className='other-controls-wrapper'>
                    <button
                        className="push-button medium gray edit-title-button"
                        onClick={onClickEditTitle}
                    >
                        T&nbsp;<img src={pencilIcon} style={{ height: "0.78em" }} />
                    </button>
                    <SmallSpacer />
                    <UndoRedo />
                </div>
                <SmallSpacer />
                <ExpandingSpacer />
                <ShareButton />
                <Overlay name="selection_controls">
                    <SelectionControls />
                </Overlay>
            </div>
        </>
    );
}
