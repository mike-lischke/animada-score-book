/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ExcitationMode, type IInstrumentMeta, type IVocalCharacteristics } from "./core/ScoreBookDataModel.js";

const vocalCharacteristics: IVocalCharacteristics = { excitationMode: ExcitationMode.Vocal };

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
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "2",
            file: "Numbers/Dois.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "3",
            file: "Numbers/Tres.mp3",
            characteristics: vocalCharacteristics,
            accented: true,
        },
        {
            id: "4",
            file: "Numbers/Quatro.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "5",
            file: "Numbers/Cinco.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "6",
            file: "Numbers/Seis.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "7",
            file: "Numbers/Sete.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "8",
            file: "Numbers/Oito.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "9",
            file: "Numbers/Nove.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        },
        {
            id: "10",
            file: "Numbers/Dez.mp3",
            characteristics: vocalCharacteristics,
            accented: false,
        }
    ],
};

export const numberSounds = numberSoundsPT;
