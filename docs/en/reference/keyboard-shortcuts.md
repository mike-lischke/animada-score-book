# Keyboard Shortcuts

The application listens to a small set of keys, and each of them belongs to a context. Typing in a text field always wins; the score keys only work while the score area has the focus.

## Global Shortcuts

| Key                      | Action                                                                   | Available                          |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------- |
| `Ctrl`/`Cmd`+`S`         | Save the score                                                           | In edit mode                       |
| `Ctrl`/`Cmd`+`P`         | Open the print preview instead of the browser's print dialog             | Always                             |
| `Ctrl`/`Cmd`+`C`         | Copy the selection                                                       | Always                             |
| `Ctrl`/`Cmd`+`X`         | Cut the selection                                                        | In edit mode                       |
| `Ctrl`/`Cmd`+`V`         | Paste the clipboard                                                      | In edit mode                       |
| `G`                      | Switch to the grid view                                                  | Always                             |
| `S`                      | Switch to the staff view                                                 | Always                             |
| `Ctrl`/`Cmd`+`Z`         | Undo                                                                     | Outside Zen mode                   |
| `Ctrl`/`Cmd`+`Shift`+`Z` | Redo                                                                     | Outside Zen mode                   |
| `Ctrl`+`Y`               | Redo on Windows                                                          | Outside Zen mode                   |
| `Escape`                 | Close the topmost dialog, menu, or drawer; otherwise clear the selection | Outside Zen mode for the selection |

`G` and `S` only react to the bare key, without `Ctrl`, `Cmd`, `Alt`, or `Shift`, so they do not clash with browser shortcuts. `Ctrl`+`Y` is deliberately not accepted with `Cmd`: Safari and Chrome attach their own meaning to it.

## Score Input

| Key                               | Action                                                         | View  |
| --------------------------------- | -------------------------------------------------------------- | ----- |
| `1` … `9`                         | Enter the note style at that position of the instrument's list | Both  |
| `0`                               | Enter a rest at the cursor                                     | Both  |
| `Alt`/`Cmd`+`1` … `Alt`/`Cmd`+`6` | Set the note length from whole to thirty-second                | Staff |
| `Alt`/`Cmd`+`.`                   | Toggle the dot of the current note value                       | Staff |
| `O`                               | Overwrite entry mode                                           | Staff |
| `I`                               | Insert entry mode                                              | Staff |
| `Delete`                          | Remove the note or rest at the cursor                          | Both  |
| `Backspace`                       | Remove the note or rest before the cursor                      | Both  |
| Arrow keys                        | Move the cursor to the neighbouring note, rest, or grid cell   | Both  |

The grid view always works in overwrite mode, so `O` and `I` have no effect there. The note length keys apply only where lengths exist, which is the staff view.

## Selection

- Click selects a note or a cell; `Shift`-click adds to the selection.
- Dragging selects the elements a rectangle covers.
- Arrow keys move the cursor; they replace the selection with the neighbouring element.
- `Escape` clears the selection when no dialog is open and Zen mode is off.

## Dialogs and Menus

- `Escape` closes the topmost dialog; a dialog that allows it also closes on a click outside.
- `Enter` activates the dialog's primary action, as long as the focus is not inside a text field, a select, or a button.
- Menus and dropdowns are pointer-driven; there is no keyboard navigation of their entries.

## Related Chapters

- [Editing in the Staff View](../using/staff-editing.md) explains the workflows behind the score input keys.
- [Editing in the Grid View](../using/grid-editing.md) covers the raster and the note style bar.
- [Reading a Score](../using/presentation.md) describes the views the `G` and `S` shortcuts switch between.
