/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AppStorage } from "./AppStorage.js";
import { Arrangement, type IArrangementCreationOptions } from "./Arrangement.js";
import { expandMeasureToGridEvents, synthesizeGridEventsToMeasure } from "./grid-events.js";
import { ArrangementMigrator } from "./serialisation/migration/ArrangementMigrator.js";
import {
    addFractions, compareFractions, reduceFraction, subtractFractions,
} from "./serialisation/numeric-functions.js";
import { stringifyPackedArrangement } from "./serialisation/snapshot-packing.js";

import { requisitions } from "../supplement/Requisitions.js";
import type { IScoreDBEntry, ISoundLibFsNode } from "./DatabaseTypes.js";
import { Instrument } from "./Instrument.js";
import type {
    IArrangementSnapshot, IAudioData, IFraction, IMeasureEvent, IMeterSnapshot, IArticulationSymbol,
    ISubdivision, Mutable
} from "./types/general.js";
import { getNewId } from "./utils.js";

/**
 * Steps are usually sixteenths (2/4, 4/4).
 * For other time signatures, they can be different. For example in 6/8, steps are usually eighths.
 */
export interface ITiming {
    readonly bar: number,
    readonly step: number;
};

export type RealTime = number;

/** If a hand plays a note, how is it played? */
export enum HandTechnique {
    Thumb,
    Fingers,
    Heel,
    Tap,
    TapWithPalm,

    Open,
    Slap,

    Friction,
}

/** How to strike the instrument. */
export enum StickTechnique {
    /** Normal play type. Goes together with `SoundType.Normal`. */
    Normal,

    /** A hit on the rim of the drum. Goes together with `SoundType.Cross`. */
    Rim,

    /** A hit on rim and head together. Goes together with `SoundType.Cross`. */
    RimShot,

    /** A hit on the shell of the drum. Goes together with `SoundType.Cross`. */
    Body,

    /**
     * A hit created by resting the stick on the head and clicking on the edge of the drum on the other side.
     * Goes together with `SoundType.Cross`.
     */
    CrossClick,

    /** A roll played by bouncing the stick on the drum head. Goes together with `SoundType.Normal`. */
    PressRoll,
}

export enum ExcitationMode {
    /** Sound produced by striking with hand or stick (e.g. drums, bells). */
    Struck,

    /** Sound produced by shaking the instrument (e.g. chocalho, shekere, Ganzá, Caxixi). */
    Shaken,

    /** Sound produced by scraping a beater across a ridged surface (e.g. reco-reco, guiro). */
    Scraped,

    /** Sound produced by friction against a membrane or internal rod (e.g. cuica and other friction drums). */
    Friction,

    /** Sound produced by blowing air through the instrument (e.g. Apito). */
    Blown,

    /** Sound produced by the human voice (e.g. spoken numbers, count-ins, vocal cues). */
    Vocal,
}

export type TechniqueType =
    | { handTechnique: HandTechnique, stickTechnique?: never; }
    | { handTechnique?: never, stickTechnique: StickTechnique; };

export enum Damping {
    /** The hit is open, allowing the sound to resonate. */
    Open,

    /** The hit is muted, dampening the sound. */
    Muted,
}

/**
 * Per-note performance instructions stored on each measure step.
 * These describe *how* the player should execute the note, independently
 * of which instrument sound variant is selected.
 */
export interface INoteArticulation {
    /** How the note is dampened. */
    damping: Damping;

    /** Whether the note is accented. */
    accent: boolean;

    /** Whether the note is a ghost note (intentionally quiet). */
    ghost: boolean;
}

/**
 * Describes the articulation that is baked into a specific audio sample.
 * This is purely descriptive — it tells the player which articulation
 * values the sample was recorded with, so the right sample can be
 * selected for a given {@link INoteArticulation}.
 */
export interface ISampleProfile {
    /** Which damping is inherent in this sample. */
    builtInDamping: Damping;

    /** Whether this sample is an accented variant. */
    builtInAccent: boolean;

    /** Whether this sample represents a ghost note (intentionally quiet, unaccented). */
    ghost: boolean;
}

export enum HandType {
    /** For right-handed people this is the right hand (vice-versa for left-handed people). */
    Strong,

    /** For right-handed people this is the left hand (vice-versa for left-handed people). */
    Weak
}

/** What type of note head is displayed. */
export enum NoteDisplayType {
    /**
     * A filled oval note, for all pitched sounds, i.e. hits on the drum head, bells, Cuicas etc.
     */
    Oval,

    /** A cross for all unpitched sounds, rimshots etc. */
    Cross,

    /** A diamond for special sounds like bells. */
    Diamond,

    /** A filled square for hand-struck instruments (e.g. Repinique de mão, Conga). */
    Square,

    /** A hollow equilateral triangle for shaken instruments (e.g. Chocalho, Ganzá). */
    Triangle,
}

/**
 * Play characteristics for instruments. There are individual types for the play styles to disable fields that don't
 * apply to certain styles (e.g. damping doesn't make sense for shaken instruments, hand/stick techniques don't apply
 * to vocal samples etc.).
 */

/** Information about the struck play style. */
export type StruckCharacteristics = {
    excitationMode: ExcitationMode.Struck;

    /** The main note head display type for this instrument. */
    mainDisplayType: NoteDisplayType;
} & TechniqueType;

export interface IShakenCharacteristics {
    excitationMode: ExcitationMode.Shaken;
    mainDisplayType: NoteDisplayType;
    handTechnique?: never;
    stickTechnique?: never;
}

export interface IScrapedCharacteristics {
    excitationMode: ExcitationMode.Scraped;
    mainDisplayType: NoteDisplayType;
    handTechnique?: never;
    stickTechnique?: never;
}

export interface IFrictionCharacteristics {
    excitationMode: ExcitationMode.Friction;
    mainDisplayType: NoteDisplayType;
    handTechnique: HandTechnique.Friction;
    stickTechnique?: never;
}

export interface IBlownCharacteristics {
    excitationMode: ExcitationMode.Blown;
    mainDisplayType: NoteDisplayType;
    handTechnique?: never;
    stickTechnique?: never;
}

/**
 * Characteristics for vocal/spoken samples (e.g. count-ins, number cues). These are not produced
 * on a physical instrument, so no technique or damping applies.
 */
export interface IVocalCharacteristics {
    excitationMode: ExcitationMode.Vocal;
    mainDisplayType?: never;
    handTechnique?: never;
    stickTechnique?: never;
}

export type NoteCharacteristics =
    | StruckCharacteristics
    | IShakenCharacteristics
    | IScrapedCharacteristics
    | IFrictionCharacteristics
    | IBlownCharacteristics
    | IVocalCharacteristics;

/** Describes details about a specific play variant of an instrument. */
export interface ISoundStyleMeta {
    readonly id: string;
    readonly file: string;
    readonly symbol?: IArticulationSymbol;
    readonly characteristics: NoteCharacteristics;

    /** The line on which the note is displayed (1-based), if the note represents a different sound/pitch. */
    readonly noteLine?: number;

    /**
     * Describes the articulation (damping, accent) that is baked into this sample.
     * Used by the player to match a sample to a given {@link INoteArticulation}.
     */
    readonly sampleProfile: ISampleProfile;
}

/** Defines the structure of the instrument metadata. */
export interface IInstrumentMeta {
    /** A unique identifier for the sound. */
    readonly id: number;

    /** The type identifier for the instrument. */
    readonly typeId: string;

    /** The different variants of the instrument (if any). */
    readonly variants: ISoundStyleMeta[];

    readonly displayOrder: number;
    readonly displayName: string;
    readonly icon: string;
    readonly color: string;
}

export interface ITimeParamsView {
    readonly timeSignature: string;
    readonly tempo: number;
    readonly length: number;
    readonly pulse: string;
    readonly stepResolution: number;
    isValid(timing: ITiming): boolean;
    readonly timings: ITiming[];
}

/**
 * The signature of a callback, which can be passed to any `initialize()` method.
 *
 * @param result The message to display to the user (if a string was given) or an error, which should be displayed.
 *               If no result is given or it is an error, the progress indicator should be hidden.
 */
export type ProgressCallback = (result?: string | Error) => void;

/** Transient information related to initialization and UI. */
export interface ISbDmEntityState {
    /** Set to true, once the entry's content was loaded. */
    readonly initialized: boolean;

    /** Marks an entry as having no children. Useful for the UI to indicate if an entry can be expanded. */
    readonly isLeaf: boolean;

    /** Is the entry currently expanded? */
    expanded: boolean;

    /** Was the entry expanded before? If not it must be initialized on expand. */
    expandedOnce: boolean;

    /** Indicates whether the entry is currently being loaded. */
    loading?: boolean;
}

export enum ScoreBookChangeReason {
    /** A score was loaded into the player — no structural change to the library. */
    ScoreLoaded,

    /** An entry was renamed — no structural change. */
    EntryRenamed,

    /** An entry was deleted — the tree structure changed. */
    EntryDeleted,

    /** The entire library was refreshed from the backend — the tree structure changed. */
    LibraryRefreshed,
}

export enum SbDmEntityType {
    SoundFolder,
    SoundFile,
    Score,
    ScoreFolder,
    Track,
    TrackMeasure,
    NoteEvent,
    Instrument,
    InstrumentImage,
    Arrangement,
    Note
}

export interface ISbDmCommon {
    readonly id: number;

    /** The type of the entry. This is used a discriminator for the individual entries. */
    readonly type: SbDmEntityType;
}

/** A special form of a data model item. It's used in the UI. */
export interface ISbDmVisual extends ISbDmCommon {
    /** Transient state information. */
    readonly state: ISbDmEntityState;

    /**
     * Reloads the content of this data model entry, regardless of whether it was already initialized or not.
     *
     * @param callback An optional callback to report progress.
     */
    refresh?(callback?: ProgressCallback): Promise<void>;

    /**
     * @returns a list of child entries in the order they should appear in the UI or is `undefined` if this entry
     *         is a leaf node {@link isLeaf} is true).
     */
    getChildren?(): ScoreBookDataModelEntry[];

