/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IInstrumentMeta } from "./core/ScoreBookDataModel.js";

/** Portuguese number sounds. */
const numberSoundsPT: IInstrumentMeta = {
    id: 0,
    typeId: "number",
    displayOrder: 0,
    displayName: "Numbers (Portuguese)",
    icon: "number.png",
    color: "#000000",
    variants: [
        {
            id: "1",
            file: "Numbers/Um.mp3",
        },
        {
            id: "2",
            file: "Numbers/Dois.mp3",
        },
        {
            id: "3",
            file: "Numbers/Tres.mp3",
        },
        {
            id: "4",
            file: "Numbers/Quatro.mp3",
        },
        {
            id: "5",
            file: "Numbers/Cinco.mp3",
        },
        {
            id: "6",
            file: "Numbers/Seis.mp3",
        },
        {
            id: "7",
            file: "Numbers/Sete.mp3",
        },
        {
            id: "8",
            file: "Numbers/Oito.mp3",
        },
        {
            id: "9",
            file: "Numbers/Nove.mp3",
        },
        {
            id: "10",
            file: "Numbers/Dez.mp3",
        }
    ],
};

export const numberSounds = numberSoundsPT;
