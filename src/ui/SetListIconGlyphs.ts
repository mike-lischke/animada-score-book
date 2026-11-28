/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { defaultSetListIconKey, isSetListIconKey, type SetListIconKey } from "../core/SetListIcons.js";

/**
 * The glyph of every icon the set-list entry picker offers. The record is exhaustive over the catalogue, so an icon
 * that the catalogue gains without a glyph here does not compile.
 */
export const setListIconGlyphs: Record<SetListIconKey, UIIcon> = {
    TextLong: UIIcon.TextLong,
    Text: UIIcon.Text,
    TextBox: UIIcon.TextBox,
    NoteText: UIIcon.NoteText,
    MessageText: UIIcon.MessageText,

    MusicClefTreble: UIIcon.MusicClefTreble,
    MusicClefBass: UIIcon.MusicClefBass,
    MusicClefAlto: UIIcon.MusicClefAlto,
    MusicNote: UIIcon.MusicNote,
    MusicNoteOutline: UIIcon.MusicNoteOutline,
    MusicNoteEighth: UIIcon.MusicNoteEighth,
    MusicNoteQuarter: UIIcon.MusicNoteQuarter,
    MusicNoteHalf: UIIcon.MusicNoteHalf,
    MusicNoteWhole: UIIcon.MusicNoteWhole,
    MusicNoteSixteenth: UIIcon.MusicNoteSixteenth,
    MusicNoteEighthDotted: UIIcon.MusicNoteEighthDotted,
    MusicNoteQuarterDotted: UIIcon.MusicNoteQuarterDotted,
    MusicNoteHalfDotted: UIIcon.MusicNoteHalfDotted,
    MusicNoteWholeDotted: UIIcon.MusicNoteWholeDotted,
    MusicNoteSixteenthDotted: UIIcon.MusicNoteSixteenthDotted,
    MusicAccidentalSharp: UIIcon.MusicAccidentalSharp,
    MusicAccidentalFlat: UIIcon.MusicAccidentalFlat,
    MusicAccidentalNatural: UIIcon.MusicAccidentalNatural,
    MusicAccidentalDoubleSharp: UIIcon.MusicAccidentalDoubleSharp,
    MusicAccidentalDoubleFlat: UIIcon.MusicAccidentalDoubleFlat,

    Piano: UIIcon.Piano,
    GuitarAcoustic: UIIcon.GuitarAcoustic,
    GuitarElectric: UIIcon.GuitarElectric,
    GuitarPick: UIIcon.GuitarPick,
    Violin: UIIcon.Violin,
    Saxophone: UIIcon.Saxophone,
    Trumpet: UIIcon.Trumpet,
    InstrumentTriangle: UIIcon.InstrumentTriangle,
    Shaker: UIIcon.Shaker,
    Metronome: UIIcon.Metronome,
    MetronomeTick: UIIcon.MetronomeTick,

    Microphone: UIIcon.Microphone,
    MicrophoneOutline: UIIcon.MicrophoneOutline,
    MicrophoneVariant: UIIcon.MicrophoneVariant,
    AccountVoice: UIIcon.AccountVoice,
    Bullhorn: UIIcon.Bullhorn,
    BullhornOutline: UIIcon.BullhornOutline,
    HandClap: UIIcon.HandClap,

    TimerMusic: UIIcon.TimerMusic,
    Timer: UIIcon.Timer,
    AvTimer: UIIcon.AvTimer,
    Clock: UIIcon.Clock,

    Music: UIIcon.Music,
    MusicBox: UIIcon.MusicBox,
    PlaylistMusic: UIIcon.PlaylistMusic,
    Headphones: UIIcon.Headphones,
    Speaker: UIIcon.Speaker,
    SpeakerPlay: UIIcon.SpeakerPlay,
    Amplifier: UIIcon.Amplifier,
    Boombox: UIIcon.Boombox,
    Cassette: UIIcon.Cassette,
    RecordPlayer: UIIcon.RecordPlayer,
    Record: UIIcon.Record,
    Disc: UIIcon.Disc,
    Album: UIIcon.Album,
    Radio: UIIcon.Radio,
    Equalizer: UIIcon.Equalizer,
    Waveform: UIIcon.Waveform,
    Tune: UIIcon.Tune,
    VolumeHigh: UIIcon.VolumeHigh,
    VolumeMedium: UIIcon.VolumeMedium,
    VolumeLow: UIIcon.VolumeLow,
    VolumeMute: UIIcon.VolumeMute,
    Play: UIIcon.Play,
    Pause: UIIcon.Pause,
    Stop: UIIcon.Stop,
    Repeat: UIIcon.Repeat,
    RepeatOnce: UIIcon.RepeatOnce,
    Shuffle: UIIcon.Shuffle,

    Spotlight: UIIcon.Spotlight,
    SpotlightBeam: UIIcon.SpotlightBeam,
    Theater: UIIcon.Theater,
    Ticket: UIIcon.Ticket,
    TicketConfirmation: UIIcon.TicketConfirmation,
    Podium: UIIcon.Podium,
    Flag: UIIcon.Flag,
    FlagCheckered: UIIcon.FlagCheckered,
    FlagVariant: UIIcon.FlagVariant,
    Fire: UIIcon.Flame,
    PartyPopper: UIIcon.PartyPopper,
    Run: UIIcon.Run,
    RunFast: UIIcon.RunFast,
    Walk: UIIcon.Walk,
    HandPeace: UIIcon.HandPeace,
    PauseCircle: UIIcon.PauseCircle,
    Lightbulb: UIIcon.Lightbulb,
    Star: UIIcon.Star,
    Heart: UIIcon.Heart,
    Alert: UIIcon.Alert,
    Information: UIIcon.Info,
};

/**
 * @param key The icon key an entry stores, or undefined while its author picked none.
 *
 * @returns The glyph to render: the icon of that key, or the one the catalogue names as its default.
 */
export const setListGlyphOf = (key: string | undefined): UIIcon => {
    return isSetListIconKey(key) ? setListIconGlyphs[key] : setListIconGlyphs[defaultSetListIconKey];
};
