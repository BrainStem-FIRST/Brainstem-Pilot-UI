# Brainstem Pilot FRC library

Gradle coordinate: `org.brainstemfirst:pilot-frc:0.1.0-SNAPSHOT`

This module is the robot-side Bézier follower and auto JSON reader. The visual editor stays in the app; this library runs on the RoboRIO.

## Add it to an FRC project

Teams consume a compiled artifact only. Do not `includeBuild` this module in a robot project — that exposes library sources as an editable Gradle module.

```gradle
// build.gradle
repositories {
    mavenLocal()
}

dependencies {
    implementation 'org.brainstemfirst:pilot-frc:0.1.0-SNAPSHOT'
}
```

Also add `mavenLocal()` in `settings.gradle` `pluginManagement.repositories` if the robot project does not already resolve from it.

## Team wiring

Do not copy follower or JSON-parser classes into robot code. Pass your drive into `initialize` — the drive class does not implement a library interface.

```java
import org.brainstemfirst.pilot.frc.PilotRegistry;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierFollowerConfig;
import org.brainstemfirst.pilot.frc.reader.BrainstemPilot;

// Drive.configureFollower() sets BezierFollowerConfig gains

BrainstemPilot.initialize(
    drive,
    drive::getPose,
    drive::getFieldRelativeSpeeds,
    drive::runVelocity,
    drive::getMaxAngularSpeedRadPerSec);
PilotRegistry.addCommand("Collection", "Intake Pivot Out", () -> SimpleCommands.collectorExtend(collector));
```

Your drive needs those four methods (pose, field-relative chassis speeds, velocity out, max angular speed). Follower gains are global on `BezierFollowerConfig`. Per-path `maxVel` / `maxAccel` come from path JSON into `BezierParams`.

## Local publish

```bash
./gradlew publishToMavenLocal
```

Then resolve `org.brainstemfirst:pilot-frc:0.1.0-SNAPSHOT` from `mavenLocal()`.
