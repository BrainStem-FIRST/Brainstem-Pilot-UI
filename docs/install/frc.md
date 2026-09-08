# Install the FRC library

Vendordep: `BrainstemPilot.json`  
Maven coordinate: `org.brainstemfirst:pilot-frc:2026.1.0`

This module is the robot-side Bézier follower and auto JSON reader. The visual editor stays in the app; this library runs on the RoboRIO.

Do **not** add a Gradle `implementation` line. Install it the same way as PathPlanner, Phoenix, REV, and other FRC libraries: WPILib vendordeps.

## Online (VS Code / WPILib)

1. Open the robot project in WPILib VS Code.
2. Command Palette → **WPILib: Manage Vendor Libraries** → **Install new libraries (online)**.
3. Paste:

```
https://brainstem-first.github.io/Brainstem-Pilot-UI/vendordeps/BrainstemPilot.json
```

That copies the vendordep into `vendordeps/` and GradleRIO pulls `pilot-frc` from GitHub Pages (`…/frc-maven`).

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

Store autos under `src/main/deploy/brainstemPilotAuto/` so they deploy to the roboRIO. See [FRC in the guide](/guide/frc).

## API

Generated class docs: [FRC Javadoc](/javadoc/frc/).
