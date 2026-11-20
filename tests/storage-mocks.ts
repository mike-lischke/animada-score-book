/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * The browser storage mocks the setup file installs on `window`.
 *
 * They live in a module of their own because the test files share the module graph when the runner does not isolate
 * them. `AppStorage` resolves the storages once and keeps the handle, so it points at the instances this module
 * creates. The setup file, in contrast, runs once per test file: a pair created there would be a new object for every
 * file, while the handle of `AppStorage` stayed on the pair of the first file, and a test would read a storage nothing
 * writes to any more.
 *
 * Specs that call `vi.resetModules` make the runner evaluate this module again. The pair therefore lives on the global
 * object, so a second evaluation hands out the instances the first one created instead of a pair that the handle of
 * `AppStorage` never sees.
 */
export class StorageMock implements Storage {
    private data = new Map<string, string>();

    public get length(): number {
        return this.data.size;
    }

    public clear(): void {
        this.data.clear();
    }

    public getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    public key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null;
    }

    public removeItem(key: string): void {
        this.data.delete(key);
    }

    public setItem(key: string, value: unknown): void {
        this.data.set(key, String(value));
    }
}

/** The globals this module adds to: the pair of doubles, shared by the files of one worker. */
type StorageGlobal = typeof globalThis & { asbStorageMocks?: { local: StorageMock; session: StorageMock; }; };

const storageGlobal = globalThis as StorageGlobal;

export const localStorageMock = storageGlobal.asbStorageMocks?.local ?? new StorageMock();
export const sessionStorageMock = storageGlobal.asbStorageMocks?.session ?? new StorageMock();

storageGlobal.asbStorageMocks = { local: localStorageMock, session: sessionStorageMock };
