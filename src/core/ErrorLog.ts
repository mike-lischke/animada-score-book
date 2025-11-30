/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createPublisher } from "./Publisher.js";
import type { IPublisher, ISubscribable } from "./types/general.js";

// It's been very difficult to solve compatibility problems, since they are usually on an iPhone belonging to Nick
// Guesswork has only gotten me so far, it's time to start trying to catch errors and make them reportable

// We catch two things: uncaught errors, and unhandled promise rejections
// We make the log subscribable so the React ui can make a button appear once there are errors to report

const logEntries: LogEntry[] = [];
const publisher: IPublisher = createPublisher();

export const errorLog: ErrorLog = {
    getEntryCount: () => {
        return logEntries.length;
    },
    getMessage: () => {
        if (!logEntries.length) {
            return "No errors to report. I'm not sure how you found this message!";
        }

        return errorReportPreamble + JSON.stringify({
            userAgent: navigator.userAgent,
            errors: logEntries
        });
    },
    subscribe: publisher.subscribe,
    unsubscribe: publisher.unsubscribe
};

window.addEventListener("error", ({ message, filename, lineno, colno, error }: ErrorEvent) => {
    const logEntry: ErrorLogEntry = {
        type: "Error",
        message,
        at: `${filename}:${lineno}.${colno}`,
        error: error as Error
    };

    extendWithErrorDetails(logEntry, error as Error);

    addToLog(logEntry);
});

window.addEventListener("unhandledrejection", ({ reason }: PromiseRejectionEvent) => {
    const logEntry: UnhandledRejectionLogEntry = {
        type: "Unhandled rejection",
        reason: reason
    };

    extendWithErrorDetails(logEntry, reason as Error);

    addToLog(logEntry);
});

const extendWithErrorDetails = (logEntry: LogEntry, error?: Error) => {
    if (error) {
        logEntry.errorName = error.name;
        logEntry.errorMessage = error.message;
        if (error.stack) {
            logEntry.stack = error.stack;
        }
    }
};

const addToLog = (logEntry: LogEntry) => {
    logEntries.push(logEntry);
    publisher.publish();
};

const errorReportPreamble = "Sorry to hear you had problems running Animada Score Book! Please copy this error " +
    "report and open an issue on Github (https://github.com/mike-lischke/animada-score-book/issues).";

interface ErrorLog extends ISubscribable {
    getEntryCount(): number;
    getMessage(): string;
}

interface LogEntry {
    type: "Error" | "Unhandled rejection";
    errorName?: string;
    errorMessage?: string;
    stack?: string;
}

interface ErrorLogEntry extends LogEntry {
    type: "Error";
    message: string | Event;
    at: string;
    error: Error;
}

interface UnhandledRejectionLogEntry extends LogEntry {
    type: "Unhandled rejection";
    reason: unknown;

}
