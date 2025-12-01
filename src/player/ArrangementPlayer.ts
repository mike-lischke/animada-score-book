/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../Core/Publisher.js";
import type { IArrangementView, ITiming, ITrackView, RealTime } from "../Core/types/general.js";
import { TimeCoordinator } from "./TimeCoordinator.js";
import { createTrackPlayer } from "./TrackPlayer.js";
import { IArrangementPlayer, ICallbackEvent, Event, IInterval, ILoopInterval, ITrackPlayer } from "./types.js";

export const createArrangementPlayer = (arrangement: IArrangementView): IArrangementPlayer => {
    // The interval may be beyond the end of the arrangement
    // If we're looping we'll use TimeConverter to resolve it within loops
    const getEvents = (interval: IInterval): Event[] => {
        const events: Event[] = [];
        const loopIntervals: ILoopInterval[] = timeCoordinator.convertToLoopIntervals(interval);

        loopIntervals.forEach((loopInterval) => {
            const { loopNumber } = loopInterval;
            audibleTrackPlayers.forEach((trackPlayer) => {
                trackPlayer.getEvents(loopInterval).forEach((event) => {
                    return events.push({
                        ...event,
                        realTime: timeCoordinator.convertToAudioTime(event.realTime, loopNumber)
                    });
                });
            });
        });

        events.push(...getCallbackEvents(interval));

        return events;
    };

    const getCallbackEvents = (interval: IInterval): ICallbackEvent[] => {
        const eventsInInterval: ICallbackEvent[] = [];
        const loopIntervals: ILoopInterval[] = timeCoordinator.convertToLoopIntervals(interval);

        loopIntervals.forEach(({ loopNumber, start, end }) => {
            callbackEvents?.filter(({ realTime }) => {
                return realTime >= start && realTime < end;
            })
                .forEach((audioEvent) => {
                    return eventsInInterval.push({
                        ...audioEvent,
                        realTime: timeCoordinator.convertToAudioTime(audioEvent.realTime, loopNumber)
                    });
                });
        });

        return eventsInInterval;
    };

    const onStop = () => {
        currentTiming = null;
        currentTimingPublisher.publish();
        for (const player of trackPlayers.values()) {
            player.onStop?.();
        }
    };

    // ==================================================================
    //                          Private Functions
    // ==================================================================

    const updateTrackPlayers = (): void => {
        let somethingChanged = false;

        // First remove trackPlayers for removed tracks
        for (const trackPlayer of trackPlayers.values()) {
            if (!arrangement.tracks.includes(trackPlayer.track)) {
                trackPlayer.unsubscribe(updateAudibleTrackPlayers);
                trackPlayers.delete(trackPlayer.track);
                audibleTrackPlayers.delete(trackPlayer.track);
                somethingChanged = true;
            }
        }

        // Then add trackPlayers for new tracks
        for (const track of arrangement.tracks) {
            if (!trackPlayers.get(track)) {
                const trackPlayer = createTrackPlayer(track, timeCoordinator);
                trackPlayers.set(track, trackPlayer);
                trackPlayer.subscribe(updateAudibleTrackPlayers);
                somethingChanged = true;
            }
        }

        if (somethingChanged) {
            updateAudibleTrackPlayers();
            publisher.publish();
        }
    };

    const updateCallbackEvents = () => {
        callbackEvents = arrangement.timeParams.timings.map((timing) => {
            return {
                realTime: timeCoordinator.convertToRealTime(timing),
                callback: () => {
                    currentTiming = timing;
                    currentTimingPublisher.publish();
                },
                identifier: timing
            };
        });
    };

    const updateAudibleTrackPlayers = (): void => {
        const calculatedAudibleTrackPlayers = calculateAudibleTrackPlayers(trackPlayers);

        let somethingChanged = false;

        for (const [view, track] of trackPlayers) {
            if (calculatedAudibleTrackPlayers.includes(track)) {
                audibleTrackPlayers.set(view, track);
                somethingChanged = true;
            } else {
                audibleTrackPlayers.delete(view);
                somethingChanged = true;
            }
        }

        if (somethingChanged) {
            audibleTrackPlayersPublisher.publish();
        }
    };

    const timeCoordinator = new TimeCoordinator(arrangement.timeParams);
    const publisher = new Publisher();
    const currentTimingPublisher = new Publisher();
    const audibleTrackPlayersPublisher = new Publisher();

    // We need a TrackPlayer for each Track, and add/remove them when needed
    const trackPlayers = new Map<ITrackView, ITrackPlayer>();
    const audibleTrackPlayers = new Map<ITrackView, ITrackPlayer>();
    updateTrackPlayers();
    updateAudibleTrackPlayers();
    arrangement.subscribe(updateTrackPlayers);

    // currentTiming updates as we play, and ArrangementPlayer publishes when it does
    let currentTiming: ITiming | null = null;
    let callbackEvents: ICallbackEvent[] | null;
    updateCallbackEvents();
    arrangement.timeParams.subscribe(updateCallbackEvents);

    return {
        arrangement, getEvents, onStop, trackPlayers,
        subscribe: publisher.subscribe,
        unsubscribe: publisher.unsubscribe,
        get currentTiming() {
            return currentTiming;
        },
        convertToLoopProgress: (realTime: RealTime) => {
            return timeCoordinator.convertToLoopProgress(realTime);
        },
        currentTimingPublisher: {
            subscribe: currentTimingPublisher.subscribe,
            unsubscribe: currentTimingPublisher.unsubscribe
        },
        audibleTrackPlayers,
        audibleTrackPlayersPublisher: {
            subscribe: audibleTrackPlayersPublisher.subscribe,
            unsubscribe: audibleTrackPlayersPublisher.unsubscribe
        }
    };

};

const calculateAudibleTrackPlayers = (trackPlayers: Map<ITrackView, ITrackPlayer>): ITrackPlayer[] => {
    const soloedTracksPlayers: ITrackPlayer[] = [];
    const unmutedTracksPlayers: ITrackPlayer[] = [];

    trackPlayers.forEach((trackPlayer) => {
        if (trackPlayer.soloMute === "solo") {
            soloedTracksPlayers.push(trackPlayer);
        } else if (trackPlayer.soloMute === null) {
            unmutedTracksPlayers.push(trackPlayer);
        }
    });

    if (soloedTracksPlayers.length) {
        return soloedTracksPlayers;
    }

    return unmutedTracksPlayers;
};
