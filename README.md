<p align="center">
  <img src=".github/assets/logo.png" alt="" width="128" />
</p>

<h1 align="center">BrainSTEM Pilot</h1>

<p align="center">
  <a href="https://brainstem-first.github.io/Brainstem-Pilot-UI/"><b>Live app</b></a>
  ·
  <a href="https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/"><b>Docs</b></a>
  ·
  <a href="https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/releases/latest"><b>Download for desktop</b></a>
</p>

A trajectory planner for FRC/FTC robots. Draw Bezier paths, set holonomic rotation targets, and place mid-path subsystem markers — then export JSON (and FTC OpModes) for robot code. Runs in the browser or as a desktop app for macOS, Windows, and Linux.

![The auto workspace: a command list on the left, the field with a live trajectory in the middle, and per-path constraints on the right.](.github/assets/auto-workspace.png)

**[Docs](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/)** · **[Install the app](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/install/app)** · **[FTC library](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/install/ftc)** · **[FRC library](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/install/frc)**

## Why BrainSTEM Pilot?

Autonomous pathing in FTC and FRC usually means trajectory math, custom kinematics, and a local toolchain before the robot moves — and without playback, acceleration violations and waypoint issues show up on hardware.

BrainSTEM Pilot keeps the loop in one editor: draw the path, watch the footprint, and get a time estimate before deploy. Rookie teams can field a working auto the same afternoon; competitive teams still get per-waypoint limits, holonomic rotation targets, subsystem triggers, parallel groups, and one-click mirroring.

### How it compares

| Feature | ⭐ **BrainSTEM Pilot** | Choreo | PathPlanner | Pedro Pathing | Road Runner |
| --- | :---: | :---: | :---: | :---: | :---: |
| Cross-system (FTC & FRC) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bézier curve drive trajectories | ✅ | ❌ | ✅ | ✅ | ❌ |
| Execution time estimates | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor-side mirroring (1 path → 4 paths) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Footprint that changes with mechanism state | ✅ | ❌ | ❌ | ❌ | ❌ |
| Subsystems and commands defined in the tool | ✅ | ❌ | ✅ | ❌ | ❌ |
| Built-in simulator or playback | ✅ | ✅ | ✅ | ✅ | ❌ |

## What it does

Visual editor for autos, saved as plain JSON in a project folder you can commit with robot code:

- **Paths** — waypoints, Bezier handles, headings, holonomic rotation targets, and mid-path subsystem triggers
- **Constraints** — max velocity/acceleration per path or waypoint
- **Autos** — sequence paths, points, waits, subsystem commands, and parallel groups; play them back on the field
- **Mirroring** — copy a path to the same side or mirror across the field midline (auto-flips L/R)

FTC projects also generate a matching Java OpMode per auto.

## Web or desktop?

Both run the same code and the same project files, so a folder created in one opens in the other.

| | Web | Desktop |
| --- | --- | --- |
| Install | none — [open the link](https://brainstem-first.github.io/Brainstem-Pilot-UI/) | [download an installer](https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/releases/latest) |
| Browser requirement | Chrome or Edge (File System Access API) | none, it ships its own |
| Works offline | no | yes |
| Updating | automatic | download a new release |

The desktop builds are **not code-signed**, so the OS warns on first launch:

- **macOS** — after dragging it to Applications, run:
  ```bash
  xattr -cr "/Applications/BrainSTEM Pilot.app"
  ```
  Or right-click the app and choose *Open*, then *Open* again. If macOS still refuses, allow it under *System Settings → Privacy & Security*.
- **Windows** — click *More info → Run anyway* on the SmartScreen prompt.

> Projects made with an older version stored autos as a *skeleton* plus *variants*. Opening one migrates it into `autos/` automatically and files the originals under `legacy/`; nothing reads them afterwards.

**[View the docs](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/)**
