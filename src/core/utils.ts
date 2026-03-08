/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITiming } from "./ScoreBookDataModel.js";

/**
 * Comparing timings is easy, but long winded and mistake-prone
 *
 * @param timing1 The first timing to compare.
 * @param timing2 The second timing to compare.
 *
 * @returns true if the timings are the same, false otherwise.
 */
export const isSameTiming = (timing1: ITiming, timing2: ITiming): boolean => {
    return (timing1.bar === timing2.bar) && (timing1.step === timing2.step);
};

/**
 * Checks if a value exists (is not null or undefined).
 *
 * @param value The value to check.
 *
 * @returns true if the value exists, false otherwise.
 */
export const exists = <T>(value: T | undefined | null): value is T => {
    return value === (value ?? !value);
};

/**
 * A helper function to asynchronously wait for a specific time. The call allows to run other JS code
 * while waiting for the timeout.
 *
 * @param ms The duration in milliseconds to wait.
 *
 * @returns A promise to wait for.
 */
export const sleep = (ms: number): Promise<unknown> => {
    return new Promise((resolve) => {
        return setTimeout(resolve, ms);
    });
};

/**
 * Waits for a condition to become true.
 *
 * @param timeout The number of milliseconds to wait for the condition.
 * @param condition A function that checks if a condition has become true.
 *
 * @returns A promise that resolves to true, if the condition became true within the timeout range, otherwise false.
 */
export const waitFor = async (timeout: number, condition: () => boolean): Promise<boolean> => {
    while (!condition() && timeout > 0) {
        timeout -= 100;
        await sleep(100);
    }

    return timeout > 0 ? true : false;
};

let nextId = 1;

/** @returns a new unique id for components, data entries etc. */
export const getNewId = (): number => {
    return nextId++;
};

export const calculateStepsPerBar = (timeSignature: string, stepResolution: number): number => {
    const [beatsPerBar, beatNoteValue] = timeSignature.split("/").map((value: string) => {
        return Number(value);
    });
    const stepsPerBeat = stepResolution / beatNoteValue;

    return stepsPerBeat * beatsPerBar;
};

/**
 * Converts an optional value to a string expression for use in CSS.
 *
 * @param value The value to convert. If it is a string, it's taken over as is.
 * @param numericUnit Only used for numeric values, with which it is combined to form a simple value,
 *                    for example "10px" or "1em".
 *
 * @returns A CSS value.
 */
export const convertPropValue = (value?: number | string, numericUnit = "px"): string | undefined => {
    if (value == null) {
        return undefined;
    }

    if (typeof value === "number") {
        return `${value}${numericUnit}`;
    }

    return value;
};

/**
 * Converts an unknown error to a string representation, including nested causes if present.
 *
 * @param error The error to convert.
 * @returns The string representation.
 */
export const convertErrorToString = (error: unknown): string => {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const e = error;
    let result = e.message;
    if (e.cause) {
        result += "\n" + convertErrorToString(e.cause);
    } else if (e.stack) {
        // Extract the first line of the stack trace, which usually contains the most relevant information about
        // where the error occurred.
        const lines = e.stack.split("\n");
        if (lines.length > 1) {
            // Remove any parameters from the stack trace line.
            lines[1] = lines[1].replace(/\?[^:]*:/, " => ");
            result += "\n" + lines[1];
        }
    }

    return result;
};

/**
 * Ensures a value is within a given range.
 *
 * @param value The value to check.
 * @param min The smallest value that is possible.
 * @param max The largest value that is possible.
 *
 * @returns The given value, trimmed to the min and max bounds.
 */
export const clampValue = <T extends number | bigint>(value: T, min?: T, max?: T): T => {
    if (min != null && value < min) {
        return min;
    }

    if (max != null && value > max) {
        return max;
    }

    return value;
};

/**
 * Same as Math.min, but supports bigint too.
 *
 * @param a The first value.
 * @param b The second value.
 *
 * @returns The smaller of the two values.
 */
export const minValue = <T extends number | bigint>(a: T, b: T): T => {
    return a < b ? a : b;
};

/**
 * Same as Math.max, but supports bigint too.
 *
 * @param a The first value.
 * @param b The second value.
 *
 * @returns The bigger of the two values.
 */
export const maxValue = <T extends number | bigint>(a: T, b: T): T => {
    return a > b ? a : b;
};

/**
 * @returns the path to use for the REST API script as string. It differs between local
 *          development and production.
 */
