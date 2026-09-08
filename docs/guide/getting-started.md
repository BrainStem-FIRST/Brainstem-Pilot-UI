# Getting started

All paths, autos, and settings are saved as JSON files in a folder you choose on your computer.

1. In your robot codebase, create the folder for your league:
   - **FRC** — `src/main/deploy/brainstemPilotAuto/`
   - **FTC** — `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/brainstemPilotAuto/`
2. Open BrainSTEM Pilot. On the welcome screen, pick **FTC** or **FRC** (the field preview follows the toggle), then click **Open project**.
3. Select that folder (Chrome or Edge on the web; any OS on desktop).
4. Default files are created: `robot_settings.json`, `app_settings.json`, `subsystem_config.json`, and the `paths/`, `points/` and `autos/` folders as you save into them. On FTC, `PilotAutoBase.java` is created once in the project folder and is not overwritten after that.
5. Opening a project from an older version migrates its `skeletons/` and `variants/` into `autos/`, then moves the originals to `legacy/`. Nothing reads them after that; delete the folder once the autos look right.

The home screen has three cards — **Autos**, **Paths & Points**, and **Subsystems** — plus **Documentation** and **Settings** in the top-right. The league is locked for that folder; change FTC/FRC on the welcome screen before opening a project.

![Welcome — league toggle and Open project](/welcome.png)

![Home — Autos, Paths & Points, Subsystems](/home.png)

## Settings

Open **Settings** from the top-right of the home screen. There are two tabs:

- **Robot Settings** — frame width and length, default max velocity and acceleration, and physical subsystem attachments drawn on the robot icon. New paths inherit these motion defaults until you override them per path. On FRC, unit toggles in the header switch the display between metres / inches and m/s / ft/s.
- **App Settings** — which season field image to use. This updates the path editor, path list previews, and simulator. The project league is shown here as a lock while a folder is open. The field choice is saved as `app_settings.json`.

Set robot width, length, max velocity, and max acceleration before drawing paths. Confirm the correct season field is selected.

<div class="shot-pair">
<figure>

![Robot Settings](/robot-settings.png)

<figcaption>Robot Settings — frame size, motion defaults, and attachments.</figcaption>
</figure>
<figure>

![App Settings](/app-settings.png)

<figcaption>App Settings — season field image.</figcaption>
</figure>
</div>

## After that

- Draw paths from an Auto — [Paths](/guide/paths) and the [path editor](/guide/editor)
- Sequence them — [Autos](/guide/autos)
- Hook up robot code — [FRC install](/install/frc) or [FTC install](/install/ftc)

Commit `brainstemPilotAuto/` to git so the whole team shares paths and autos. On FTC, also commit generated `opmodeAutos/` Java files and your edited `PilotAutoBase.java`.
