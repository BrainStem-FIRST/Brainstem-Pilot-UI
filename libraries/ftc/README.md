# Brainstem Pilot FTC library

Gradle coordinate: `org.brainstemfirst:pilot-ftc:2026.1.0`

This module is the robot-side Bézier follower and auto JSON reader. The visual editor stays in the app; this library runs on the Control Hub.

## Add it to an FTC project

Teams consume a compiled artifact only. Do not `includeBuild` this module in a robot project — that exposes library sources as an editable Gradle module.

```gradle
// TeamCode/build.gradle
repositories {
    mavenLocal()
}

dependencies {
    implementation 'org.brainstemfirst:pilot-ftc:2026.1.0'
}
```

You still need Road Runner, FTC Dashboard, and Jackson if the rest of your code uses them. Copy the `syncBrainstemPilotAssets` Gradle task so Pilot JSON under `brainstemPilotAuto/` is packed into APK assets.

## Team class (`PilotAutoBase.java`)

The editor creates this file **once** in the FTC project folder (`brainstemPilotAuto/PilotAutoBase.java`, package `org.firstinspires.ftc.teamcode.brainstemPilotAuto`). It will not overwrite it afterwards.

Generated OpModes look like:

```java
import org.firstinspires.ftc.teamcode.brainstemPilotAuto.PilotAutoBase;

@Autonomous(name = "My Auto", group = "Pilot")
public class MyAuto extends PilotAutoBase {
    public MyAuto() { super("My_Auto"); }
}
```

Fill in `PilotAutoBase` (it extends library `PilotOpMode`). The stub already assigns `BezierFollowerConfig` gains in `configureFollower()` — edit those values there. Road Runner `kV`/`kS`/`kA` stay on `MecanumDrive.PARAMS`.

- `setupRobot(PilotAlliance, Pose2d)` — construct your robot, seed odometry
- `getDrive()` — return a `PilotDrive` (your Road Runner `MecanumDrive` can implement it)
- `registerCommands()` — `PilotRegistry.addCommand("Subsystem", "Command", () -> action)` for every name used in the UI
- `updateRobot(TelemetryPacket)` — subsystem loop + `updatePoseEstimate()` (return `true` to keep running)

Optional: `onOpModeStart()`, `drawRobot(Canvas)`.

Follower gains are dashboard-tunable on `BezierFollowerConfig`. Do not copy follower or JSON-parser classes into TeamCode.

## Local publish

```bash
./gradlew publishToMavenLocal
```

Then resolve `org.brainstemfirst:pilot-ftc:2026.1.0` from `mavenLocal()` without `includeBuild`.
