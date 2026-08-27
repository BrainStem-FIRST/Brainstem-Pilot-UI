<p align="center">
  <img src=".github/assets/logo.png" alt="" width="128" />
</p>

<h1 align="center">BrainSTEM Pilot</h1>

<p align="center">
  <a href="https://brainstem-first.github.io/Brainstem-Pilot-UI/"><b>Live app</b></a>
  ·
  <a href="https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/releases/latest"><b>Download for desktop</b></a>
  ·
  <a href="#why-brainstem-pilot"><b>Why BrainSTEM Pilot</b></a>
</p>

A trajectory planner for FRC/FTC robots that lets you visually build smooth Bezier paths, set holonomic rotation targets, and place mid-path subsystem action markers. It automatically exports clean path and auto json files ready for your robot code. Runs in the browser or as a desktop app for macOS, Windows, and Linux.

![The auto workspace: a command list on the left, the field with a live trajectory in the middle, and per-path constraints on the right.](.github/assets/auto-workspace.png)

## Why BrainSTEM Pilot

**A high barrier to entry.** Autonomous pathing in FTC and FRC usually means climbing a steep learning curve — trajectory math, custom kinematics, and a rigid local toolchain to set up — before the robot moves at all.

**No real-time visualization.** Without watching a trajectory play out, acceleration violations, waypoint drift, and edge cases stay invisible until the code is on physical hardware, which is the slowest and most expensive place to find them.

BrainSTEM Pilot puts the whole loop in one visual editor: draw the path, see the robot's bounding box sweep it, and read the time estimate before anything is deployed.

### How it compares

| Feature | BrainSTEM Pilot | Choreo | PathPlanner | Pedro Pathing | Road Runner |
| --- | :---: | :---: | :---: | :---: | :---: |
| Cross-system (FTC & FRC) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Bézier curve drive trajectories | ✓ | ✓ | ✓ | ✓ | ✗ |
| Precise execution time estimates | ✓ | ✓ | ✓ | ✓ | ✓ |
| Auto side-mirror (1 path → 4 paths) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Visualize dynamic bounding box | ✓ | ✗ | ✗ | ✗ | ✗ |
| In-app subsystem configuration | ✓ | ✓ | ✓ | ✗ | ✗ |
| Uncapped max profile utilization | ✓ | ✓ | ✗ | ✗ | ✗ |
| Custom built-in simulator | ✓ | ✓ | ✓ | ✗ | ✗ |

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

## Web or desktop?

Both run the same code and the same project files, so a folder created in one opens in the other.

| | Web | Desktop |
| --- | --- | --- |
| Install | none — [open the link](https://brainstem-first.github.io/Brainstem-Pilot-UI/) | [download an installer](https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/releases/latest) |
| Browser requirement | Chrome or Edge (File System Access API) | none, it ships its own |
| Works offline | no | yes |
| Updating | automatic | download a new release |

The desktop builds are **not code-signed**, so the OS warns on first launch:

- **macOS** — right-click the app and choose *Open*, or run `xattr -cr "/Applications/BrainSTEM Pilot.app"`.
- **Windows** — click *More info → Run anyway* on the SmartScreen prompt.

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

## Development

```bash
npm install
npm run dev            # web app at http://localhost:5173/Brainstem-Pilot-UI/
npm run dev:desktop    # same app inside the Electron shell, with hot reload
```

Builds:

```bash
npm run build          # web bundle for GitHub Pages -> dist/
npm run build:desktop  # same bundle, relative paths + hash routing -> dist/
npm run desktop:pack   # unpacked desktop app (fast, for testing) -> release/
npm run desktop:dist   # installers for the current platform -> release/
```

The two targets differ only in `DESKTOP=1`: the web build is served from the
`/Brainstem-Pilot-UI/` subpath and uses `BrowserRouter` (with `public/404.html`
bouncing deep links back to `index.html`), while the desktop build loads
`index.html` off disk, so it uses a relative base and `HashRouter`. The Electron
shell itself is in [`electron/`](electron/).

The app icon is generated from `build/icon-source.png` (the neon brain artwork,
trimmed to its content). To regenerate the derived files after replacing it:

```bash
magick build/icon-source.png -filter Lanczos -resize 840x -unsharp 0x1.2+0.6+0.02 \
  -background black -gravity center -extent 1024x1024 \
  \( -size 1024x1024 xc:none -draw "roundrectangle 0,0,1023,1023,224,224" \) \
  -alpha set -compose DstIn -composite build/icon.png
magick build/icon.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
magick build/icon.png -resize 192x192 -strip public/favicon.png
```

### Shipping a release

GitHub Pages redeploys on every push to `master` ([deploy.yml](.github/workflows/deploy.yml)).
Desktop installers are built from a version tag ([release.yml](.github/workflows/release.yml)):

```bash
npm version minor && git push --follow-tags
```

That builds on macOS, Windows and Linux runners and attaches the `.dmg`, `.exe`,
`.AppImage` and `.deb` artifacts to a GitHub Release. No secrets are needed —
the workflow publishes with the built-in `GITHUB_TOKEN`.
