/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export { createAnimadaScoreBook } from "./AnimadaScoreBook.js";
export { getLibrary } from "./Library.js";
export { deserialiseArrangement } from "./serialisation/deserialisers.js";
export { getSerialisedArrangementFromParams, getShareLink } from "./serialisation/url.js";

export { errorLog } from "./ErrorLog.js";
export { createPublisher } from "./Publisher.js";
export { exists, isSameTiming } from "./utils.js";

export * from "./types/edit_commands.js";
export type {
    IArrangementView, IAnimadaScoreBook, IInstrumentMeta, MutingRule, IMutingRuleOtherInstrument, INoteStyle,
    INoteView, IPackedInstrument, IPolyrhythm, IPolyrhythmView, IPublisher, RealTime, ISubscribable, Subscription,
    ITimeParamsView, ITiming, ITrackView
} from "./types/general.js";
export type { ArrangementSnapshot, SerialisedArrangement } from "./types/snapshots.js";
