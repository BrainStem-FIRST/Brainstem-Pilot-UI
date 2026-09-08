# FTC

- **Project folder** — `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/brainstemPilotAuto/`. FTC has no deploy directory, so it lives in TeamCode next to your Java.
- **Units** — inches, inches per second, and degrees. Coordinates are `pedro-center`: origin at the centre of the field.
- **An OpMode per Auto** — saving an Auto writes a matching Java file into `opmodeAutos/`, so it appears on the Driver Station. Renaming an Auto renames the file; deleting one removes it. Files are marked *AUTO-GENERATED* — do not edit them by hand.
- **Robot wiring** — the first FTC open or Auto save also writes `PilotAutoBase.java` next to the JSON. Edit that file to hook up your robot. The UI will not overwrite it after creating it.
- **Assets** — a Gradle task copies the JSON into `src/main/assets/` before each build. Build after editing, or the robot runs the previous version.

An OpMode class name strips punctuation, so *Nine Ball (123)* and *Nine Ball 123* would both become `NineBall123Auto`. Renaming into that collision is refused.

Install the artifact from [Install the FTC library](/install/ftc). Class reference: [FTC Javadoc](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/javadoc/ftc/index.html).