    /** Permission info for the current user (undefined until the backend provides it). */
    perm?: ISbDmPermissionInfo;
}

/** Permission summary for the current user on a score or folder. */
export interface ISbDmPermissionInfo {
    /** The current user is the owner of this entity. */
    readonly isOwner: boolean;

    /** The current user can read this entity. */
    readonly canRead: boolean;

    /** The current user can write this entity. */
    readonly canWrite: boolean;

    /** The entity is assigned to the World group (publicly readable). */
    readonly isWorld: boolean;

    /** IDs of groups assigned to this entity. */
    readonly groupIds: number[];
}

/** Permissions returned by getPermissions (explicit, not inherited). */
export interface IPermissionDecomposition {
    entityType: string;
    entityId: number;
    ownerId: number | null;
    groups: Array<{ groupId: number; writable: boolean; }>;
}

export interface ISbDmSoundFolder extends ISbDmVisual {
    readonly type: SbDmEntityType.SoundFolder;
    readonly parentId: number | null;
    readonly name: string;
    readonly path: string;
    readonly children?: Array<ISbDmSoundFolder | ISbDmSoundFile>;
}

export interface ISbDmSoundFile {
    readonly type: SbDmEntityType.SoundFile;
    readonly id: number;
    readonly name: string;
}

export interface ISbDmScoreFolder extends ISbDmVisual {
    readonly type: SbDmEntityType.ScoreFolder;
    readonly parent?: ISbDmScoreFolder;
    readonly children: Array<ISbDmScoreFolder | ISbDmScore>;

    name: string;
}

/** A score entry in the score library. */
export interface ISbDmScore extends ISbDmVisual {
    readonly type: SbDmEntityType.Score;
    readonly parent?: ISbDmScoreFolder;
    name: string;
    content: string;
    readonly description?: string;
}

export interface ISbDmTrack extends ISbDmCommon {
    readonly type: SbDmEntityType.Track;
    readonly name: string;

    /** The owning arrangement of this track. */
    readonly arrangement: ISbDmArrangement;

    /** The instrument assigned to this track. */
    readonly instrument: ISbDmInstrument;

    /** The volume of the track (0-1), selected by the user. */
    readonly volume: number;

    /**
     * The effective volume of the track, created by combining the track volume with the relative volume
     * between multiple tracks.
     */
    readonly effectiveVolume: number;

    readonly measures: ISbDmTrackMeasure[];

    getNoteAt(timing: ITiming): ISbDmNoteEvent | undefined;
    readonly notes: IterableIterator<ISbDmNoteEvent>;
    clear(): void;
}

export interface ISbDmTrackMeasure extends ISbDmCommon {
    readonly type: SbDmEntityType.TrackMeasure;
    readonly number: number;

    /**
     * Snapshot metadata kept on the runtime measure.
     * This mirrors `ITrackMeasureSnapshot` and allows lossless round-trips.
     */
    readonly meter: IMeterSnapshot;

    /**
     * The measure content as a contiguous, ordered list of events (notes and rests). This is the
     * single source of truth for note placement, duration and style.
     */
    readonly events: IMeasureEvent[];

    /** Subdivision groups annotating the event stream (tuplets and symmetric splits). */
    readonly subdivisions: ISubdivision[];

    /**
     * Resolved runtime note events derived from {@link events} (style ids resolved to audio data).
     * Generated by the track player and not persisted.
     */
    readonly noteEvents: ISbDmNoteEvent[];
}

export interface ISbDmNoteEvent extends ISbDmCommon {
    readonly type: SbDmEntityType.NoteEvent;
    readonly measureNumber: number;
    readonly start: IFraction;
    readonly duration: IFraction;
    readonly track: ISbDmTrack;
    readonly timing: ITiming;

    /** Reference to audio data and instrument. If unassigned this event represents a rest. */
    audioData?: IAudioData;
}

export interface ISbDmInstrumentImage {
    readonly type: SbDmEntityType.InstrumentImage;

    readonly id: number;
    readonly filePath: string;
}

export interface ISbDmInstrument extends ISbDmVisual {
    readonly type: SbDmEntityType.Instrument;

    /** The type identifier of this instrument. It corresponds to a specific instrument class (Agogô, Repinique etc). */
    readonly typeId: string;

    /** The image associated with this instrument. */
    readonly image: ISbDmInstrumentImage;

    /** A number indicating the display order of this instrument. */
    readonly displayOrder: number;

    /** The display name of this instrument. */
    readonly displayName: string;

    /** The color associated with this instrument. */
    readonly color: string;

    /** Start end and position in the audio file. */
    readonly range: [number, number];

    /** Note (play) styles available for this instrument (high bell, center, rimshot, press roll etc.). */
    readonly noteStyles: Record<string, IAudioData>;
}

export interface ISbDmTimeParams extends ITimeParamsView {
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
}

export interface ISbDmArrangement extends ISbDmCommon {
    readonly type: SbDmEntityType.Arrangement;

    title: string;
    timeParams: ISbDmTimeParams;
    tracks: ISbDmTrack[];

    /** Per-measure section labels, keyed by 1-based measure number. */
    measureLabels: Record<number, string>;

    /** The main playback and record volume of the arrangement (0-100%). */
    mainVolume: number;

    /** Indicates whether the arrangement should loop during playback. */
    loop: boolean;

    /** Indicates whether the metronome should be used during playback. */
    useMetronome: boolean;

    /** Indicates whether a count-in should be used before starting playback. */
    countIn: boolean;

    addTrack(instrument: ISbDmInstrument, id?: number): ISbDmTrack;
    removeTrack(track: ISbDmTrack): void;
    duplicateTrack(track: ISbDmTrack): ISbDmTrack;

    applyArrangementSnapshot(arrangementSnapshot: IArrangementSnapshot, instruments: ISbDmInstrument[]): void;
}

interface IScoreBookDataModelData {
    soundLib: Array<ISbDmSoundFolder | ISbDmSoundFile>;
    scoreLib: Array<ISbDmScoreFolder | ISbDmScore>;
    instruments: ISbDmInstrument[];
    numberSounds?: ISbDmInstrument;

    /** The current arrangement being edited or viewed. */
    arrangement?: ISbDmArrangement;
}

/** All possible data model entry types. */
export type ScoreBookDataModelEntry =
    | ISbDmSoundFolder
    | ISbDmSoundFile
    | ISbDmScoreFolder
    | ISbDmScore
    | ISbDmTrack
    | ISbDmInstrument
    | ISbDmArrangement
    | ISbDmNoteEvent
    | ISbDmInstrumentImage
    ;

/**
 * A data model to share score book data between components.
 */

/** Mirrors IWhoamiResponse / ICapabilities from the backend. */
export interface IUserInfo {
    id: number;
    username: string;
    displayName: string;
    isAdmin: boolean;
}

/** A user row as returned by listUsers. */
export interface IUserRow {
    id: number;
    username: string;
    displayName: string;
    isAdmin: boolean;
    lastLogin: string | null;
    createdAt: string;
    updatedAt: string;
}

/** A group row as returned by listGroups. */
export interface IGroupRow {
    id: number;
    name: string;
    description: string;
    color: string;
    adminId: number | null;
    hasPassword: boolean;
    lastLogin: string | null;
    createdAt: string;
}

/** A group member as returned by listGroupMembers. */
export interface IGroupMember {
    id: number;
    username: string;
    displayName: string;
}

export interface ICapabilities {
    canEditScores: boolean;
    canManageUsers: boolean;
    canManageInstruments: boolean;
    canExportMP3: boolean;
}

interface ILoginResponse {
    token: string;
    user: IUserInfo;

    /** Set when the user authenticated via a group password. */
    group?: {
        id: number;
        name: string;
    };

    capabilities: ICapabilities;
}

interface IWhoamiResponse {
    authenticated: boolean;
    user?: IUserInfo;

    /** Set when authenticated via group shared password. */
    group?: { id: number; name: string; };

    capabilities: ICapabilities;
}

/** A clear target for {@link clearStepRanges}: a step range or a whole measure of one track. */
export interface IGridClearRange {
    /** The track containing the measure to clear. */
    trackId: number;

    /** The one-based measure number. */
    bar: number;

    /** First step index (inclusive) into the measure's steps. Omit to clear the whole measure. */
    startStep?: number;

    /** Last step index (inclusive) into the measure's steps. Omit to clear the whole measure. */
    endStep?: number;

    /** Exact fractional start of the range; takes precedence over {@link startStep}. */
    start?: IFraction;

    /** Exact fractional end (exclusive) of the range; takes precedence over {@link endStep}. */
    end?: IFraction;
}

/** A replace target for {@link replaceMeasureContent}: a step range or a whole measure of one track. */
export interface IMeasureReplace {
    /** The track containing the measure to replace. */
    trackId: number;

    /** The one-based measure number. */
    bar: number;

    /** Events to write. Replaces the whole measure when startStep/endStep are omitted. */
    events: IMeasureEvent[];

    /** First step index (inclusive) into the measure's steps. Omit to replace the whole measure. */
    startStep?: number;

    /** Last step index (inclusive) into the measure's steps. Omit to replace the whole measure. */
    endStep?: number;
}

export class ScoreBookDataModel {
    /**
     * Indicates whether the current session is allowed to mutate scores on the backend.
     * Derived from the capabilities returned by the backend after authentication.
     *
     * @returns True if the current user can edit scores.
     */
    public get canWriteScores(): boolean {
        return this.capabilities.canEditScores;
    }

    public get authenticated(): boolean {
        return this.accessToken !== undefined;
    }

    public get user(): IUserInfo | undefined {
        return this.currentUser;
    }

    /**
     * The group the user authenticated as (only set for group login).
     *
     * @returns The active group, or undefined if logged in as a user or anonymously.
     */
    public get activeGroup(): { id: number; name: string; } | undefined {
        return this.currentGroup;
    }

    public get capabilities(): ICapabilities {
        return this.currentCapabilities;
    }

    /** Token for the active score lock. Set by the lockScore flow. */
    public lockToken?: string;

