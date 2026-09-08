# Autos

An Auto is a single ordered **sequence** of slots, saved as one self-contained file in `autos/`. What you see in the list is what runs.

From home, open **Autos**. The page title is **Build an Auto**. Use **New Auto**, **New Folder**, or jump to the **Path & Point Index**. Cards show a field thumbnail, slot count, folder picker, duplicate, rename, and delete.

![Auto list](/autos-list.png)

Older versions split an Auto into a shared *skeleton* plus a *variant*. That is gone. Opening an old project migrates it automatically and files the originals under `legacy/`.

## The workspace

![Auto workspace](/auto-workspace.png)

The sequence is on the left, the field in the middle, and the selected slot's settings on the right. The palette above the sequence is **Path**, **Point**, **Subsystem**, **Wait**, and **Parallel**. Drag a chip onto the list, or click it to append.

## Slot types

- **Path** — drives a saved path. **Path → New Path** creates one; picking a name reuses a shared path. Click the path name in the list to rename it.
- **Point** — drives to a saved field position. **Point → New Point** creates one.
- **Subsystem** — runs one command on one subsystem, then moves on.
- **Wait** — pauses for a number of seconds.
- **Parallel** — runs several sub-commands at once.

## Working with the sequence

- Drag from the palette to insert, or drag a slot by its grip to reorder.
- **Skip** takes a slot out of the run without deleting it.
- Selecting a Path or Point slot opens it on the field for editing.
- Undo and redo cover the sequence *and* the shared paths and points.

Autos cannot share a name — the filename comes from the name. Duplicate an Auto from the list with the copy icon (`Name_Copy`).

## Points

A Point is a saved pose — position and heading — that you can drop into any Auto. Like paths, points are **shared**. Heading belongs to the Point, not the slot. If you need two headings, make two Points.

A path ending into a Point is **not** joined to it — the robot drives a connecting segment. A path that comes *after* a Point starts on it, heading included.

## How slots connect

Only **Path** and **Point** slots have a position. Subsystem, Wait and Parallel slots pass the current pose through.

- The first positional slot starts wherever it was drawn.
- Every other joint is **live**: drag a path's end and the next path's start moves with it, and that change is written into the next path's file.
- Reordering can leave a gap. The slot is flagged with a warning rather than having its path silently dragged.

## Warnings

<div class="with-shot">
<figure>

![Warnings on unfinished slots](/warnings.png)

</figure>

<div>

A hazard triangle marks a slot that would not do what you meant. It is a warning, not an error — nothing blocks saving.

Typical causes: missing subsystem/command, a renamed command, a missing path, a 0s wait, or a start that does not match the previous slot's end.

</div>
</div>

## Simulate

Playback lives in the Auto workspace — press **Play**. The bar along the bottom plays, pauses, restarts, and scrubs. **Back to Edit** returns you to the sequence.

- Each slot shows its own duration; the bar shows elapsed and total time.
- **Blue / Red** change the preview only — saved coordinates never move.
- On FRC, **Left / Right** also preview the opposite start side without writing it. FTC has no start-side toggle.

<div class="shot-stack">
<figure>

![FRC auto playback with Left/Right and Blue/Red toggles](/frc-simulate.png)

<figcaption>FRC — <strong>Left / Right</strong> plus <strong>Blue / Red</strong>. The field is wide; the preview mirrors without changing saved coordinates.</figcaption>
</figure>
<figure>

![FTC auto playback with Blue/Red toggle](/ftc-simulate.png)

<figcaption>FTC — <strong>Blue / Red</strong> only. The field is closer to square, so the canvas is taller relative to its width.</figcaption>
</figure>
</div>

## Subsystems

![Configure Subsystems](/subsystem-config.png)

From home, open **Subsystems**. Define mechanisms, commands, and visual bindings. Bindings show or hide robot overlays during simulation. Command names must match robot-side `PilotRegistry` keys.
