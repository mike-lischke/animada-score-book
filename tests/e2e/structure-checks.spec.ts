/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { ensureGridMode, routeApi } from "./e2e-test-helpers.js";

/* cspell:disable */
const iBreakQuery = "t=Beija%20Flor%202004%20-%20Bossa%202%20(%22I-Break%22)" +
    "&a2=4-4.100.11.1-4.16.0eLNZGdzHEukDW9iGstavnTEZUV~gx4QgRGV2ig2i-AG0BSC8_NqZz1YtDPGa" +
    ".158qP0XXR2KFVaHV84dLQ4di6C~_Ts0FbjnisDTPZgLnroRU" +
    ".2dZ2OpKo50EqVkKFk2FC7IXGgwUu_eARKL6M7ox~mTQ-iiWslWxOwWg~~12" +
    ".3avauavauavauavauavauavauavauavauavauavauavauavauavauavauavauavau8o8o8rR6avauavauavauavau" +
    ".5u8i8jex4f0UkFPcfCKddB~zWd9cyoyAcQet8gNFJV~kdqGZEn42xpgq0WlLsJsZ9yKx3" +
    ".71FWocgPOxWBZDTBGyXUo3YpiP0xvlLX4_wmzM71D-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
    ".81UEKcy2prthJcmKyWqDRGNc~GnCuDIJ~EQ~lPBv_Q-8w06YquxgSrTHpBtZbZOpPc7zrkC" +
    ".91vkkI9HbCqb9Pm42rNj_sLroJbVPl0NDRujYBCwC-8w06YquxgSrTHpBtZbZOpPc7zrkC";
/* cspell:enable */

const iBreakImportPath = `/?${iBreakQuery}`;

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Beija Flor I-Break: Agogô DOM structure", () => {
    test("bar 4 renders two 6:8 tuplet subdivision containers", async ({ page }) => {
        await page.goto(iBreakImportPath);
        await expect(page.locator("#trackViewerHost")).toBeVisible();
        await ensureGridMode(page);
        await expect(page.locator(".grid-measure-row").first()).toBeVisible();

        const bar4Dom = await page.evaluate(() => {
            const row = document.querySelectorAll(".grid-measure-viewer")[3]
                .querySelector(".grid-measure-row");
            if (!row) {
                return null;
            }

            return Array.from(row.children)
                .filter((c) => {
                    return !c.classList.contains("grid-beat-overlay");
                })
                .map((child) => {
                    if (child.classList.contains("subdivision")) {
                        return {
                            type: "subdivision",
                            childCount: child.children.length,
                        };
                    }

                    return { type: "step" };
                });
        });

        expect(bar4Dom).not.toBeNull();
        if (!bar4Dom) {
            throw new Error("Bar 4 grid row not found");
        }

        // Agogô bar 4: 12 steps across two 6:8 tuplets. Expected: 2 subdivision containers, each with 6 notes.
        expect(bar4Dom).toHaveLength(2);
        expect(bar4Dom[0]).toEqual({ type: "subdivision", childCount: 6 });
        expect(bar4Dom[1]).toEqual({ type: "subdivision", childCount: 6 });
    });
});
