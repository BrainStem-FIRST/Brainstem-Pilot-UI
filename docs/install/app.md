# Install the app

BrainSTEM Pilot is a visual editor for FRC and FTC autonomous routines. The web and desktop builds use the same project files.

| | Web | Desktop |
| --- | --- | --- |
| Install | none — [open the app](https://brainstem-first.github.io/Brainstem-Pilot-UI/) | [download an installer](https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/releases/latest) |
| Browser | Chrome or Edge (File System Access API) | none — it ships its own |
| Offline | no | yes |
| Updating | automatic | download a new release |

## Desktop installers

Grab the latest GitHub release for your OS:

- **macOS** — `.dmg` (Apple Silicon or Intel)
- **Windows** — NSIS setup or portable `.exe`
- **Linux** — AppImage or `.deb`

The desktop builds are **not code-signed**, so the OS warns on first launch.

### macOS

After dragging the app to Applications:

```bash
xattr -cr "/Applications/BrainSTEM Pilot.app"
```

Or right-click the app and choose **Open**, then **Open** again. If macOS still refuses, allow it under **System Settings → Privacy & Security**.

### Windows

Click **More info → Run anyway** on the SmartScreen prompt.

## Next

1. Create the project folder in your robot repo — see [Getting started](/guide/getting-started).
2. Install the robot library for your league: [FRC](/install/frc) or [FTC](/install/ftc).