    private accessToken: string | undefined;
    private currentUser: IUserInfo | undefined;
    private currentGroup: { id: number; name: string; } | undefined;
    private currentCapabilities: ICapabilities = {
        canEditScores: false,
        canManageUsers: false,
        canManageInstruments: false,
        canExportMP3: false,
    };

    private data: IScoreBookDataModelData = {
        soundLib: [],
        scoreLib: [],
        instruments: [],
    };

    public async initialize(): Promise<void> {
        const promises: Array<Promise<void>> = [
            this.loadSoundLib(),
            this.loadInstruments(),
            this.loadNumberSounds(),
            (async () => {
                const freshList: Array<ISbDmScoreFolder | ISbDmScore> = [];
                await this.updateScoreLibFolder(freshList);
                this.data.scoreLib = freshList;
            })(),
        ];

        await Promise.all(promises);

        this.data.arrangement = Arrangement.emptyArrangement(this.data.instruments);

        return Promise.resolve();
    }

    public get soundLib(): Array<ISbDmSoundFolder | ISbDmSoundFile> {
        return this.data.soundLib;
    }

    public get scoreLib(): Array<ISbDmScoreFolder | ISbDmScore> {
        return this.data.scoreLib;
    }

    public get instruments(): ISbDmInstrument[] {
        return this.data.instruments;
    }

    public get arrangement(): ISbDmArrangement | undefined {
        return this.data.arrangement;
    }

    public get numberSounds(): ISbDmInstrument | undefined {
        return this.data.numberSounds;
    }

    /**
     * Loads a new arrangement from the given source, which can be:
     *
     * - a full arrangement snapshot (usually from local storage),
     * - a URLSearchParams object from a legacy URL encoding, or
     * - a score entry from the score library, which contains a packed
     *   arrangement snapshot in its content.
     *
     * All formats flow through {@link ArrangementMigrator.migrateToArrangement}.
     * When the source is a score entry and migration was performed the
     * backend content is opportunistically rewritten to the current compact
     * format (if write permissions are available).
     *
     * @param source The source to load the arrangement from.
     *
     * @returns The loaded arrangement, which is also set as the current
     *          arrangement in the data model.
     */
    public loadArrangement(source: IArrangementSnapshot | URLSearchParams | ISbDmScore): ISbDmArrangement {
        const input = this.isScoreEntry(source) ? source.content : source;
        const { arrangement, migrated } = ArrangementMigrator.migrateToArrangement(
            input, this.data.instruments,
        );

        if (migrated && this.isScoreEntry(source)) {
            void this.rewriteMigratedScore(source, arrangement);
        }

        if (this.isScoreEntry(source)) {
            arrangement.id = source.id;
        } else if (this.isArrangementSnapshot(input)) {
            arrangement.id = input.scoreId ?? arrangement.id;
        }

        this.data.arrangement = arrangement;
        this.applyArrangementPlaybackSettings(arrangement);
        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.ScoreLoaded);

