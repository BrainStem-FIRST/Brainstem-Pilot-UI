# Autos

An Auto is a single ordered **sequence** of slots, saved as one self-contained file in `autos/`. What you see in the list is what runs.

![Auto workspace](/auto-workspace.png)

Older versions split an Auto into a shared *skeleton* plus a *variant*. That is gone. Opening an old project migrates it automatically and files the originals under `legacy/`.

## Slot types

- **Path** — drives a saved path. Click its name in the list to rename it; the rename follows into every Auto that uses it.
- **Point** — drives to a saved field position.
- **Subsystem** — runs one command on one subsystem, then moves on.
- **Wait** — pauses for a number of seconds.
- **Parallel** — runs several sub-commands at once.

## Working with the sequence

- Drag from the palette to insert, or drag a slot by its grip to reorder.
- **Skip** takes a slot out of the run without deleting it.
- Selecting a Path or Point slot opens it on the field for editing.
- Undo and redo cover the sequence *and* the shared paths and points.

Autos cannot share a name — the filename comes from the name.

## Points

A Point is a saved pose — position and heading — that you can drop into any Auto. Like paths, points are **shared**. Heading belongs to the Point, not the slot. If you need two headings, make two Points.

A path ending into a Point is **not** joined to it — the robot drives a connecting segment. A path that comes *after* a Point starts on it, heading included.

## How slots connect

Only **Path** and **Point** slots have a position. Subsystem, Wait and Parallel slots pass the current pose through.

- The first positional slot starts wherever it was drawn.
- Every other joint is **live**: drag a path's end and the next path's start moves with it, and that change is written into the next path's file.
- Reordering can leave a gap. The slot is flagged with a warning rather than having its path silently dragged.

## Warnings

![Warnings on unfinished slots](/warnings.png)

A hazard triangle marks a slot that would not do what you meant. It is a warning, not an error — nothing blocks saving.

Typical causes: missing subsystem/command, a renamed command, a missing path, a 0s wait, or a start that does not match the previous slot's end.

## Simulate

Playback lives in the Auto workspace. The bar along the bottom plays the whole sequence.

- **Play / Stop / Replay**, plus a scrubber.
- Each slot shows its own duration; the bar shows elapsed and total time.
- **Blue / Red** and, in FRC, **L / R** change the preview only — saved coordinates never move.

## Subsystems

![Configure Subsystems](/subsystem-config.png)

Define mechanisms, commands, and visual bindings from the home screen. Bindings show or hide robot overlays during simulation. Command names must match robot-side `PilotRegistry` keys.
