# Editing in the Grid View

The grid view is the fast lane for rhythm: one cell per step, one symbol per cell. It is the better view for entering patterns quickly, and the staff view is the better one for detail. Both edit the same score.

## The Raster

The grid divides every bar into fixed steps:

- A score created in the application uses 16 steps per bar in 4/4, 6 in 6/8, 10 in 5/4, and 7 in 7/8.
- One cell covers exactly one step and holds at most one note or rest.
- Each cell draws the symbol of its note style, colored with the track's color.

Because the raster is fixed, a note in the grid always starts on a step and always has a length the raster can express. The staff view has no such limit.

![Two bars of the grid view with accent and ghost cells](../../images/en/grid-editing/grid-cells.png)

*Two bars in the grid: one symbol per step, colored per track. The smaller symbols in the rounded cells are ghost notes and weak strokes.*

## Entering and Removing Notes

1. Click a cell to place the cursor, or move the cursor with the arrow keys.
2. Press `1` to `9` for the note style in that position of the instrument's list, or use the note style buttons of the
   toolbar.
3. A selected note value applies to the note you enter; it is shortened to the free space before the next note.

A cell without content shows nothing. `0` turns the cell at the cursor into a rest, and `Delete` or `Backspace` removes the note or rest there.

## Note Styles

Both views offer note styles in the same place: the note style section of the toolbar above the score, or the number
keys for the addressed track. The grid adds no menu of its own, so a right-click on a cell has no action.

## Which Controls the Grid Offers

The grid keeps the controls that its raster can honour and hides the rest:

| Control                             | In the grid view | Why                                     |
| ----------------------------------- | ---------------- | --------------------------------------- |
| Note style and technique            | available        | Every cell holds one style              |
| Articulations                       | available        | A mark on the note in the cell          |
| Note value / duration               | hidden           | The raster decides the possible lengths |
| `Entry` mode (`Overwrite`/`Insert`) | hidden           | The grid always overwrites              |
| Dynamics                            | hidden           | Only the staff view places dynamics     |

## Selecting

- Click a cell to select it.
- Drag a rectangle to select the cells it covers.
- `Shift`-click adds cells to the selection.
- `Escape` clears the selection.

A selection is the input for the toolbar: choosing a note style applies it to the selected cells, and choosing an articulation marks the selected notes.

## Subdivisions in the Grid

A subdivision occupies a cell and shows its sub-steps inside it. Two rules follow from that:

- Inside a subdivision, each slot is addressed on its own, and the cell's own length no longer applies.
- An empty subdivision is removed with `Delete` or `Backspace`; a subdivision that still holds notes has to be emptied
  first.

[Editing in the Staff View](staff-editing.md) explains the ratios, nesting, and the three ways of pasting a copied subdivision.

## What the Grid Cannot Do

Some things exist only in the staff view, because they need more room than a cell:

- Free note values that do not fit the raster.
- Bar widths, which are adjusted by dragging a barline.
- Dynamics such as crescendo, decrescendo, and forte.
- The one-bar repeat (simile), which belongs to a track piece in the staff view.

If a change needs one of these, switch to the staff view and back; both views show the same score.

## Switching Views during a Session

`Grid` and `Staff` in the mode bar, or the keys `G` and `S`, switch at any time. Playback continues, the score stays loaded, and unsaved changes stay unsaved — nothing is lost by looking at the score from the other side.

## Related Chapters

- [Editing in the Staff View](staff-editing.md) covers note values, articulations, subdivisions, dynamics, and the
  clipboard.
- [Reading a Score](presentation.md) explains what each view is good for.
- [Playback and Practice](playback.md) explains Play Focus, which the grid uses as well.
