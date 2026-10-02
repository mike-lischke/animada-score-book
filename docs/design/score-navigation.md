# Innovative Score Navigation

- Status: draft (design proposal, not implemented yet)
- Related: #37 (umbrella issue), #18 (score library improvements)
- Scope: replaces the fixed folder tree of the score library with tags and virtual folders

## Why not a folder tree

Larger file collections usually follow the principle of nested folders. The folder names define a single ordering criterion
that the files (here: the scores) follow — and that ignores what a score actually is:

- A score can turn up under several criteria at once (instruments involved, date of appearance, source, set lists, and so on).
- A score can satisfy several criteria at the same time.
- Training programmes need to combine scores by criteria (for example all repi subidas and calls).

To do justice to this, scores should be organised through tags and virtual folders. There is no tree that prescribes a fixed
structure any more. Instead the user defines through tags which scores they want, and the matching scores are shown as a list.

## Navigation between lists

Every combination of tags is stored automatically as a list of its own, and forward/back navigation switches between these
lists (similar to pages in a browser). That collection of tag combinations is kept in the browser's `localStorage`, beyond
the session, and its size is set through an option of its own (the default should be 10).

When the limit is reached (10), the oldest **non-favourite** combination is deleted automatically, without any further
notification — favourites are never discarded this way. This implicitly defines an upper bound for the number of storable tag
combinations (100 for now), and the option is limited to the range from 0 to that bound. Should the browser no longer allow
storing further combinations, the oldest one is dropped again (or nothing is stored at all). The navigation arrows in the UI
reflect the current situation.

Both this history and the favourites (see below) live in the browser, so they belong to the browser and the device rather
than to the user account. Keeping them on the server would be a later step.

## Tags

On first start the application provides a list of predefined tags: the known instruments. Every score automatically gets the
tags of the instruments it uses, and those tags cannot be removed unless all tracks with that instrument are removed.

Once a tag exists, only administrators can delete it from the database. Deleting a tag also deletes all of its assignments to
scores. Assignments work through tag IDs, so renaming a tag becomes visible everywhere automatically.

## Display and assignment

What a user sees after the first start (anonymous users included) is the list of all stored scores they have read access to.
At the top of the page — the one shown in the score library drawer — there is a selector for tags (an instance of the
`TagInput` component). It allows creating tags for the selection by plain text input, and removing them again with the cross
button.

Assigning and removing tags is only possible in edit mode, so it requires the corresponding permissions — except for the
implicitly assigned instrument tags. All tags appear as a horizontal list above the score title once a score is loaded. Each
tag has a colour of its own, which can be changed wherever tags can be edited. That first colour is chosen automatically when
the tag is created and is stored in the backend together with the tag name.

## Permissions (deliberately deferred)

Tags would really need permission control of their own (so that anonymous users cannot see internal names of songs, for
example), but the first implementation is meant to stay simple: for now all tags are public property. For public scores one
should therefore choose tags carefully.

## Favourites

The lists that result from selecting tags are volatile: everything beyond the configurable number of tag combinations
disappears for good. The library area of the score library page (the drawer) is therefore split vertically. In the lower,
smaller part the user can keep favourites by drag and drop, rendered as slots — fields with dashed borders. It must be
possible to drag the tag combination defined at the top of the page into a slot, with a confirmation if the slot is already
taken. Each slot gets a button in one of its corners to clear it; on the desktop those buttons only appear on mouse hover, on
mobile devices they are always visible.

Note: this drag and drop is not the dragging of score entities (bars, tracks, note groups, notes) that was dropped for the
score editor — it is about dragging a tag combination into a slot.

The favourites are stored in the browser's `localStorage` as well, but as an entity of their own (independent of the settings
and the app state), which allows saving them often without having to replace all other values each time. A favourite has to
be restored exactly, so a tag combination is stored as a structure — including whether its tags were combined with AND or OR
— and not as a flat list of tags.

## Tag combinations

Composing the tags needs a new editor that can combine tags through an AND link (to narrow a larger set of scores down) as
well as through an OR link (to combine several sub-lists).
