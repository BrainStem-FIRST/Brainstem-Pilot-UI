# Install the FTC library

Gradle coordinate: `org.brainstemfirst:pilot-ftc:2026.1.1`

This module is the robot-side Bézier follower and auto JSON reader. The visual editor stays in the app; this library runs on the Control Hub.

Teams consume a compiled artifact only. Do not `includeBuild` this module in a robot project — that exposes library sources as an editable Gradle module.

## Add it to an FTC project

```groovy
// TeamCode/build.gradle
repositories {
    maven {
        url = 'https://brainstem-first.github.io/Brainstem-Pilot-UI/maven'
    }
}

dependencies {
    implementation 'org.brainstemfirst:pilot-ftc:2026.1.1'
}
```

You still need Road Runner, FTC Dashboard, and Jackson if the rest of your code uses them.

## Copy JSON into APK assets

Pilot JSON under `brainstemPilotAuto/` must be packed into APK assets. Add this to `TeamCode/build.gradle`:

```groovy
tasks.register('syncBrainstemPilotAssets', Sync) {
    from('src/main/java/org/firstinspires/ftc/teamcode/brainstemPilotAuto') {
        exclude 'opmodeAutos/**'
        exclude '**/*.java'
    }
    into 'src/main/assets/brainstemPilotAuto'
}

tasks.named('preBuild').configure {
    dependsOn tasks.named('syncBrainstemPilotAssets')
}
```

Build after editing paths in the app, or the robot runs the previous copy.

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

Fill in `PilotAutoBase` (it extends library `PilotOpMode`):

- `setupRobot(FieldConstants.Alliance, Pose2d)` — construct your robot, seed odometry
- `pose()` / `lastVelRobot()` / `setDrivePowers()` / `maxAngVel()` — return method refs on your drivetrain
- `registerCommands()` — `PilotRegistry.addCommand("Subsystem", "Command", () -> action)` for every name used in the UI
- `updateRobot(TelemetryPacket)` — subsystem loop + `updatePoseEstimate()` (return `true` to keep running)

Optional: `onOpModeStart()`. Follower gains belong on `BezierFollowerConfig` — the stub sets them in `PilotAutoBase.configureFollower()`. Do not copy follower or JSON-parser classes into TeamCode.

See [FTC in the guide](/guide/ftc).

## API

Generated class docs: [FTC Javadoc](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/javadoc/ftc/index.html).
