/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { AppStorage } from "./AppStorage.js";
import { Arrangement, type IArrangementCreationOptions } from "./Arrangement.js";
import {
    MeasureProjection, ProjectedItemKind, type IProjectedItem, type IProjectedSubdivision,
} from "./MeasureProjection.js";
import { ArrangementMigrator } from "./serialisation/migration/ArrangementMigrator.js";
import {
    addFractions, compareFractions, divideFraction, multiplyFraction, reduceFraction, subtractFractions,
} from "./serialisation/numeric-functions.js";
import { stringifyPackedArrangement } from "./serialisation/snapshot-packing.js";
import { decomposeRestSpan } from "./rest-notation.js";
import { computeIsTuplet, maxTupletLevels } from "./tuplets.js";

import { requisitions } from "../supplement/Requisitions.js";
import type { IScoreLineup, IScoreListEntry, IScoreMeta, ISetListInfo, ISoundLibFsNode } from "./DatabaseTypes.js";
import { Instrument } from "./Instrument.js";
import { MeasureLayout } from "./MeasureLayout.js";
import { NameText } from "./NameText.js";
import { HairpinEnd, RangeArticulations } from "./RangeArticulations.js";
import { ScoreLineup } from "./ScoreLineup.js";
import { StepGrid } from "./StepGrid.js";
import { TagCombination } from "./TagCombination.js";
import type { ITagCombination, ITagInfo, ITagOwnerScope } from "./types/tags.js";
import type {
    IArrangementExtensions, IArrangementSnapshot, IAudioData, IFraction, IForteMark, IHairpin, IMeasureEvent,
    IMeterSnapshot, IArticulationSymbol, IRangeArticulationAnchor, IRangeArticulationPlacement,
    IRepeatBar, ISubdivision
} from "./types/general.js";
import { RangeArticulationKind, RepeatMark } from "./types/general.js";
import { getNewId } from "./utils.js";

export interface ISubdivisionSlotContent {
    noteStyleId?: string;
    articulation?: INoteArticulation;
}

interface IScoreLockResult {
    success: boolean;
    token?: string;
    locked?: boolean;
    email?: string;
    lockedAt?: string;

    /** HTTP status the backend refused the lock with, or undefined when it was granted or unreachable. */
    status?: number;
}

/** One bar, the unit of a track's timeline. */
const barLength: IFraction = { numerator: 1, denominator: 1 };

interface IAbsoluteTrackItem {
    /** Absolute position on the track's timeline, as a fraction of a bar. */
    start: IFraction;

    /** The item's length as a fraction of a bar: a note's duration, or a subdivision's span. */
    duration: IFraction;

    /** The event to resize; undefined for a subdivision. */
    event?: IMeasureEvent;

    /**
     * A subdivision's leaf events, with starts relative to the item's start. A subdivision is one
     * item because its span follows from its ratio: it only ever moves as a whole, its slots keep
     * their relative positions.
     */
    slots?: IMeasureEvent[];

    /** A subdivision's records, with the start of their first slot relative to the item's start. */
    subdivisions?: ISubdivisionPlacement[];
}

/** A subdivision together with the start of its first slot, relative to the item's start. */
interface ISubdivisionPlacement {
    group: ISubdivision;
    start: IFraction;
}

export type RealTime = number;

/** The start of a measure as a bar fraction. */
const barStart: IFraction = { numerator: 0, denominator: 1 };

/** The bar line as a bar fraction. */
const barLine: IFraction = { numerator: 1, denominator: 1 };

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
 * Describes the articulation that is baked into a specific audio sample. This is purely descriptive — it tells
 * the player which articulation values the sample was recorded with, so the right sample can be
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

    /** A filled equilateral triangle for shaken instruments (e.g. Chocalho, Ganzá). */
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

/**
 * The job an instrument has in the bateria, which decides the colour of its tag. Instruments of one role share one
 * colour.
 */
export enum InstrumentRole {
    /** The surdos mark the pulse. */
    GroundRhythm,

    /** Caixa and repinique weave the pattern above the pulse. */
    Carpet,

    /** Agogô, chocalho and tamborim phrase above the pattern. */
    Voice,

    /** Hand drums with a pattern of their own, like the timbau or a repinique de mão. */
    HandRhythm,

    /** Apito and reco-reco, which mark breaks and add noise instead of notes. */
    Effect,

    /** Cavacinho and banjo, which carry the harmony. */
    Accompaniment,
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

    /** The role of the instrument, which decides the colour of its tag. Number cues name none, as they carry no tag. */
    readonly role?: InstrumentRole;
}

export interface ITimeParamsView {
    readonly timeSignature: string;
    readonly tempo: number;
    readonly length: number;
    readonly pulse: string;
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
    /** A score was loaded into the player — no change to the score list. */
    ScoreLoaded,

    /** A score was renamed — no change to the score list. */
    EntryRenamed,

    /** A score was deleted, so the list lost an entry. */
    EntryDeleted,

    /** The score list was rebuilt from the backend, for example for another tag combination. */
    LibraryRefreshed,
}

export enum SbDmEntityType {
    SoundFolder,
    SoundFile,
    Score,
    Track,
    TrackPiece,
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

/** A score entry in the score list. */
export interface ISbDmScore extends ISbDmVisual {
    readonly type: SbDmEntityType.Score;
    name: string;
    content: string;
    readonly description?: string;

    /** The ids of the tags the current user can use on this score. */
    tagIds: number[];

    /** The tracks with their instruments, as the score card shows them. */
    lineup?: IScoreLineup;

    /** Tempo, meter, length and bar count, as the score's content states them. */
    meta?: IScoreMeta;
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

    readonly measures: ISbDmTrackPiece[];

    getNoteAt(bar: number, start: IFraction, slot: IFraction): ISbDmNoteEvent | undefined;
    readonly notes: IterableIterator<ISbDmNoteEvent>;
    clear(): void;
}

export interface ISbDmTrackPiece extends ISbDmCommon {
    readonly type: SbDmEntityType.TrackPiece;

    /** The track this measure belongs to. */
    readonly track: ISbDmTrack;

    readonly number: number;

    /**
     * Snapshot metadata kept on the runtime measure.
     * This mirrors `ITrackPieceSnapshot` and allows lossless round-trips.
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
     * One-bar repeat (simile): the measure plays the nearest preceding measure's content and holds none of
     * its own. Never set on the first measure of a track.
     */
    simile?: boolean;

    /**
     * Resolved runtime note events derived from {@link events} (style ids resolved to audio data).
     * Generated by the track player and not persisted.
     */
    readonly noteEvents: ISbDmNoteEvent[];
}

export interface ISbDmNoteEvent extends ISbDmCommon {
    readonly type: SbDmEntityType.NoteEvent;

    /** The measure this event belongs to. */
    readonly measure: ISbDmTrackPiece;

    readonly start: IFraction;
    readonly duration: IFraction;
    readonly track: ISbDmTrack;

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

    /** The instrument's job in the bateria, which decides the colour of its tag and how the lineup groups it. */
    readonly role?: InstrumentRole;

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
}

export interface ISbDmArrangement extends ISbDmCommon {
    readonly type: SbDmEntityType.Arrangement;

    title: string;
    timeParams: ISbDmTimeParams;
    tracks: ISbDmTrack[];

    /**
     * Column widths set for individual measures, keyed by 1-based measure number, in px at 100% zoom.
     * A measure without an entry is laid out with the default width of the view.
     */
    measureWidths?: Map<number, number>;

    /** Repeat marks set for individual measures, keyed by 1-based measure number. */
    repeatBars?: Map<number, IRepeatBar>;

    /** Hairpins and `f` markings of the arrangement, in insertion order. */
    rangeArticulations?: RangeArticulations;

    /**
     * Extension chunks of other features or newer builds, kept verbatim so that writing a snapshot never
     * drops data this build does not understand. See {@link IArrangementExtensions}.
     */
    foreignExtensions?: IArrangementExtensions;

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

    /** The scores matching the active tag combination. */
    scores: ISbDmScore[];
    instruments: ISbDmInstrument[];
    numberSounds?: ISbDmInstrument;

    /** The current arrangement being edited or viewed. */
    arrangement?: ISbDmArrangement;
}

/** All possible data model entry types. */
export type ScoreBookDataModelEntry =
    | ISbDmSoundFolder
    | ISbDmSoundFile
    | ISbDmScore
    | ISbDmTrack
    | ISbDmInstrument
    | ISbDmArrangement
    | ISbDmNoteEvent
    | ISbDmInstrumentImage
    ;

/** What a score-list query did with its response. */
export enum ScoreQueryResult {
    /** The response became the current list. */
    Applied,

    /** A newer query had started while this one ran, so its answer was dropped instead of replacing the list. */
    Superseded,

    /** The filter names tags the caller cannot use, so no list was shown: a narrower result must not look wider. */
    InvalidFilter,

    /** The selected set list was deleted or is no longer readable, so the caller has to pick another one. */
    SetListUnavailable,

    /** The backend did not answer, or refused the request. */
    Failed,
}

/** The outcome of a score-list query, with the tag ids a filter named that could not be used. */
export interface IScoreQueryOutcome {
    result: ScoreQueryResult;
    ignoredTagIds: number[];
}

/** What became of a set-list change: the new revision, a stale-revision conflict, or the backend's reason. */
export interface ISetListChangeResult {
    success: boolean;

    /** The revision the list carries after the change. */
    revision?: number;

    /** The change was based on an outdated revision and was rejected instead of overwriting a newer one. */
    conflict?: boolean;

    /** The sentence the backend answered with, when it refused the change. */
    error?: string;
}

/**
 * A data model to share score book data between components.
 */

/** Mirrors IWhoamiResponse / ICapabilities from the backend. */
export interface IUserInfo {
    id: number;
    email: string;
    displayName: string;
    isAdmin: boolean;

    /** The groups the session belongs to; a group session carries only the group it logged in through. */
    groupIds?: number[];
}

/** The group a session logs in through, which is all a session needs to know about it. */
export interface IGroupInfo {
    id: number;
    name: string;
}

/** A user row as returned by listUsers. */
export interface IUserRow {
    id: number;
    email: string;
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

    /** The index of the group's colour in the fixed palette of `TagPalette`. */
    colorIndex: number;
    adminId: number | null;

    /** The display name of the group's administrator, if it has one. */
    adminName?: string;

    hasPassword: boolean;
    lastLogin: string | null;
    createdAt: string;
}

/** A group member as returned by listGroupMembers. */
export interface IGroupMember {
    id: number;
    email: string;
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
    group?: IGroupInfo;

    capabilities: ICapabilities;
}

interface IWhoamiResponse {
    authenticated: boolean;
    user?: IUserInfo;

    /** Set when authenticated via group shared password. */
    group?: IGroupInfo;

    capabilities: ICapabilities;
}

/** How the session logged in, as the tab remembers it so a token refresh can state it again. */
interface IAuthHints {
    /** Set to "group" when the session logged in through a group password. */
    authType?: string;

    /** The id of that group, as a string because that is what the request header takes. */
    groupId?: string;
}

/** An event whose duration should change, addressed by its exact start within a measure. */
export interface IEventResizeRequest {
    /** The one-based measure number containing the event. */
    bar: number;

    /** The exact event start within that measure. */
    start: IFraction;

    /** The requested duration as a fraction of the measure. */
    duration: IFraction;
}

/**
 * A range within one measure of one track, addressed by exact bar fractions. A range without a
 * start or end reaches to that side of the measure.
 */
export interface ITrackPieceRange {
    /** The track containing the measure. */
    trackId: number;

    /** The one-based measure number. */
    bar: number;

    /** Exact start of the range (inclusive); the bar start when omitted. */
    start?: IFraction;

    /** Exact end of the range (exclusive); the bar line when omitted. */
    end?: IFraction;
}

/** Addresses one track piece by its track and its 1-based measure number. */
export interface ITrackPieceAddress {
    trackId: number;
    bar: number;
}

/** A replace target for {@link replaceMeasureContent}: a range or a whole measure of one track. */
export interface ITrackPieceReplace extends ITrackPieceRange {
    /** Events to write. Replaces the whole measure when start and end are omitted. */
    events: IMeasureEvent[];

    /** Subdivisions to create for the replaced range; startIndex is relative to {@link events}. */
    subdivisions?: ISubdivision[];

    /** One-bar repeat (simile) to write. Ignored on the first measure and for a range replacement. */
    simile?: boolean;

    /** Markings to write over a whole-measure replacement, replacing the markings the measure held. */
    articulations?: IRangeArticulationPlacement[];
}

/** The replacement events for a fractional range plus the index where they begin. */
export interface IFractionRangeReplacement {
    /** The full measure event list after the range was replaced. */
    result: IMeasureEvent[];

    /** Index into {@link result} where the replacement events begin. */
    shiftedStartIndex: number;
}

/** A note style for a single event: where the event sits and the style it takes. */
export interface INoteStyleAssignment {
    /** The track containing the event. */
    trackId: number;

    /** The one-based measure number. */
    bar: number;

    /** Exact start of the event within its measure. */
    start: IFraction;

    /** The instrument note-style id to write. */
    noteStyleId: string;
}

/**
 * An insert target for {@link ScoreBookDataModel.insertEventsWithShift}: a run of measure events
 * replaced by other events, moving everything behind the run by the length difference.
 */
export interface ITrackPieceInsert {
    /** The measure whose events are replaced. */
    measure: ISbDmTrackPiece;

    /** The first event of the replaced run. */
    from: IMeasureEvent;

    /** The last event of the replaced run; the same event as {@link from} for a single event. */
    to: IMeasureEvent;

    /** Events to insert in the run's place, positioned relative to the run's start. */
    events: IMeasureEvent[];
}

/**
 * An insert target for {@link ScoreBookDataModel.insertEventsAt}: events added at a position, moving
 * everything behind that position to the right by their length.
 */
export interface ITrackPieceInsertion {
    /** The measure the events are inserted into. */
    measure: ISbDmTrackPiece;

    /** The exact insertion position within the measure. */
    start: IFraction;

    /** Events to insert, positioned relative to {@link start}. */
    events: IMeasureEvent[];
}

/** The outcome of a destructive database reset. */
export interface IDatabaseResetResult {
    /** True if the backend dropped and rebuilt the database including its seed data. */
    ok: boolean;

    /** The reason the reset failed, as reported by the backend. */
    error?: string;
}

/** A score the backend offers to a demo, as the curated catalog lists it. */
export interface IDemoScoreEntry {
    id: number;
    name: string;
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
    public get activeGroup(): IGroupInfo | undefined {
        return this.currentGroup;
    }

    public get capabilities(): ICapabilities {
        return this.currentCapabilities;
    }

    /** Token for the active score lock. Set by the lockScore flow. */
    public lockToken?: string;

    private accessToken: string | undefined;

    /** True while a token refresh runs, which keeps a nested refusal from starting another one. */
    private refreshing = false;

    /** True once a refresh failed, so refusals do not repeat a futile attempt before the next login. */
    private sessionRefreshFailed = false;
    private currentUser: IUserInfo | undefined;
    private currentGroup: IGroupInfo | undefined;
    private currentCapabilities: ICapabilities = {
        canEditScores: false,
        canManageUsers: false,
        canManageInstruments: false,
        canExportMP3: false,
    };

    private data: IScoreBookDataModelData = {
        soundLib: [],
        scores: [],
        instruments: [],
    };

    /** The tags the current user can use, as the backend last reported them. */
    private tagCatalogue: ITagInfo[] = [];

    /** The owner scopes the current user may create tags in. */
    private tagScopes: ITagOwnerScope[] = [];

    /** The set lists the current user may select, as the backend last reported them. */
    private setListCatalogue: ISetListInfo[] = [];

    /** How many scores the current user may read, which the All Scores pill shows. */
    private readableScores = 0;

    /** The set list the current score list is restricted to; undefined shows all readable scores. */
    private activeSetList: number | undefined;

    /**
     * The tag combination the current score list was queried with. A refresh that is not a new selection — after a
     * save or a deleted tag, for example — repeats it, so the list the user is looking at stays filtered.
     */
    private scoreListCombination: ITagCombination = TagCombination.empty;

    /** Counts the score-list queries, so only the answer to the latest one may replace the list. */
    private scoreQueryCount = 0;

    /**
     * The tags the current new arrangement starts with. They cannot be assigned before the arrangement has a score
     * row, so they wait here until the first save created one.
     */
    private newArrangementTagIds: number[] = [];

    public async initialize(): Promise<void> {
        const promises: Array<Promise<unknown>> = [
            this.loadSoundLib(),
            this.loadInstruments(),
            this.loadNumberSounds(),
            this.reloadTags(),
            this.reloadSetLists(),
            this.queryScores(TagCombination.empty),
        ];

        await Promise.all(promises);

        this.data.arrangement = Arrangement.emptyArrangement(this.data.instruments);

        return Promise.resolve();
    }

