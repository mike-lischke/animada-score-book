/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/** Manipulates the favicon to indicate a dirty state. */
export class FaviconDirtyService {
    private static baseHref: string | null = null;
    private static dirtyHref: string | null = null;

    public static async setDirty(isDirty: boolean) {
        this.baseHref ??= document.querySelector<HTMLLinkElement>("link[rel*='icon']")?.href ?? null;
        if (!this.baseHref) {
            // No base favicon found, can't do anything.
            return;
        }

        if (!isDirty) {
            this.setFaviconHref(this.baseHref);

            return;
        }

        this.dirtyHref ??= await this.createDirtyFavicon();

        const dirtyHref = this.dirtyHref;
        this.setFaviconHref(dirtyHref);
    }

    private static async createDirtyFavicon(): Promise<string> {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = this.baseHref!;

        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                resolve();
            };
            img.onerror = () => {
                reject(new Error("Failed to load favicon"));
            };
        });

        const canvasSize = 32;
        const canvas = document.createElement("canvas");
        canvas.width = canvasSize;
        canvas.height = canvasSize;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("No 2D context");
        }

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;

        // Scale the image to fit the canvas while preserving aspect ratio.
        const scale = Math.min(canvasSize / iw, canvasSize / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (canvasSize - dw) / 2;
        const dy = (canvasSize - dh) / 2;

        // Draw the base favicon centered on the canvas.
        ctx.drawImage(img, dx, dy, dw, dh);

        // Draw a red circle at the bottom right relative to the canvas size.
        const r = Math.round(canvasSize * 0.22);
        const cx = canvasSize - r;
        const cy = canvasSize - r;

        ctx.beginPath();
        ctx.fillStyle = "#ff3b30";
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        return canvas.toDataURL("image/png");
    }

    private static setFaviconHref(href: string) {
        let link = document.head.querySelector<HTMLLinkElement>("#app-favicon");

        if (!link) {
            link = document.createElement("link");
            link.id = "app-favicon";
            link.rel = "icon";
            document.head.appendChild(link);
        }

        link.href = href;
    }
}