        return arrangement;
    }

    /**
     * Replaces the current arrangement with a new, empty one that contains a single track for
     * each of the given instruments.
     *
     * @param instruments The instruments that should appear in the new arrangement.
     * @param options Optional initial title and timing parameters.
     *
     * @returns The new arrangement.
     */
    public startNewArrangement(instruments: ISbDmInstrument[],
        options?: IArrangementCreationOptions): ISbDmArrangement {
        const arrangement = Arrangement.emptyArrangementWithInstruments(instruments, options);
        this.data.arrangement = arrangement;
        this.applyArrangementPlaybackSettings(arrangement);
        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.ScoreLoaded);

        return arrangement;
    }

    /**
     * Sets the arrangement title. Fires {@link arrangementMutated} if changed.
     *
     * @param newTitle The new title for the arrangement.
     *
     * @returns True if the title was changed.
     */
    public setTitle(newTitle: string): boolean {
        const arrangement = this.arrangement;
        if (!arrangement || arrangement.title === newTitle) {
            return false;
        }

        arrangement.title = newTitle;
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Adds a new track for the given instrument to the arrangement.
     *
     * @param instrument The instrument to add a track for.
     *
     * @returns The newly created track.
     */
    public addTrack(instrument: ISbDmInstrument): ISbDmTrack {
        const arrangement = this.arrangement;
        if (!arrangement) {
            throw new Error("No arrangement loaded.");
        }

        const track = arrangement.addTrack(instrument);
        void requisitions.execute("arrangementMutated", undefined);

        return track;
    }

    /**
     * Removes a track from the arrangement.
     *
     * @param track The track to remove.
     *
     * @returns True if the track was removed.
     */
    public removeTrack(track: ISbDmTrack): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        try {
            arrangement.removeTrack(track);
            void requisitions.execute("arrangementMutated", undefined);

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Duplicates a track in the arrangement.
     *
     * @param track The track to duplicate.
     *
     * @returns The duplicated track.
     */
    public duplicateTrack(track: ISbDmTrack): ISbDmTrack {
        const arrangement = this.arrangement;
        if (!arrangement) {
            throw new Error("No arrangement loaded.");
        }

        const newTrack = arrangement.duplicateTrack(track);
        void requisitions.execute("arrangementMutated", undefined);

        return newTrack;
    }

    /**
     * Clears all notes from a single track.
     *
     * @param track The track to clear.
     *
     * @returns True if any notes were cleared.
     */
    public clearTrack(track: ISbDmTrack): boolean {
        if (!this.trackHasContent(track)) {
            return false;
        }

        track.clear();
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Clears all notes from all tracks in the arrangement.
     *
     * @returns True if any notes were cleared.
     */
    public clearAllTracks(): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        if (!arrangement.tracks.some((track) => {
            return this.trackHasContent(track);
        })) {
            return false;
        }

        arrangement.tracks.forEach((track) => {
            track.clear();
        });
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Clears the audio data from a set of selected notes.
     *
     * @param clearSelection A map of tracks to their selected notes to clear.
     *
     * @returns True if any notes were cleared.
     */
    public clearSelection(
        clearSelection: Map<ISbDmTrack, { selectedNotes: Set<ISbDmNoteEvent>; }>,
    ): boolean {
        let changedAnyNotes = false;

        for (const trackSelection of clearSelection.values()) {
            for (const note of trackSelection.selectedNotes) {
                if (note.audioData) {
                    note.audioData = undefined;
                    changedAnyNotes = true;
                }
            }
        }

        if (changedAnyNotes) {
            void requisitions.execute("arrangementMutated", undefined);
        }

        return changedAnyNotes;
    }

    /**
     * Sets or clears the note style at a grid cell.
     *
     * @param trackId The track containing the cell.
     * @param bar The one-based measure number.
     * @param step The zero-based step index.
     * @param noteStyleId The instrument note-style id, or undefined to clear the cell.
     * @param start The exact start fraction when targeting a subdivision slot, which does not
     *     align to grid steps. When omitted the cell is resolved by step.
     *
     * @returns True when the cell changed.
     */
    public setGridNote(trackId: number, bar: number, step: number, noteStyleId?: string,
        start?: IFraction): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!track || !measure || step < 0 || step >= measure.meter.stepResolution) {
            return false;
        }

        const pulse = this.parsePulse(track.arrangement.timeParams.pulse);

        const changed = this.applyGridEdit(measure, pulse, (events, stepsPerBar) => {
            const stepFraction = reduceFraction(step, stepsPerBar);
            const index = events.findIndex((event) => {
                if (start !== undefined) {
                    return compareFractions(event.start, start) === 0;
                }

                return compareFractions(event.start, stepFraction) === 0
                    && event.duration.numerator * stepsPerBar === event.duration.denominator;
            });

            if (index >= 0) {
                events[index].noteStyleId = noteStyleId;
                events[index].articulation = undefined;
            }
        });

        if (changed) {
            void requisitions.execute("trackChanged", track.id);
            void requisitions.execute("arrangementMutated", undefined);
        }

        return changed;
    }

    /**
     * Clears note content across the given step ranges in one edit, turning the affected
     * notes into rests. Clearing a whole measure also removes its subdivisions. Fires one
     * arrangementMutated event (a single undo step) and one trackChanged event per affected
     * track, so viewers recompute their note structure.
     *
     * @param ranges The ranges to clear. Ranges referencing a missing track or measure are ignored.
     *
     * @returns True when at least one step or subdivision changed.
     */
    public clearStepRanges(ranges: IGridClearRange[]): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const affectedTracks = new Set<number>();
        let changed = false;

        for (const range of ranges) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === range.trackId;
            });
            const measure = track?.measures[range.bar - 1];

            if (!track || !measure) {
                continue;
            }

            const pulse = this.parsePulse(track.arrangement.timeParams.pulse);

            const rangeChanged = range.start !== undefined && range.end !== undefined
                ? this.clearFractionRangeContent(measure, pulse, range.start, range.end)
                : range.startStep === undefined || range.endStep === undefined
                    ? this.clearMeasureContent(measure)
                    : this.clearStepRangeContent(measure, pulse, range.startStep, range.endStep);
            if (rangeChanged) {
                changed = true;
                affectedTracks.add(range.trackId);
            }
        }

        if (changed) {
            for (const trackId of affectedTracks) {
                void requisitions.execute("trackChanged", trackId);
            }

            void requisitions.execute("arrangementMutated", undefined);
        }

        return changed;
    }

    /**
     * Sets the note style across the given step ranges in one edit. Fires one arrangementMutated
     * event (a single undo step) and one trackChanged event per affected track. Ranges referencing
     * a missing track or measure are ignored.
     *
     * @param ranges The ranges to fill with the note style.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when at least one step changed.
     */
    public setNoteStyleRanges(ranges: IGridClearRange[], noteStyleId: string): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const affectedTracks = new Set<number>();
        let changed = false;

        for (const range of ranges) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === range.trackId;
            });
            const measure = track?.measures[range.bar - 1];

            if (!track || !measure) {
                continue;
            }

            const pulse = this.parsePulse(track.arrangement.timeParams.pulse);

            const rangeChanged = range.start !== undefined && range.end !== undefined
                ? this.setFractionRangeNoteStyle(measure, pulse, range.start, range.end, noteStyleId)
                : range.startStep === undefined || range.endStep === undefined
                    ? this.setMeasureNoteStyle(measure, pulse, noteStyleId)
                    : this.setStepRangeNoteStyle(measure, pulse, range.startStep, range.endStep, noteStyleId);
            if (rangeChanged) {
                changed = true;
                affectedTracks.add(range.trackId);
            }
        }

        if (changed) {
            for (const trackId of affectedTracks) {
                void requisitions.execute("trackChanged", trackId);
            }

            void requisitions.execute("arrangementMutated", undefined);
        }

        return changed;
    }

    /**
     * Replaces note content across the given step ranges or whole measures in one edit. Fires one
     * arrangementMutated event (a single undo step) and one trackChanged event per affected track.
     * Ranges referencing a missing track or measure are ignored.
     *
     * @param replacements The replacements to apply.
     *
     * @returns True when at least one step changed.
     */
    public replaceMeasureContent(replacements: IMeasureReplace[]): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const affectedTracks = new Set<number>();
        let changed = false;

        for (const replacement of replacements) {
            const measure = arrangement.tracks.find((candidate) => {
                return candidate.id === replacement.trackId;
            })?.measures[replacement.bar - 1];

            if (!measure) {
                continue;
            }

            const rangeChanged = replacement.startStep === undefined || replacement.endStep === undefined
                ? this.replaceWholeMeasure(measure, replacement.events)
                : this.replaceStepRange(measure, replacement.startStep, replacement.endStep, replacement.events);

            if (rangeChanged) {
                changed = true;
                affectedTracks.add(replacement.trackId);
            }
        }

        if (changed) {
            for (const trackId of affectedTracks) {
                void requisitions.execute("trackChanged", trackId);
            }

            void requisitions.execute("arrangementMutated", undefined);
        }

        return changed;
    }

    /**
     * Sets the time signature of the arrangement.
     *
     * @param timeSignature The new time signature string (e.g. "4/4").
     * @param pulse         The pulse value (e.g. "1/4").
     * @param stepResolution The step resolution.
     *
     * @returns True if the time signature was changed.
     */
    public setTimeSignature(timeSignature: string, pulse: string, stepResolution: number): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const tp = arrangement.timeParams;
        if (timeSignature === tp.timeSignature) {
            return false;
        }

        tp.timeSignature = timeSignature;
        tp.pulse = pulse;
        tp.stepResolution = stepResolution;
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Sets the arrangement length in bars.
     *
     * @param length The new length in bars.
     *
     * @returns True if the length was changed.
     */
    public setLength(length: number): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        if (length === arrangement.timeParams.length) {
            return false;
        }

        arrangement.timeParams.length = length;
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Sets the arrangement tempo. Only call this from edit-mode controls.
     *
     * @param tempo The new tempo in BPM.
     *
     * @returns True if the tempo was changed.
     */
    public setTempo(tempo: number): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        if (tempo === arrangement.timeParams.tempo) {
            return false;
        }

        arrangement.timeParams.tempo = tempo;
        void requisitions.execute("arrangementMutated", undefined);

        return true;
    }

    /**
     * Inserts a number of bars before or after the given bar.
     *
     * @param barNumber The 1-based bar the new bars are inserted relative to.
     * @param count The number of bars to insert.
     * @param before True to insert before barNumber, false to insert after it.
     * @param copyContent True to copy the content of the preceding bar into the new bars.
     */
    public insertBars(barNumber: number, count: number, before: boolean, copyContent: boolean): void {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return;
        }

        (arrangement as Arrangement).insertBars(barNumber, count, before, copyContent);
        void requisitions.execute("arrangementMutated", undefined);
    }

    /**
     * Deletes the given bar from the arrangement.
     *
     * @param barNumber The 1-based bar to delete.
     */
    public deleteBar(barNumber: number): void {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return;
        }

        if (arrangement.timeParams.length <= 1) {
            return;
        }

        (arrangement as Arrangement).deleteBar(barNumber);
        void requisitions.execute("arrangementMutated", undefined);
    }

    /**
     * Removes all notes and subdivisions from the given bar.
     *
     * @param barNumber The 1-based bar to clear.
     */
    public clearBar(barNumber: number): void {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return;
        }

        (arrangement as Arrangement).clearBar(barNumber);
        void requisitions.execute("arrangementMutated", undefined);
    }

    /**
     * Duplicates the given bar, inserting the copy right after it.
     *
     * @param barNumber The 1-based bar to duplicate.
     */
    public duplicateBar(barNumber: number): void {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return;
        }

        (arrangement as Arrangement).duplicateBar(barNumber);
        void requisitions.execute("arrangementMutated", undefined);
    }

    /**
     * Fetches a single score entry from the backend by its database id.
     * This bypasses the in-memory score library and is intended for
     * direct URL-based loading (e.g. `?score=<id>`).
     *
     * @param id The score's database id.
     *
     * @returns A tuple of the score entry (or undefined) and the HTTP
     *          status code (0 if the request didn't complete).
     */
    public async fetchScoreById(id: number): Promise<[ISbDmScore | undefined, number]> {
        const res = await this.fetchApi(`/api?action=getScore&id=${id}`, {
            method: "POST",
            headers: { Accept: "application/json" },
        }, true, true);

        if (!res) {
            return [undefined, 0];
        }

        if (!res.ok) {
            return [undefined, res.status];
        }

        const data = await res.json() as {
            id: number; folderid: number | null; name: string; content: string;
            perm: ISbDmPermissionInfo;
        };

        const score: ISbDmScore = {
            type: SbDmEntityType.Score,
            id: data.id,
            name: data.name,
            state: {
                initialized: true,
                expanded: true,
                expandedOnce: true,
                isLeaf: true,
            },
            content: data.content,
            perm: data.perm,
        };

        return [score, res.status];
    }

    /**
     * Adds a new score folder to the data model.
     *
     * @param name The name of the new folder.
     * @param parent The parent folder to add the new folder to. If not given, the new folder is added to the root.
     */
    public async addScoreFolder(name: string, parent?: ISbDmScoreFolder): Promise<void> {
        // Before adding the new folder check if a folder with the same name already exists.
        const siblings = parent ? parent.children : this.data.scoreLib;
        const existing = siblings.find((entry) => {
            return entry.type === SbDmEntityType.ScoreFolder && entry.name === name;
        });

        if (existing) {
            throw new Error(`A folder named '${name}' already exists in the target location.`);
        }

        const res = await this.fetchApi(`/api?action=addScoreFolder`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name, parentid: parent?.id }),
        });

        if (!res) {
            return;
        }

        const { success, id } = await res.json() as { success: boolean; id: number; };
        if (success) {
            const newFolder: ISbDmScoreFolder = {
                type: SbDmEntityType.ScoreFolder,
                id,
                name,
                parent,
                state: {
                    initialized: true,
                    isLeaf: true,
                    expanded: false,
                    expandedOnce: false,
                },
                children: [],
            };

            if (!parent) {
                this.data.scoreLib.push(newFolder);

                return;
            }

            parent.children.push(newFolder);
            await this.refreshScoreLib();
        }
    }

    public async addScore(name: string, content: string, parent?: ISbDmScoreFolder): Promise<void> {
        const res = await this.fetchApi(`/api?action=addScore`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name, content, folderId: parent?.id }),
        });

        if (!res) {
            return;
        }

        const { success, id } = await res.json() as { success: boolean; id: number; };
        if (success) {
            if (this.data.arrangement) {
                (this.data.arrangement as Arrangement).id = id;
            }

            const newScore: ISbDmScore = {
                type: SbDmEntityType.Score,
                id,
                name,
                content,
                parent,
                state: {
                    initialized: true,
                    isLeaf: true,
                    expanded: true,
                    expandedOnce: true,
                },
            };

            if (!parent) {
                this.data.scoreLib.push(newScore);
            } else {
                parent.children.push(newScore);
            }

            await this.refreshScoreLib();
        }
    }

    /**
     * Persists a new `content` payload for an existing score.
     *
     * On success the in-memory entry is updated so subsequent reads see the new format.
     *
     * @param score The score entry whose content should be replaced.
     * @param content The new content string to persist.
     */
    public async updateScoreContent(score: ISbDmScore, content: string): Promise<void> {
        const body: Record<string, unknown> = { id: score.id, content };

        if (this.lockToken) {
            body.token = this.lockToken;
        }

        const res = await this.fetchApi(`/api?action=updateScore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, true, true);

        if (!res) {
            return;
        }

        if (res.status === 409) {
            const data = await res.json() as { error?: string; };

            throw new Error(data.error ?? "Score is locked by another user.");
        }

        if (!res.ok) {
            return;
        }

        score.content = content;
    }

    public async renameEntry(entry: ISbDmScoreFolder | ISbDmScore, newName: string): Promise<void> {
        const res = await this.fetchApi(`/api?action=renameEntry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score",
                id: entry.id,
                name: newName,
            }),
        });

        if (!res) {
            return;
        }

        entry.name = newName;
        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.EntryRenamed);
    }

    /**
     * Resets the database by dropping and recreating all tables.
     * This is a destructive operation — all data is lost.
     *
     * @returns True if the reset succeeded.
     */
    public async resetDatabase(): Promise<boolean> {
        const res = await this.fetchApi("/api?action=setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overwrite: true }),
        });

        return res?.ok === true;
    }

    public async deleteEntry(entry: ISbDmScoreFolder | ISbDmScore): Promise<void> {
        // Check if the entry has children.
        if (entry.type === SbDmEntityType.ScoreFolder && entry.children.length > 0) {
            throw new Error("Cannot delete a folder that still has children.");
        }

        const res = await this.fetchApi(`/api?action=delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score",
                id: entry.id,
            }),
        });

        if (!res) {
            return;
        }

        const parentChildren = entry.parent ? entry.parent.children : this.data.scoreLib;
        const index = parentChildren.findIndex((e) => {
            return e.id === entry.id;
        });

        if (index >= 0) {
            parentChildren.splice(index, 1);
            void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.EntryDeleted);
        }
    }

    /**
     * Recursively clears explicit permissions and group assignments from all
     * child folders and scores of the given folder, so they inherit from their
     * respective parents. The folder's own permissions are left untouched.
     *
     * @param folderId The folder whose descendants should have their permissions reset.
     *
     * @returns The number of folders and scores that were reset.
     */
    public async resetChildPermissions(folderId: number): Promise<{ resetFolders: number; resetScores: number; }> {
        const res = await this.fetchApi("/api?action=resetChildPermissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
        });

        if (!res?.ok) {
            if (!res) {
                throw new Error("Backend unreachable.");
            }

            const data = await res.json() as { error?: string; };

            throw new Error(data.error ?? "Failed to reset child permissions.");
        }

        return await res.json() as { resetFolders: number; resetScores: number; };
    }

    /**
     * Fetches the explicit (non-inherited) permissions for an entity.
     * Owners and admins can call this.
     *
     * @param entityType "score" or "folder".
     * @param entityId   The entity's database id.
     *
     * @returns The permission decomposition, or null if none exists.
     */
    public async getPermissions(entityType: string, entityId: number): Promise<IPermissionDecomposition | null> {
        const res = await this.fetchApi(
            `/api?action=getPermissions&entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`,
            { method: "POST" },
        );

        if (!res?.ok) {
            return null;
        }

        const data = await res.json() as { permission: IPermissionDecomposition | null; };

        return data.permission ?? null;
    }

    /**
     * Sets permissions for a score library entity. Owner or admin only.
     *
     * @param entityType   "score" or "folder".
     * @param entityId     The entity's database id.
     * @param ownerId      The new owner id, or null to inherit from parent. Omit to leave unchanged.
     * @param addGroups    Groups to add with writable flag.
     * @param removeGroups Group ids to remove from the entity.
     */
    public async setPermissions(entityType: string, entityId: number,
        ownerId?: number | null,
        addGroups?: Array<{ groupId: number; writable: boolean; }>,
        removeGroups?: Array<{ groupId: number; }>,
    ): Promise<void> {
        const body: Record<string, unknown> = { entityType, entityId };

        if (ownerId !== undefined) {
            body.ownerId = ownerId;
        }

        if (addGroups) {
            body.addGroups = addGroups;
        }

        if (removeGroups) {
            body.removeGroups = removeGroups;
        }

        const res = await this.fetchApi("/api?action=setPermissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res?.ok) {
            const data = await res?.json() as { error?: string; };

            throw new Error(data.error ?? "Failed to set permissions.");
        }
    }

    /**
     * Directly sets the session from a token and user info returned by
     * createInitialAdmin, without going through the normal login flow.
     *
     * @param token        The access token.
     * @param user         The user info.
     * @param capabilities The capabilities.
     */
    public setSession(token: string, user: IUserInfo, capabilities: ICapabilities): void {
        this.accessToken = token;
        this.currentUser = user;
        this.currentCapabilities = capabilities;

        void requisitions.execute("authChanged", undefined);
    }

    /**
     * Retrieves an instrument by its ID.
     *
     * @param id The ID of the instrument.
     * @returns The instrument if found, otherwise undefined.
     */
    public getInstrument(id: number | string): ISbDmInstrument | undefined {
        return this.data.instruments.find((inst) => {
            return inst.id === id;
        });
    }

    /**
     * Authenticates the user with the backend.
     *
     * On success the access token, user info and capabilities are stored in memory.
     * The refresh token is stored by the backend in an httpOnly cookie.
     *
     * @param username The username.
     * @param password The password.
     * @returns True if login was successful.
     */
    public async login(username: string, password: string): Promise<boolean> {
        const res = await this.fetchApi("/api?action=login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        }, false); // Don't attach auth header for login request.

        if (!res) {
            return false;
        }

        const data = await res.json() as ILoginResponse;

        this.accessToken = data.token;
        this.currentUser = data.user;
        this.currentGroup = undefined;
        this.currentCapabilities = data.capabilities;

        sessionStorage.removeItem("authType");
        sessionStorage.removeItem("groupId");

        void requisitions.execute("authChanged", undefined);

        return true;
    }

    /**
     * Authenticates using a group name and its shared password.
     * Logs in as the anonymous user but with the group's permissions.
     *
     * @param groupName The group name.
     * @param password  The group's shared password.
     * @returns True if login was successful.
     */
    public async groupLogin(groupName: string, password: string): Promise<boolean> {
        const res = await this.fetchApi("/api?action=groupLogin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ groupName, password }),
        }, false);

        if (!res) {
            return false;
        }

        const data = await res.json() as ILoginResponse;

        this.accessToken = data.token;
        this.currentUser = data.user;
        this.currentGroup = data.group;
        this.currentCapabilities = data.capabilities;

        sessionStorage.setItem("authType", "group");
        sessionStorage.setItem("groupId", String(data.group?.id ?? ""));

        void requisitions.execute("authChanged", undefined);

        return true;
    }

    /**
     * Logs out the current user and clears all auth state.
     */
    public async logout(): Promise<void> {
        // Notify the backend to clear the refresh token cookie.
        await this.fetchApi("/api?action=logout", { method: "POST" });

        this.accessToken = undefined;
        this.currentUser = undefined;
        this.currentGroup = undefined;
        this.currentCapabilities = {
            canEditScores: false,
            canManageUsers: false,
            canManageInstruments: false,
            canExportMP3: false,
        };

        sessionStorage.removeItem("authType");
        sessionStorage.removeItem("groupId");

        void requisitions.execute("authChanged", undefined);
    }

    /**
     * Resets the entire data model to its initial, unloaded state.
     * Clears all loaded data (scores, instruments, sound library, arrangement,
     * undo manager state) so a fresh login can reload everything.
     */
    public reset(): void {
        this.data = {
            soundLib: [],
            scoreLib: [],
            instruments: [],
        };

        this.accessToken = undefined;
        this.currentUser = undefined;
        this.currentGroup = undefined;
        this.currentCapabilities = {
            canEditScores: false,
            canManageUsers: false,
            canManageInstruments: false,
            canExportMP3: false,
        };

        sessionStorage.removeItem("authType");
        sessionStorage.removeItem("groupId");

        void requisitions.execute("authChanged", undefined);
    }

    /**
     * Fetches the current auth state from the backend.
     * Use this on app startup to restore a session from the refresh token cookie.
     *
     * @returns True if the session was restored.
     */
    public async restoreSession(): Promise<boolean> {
        // refreshAccessToken uses the httpOnly refresh cookie to get a new access token,
        // then calls whoami with it to populate user + capabilities.
        const restored = await this.refreshAccessToken();

        if (!restored) {
            // No valid session — fetch anonymous capabilities.
            const res = await this.fetchApi("/api?action=whoami", {
                headers: { Accept: "application/json" },
                credentials: "include",
            }, false);

            if (res) {
                const data = await res.json() as IWhoamiResponse;

                this.currentGroup = undefined;
                this.currentCapabilities = data.capabilities;
            }
        }

        void requisitions.execute("authChanged", undefined);

        return restored;
    }

    public async listUsers(): Promise<IUserRow[]> {
        const res = await this.fetchApi("/api?action=listUsers", { method: "POST" });

        if (!res) {
            return [];
        }

        const data = await res.json() as { users?: IUserRow[]; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return data.users ?? [];
    }

    /**
     * Creates a new user. Admin-only.
     *
     * @param username    The username (min 3 chars).
     * @param password    The password (min 6 chars).
     * @param displayName The display name.
     * @returns The new user's id.
     */
    public async createUser(username: string, password: string, displayName: string,
    ): Promise<number> {
        const res = await this.fetchApi("/api?action=createUser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, displayName }),
        });

        if (!res) {
            throw new Error("Backend unreachable.");
        }

        const data = await res.json() as { success?: boolean; id?: number; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return data.id!;
    }

    /**
     * Updates an existing user. Admin-only.
     *
     * @param id                 The user id.
     * @param fields             Fields to update.
     * @param fields.displayName The new display name (optional).
     * @param fields.password    The new password, if changing (optional).
     */
    public async updateUser(id: number, fields: {
        displayName?: string; password?: string;
    },): Promise<void> {
        const body: Record<string, unknown> = { id };

        if (fields.displayName !== undefined) {
            body.displayName = fields.displayName;
        }

        if (fields.password) {
            body.password = fields.password;
        }

        const res = await this.fetchApi("/api?action=updateUser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res) {
            return;
        }

        const data = await res.json() as { error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }
    }

    /**
     * Deletes a user. Admin-only.
     *
     * @param id The user id.
     */
    public async deleteUser(id: number): Promise<void> {
        const res = await this.fetchApi("/api?action=deleteUser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        if (!res) {
            return;
        }

        const data = await res.json() as { error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }
    }

    /**
     * Lists groups that have a shared password set. Public endpoint.
     *
     * @returns The list of group names.
     */
    public async listPublicGroups(): Promise<string[]> {
        const res = await this.fetchApi("/api?action=listPublicGroups", { method: "POST" }, false);

        if (!res) {
            return [];
        }

        const data = await res.json() as { groups?: string[]; };

        return data.groups ?? [];
    }

    /**
     * Lists all groups. Admin-only.
     *
     * @returns The list of group rows.
     */
    public async listGroups(): Promise<IGroupRow[]> {
        const res = await this.fetchApi("/api?action=listGroups", { method: "POST" });

        if (!res) {
            return [];
        }

        const data = await res.json() as { groups?: IGroupRow[]; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return data.groups ?? [];
    }

    /**
     * Creates a new group. Admin-only.
     *
     * @param name        The group name.
     * @param description The group description (optional).
     * @param color       The group color (optional, random if omitted).
     * @param password    The group password (optional, no password if omitted).
     * @param adminId     The user id of the group admin (optional, no admin if omitted).
     * @returns The new group's id and color.
     */
    public async createGroup(name: string, description: string, color?: string,
        password?: string, adminId?: number | null,
    ): Promise<{ id: number; color: string; }> {
        const body: Record<string, unknown> = { name, description };

        if (color) {
            body.color = color;
        }

        if (password) {
            body.password = password;
        }

        if (adminId !== undefined) {
            body.adminId = adminId;
        }

        const res = await this.fetchApi("/api?action=createGroup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res) {
            throw new Error("Backend unreachable.");
        }

        const data = await res.json() as { success?: boolean; id?: number; color?: string; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return { id: data.id!, color: data.color! };
    }

    /**
     * Updates an existing group. Admin-only.
     *
     * @param id                  The group id.
     * @param fields              Fields to update.
     * @param fields.name         The new name (optional).
     * @param fields.description  The new description (optional).
     * @param fields.color        The new color (optional).
     * @param fields.password     The new password, or null to remove (optional).
     * @param fields.adminId      The new admin user ID, or null to remove (optional).
     */
    public async updateGroup(id: number, fields: {
        name?: string; description?: string; color?: string;
        password?: string | null; adminId?: number | null;
    },): Promise<void> {
        const body: Record<string, unknown> = { id };

        if (fields.name !== undefined) {
            body.name = fields.name;
        }

        if (fields.description !== undefined) {
            body.description = fields.description;
        }

        if (fields.color !== undefined) {
            body.color = fields.color;
        }

        if (fields.password !== undefined) {
            body.password = fields.password;
        }

        if (fields.adminId !== undefined) {
            body.adminId = fields.adminId;
        }

        const res = await this.fetchApi("/api?action=updateGroup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res) {
            return;
        }

        const data = await res.json() as { error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }
    }

    /**
     * Deletes a group. Admin-only.
     *
     * @param id The group id.
     */
    public async deleteGroup(id: number): Promise<void> {
        const res = await this.fetchApi("/api?action=deleteGroup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        if (!res) {
            return;
        }

        const data = await res.json() as { error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }
    }

    /**
     * Adds a user to a group. Admin-only.
     *
     * @param userId  The user id.
     * @param groupId The group id.
     */
    public async addUserToGroup(userId: number, groupId: number): Promise<void> {
        await this.fetchApi("/api?action=addUserToGroup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, groupId }),
        });
    }

    /**
     * Removes a user from a group. Admin-only.
     *
     * @param userId  The user id.
     * @param groupId The group id.
     */
    public async removeUserFromGroup(userId: number, groupId: number): Promise<void> {
        await this.fetchApi("/api?action=removeUserFromGroup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, groupId }),
        });
    }

    /**
     * Lists the members of a group. Admin-only.
     *
     * @param groupId The group id.
     * @returns The list of member rows.
     */
    public async listGroupMembers(groupId: number): Promise<IGroupMember[]> {
        const res = await this.fetchApi(
            `/api?action=listGroupMembers&groupId=${groupId}`, { method: "POST" },
        );

        if (!res) {
            return [];
        }

        const data = await res.json() as { members?: IGroupMember[]; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return data.members ?? [];
    }

    /**
     * Rewrites a score whose content was just migrated from a legacy format
     * to the current compact representation. Failures are silently ignored —
     * the legacy content remains intact and will be retried on the next load.
     *
     * @param score       The score entry whose content should be rewritten.
     * @param arrangement The already-migrated arrangement to serialize.
     */

    /**
     * Refreshes the root level of the score library from the backend.
     * Useful after permission changes to reflect updated visibility.
     */
    public async refreshScoreLib(): Promise<void> {
        const freshList: Array<ISbDmScoreFolder | ISbDmScore> = [];
        await this.updateScoreLibFolder(freshList);
        this.data.scoreLib = freshList;
        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.LibraryRefreshed);
    }

    /**
     * Acquires an edit lock for a score. Returns the lock token on success, or conflict info
     * if another user holds the lock.
     *
     * @param scoreId The ID of the score to lock.
     * @param prevToken An optional previous token to attempt renewal of an expired lock.
     *
     * @returns Lock result with token or conflict details.
     */
    public async lockScore(scoreId: number, prevToken?: string): Promise<{
        success: boolean; token?: string; locked?: boolean; username?: string; lockedAt?: string;
    }> {
        const body: Record<string, unknown> = { scoreId };

        if (prevToken) {
            body.prevToken = prevToken;
        }

        const res = await this.fetchApi("/api?action=lockScore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, true, true);

        if (!res) {
            return { success: false };
        }

        return res.json() as unknown as {
            success: boolean; token?: string; locked?: boolean; username?: string;
            lockedAt?: string;
        };
    }

    /**
     * Releases an edit lock for a score.
     *
     * @param scoreId The ID of the score to unlock.
     * @param token The lock token to verify ownership.
     */
    public async unlockScore(scoreId: number, token: string): Promise<void> {
        await this.fetchApi("/api?action=unlockScore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scoreId, token }),
        });
    }

    /**
     * Writes the current arrangement snapshot to the cached score in AppStorage.
     * Keeps the cached copy in sync so a page reload restores the latest state.
     */
    public persistCurrentScore(): void {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return;
        }

        AppStorage.saveSetting("currentScore",
            stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()));
    }

    /**
     * Persists the current arrangement to the backend.
     *
     * - For new arrangements (id &lt; 10000): creates a score entry via {@link addScore},
     *   which assigns a permanent ID.
     * - For existing scores (id &ge; 10000): updates the score content via the
     *   `updateScore` API, attaching the active lock token.
     *
     * @returns The packed arrangement string that was saved, or undefined if the save failed or no
     *          arrangement is loaded.
     */
    public async saveArrangement(): Promise<string | undefined> {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const content = stringifyPackedArrangement((arrangement as Arrangement).toSnapshot());

        if (arrangement.id < 10000) {
            // First-time save — create a new score entry in the database.
            const res = await this.fetchApi("/api?action=addScore", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: JSON.stringify({ name: arrangement.title || "Untitled", content }),
            });

            if (!res) {
                return undefined;
            }

            const data = await res.json() as { success: boolean; id: number; };
            if (!data.success) {
                return undefined;
            }

            (arrangement as Arrangement).id = data.id;

            await this.refreshScoreLib();

            return content;
        }

        // Existing score — update in-place with lock token.
        const body: Record<string, unknown> = { id: arrangement.id, content };

        if (this.lockToken) {
            body.token = this.lockToken;
        }

        const res = await this.fetchApi("/api?action=updateScore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, true, true);

        if (!res) {
            return undefined;
        }

        if (res.status === 404) {
            // Score was deleted from the backend — re-create it as a new entry.
            return this.addScoreAsNew(arrangement, content);
        }

        if (res.status === 409) {
            const data = await res.json() as { error?: string; };

            throw new Error(data.error ?? "Score is locked by another user.");
        }

        if (!res.ok) {
            return undefined;
        }

        // Keep the score library entry name in sync with the arrangement title.
        await this.syncScoreLibName(arrangement.id, arrangement.title);

        return content;
    }

    /**
     * Clears all note content from a measure, leaving a single whole rest.
     *
     * @param measure The measure to clear.
     *
     * @returns True when the measure had any content.
     */
    private clearMeasureContent(measure: ISbDmTrackMeasure): boolean {
        const wholeRest: IMeasureEvent[] = [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 1 },
        }];

        return this.setMeasureEvents(measure, wholeRest, false);
    }

    /**
     * Clears the note content of a contiguous step range, turning it into a rest. Works on the
     * per-step grid representation, so each step is cleared independently and the note-based score
     * is synthesised afterwards.
     *
     * @param measure The measure containing the steps.
     * @param pulse The parsed pulse fraction.
     * @param startStep The first step index to clear (inclusive).
     * @param endStep The last step index to clear (inclusive).
     *
     * @returns True when any event changed.
     */
    private clearStepRangeContent(measure: ISbDmTrackMeasure, pulse: IFraction, startStep: number,
        endStep: number): boolean {
        return this.applyGridEdit(measure, pulse, (events, stepsPerBar) => {
            for (let step = startStep; step <= endStep; step++) {
                const stepFraction = reduceFraction(step, stepsPerBar);
                const index = events.findIndex((event) => {
                    return compareFractions(event.start, stepFraction) === 0
                        && event.duration.numerator * stepsPerBar === event.duration.denominator;
                });

                if (index >= 0) {
                    events[index].noteStyleId = undefined;
                    events[index].articulation = undefined;
                }
            }
        });
    }

    /**
     * Clears the note content of an exact fractional range, turning it into a rest. Unlike a step
     * range this can target a single subdivision slot, whose boundaries do not align to grid steps.
     *
     * @param measure The measure containing the range.
     * @param pulse The parsed pulse fraction.
     * @param start The exact start position as a fraction.
     * @param end The exact end position (exclusive) as a fraction.
     *
     * @returns True when any event changed.
     */
    private clearFractionRangeContent(measure: ISbDmTrackMeasure, pulse: IFraction, start: IFraction,
        end: IFraction): boolean {
        return this.applyGridEdit(measure, pulse, (events) => {
            for (const event of events) {
                const eventEnd = addFractions(event.start, event.duration);

                if (compareFractions(event.start, start) >= 0 && compareFractions(eventEnd, end) <= 0) {
                    event.noteStyleId = undefined;
                    event.articulation = undefined;
                }
            }
        });
    }

    /**
     * Applies a note style to every step of a measure.
     *
     * @param measure The measure to fill.
     * @param pulse The parsed pulse fraction.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any event changed.
     */
    private setMeasureNoteStyle(measure: ISbDmTrackMeasure, pulse: IFraction, noteStyleId: string): boolean {
        return this.applyGridEdit(measure, pulse, (events) => {
            for (const event of events) {
                event.noteStyleId = noteStyleId;
                event.articulation = undefined;
            }
        });
    }

    /**
     * Applies a note style to a contiguous step range.
     *
     * @param measure The measure containing the steps.
     * @param pulse The parsed pulse fraction.
     * @param startStep The first step index to set (inclusive).
     * @param endStep The last step index to set (inclusive).
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any event changed.
     */
    private setStepRangeNoteStyle(measure: ISbDmTrackMeasure, pulse: IFraction, startStep: number,
        endStep: number, noteStyleId: string): boolean {
        return this.applyGridEdit(measure, pulse, (events, stepsPerBar) => {
            for (let step = startStep; step <= endStep; step++) {
                const stepFraction = reduceFraction(step, stepsPerBar);
                const index = events.findIndex((event) => {
                    return compareFractions(event.start, stepFraction) === 0
                        && event.duration.numerator * stepsPerBar === event.duration.denominator;
                });

                if (index >= 0) {
                    events[index].noteStyleId = noteStyleId;
                    events[index].articulation = undefined;
                }
            }
        });
    }

    /**
     * Applies a note style to an exact fractional range.
     *
     * @param measure The measure containing the range.
     * @param pulse The parsed pulse fraction.
     * @param start The exact start position as a fraction.
     * @param end The exact end position (exclusive) as a fraction.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any event changed.
     */
    private setFractionRangeNoteStyle(measure: ISbDmTrackMeasure, pulse: IFraction, start: IFraction,
        end: IFraction, noteStyleId: string): boolean {
        return this.applyGridEdit(measure, pulse, (events) => {
            for (const event of events) {
                const eventEnd = addFractions(event.start, event.duration);

                if (compareFractions(event.start, start) >= 0 && compareFractions(eventEnd, end) <= 0) {
                    event.noteStyleId = noteStyleId;
                    event.articulation = undefined;
                }
            }
        });
    }

    /**
     * Applies a mutation to the measure's per-step grid representation and synthesises the result
     * back into the note-based score. This is the single entry point for grid editing: notes are
     * split into one note step plus empty rest steps, edited independently, and then re-merged so
     * that actions which change nothing leave the measure untouched.
     *
     * @param measure The measure to edit.
     * @param pulse The parsed pulse fraction.
     * @param mutate Callback receiving the per-step events and the step resolution.
     *
     * @returns True when the measure changed.
     */
    private applyGridEdit(measure: ISbDmTrackMeasure, pulse: IFraction,
        mutate: (events: IMeasureEvent[], stepsPerBar: number) => void): boolean {
        const stepsPerBar = measure.meter.stepResolution;
        const { events: expanded, subdivisions, slotIndices } = expandMeasureToGridEvents(measure);

        mutate(expanded, stepsPerBar);

        const { events: synthesised, subdivisions: synthesisedSubdivisions } = synthesizeGridEventsToMeasure(
            expanded, subdivisions, slotIndices, pulse, stepsPerBar,
        );

        if (this.eventsEqual(measure.events, synthesised)) {
            return false;
        }

        measure.events.splice(0, measure.events.length, ...synthesised.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length,
            ...synthesisedSubdivisions.map((subdivision) => {
                return { ...subdivision };
            }));

        return true;
    }

    /**
     * Replaces the entire content of a measure with the given events.
     *
     * @param measure The measure to replace.
     * @param events The replacement events, in display order.
     *
     * @returns True when the measure changed.
     */
    private replaceWholeMeasure(measure: ISbDmTrackMeasure, events: IMeasureEvent[]): boolean {
        return this.setMeasureEvents(measure, events, false);
    }

    /**
     * Replaces the content of a contiguous step range with the given events. The replacement
     * events are positioned relative to the range start.
     *
     * @param measure The measure containing the steps.
     * @param startStep The first step index to replace (inclusive).
     * @param endStep The last step index to replace (inclusive).
     * @param events The replacement events, relative to the range start.
     *
     * @returns True when the measure changed.
     */
    private replaceStepRange(measure: ISbDmTrackMeasure, startStep: number, endStep: number,
        events: IMeasureEvent[]): boolean {
        const stepsPerBar = measure.meter.stepResolution;
        const start = reduceFraction(startStep, stepsPerBar);
        const end = reduceFraction(endStep + 1, stepsPerBar);

        const shifted = events.map((event) => {
            return this.cloneEvent({ ...event, start: addFractions(start, event.start) });
        });

        const result: IMeasureEvent[] = [];
        for (const event of measure.events) {
            if (compareFractions(addFractions(event.start, event.duration), start) <= 0) {
                result.push(this.cloneEvent(event));
            }
        }

        result.push(...shifted);

        for (const event of measure.events) {
            if (compareFractions(event.start, end) >= 0) {
                result.push(this.cloneEvent(event));
            }
        }

        return this.setMeasureEvents(measure, result);
    }

    private sameArticulation(a: INoteArticulation | undefined, b: INoteArticulation | undefined): boolean {
        if (a === undefined || b === undefined) {
            return a === b;
        }

        return a.damping === b.damping && a.accent === b.accent && a.ghost === b.ghost;
    }

    private trackHasContent(track: ISbDmTrack): boolean {
        return track.measures.some((measure) => {
            return measure.events.some((event) => {
                return event.noteStyleId !== undefined || event.articulation !== undefined;
            }) || measure.subdivisions.length > 0;
        });
    }

    private setMeasureEvents(measure: ISbDmTrackMeasure, events: IMeasureEvent[],
        preserveSubdivisions = true): boolean {
        if (this.eventsEqual(measure.events, events)) {
            return false;
        }

        // Subdivisions reference their first event by index. Replacing events can shift those
        // indices, so remap each subdivision to the new index of its first event's start time.
        // Subdivisions whose first event no longer exists are dropped.
        const remappedSubdivisions: ISubdivision[] = [];

        if (preserveSubdivisions) {
            for (const subdivision of measure.subdivisions) {
                if (subdivision.startIndex < 0 || subdivision.startIndex >= measure.events.length) {
                    continue;
                }

                const startEvent = measure.events[subdivision.startIndex];
                const startIndex = events.findIndex((event) => {
                    return compareFractions(event.start, startEvent.start) === 0;
                });

                if (startIndex >= 0) {
                    remappedSubdivisions.push({ ...subdivision, startIndex });
                }
            }
        }

        measure.events.splice(0, measure.events.length, ...events.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length, ...remappedSubdivisions);

        return true;
    }

    private cloneEvent(event: IMeasureEvent): IMeasureEvent {
        return {
            start: { ...event.start },
            duration: { ...event.duration },
            noteStyleId: event.noteStyleId,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        };
    }

    private eventsEqual(a: IMeasureEvent[], b: IMeasureEvent[]): boolean {
        const mergedA = this.mergeAdjacentRests(a);
        const mergedB = this.mergeAdjacentRests(b);

        if (mergedA.length !== mergedB.length) {
            return false;
        }

        for (let index = 0; index < mergedA.length; index++) {
            const left = mergedA[index];
            const right = mergedB[index];
            if (left.noteStyleId !== right.noteStyleId
                || !this.fractionsEqual(left.start, right.start)
                || !this.fractionsEqual(left.duration, right.duration)
                || !this.sameArticulation(left.articulation, right.articulation)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Merges adjacent rest events into a single event. Two event lists that differ only in how
     * their rests are fragmented represent the same musical content and must compare as equal.
     *
     * @param events The events to normalise.
     *
     * @returns A copy of the events with adjacent rests merged.
     */
    private mergeAdjacentRests(events: IMeasureEvent[]): IMeasureEvent[] {
        const result: IMeasureEvent[] = [];

        for (const event of events) {
            const last = result.at(-1);

            if (last !== undefined && last.noteStyleId === undefined && event.noteStyleId === undefined) {
                last.duration = subtractFractions(addFractions(event.start, event.duration), last.start);
            } else {
                result.push(this.cloneEvent(event));
            }
        }

        return result;
    }

    private fractionsEqual(a: IFraction, b: IFraction): boolean {
        return a.numerator * b.denominator === b.numerator * a.denominator;
    }

    private parsePulse(pulse: string): IFraction {
        const [numerator, denominator] = pulse.split("/").map(Number);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
            return { numerator: 1, denominator: 4 };
        }

        return reduceFraction(numerator, denominator);
    }

    /**
     * Creates a new score entry on the backend for an arrangement that was previously saved but
     * whose backend record no longer exists (e.g. deleted by another user). The arrangement gets
     * a new permanent ID and the score library is refreshed.
     *
     * @param arrangement The local arrangement to persist.
     * @param content     The packed arrangement content string.
     *
     * @returns The content string on success, or undefined on failure.
     */
    private async addScoreAsNew(arrangement: ISbDmArrangement, content: string): Promise<string | undefined> {
        const res = await this.fetchApi("/api?action=addScore", {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name: arrangement.title || "Untitled", content }),
        });

        if (!res) {
            return undefined;
        }

        const data = await res.json() as { success: boolean; id: number; };
        if (!data.success) {
            return undefined;
        }

        (arrangement as Arrangement).id = data.id;

        await this.refreshScoreLib();

        // Re-serialize with the new ID so that AppStorage and future saves use the correct ID.
        return stringifyPackedArrangement((arrangement as Arrangement).toSnapshot());
    }

    /**
     * Updates the score library entry name to match the arrangement title, if they differ.
     * This keeps the library display in sync with the arrangement after a save.
     *
     * @param scoreId The database ID of the score.
     * @param title   The current arrangement title.
     */
    private async syncScoreLibName(scoreId: number, title: string): Promise<void> {
        const score = this.findScoreInLib(this.data.scoreLib, scoreId);
        if (!score || score.name === title) {
            return;
        }

        // Persist the name change on the backend.
        const res = await this.fetchApi("/api?action=renameEntry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "score", id: scoreId, name: title }),
        });

        if (res) {
            score.name = title;
            void requisitions.execute("scoreEntryUpdated", score);
        }
    }

    private findScoreInLib(entries: Array<ISbDmScoreFolder | ISbDmScore>, id: number): ISbDmScore | undefined {
        for (const entry of entries) {
            if (entry.type === SbDmEntityType.Score && entry.id === id) {
                return entry;
            }

            if (entry.type === SbDmEntityType.ScoreFolder) {
                const found = this.findScoreInLib(entry.children, id);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    }

    private async rewriteMigratedScore(score: ISbDmScore, arrangement: Arrangement): Promise<void> {
        if (!this.canWriteScores) {
            return;
        }

        try {
            await this.updateScoreContent(score, stringifyPackedArrangement(arrangement.toSnapshot()));
        } catch {
            // Opportunistic rewrite — keep the legacy content if anything fails.
        }
    }

    private isScoreEntry(source: unknown): source is ISbDmScore {
        if (!source || typeof source !== "object") {
            return false;
        }

        const candidate = source as Partial<ISbDmScore>;

        return candidate.type === SbDmEntityType.Score
            && typeof candidate.content === "string";
    }

    private isArrangementSnapshot(source: unknown): source is IArrangementSnapshot {
        if (!source || typeof source !== "object") {
            return false;
        }

        const candidate = source as Partial<IArrangementSnapshot>;

        return typeof candidate.scoreId === "number";
    }

    /**
     * Loads the entire sound library from the server and populates the sound lib data model part.
     *
     * @returns A promise that resolves once loading is complete.
     */
    private async loadSoundLib(): Promise<void> {
        if (this.data.soundLib.length > 0) {
            return Promise.resolve();
        }

        const res = await this.fetchApi(`/api?action=listSoundLib`, {
            headers: { Accept: "application/json" },
        });

        if (!res) {
            return;
        }

        const data = (await res.json()) as ISoundLibFsNode[];

        return new Promise<void>((resolve, reject) => {
            // Convert the raw data into our data model.
            const processNodes = (nodes: ISoundLibFsNode[], parentList: Array<ISbDmSoundFolder | ISbDmSoundFile>,
                parentId: number
            ) => {
                nodes.forEach((node) => {
                    if (node.isDir) {
                        const folder: ISbDmSoundFolder = {
                            id: getNewId(),
                            name: node.name,
                            type: SbDmEntityType.SoundFolder,
                            parentId,
                            path: node.path,
                            state: {
                                initialized: true,
                                isLeaf: !node.children || node.children.length === 0,
                                expanded: false,
                                expandedOnce: false,
                            },
                            children: node.children ? [] : undefined,
                        };
                        this.data.soundLib.push(folder);

                        if (node.children) {
                            processNodes(node.children, folder.children!, folder.id);
                        }
                    } else {
                        const soundFile: ISbDmSoundFile = {
                            type: SbDmEntityType.SoundFile,
                            id: getNewId(),
                            name: node.name,
                        };
                        parentList.push(soundFile);
                    }
                });
            };

            processNodes(data, this.data.soundLib, getNewId());

            resolve();
        });
    }

    private async loadInstruments(): Promise<void> {
        this.data.instruments = [];

        const { bateriaInstruments } = await import("../bateria-instruments.js");
        bateriaInstruments.forEach((packedInstrument) => {
            this.data.instruments.push(new Instrument(packedInstrument));
        });
    };

    private async loadNumberSounds(): Promise<void> {
        // Dynamic import to break the circular dependency: support-sounds.ts imports the
        // ExcitationMode enum value from this module.
        const { numberSounds } = await import("../support-sounds.js");
        this.data.numberSounds = new Instrument(numberSounds);
    }

    private async updateScoreLibFolder(list: Array<ISbDmScoreFolder | ISbDmScore>,
        parent?: ISbDmScoreFolder): Promise<boolean> {
        const res = await this.fetchApi(`/api?action=listScoreFolderContent`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ parentid: parent?.id ?? -1 }),
        });

        if (!res) {
            return false;
        }

        const data = (await res.json()) as IScoreDBEntry;

        // Build a lookup of existing entries so we can update them in-place.
        // Tree rows hold references to these objects — they must not be replaced.
        const existingById = new Map<number, ISbDmScoreFolder | ISbDmScore>();
        for (const entry of list) {
            existingById.set(entry.id, entry);
        }

        // Build the new list in backend order. Entries found in the lookup are
        // updated in-place; new entries are created. Entries not in the backend
        // response are naturally dropped (no longer exist).
        const newList: Array<ISbDmScoreFolder | ISbDmScore> = [];

        data.folders.forEach((folder) => {
            const existing = existingById.get(folder.id);
            if (existing) {
                existing.name = folder.name;
                existing.perm = folder.perm;
                newList.push(existing);

                return;
            }

            const entry: ISbDmScoreFolder = {
                type: SbDmEntityType.ScoreFolder,
                id: folder.id,
                name: folder.name,
                parent,
                state: {
                    expanded: false,
                    expandedOnce: false,
                    initialized: false,
                    isLeaf: !folder.hasChildren,
                },
                children: [],
                perm: folder.perm,
                refresh: async () => {
                    (entry.state as Mutable<ISbDmEntityState>).initialized = true;

                    const success = await this.updateScoreLibFolder(entry.children, entry);
                    if (!success) {
                        const state = entry.state as Mutable<ISbDmEntityState>;
                        state.initialized = false;
                        state.expandedOnce = false;
                        state.expanded = false;
                    }
                },
            };
            newList.push(entry);
        });

        data.scores.forEach((score) => {
            const existing = existingById.get(score.id) as ISbDmScore | undefined;
            if (existing) {
                existing.name = score.name;
                existing.content = score.content;
                existing.perm = score.perm;
                newList.push(existing);

                return;
            }

            newList.push({
                type: SbDmEntityType.Score,
                id: score.id,
                name: score.name,
                state: {
                    initialized: true,
                    expanded: true,
                    expandedOnce: true,
                    isLeaf: true,
                },
                parent,
                content: score.content,
                perm: score.perm,
            });
        });

        list.length = 0;
        list.push(...newList);

        return true;
    }

    private applyArrangementPlaybackSettings(arrangement: ISbDmArrangement): void {
        const settings = AppStorage.loadUISettings();
        if (!settings) {
            return;
        }

        arrangement.loop = settings.loop ?? false;
        arrangement.mainVolume = settings.masterVolume ?? 100;
        arrangement.useMetronome = settings.metronome ?? false;
        arrangement.countIn = settings.countIn ?? false;
    };

    /**
     * Refreshes the access token using the refresh token cookie.
     * Called automatically when a 401 response is received.
     *
     * @returns True if the refresh was successful.
     */
    private async refreshAccessToken(): Promise<boolean> {
        // Restore group-login context from sessionStorage (lost from in-memory token on reload).
        const headers: Record<string, string> = {};
        const storedAuthType = sessionStorage.getItem("authType");
        const storedGroupId = sessionStorage.getItem("groupId");

        if (storedAuthType) {
            headers["X-Auth-Type"] = storedAuthType;
        }

        if (storedGroupId) {
            headers["X-Group-Id"] = storedGroupId;
        }

        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        const res = await this.fetchApi("/api?action=refresh", {
            method: "POST",
            credentials: "include",
            headers: Object.keys(headers).length > 0 ? headers : undefined,
        }, false);

        if (!res) {
            return false;
        }

        const data = await res.json() as { token: string; };

        this.accessToken = data.token;

        // Also refresh user info and capabilities.
        const whoamiRes = await this.fetchApi("/api?action=whoami", {
            headers: { Accept: "application/json" },
        }, true);

        if (whoamiRes) {
            const whoami = await whoamiRes.json() as IWhoamiResponse;

            if (whoami.authenticated && whoami.user) {
                this.currentUser = whoami.user;
                this.currentGroup = whoami.group;
                this.currentCapabilities = whoami.capabilities;

                if (whoami.group) {
                    sessionStorage.setItem("authType", "group");
                    sessionStorage.setItem("groupId", String(whoami.group.id));
                } else {
                    sessionStorage.removeItem("authType");
                    sessionStorage.removeItem("groupId");
                }
            }
        }

        return true;
    }

    /**
     * Wraps a fetch call with backend-disconnect detection and automatic token refresh.
     * On any network or HTTP error the `backendDisconnected` requisition is dispatched
     * and `undefined` is returned so the caller can bail out gracefully.
     *
     * On a 401 response the access token is automatically refreshed once and the
     * request is retried. If the refresh also fails the user is effectively logged out.
     *
     * @param url          The URL to fetch.
     * @param options      Optional fetch options.
     * @param attachAuth   Whether to attach the Authorization header. Defaults to true.
     *                     Set to false for login, refresh, and whoami requests.
     * @param returnNonOk  When true, non-2xx responses are returned as-is instead of
     *                     triggering error requisitions and returning undefined.
     *                     Callers that need to inspect the status code (e.g. 403 vs 404)
     *                     should set this to true.
     *
     * @returns The response on success, or `undefined` when the backend is unreachable
     *          (or when `returnNonOk` is false and a non-2xx status is received).
     */

    private async fetchApi(url: string, options?: RequestInit, attachAuth = true,
        returnNonOk = false): Promise<Response | undefined> {
        const mergedOptions: RequestInit = {
            ...options,
            headers: {
                ...(options?.headers as Record<string, string> | undefined),
            },
            credentials: options?.credentials ?? "include",
        };

        if (attachAuth && this.accessToken) {
            (mergedOptions.headers as Record<string, string>).Authorization =
                `Bearer ${this.accessToken}`;
        }

        let res: Response;

        try {
            res = await fetch(url, mergedOptions);
        } catch {
            void requisitions.execute("backendDisconnected", undefined);
            void requisitions.execute("showError", "Backend connection lost — network request failed.");

            return undefined;
        }

        // Auto-refresh on 401 and retry once.
        if (res.status === 401 && attachAuth && this.accessToken) {
            const refreshed = await this.refreshAccessToken();

            if (refreshed) {
                (mergedOptions.headers as Record<string, string>).Authorization =
                    `Bearer ${this.accessToken}`;

                try {
                    res = await fetch(url, mergedOptions);
                } catch {
                    void requisitions.execute("backendDisconnected", undefined);
                    void requisitions.execute("showError", "Backend connection lost — retry failed.");

                    return undefined;
                }
            }
        }

        if (!res.ok) {
            if (returnNonOk) {
                return res;
            }

            // 401 is an expected auth response — not a backend disconnect.
            if (res.status === 401) {
                return undefined;
            }

            // 403 means the user lacks permission — not a disconnect.
            if (res.status === 403) {
                void requisitions.execute("showError", "You do not have permission for this action.");

                return undefined;
            }

            void requisitions.execute("backendDisconnected", undefined);
            void requisitions.execute("showError", `Backend request failed: HTTP ${res.status} ${res.statusText}`);

            return undefined;
        }

        return res;
    }
}
