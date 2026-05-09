/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export class AudioContextMock {
    public timestamp: number;
    public contextTime: number;
    public running: boolean;

    public constructor() {
        this.timestamp = Date.now();
        this.contextTime = 0;
        this.running = true;
    }

    public suspend(): void {
        if (this.running) {
            this.running = false;
            this.contextTime += Date.now() - this.timestamp;
            this.timestamp = Date.now();
        }
    }

    public resume(): void {
        if (!this.running) {
            this.running = true;
            this.timestamp = Date.now();
        }
    }

    public get currentTime(): number {
        return (this.running ? this.contextTime + Date.now() - this.timestamp : this.contextTime) / 1000;
    }

    public decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBufferMock> {
        const audioBufferMock = new AudioBufferMock();
        const promise = new Promise<AudioBufferMock>((resolve) => {
            resolve(audioBufferMock);
        });

        return promise;
    }
};

export class AudioBufferMock { };

export class AudioBufferSourceNodeMock {
    public connect(): void {
        return;
    }

    public start(): void {
        return;
    }
};
