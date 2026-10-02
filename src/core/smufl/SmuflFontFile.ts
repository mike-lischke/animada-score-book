/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Reads which codepoints a font file maps, from its own character map.
 *
 * This is the ground truth behind the font check: the sidecar metadata only claims which glyphs a
 * font carries, while the character map proves it. OpenType fonts are read directly; WOFF2 fonts are
 * decompressed with Node's built-in Brotli, so no font library is needed.
 *
 * Node only, because of `node:fs` and `node:zlib`.
 */

import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

import { SmuflFontFormat } from "./SmuflFonts.js";

/** A contiguous run of codepoints a font maps to a glyph. */
interface ICodepointRange {
    first: number;
    last: number;
}

/** The value of a WOFF2 variable-length integer and the offset after it. */
interface IBase128Value {
    value: number;
    next: number;
}

/** A font file, readable for the codepoints its character map maps. */
export class SmuflFontFile {
    /** The format the file's signature identifies. */
    public readonly format: SmuflFontFormat;

    /**
     * In a WOFF2 table directory, tag index 0 is `cmap`, 10 is `glyf`, 11 is `loca`, and index 63
     * means an explicit tag follows.
     */
    private static readonly woff2CmapTagIndex = 0;
    private static readonly woff2GlyfTagIndex = 10;
    private static readonly woff2LocaTagIndex = 11;
    private static readonly woff2ExplicitTagIndex = 63;
    private static readonly woff2HeaderSize = 48;

    /** A WOFF2 transform version of 3 means the table is stored untransformed. */
    private static readonly woff2NoTransform = 3;

    private static readonly formatSignatures: Readonly<Record<SmuflFontFormat, readonly number[]>> = {
        [SmuflFontFormat.Woff2]: [0x774F4632],
        [SmuflFontFormat.OpenType]: [0x4F54544F, 0x00010000, 0x74727565],
    };

    private readonly ranges: readonly ICodepointRange[];

    private constructor(format: SmuflFontFormat, ranges: readonly ICodepointRange[]) {
        this.format = format;
        this.ranges = ranges;
    }

    /**
     * Reads a font file from disk.
     *
     * @param path The path of the font file.
     *
     * @returns The readable font.
     */
    public static read(path: string): SmuflFontFile {
        return SmuflFontFile.fromBytes(readFileSync(path));
    }

    /**
     * Reads a font from its bytes.
     *
     * @param data The font file's bytes.
     *
     * @returns The readable font.
     */
    public static fromBytes(data: Buffer): SmuflFontFile {
        const format = SmuflFontFile.detectFormat(data);
        const cmap = format === SmuflFontFormat.Woff2
            ? SmuflFontFile.extractCmapFromWoff2(data)
            : SmuflFontFile.extractCmapFromSfnt(data);

        return new SmuflFontFile(format, SmuflFontFile.readCodepointRanges(cmap));
    }

    /** @returns The number of codepoints the font maps. */
    public get codepointCount(): number {
        return this.ranges.reduce((total, range) => {
            return total + range.last - range.first + 1;
        }, 0);
    }

    /**
     * @param codepoint The codepoint to look for.
     *
     * @returns Whether the font maps the codepoint to a glyph.
     */
    public contains(codepoint: number): boolean {
        return this.ranges.some((range) => {
            return codepoint >= range.first && codepoint <= range.last;
        });
    }

    private static detectFormat(data: Buffer): SmuflFontFormat {
        const signature = data.readUInt32BE(0);
        for (const format of [SmuflFontFormat.Woff2, SmuflFontFormat.OpenType]) {
            if (SmuflFontFile.formatSignatures[format].includes(signature)) {
                return format;
            }
        }

        throw new Error(`the file is neither a WOFF2 nor an OpenType font (signature 0x${signature.toString(16)})`);
    }

    private static extractCmapFromSfnt(data: Buffer): Buffer {
        const tableCount = data.readUInt16BE(4);
        for (let i = 0; i < tableCount; i += 1) {
            const record = 12 + (i * 16);
            if (data.toString("latin1", record, record + 4) === "cmap") {
                const offset = data.readUInt32BE(record + 8);
                const length = data.readUInt32BE(record + 12);

                return data.subarray(offset, offset + length);
            }
        }

        throw new Error("the font has no cmap table");
    }

    private static extractCmapFromWoff2(data: Buffer): Buffer {
        const tableCount = data.readUInt16BE(12);
        const tables: Array<{ isCmap: boolean; length: number; }> = [];
        let offset = SmuflFontFile.woff2HeaderSize;

        for (let i = 0; i < tableCount; i += 1) {
            const flags = data[offset];
            offset += 1;

            const tagIndex = flags & 0x3F;
            let isCmap = false;
            let isTransformable = false;
            if (tagIndex === SmuflFontFile.woff2ExplicitTagIndex) {
                const tag = data.toString("latin1", offset, offset + 4);
                offset += 4;

                isCmap = tag === "cmap";
                isTransformable = tag === "glyf" || tag === "loca";
            } else {
                isCmap = tagIndex === SmuflFontFile.woff2CmapTagIndex;
                isTransformable = tagIndex === SmuflFontFile.woff2GlyfTagIndex
                    || tagIndex === SmuflFontFile.woff2LocaTagIndex;
            }

            const originalLength = SmuflFontFile.readBase128(data, offset);
            offset = originalLength.next;

            // Only glyf and loca can be transformed, so only they carry a transformed length: the
            // reference encoder writes transform bits of 0 for every other table, which must not be
            // mistaken for a transform.
            let length = originalLength.value;
            if (isTransformable && (flags >> 6) !== SmuflFontFile.woff2NoTransform) {
                const transformedLength = SmuflFontFile.readBase128(data, offset);
                offset = transformedLength.next;
                length = transformedLength.value;
            }

            tables.push({ isCmap, length });
        }

        const decompressed = brotliDecompressSync(data.subarray(offset));
        let tableOffset = 0;
        let cmap: Buffer | undefined;
        for (const table of tables) {
            if (table.isCmap) {
                cmap = decompressed.subarray(tableOffset, tableOffset + table.length);
            }

            tableOffset += table.length;
        }

        if (tableOffset !== decompressed.length) {
            throw new Error("the WOFF2 table directory does not match the decompressed data");
        }

        if (cmap === undefined) {
            throw new Error("the font has no cmap table");
        }

        return cmap;
    }

