# BrainSTEM Pilot

A web-based trajectory planner for FRC/FTC robots that lets you visually build smooth Bezier paths, set holonomic rotation targets, and place mid-path subsystem action markers. It automatically exports clean path and auto json files ready for your robot code.

**Live app:** [keerthanavisveish.github.io/Brainstem-Pilot-UI](https://keerthanavisveish.github.io/Brainstem-Pilot-UI)

## What it does

BrainSTEM Pilot is a visual editor for building autonomous routines instead of hand-writing waypoint coordinates:

- **Path editor** — click to place waypoints, drag Bezier control handles to shape the trajectory, and set start/end headings with rotation dots.
- **Rotation targets** — schedule heading changes at any point along a path, independent of the drive path itself (for holonomic drivetrains).
- **Subsystem triggers** — mark a point in the path where a subsystem command (e.g. raise elevator, run intake) should fire, previewed as stars on the canvas.
- **Constraints** — override max velocity/acceleration per path, or per waypoint (min/max speed, max turn power, distance/heading tolerance, time limits).
- **Skeleton & variant autos** — build a reusable command skeleton (path slots, subsystem commands, waits, parallel groups), then create multiple runnable variants that fill in different paths/waits without redefining the sequence.
- **Simulator** — play back a variant auto on the field, toggle Left/Right and Blue/Red alliance perspective, and scrub through the command list.
- **Path duplication** — copy a path to the same side or mirror it across the field midline (auto-flips L/R).

Everything (robot settings, app settings, subsystem config, paths, skeletons, variants) is saved as plain JSON files in a project folder on your computer, so it can be committed to your robot code repo like any other source file.

## Getting started

1. In your FRC/FTC codebase, create a folder: `deploy/brainstemPilotAuto/` in FRC or just `brainstemPilotAuto` in FTC
2. Open the app and click **Open Project** (top-right) — requires Chrome or Edge (uses the File System Access API).
3. Select that folder. Default files are created for you: `robot_settings.json`, `app_settings.json`, `subsystem_config.json`, plus `paths/`, `skeletons/`, and `variants/` subfolders.
4. Open **Settings**:
   - **Robot Settings** — set frame width/length, default max velocity/acceleration, and physical subsystem attachments. New paths inherit these until overridden.
   - **App Settings** — pick the season field image used across the path editor, path previews, and simulator.
5. (Optional) Open **Configure Subsystems** to define mechanisms and commands before adding subsystem triggers to a path.
6. From the home screen, **Create a Path** to start building trajectories, or go to **Skeleton Builder** to assemble a reusable auto sequence and generate variants from it.
7. Commit `deploy/brainstemPilotAuto/` to git so the whole team shares paths and autos.

The in-app **Documentation** page (linked top-left) covers the path editor, waypoints/Bezier curves, optional per-waypoint parameters, rotation targets, subsystem triggers, and the skeleton/variant workflow in more detail, with screenshots.