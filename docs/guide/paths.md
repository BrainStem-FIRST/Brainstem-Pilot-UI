# Paths

Paths are standalone trajectories you drop into an Auto. Each path is a sequence of waypoints connected by smooth Bézier curves, saved as its own file and **shared** — the same path can appear in several Autos, and editing it changes all of them.

![Path & Point Index](/paths-list.png)

## Creating a path

Home → **Paths & Points** → **New Path**. Choose whether the path starts on the **Left (L)** or **Right (R)** side. This is metadata only — it does not move your waypoints.

The L/R flag tells your robot code which side of the field the path was designed for. The simulator can mirror display for the opposite side without changing saved coordinates.

## Duplicating

Hover a path card → copy icon → choose **Same Side** or **Opposite Side** (mirrors geometry across the field horizontal midline and flips L↔R).

## Folders

Use **New Folder** in the Auto list or the Path & Point Index to group records. Move a record with the folder dropdown on its card.

Folders are labels, not directories. Every record stays in its own flat file under `autos/`, `paths/` or `points/` and simply carries a `folder` name. Deleting a folder moves its contents to **Unfiled**; it never deletes records.
