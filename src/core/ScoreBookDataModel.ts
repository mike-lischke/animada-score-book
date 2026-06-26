/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AppStorage } from "./AppStorage.js";
import { Arrangement } from "./Arrangement.js";
import { ArrangementMigrator } from "./serialisation/migration/ArrangementMigrator.js";
import { stringifyPackedArrangement } from "./serialisation/snapshot-packing.js";

import { requisitions } from "../supplement/Requisitions.js";
import type { IScoreDBEntry, ISoundLibFsNode } from "./DatabaseTypes.js";
import { Instrument } from "./Instrument.js";
import type {
    IArrangementSnapshot, IAudioData, IFraction, IMeasureStep, IMeterSnapshot, INoteStyleSymbol, ISubdivision, Mutable
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
    readonly symbol?: INoteStyleSymbol;
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
    readonly perm?: ISbDmPermissionInfo;
}

/** Permission summary for the current user on a score or folder. */
export interface ISbDmPermissionInfo {
    /** The current user is the owner of this entity. */
    readonly isOwner: boolean;

    /** The current user has access via group membership. */
    readonly isGroup: boolean;

    /** The entity is world-readable. */
    readonly isWorld: boolean;

    /** The raw 9-bit permission mask (owner/group/world × rwx). */
    readonly permBits: number;
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
    readonly steps: IMeasureStep[];
    readonly subdivisions: ISubdivision[];

    /**
     * Generated note events for this measure, based on the other fields. Represents the single source of truth
     * for note placement, duration and style during runtime. This is generated by the track player when it needs
     * to play or edit a note.
     */
    readonly events: ISbDmNoteEvent[];
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

        this.data.arrangement = arrangement;
        this.applyArrangementPlaybackSettings(arrangement);
        void requisitions.execute("scoreBookLoaded", undefined);

        return arrangement;
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
                perm: { isOwner: true, isGroup: false, isWorld: true, permBits: 492 },
            };

            if (!parent) {
                this.data.scoreLib.push(newFolder);

                return;
            }

            parent.children.push(newFolder);

            void requisitions.execute("scoreBookLoaded", undefined);
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
                perm: { isOwner: true, isGroup: false, isWorld: true, permBits: 492 },
            };

            if (!parent) {
                this.data.scoreLib.push(newScore);
            } else {
                parent.children.push(newScore);
            }

            void requisitions.execute("scoreBookLoaded", undefined);
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
        const res = await this.fetchApi(`/api?action=updateScore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: score.id, content }),
        });

        if (!res) {
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
        void requisitions.execute("scoreBookLoaded", undefined);
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
            void requisitions.execute("scoreBookLoaded", undefined);
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

        list.length = 0;
        const data = (await res.json()) as IScoreDBEntry;
        data.folders.forEach((folder) => {
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
                refresh: async (cb?: ProgressCallback) => {
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
            list.push(entry);
        });

        data.scores.forEach((score) => {
            list.push({
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
     * @returns The response on success, or `undefined` when the backend is unreachable.
     */
    private async fetchApi(
        url: string, options?: RequestInit, attachAuth = true,
    ): Promise<Response | undefined> {
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