    /**
     * Reads a WOFF2 variable-length integer, which is limited to five bytes and must not have a
     * leading zero byte.
     *
     * @param data The font file.
     * @param start The offset to read from.
     *
     * @returns The value and the offset after it.
     */
    private static readBase128(data: Buffer, start: number): IBase128Value {
        let value = 0;
        for (let i = 0; i < 5; i += 1) {
            if (start + i >= data.length) {
                throw new Error("the WOFF2 table directory is truncated");
            }

            const byte = data[start + i];
            if (i === 0 && byte === 0x80) {
                throw new Error("a WOFF2 length has a leading zero byte");
            }

            if (value > 0x1FFFFFFF) {
                throw new Error("a WOFF2 length overflows");
            }

            value = (value * 128) + (byte & 0x7F);
            if ((byte & 0x80) === 0) {
                return { value, next: start + i + 1 };
            }
        }

        throw new Error("a WOFF2 length is longer than five bytes");
    }

    private static readCodepointRanges(cmap: Buffer): ICodepointRange[] {
        const subtableCount = cmap.readUInt16BE(2);
        let bestOffset = -1;
        let bestScore = 0;

        for (let i = 0; i < subtableCount; i += 1) {
            const record = 4 + (i * 8);
            const score = SmuflFontFile.unicodeEncodingScore(cmap.readUInt16BE(record),
                cmap.readUInt16BE(record + 2));
            if (score > bestScore) {
                bestScore = score;
                bestOffset = cmap.readUInt32BE(record + 4);
            }
        }

        if (bestOffset < 0) {
            throw new Error("the font's character map has no Unicode subtable");
        }

        const format = cmap.readUInt16BE(bestOffset);
        if (format === 12) {
            return SmuflFontFile.parseFormat12(cmap, bestOffset);
        }

        if (format === 4) {
            return SmuflFontFile.parseFormat4(cmap, bestOffset);
        }

        throw new Error(`the font's character map uses the unsupported subtable format ${format}`);
    }

    private static unicodeEncodingScore(platformId: number, encodingId: number): number {
        if (platformId === 3 && encodingId === 10) {
            return 3;
        }

        if (platformId === 0 && (encodingId === 4 || encodingId === 6)) {
            return 3;
        }

        if (platformId === 3 && encodingId === 1) {
            return 2;
        }

        if (platformId === 0) {
            return 1;
        }

        return 0;
    }

    private static parseFormat4(cmap: Buffer, offset: number): ICodepointRange[] {
        const segmentCount = cmap.readUInt16BE(offset + 6) / 2;
        const endCodes = offset + 14;
        const startCodes = endCodes + (segmentCount * 2) + 2;
        const deltas = startCodes + (segmentCount * 2);
        const rangeOffsets = deltas + (segmentCount * 2);
        const ranges: ICodepointRange[] = [];

        for (let i = 0; i < segmentCount; i += 1) {
            const last = cmap.readUInt16BE(endCodes + (i * 2));
            const first = cmap.readUInt16BE(startCodes + (i * 2));
            if (first === 0xFFFF) {
                continue;
            }

            const delta = cmap.readInt16BE(deltas + (i * 2));
            const rangeOffset = cmap.readUInt16BE(rangeOffsets + (i * 2));
            let rangeStart = -1;

            for (let code = first; code <= last; code += 1) {
                let glyph = 0;
                if (rangeOffset === 0) {
                    glyph = (code + delta) & 0xFFFF;
                } else {
                    const glyphOffset = rangeOffsets + (i * 2) + rangeOffset + ((code - first) * 2);
                    glyph = cmap.readUInt16BE(glyphOffset);
                    if (glyph !== 0) {
                        glyph = (glyph + delta) & 0xFFFF;
                    }
                }

                if (glyph !== 0 && rangeStart < 0) {
                    rangeStart = code;
                } else if (glyph === 0 && rangeStart >= 0) {
                    ranges.push({ first: rangeStart, last: code - 1 });
                    rangeStart = -1;
                }
            }

            if (rangeStart >= 0) {
                ranges.push({ first: rangeStart, last });
            }
        }

        return ranges;
    }

    private static parseFormat12(cmap: Buffer, offset: number): ICodepointRange[] {
        const groupCount = cmap.readUInt32BE(offset + 12);
        const ranges: ICodepointRange[] = [];

        for (let i = 0; i < groupCount; i += 1) {
            const group = offset + 16 + (i * 12);
            if (cmap.readUInt32BE(group + 8) !== 0) {
                ranges.push({ first: cmap.readUInt32BE(group), last: cmap.readUInt32BE(group + 4) });
            }
        }

        return ranges;
    }
}