    public get soundLib(): Array<ISbDmSoundFolder | ISbDmSoundFile> {
        return this.data.soundLib;
    }

    /**
     * @returns The scores matching the active tag combination.
     */
    public get scores(): ISbDmScore[] {
        return this.data.scores;
    }

    /**
     * @returns The tags the current user can use.
     */
    public get tags(): readonly ITagInfo[] {
        return this.tagCatalogue;
    }

    /**
     * @returns The owner scopes the current user may create tags in; an empty list means they cannot create any.
     */
    public get tagOwnerScopes(): readonly ITagOwnerScope[] {
        return this.tagScopes;
    }

    /**
     * @returns The set lists the current user may select, sorted by name.
     */
    public get setLists(): readonly ISetListInfo[] {
        return this.setListCatalogue;
    }

    /**
     * @returns How many scores the current user may read, independent of the manual filter.
     */
    public get readableScoreCount(): number {
        return this.readableScores;
    }

    /**
     * @returns The set list the score list is restricted to, or undefined when it shows all readable scores.
     */
    public get activeSetListId(): number | undefined {
        return this.activeSetList;
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
        this.newArrangementTagIds = [];
        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.ScoreLoaded);

        return arrangement;
    }

    /**
     * Replaces the current arrangement with a new, empty one that contains a single track for
     * each of the given instruments.
     *
     * @param instruments The instruments that should appear in the new arrangement.
     * @param options Optional initial title and timing parameters.
     * @param tagIds The tags the score receives once it is first stored, typically the tags of the active filter.
     *
     * @returns The new arrangement.
     */
    public startNewArrangement(instruments: ISbDmInstrument[], options?: IArrangementCreationOptions,
        tagIds: number[] = []): ISbDmArrangement {
        const arrangement = Arrangement.emptyArrangementWithInstruments(instruments, options);
        this.data.arrangement = arrangement;
        this.applyArrangementPlaybackSettings(arrangement);
        this.newArrangementTagIds = [...tagIds];
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
     * Sets the column width of a measure, or restores its default width when the width is undefined. The
     * width is raised to the measure's floor — the smallest width its events still fit in — so no resize can
     * squeeze a measure below its content.
     *
     * Only the layout is refreshed here. {@link commitMeasureWidths} records the change as an undo step, which
     * lets a drag update the width on every frame and still produce exactly one step.
     *
     * @param bar The 1-based measure number.
     * @param width The column width in px at 100% zoom, or undefined to restore the default width.
     *
     * @returns True when the stored width changed.
     */
    public setMeasureWidth(bar: number, width?: number): boolean {
        const arrangement = this.arrangement;
        const widths = arrangement?.measureWidths;
        if (!arrangement || !widths || bar < 1 || bar > arrangement.timeParams.length) {
            return false;
        }

        const floor = MeasureLayout.minimumWidthOfMeasure(arrangement, bar);
        const clamped = width === undefined ? undefined : Math.max(Math.ceil(width), floor);
        // A width equal to the default is the default, so it is not stored and a reset needs no value.
        const next = clamped === MeasureLayout.defaultWidth() ? undefined : clamped;
        if (next === widths.get(bar)) {
            return false;
        }

        if (next === undefined) {
            widths.delete(bar);
        } else {
            widths.set(bar, next);
        }

        void requisitions.execute("measureLayoutChanged", undefined);

        return true;
    }

    /**
     * Records the measure widths as one undo step, which ends a resize gesture that {@link setMeasureWidth}
     * updated frame by frame.
     */
    public commitMeasureWidths(): void {
        void requisitions.execute("arrangementMutated", undefined);
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

        const arrangement = this.arrangement;
        arrangement?.rangeArticulations?.removeTrack(track.id);

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
     * Writes a note style at one position of a measure. A position that starts a subdivision slot
     * keeps the slot's duration and only changes its style — those slots subdivide a grid step and
     * must not be split or merged. Any other position gets a note of the given duration, replacing
     * a same-length note, cutting into a longer note, or consuming following rests when the note at
     * the position is shorter. Rests are combined and decomposed into standard note values
     * afterwards.
     *
     * @param trackId The track containing the position.
     * @param bar The one-based measure number.
     * @param start The exact start position as a fraction.
     * @param duration The note's duration as a fraction; ignored at a subdivision slot.
     * @param noteStyleId The instrument note-style id to apply, or undefined to clear the position.
     *
     * @returns True when the measure changed. False when a following note blocks the span
     *          (cross-measure shifting is not implemented yet).
     */
    public setNoteAt(trackId: number, bar: number, start: IFraction, duration: IFraction,
        noteStyleId?: string): boolean {
        const measure = this.measureForEdit(trackId, bar);
        if (!measure) {
            return false;
        }

        let changed: boolean;
        const exactEvent = measure.events.find((event) => {
            return compareFractions(event.start, start) === 0;
        });
        if (exactEvent !== undefined
            && this.fractionsEqual(exactEvent.duration, duration)
            && !this.isSlotStart(measure, start)) {
            changed = this.setEventNoteStyle(measure, start, noteStyleId);
        } else if (this.isSlotStart(measure, start)) {
            changed = this.setEventNoteStyle(measure, start, noteStyleId);
        } else if (duration.numerator <= 0) {
            return false;
        } else {
            changed = this.insertNoteAt(measure, start, duration, noteStyleId);
        }

        if (changed) {
            this.announceTrackEdit(measure.track);
        }

        return changed;
    }

    /**
     * Changes the duration of the given notes and ripples the following notes through the track.
     * Gaps between notes act as elastic rests: growing a note consumes later gaps before moving
     * subsequent notes, while shrinking it expands the gap immediately after the note. Requests may
     * address notes in different measures of the track and are applied in one pass, so a multi-note
     * selection stays consistent across bar lines. Style and articulation are preserved.
     *
     * @param trackId The track containing the notes.
     * @param requests The notes to resize, addressed by their start within a measure.
     *
     * @returns True when at least one note duration changed.
     */
    public resizeNotes(trackId: number, requests: IEventResizeRequest[]): boolean {
        const track = this.trackById(trackId);
        if (!track || requests.length === 0) {
            return false;
        }

        if (!this.resizeTrackNotes(track, requests)) {
            return false;
        }

        this.announceTrackEdit(track);

        return true;
    }

    /**
     * Sets the duration of the addressed events and lays out the content behind them. A note keeps
     * its style and takes the slack of the rests behind it (ADR-0003). A rest that changes its length
     * moves the following events instead, so a rest can take any length. Requests are applied from the
     * last one to the first, because an edit only moves the content behind it, which keeps the
     * remaining positions valid. The whole change is one edit: it fires one arrangementMutated event.
     *
     * @param trackId The track containing the events.
     * @param requests The events to resize, addressed by their start within a measure.
     *
     * @returns True when at least one duration changed.
     */
    public resizeEvents(trackId: number, requests: IEventResizeRequest[]): boolean {
        const track = this.trackById(trackId);
        if (!track || requests.length === 0) {
            return false;
        }

        const sorted = [...requests].sort((left, right) => {
            return left.bar === right.bar ? compareFractions(right.start, left.start) : right.bar - left.bar;
        });

        let changed = false;

        for (const request of sorted) {
            const measure = track.measures.at(request.bar - 1);
            const event = measure?.events.find((candidate) => {
                return compareFractions(candidate.start, request.start) === 0;
            });
            if (measure === undefined || event === undefined) {
                continue;
            }

            // A slot's length follows from its subdivision's ratio, not from a request.
            if (this.isSlotStart(measure, request.start)) {
                continue;
            }

            changed = event.noteStyleId === undefined
                ? this.setEventSpan(track, request.bar, request.start, request.duration) || changed
                : this.resizeTrackNotes(track, [request]) || changed;
        }

        if (changed) {
            this.announceTrackEdit(track);
        }

        return changed;
    }

    /**
     * Replaces a span of rests with a single rest of the requested length and moves the content behind
     * it by the difference. The rests the span covers are one silence, so they merge into the rest the
     * user asked for instead of each taking the new length. The span has to hold rests only; the notes
     * of a selection are resized one by one instead.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The start of the span within the measure.
     * @param end The end of the span within the measure.
     * @param duration The length the rest takes.
     *
     * @returns True when the track content changed.
     */
    public setRestSpan(trackId: number, bar: number, start: IFraction, end: IFraction,
        duration: IFraction): boolean {
        const track = this.trackById(trackId);
        if (track?.measures.at(bar - 1) === undefined || compareFractions(start, end) >= 0) {
            return false;
        }

        const changed = this.setSpan(track, bar, start, end, duration);
        if (changed) {
            this.announceTrackEdit(track);
        }

        return changed;
    }

    /**
     * Replaces runs of measure events with runs of new events, moving everything behind a run by the
     * length difference between the two. A run that only covers part of a subdivision is refused: a
     * subdivision is never cut. Content pushed past the track's last measure is dropped, a
     * subdivision that no longer fits into its measure continues at the start of the next one.
     *
     * Everything works on the track's absolute timeline and on bar fractions, so the staff view —
     * which has no grid — needs no step arithmetic.
     *
     * @param insertions The replacements to apply.
     *
     * @returns The ids of the tracks whose content changed.
     */
    public insertEventsWithShift(insertions: ITrackPieceInsert[]): number[] {
        const changed = new Set<number>();

        for (const insertion of insertions) {
            const { measure } = insertion;
            const track = measure.track;
            const measureIndex = measure.number - 1;
            const runStart = this.absolutePositionOf(measureIndex, insertion.from.start);
            const runEnd = this.absolutePositionOf(measureIndex,
                addFractions(insertion.to.start, insertion.to.duration));
            const items = this.collectAbsoluteItems(track);
            if (!this.runCoversItems(items, runStart, runEnd)) {
                continue;
            }

            const before = ScoreBookDataModel.timelineSignature(items);
            const added = this.absoluteItemsOf(insertion.events, runStart);
            const delta = subtractFractions(this.totalLengthOf(added), subtractFractions(runEnd, runStart));
            const first = this.indexOfItemBehind(items, runStart);
            const last = this.indexOfItemBehind(items, runEnd);

            // Everything behind the run gives way by the length difference between the two.
            for (let index = last; index < items.length; index++) {
                items[index].start = addFractions(items[index].start, delta);
            }

            items.splice(first, last - first, ...added);
            this.settleTimelineItems(track, items, this.endOfItemBefore(items, first), first);

            // Removing the closing rest of a track recreates the very same rest, which is no change.
            if (before !== ScoreBookDataModel.timelineSignature(this.collectAbsoluteItems(track))) {
                changed.add(track.id);
            }
        }

        this.announceTrackEdits(changed);

        return [...changed];
    }

    /**
     * Inserts events at an exact position of a measure and moves everything from that position on to
     * the right by the inserted length, so an insertion never shortens what is already there. The
     * space it takes is notated as rests where the content gives way, a following subdivision is
     * pushed as one block, and content pushed past the track's last measure is dropped.
     *
     * @param insertions The insertions to apply.
     *
     * @returns The ids of the tracks whose content changed.
     */
    public insertEventsAt(insertions: ITrackPieceInsertion[]): number[] {
        const changed = new Set<number>();

        for (const insertion of insertions) {
            const { measure } = insertion;
            const track = measure.track;
            const start = this.absolutePositionOf(measure.number - 1, insertion.start);
            const added = this.absoluteItemsOf(insertion.events, start);
            const length = this.totalLengthOf(added);

            const items = this.collectAbsoluteItems(track);
            const before = ScoreBookDataModel.timelineSignature(items);
            const fromIndex = this.indexOfItemBehind(items, start);

            // Everything from the insertion position on gives way by the inserted length.
            for (let index = fromIndex; index < items.length; index++) {
                items[index].start = addFractions(items[index].start, length);
            }

            items.splice(fromIndex, 0, ...added);
            this.settleTimelineItems(track, items, this.endOfItemBefore(items, fromIndex), fromIndex);

            if (before !== ScoreBookDataModel.timelineSignature(this.collectAbsoluteItems(track))) {
                changed.add(track.id);
            }
        }

        this.announceTrackEdits(changed);

        return [...changed];
    }

    /**
     * Removes one event from a measure and pulls everything behind it to the left by the removed
     * length, so a rest takes no time either. The space that opens up is notated as rests, so every
     * measure keeps tiling its meter. An event that would cut a subdivision is not removed.
     *
     * @param trackId The track containing the event.
     * @param bar The one-based measure number.
     * @param start The exact start of the event within the measure.
     *
     * @returns True when the event was removed.
     */
    public deleteEventWithShift(trackId: number, bar: number, start: IFraction): boolean {
        const measure = this.trackById(trackId)?.measures.at(bar - 1);
        const event = measure?.events.find((candidate) => {
            return compareFractions(candidate.start, start) === 0;
        });
        if (measure === undefined || event === undefined) {
            return false;
        }

        return this.insertEventsWithShift([{ measure, from: event, to: event, events: [] }]).length > 0;
    }

    /**
     * Changes the duration of a single note; see {@link resizeNotes}.
     *
     * @param trackId The track containing the note.
     * @param bar The one-based measure number.
     * @param start The exact note start within the measure.
     * @param duration The requested duration as a fraction of the current measure.
     *
     * @returns True when the note duration changed.
     */
    public resizeNote(trackId: number, bar: number, start: IFraction, duration: IFraction): boolean {
        return this.resizeNotes(trackId, [{ bar, start, duration }]);
    }

    /**
     * Clears note content across the given measure ranges in one edit, turning the affected notes
     * into rests. Clearing a whole measure also removes its subdivisions and its one-bar repeat mark,
     * because a cleared measure holds nothing. Fires one arrangementMutated event (a single undo step)
     * and one trackChanged event per affected track, so viewers recompute their note structure.
     *
     * @param ranges The ranges to clear. Ranges referencing a missing track or measure are ignored.
     *
     * @returns True when at least one range, subdivision or mark changed.
     */
    public clearRanges(ranges: ITrackPieceRange[]): boolean {
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

            // A range without bounds covers the whole piece, so clearing it also takes the mark off.
            const wholePiece = range.start === undefined && range.end === undefined;
            const contentChanged = wholePiece
                ? this.clearMeasureContent(measure)
                : this.replaceSpan(measure, range.start ?? barStart, range.end ?? barLine, undefined);
            const markCleared = wholePiece && this.clearSimile(measure);

            if (contentChanged || markCleared) {
                changed = true;
                affectedTracks.add(range.trackId);
            }
        }

        if (changed) {
            this.announceTrackEdits(affectedTracks);
        }

        return changed;
    }

    /**
     * Sets the note style across the given measure ranges in one edit. Fires one arrangementMutated
     * event (a single undo step) and one trackChanged event per affected track. Ranges referencing
     * a missing track or measure are ignored.
     *
     * @param ranges The ranges to fill with the note style.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when at least one range changed.
     */
    public setNoteStyleRanges(ranges: ITrackPieceRange[], noteStyleId: string): boolean {
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

            const rangeChanged = range.start === undefined && range.end === undefined
                ? this.setMeasureNoteStyle(measure, noteStyleId)
                : this.setFractionRangeNoteStyle(measure, range.start ?? barStart, range.end ?? barLine,
                    noteStyleId);
            if (rangeChanged) {
                changed = true;
                affectedTracks.add(range.trackId);
            }
        }

        if (changed) {
            this.announceTrackEdits(affectedTracks);
        }

        return changed;
    }

    /**
     * Gives single events a note style in one edit. Fires one arrangementMutated event (a single undo
     * step) and one trackChanged event per affected track. Assignments referencing a missing track,
     * measure or event are ignored.
     *
     * @param assignments The events to write and the style each one takes.
     *
     * @returns True when at least one event changed.
     */
    public setNoteStyles(assignments: INoteStyleAssignment[]): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const affectedTracks = new Set<number>();
        const measures = new Map<ISbDmTrackPiece, IMeasureEvent[]>();
        let changed = false;

