/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { getNextId } from "../ui/index.js";

/** Transient information related to initialization and UI. */
export interface SbDmEntityState {
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
    Folder,
    SoundFile,
    Snippet,
    Track,
    Instrument,
    Arrangement,
    Note
}

export interface ISbDmCommon {
    readonly id: number;
    name: string;

    /** The type of the entry. This is used a discriminator for the individual entries. */
    readonly type: SbDmEntityType;

    /** Transient state information. */
    readonly state: SbDmEntityState;
}

export interface ISbDmFolder extends ISbDmCommon {
    readonly type: SbDmEntityType.Folder;
    readonly parentId: number | null;
    readonly path: string,
    readonly children?: Array<ISbDmFolder | ISbDmSoundFile>;
}

export interface ISbDmSoundFile {
    readonly type: SbDmEntityType.SoundFile;
    readonly id: number;
    readonly name: string;
}

export interface ISbDmSnippet extends ISbDmCommon {
    readonly type: SbDmEntityType.Snippet;
    readonly parentId: number;
    readonly content: string;
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

export interface ISbDmInstrument extends ISbDmCommon {
    readonly type: SbDmEntityType.Instrument;
    readonly image: string;
    readonly audioPath: string;
    readonly range: [number, number];

}

export interface ISbDmScore extends ISbDmCommon {
    readonly type: SbDmEntityType.Arrangement;
    tracks: ISbDmTrack[];
}

interface IScoreBookDataModelData {
    soundLib: Array<ISbDmFolder | ISbDmSoundFile>;
    snippets: ISbDmSnippet[];
    tracks: ISbDmTrack[];
    instruments: ISbDmInstrument[];
    scores: ISbDmScore[];
}

interface ISoundLibFsNode {
    name: string;
    path: string;
    isDir: boolean;
    children?: ISoundLibFsNode[];
}

/**
 * A data model to share score book data between components.
 */
export class ScoreBookDataModel {
    private data: IScoreBookDataModelData = {
        soundLib: [],
        snippets: [],
        tracks: [],
        instruments: [],
        scores: [],
    };

    public get soundLib(): Array<ISbDmFolder | ISbDmSoundFile> {
        return this.data.soundLib;
    }

    public async loadSoundLib(): Promise<void> {
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
            const processNodes = (nodes: ISoundLibFsNode[], parentList: Array<ISbDmFolder | ISbDmSoundFile>,
                parentId: number
            ) => {
                nodes.forEach((node) => {
                    if (node.isDir) {
                        const folder: ISbDmFolder = {
                            id: getNextId(),
                            name: node.name,
                            type: SbDmEntityType.Folder,
                            parentId: 1,
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

    private getSoundUrl(path: string): string {
        // Pfad anpassen, falls nötig
        const base = this.getApiBase();

        return `${base}/BrazillianPercussion_Wav_SP/${path}`;
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
