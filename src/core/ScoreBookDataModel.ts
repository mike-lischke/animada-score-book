/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Arrangement } from "./Arrangement.js";
import { AppStorage } from "./AppStorage.js";
import { ArrangementSnapshotMigrator } from "./serialisation/migration/ArrangementSnapshotMigrator.js";
import { stringifyPackedArrangement, tryParsePackedArrangement } from "./serialisation/snapshot-packing.js";

import type { IScoreDBEntry, ISoundLibFsNode } from "./DatabaseTypes.js";
import { Instrument } from "./Instrument.js";
import { Publisher } from "./Publisher.js";
import type {
    IFraction, INoteStyle, INoteStyleSymbol, ISubscribable, Mutable
} from "./types/general.js";
import type { IArrangementSnapshot, ISerialisedArrangement } from "./types/general.js";
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
    Palm,

    Open,
    Slap,

    Friction,
}

/** How to strike the instrument. */
export enum StickTechnique {
    /** Normal play type. Goes together with `SoundType.Normal`. */
    DrumHead,

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
    /** The hit is open, allowing the sound to resonate, i.e. the hand or stick leaves the drumhead. */
    Open,

    /** The hit is muted, dampening the sound, i.e. the hand or stick stays on the drumhead. */
    Muted,

    /** If the damping is applied over more than one note, it starts here. */
    Start,

    /** If the damping is applied over more than one note, it ends here. */
    End,
}

export enum HandType {
    /** For right-handed people this is the right hand (vice-versa for left-handed people). */
    Strong,

    /** For right-handed people this is the left hand (vice-versa for left-handed people). */
    Weak
}

/** How to play a note. */
export enum SoundType {
    /**
     * A filled note, for all pitched sounds, i.e. hits on the drum head, bells, Cuicas etc.
     */
    Normal,

    /** A cross for all unpitched sounds, rimshots etc. */
    Cross,
}

/** Information about a note style. */
export type StruckCharacteristics = {
    excitationMode: ExcitationMode.Struck;
    damping?: Damping;
    soundType?: SoundType;
} & TechniqueType;

export interface ShakenCharacteristics {
    excitationMode: ExcitationMode.Shaken;
    damping?: never;
    soundType?: SoundType;
    handTechnique?: never;
    stickTechnique?: never;
}

export interface ScrapedCharacteristics {
    excitationMode: ExcitationMode.Scraped;
    damping?: never;
    soundType?: SoundType;
    handTechnique?: never;
    stickTechnique?: never;
}

export interface FrictionCharacteristics {
    excitationMode: ExcitationMode.Friction;
    damping?: Damping;
    soundType?: SoundType;
    handTechnique?: HandTechnique;
    stickTechnique?: never;
}

export interface BlownCharacteristics {
    excitationMode: ExcitationMode.Blown;
    damping?: never;
    soundType?: SoundType;
    handTechnique?: never;
    stickTechnique?: never;
}

/**
 * Characteristics for vocal/spoken samples (e.g. count-ins, number cues). These are not produced
 * on a physical instrument, so no technique or damping applies.
 */
export interface VocalCharacteristics {
    excitationMode: ExcitationMode.Vocal;
    damping?: never;
    soundType?: never;
    handTechnique?: never;
    stickTechnique?: never;
}

export type NoteCharacteristics =
    | StruckCharacteristics
    | ShakenCharacteristics
    | ScrapedCharacteristics
    | FrictionCharacteristics
    | BlownCharacteristics
    | VocalCharacteristics;

export interface INoteStyleMeta {
    readonly id: string;
    readonly file: string;
    readonly symbol?: INoteStyleSymbol;
    readonly characteristics: NoteCharacteristics;
}

/** Defines the structure of the instrument metadata. */
export interface IInstrumentMeta {
    /** A unique identifier for the sound. */
    readonly id: number;

    /** The type identifier for the sound. Describes what it is (in a short form). */
    readonly typeId: string;

    /** The different variants of the sound (if any). */
    readonly variants: INoteStyleMeta[];

    readonly displayOrder: number;
    readonly displayName: string;
    readonly icon: string;
    readonly color: string;
}

export interface ITimeParamsView extends ISubscribable {
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

export interface ISbDmTrack extends ISbDmCommon, ISubscribable {
    readonly type: SbDmEntityType.Track;
    readonly name: string;

    readonly arrangement: ISbDmArrangement;
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
    getNoteIterator(): IterableIterator<ISbDmNoteEvent>;
    clear(): void;
}

export interface ISbDmTrackMeasure extends ISbDmCommon {
    readonly type: SbDmEntityType.TrackMeasure;
    readonly number: number;
    readonly events: ISbDmNoteEvent[];
}

export interface ISbDmNoteEvent extends ISbDmCommon {
    readonly type: SbDmEntityType.NoteEvent;
    readonly measureNumber: number;
    readonly start: IFraction;
    readonly duration: IFraction;
    readonly track: ISbDmTrack;
    readonly timing: ITiming;

    /** Reference to related structures. If unassigned this event represents a rest. */
    noteStyle?: INoteStyle;
}

export interface ISbDmInstrumentImage {
    readonly type: SbDmEntityType.InstrumentImage;

    readonly id: number;
    readonly filePath: string;
}

export interface ISbDmInstrument extends ISbDmVisual, ISubscribable {
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
    readonly noteStyles: Record<string, INoteStyle>;
}

export interface ISbDmTimeParams extends ITimeParamsView {
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
}

export interface ISbDmArrangement extends ISbDmCommon, ISubscribable {
    readonly type: SbDmEntityType.Arrangement;

