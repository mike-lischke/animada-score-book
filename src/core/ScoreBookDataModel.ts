/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { getNextId } from "../ui/index.js";
import type { IScoreDBEntry, ISoundLibFsNode } from "./DatabaseTypes.js";

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
}

export enum SbDmEntityType {
    SoundFolder,
    SoundFile,
    Score,
    ScoreFolder,
    Track,
    Instrument,
    InstrumentImage,
    Arrangement,
    Note
}

export interface ISbDmCommon {
    readonly id: number;
    name: string;

    /** The type of the entry. This is used a discriminator for the individual entries. */
    readonly type: SbDmEntityType;

    /** Transient state information. */
    readonly state: ISbDmEntityState;

    /**
     * Reloads the content of this data model entry, regardless of whether it was already initialized or not.
     * This should always be set if `initialize` is set.
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

export interface ISbDmSoundFolder extends ISbDmCommon {
    readonly type: SbDmEntityType.SoundFolder;
    readonly parentId: number | null;
    readonly path: string;
    readonly children?: Array<ISbDmSoundFolder | ISbDmSoundFile>;
}

export interface ISbDmSoundFile {
    readonly type: SbDmEntityType.SoundFile;
    readonly id: number;
    readonly name: string;
}

export interface ISbDmScoreFolder extends ISbDmCommon {
    readonly type: SbDmEntityType.ScoreFolder;
    readonly parentId: number;
    readonly children: Array<ISbDmScoreFolder | ISbDmScore>;
}

export interface ISbDmScore extends ISbDmCommon {
    readonly type: SbDmEntityType.Score;
    readonly parentId: number;
    readonly content: string;
    readonly description?: string;
}

export interface ISbDmTrack extends ISbDmCommon {
    readonly type: SbDmEntityType.Track;
    readonly instrument: ISbDmInstrument;
    readonly volume: number;
    readonly notes: ISbDmNote[];
}

export interface ISbDmNote {
    readonly type: SbDmEntityType.Note;
    readonly timing: {
        readonly bar: number;
        readonly step: number;
    };
    readonly duration: number;
    readonly pitch: number;
    readonly velocity: number;
}

export interface ISbDmInstrumentImage {
    readonly type: SbDmEntityType.InstrumentImage;

    readonly id: number;
    readonly filePath: string;
    readonly mimeType: string;
    readonly width?: number;
    readonly height?: number;
    readonly fileSize?: number;
}

export interface ISbDmInstrument extends ISbDmCommon {
    readonly type: SbDmEntityType.Instrument;
    readonly image: ISbDmInstrumentImage;
    readonly audioPath: string;
    readonly range: [number, number];
}

export interface ISbDmArrangement extends ISbDmCommon {
    readonly type: SbDmEntityType.Arrangement;
    tracks: ISbDmTrack[];
}

interface IScoreBookDataModelData {
    soundLib: Array<ISbDmSoundFolder | ISbDmSoundFile>;
    scoreLib: Array<ISbDmScoreFolder | ISbDmScore>;
    tracks: ISbDmTrack[];
    instruments: ISbDmInstrument[];
}

/** All possible data model entry types. */
export type ScoreBookDataModelEntry =
    | ISbDmSoundFolder
    | ISbDmSoundFile
    | ISbDmScoreFolder
    | ISbDmScore
    | ISbDmTrack
    | ISbDmInstrument
    ;

/**
 * A data model to share score book data between components.
 */
export class ScoreBookDataModel {
    private data: IScoreBookDataModelData = {
        soundLib: [],
        scoreLib: [],
        tracks: [],
        instruments: [],
    };

    public async initialize(): Promise<void> {
        const promises: Array<Promise<void>> = [
            this.loadSoundLib(),
            this.updateScoreLibFolder(this.data.scoreLib, -1)
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

    /**
     * Adds a new score folder to the data model.
     *
     * @param name The name of the new folder.
     * @param parent The parent folder to add the new folder to. If not given, the new folder is added to the root.
     */
    public async addScoreFolder(name: string, parent?: ISbDmScoreFolder): Promise<void> {
        const res = await fetch(`${this.getApiBase()}/api.php?action=addScoreFolder`, {
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
                parentId: parent?.id ?? -1,
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

        const res = await fetch(`${this.getApiBase()}/api.php?action=listSoundLib`, {
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
                            id: getNextId(),
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
                            id: getNextId(),
                            name: node.name,
                        };
                        parentList.push(soundFile);
                    }
                });
            };

            processNodes(data, this.data.soundLib, getNextId());

            resolve();
        });
    }

    private async updateScoreLibFolder(list: Array<ISbDmScoreFolder | ISbDmScore>, folderId: number): Promise<void> {
        const res = await fetch(`${this.getApiBase()}/api.php?action=listScoreFolderContent`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: JSON.stringify({ parentid: folderId }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as IScoreDBEntry;
        data.folders.forEach((folder) => {
            const entry: ISbDmScoreFolder = {
                type: SbDmEntityType.ScoreFolder,
                id: folder.id,
                name: folder.name,
                parentId: folder.parentid,
                state: {
                    expanded: false,
                    expandedOnce: false,
                    initialized: false,
                    isLeaf: !folder.hasChildren,
                },
                children: [],
                refresh: (cb?: ProgressCallback) => {
                    return this.updateScoreLibFolder(entry.children, folder.id);
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
                parentId: score.folderid,
                content: score.content,
            });
        });

        return Promise.resolve();
    }

    private getSoundUrl(path: string): string {
        // Pfad anpassen, falls nötig
        const base = this.getApiBase();

        return `${base}/soundLib/${path}`;
    }

    /**
     * @returns the path to use for the REST API script as string. It differs between local
     *          development and production.
     */
    private getApiBase(): string {
        const origin = window.location.origin;

        // For local development use the test server.
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
            return import.meta.env.VITE_BASE_URL;
        }

        // In production: use the same server as the app is served from.
        return "";
    };

}
