/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Enforces the size budget of the production bundle.
 *
 * Runs at the end of `vite build` (see the `bundle-budget-check` plugin in `vite.config.ts`), so an oversized bundle
 * never ships. All sizes are gzip sizes, computed with the same compression level, which keeps them comparable to
 * what a static server sends.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface IBundleBudget {
    /** Maximum raw size of a single emitted file, the same limit Vite warns about. */
    fileKb: number;

    /** Maximum gzip size of every file the browser needs before the app can start. */
    initialLoadKb: number;
}

interface IManifestEntry {
    file: string;
    name?: string;
    isEntry?: boolean;
    imports?: string[];
    css?: string[];
}

interface IMeasuredFile {
    fileName: string;
    rawKb: number;
    gzipKb: number;
    initial: boolean;
}

export class BundleBudget {
    /**
     * Current sizes (2026-10-25): largest single file 348.9 kB raw, initial load 200.8 kB gzip. The headroom is for
     * content work, not for new libraries: a new dependency either fits or the budget is raised deliberately.
     */
    private static readonly budget: IBundleBudget = {
        fileKb: 500,
        initialLoadKb: 210,
    };

    /**
     * Verifies the built bundle against the budget.
     *
     * Stays quiet while the bundle fits; a violation throws with the size report attached.
     *
     * @param distFolder The folder `vite build` wrote.
     *
     * @throws {Error} When a file or the initial load exceeds its budget.
     */
    public static verify(distFolder: string): void {
        const manifest = BundleBudget.readManifest(distFolder);
        const initialFiles = BundleBudget.collectInitialFiles(manifest);
        const files = BundleBudget.measureFiles(distFolder, manifest, initialFiles);
        const initialLoadKb = files.reduce((sum, file) => {
            return file.initial ? sum + file.gzipKb : sum;
        }, 0);

        const violations = BundleBudget.findViolations(files, initialLoadKb);
        if (violations.length > 0) {
            throw new Error(`${violations.length} bundle budget violation(s):\n${violations.join("\n")}\n\n` +
                `${BundleBudget.formatReport(files, initialLoadKb)}\n` +
                "Split the responsible chunk or raise the budget in build/BundleBudget.ts deliberately.");
        }
    }

    private static readManifest(distFolder: string): Map<string, IManifestEntry> {
        const manifestFile = join(distFolder, ".vite", "manifest.json");

        let content: string;
        try {
            content = readFileSync(manifestFile, "utf-8");
        } catch {
            throw new Error(`No build manifest at ${manifestFile}. Run the production build first.`);
        }

        return new Map(Object.entries(JSON.parse(content) as Record<string, IManifestEntry>));
    }

    /**
     * Collects the files the browser loads before the app runs: the entry chunk, its static imports and their CSS.
     *
     * @param manifest The build manifest.
     *
     * @returns The file names of the initial load.
     */
    private static collectInitialFiles(manifest: Map<string, IManifestEntry>): Set<string> {
        const result = new Set<string>();
        const entry = [...manifest.values()].find((candidate) => {
            return candidate.isEntry;
        });

        if (!entry) {
            throw new Error("The build manifest contains no entry.");
        }

        const pending = [entry];
        let current = pending.pop();
        while (current) {
            result.add(current.file);
            current.css?.forEach((cssFile) => {
                result.add(cssFile);
            });

            current.imports?.forEach((importKey) => {
                const imported = manifest.get(importKey);
                if (imported) {
                    pending.push(imported);
                }
            });

            current = pending.pop();
        }

        return result;
    }

    private static measureFiles(distFolder: string, manifest: Map<string, IManifestEntry>,
        initialFiles: Set<string>): IMeasuredFile[] {
        const measured = new Map<string, IMeasuredFile>();

        const addFile = (fileName: string): void => {
            if (measured.has(fileName)) {
                return;
            }

            const content = readFileSync(join(distFolder, fileName));
            measured.set(fileName, {
                fileName,
                rawKb: Math.round(content.length / 100) / 10,
                gzipKb: Math.round(gzipSync(content).length / 100) / 10,
                initial: initialFiles.has(fileName),
            });
        };

        manifest.forEach((entry) => {
            if (entry.file.endsWith(".js")) {
                addFile(entry.file);
            }

            entry.css?.forEach((cssFile) => {
                addFile(cssFile);
            });
        });

        return [...measured.values()].sort((left, right) => {
            return right.rawKb - left.rawKb;
        });
    }

    private static formatReport(files: IMeasuredFile[], initialLoadKb: number): string {
        const budget = BundleBudget.budget;
        const rows = files.map((file) => {
            const kind = file.initial ? "initial" : "lazy";
            const line = BundleBudget.formatRow(kind, file.rawKb, file.gzipKb, file.fileName);

            return file.rawKb > budget.fileKb ? `${line}  <-- over budget` : line;
        });

        const rawTotalKb = files.reduce((sum, file) => {
            return file.initial ? sum + file.rawKb : sum;
        }, 0);
        rows.push(BundleBudget.formatRow("", rawTotalKb, initialLoadKb,
            `initial load (budget ${BundleBudget.formatKb(budget.initialLoadKb)} gzip)`));

        return [`Bundle sizes (budget: ${BundleBudget.formatKb(budget.fileKb)} raw per file):`, ...rows].join("\n");
    }

    private static formatRow(kind: string, rawKb: number, gzipKb: number, label: string): string {
        const raw = `${rawKb.toFixed(1)} kB`.padStart(11);
        const gzip = `${gzipKb.toFixed(1)} kB`.padStart(11);

        return `  ${kind.padEnd(8)}${raw} raw ${gzip} gzip  ${label}`;
    }

    private static findViolations(files: IMeasuredFile[], initialLoadKb: number): string[] {
        const budget = BundleBudget.budget;
        const violations = files
            .filter((file) => {
                return file.rawKb > budget.fileKb;
            })
            .map((file) => {
                return `- ${file.fileName} is ${BundleBudget.formatKb(file.rawKb)} raw, budget is ` +
                    BundleBudget.formatKb(budget.fileKb);
            });

        if (initialLoadKb > budget.initialLoadKb) {
            violations.push(`- initial load is ${BundleBudget.formatKb(initialLoadKb)} gzip, budget is ` +
                BundleBudget.formatKb(budget.initialLoadKb));
        }

        return violations;
    }

    private static formatKb(kb: number): string {
        return `${kb.toFixed(1)} kB`;
    }
}
