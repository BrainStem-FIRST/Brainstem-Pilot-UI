# Java API

Every public class in the robot libraries is published as generated Javadoc when `master` deploys to GitHub Pages. Use the search box on those Javadoc pages, or the search box in this docs header for the install and guide pages.

| Library | Artifact | Class reference |
| --- | --- | --- |
| FRC | `org.brainstemfirst:pilot-frc` | [FRC Javadoc](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/javadoc/frc/index.html) |
| FTC | `org.brainstemfirst:pilot-ftc` | [FTC Javadoc](https://brainstem-first.github.io/Brainstem-Pilot-UI/docs/javadoc/ftc/index.html) |

Javadoc is generated from comments in source. Start with the types teams actually call; follower internals are listed too.

## FRC — start here

| Class | Role |
| --- | --- |
| `org.brainstemfirst.pilot.frc.reader.BrainstemPilot` | Load autos from deploy JSON and build WPILib commands |
| `org.brainstemfirst.pilot.frc.PilotRegistry` | Map UI subsystem/command names to `Command`s |
| `org.brainstemfirst.pilot.frc.reader.PilotAutoBuilder` | Fluent `buildAuto` / `buildPath` |
| `org.brainstemfirst.pilot.frc.bezier.follower.BezierFollowerConfig` | Global follower gains |
| `org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierParams` | Per-path limits from JSON |

## FTC — start here

| Class | Role |
| --- | --- |
| `org.brainstemfirst.pilot.ftc.PilotOpMode` | Base class for generated OpModes (`PilotAutoBase` extends this) |
| `org.brainstemfirst.pilot.ftc.reader.BrainstemPilot` | Load autos from APK assets and build Road Runner actions |
| `org.brainstemfirst.pilot.ftc.PilotRegistry` | Map UI subsystem/command names to `Action`s |
| `org.brainstemfirst.pilot.ftc.bezier.follower.BezierFollowerConfig` | Global follower gains |
| `org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams` | Per-path limits from JSON |

Install: [FRC](/install/frc) · [FTC](/install/ftc)
