/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import * as log from "../lib/logging.js";

log.set("fetchRequestLog", []);

const requestLog: string[] = log.get<string[]>("fetchRequestLog")!;

export const fetchMock = (requestUrl: string): Promise<ResponseMock> => {
    requestLog.push(requestUrl);

    return Promise.resolve(new ResponseMock(requestUrl));
};

log.set("arrayBuffers", new Map());

const arrayBufferLog: Map<ArrayBuffer, string> = log.get<Map<ArrayBuffer, string>>("arrayBuffers")!;

export class ResponseMock {
    private requestUrl: string;

    public constructor(requestUrl: string) {
        this.requestUrl = requestUrl;
    }

    // We use arrayBuffer() for fetching audio files
    public arrayBuffer() {
        const arrayBuffer = new ArrayBuffer(8);
        arrayBufferLog.set(arrayBuffer, this.requestUrl); // We want to check this in tests

        return arrayBuffer;
    }
}
