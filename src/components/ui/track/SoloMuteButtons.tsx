/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useContext, useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import { TrackPlayerContext } from "./TrackViewer.js";
import { useSubscription } from "../../../ui/hooks/useSubscription.js";

const smButtonClasses = "options-button push-button small solo-mute-button";

export function SoloMuteButtons(): JSX.Element {
    const trackPlayer = useContext(TrackPlayerContext)!;
    const [soloed, setSoloed] = useState(trackPlayer.soloMute === "solo");
    const [muted, setMuted] = useState(trackPlayer.soloMute === "mute");

    useSubscription(trackPlayer, () => {
        setSoloed(trackPlayer.soloMute === "solo");
        setMuted(trackPlayer.soloMute === "mute");
    });

    const solo = () => {
        return trackPlayer.soloMute = (trackPlayer.soloMute === "solo" ? null : "solo");
    };
    const mute = () => {
        return trackPlayer.soloMute = (trackPlayer.soloMute === "mute" ? null : "mute");
    };
    const soloButtonColour = soloed ? "lighter-green" : "gray";
    const muteButtonColour = muted ? "dark-blue" : "gray";

    return (
        <>
            <button className={`${smButtonClasses} ${soloButtonColour}`} onClick={solo}>
                S
            </button>
            <button className={`${smButtonClasses} ${muteButtonColour}`} onClick={mute}>
                M
            </button>
        </>
    );
}
