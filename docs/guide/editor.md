# Path editor

![Path editor with field canvas and sidebar](/path-editor.png)

- **Add (+):** Click the field to place waypoints in order.
- **Select:** Drag waypoints, control handles, and rotation dots. Right-click to delete.
- **L / R toggle:** Sets start side metadata only — waypoints stay put.
- **Simulation bar:** Scrub or play the path at the bottom of the canvas.

## Waypoints and Bézier curves

![Waypoints and control handles](/waypoints-zoom.png)

- **Start / End** — green and red robot icons with rotation control.
- **Mid waypoints** — blue dots; support optional parameters.
- **End point** — red robot icon; supports optional parameters (e.g. distance tolerance for the final stop).
- **Control handles** — white dots on a straight dashed line through the waypoint (180° locked).
- **Insert waypoint** — sidebar button subdivides a segment.

## Optional parameters

Select any waypoint except the start point, then expand **Optional Parameters** in the sidebar. The end point is a common place to set distance tolerance for how precisely the robot must finish the path.

Extremely small **distance tolerance** or **heading tolerance** values can cause the robot to hunt back and forth around a waypoint. If you see jitter at a stop, loosen these slightly before tuning other parameters.

| Key | Label | Default | What it does |
| --- | --- | --- | --- |
| `distTol` | Distance Tolerance | 0.1 m | How close the robot must get before the waypoint counts as reached. |
| `headingTol` | Heading Tolerance | 3° | Maximum heading error allowed when finishing the segment. |
| `minLinearSpeed` | Min Linear Speed | 0 m/s | Handover speed so the robot does not stop at the joint. |
| `maxLinearSpeed` | Max Linear Speed | 1 m/s | Speed cap for the leg ending at this waypoint. |
| `maxTurnPower` | Max Turn Power | 1 | Cap on rotational power while correcting heading. |
| `maxTime` | Max Time | 10 s | Time limit to reach this waypoint before the segment times out. |
| `passPosition` | Pass Position | false | If the robot overshoots, continue instead of backing up. |

FTC uses inches for distance and speed; FRC uses metres. The editor stores the league's units in the JSON envelope.

## Rotation targets

![Rotation targets](/rotation-targets.png)

Schedule heading changes independent of the drive path (holonomic drivetrains):

- Add targets from the sidebar **Rotation Targets** section.
- The progress slider positions the target along the path; a cyan ghost robot previews heading.
- Cyan dots on the canvas are draggable.

## Subsystem triggers

![Subsystem triggers](/subsystem-triggers.png)

Configure subsystems first (home → **Subsystems**). Then set progress, subsystem, and command for each trigger. Stars on the canvas mark trigger locations.

Names must match `PilotRegistry.addCommand(...)` on the robot.

## Constraints

Override max velocity and max acceleration per path. Untouched values inherit from Robot Settings. A path that uses the project defaults still writes the numbers out, with `usingDefaults: true`.
