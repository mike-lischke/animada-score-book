/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../../../src/core/Publisher.js";
import type { IInstrumentMeta } from "../../../src/core/ScoreBookDataModel.js";
import {
    SbDmEntityType, type ISbDmInstrument, type ISbDmInstrumentImage,
} from "../../../src/core/ScoreBookDataModel.js";
import type { INoteStyle } from "../../../src/core/types/general.js";
import { getNewId } from "../../../src/core/utils.js";

/**
 * Mock instrument for use in tests. Does not load any audio data.
 */
export class MockInstrument extends Publisher implements ISbDmInstrument {
    public readonly type = SbDmEntityType.Instrument;
    public readonly id: number;
    public readonly typeId: string;
    public readonly displayOrder: number;
    public readonly displayName: string;
    public readonly image: ISbDmInstrumentImage;
    public readonly color: string;

    public readonly range: [number, number] = [0, -1];
    public readonly state = {
        initialized: false,
        isLeaf: true,
        expanded: false,
        expandedOnce: false,
    };

    public readonly noteStyles: Record<string, INoteStyle> = {};

    public constructor(instrumentMeta: IInstrumentMeta) {
        super();

        const { id, variants, displayOrder, displayName, color, typeId } = instrumentMeta;
        this.id = id;
        this.typeId = typeId;
        this.displayOrder = displayOrder;
        this.displayName = displayName;
        this.image = { type: SbDmEntityType.InstrumentImage, id: getNewId(), filePath: instrumentMeta.icon };
        this.color = color;

        variants.forEach(({ id, symbol, characteristics }) => {
            this.noteStyles[id] = {
                id, symbol, audioBuffer: null, instrument: this, characteristics
            };
        });

        this.state.initialized = true;
    }
}