        for (const assignment of assignments) {
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === assignment.trackId;
            });
            const measure = track?.measures[assignment.bar - 1];
            if (!track || !measure) {
                continue;
            }

            let events = measures.get(measure);
            if (events === undefined) {
                events = measure.events.map((event) => {
                    return this.cloneEvent(event);
                });
                measures.set(measure, events);
            }

            const event = events.find((candidate) => {
                return compareFractions(candidate.start, assignment.start) === 0;
            });
            if (event === undefined) {
                continue;
            }

            if (event.noteStyleId !== assignment.noteStyleId || event.articulation !== undefined) {
                event.noteStyleId = assignment.noteStyleId;
                event.articulation = undefined;
                changed = true;
                affectedTracks.add(track.id);
            }
        }

        if (!changed) {
            return false;
        }

        for (const [measure, events] of measures) {
            this.setMeasureEvents(measure, events);
        }

        this.announceTrackEdits(affectedTracks);

        return true;
    }

    /**
     * Replaces note content across the given measure ranges or whole measures in one edit. Fires one
     * arrangementMutated event (a single undo step) and one trackChanged event per affected track.
     * Ranges referencing a missing track or measure are ignored.
     *
     * @param replacements The replacements to apply.
     *
     * @returns True when at least one range changed.
     */
    public replaceMeasureContent(replacements: ITrackPieceReplace[]): boolean {
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

            const wholeMeasure = replacement.start === undefined && replacement.end === undefined;
            const rangeChanged = wholeMeasure
                ? this.replaceWholeMeasure(measure, replacement.events, replacement.subdivisions)
                : this.replaceFractionRange(measure, replacement.start ?? barStart, replacement.end ?? barLine,
                    replacement.events, replacement.subdivisions);

            // A whole-measure paste replaces the measure, so the target track's markings give way to the pasted
            // ones. They are dropped here and written after every bar was replaced, so a marking that reaches over a
            // barline is not dropped by the bar it reaches into. Markings of other tracks in that bar stay.
            const articulationsChanged = wholeMeasure && replacement.articulations !== undefined
                ? (arrangement.rangeArticulations?.dropTrackInBar(replacement.trackId, replacement.bar) ?? false)
                : false;

            // A simile repeats the measure before it, so a paste that would put the mark on the first measure
            // drops it; the pasted content stays.
            const simileValue = replacement.bar > 1 && replacement.simile === true;
            const simileChanged = (measure.simile === true) !== simileValue;
            if (simileChanged) {
                measure.simile = simileValue ? true : undefined;
            }

            if (rangeChanged || simileChanged || articulationsChanged) {
                changed = true;
                affectedTracks.add(replacement.trackId);
            }
        }

        if (this.addMeasureArticulations(replacements)) {
            changed = true;
            for (const replacement of replacements) {
                if (replacement.articulations !== undefined) {
                    affectedTracks.add(replacement.trackId);
                }
            }
        }

        if (changed) {
            this.announceTrackEdits(affectedTracks);
        }

        return changed;
    }

    /**
     * Sets or clears the one-bar repeat (simile) of a track piece. Setting the mark empties the measure's
     * content, because a simile holds none of its own; clearing it leaves the measure empty. The first
     * measure of a track cannot carry a simile. Fires one arrangementMutated event (a single undo step) and
     * one trackChanged event.
     *
     * @param trackId The track whose measure is marked.
     * @param bar The 1-based measure number.
     * @param value True to mark the measure as a simile, false to clear the mark.
     *
     * @returns True when the mark changed.
     */
    public setMeasureSimile(trackId: number, bar: number, value: boolean): boolean {
        return this.setMeasureSimiles([{ trackId, bar }], value);
    }

    /**
     * Sets or clears the one-bar repeat (simile) of several track pieces in one edit. Setting a mark empties
     * the measure's content, because a simile holds none of its own; clearing it leaves the measure empty.
     * The first measure of a track and a track piece that already holds the requested state are skipped.
     * Fires one arrangementMutated event (a single undo step) and one trackChanged event per affected track.
     *
     * @param targets The track pieces to mark.
     * @param value True to mark the measures as similes, false to clear the mark.
     *
     * @returns True when at least one mark changed.
     */
    public setMeasureSimiles(targets: ITrackPieceAddress[], value: boolean): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        const affectedTracks = new Set<number>();

        for (const target of targets) {
            const measure = arrangement.tracks.find((candidate) => {
                return candidate.id === target.trackId;
            })?.measures[target.bar - 1];

            // A simile repeats the measure before it, so the first measure has nothing to repeat.
            if (!measure || target.bar <= 1 || (measure.simile === true) === value) {
                continue;
            }

            if (value) {
                this.clearMeasureContent(measure);
            }

            measure.simile = value ? true : undefined;
            affectedTracks.add(target.trackId);
        }

        if (affectedTracks.size === 0) {
            return false;
        }

        this.announceTrackEdits(affectedTracks);

        return true;
    }

    /**
     * Sets or clears a repeat mark of the given bars in one edit. A mark sits on the barline at the side of the
     * bar it is named after: `Start` opens a repeated section there, `End` closes one. Bars outside the
     * arrangement and bars that already hold the requested state are skipped. Fires one arrangementMutated event
     * (a single undo step) and one trackChanged event per track, because a barline belongs to the bar of every
     * track.
     *
     * @param bars The 1-based bar numbers to mark.
     * @param mark The mark to set or clear.
     * @param value True to set the mark, false to clear it.
     *
     * @returns True when at least one mark changed.
     */
    public setRepeatBars(bars: number[], mark: RepeatMark, value: boolean): boolean {
        const arrangement = this.arrangement;
        const repeats = arrangement?.repeatBars;
        if (!arrangement || !repeats) {
            return false;
        }

        const barCount = arrangement.timeParams.length;
        let changed = false;

        for (const bar of bars) {
            if (!Number.isInteger(bar) || bar < 1 || bar > barCount) {
                continue;
            }

            const marks = repeats.get(bar) ?? {};
            if ((marks[mark] === true) === value) {
                continue;
            }

            if (value) {
                marks[mark] = true;
            } else {
                delete marks[mark];
            }

            if (marks.start === undefined && marks.end === undefined) {
                repeats.delete(bar);
            } else {
                repeats.set(bar, marks);
            }

            changed = true;
        }

        if (!changed) {
            return false;
        }

        this.announceTrackEdits(new Set(arrangement.tracks.map((track) => {
            return track.id;
        })));

        return true;
    }

    /**
     * Inserts a hairpin between two chronologically ordered sounding note anchors of one track. Fires one
     * arrangementMutated event (a single undo step) and one trackChanged event.
     *
     * @param kind Whether the dynamic level rises or falls from the first to the second anchor.
     * @param trackId The track the hairpin belongs to.
     * @param from The chronologically first note anchor.
     * @param to The chronologically second note anchor.
     *
     * @returns The inserted hairpin, or undefined when the placement is invalid.
     */
    public insertHairpin(kind: RangeArticulationKind.Crescendo | RangeArticulationKind.Decrescendo,
        trackId: number, from: IRangeArticulationAnchor, to: IRangeArticulationAnchor): IHairpin | undefined {
        const arrangement = this.arrangement;
        const articulations = arrangement?.rangeArticulations;
        if (!arrangement || !articulations) {
            return undefined;
        }

        const hairpin: IHairpin = {
            id: getNewId(),
            trackId,
            kind,
            from: RangeArticulations.cloneAnchor(from),
            to: RangeArticulations.cloneAnchor(to),
        };

        if (!RangeArticulations.isValidHairpin(arrangement, hairpin)
            || RangeArticulations.conflicts(hairpin, articulations.all)) {
            return undefined;
        }

        articulations.add(hairpin);
        this.announceTrackEdits(new Set([trackId]));

        return hairpin;
    }

    /**
     * Inserts an `f` marking at an event position of one track. Fires one arrangementMutated event (a single
     * undo step) and one trackChanged event.
     *
     * @param trackId The track the marking belongs to.
     * @param at The event position the marking sits at. A note or a rest.
     *
     * @returns The inserted marking, or undefined when no event starts at that position.
     */
    public insertForteMark(trackId: number, at: IRangeArticulationAnchor): IForteMark | undefined {
        const arrangement = this.arrangement;
        const articulations = arrangement?.rangeArticulations;
        if (!arrangement || !articulations) {
            return undefined;
        }

        const mark: IForteMark = {
            id: getNewId(),
            trackId,
            kind: RangeArticulationKind.Forte,
            at: RangeArticulations.cloneAnchor(at),
        };

        if (!RangeArticulations.isValidForteMark(arrangement, mark)
            || RangeArticulations.conflicts(mark, articulations.all)) {
            return undefined;
        }

        articulations.add(mark);
        this.announceTrackEdits(new Set([trackId]));

        return mark;
    }

    /**
     * Removes a hairpin or `f` marking by id. Fires one arrangementMutated event (a single undo step) and one
     * trackChanged event.
     *
     * @param id The id of the marking to remove.
     *
     * @returns True when a marking was removed.
     */
    public removeRangeArticulation(id: number): boolean {
        const articulations = this.arrangement?.rangeArticulations;
        const removed = articulations?.remove(id);
        if (removed === undefined) {
            return false;
        }

        this.announceTrackEdits(new Set([removed.trackId]));

        return true;
    }

    /**
     * Moves one anchor of a hairpin to a new note anchor. Fires one arrangementMutated event (a single undo
     * step) and one trackChanged event when the move is valid and actually changes the anchor.
     *
     * @param id The id of the hairpin to move.
     * @param trackId The track the hairpin belongs to after the move.
     * @param end The end of the hairpin to move.
     * @param anchor The note anchor to move it to.
     *
     * @returns True when the anchor changed.
     */
    public moveHairpinAnchor(id: number, trackId: number, end: HairpinEnd,
        anchor: IRangeArticulationAnchor): boolean {
        const arrangement = this.arrangement;
        const articulations = arrangement?.rangeArticulations;
        if (!arrangement || !articulations) {
            return false;
        }

        const existing = articulations.find(id);

        if (existing === undefined || !RangeArticulations.isHairpin(existing)) {
            return false;
        }

        const target = RangeArticulations.cloneAnchor(anchor);
        const current = end === HairpinEnd.From ? existing.from : existing.to;
        if (RangeArticulations.compareAnchors(current, target) === 0) {
            return false;
        }

        const moved = RangeArticulations.withMovedEnd({ ...existing, trackId }, end, anchor);

        if (!RangeArticulations.isValidHairpin(arrangement, moved)) {
            return false;
        }

        if (RangeArticulations.conflicts(moved, articulations.all)) {
            return false;
        }

        existing.trackId = trackId;
        existing.kind = moved.kind;
        existing.from = moved.from;
        existing.to = moved.to;
        this.announceTrackEdits(new Set([existing.trackId]));

        return true;
    }

    /**
     * Moves both anchors of a hairpin. Fires one arrangementMutated event (a single undo step) and one
     * trackChanged event when the move is valid and actually changes an anchor.
     *
     * @param id The id of the hairpin to move.
     * @param trackId The track the hairpin belongs to after the move.
     * @param from The note anchor the first end moves to.
     * @param to The note anchor the second end moves to.
     *
     * @returns True when an anchor changed.
     */
    public moveHairpin(id: number, trackId: number, from: IRangeArticulationAnchor,
        to: IRangeArticulationAnchor): boolean {
        const arrangement = this.arrangement;
        const articulations = arrangement?.rangeArticulations;
        if (!arrangement || !articulations) {
            return false;
        }

        const existing = articulations.find(id);

        if (existing === undefined || !RangeArticulations.isHairpin(existing)) {
            return false;
        }

        const moved = RangeArticulations.withMovedEnd(
            { ...existing, trackId, from: RangeArticulations.cloneAnchor(from) }, HairpinEnd.To, to);
        if (RangeArticulations.compareAnchors(moved.from, existing.from) === 0
            && RangeArticulations.compareAnchors(moved.to, existing.to) === 0) {
            return false;
        }

        if (!RangeArticulations.isValidHairpin(arrangement, moved)
            || RangeArticulations.conflicts(moved, articulations.all)) {
            return false;
        }

        existing.trackId = trackId;
        existing.kind = moved.kind;
        existing.from = moved.from;
        existing.to = moved.to;
        this.announceTrackEdits(new Set([existing.trackId]));

        return true;
    }

    /**
     * Moves an `f` marking to a new event position. Fires one arrangementMutated event (a single undo step) and
     * one trackChanged event when the move is valid and actually changes the position.
     *
     * @param id The id of the marking to move.
     * @param trackId The track the marking belongs to after the move.
     * @param anchor The event position to move it to.
     *
     * @returns True when the position changed.
     */
    public moveForteMark(id: number, trackId: number, anchor: IRangeArticulationAnchor): boolean {
        const arrangement = this.arrangement;
        const articulations = arrangement?.rangeArticulations;
        if (!arrangement || !articulations) {
            return false;
        }

        const existing = articulations.find(id);

        if (existing === undefined || RangeArticulations.isHairpin(existing)) {
            return false;
        }

        const target = RangeArticulations.cloneAnchor(anchor);
        if (RangeArticulations.compareAnchors(existing.at, target) === 0) {
            return false;
        }

        const moved: IForteMark = { ...existing, trackId, at: target };
        if (!RangeArticulations.isValidForteMark(arrangement, moved)
            || RangeArticulations.conflicts(moved, articulations.all)) {
            return false;
        }

        existing.trackId = trackId;
        existing.at = moved.at;
        this.announceTrackEdits(new Set([existing.trackId]));

        return true;
    }

    /**
     * Creates a subdivision (tuplet or symmetric split) over an exact fractional range of one
     * track, replacing the range with `actual` equal rest slots. Fires one arrangementMutated
     * event (a single undo step) and one trackChanged event.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the subdivision (inclusive).
     * @param end The exact end position of the subdivision (exclusive).
     * @param actual The number of equal slots the subdivision contains.
     * @param normal The number of grid steps the subdivision replaces.
     * @param initialEvents Optional content copied into the first subdivision slots.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivision(trackId: number, bar: number, start: IFraction, end: IFraction,
        actual: number, normal: number,
        initialEvents?: Array<ISubdivisionSlotContent | undefined>): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!track || !measure || actual < 1 || normal < 1) {
            return false;
        }

        const span = subtractFractions(end, start);
        if (span.numerator <= 0) {
            return false;
        }

        // A tuplet needs a bracket above and one below its notes, so the second level is the limit.
        const firstIndex = measure.events.findIndex((event) => {
            return compareFractions(event.start, start) === 0;
        });
        if (firstIndex >= 0 && MeasureProjection.tupletDepthOf(measure, firstIndex) >= maxTupletLevels) {
            return false;
        }

        const slotDuration = divideFraction(span, actual);
        const events: IMeasureEvent[] = [];
        for (let index = 0; index < actual; index++) {
            const initialEvent = initialEvents?.[index];
            const event: IMeasureEvent = {
                start: multiplyFraction(slotDuration, index),
                duration: { ...slotDuration },
            };

            if (initialEvent?.noteStyleId !== undefined) {
                event.noteStyleId = initialEvent.noteStyleId;
            }

            if (initialEvent?.articulation !== undefined) {
                event.articulation = initialEvent.articulation;
            }

            events.push(event);
        }

        const subdivision: ISubdivision = {
            startIndex: 0,
            actual,
            normal,
            isTuplet: computeIsTuplet(actual, normal, measure.meter),
        };

        const { result, shiftedStartIndex } = this.buildFractionRangeReplacement(measure, start, end, events);
        const remappedSubdivisions = this.remapSubdivisions(measure, result, true);

        measure.events.splice(0, measure.events.length, ...result.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length, ...remappedSubdivisions);
        measure.subdivisions.push({ ...subdivision, startIndex: shiftedStartIndex });

        this.announceTrackEdit(track);

        return true;
    }

    /**
     * Creates a subdivision over a fractional span, resolving the number of parent units it replaces
     * from the span itself. A parent unit is a slot of the subdivision the span lies in, or the
     * measure's base subdivision outside any, so a caller that addresses events by fraction — the
     * staff editor, which has no grid positions — can place a subdivision inside another one. Fires
     * one arrangementMutated event (a single undo step) and one trackChanged event.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the subdivision (inclusive).
     * @param end The exact end position of the subdivision (exclusive).
     * @param actual The number of equal slots the subdivision contains.
     * @param initialEvents Optional content copied into the first subdivision slots.
     *
     * @returns True when the subdivision was created.
     */
    public createSubdivisionOverSpan(trackId: number, bar: number, start: IFraction, end: IFraction,
        actual: number, initialEvents?: Array<ISubdivisionSlotContent | undefined>): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!measure) {
            return false;
        }

        const units = this.parentUnitCountOf(measure, start, end);
        if (units === undefined) {
            return false;
        }

        return this.createSubdivision(trackId, bar, start, end, actual, units, initialEvents);
    }

    /**
     * Deletes the subdivision whose first event starts at the given position, replacing its span
     * with plain rest slots while preserving all other subdivisions. The span is resolved through
     * the measure projection so nested subdivisions are handled correctly. Fires one
     * arrangementMutated event (a single undo step) and one trackChanged event.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the subdivision's first event.
     *
     * @returns True when a subdivision was deleted.
     */
    public deleteSubdivisionAt(trackId: number, bar: number, start: IFraction): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!track || !measure) {
            return false;
        }

        const subdivisionIndex = measure.subdivisions.findIndex((subdivision) => {
            const event = measure.events[subdivision.startIndex];

            return compareFractions(event.start, start) === 0;
        });
        if (subdivisionIndex < 0) {
            return false;
        }

        const subdivision = measure.subdivisions[subdivisionIndex];
        const projectedSubdivision = this.findInnermostSubdivision(MeasureProjection.project(measure), start);
        if (!projectedSubdivision) {
            return false;
        }

        const span = projectedSubdivision.span;
        const end = addFractions(start, span);
        const slotDuration = divideFraction(span, subdivision.normal);

        const restSlots: IMeasureEvent[] = [];
        for (let index = 0; index < subdivision.normal; index++) {
            restSlots.push({
                start: multiplyFraction(slotDuration, index),
                duration: { ...slotDuration },
            });
        }

        // Remove the target subdivision before remapping so it is not carried over onto the new
        // rest slots (its first event start coincides with the replacement start).
        measure.subdivisions.splice(subdivisionIndex, 1);

        const { result } = this.buildFractionRangeReplacement(measure, start, end, restSlots);
        const remappedSubdivisions = this.remapSubdivisions(measure, result, true);

        measure.events.splice(0, measure.events.length, ...result.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length, ...remappedSubdivisions);

        this.announceTrackEdit(track);

        return true;
    }

    /**
     * Checks whether the subdivision whose first event starts at the given position exists and
     * contains only rest slots.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the subdivision's first event.
     *
     * @returns True when an empty subdivision starts at the given position.
     */
    public hasEmptySubdivisionAt(trackId: number, bar: number, start: IFraction): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!track || !measure) {
            return false;
        }

        const subdivision = this.findInnermostSubdivision(MeasureProjection.project(measure), start);

        return subdivision !== undefined && this.subdivisionIsEmpty(subdivision);
    }

    /**
     * Checks whether the event starting at the given position belongs to a subdivision. Subdivision
     * slots subdivide a grid step into equal fractions, so their duration is fixed and can never be
     * replaced by a note length selected in the toolbar.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     * @param start The exact start position of the event.
     *
     * @returns True when the event is a subdivision slot.
     */
    public isSubdivisionSlot(trackId: number, bar: number, start: IFraction): boolean {
        const arrangement = this.arrangement;
        const track = arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[bar - 1];
        if (!track || !measure) {
            return false;
        }

        return this.isSlotStart(measure, start);
    }

    /**
     * Sets the time signature of the arrangement.
     *
     * @param timeSignature The new time signature string (e.g. "4/4").
     * @param pulse The pulse value (e.g. "1/4").
     *
     * @returns True if the time signature was changed.
     */
    public setTimeSignature(timeSignature: string, pulse: string): boolean {
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
     * Makes a bar available for an edit. A bar behind the last one extends the arrangement by empty
     * measures, which the user can switch off; without that an edit reaching there has no place.
     *
     * @param bar The one-based bar an edit wants to write to.
     *
     * @returns True when the bar exists after the call.
     */
    public ensureBarAvailable(bar: number): boolean {
        const arrangement = this.arrangement;
        if (!arrangement) {
            return false;
        }

        if (bar <= arrangement.timeParams.length) {
            return true;
        }

        if (!this.extendsOnOverflow()) {
            return false;
        }

        (arrangement as Arrangement).insertBars(arrangement.timeParams.length,
            bar - arrangement.timeParams.length, false, false);

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
        // A copied bar can need more room than the default width.
        this.widenMeasuresToFloor();
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
        this.widenMeasuresToFloor();
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
            id: number; name: string; content: string; tagIds: number[];
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
            tagIds: data.tagIds,
            perm: data.perm,
        };

        return [score, res.status];
    }

    /**
     * Makes sure a score list entry carries its content. The list names the scores and their tags, so the content
     * only arrives when the score is actually opened.
     *
     * @param score The entry to complete.
     *
     * @returns The same entry, or undefined when the backend could not deliver the score.
     */
    public async ensureScoreContent(score: ISbDmScore): Promise<ISbDmScore | undefined> {
        if (score.content.length > 0) {
            return score;
        }

        const [fresh] = await this.fetchScoreById(score.id);
        if (!fresh) {
            return undefined;
        }

        score.content = fresh.content;
        score.tagIds = fresh.tagIds;
        score.perm = fresh.perm;

        return score;
    }

    /**
     * Creates a new score in the backend and adds it to the score list.
     *
     * @param name The name of the new score.
     * @param content The packed arrangement to store with it.
     *
     * @returns The new score entry, or undefined when the backend refused the request.
     */
    public async addScore(name: string, content: string): Promise<ISbDmScore | undefined> {
        const storedName = NameText.normalize(name);

        const res = await this.fetchApi(`/api?action=addScore`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name: storedName, content }),
        });

        if (!res) {
            return undefined;
        }

        const { success, id } = await res.json() as { success: boolean; id: number; };
        if (!success) {
            return undefined;
        }

        if (this.data.arrangement) {
            (this.data.arrangement as Arrangement).id = id;
        }

        const newScore: ISbDmScore = {
            type: SbDmEntityType.Score,
            id,
            name: storedName,
            content,
            tagIds: [],
            lineup: ScoreLineup.read(content),
            state: {
                initialized: true,
                isLeaf: true,
                expanded: true,
                expandedOnce: true,
            },
        };

        this.data.scores.push(newScore);
        this.data.scores.sort((left, right) => {
            return NameText.compare(left.name, right.name);
        });

        return newScore;
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
        score.lineup = ScoreLineup.read(content);
    }

    /**
     * Renames a score, in the backend and in the list.
     *
     * @param entry The score to rename.
     * @param newName The new name.
     */
    public async renameEntry(entry: ISbDmScore, newName: string): Promise<void> {
        const res = await this.fetchApi(`/api?action=renameEntry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "score", id: entry.id, name: newName }),
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
     * @returns The outcome of the reset, with the backend's error text when it failed.
     */
    public async resetDatabase(): Promise<IDatabaseResetResult> {
        const res = await this.fetchApi("/api?action=setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overwrite: true }),
        }, true, true);

        if (!res) {
            return { ok: false, error: "The backend could not be reached." };
        }

        if (res.ok) {
            return { ok: true };
        }

        let body: { error?: string; } = {};
        try {
            body = await res.json() as { error?: string; };
        } catch {
            // Not a JSON body — the status line remains the only information available.
        }

        return { ok: false, error: body.error ?? `HTTP ${res.status} ${res.statusText}` };
    }

    public async deleteEntry(entry: ISbDmScore): Promise<void> {
        const res = await this.fetchApi(`/api?action=delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "score", id: entry.id }),
        });

        if (!res) {
            return;
        }

        const index = this.data.scores.findIndex((candidate) => {
            return candidate.id === entry.id;
        });

        if (index >= 0) {
            this.data.scores.splice(index, 1);
            void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.EntryDeleted);
        }
    }

    /**
     * Fetches the explicit permissions of a score.
     * Owners and admins can call this.
     *
     * @param entityType The entity type, which is always "score".
     * @param entityId The entity's database id.
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
     * Sets the permissions of a score. Owner or admin only.
     *
     * @param entityType The entity type, which is always "score".
     * @param entityId The entity's database id.
     * @param ownerId The new owner id, or null to drop the owner. Omit to leave it unchanged.
     * @param addGroups Groups to add with writable flag.
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
        }, true, true);

        if (!res?.ok) {
            const data = res ? await res.json() as { error?: string; } : undefined;

            throw new Error(data?.error ?? "Failed to set permissions.");
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
        this.applySession(token, user, capabilities);
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
     * @param email The email address of the account.
     * @param password The password.
     * @returns True if login was successful.
     */
    public async login(email: string, password: string): Promise<boolean> {
        const res = await this.fetchApi("/api?action=login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        }, false); // Don't attach auth header for login request.

        if (!res) {
            return false;
        }

        const data = await res.json() as ILoginResponse;

        this.applySession(data.token, data.user, data.capabilities);

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

        this.applySession(data.token, data.user, data.capabilities, data.group);

        return true;
    }

    /**
     * Logs out the current user and clears all auth state.
     */
    public async logout(): Promise<void> {
        // Notify the backend to clear the refresh token cookie.
        await this.fetchApi("/api?action=logout", { method: "POST" });

        this.clearAuthState();
    }

    /**
     * Resets the entire data model to its initial, unloaded state.
     * Clears all loaded data (scores, instruments, sound library, arrangement,
     * undo manager state) so a fresh login can reload everything.
     */
    public reset(): void {
        this.data = {
            soundLib: [],
            scores: [],
            instruments: [],
        };
        this.tagCatalogue = [];
        this.tagScopes = [];
        this.setListCatalogue = [];
        this.readableScores = 0;
        this.activeSetList = undefined;

        this.clearAuthState();
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

        if (restored) {
            void requisitions.execute("authChanged", undefined);
            void this.reloadTags();
            void this.reloadSetLists();
        } else {
            await this.loadDemoCapabilities();
        }

        return restored;
    }

    /**
     * Reads the capabilities the backend grants a visitor without a session, which is what a demo runs on, and
     * never asks for the session stored in the browser.
     */
    public async loadDemoCapabilities(): Promise<void> {
        const res = await this.fetchApi("/api?action=whoami", {
            headers: { Accept: "application/json" },
            credentials: "include",
        }, false);

        if (res) {
            const data = await res.json() as IWhoamiResponse;

            this.currentGroup = undefined;
            this.currentCapabilities = data.capabilities;
        }

        void requisitions.execute("authChanged", undefined);
        void this.reloadTags();
        void this.reloadSetLists();
    }

    /**
     * @returns The curated scores a demo may offer, as the backend lists them.
     */
    public async listDemoScores(): Promise<IDemoScoreEntry[]> {
        const res = await this.fetchApi("/api?action=listDemoScores", {
            headers: { Accept: "application/json" },
        }, false);

        if (!res) {
            return [];
        }

        const data = await res.json() as { scores?: IDemoScoreEntry[]; };

        return data.scores ?? [];
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
     * Creates a new user. Admin-only. The account stays unusable until its owner opens the confirmation link the
     * backend mails to the address.
     *
     * @param email       The email address of the account.
     * @param password    The password (min 6 chars).
     * @param displayName The display name.
     * @returns The new user's id.
     */
    public async createUser(email: string, password: string, displayName: string,
    ): Promise<number> {
        const res = await this.fetchApi("/api?action=createUser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, displayName }),
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
     * Lists all groups. Requires an authenticated session.
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
     * @param name The group name.
     * @param description The group description (optional).
     * @param colorIndex The palette index of the group colour (optional, the first palette colour if omitted).
     * @param password The group password (optional, no password if omitted).
     * @param adminId The user id of the group admin (optional, no admin if omitted).
     *
     * @returns The new group's id and colour index.
     */
    public async createGroup(name: string, description: string, colorIndex?: number,
        password?: string, adminId?: number | null,
    ): Promise<{ id: number; colorIndex: number; }> {
        const body: Record<string, unknown> = { name, description };

        if (colorIndex !== undefined) {
            body.colorIndex = colorIndex;
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

        const data = await res.json() as { success?: boolean; id?: number; colorIndex?: number; error?: string; };

        if (data.error) {
            throw new Error(data.error);
        }

        return { id: data.id!, colorIndex: data.colorIndex! };
    }

    /**
     * Updates an existing group. Admin-only.
     *
     * @param id The group id.
     *
     * @param fields Fields to update.
     * @param fields.name The new name (optional).
     * @param fields.description The new description (optional).
     * @param fields.colorIndex The palette index of the new colour (optional).
     * @param fields.password The new password, or null to remove (optional).
     * @param fields.adminId The new admin user ID, or null to remove (optional).
     */
    public async updateGroup(id: number, fields: {
        name?: string; description?: string; colorIndex?: number;
        password?: string | null; adminId?: number | null;
    },): Promise<void> {
        const body: Record<string, unknown> = { id };

        if (fields.name !== undefined) {
            body.name = fields.name;
        }

        if (fields.description !== undefined) {
            body.description = fields.description;
        }

        if (fields.colorIndex !== undefined) {
            body.colorIndex = fields.colorIndex;
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
     * Rebuilds the score list from the backend for a tag combination. An empty combination lists every score the
     * caller can read. A set list then restricts the result to its members and puts them in the list's saved order.
     * Only the answer to the newest query is applied, so a slow response cannot replace a list that a later filter
     * already produced.
     *
     * @param combination The tags of the manual filter.
     * @param setListId The set list to restrict the result to, or undefined for all readable scores.
     *
     * @returns What became of the response.
     */
    public async queryScores(combination: ITagCombination, setListId?: number): Promise<IScoreQueryOutcome> {
        const normalized = TagCombination.normalize(combination);
        this.scoreListCombination = normalized;
        this.activeSetList = setListId;

        const token = ++this.scoreQueryCount;

        const res = setListId === undefined
            ? await this.fetchApi("/api?action=listScores", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: JSON.stringify({ groups: normalized.groups }),
            }, true, true)
            : await this.fetchApi("/api?action=getSetList", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: JSON.stringify({ id: setListId, groups: normalized.groups }),
            }, true, true);

        if (!res) {
            return ScoreBookDataModel.queryOutcome(token, this.scoreQueryCount, ScoreQueryResult.Failed);
        }

        if (res.status === 409) {
            let refusal: { ignoredTagIds?: number[]; } = {};
            try {
                refusal = await res.json() as { ignoredTagIds?: number[]; };
            } catch {
                // A refusal without a readable body still means the filter names tags that cannot be used.
            }

            return ScoreBookDataModel.queryOutcome(token, this.scoreQueryCount, ScoreQueryResult.InvalidFilter,
                refusal.ignoredTagIds ?? []);
        }

        // A set list that is gone or no longer readable has to be given up: the caller picks another one.
        if (setListId !== undefined && (res.status === 403 || res.status === 404)) {
            return ScoreBookDataModel.queryOutcome(token, this.scoreQueryCount, ScoreQueryResult.SetListUnavailable);
        }

        if (!res.ok) {
            return ScoreBookDataModel.queryOutcome(token, this.scoreQueryCount, ScoreQueryResult.Failed);
        }

        const data = await res.json() as { scores?: IScoreListEntry[]; };

        // A newer query started while this response was on its way; its answer is the one the user asked for.
        if (token !== this.scoreQueryCount) {
            return { result: ScoreQueryResult.Superseded, ignoredTagIds: [] };
        }

        const existing = new Map(this.data.scores.map((score) => {
            return [score.id, score] as [number, ISbDmScore];
        }));

        this.data.scores = (data.scores ?? []).map((entry) => {
            const score = existing.get(entry.id);

            if (score) {
                score.name = entry.name;
                score.tagIds = entry.tagIds;
                score.lineup = entry.lineup;
                score.meta = entry.meta;
                score.perm = entry.perm;

                return score;
            }

            return {
                type: SbDmEntityType.Score,
                id: entry.id,
                name: entry.name,
                content: "",
                tagIds: entry.tagIds,
                lineup: entry.lineup,
                meta: entry.meta,
                perm: entry.perm,
                state: {
                    initialized: false,
                    expanded: true,
                    expandedOnce: true,
                    isLeaf: true,
                },
            };
        });

        void requisitions.execute("scoreBookLoaded", ScoreBookChangeReason.LibraryRefreshed);

        return { result: ScoreQueryResult.Applied, ignoredTagIds: [] };
    }

    /**
     * Reloads the tag catalogue and the owner scopes of the current user. The usable tags depend on the session, so
     * this runs whenever the login changes.
     */
    public async reloadTags(): Promise<void> {
        const [tags, scopes] = await Promise.all([this.listTags(), this.listTagOwnerScopes()]);

        this.tagCatalogue = tags;
        this.tagScopes = scopes;

        void requisitions.execute("tagsChanged", undefined);
    }

    /**
     * @returns The tags the current user can use, as the backend lists them. Visitors without a session get none.
     */
    public async listTags(): Promise<ITagInfo[]> {
        const res = await this.fetchApi("/api?action=listTags", {
            headers: { Accept: "application/json" },
        });

        if (!res) {
            return [];
        }

        const data = await res.json() as { tags?: ITagInfo[]; };

        return data.tags ?? [];
    }

    /**
     * @returns The owner scopes the current user may create tags in; an empty list means they cannot create any.
     */
    public async listTagOwnerScopes(): Promise<ITagOwnerScope[]> {
        const res = await this.fetchApi("/api?action=listTagOwnerScopes", {
            headers: { Accept: "application/json" },
        });

        if (!res) {
            return [];
        }

        const data = await res.json() as { scopes?: ITagOwnerScope[]; };

        return data.scopes ?? [];
    }

    /**
     * Reloads the set lists the current user may select and tells the collection about it. The set lists depend on
     * the session and on the tags, so this runs whenever either changes, and after every change to a list.
     */
    public async reloadSetLists(): Promise<void> {
        const res = await this.fetchApi("/api?action=listSetLists", {
            headers: { Accept: "application/json" },
        });

        if (res === undefined) {
            this.setListCatalogue = [];
        } else {
            const data = await res.json() as { setLists?: ISetListInfo[]; readableScoreCount?: number; };
            this.setListCatalogue = data.setLists ?? [];
            this.readableScores = data.readableScoreCount ?? 0;
        }

        if (this.activeSetList !== undefined && !this.setListCatalogue.some((list) => {
            return list.id === this.activeSetList;
        })) {
            // The list was deleted or left the caller's reach; the next query shows all readable scores again.
            this.activeSetList = undefined;
        }

        void requisitions.execute("setListsChanged", undefined);
    }

    /**
     * Creates a set list with the tag of the same name in the given owner scope.
     *
     * @param name The name of the list and its tag.
     * @param groupId The owner scope; undefined creates a list of the administrators.
     *
     * @returns What became of the request, with the new list's id.
     */
    public async createSetList(name: string, groupId?: number): Promise<ISetListChangeResult & { id?: number; }> {
        const res = await this.fetchApi("/api?action=createSetList", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, groupId }),
        }, true, true);

        if (res === undefined) {
            return { success: false, error: "The set list could not be created." };
        }

        const data = await res.json() as {
            success?: boolean; id?: number; revision?: number; conflict?: boolean; error?: string;
        };

        if (!res.ok || data.success !== true) {
            return { success: false, conflict: data.conflict, revision: data.revision, error: data.error };
        }

        await this.reloadSetLists();

        return { success: true, revision: data.revision, id: data.id };
    }

    /**
     * Renames a set list, which renames its tag.
     *
     * @param id The list to rename.
     * @param revision The revision the caller edited.
     * @param name The new name.
     *
     * @returns What became of the change.
     */
    public async renameSetList(id: number, revision: number, name: string): Promise<ISetListChangeResult> {
        const res = await this.fetchApi("/api?action=updateSetList", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, revision, name }),
        }, true, true);

        return this.finishSetListChange(res);
    }

    /**
     * Deletes a set list and its tag.
     *
     * @param id The list to delete.
     *
     * @returns What became of the change.
     */
    public async deleteSetList(id: number): Promise<ISetListChangeResult> {
        const res = await this.fetchApi("/api?action=deleteSetList", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        }, true, true);

        return this.finishSetListChange(res);
    }

    /**
     * Stores the order of a set list.
     *
     * @param id The list to change.
     * @param revision The revision the caller edited.
     * @param order The score ids in the order the list is to hold.
     *
     * @returns What became of the change.
     */
    public async reorderSetList(id: number, revision: number, order: number[]): Promise<ISetListChangeResult> {
        const res = await this.fetchApi("/api?action=reorderSetList", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, revision, order }),
        }, true, true);

        return this.finishSetListChange(res);
    }

    /**
     * Grants a set list to groups, changes what a group may do, or ends a grant, exactly like a score is shared.
     * The World group is refused by the backend; there is no anonymous access to a list.
     *
     * @param id The list to change.
     * @param revision The revision the caller edited.
     * @param addGroups The groups that receive or keep access, with their new write flag.
     * @param removeGroupIds The groups that lose access.
     *
     * @returns What became of the change.
     */
    public async changeSetListAccess(id: number, revision: number,
        addGroups: Array<{ groupId: number; writable: boolean; }>,
        removeGroupIds: number[]): Promise<ISetListChangeResult> {
        const res = await this.fetchApi("/api?action=setPermissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType: "setlist",
                entityId: id,
                revision,
                addGroups,
                removeGroups: removeGroupIds.map((groupId) => {
                    return { groupId };
                }),
            }),
        }, true, true);

        return this.finishSetListChange(res);
    }

    /**
     * @param id The set list to read.
     *
     * @returns The readable members in the list's saved order, without any manual filter. The set-list editor orders
     * exactly this set, so no member it cannot see is displaced.
     */
    public async loadSetListScores(id: number): Promise<IScoreListEntry[]> {
        const res = await this.fetchApi("/api?action=getSetList", {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ id, groups: [] }),
        }, true, true);

        if (!res?.ok) {
            return [];
        }

        const data = await res.json() as { scores?: IScoreListEntry[]; };

        return data.scores ?? [];
    }

    /**
     * @returns The readable scores with their tags and lineups, which the set-list editor offers for adding members.
     */
    public async listReadableScores(): Promise<IScoreListEntry[]> {
        const res = await this.fetchApi("/api?action=listScores", {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ groups: [] }),
        });

        if (!res) {
            return [];
        }

        const data = await res.json() as { scores?: IScoreListEntry[]; };

        return data.scores ?? [];
    }

    /**
     * Creates a tag in an owner scope. A name the user can already use answers with the existing tag, so the caller
     * never has to know which of the two happened.
     *
     * @param name The name of the new tag.
     * @param groupId The owner scope; undefined creates a global tag.
     * @param colorIndex The index of the tag colour in the palette; without one the backend picks it.
     *
     * @returns The created or reused tag, or undefined when the backend refused the request.
     */
    public async createTag(name: string, groupId?: number, colorIndex?: number): Promise<ITagInfo | undefined> {
        const res = await this.fetchApi("/api?action=createTag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, groupId, colorIndex }),
        }, true, true);

        if (!res?.ok) {
            return undefined;
        }

        const data = await res.json() as { tag: ITagInfo; };
        await this.reloadTags();

        return data.tag;
    }

    /**
     * Renames a tag or changes its colour.
     *
     * @param id The tag to change.
     * @param name The new name, or undefined to keep the current one.
     * @param colorIndex The new palette index, or undefined to keep the current one.
     *
     * @returns The updated tag, or undefined when the backend refused the request.
     */
    public async updateTag(id: number, name?: string, colorIndex?: number): Promise<ITagInfo | undefined> {
        const res = await this.fetchApi("/api?action=updateTag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name, colorIndex }),
        }, true, true);

        if (!res?.ok) {
            return undefined;
        }

        const data = await res.json() as { tag: ITagInfo; };
        await this.reloadTags();

        return data.tag;
    }

    /**
     * Deletes a tag. Its assignments go with it.
     *
     * @param id The tag to delete.
     */
    public async deleteTag(id: number): Promise<void> {
        const res = await this.fetchApi("/api?action=deleteTag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        if (!res) {
            return;
        }

        // A set-list tag takes its list with it, so the selector cannot keep showing the old state.
        await this.reloadTags();
        await this.reloadSetLists();
        await this.queryScores(this.scoreListCombination, this.activeSetList);
    }

    /**
     * Puts a tag on a score. The change is saved immediately and is not part of the arrangement snapshot, so it is
     * neither undoable nor does it mark the score as edited.
     *
     * @param scoreId The score to tag.
     * @param tagId The tag to assign.
     *
     * @returns Whether the backend accepted the change.
     */
    public async assignTag(scoreId: number, tagId: number): Promise<boolean> {
        return this.changeScoreTag("assignTag", scoreId, tagId);
    }

    /**
     * Takes a tag off a score. The backend keeps an instrument tag whose instrument the score still uses.
     *
     * @param scoreId The score to change.
     * @param tagId The tag to remove.
     *
     * @returns Whether the backend accepted the change.
     */
    public async unassignTag(scoreId: number, tagId: number): Promise<boolean> {
        return this.changeScoreTag("unassignTag", scoreId, tagId);
    }

    /**
     * @returns The instrument tag ids the loaded arrangement needs, resolved against the catalogue, so a track that
     * was just added already shows its tag before the next save.
     */
    public get arrangementInstrumentTagIds(): number[] {
        const arrangement = this.data.arrangement;
        if (!arrangement) {
            return [];
        }

        const typeIds = new Set(arrangement.tracks.map((track) => {
            return track.instrument.typeId;
        }));

        return this.tagCatalogue.filter((tag) => {
            return tag.instrumentTypeId !== undefined && typeIds.has(tag.instrumentTypeId);
        }).map((tag) => {
            return tag.id;
        });
    }

    /**
     * @param scoreId The score to look up.
     *
     * @returns The score list entry with that id, if the list holds it.
     */
    public findScore(scoreId: number): ISbDmScore | undefined {
        return this.data.scores.find((score) => {
            return score.id === scoreId;
        });
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
    public async lockScore(scoreId: number, prevToken?: string): Promise<IScoreLockResult> {
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

        const result = await res.json() as IScoreLockResult;

        // A refusal keeps the status, which tells a session that ended from a score this account may not write.
        return res.ok ? result : { ...result, success: false, status: res.status };
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

        AppStorage.saveCurrentScore(stringifyPackedArrangement((arrangement as Arrangement).toSnapshot()));
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

            await this.assignNewArrangementTags(data.id);
            await this.reloadTags();
            await this.queryScores(this.scoreListCombination, this.activeSetList);

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
            throw new Error(await ScoreBookDataModel.saveFailureMessage(res));
        }

        // Keep the score library entry name in sync with the arrangement title.
        await this.syncScoreLibName(arrangement.id, arrangement.title);

        // The save derives the instrument tags from the tracks, so the catalogue and the filtered list change even
        // though the arrangement carries no tags of its own.
        await this.reloadTags();
        await this.queryScores(this.scoreListCombination, this.activeSetList);

        return content;
    }

    /**
     * @param token The query that produced an answer.
     * @param current The newest query.
     * @param result What the answer means.
     * @param ignoredTagIds The tag ids the filter named that could not be used.
     *
     * @returns The outcome, marked as superseded when a newer query had already started.
     */
    private static queryOutcome(token: number, current: number, result: ScoreQueryResult,
        ignoredTagIds: number[] = []): IScoreQueryOutcome {
        if (token !== current) {
            return { result: ScoreQueryResult.Superseded, ignoredTagIds: [] };
        }

        return { result, ignoredTagIds };
    }

    /**
     * @param res The response the backend refused a save with.
     *
     * @returns The reason the save failed, stated with the status the backend answered with.
     */
    private static async saveFailureMessage(res: Response): Promise<string> {
        if (res.status === 401) {
            return "Your session has ended — log in again to save this score.";
        }

        if (res.status === 403) {
            return "You do not have permission to save this score.";
        }

        const data = await res.json().catch(() => {
            return undefined;
        }) as { error?: string; } | undefined;

        return data?.error ?? `Saving failed: HTTP ${res.status} ${res.statusText}`;
    }

    /**
     * Describes a track's timeline as a string, so the state before and after a rebuild can be compared
     * to find out whether anything changed at all.
     *
     * @param items The timeline items to describe.
     *
     * @returns The description of the timeline.
     */
    private static timelineSignature(items: IAbsoluteTrackItem[]): string {
        return JSON.stringify(items);
    }

    /**
     * Remembers how the session logged in, for a refresh that has lost the in-memory token.
     *
     * @param group The group the session logged in through, or undefined for a plain login.
     */
    private static storeAuthHints(group?: IGroupInfo): void {
        const store = AppStorage.sessionStore;
        if (store === undefined) {
            return;
        }

        if (group === undefined) {
            store.removeItem("authType");
            store.removeItem("groupId");
        } else {
            store.setItem("authType", "group");
            store.setItem("groupId", String(group.id));
        }
    }

    /**
     * @returns How the session logged in, as far as the tab still remembers it.
     */
    private static readAuthHints(): IAuthHints {
        const store = AppStorage.sessionStore;

        return {
            authType: store?.getItem("authType") ?? undefined,
            groupId: store?.getItem("groupId") ?? undefined,
        };
    }

    /**
     * Drops the session state and tells the app about it, so it can ask for a login again.
     */
    private clearAuthState(): void {
        this.accessToken = undefined;
        this.currentUser = undefined;
        this.currentGroup = undefined;
        this.currentCapabilities = {
            canEditScores: false,
            canManageUsers: false,
            canManageInstruments: false,
            canExportMP3: false,
        };

        ScoreBookDataModel.storeAuthHints();

        void requisitions.execute("authChanged", undefined);
        void this.reloadTags();
        void this.reloadSetLists();
    }

    /**
     * @param token The access token to authenticate with.
     * @param user The user the session belongs to.
     * @param capabilities What the session may do.
     * @param group The group the session logged in through, or undefined for a plain login.
     */
    private applySession(token: string, user: IUserInfo, capabilities: ICapabilities,
        group?: IGroupInfo): void {
        this.accessToken = token;
        this.currentUser = user;
        this.currentGroup = group;
        this.currentCapabilities = capabilities;

        // A login ends the state a failed refresh left behind, so the next expired token is refreshed again.
        this.sessionRefreshFailed = false;

        ScoreBookDataModel.storeAuthHints(group);

        void requisitions.execute("authChanged", undefined);
        void this.reloadTags();
        void this.reloadSetLists();
    }

    /**
     * Takes the one-bar repeat mark off a measure, which leaves an empty piece behind.
     *
     * @param measure The measure to unmark.
     *
     * @returns True when the measure carried the mark.
     */
    private clearSimile(measure: ISbDmTrackPiece): boolean {
        if (measure.simile !== true) {
            return false;
        }

        measure.simile = undefined;

        return true;
    }

    /**
     * Clears all note content from a measure, leaving a single whole rest.
     *
     * @param measure The measure to clear.
     *
     * @returns True when the measure had any content.
     */
    private clearMeasureContent(measure: ISbDmTrackPiece): boolean {
        const wholeRest: IMeasureEvent[] = [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 1 },
        }];

        return this.setMeasureEvents(measure, wholeRest, false);
    }

    /**
     * Applies a note style to every event of a measure, preserving each event's duration.
     *
     * @param measure The measure to fill.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any event changed.
     */
    private setMeasureNoteStyle(measure: ISbDmTrackPiece, noteStyleId: string): boolean {
        const events = measure.events.map((event) => {
            return this.cloneEvent(event);
        });

        let changed = false;

        for (const event of events) {
            if (event.noteStyleId !== noteStyleId || event.articulation !== undefined) {
                event.noteStyleId = noteStyleId;
                event.articulation = undefined;
                changed = true;
            }
        }

        if (!changed) {
            return false;
        }

        return this.setMeasureEvents(measure, events);
    }

    /**
     * Applies a note style to the events fully contained in an exact fractional range, preserving
     * each event's duration.
     *
     * @param measure The measure containing the range.
     * @param start The exact start position as a fraction.
     * @param end The exact end position (exclusive) as a fraction.
     * @param noteStyleId The instrument note-style id to apply.
     *
     * @returns True when any event changed.
     */
    private setFractionRangeNoteStyle(measure: ISbDmTrackPiece, start: IFraction,
        end: IFraction, noteStyleId: string): boolean {
        const events = measure.events.map((event) => {
            return this.cloneEvent(event);
        });

        let changed = false;

        for (const event of events) {
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(event.start, start) >= 0 && compareFractions(eventEnd, end) <= 0
                && (event.noteStyleId !== noteStyleId || event.articulation !== undefined)) {
                event.noteStyleId = noteStyleId;
                event.articulation = undefined;
                changed = true;
            }
        }

        if (!changed) {
            return false;
        }

        return this.setMeasureEvents(measure, events);
    }

    /**
     * Returns the start fractions of all events that sit inside a subdivision. These positions
     * must never merge with neighbouring rests, so subdivision slots keep their exact boundaries.
     *
     * @param measure The measure whose subdivision slot starts should be collected.
     *
     * @returns The protected start fractions as string keys.
     */
    private subdivisionSlotStarts(measure: ISbDmTrackPiece): Set<string> {
        const starts = new Set<string>();
        const projected = MeasureProjection.project(measure);

        const walk = (items: IProjectedItem[], insideSubdivision: boolean): void => {
            for (const item of items) {
                if (item.kind === ProjectedItemKind.Event) {
                    if (insideSubdivision) {
                        starts.add(this.fractionKey(item.event.start));
                    }
                } else {
                    walk(item.items, true);
                }
            }
        };

        walk(projected, false);

        return starts;
    }

    /**
     * Checks whether an exact position starts a subdivision slot. Slot boundaries are not grid
     * steps, so they are protected against rest merges and fixed note lengths.
     *
     * @param measure The measure containing the position.
     * @param start The exact start position within the measure.
     *
     * @returns True when the position starts a subdivision slot.
     */
    private isSlotStart(measure: ISbDmTrackPiece, start: IFraction): boolean {
        return this.subdivisionSlotStarts(measure).has(this.fractionKey(start));
    }

    /**
     * Produces a stable string key for a fraction, used to compare start positions regardless of
     * their unreduced representation.
     *
     * @param fraction The fraction to key.
     *
     * @returns The reduced numerator/denominator pair as a string.
     */
    private fractionKey(fraction: IFraction): string {
        const reduced = reduceFraction(fraction.numerator, fraction.denominator);

        return `${reduced.numerator}/${reduced.denominator}`;
    }

    /**
     * Combines adjacent rest events into single events. Events whose start position belongs to a
     * subdivision slot are never merged, so subdivision boundaries stay intact.
     *
     * @param events The events to normalise.
     * @param protectedStarts Start fractions that must not participate in a merge.
     *
     * @returns A copy of the events with adjacent rests merged.
     */
    private mergeRests(events: IMeasureEvent[], protectedStarts: Set<string>): IMeasureEvent[] {
        const result: IMeasureEvent[] = [];

        for (const event of events) {
            const last = result.at(-1);
            const mergeable = last !== undefined
                && last.noteStyleId === undefined
                && event.noteStyleId === undefined
                && !protectedStarts.has(this.fractionKey(last.start))
                && !protectedStarts.has(this.fractionKey(event.start));

            if (mergeable) {
                last.duration = subtractFractions(addFractions(event.start, event.duration), last.start);
            } else {
                result.push(this.cloneEvent(event));
            }
        }

        return result;
    }

    /**
     * Splits every event spanning the given position into two events, so the position becomes an
     * event boundary.
     *
     * @param events The events to split.
     * @param position The exact position at which to insert a boundary.
     *
     * @returns A copy of the events with the boundary inserted.
     */
    private splitEventsAt(events: IMeasureEvent[], position: IFraction): IMeasureEvent[] {
        const result: IMeasureEvent[] = [];

        for (const event of events) {
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(event.start, position) < 0 && compareFractions(eventEnd, position) > 0) {
                result.push(this.cloneEvent({
                    ...event,
                    duration: subtractFractions(position, event.start),
                }));
                result.push(this.cloneEvent({
                    ...event,
                    start: { ...position },
                    duration: subtractFractions(eventEnd, position),
                }));
            } else {
                result.push(this.cloneEvent(event));
            }
        }

        return result;
    }

    /**
     * Inserts a note of the given duration at an exact position. The note replaces a same-length
     * note, cuts into a longer note, or consumes following rests when the event at the position is
     * shorter. When a following note blocks the span before enough room is reached the insertion is
     * rejected; cross-measure shifting will handle that case in a later step.
     *
     * @param measure The measure to edit.
     * @param start The exact start position as a fraction.
     * @param duration The note's duration as a fraction.
     * @param noteStyleId The style to apply, or undefined to clear the span.
     *
     * @returns True when the measure changed.
     */
    private insertNoteAt(measure: ISbDmTrackPiece, start: IFraction, duration: IFraction,
        noteStyleId: string | undefined): boolean {
        const end = addFractions(start, duration);

        if (noteStyleId !== undefined && this.spanOverlapsFollowingNote(measure, start, end)) {
            return false;
        }

        return this.replaceSpan(measure, start, end, noteStyleId);
    }

    /**
     * Checks whether the span [start, end) contains the start of a note other than the one at the
     * span's beginning. Such a note would be overwritten by the insertion.
     *
     * @param measure The measure to inspect.
     * @param start The span start (inclusive).
     * @param end The span end (exclusive).
     *
     * @returns True when a following note starts inside the span.
     */
    private spanOverlapsFollowingNote(measure: ISbDmTrackPiece, start: IFraction,
        end: IFraction): boolean {
        return measure.events.some((event) => {
            return event.noteStyleId !== undefined
                && compareFractions(event.start, start) > 0
                && compareFractions(event.start, end) < 0;
        });
    }

    /**
     * Replaces the span [start, end) with a single event of the given style (or a rest when the
     * style is omitted). Overlapping events are clipped at the span boundaries, adjacent rests are
     * combined and decomposed into standard note values. Subdivision slot boundaries are preserved.
     *
     * @param measure The measure to edit.
     * @param start The exact start position of the span (inclusive).
     * @param end The exact end position of the span (exclusive).
     * @param noteStyleId The style of the replacement event, or undefined for a rest.
     *
     * @returns True when the measure changed.
     */
    private replaceSpan(measure: ISbDmTrackPiece, start: IFraction, end: IFraction,
        noteStyleId: string | undefined): boolean {
        const protectedStarts = this.subdivisionSlotStarts(measure);
        const events = this.replaceSpanEvents(measure.events, protectedStarts, start, end, noteStyleId);

        return this.setMeasureEvents(measure, events);
    }

    /**
     * Builds the event list that results from replacing the span [start, end) with a single event
     * of the given style (or a rest when the style is omitted), without writing it back. Used by
     * step-range edits to apply several span replacements in one go.
     *
     * @param events The events to edit.
     * @param protectedStarts Start fractions that must not participate in a rest merge.
     * @param start The exact start position of the span (inclusive).
     * @param end The exact end position of the span (exclusive).
     * @param noteStyleId The style of the replacement event, or undefined for a rest.
     *
     * @returns The edited events with rests combined and decomposed.
     */
    private replaceSpanEvents(events: IMeasureEvent[], protectedStarts: Set<string>,
        start: IFraction, end: IFraction, noteStyleId?: string): IMeasureEvent[] {
        const withStart = this.splitEventsAt(events, start);
        const withEnd = this.splitEventsAt(withStart, end);

        const spanEvent: IMeasureEvent = {
            start: { ...start },
            duration: subtractFractions(end, start),
            noteStyleId,
        };

        const result: IMeasureEvent[] = [];

        for (const event of withEnd) {
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(eventEnd, start) <= 0) {
                result.push(event);
            }
        }

        result.push(spanEvent);

        for (const event of withEnd) {
            if (compareFractions(event.start, end) >= 0) {
                result.push(event);
            }
        }

        return this.normalizeRests(result, protectedStarts);
    }

    /**
     * Combines adjacent rest events and decomposes every non-subdivision rest into standard note
     * values, so the staff view can render each rest with a single glyph. The event before a run
     * decides the length its split starts from; a run at the bar start starts from the largest value.
     *
     * @param events The events to normalise.
     * @param protectedStarts Start fractions of subdivision slots, which must stay untouched.
     *
     * @returns The normalised events.
     */
    private normalizeRests(events: IMeasureEvent[], protectedStarts: Set<string>): IMeasureEvent[] {
        const result: IMeasureEvent[] = [];
        let previousLength: IFraction | undefined;

        for (const event of this.mergeRests(events, protectedStarts)) {
            if (event.noteStyleId !== undefined || protectedStarts.has(this.fractionKey(event.start))) {
                result.push(event);
                previousLength = event.duration;

                continue;
            }

            let position = { ...event.start };
            for (const part of decomposeRestSpan(event.duration, previousLength)) {
                result.push({ start: position, duration: { ...part } });
                position = addFractions(position, part);
                previousLength = part;
            }
        }

        return result;
    }

    /**
     * Sets or clears the note style of the event starting exactly at the given position, keeping
     * its duration. Used for existing events of that exact length and subdivision slots, both of
     * which must not be split or merged.
     *
     * @param measure The measure to edit.
     * @param start The exact start position of the event.
     * @param noteStyleId The style to set, or undefined to clear.
     *
     * @returns True when the measure changed.
     */
    private setEventNoteStyle(measure: ISbDmTrackPiece, start: IFraction, noteStyleId?: string): boolean {
        const index = measure.events.findIndex((event) => {
            return compareFractions(event.start, start) === 0;
        });
        if (index < 0) {
            return false;
        }

        const event = measure.events[index];
        const currentEffective = this.effectiveEventArticulation(measure, event);
        const targetEffective = noteStyleId === undefined
            ? undefined
            : this.articulationOfStyle(measure.track.instrument.noteStyles[noteStyleId]);
        if (event.noteStyleId === noteStyleId
            && this.sameArticulation(currentEffective, targetEffective)) {
            return false;
        }

        const events = measure.events.map((candidate) => {
            return this.cloneEvent(candidate);
        });
        events[index].noteStyleId = noteStyleId;
        events[index].articulation = undefined;

        return this.setMeasureEvents(measure, events);
    }

    /**
     * Replaces the entire content of a measure with the given events.
     *
     * @param measure The measure to replace.
     * @param events The replacement events, in display order.
     * @param subdivisions Subdivisions to create for the replacement; startIndex is relative to
     *                      {@link events}.
     *
     * @returns True when the measure changed.
     */
    private replaceWholeMeasure(measure: ISbDmTrackPiece, events: IMeasureEvent[],
        subdivisions?: ISubdivision[]): boolean {
        const changed = this.setMeasureEvents(measure, events, false);

        return this.applySubdivisions(measure, subdivisions, 0) || changed;
    }

    /**
     * Replaces the content of an exact fractional range with the given events. The replacement
     * events are positioned relative to the range start, which lets a range address subdivision
     * slots whose boundaries do not align to grid steps.
     *
     * @param measure The measure containing the range.
     * @param start The exact start position of the range (inclusive).
     * @param end The exact end position of the range (exclusive).
     * @param events The replacement events, relative to the range start.
     * @param subdivisions Subdivisions to create for the replacement; startIndex is relative to
     *                      {@link events}.
     *
     * @returns True when the measure changed.
     */
    private replaceFractionRange(measure: ISbDmTrackPiece, start: IFraction, end: IFraction,
        events: IMeasureEvent[], subdivisions?: ISubdivision[]): boolean {
        const { result, shiftedStartIndex } = this.buildFractionRangeReplacement(measure, start, end, events);

        const changed = this.setMeasureEvents(measure, result);

        return this.applySubdivisions(measure, subdivisions, shiftedStartIndex) || changed;
    }

    /**
     * Builds the full measure event list that results from replacing the given fractional range
     * with the given events. Events before the range are kept (clipped at the range start) and
     * events after the range are kept (clipped at the range end).
     *
     * @param measure The measure containing the range.
     * @param start The exact start position of the range (inclusive).
     * @param end The exact end position of the range (exclusive).
     * @param events The replacement events, relative to the range start.
     *
     * @returns The resulting events and the index where the replacement events begin.
     */
    private buildFractionRangeReplacement(measure: ISbDmTrackPiece, start: IFraction, end: IFraction,
        events: IMeasureEvent[]): IFractionRangeReplacement {
        const shifted = events.map((event) => {
            return this.cloneEvent({ ...event, start: addFractions(start, event.start) });
        });

        const result: IMeasureEvent[] = [];

        for (const event of measure.events) {
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(eventEnd, start) <= 0) {
                result.push(this.cloneEvent(event));
            } else if (compareFractions(event.start, start) < 0) {
                result.push(this.cloneEvent({
                    ...event,
                    duration: subtractFractions(start, event.start),
                }));
            }
        }

        const shiftedStartIndex = result.length;
        result.push(...shifted);

        for (const event of measure.events) {
            const eventStart = event.start;
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(eventStart, end) >= 0) {
                result.push(this.cloneEvent(event));
            } else if (compareFractions(eventEnd, end) > 0) {
                // The event's start lies inside the replaced range, so its remaining tail is cut
                // off and becomes a rest instead of sliding one cell to the right.
                result.push({
                    start: end,
                    duration: subtractFractions(eventEnd, end),
                });
            }
        }

        return { result, shiftedStartIndex };
    }

    /**
     * Applies replacement subdivisions to a measure whose events were just replaced. The
     * subdivision start indices are shifted by the number of events that precede the replacement
     * range, so they point at the correct events within the measure. Existing subdivisions are
     * kept, so pasting a subdivision into an existing subdivision nests it instead of stripping
     * the surrounding notes of their subdivision character.
     *
     * @param measure The measure to update.
     * @param subdivisions The subdivisions to install; startIndex is relative to the replacement.
     * @param baseIndex The index within the measure's events where the replacement starts.
     *
     * @returns True when subdivisions were installed.
     */
    private applySubdivisions(measure: ISbDmTrackPiece, subdivisions: ISubdivision[] | undefined,
        baseIndex: number): boolean {
        if (subdivisions === undefined || subdivisions.length === 0) {
            return false;
        }

        measure.subdivisions.push(...subdivisions.map((subdivision) => {
            return { ...subdivision, startIndex: subdivision.startIndex + baseIndex };
        }));

        return true;
    }

    private effectiveEventArticulation(measure: ISbDmTrackPiece,
        event: IMeasureEvent): INoteArticulation | undefined {
        if (event.articulation !== undefined) {
            return event.articulation;
        }

        if (event.noteStyleId === undefined) {
            return undefined;
        }

        return this.articulationOfStyle(measure.track.instrument.noteStyles[event.noteStyleId]);
    }

    private articulationOfStyle(style: IAudioData | undefined): INoteArticulation | undefined {
        if (style?.sampleProfile === undefined) {
            return undefined;
        }

        return {
            damping: style.sampleProfile.builtInDamping,
            accent: style.sampleProfile.builtInAccent,
            ghost: style.sampleProfile.ghost,
        };
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

    private setMeasureEvents(measure: ISbDmTrackPiece, events: IMeasureEvent[],
        preserveSubdivisions = true): boolean {
        if (this.eventsEqual(measure.events, events)) {
            return false;
        }

        const remappedSubdivisions = this.remapSubdivisions(measure, events, preserveSubdivisions);

        measure.events.splice(0, measure.events.length, ...events.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length, ...remappedSubdivisions);

        return true;
    }

    /**
     * Remaps the measure's subdivisions onto the given event list. Subdivisions reference their
     * first event by index; after a replacement those indices shift, so each subdivision is moved
     * to the new index of its first event's start time. Subdivisions whose first event no longer
     * exists are dropped.
     *
     * @param measure The measure whose subdivisions should be remapped.
     * @param events The replacement events.
     * @param preserveSubdivisions When false, no subdivisions are carried over.
     *
     * @returns The remapped subdivisions.
     */
    private remapSubdivisions(measure: ISbDmTrackPiece, events: IMeasureEvent[],
        preserveSubdivisions: boolean): ISubdivision[] {
        if (!preserveSubdivisions) {
            return [];
        }

        const remapped: ISubdivision[] = [];

        for (const subdivision of measure.subdivisions) {
            if (subdivision.startIndex < 0 || subdivision.startIndex >= measure.events.length) {
                continue;
            }

            const startEvent = measure.events[subdivision.startIndex];
            const startIndex = events.findIndex((event) => {
                return compareFractions(event.start, startEvent.start) === 0;
            });

            if (startIndex >= 0) {
                remapped.push({ ...subdivision, startIndex });
            }
        }

        return remapped;
    }

    /**
     * Finds the innermost projected subdivision whose start matches the given fraction.
     *
     * @param items The projected items to search.
     * @param start The exact start fraction to match.
     *
     * @returns The matching subdivision, or undefined when none starts at the fraction.
     */
    private findInnermostSubdivision(items: IProjectedItem[], start: IFraction): IProjectedSubdivision | undefined {
        for (const item of items) {
            if (item.kind !== ProjectedItemKind.Subdivision) {
                continue;
            }

            const nested = this.findInnermostSubdivision(item.items, start);
            if (nested) {
                return nested;
            }

            if (compareFractions(item.start, start) === 0) {
                return item;
            }
        }

        return undefined;
    }

    /**
     * Finds the innermost projected subdivision whose span contains the given fraction.
     *
     * @param items The projected items to search.
     * @param start The exact start fraction to contain.
     *
     * @returns The containing subdivision, or undefined when none contains the fraction.
     */
    private findContainingSubdivision(items: IProjectedItem[], start: IFraction):
        IProjectedSubdivision | undefined {
        for (const item of items) {
            if (item.kind !== ProjectedItemKind.Subdivision) {
                continue;
            }

            const end = addFractions(item.start, item.span);
            if (compareFractions(start, item.start) < 0 || compareFractions(start, end) >= 0) {
                continue;
            }

            return this.findContainingSubdivision(item.items, start) ?? item;
        }

        return undefined;
    }

    /**
     * Resolves how many parent units a fractional span covers, where a parent unit is a slot of the
     * subdivision the span lies in, or the measure's base subdivision outside any.
     *
     * @param measure The measure the span lies in.
     * @param start The span start.
     * @param end The span end.
     *
     * @returns The unit count, or undefined when the span leaves its subdivision or covers no whole unit.
     */
    private parentUnitCountOf(measure: ISbDmTrackPiece, start: IFraction, end: IFraction): number | undefined {
        const enclosing = this.findContainingSubdivision(MeasureProjection.project(measure), start);
        if (enclosing && compareFractions(end, addFractions(enclosing.start, enclosing.span)) > 0) {
            return undefined;
        }

        const unit = enclosing
            ? divideFraction(enclosing.span, enclosing.actual)
            : { numerator: 1, denominator: StepGrid.stepsPerBarOfMeter(measure.meter) };
        const span = subtractFractions(end, start);
        const ratio = reduceFraction(span.numerator * unit.denominator, span.denominator * unit.numerator);

        return ratio.denominator === 1 && ratio.numerator >= 1 ? ratio.numerator : undefined;
    }

    /**
     * Checks whether a projected subdivision contains only rest slots, recursing into nested
     * subdivisions.
     *
     * @param subdivision The projected subdivision to inspect.
     *
     * @returns True when every leaf slot of the subdivision is a rest.
     */
    private subdivisionIsEmpty(subdivision: IProjectedSubdivision): boolean {
        return subdivision.items.every((item) => {
            if (item.kind === ProjectedItemKind.Event) {
                return item.event.noteStyleId === undefined;
            }

            return this.subdivisionIsEmpty(item);
        });
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
        if (a.length !== b.length) {
            return false;
        }

        for (let index = 0; index < a.length; index++) {
            const left = a[index];
            const right = b[index];
            if (left.noteStyleId !== right.noteStyleId
                || !this.fractionsEqual(left.start, right.start)
                || !this.fractionsEqual(left.duration, right.duration)
                || !this.sameArticulation(left.articulation, right.articulation)) {
                return false;
            }
        }

        return true;
    }

    private fractionsEqual(a: IFraction, b: IFraction): boolean {
        return a.numerator * b.denominator === b.numerator * a.denominator;
    }

    /**
     * Resolves the position a measure-local fraction has on the track's timeline. Every measure spans
     * one bar, so the timeline unit is one bar.
     *
     * @param measureIndex The zero-based index of the measure.
     * @param start The position within the measure.
     *
     * @returns The absolute position on the track's timeline.
     */
    private absolutePositionOf(measureIndex: number, start: IFraction): IFraction {
        return addFractions(reduceFraction(measureIndex, 1), start);
    }

    /**
     * Resolves the measure an absolute track position falls into.
     *
     * @param absolute The absolute position on the track's timeline.
     *
     * @returns The zero-based index of the measure.
     */
    private measureIndexAt(absolute: IFraction): number {
        return Math.floor(absolute.numerator / absolute.denominator);
    }

    /**
     * Writes the markings a whole-measure paste carries, after every replaced bar was cleared of its own markings.
     * The edit validates them like any other marking once the pasted content is in place.
     *
     * @param replacements The replacements of one paste.
     *
     * @returns True when at least one marking was written.
     */
    private addMeasureArticulations(replacements: ITrackPieceReplace[]): boolean {
        const articulations = this.arrangement?.rangeArticulations;
        if (articulations === undefined) {
            return false;
        }

        let added = false;
        for (const replacement of replacements) {
            for (const placement of replacement.articulations ?? []) {
                articulations.add(RangeArticulations.materialise(replacement.trackId, placement));
                added = true;
            }
        }

        return added;
    }

    /**
     * Announces a finished change of one track: the viewers recompute their structure and the undo
     * manager stores one step.
     *
     * @param track The track whose content changed.
     */
    private announceTrackEdit(track: ISbDmTrack): void {
        this.announceTrackEdits(new Set([track.id]));
    }

    /**
     * Announces finished changes of several tracks as one edit: the viewers recompute their structure
     * and the undo manager stores one step.
     *
     * @param trackIds The ids of the tracks whose content changed.
     */
    private announceTrackEdits(trackIds: Set<number>): void {
        if (trackIds.size === 0) {
            return;
        }

        // An edit that moved or removed an anchor note drops the markings it left without an anchor, in the same
        // edit rather than its own undo step.
        const arrangement = this.arrangement;
        arrangement?.rangeArticulations?.removeInvalid(arrangement, trackIds);

        // A measure packed tighter than its width follows its content, in the same edit rather than its own step.
        this.widenMeasuresToFloor();

        for (const trackId of trackIds) {
            void requisitions.execute("trackChanged", trackId);
        }

        void requisitions.execute("arrangementMutated", undefined);
    }

    /**
     * Raises every measure width to the floor its content and controls need, so an edit that packs a measure
     * more tightly widens it instead of squeezing its notes together.
     */
    private widenMeasuresToFloor(): void {
        const arrangement = this.arrangement;
        const widths = arrangement?.measureWidths;
        if (!arrangement || !widths) {
            return;
        }

        for (let bar = 1; bar <= arrangement.timeParams.length; bar++) {
            const floor = MeasureLayout.minimumWidthOfMeasure(arrangement, bar);
            if (MeasureLayout.widthOf(bar, widths) >= floor) {
                continue;
            }

            // A width equal to the default is the default, so it is not stored, just as `setMeasureWidth` does.
            if (floor === MeasureLayout.defaultWidth()) {
                widths.delete(bar);
            } else {
                widths.set(bar, floor);
            }
        }
    }

    /**
     * Resolves a track of the current arrangement.
     *
     * @param trackId The track to resolve.
     *
     * @returns The track, or undefined when the arrangement does not contain it.
     */
    private trackById(trackId: number): ISbDmTrack | undefined {
        return this.arrangement?.tracks.find((candidate) => {
            return candidate.id === trackId;
        });
    }

    /**
     * Resolves the measure a write addresses. A bar behind the last one is asked for, which adds it
     * when the user allows the arrangement to grow.
     *
     * @param trackId The track containing the measure.
     * @param bar The one-based measure number.
     *
     * @returns The measure, or undefined when there is none and none was added.
     */
    private measureForEdit(trackId: number, bar: number): ISbDmTrackPiece | undefined {
        const track = this.trackById(trackId);
        if (track === undefined) {
            return undefined;
        }

        if (track.measures.at(bar - 1) === undefined) {
            this.ensureBarAvailable(bar);
        }

        return track.measures.at(bar - 1);
    }

    /**
     * Whether content that reaches behind the last measure extends the arrangement. The setting is
     * read per edit, so changing it takes effect without a reload.
     *
     * @returns True when overflow adds measures.
     */
    private extendsOnOverflow(): boolean {
        return AppStorage.loadUISettings()?.autoExtendOnOverflow ?? true;
    }

    /**
     * Gives the event at the given position a new length; see {@link setSpan}.
     *
     * @param track The track containing the event.
     * @param bar The one-based measure number.
     * @param start The exact start of the event within the measure.
     * @param newDuration The length the event should take, or undefined to remove it.
     *
     * @returns True when the track content changed.
     */
    private setEventSpan(track: ISbDmTrack, bar: number, start: IFraction, newDuration?: IFraction): boolean {
        const event = track.measures.at(bar - 1)?.events.find((candidate) => {
            return compareFractions(candidate.start, start) === 0;
        });
        if (event === undefined) {
            return false;
        }

        // A single event that keeps its length changes nothing.
        if (newDuration !== undefined && compareFractions(newDuration, event.duration) === 0) {
            return false;
        }

        return this.setSpan(track, bar, start, addFractions(event.start, event.duration), newDuration);
    }

    /**
     * Gives the span [start, end) of a measure the requested length and moves the content behind it by
     * the difference. The span is notated as one rest, so the rests it covers merge. A missing length
     * removes the span. Content that no longer fits into the measure continues at the start of the next
     * one and the tail of the track becomes rests. Where no content gives way — a rest is only the gap
     * between the items — the request shapes the measure's rests instead, so a rest in a silence keeps
     * the length it is given.
     *
     * @param track The track containing the span.
     * @param bar The one-based measure number.
     * @param start The exact start of the span within the measure.
     * @param end The exact end of the span within the measure.
     * @param newDuration The length the span should take, or undefined to remove it.
     *
     * @returns True when the track content changed.
     */
    private setSpan(track: ISbDmTrack, bar: number, start: IFraction, end: IFraction,
        newDuration?: IFraction): boolean {
        const measure = track.measures.at(bar - 1);
        if (measure === undefined) {
            return false;
        }

        // A span never crosses a bar line, so a request that reaches past it ends at the measure end.
        const room = subtractFractions(barLength, start);
        const requested = newDuration ?? { numerator: 0, denominator: 1 };
        const duration = compareFractions(requested, room) < 0 ? requested : room;

        const spanStart = this.absolutePositionOf(bar - 1, start);
        const spanEnd = this.absolutePositionOf(bar - 1, end);
        const delta = subtractFractions(duration, subtractFractions(end, start));
        const items = this.collectAbsoluteItems(track);
        const before = ScoreBookDataModel.timelineSignature(items);
        const remaining: IAbsoluteTrackItem[] = [];

        for (const item of items) {
            if (compareFractions(item.start, spanEnd) >= 0) {
                item.start = addFractions(item.start, delta);
                remaining.push(item);

                continue;
            }

            // The items inside the span disappear; an item reaching into it is shortened at its start.
            // A subdivision is never cut or dropped: such a request is refused.
            if (compareFractions(item.start, spanStart) >= 0) {
                if (item.slots !== undefined) {
                    return false;
                }

                continue;
            }

            if (compareFractions(addFractions(item.start, item.duration), spanStart) > 0) {
                if (item.slots !== undefined) {
                    return false;
                }

                item.duration = subtractFractions(spanStart, item.start);
            }

            remaining.push(item);
        }

        this.layOutAbsoluteItems(track, remaining);

        // The layout derives rests from the gaps, so the addressed rest keeps the requested length only
        // where the gap behind it happens to match: shape the measure's rests to the request.
        const shaped = this.shapeAddressedRest(measure, start, duration);

        return shaped || before !== ScoreBookDataModel.timelineSignature(this.collectAbsoluteItems(track));
    }

    /**
     * Gives the addressed rest the requested length in the measure's notated rests. The rests the span
     * covers give way, an event the span ends in keeps its tail as a rest, and everything outside the
     * span stays as it stands. Content behind the rest has already given way in the layout, so this only
     * shapes the notation.
     *
     * @param measure The measure to reshape.
     * @param start The start of the addressed rest within the measure.
     * @param duration The length the addressed rest takes.
     *
     * @returns True when the measure's rests changed.
     */
    private shapeAddressedRest(measure: ISbDmTrackPiece, start: IFraction, duration: IFraction): boolean {
        // A removal leaves no rest behind, so there is no length to shape.
        if (duration.numerator <= 0) {
            return false;
        }

        const end = addFractions(start, duration);
        const events: IMeasureEvent[] = [];

        for (const event of measure.events) {
            const eventEnd = addFractions(event.start, event.duration);

            if (compareFractions(eventEnd, start) <= 0 || compareFractions(event.start, end) >= 0) {
                events.push(event);

                continue;
            }

            if (compareFractions(event.start, start) < 0) {
                events.push({ start: { ...event.start }, duration: subtractFractions(start, event.start) });
            }

            if (compareFractions(end, eventEnd) < 0) {
                events.push({ start: { ...end }, duration: subtractFractions(eventEnd, end) });
            }
        }

        events.push({ start: { ...start }, duration: { ...duration } });
        events.sort((left, right) => {
            return compareFractions(left.start, right.start);
        });

        // Every rest the model writes holds a single standard note value (ADR-0006), because the staff draws one
        // glyph per rest: a rest of an odd length is decomposed, starting from the event before it. The rests that
        // were there keep their own values, and the addressed one keeps the length the request named, so a dotted
        // rest stays whole and only the tail the span cuts off is split.
        const protectedStarts = this.subdivisionSlotStarts(measure);
        for (const event of measure.events) {
            protectedStarts.add(this.fractionKey(event.start));
        }

        protectedStarts.add(this.fractionKey(start));

        return this.setMeasureEvents(measure, this.normalizeRests(events, protectedStarts));
    }

    /**
     * Resizes notes without announcing the change, so callers can batch several edits into one.
     *
     * @param track The track containing the notes.
     * @param requests The notes to resize, addressed by their start within a measure.
     *
     * @returns True when at least one note duration changed.
     */
    private resizeTrackNotes(track: ISbDmTrack, requests: IEventResizeRequest[]): boolean {
        const requestedDurations = new Map<string, IFraction>();

        for (const request of requests) {
            if (track.measures.at(request.bar - 1) === undefined || request.duration.numerator <= 0) {
                continue;
            }

            // A note never crosses a bar line, so a request that reaches past it ends at the measure end.
            const room = subtractFractions(barLength, request.start);
            const duration = compareFractions(request.duration, room) < 0 ? request.duration : room;
            if (duration.numerator <= 0) {
                continue;
            }

            const position = this.absolutePositionOf(request.bar - 1, request.start);
            requestedDurations.set(this.fractionKey(position), duration);
        }

        if (requestedDurations.size === 0) {
            return false;
        }

        const items = this.collectAbsoluteItems(track);
        let firstResized = -1;
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const requested = requestedDurations.get(this.fractionKey(item.start));

            // A subdivision keeps its span: its ratio, not a request, decides how long it lasts.
            if (item.event === undefined || requested === undefined
                || compareFractions(requested, item.duration) === 0) {
                continue;
            }

            item.duration = requested;
            if (firstResized < 0) {
                firstResized = index;
            }
        }

        if (firstResized < 0) {
            return false;
        }

        const resized = items[firstResized];
        this.settleTimelineItems(track, items, addFractions(resized.start, resized.duration), firstResized + 1);

        return true;
    }

    /**
     * Lays out a track's timeline behind a change. An item that overlaps its predecessor moves up, an
     * item that no longer fits into its measure continues at the start of the next one — a subdivision
     * as a whole, so its slots stay together — and what is left beyond the track's last measure is
     * dropped.
     *
     * @param track The track to lay out.
     * @param items The track's items, sorted by their start.
     * @param previousEnd The absolute end of the content the items follow.
     * @param fromIndex The index of the first item to check.
     */
    private settleTimelineItems(track: ISbDmTrack, items: IAbsoluteTrackItem[], previousEnd: IFraction,
        fromIndex: number): void {
        for (let index = fromIndex; index < items.length; index++) {
            const item = items[index];
            if (compareFractions(item.start, previousEnd) < 0) {
                item.start = previousEnd;
            }

            // An item that reaches behind the last measure grows the arrangement; with that switched
            // off it has no place and is dropped.
            const measureIndex = this.measureIndexAt(item.start);
            if (!this.ensureBarAvailable(measureIndex + 1)) {
                items.splice(index);

                break;
            }

            // An item that no longer fits into its measure continues at the start of the next one.
            // A subdivision moves over as a whole, so its slots stay together.
            const measureEnd = reduceFraction(measureIndex + 1, 1);
            if (compareFractions(addFractions(item.start, item.duration), measureEnd) > 0) {
                if (!this.ensureBarAvailable(measureIndex + 2)) {
                    items.splice(index);

                    break;
                }

                item.start = measureEnd;
            }

            const remaining = subtractFractions(reduceFraction(track.measures.length, 1), item.start);
            if (remaining.numerator <= 0) {
                items.splice(index);

                break;
            }

            if (item.event !== undefined && compareFractions(item.duration, remaining) > 0) {
                item.duration = remaining;
            }

            previousEnd = addFractions(item.start, item.duration);
        }

        this.layOutAbsoluteItems(track, items);
    }

    /**
     * Collects a track's items on its absolute timeline of bar fractions: its notes and its
     * subdivisions. Rests are left out on purpose: every layout recomputes them from the gaps
     * between the items.
     *
     * @param track The track to inspect.
     *
     * @returns The items in track order.
     */
    private collectAbsoluteItems(track: ISbDmTrack): IAbsoluteTrackItem[] {
        const items: IAbsoluteTrackItem[] = [];

        for (let measureIndex = 0; measureIndex < track.measures.length; measureIndex++) {
            for (const projected of MeasureProjection.project(track.measures[measureIndex])) {
                const item = this.absoluteItemOf(measureIndex, projected);

                if (item !== undefined) {
                    items.push(item);
                }
            }
        }

        return items;
    }

    /**
     * Converts one projected item of a measure into a timeline item. A rest has no item: a layout
     * recreates rests from the gaps between the items.
     *
     * @param measureIndex The index of the measure the projected item lies in.
     * @param projected The projected event or subdivision.
     *
     * @returns The timeline item, or undefined when the projected item is a rest.
     */
    private absoluteItemOf(measureIndex: number, projected: IProjectedItem): IAbsoluteTrackItem | undefined {
        if (projected.kind === ProjectedItemKind.Subdivision) {
            const slots: IMeasureEvent[] = [];
            const subdivisions: ISubdivisionPlacement[] = [];

            this.collectSlotEvents(projected.items, projected.start, slots);
            this.collectSubdivisionPlacements(projected, projected.start, subdivisions);

            return {
                start: this.absolutePositionOf(measureIndex, projected.start),
                duration: { ...projected.span },
                slots,
                subdivisions,
            };
        }

        if (projected.event.noteStyleId === undefined) {
            return undefined;
        }

        return {
            start: this.absolutePositionOf(measureIndex, projected.start),
            duration: { ...projected.event.duration },
            event: this.cloneEvent(projected.event),
        };
    }

    /**
     * Converts events into timeline items, placed at the given absolute position.
     *
     * @param events The events to place, positioned relative to the given position.
     * @param start The absolute position of the first event.
     *
     * @returns The items, in the order of the events.
     */
    private absoluteItemsOf(events: IMeasureEvent[], start: IFraction): IAbsoluteTrackItem[] {
        return events.map((event) => {
            return {
                start: addFractions(start, event.start),
                duration: { ...event.duration },
                event: this.cloneEvent(event),
            };
        });
    }

    /**
     * Finds the first timeline item that starts at or behind the given position.
     *
     * @param items The track's items, sorted by their start.
     * @param start The absolute position to look for.
     *
     * @returns The index of the first such item, or the item count when all of them start before it.
     */
    private indexOfItemBehind(items: IAbsoluteTrackItem[], start: IFraction): number {
        const index = items.findIndex((item) => {
            return compareFractions(item.start, start) >= 0;
        });

        return index < 0 ? items.length : index;
    }

    /**
     * Resolves the end of the item in front of the given index.
     *
     * @param items The track's items, sorted by their start.
     * @param index The index whose predecessor is looked up.
     *
     * @returns The absolute end of that item, or the start of the track when there is none.
     */
    private endOfItemBefore(items: IAbsoluteTrackItem[], index: number): IFraction {
        const previous = index > 0 ? items.at(index - 1) : undefined;

        return previous === undefined ? { ...barStart } : addFractions(previous.start, previous.duration);
    }

    /**
     * Sums up the length of a run of items.
     *
     * @param items The items to sum up.
     *
     * @returns The total length as a fraction of a bar.
     */
    private totalLengthOf(items: IAbsoluteTrackItem[]): IFraction {
        return items.reduce((length, item) => {
            return addFractions(length, item.duration);
        }, { ...barStart });
    }

    /**
     * Checks whether a run may replace the given items: every item the run overlaps has to be covered
     * by it, so a subdivision is never cut in half.
     *
     * @param items The track's items.
     * @param start The absolute start of the run.
     * @param end The absolute end of the run.
     *
     * @returns True when the run may be applied.
     */
    private runCoversItems(items: IAbsoluteTrackItem[], start: IFraction, end: IFraction): boolean {
        return items.every((item) => {
            const itemEnd = addFractions(item.start, item.duration);
            const overlaps = compareFractions(item.start, end) < 0 && compareFractions(itemEnd, start) > 0;

            return !overlaps || (compareFractions(item.start, start) >= 0 && compareFractions(itemEnd, end) <= 0);
        });
    }

    /**
     * Collects the leaf events of a subdivision subtree as slot events, with their starts relative to
     * the subdivision's start.
     *
     * @param items The projected items to walk, nested subdivisions included.
     * @param blockStart The subdivision's start within its measure.
     * @param slots The list the slot events are appended to.
     */
    private collectSlotEvents(items: IProjectedItem[], blockStart: IFraction, slots: IMeasureEvent[]): void {
        for (const item of items) {
            if (item.kind === ProjectedItemKind.Subdivision) {
                this.collectSlotEvents(item.items, blockStart, slots);

                continue;
            }

            slots.push(this.cloneEvent({
                ...item.event,
                start: subtractFractions(item.start, blockStart),
            }));
        }
    }

    /**
     * Collects a subdivision and the subdivisions nested inside it, each with the start of its first
     * slot relative to the subdivision's start.
     *
     * @param projected The projected subdivision to walk.
     * @param blockStart The subdivision's start within its measure.
     * @param placements The list the placements are appended to.
     */
    private collectSubdivisionPlacements(projected: IProjectedSubdivision, blockStart: IFraction,
        placements: ISubdivisionPlacement[]): void {
        placements.push({
            group: projected.group,
            start: subtractFractions(projected.start, blockStart),
        });

        for (const item of projected.items) {
            if (item.kind === ProjectedItemKind.Subdivision) {
                this.collectSubdivisionPlacements(item, blockStart, placements);
            }
        }
    }

    /**
     * Writes an absolute timeline back into the track, measure by measure. Gaps become rests, a note
     * reaching past a bar line is cut off there, and items beyond the track's last measure are
     * dropped. A subdivision is written as it stands, with its slots at their relative positions, so
     * it never leaves its measure and never loses a slot. A gap is split into the rests the measure
     * already held when they still cover the gap, so a rest structure the user shaped survives the
     * layout.
     *
     * @param track The track to rewrite.
     * @param items The items to lay out, sorted by their absolute start.
     */
    private layOutAbsoluteItems(track: ISbDmTrack, items: IAbsoluteTrackItem[]): void {
        let itemIndex = 0;

        for (let measureIndex = 0; measureIndex < track.measures.length; measureIndex++) {
            const measure = track.measures[measureIndex];
            const measureStart = reduceFraction(measureIndex, 1);
            const measureEnd = reduceFraction(measureIndex + 1, 1);
            const events: IMeasureEvent[] = [];
            const placements: ISubdivisionPlacement[] = [];
            const protectedStarts = new Set<string>();
            const slotStarts = this.subdivisionSlotStarts(measure);
            let cursor = measureStart;
            let previousLength: IFraction | undefined;

            while (itemIndex < items.length && compareFractions(items[itemIndex].start, measureEnd) < 0) {
                const item = items[itemIndex];
                const itemStart = subtractFractions(item.start, measureStart);

                if (compareFractions(item.start, cursor) > 0) {
                    events.push(...this.gapRests(measure, subtractFractions(cursor, measureStart), itemStart,
                        previousLength, slotStarts, protectedStarts));
                }

                const note = item.event;
                if (note !== undefined) {
                    const room = subtractFractions(measureEnd, item.start);
                    const duration = compareFractions(item.duration, room) < 0 ? item.duration : room;
                    events.push({
                        ...this.cloneEvent(note),
                        start: itemStart,
                        duration: { ...duration },
                    });
                    previousLength = duration;
                }

                const slots = item.slots;
                if (slots !== undefined) {
                    for (const slot of slots) {
                        const start = addFractions(itemStart, slot.start);

                        protectedStarts.add(this.fractionKey(start));
                        events.push(this.cloneEvent({ ...slot, start }));
                    }

                    previousLength = slots.at(-1)?.duration;
                }

                const subdivisions = item.subdivisions;
                if (subdivisions !== undefined) {
                    for (const placement of subdivisions) {
                        placements.push({
                            group: placement.group,
                            start: addFractions(item.start, placement.start),
                        });
                    }
                }

                cursor = addFractions(item.start, item.duration);
                itemIndex++;
            }

            if (compareFractions(cursor, measureEnd) < 0) {
                events.push(...this.gapRests(measure, subtractFractions(cursor, measureStart), barLength,
                    previousLength, slotStarts, protectedStarts));
            }

            // A protected start never merges with a neighbouring rest, and the subdivision records are
            // rebuilt against the events that came out of that normalisation.
            const normalized = this.normalizeRests(events, protectedStarts);

            this.setMeasureLayout(measure, normalized,
                this.subdivisionRecordsOf(placements, measureStart, normalized));
        }
    }

    /**
     * Splits a gap of a measure into rest events. The rests the measure already held decide the split as
     * long as they cover the gap exactly — the structure the user shaped — while any other gap is
     * derived from its length and the event before it.
     *
     * @param measure The measure whose rests supply the structure.
     * @param gapStart Start of the gap within the measure.
     * @param gapEnd End of the gap within the measure.
     * @param previousLength The length of the event before the gap, if there is one.
     * @param slotStarts The measure's subdivision slot starts, which are no rest structure of their own.
     * @param protectedStarts The set the kept structure is registered in, so the merge keeps it.
     *
     * @returns The rest events filling the gap.
     */
    private gapRests(measure: ISbDmTrackPiece, gapStart: IFraction, gapEnd: IFraction,
        previousLength: IFraction | undefined, slotStarts: Set<string>,
        protectedStarts?: Set<string>): IMeasureEvent[] {
        const kept = this.keptRestStructure(measure, gapStart, gapEnd, previousLength, slotStarts);
        if (kept !== undefined) {
            for (const rest of kept) {
                protectedStarts?.add(this.fractionKey(rest.start));
            }

            return kept;
        }

        const rests: IMeasureEvent[] = [];
        let position = { ...gapStart };
        for (const part of decomposeRestSpan(subtractFractions(gapEnd, gapStart), previousLength)) {
            rests.push({ start: position, duration: { ...part } });
            position = addFractions(position, part);
        }

        return rests;
    }

    /**
     * Returns the measure's own rests when they cover the gap exactly and differ from the split the gap
     * would derive on its own — the structure the user shaped, which a layout has to keep. A structure
     * that is the derived split needs no protection, so the merge may still combine it with the rests
     * around it.
     *
     * @param measure The measure whose rests supply the structure.
     * @param gapStart Start of the gap within the measure.
     * @param gapEnd End of the gap within the measure.
     * @param previousLength The length of the event before the gap, if there is one.
     * @param slotStarts The measure's subdivision slot starts, which are no rest structure of their own.
     *
     * @returns The rests covering the gap, or undefined when the gap derives its own rests.
     */
    private keptRestStructure(measure: ISbDmTrackPiece, gapStart: IFraction, gapEnd: IFraction,
        previousLength: IFraction | undefined, slotStarts: Set<string>): IMeasureEvent[] | undefined {
        const held = measure.events.filter((event) => {
            return event.noteStyleId === undefined
                && compareFractions(event.start, gapStart) >= 0
                && compareFractions(addFractions(event.start, event.duration), gapEnd) <= 0
                && !slotStarts.has(this.fractionKey(event.start));
        });

        let position = { ...gapStart };
        for (const rest of held) {
            if (compareFractions(rest.start, position) !== 0) {
                return undefined;
            }

            position = addFractions(rest.start, rest.duration);
        }

        if (compareFractions(position, gapEnd) !== 0) {
            return undefined;
        }

        const derived = decomposeRestSpan(subtractFractions(gapEnd, gapStart), previousLength);
        const isDerived = derived.length === held.length && derived.every((part, index) => {
            return compareFractions(part, held[index].duration) === 0;
        });

        return isDerived
            ? undefined
            : held.map((rest) => {
                return this.cloneEvent(rest);
            });
    }

    /**
     * Builds the subdivision records of a measure from the placements on the absolute timeline.
     *
     * @param placements The subdivisions to place, with the absolute start of their first slot.
     * @param measureStart The absolute start of the measure.
     * @param events The measure's new events.
     *
     * @returns The subdivisions whose first slot still exists.
     */
    private subdivisionRecordsOf(placements: ISubdivisionPlacement[], measureStart: IFraction,
        events: IMeasureEvent[]): ISubdivision[] {
        const subdivisions: ISubdivision[] = [];

        for (const placement of placements) {
            const start = subtractFractions(placement.start, measureStart);
            const startIndex = events.findIndex((event) => {
                return compareFractions(event.start, start) === 0;
            });

            if (startIndex >= 0) {
                subdivisions.push({ ...placement.group, startIndex });
            }
        }

        return subdivisions;
    }

    /**
     * Replaces a measure's events and subdivisions. The timeline layout knows where each subdivision's
     * first slot ended up, so its records are rebuilt instead of being remapped by start position.
     *
     * @param measure The measure to rewrite.
     * @param events The measure's new events.
     * @param subdivisions The measure's new subdivisions.
     */
    private setMeasureLayout(measure: ISbDmTrackPiece, events: IMeasureEvent[],
        subdivisions: ISubdivision[]): void {
        measure.events.splice(0, measure.events.length, ...events.map((event) => {
            return this.cloneEvent(event);
        }));
        measure.subdivisions.splice(0, measure.subdivisions.length, ...subdivisions);
    }

    /**
     * Appends a rest so the given events fill their measure. A replacement that is shorter than the
     * run it replaces leaves a gap, which is notated as a rest at the measure's end.
     *
     * @param events The measure's events, in display order.
     *
     * @returns The events, padded with a trailing rest when they end before the bar line.
     */
    private normalizeMeasureEvents(events: IMeasureEvent[]): IMeasureEvent[] {
        return this.normalizeRests(events, new Set());
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

        await this.reloadTags();
        await this.queryScores(this.scoreListCombination, this.activeSetList);

        // Re-serialize with the new ID so that AppStorage and future saves use the correct ID.
        return stringifyPackedArrangement((arrangement as Arrangement).toSnapshot());
    }

    /**
     * Updates the score list entry name to match the arrangement title, if they differ.
     * This keeps the list display in sync with the arrangement after a save.
     *
     * @param scoreId The database ID of the score.
     * @param title   The current arrangement title.
     */
    private async syncScoreLibName(scoreId: number, title: string): Promise<void> {
        const name = NameText.normalize(title);
        const score = this.findScore(scoreId);

        if (!score || score.name === name) {
            return;
        }

        // Persist the name change on the backend.
        const res = await this.fetchApi("/api?action=renameEntry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "score", id: scoreId, name }),
        });

        if (res) {
            score.name = name;
            void requisitions.execute("scoreEntryUpdated", score);
        }
    }

    /**
     * Assigns the tags a new arrangement was started with. The score row exists only now, so the first save is the
     * first moment a tag can be put on it. A refusal is reported by the assignment itself.
     *
     * @param scoreId The id of the score that was just created.
     */
    private async assignNewArrangementTags(scoreId: number): Promise<void> {
        const tagIds = this.newArrangementTagIds;
        this.newArrangementTagIds = [];

        for (const tagId of tagIds) {
            await this.assignTag(scoreId, tagId);
        }
    }

    /**
     * Sends a tag assignment change, reports a refusal through the notification center and mirrors the result in
     * the cached catalogue and score entry.
     *
     * @param action The backend action, assignTag or unassignTag.
     * @param scoreId The score to change.
     * @param tagId The tag to assign or remove.
     *
     * @returns Whether the backend accepted the change.
     */
    private async changeScoreTag(action: "assignTag" | "unassignTag", scoreId: number,
        tagId: number): Promise<boolean> {
        const res = await this.fetchApi(`/api?action=${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scoreId, tagId }),
        }, true, true);

        if (!res?.ok) {
            const data = res ? await res.json() as { error?: string; } : undefined;
            void requisitions.execute("showError", data?.error ?? "The tag change was refused.");

            return false;
        }

        const changed = await res.json() as { setListId?: number; };

        const score = this.findScore(scoreId);
        if (score) {
            score.tagIds = action === "assignTag"
                ? Array.from(new Set([...score.tagIds, tagId]))
                : score.tagIds.filter((id) => {
                    return id !== tagId;
                });
        }

        const tag = this.tagCatalogue.find((candidate) => {
            return candidate.id === tagId;
        });
        if (tag) {
            this.tagCatalogue = this.tagCatalogue.map((candidate) => {
                return candidate.id === tagId
                    ? { ...candidate, usageCount: candidate.usageCount + (action === "assignTag" ? 1 : -1) }
                    : candidate;
            });
        }

        void requisitions.execute("scoreTagsChanged", scoreId);

        // A set-list tag carries the list's membership and its revision, so the selector has to follow.
        if (changed.setListId !== undefined) {
            void this.reloadSetLists();
        }

        return true;
    }

    /**
     * @param res The answer to a set-list change, or undefined when the request did not reach the backend.
     *
     * @returns The parsed outcome.
     */
    private async setListChangeResult(res: Response | undefined): Promise<ISetListChangeResult> {
        if (res === undefined) {
            return { success: false, error: "The set list change could not be saved." };
        }

        const data = await res.json() as {
            success?: boolean; revision?: number; conflict?: boolean; error?: string;
        };

        if (!res.ok || data.success !== true) {
            return { success: false, conflict: data.conflict, revision: data.revision, error: data.error };
        }

        return { success: true, revision: data.revision };
    }

    /**
     * @param res The answer to a successful set-list change.
     *
     * @returns The outcome, with the catalogue reloaded so every part of the app sees the new state.
     */
    private async finishSetListChange(res: Response | undefined): Promise<ISetListChangeResult> {
        const result = await this.setListChangeResult(res);
        if (result.success) {
            await this.reloadSetLists();
        }

        return result;
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
        const { authType, groupId } = ScoreBookDataModel.readAuthHints();

        if (authType) {
            headers["X-Auth-Type"] = authType;
        }

        if (groupId) {
            headers["X-Group-Id"] = groupId;
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
            // A session that no longer refreshes has ended, which the app has to know so it can ask for a login
            // again. An anonymous session holds no access token to lose, so nothing changes there.
            this.sessionRefreshFailed = true;

            if (this.accessToken !== undefined) {
                this.clearAuthState();
            }

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

                ScoreBookDataModel.storeAuthHints(whoami.group);
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

        // A refusal for authentication is answered once with a fresh token, which the refresh cookie may still
        // supply: a reload, or a module update in development, drops the token this model holds in memory.
        if (res.status === 401 && attachAuth && !this.refreshing && !this.sessionRefreshFailed) {
            this.refreshing = true;
            let refreshed: boolean;

            try {
                refreshed = await this.refreshAccessToken();
            } finally {
                this.refreshing = false;
            }

            if (refreshed) {
                (mergedOptions.headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;

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
