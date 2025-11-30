/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";

const errorReportPreamble = "Sorry to hear you had problems running Animada Score Book! Please copy this error " +
    "report and open an issue on Github (https://github.com/mike-lischke/animada-score-book/issues).";

interface ILogEntry {
    type: "Error" | "Unhandled rejection";
    errorName?: string;
    errorMessage?: string;
    stack?: string;
}

interface IErrorLogEntry extends ILogEntry {
    type: "Error";
    message: string | Event;
    at: string;
    error: Error;
}

interface IUnhandledRejectionLogEntry extends ILogEntry {
    type: "Unhandled rejection";
    reason: unknown;

}

/**
 * Keeps a log of errors that occurred during runtime.
 *
 * We catch two things: uncaught errors, and unhandled promise rejections.
 */
export class ErrorLog extends Publisher {
    private readonly logEntries: ILogEntry[] = [];

    public getEntryCount() {
        return this.logEntries.length;
    }

    public getMessage() {
        if (!this.logEntries.length) {
            return "No errors to report. I'm not sure how you found this message!";
        }

        return errorReportPreamble + JSON.stringify({
            userAgent: navigator.userAgent,
            errors: this.logEntries
        });
    };

    public extendWithErrorDetails = (logEntry: ILogEntry, error?: Error) => {
        if (error) {
            logEntry.errorName = error.name;
            logEntry.errorMessage = error.message;
            if (error.stack) {
                logEntry.stack = error.stack;
            }
        }
    };

    public addToLog = (logEntry: ILogEntry) => {
        this.logEntries.push(logEntry);
        this.publish();
    };

    static {
        window.addEventListener("error", ({ message, filename, lineno, colno, error }: ErrorEvent) => {
            const logEntry: IErrorLogEntry = {
                type: "Error",
                message,
                at: `${filename}:${lineno}.${colno}`,
                error: error as Error
            };

            errorLog.extendWithErrorDetails(logEntry, error as Error);

            errorLog.addToLog(logEntry);
        });

        window.addEventListener("unhandledrejection", ({ reason }: PromiseRejectionEvent) => {
            const logEntry: IUnhandledRejectionLogEntry = {
                type: "Unhandled rejection",
                reason: reason
            };

            errorLog.extendWithErrorDetails(logEntry, reason as Error);

            errorLog.addToLog(logEntry);
        });
    }
}

export const errorLog = new ErrorLog();
