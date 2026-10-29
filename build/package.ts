/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv } from "node:process";

import { build as bundle } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(projectRoot, "dist-package");
const serverBundle = join(projectRoot, "dist-server", "server.js");

/** Content the package ships from the repository, relative to the project root. */
const packageContent = [
    "dist",
    "public",
    "build/seed.sql",
    "migrations",
    "backend-config.example.json",
    "docs/en",
    "docs/images",
    "readme.md",
    "release-notes.md",
    "License.txt",
];

/** Content that must never end up in the package. */
const forbiddenContent = [
    "backend-config.json",
    ".env",
    ".env.local",
    "node_modules",
    "src",
    "package-lock.json",
];

/** The manifest the package carries, which describes how to start the bundled server. */
interface IPackageManifest {
    name: string;
    version: string;
    private: boolean;
    type: string;
    engines: Record<string, string>;
    scripts: Record<string, string>;
}

/**
 * Reads the repository manifest, which states the version and the Node.js versions the package supports.
 *
 * @returns The relevant fields of the repository manifest.
 */
const readManifest = (): { version: string; engines: Record<string, string>; } => {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8")) as {
        version: string;
        engines: Record<string, string>;
    };
};

/**
 * Builds the frontend so the package ships a current `dist` directory.
 */
const buildFrontend = (): void => {
    console.log("Building the frontend …");
    execFileSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });
};

/**
 * Bundles the backend and everything it imports into one ESM file, so the package needs no installed dependencies.
 */
const bundleServer = async (): Promise<void> => {
    console.log("Bundling the backend …");
    await bundle({
        entryPoints: [join(projectRoot, "src", "server", "backend.ts")],
        outfile: serverBundle,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node24",
        loader: { ".svg": "dataurl" },
        // CommonJS dependencies call `require` for Node built-ins, which an ESM bundle has to provide itself.
        banner: {
            js: "import { createRequire } from \"node:module\";\nconst require = createRequire(import.meta.url);",
        },
        logLevel: "warning",
    });
};

/**
 * Copies the package content into the staging directory, skipping editor and OS leftovers.
 *
 * @param stagingDirectory The directory the package is assembled in.
 */
const copyContent = (stagingDirectory: string): void => {
    for (const entry of packageContent) {
        const source = join(projectRoot, entry);
        if (!existsSync(source)) {
            throw new Error(`Missing package content: ${entry}`);
        }

        cpSync(source, join(stagingDirectory, entry), {
            recursive: true,
            filter: (path) => {
                return !path.endsWith(".DS_Store");
            },
        });
    }
};

/**
 * Writes the manifest of the package, which only knows how to start the bundled server.
 *
 * @param stagingDirectory The directory the package is assembled in.
 */
const writePackageManifest = (stagingDirectory: string): void => {
    const repository = readManifest();
    const manifest: IPackageManifest = {
        name: "animada-score-book",
        version: repository.version,
        private: true,
        type: "module",
        engines: repository.engines,
        scripts: {
            start: "node server.js",
        },
    };

    writeFileSync(join(stagingDirectory, "package.json"), JSON.stringify(manifest, null, 4) + "\n", "utf-8");
};

/**
 * Fails the run when the staging directory holds local configuration or installed dependencies.
 *
 * @param stagingDirectory The directory the package was assembled in.
 */
const assertNoLocalContent = (stagingDirectory: string): void => {
    for (const entry of forbiddenContent) {
        if (existsSync(join(stagingDirectory, entry))) {
            throw new Error(`Refusing to package local content: ${entry}`);
        }
    }
};

/**
 * Packs the staging directory into a compressed archive next to it.
 *
 * @param stagingDirectory The directory the package was assembled in.
 * @param archivePath The archive to create.
 */
const createArchive = (stagingDirectory: string, archivePath: string): void => {
    execFileSync("tar", ["-czf", archivePath, "-C", outputRoot, basename(stagingDirectory)], {
        stdio: "inherit",
    });
};

if (!argv.includes("--skip-build")) {
    buildFrontend();
    await bundleServer();
}

if (!existsSync(join(projectRoot, "dist", "index.html")) || !existsSync(serverBundle)) {
    throw new Error("Build outputs are missing — run `npm run package` without `--skip-build` first.");
}

const { version } = readManifest();
const packageName = `animada-score-book-${version}`;
const stagingDirectory = join(outputRoot, packageName);
const archivePath = join(outputRoot, `${packageName}.tar.gz`);

rmSync(stagingDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });
copyContent(stagingDirectory);
cpSync(serverBundle, join(stagingDirectory, "server.js"));
writePackageManifest(stagingDirectory);
assertNoLocalContent(stagingDirectory);
createArchive(stagingDirectory, archivePath);

const sizeInMegabytes = (statSync(archivePath).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${archivePath} (${sizeInMegabytes} MB).`);
console.log("Unpack it, create backend-config.json, set JWT_SECRET, and start it with `node server.js`.");
