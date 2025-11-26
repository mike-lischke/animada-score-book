/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

declare let global: Record<string, unknown>;

import { AudioContextMock, AudioBufferMock, AudioBufferSourceNodeMock } from "../mocks/WebAudio.js";
import { fetchMock } from "../mocks/fetch.js";

global.AudioContext = AudioContextMock;
global.AudioBuffer = AudioBufferMock;
global.AudioBufferSourceNode = AudioBufferSourceNodeMock;
global.fetch = fetchMock;