export const getApiBase = (): string => {
    const origin = window.location.origin;

    // For local development use the test server.
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return import.meta.env.VITE_BASE_URL;
    }

    // In production: use the same server as the app is served from.
    return "";
};

/** Key names to key strings. */
export const KeyboardKeys = {
    // Modifier keys
    Alt: "Alt",
    AltGraph: "AltGraph",
    CapsLock: "CapsLock",
    Control: "Control",
    Fn: "Fn",
    FnLock: "FnLock",
    Hyper: "Hyper",
    Meta: "Meta",
    NumLock: "NumLock",
    ScrollLock: "ScrollLock",
    Shift: "Shift",
    Super: "Super",
    Symbol: "Symbol",
    SymbolLock: "SymbolLock",

    // Whitespace keys
    Enter: "Enter",
    Tab: "Tab",
    Space: " ",

    // Navigation keys
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    ArrowUp: "ArrowUp",
    End: "End",
    Home: "Home",
    PageDown: "PageDown",
    PageUp: "PageUp",

    // Editing keys
    Backspace: "Backspace",
    Clear: "Clear",
    Copy: "Copy",
    CrSel: "CrSel",
    Cut: "Cut",
    Delete: "Delete",
    EraseEof: "EraseEof",
    ExSel: "ExSel",
    Insert: "Insert",
    Paste: "Paste",
    Redo: "Redo",
    Undo: "Undo",

    // UI Keys
    Accept: "Accept",
    Again: "Again",
    Attn: "Attn",
    Cancel: "Cancel",
    ContextMenu: "ContextMenu",
    Escape: "Escape",
    Execute: "Execute",
    Find: "Find",
    Finish: "Finish",
    Help: "Help",
    Pause: "Pause",
    Play: "Play",
    Props: "Props",
    Select: "Select",
    ZoomIn: "ZoomIn",
    ZoomOut: "ZoomOut",

    // Device keys
    BrightnessDown: "BrightnessDown",
    BrightnessUp: "BrightnessUp",
    Eject: "Eject",
    LogOff: "LogOff",
    Power: "Power",
    PowerOff: "PowerOff",
    PrintScreen: "PrintScreen",
    Hibernate: "Hibernate",
    Standby: "Standby",
    WakeUp: "WakeUp",

    // IME and composition keys
    AllCandidates: "AllCandidates",
    Alphanumeric: "Alphanumeric",
    CodeInput: "CodeInput",
    Compose: "Compose",
    Convert: "Convert",
    Dead: "Dead",
    FinalMode: "FinalMode",
    GroupFirst: "GroupFirst",
    GroupLast: "GroupLast",
    GroupNext: "GroupNext",
    GroupPrevious: "GroupPrevious",
    ModeChange: "ModeChange",
    NextCandidate: "NextCandidate",
    NonConvert: "NonConvert",
    PreviousCandidate: "PreviousCandidate",
    Process: "Process",
    SingleCandidate: "SingleCandidate",

    // Function keys
    F1: "F1",
    F2: "F2",
    F3: "F3",
    F4: "F4",
    F5: "F5",
    F6: "F6",
    F7: "F7",
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
    F13: "F13",
    F14: "F14",
    F15: "F15",
    F16: "F16",
    F17: "F17",
    F18: "F18",
    F19: "F19",
    F20: "F20",
    Soft1: "Soft1",
    Soft2: "Soft2",
    Soft3: "Soft3",
    Soft4: "Soft4",

    // Phone keys
    AppSwitch: "AppSwitch",
    Call: "Call",
    Camera: "Camera",
    CameraFocus: "CameraFocus",
    EndCall: "EndCall",
    GoBack: "GoBack",
    GoHome: "GoHome",
    HeadsetHook: "HeadsetHook",
    LastNumberRedial: "LastNumberRedial",
    Notification: "Notification",
    MannerMode: "MannerMode",
    VoiceDial: "VoiceDial",

    // Multimedia keys
    ChannelDown: "ChannelDown",
    ChannelUp: "ChannelUp",
    MediaFastForward: "MediaFastForward",
    MediaPause: "MediaPause",
    MediaPlay: "MediaPlay",
    MediaPlayPause: "MediaPlayPause",
    MediaRecord: "MediaRecord",
    MediaRewind: "MediaRewind",
    MediaStop: "MediaStop",
    MediaTrackNext: "MediaTrackNext",
    MediaTrackPrevious: "MediaTrackPrevious",

    // Audio control keys
    AudioBalanceLeft: "AudioBalanceLeft",
    AudioBalanceRight: "AudioBalanceRight",
    AudioBassDown: "AudioBassDown",
    AudioBassBoostDown: "AudioBassBoostDown",
    AudioBassBoostToggle: "AudioBassBoostToggle",
    AudioBassBoostUp: "AudioBassBoostUp",
    AudioBassUp: "AudioBassUp",
    AudioFaderFront: "AudioFaderFront",
    AudioFaderRear: "AudioFaderRear",
    AudioSurroundModeNext: "AudioSurroundModeNext",
    AudioTrebleDown: "AudioTrebleDown",
    AudioTrebleUp: "AudioTrebleUp",
    AudioVolumeDown: "AudioVolumeDown",
    AudioVolumeMute: "AudioVolumeMute",
    AudioVolumeUp: "AudioVolumeUp",
    MicrophoneToggle: "MicrophoneToggle",
    MicrophoneVolumeDown: "MicrophoneVolumeDown",
    MicrophoneVolumeMute: "MicrophoneVolumeMute",
    MicrophoneVolumeUp: "MicrophoneVolumeUp",

    // Document keys
    Close: "Close",
    New: "New",
    Open: "Open",
    Print: "Print",
    Save: "Save",
    SpellCheck: "SpellCheck",
    MailForward: "MailForward",
    MailReply: "MailReply",
    MailSend: "MailSend",

    // Application selector keys
    LaunchCalculator: "LaunchCalculator",
    LaunchCalendar: "LaunchCalendar",
    LaunchContacts: "LaunchContacts",
    LaunchMail: "LaunchMail",
    LaunchMediaPlayer: "LaunchMediaPlayer",
    LaunchMusicPlayer: "LaunchMusicPlayer",
    LaunchMyComputer: "LaunchMyComputer",
    LaunchPhone: "LaunchPhone",
    LaunchScreenSaver: "LaunchScreenSaver",
    LaunchSpreadsheet: "LaunchSpreadsheet",
    LaunchWebBrowser: "LaunchWebBrowser",
    LaunchWebCam: "LaunchWebCam",
    LaunchWordProcessor: "LaunchWordProcessor",
    LaunchApplication1: "LaunchApplication1",
    LaunchApplication2: "LaunchApplication2",
    LaunchApplication3: "LaunchApplication3",
    LaunchApplication4: "LaunchApplication4",
    LaunchApplication5: "LaunchApplication5",
    LaunchApplication6: "LaunchApplication6",
    LaunchApplication7: "LaunchApplication7",
    LaunchApplication8: "LaunchApplication8",
    LaunchApplication9: "LaunchApplication9",
    LaunchApplication10: "LaunchApplication10",
    LaunchApplication11: "LaunchApplication11",
    LaunchApplication12: "LaunchApplication12",
    LaunchApplication13: "LaunchApplication13",
    LaunchApplication14: "LaunchApplication14",
    LaunchApplication15: "LaunchApplication15",
    LaunchApplication16: "LaunchApplication16",

    // Browser control keys
    BrowserBack: "BrowserBack",
    BrowserFavorites: "BrowserFavorites",
    BrowserForward: "BrowserForward",
    BrowserHome: "BrowserHome",
    BrowserRefresh: "BrowserRefresh",
    BrowserSearch: "BrowserSearch",
    BrowserStop: "BrowserStop",

    // Numeric keypad keys
    Decimal: "Decimal",
    Key11: "Key11",
    Key12: "Key12",
    Multiply: "Multiply",
    Add: "Add",
    Divide: "Divide",
    Subtract: "Subtract",
    Separator: "Separator",
    Zero: "0",
    One: "1",
    Two: "2",
    Three: "3",
    Four: "4",
    Five: "5",
    Six: "6",
    Seven: "7",
    Eight: "8",
    Nine: "9",

    // Standard letter keys
    A: "a",
    B: "b",
    C: "c",
    D: "d",
    E: "e",
    F: "f",
    G: "g",
    H: "h",
    I: "i",
    J: "j",
    K: "k",
    L: "l",
    M: "m",
    N: "n",
    O: "o",
    P: "p",
    Q: "q",
    R: "r",
    S: "s",
    T: "t",
    U: "u",
    V: "v",
    W: "w",
    X: "x",
    Y: "y",
    Z: "z",
};
