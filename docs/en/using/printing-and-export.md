# Printing, PDF and MP3 Export

Two outputs leave the application: paper, through the browser's print dialog, and an audio file. The print preview is the place where the sheet is arranged; the MP3 export takes the current playback state.

## Opening the Print Preview

`Print` in the header (tooltip `Print / Export to PDF`) opens the preview in place of the score. `Ctrl`/`Cmd`+`P` does the same and replaces the browser's own print dialog. `Escape` closes the preview and returns to the score with its settings intact.

## Page Setup

The preview controls arrange the sheet:

| Control     | Values                                                     |
| ----------- | ---------------------------------------------------------- |
| Orientation | `Portrait` or `Landscape`, both on A4 paper                |
| Borders     | One value per side, from −5 mm to 50 mm in steps of 5      |
| Print scale | 10 % to 200 %, default 45 %                                |
| Tracks      | `Tracks n/m` with a track dropdown and `Select All Tracks` |

The print scale decides how large the notation appears on paper. Negative border values are intentional: they let a page use more of the paper than the printer's own margin would allow, which some printers accept.

`Reset the print settings` restores the defaults, and `Close the preview (ESC)` leaves it.

## Bar Widths in the Preview

The preview shows the same bar widths as the staff view. Dragging a barline handle changes how wide that bar is printed; the tooltip reads `Drag to change the printed width. Double-click to restore the score width.` `Reset widths` restores all of them at once.

## Preview Zoom and Pages

The preview zooms independently of the print scale:

- Zoom out and zoom in between 10 % and 400 %.
- `Fit width` and `Fit page` choose a zoom that makes the sheet fit.
- `Previous page` and `Next page` move through the pages.

Preview zoom affects only what you see on screen; the printed result follows the print scale.

## Printing and Saving a PDF

`Print` in the preview toolbar, tooltip `Print or save as PDF`, opens the browser's print dialog. For a result that matches the preview:

1. Choose A4 as the paper size.
2. Choose the same orientation as in the preview.
3. Set the browser's scale to 100 %, because the print scale already sizes the notation.
4. Disable browser headers and footers; the document brings its own margins, title, and page numbers.

Choosing the PDF printer in that dialog produces the PDF file. The application does not generate a PDF itself, so the result depends on the browser's print engine.

## Exporting an MP3

`Export` in the header (tooltip `Export as MP3`) renders the current playback state to a file named `<score title>.mp3`:

- A progress dialog stays open while the file is rendered.
- The export follows the playback settings, so tempo, per-track volumes, and the count-in are audible in the file.
- Looping is ignored, and there is no way to export only a Play Focus range.
- On phones the file is offered through the system's share sheet; everywhere else the browser downloads it.
- If the browser cannot encode MP3, or rendering fails, the application reports `The MP3 could not be exported. Please
  try again.`

## What the Output Cannot Do

- There is no PDF generation inside the application; PDF comes from the browser's print dialog.
- MP3 export needs the browser's MP3 encoding support, which is why it is documented for Chromium.
- A print result can differ from the preview when the browser adds its own margins, headers, or a different scale.

[Troubleshooting and Known Limitations](../troubleshooting.md) lists these as known limitations.

## Related Chapters

- [Reading a Score](presentation.md) explains music fonts and zoom.
- [Playback and Practice](playback.md) explains tempo, mixer, and count-in, which the MP3 export uses.
- [Editing in the Staff View](staff-editing.md) covers bar widths in the score itself.
