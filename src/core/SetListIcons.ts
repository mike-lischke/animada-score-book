/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The icons a set-list entry can wear, grouped as the icon picker shows them. The keys are Material Design Icon
 * names without their `mdi` prefix: they are what an entry stores, so they must not follow a rename in the icon
 * library. The paths themselves live in the UI layer, which is the only place that renders them.
 */
export const setListIconGroups = [
    {
        caption: "Text & Notes",
        keys: ["TextLong", "Text", "TextBox", "NoteText", "MessageText"],
    },
    {
        caption: "Notation",
        keys: [
            "MusicClefTreble", "MusicClefBass", "MusicClefAlto",
            "MusicNote", "MusicNoteOutline", "MusicNoteEighth", "MusicNoteQuarter", "MusicNoteHalf",
            "MusicNoteWhole", "MusicNoteSixteenth", "MusicNoteEighthDotted", "MusicNoteQuarterDotted",
            "MusicNoteHalfDotted", "MusicNoteWholeDotted", "MusicNoteSixteenthDotted",
            "MusicAccidentalSharp", "MusicAccidentalFlat", "MusicAccidentalNatural",
            "MusicAccidentalDoubleSharp", "MusicAccidentalDoubleFlat",
        ],
    },
    {
        caption: "Instruments",
        keys: [
            "Piano", "GuitarAcoustic", "GuitarElectric", "GuitarPick", "Violin", "Saxophone", "Trumpet",
            "InstrumentTriangle", "Shaker", "Metronome", "MetronomeTick",
        ],
    },
    {
        caption: "Voice & Announcement",
        keys: [
            "Microphone", "MicrophoneOutline", "MicrophoneVariant", "AccountVoice", "Bullhorn", "BullhornOutline",
            "HandClap",
        ],
    },
    {
        caption: "Pulse & Tempo",
        keys: ["TimerMusic", "Timer", "AvTimer", "Clock"],
    },
    {
        caption: "Sound & Playback",
        keys: [
            "Music", "MusicBox", "PlaylistMusic", "Headphones", "Speaker", "SpeakerPlay", "Amplifier", "Boombox",
            "Cassette", "RecordPlayer", "Record", "Disc", "Album", "Radio", "Equalizer", "Waveform", "Tune",
            "VolumeHigh", "VolumeMedium", "VolumeLow", "VolumeMute", "Play", "Pause", "Stop", "Repeat", "RepeatOnce",
            "Shuffle",
        ],
    },
    {
        caption: "Stage & Running Order",
        keys: [
            "Spotlight", "SpotlightBeam", "Theater", "Ticket", "TicketConfirmation", "Podium", "Flag",
            "FlagCheckered", "FlagVariant", "Fire", "PartyPopper", "Run", "RunFast", "Walk", "HandPeace",
            "PauseCircle", "Lightbulb", "Star", "Heart", "Alert", "Information",
        ],
    },
] as const;

/** One block of the icon picker: its caption and the icons it offers, in display order. */
export type ISetListIconGroup = (typeof setListIconGroups)[number];

/** Every icon key a set-list entry may store. */
export type SetListIconKey = ISetListIconGroup["keys"][number];

/** The icon an entry wears while its author has chosen none: text lines, standing for a description. */
export const defaultSetListIconKey: SetListIconKey = "TextLong";

const knownIcons = new Set<string>(setListIconGroups.flatMap((group) => {
    return group.keys;
}));

/**
 * @param value A value from a stored entry or a request body.
 *
 * @returns Whether the value names an icon of the catalogue.
 */
export const isSetListIconKey = (value: unknown): value is SetListIconKey => {
    return typeof value === "string" && knownIcons.has(value);
};
