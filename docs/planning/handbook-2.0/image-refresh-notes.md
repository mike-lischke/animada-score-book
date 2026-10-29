# Image Refresh Notes

- Status: resolved 2026-10-29; the checklist variant was chosen
- Scope: which captures have to be redone when the application version changes
- Belongs to: Phase 6 of issue #62, validating the release candidate

## Where the version shows up

`package.json` holds the version, `vite.config.ts` passes it to the application as `appVersion`, and the footer shows it in two places: `v<version>` on the release-notes button and `Version <version>` in the compact footer menu. The release-notes dialog repeats it in the heading of its newest entry.

Text places are found with a grep for the previous version number across `readme.md`, `docs/` and `release-notes.md`. Images are not: the version is baked into their pixels, and no link or asset check sees it. The list of affected captures is kept by hand.

## Decision

**Checklist (2026-10-29).** The list of captures lives in the [storyboard](screenshot-storyboard.md#version-dependent-captures) and counts as a retake trigger there. The release checklist in [documentation.md](../../en/development/documentation.md) re-captures those images and greps the documentation for the previous version. A capture script was rejected for now: it would have to reproduce the capture context the storyboard records, and the checklist covers the nine captures with less machinery.

The nine captures were re-shot for 2.0.0 on 2026-10-29; the storyboard records the capture status.
