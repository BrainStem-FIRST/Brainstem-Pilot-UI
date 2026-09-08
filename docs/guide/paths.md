# Paths

Paths are standalone trajectories you drop into an Auto. Each path is a sequence of waypoints connected by smooth Bézier curves, saved as its own file and **shared** — the same path can appear in several Autos, and editing it changes all of them.

You do not create paths from the home screen. Add them from an Auto: palette **Path → New Path**, or pick an existing path to reuse.

The **Path & Point Index** (home → **Paths & Points**, or **Path & Point Index** from the Auto list) lists every saved path and point, with field thumbnails and which Autos use them. Rename or delete there and every Auto that references the record follows along. Hover a thumbnail and choose **Edit on field** to open the chrome-free pose editor.

![Path & Point Index](/paths-list.png)

## Start side

Each path has an **L / R** start-side flag in the path editor toolbar. This is metadata only — it does not move your waypoints. It tells robot code which side of the field the path was designed for. Playback can preview the opposite side without changing saved coordinates.

## Folders

Use **New Folder** in the Auto list or the Path & Point Index to group records. Move a record with the folder dropdown on its card.

Folders are labels, not directories. Every record stays in its own flat file under `autos/`, `paths/` or `points/` and simply carries a `folder` name. Deleting a folder moves its contents to **Unfiled**; it never deletes records.