    title: string;
    timeParams: ISbDmTimeParams;
    tracks: ISbDmTrack[];

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
export class ScoreBookDataModel extends Publisher {
    /**
     * Indicates whether the current session is allowed to mutate scores on the backend.
     * Until proper user management exists this defaults to `true`. Read-only viewers will
     * later set this to `false` so opportunistic rewrites (e.g. legacy → compact migration)
     * are skipped.
     */
    public canWriteScores = true;

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
            this.updateScoreLibFolder(this.data.scoreLib),
        ];

        await Promise.all(promises);

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

    public loadArrangement(serializedArrangement: ISerialisedArrangement): ISbDmArrangement {
        const currentSnapshot = ArrangementSnapshotMigrator.migrateSerialized(
            serializedArrangement,
            this.data.instruments,
        );
        this.data.arrangement = Arrangement.fromSnapshot(currentSnapshot, this.data.instruments);
        this.applyArrangementPlaybackSettings(this.data.arrangement);
        this.publish();

        return this.data.arrangement;
    }

    public loadArrangementFromSnapshot(snapshot: IArrangementSnapshot): ISbDmArrangement {
        this.data.arrangement = Arrangement.fromSnapshot(snapshot, this.data.instruments);
        this.applyArrangementPlaybackSettings(this.data.arrangement);
        this.publish();

        return this.data.arrangement;
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

        const res = await fetch(`/api.php?action=addScoreFolder`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name, parentid: parent?.id }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
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

            this.publish();
        }
    }

    public async addScore(name: string, content: string, parent?: ISbDmScoreFolder): Promise<void> {
        const res = await fetch(`/api.php?action=addScore`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ name, content, folderId: parent?.id }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.statusText} (${res.status})`);
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
            };

            if (!parent) {
                this.data.scoreLib.push(newScore);
            } else {
                parent.children.push(newScore);
            }

            this.publish();
        }
    }

    /**
     * Decodes a score's stored `content` to the current arrangement snapshot.
     *
     * Two on-the-wire formats are supported transparently:
     *  - **Compact JSON** (current): `IPackedArrangement` produced by `stringifyPackedArrangement`.
     *  - **Legacy BananaDrum** URL parameters: kept for backwards compatibility with previously
     *    imported scores.
     *
     * When a legacy entry is read and the session has write permission (`canWriteScores`),
     * the decoded snapshot is opportunistically written back to the backend in compact form,
     * so subsequent loads avoid the legacy decode path. The rewrite runs asynchronously and
     * is fire-and-forget; failures are silently ignored (the legacy content remains valid).
     *
     * @param score The score entry whose content should be decoded.
     * @returns The decoded arrangement snapshot, or `undefined` if the content is not in any
     *     recognised format.
     */
    public decodeScoreContent(score: ISbDmScore): IArrangementSnapshot | undefined {
        const compact = tryParsePackedArrangement(score.content);
        if (compact) {
            return compact;
        }

        // Legacy BananaDrum content. The wire data is URL-encoded query parameters.
        const params = new URLSearchParams(score.content);
        const snapshot = ArrangementSnapshotMigrator.migrateFromParams(params, this.data.instruments);
        if (!snapshot) {
            return undefined;
        }

        if (this.canWriteScores) {
            void this.rewriteScoreAsCompact(score, snapshot);
        }

        return snapshot;
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
        const res = await fetch(`/api.php?action=updateScore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: score.id, content }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.statusText} (${res.status})`);
        }

        score.content = content;
    }

    public async renameEntry(entry: ISbDmScoreFolder | ISbDmScore, newName: string): Promise<void> {
        const res = await fetch(`/api.php?action=renameEntry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score",
                id: entry.id,
                name: newName,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        entry.name = newName;
        this.publish();
    }

    public async deleteEntry(entry: ISbDmScoreFolder | ISbDmScore): Promise<void> {
        // Check if the entry has children.
        if (entry.type === SbDmEntityType.ScoreFolder && entry.children.length > 0) {
            throw new Error("Cannot delete a folder that still has children.");
        }

        const res = await fetch(`/api.php?action=delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score",
                id: entry.id,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const parentChildren = entry.parent ? entry.parent.children : this.data.scoreLib;
        const index = parentChildren.findIndex((e) => {
            return e.id === entry.id;
        });

        if (index >= 0) {
            parentChildren.splice(index, 1);
            this.publish();
        }
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

    private async rewriteScoreAsCompact(score: ISbDmScore, snapshot: IArrangementSnapshot): Promise<void> {
        try {
            await this.updateScoreContent(score, stringifyPackedArrangement(snapshot));
        } catch {
            // Opportunistic rewrite — keep the legacy content if the backend call fails.
        }
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

        const res = await fetch(`/api.php?action=listSoundLib`, {
            headers: { Accept: "application/json" },
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
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
        parent?: ISbDmScoreFolder): Promise<void> {
        const res = await fetch(`/api.php?action=listScoreFolderContent`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ parentid: parent?.id ?? -1 }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
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
                refresh: (cb?: ProgressCallback) => {
                    (entry.state as Mutable<ISbDmEntityState>).initialized = true;

                    return this.updateScoreLibFolder(entry.children, entry);
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
            });
        });

        return Promise.resolve();
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

}
