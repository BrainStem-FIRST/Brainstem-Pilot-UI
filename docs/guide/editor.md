# Path editor

Open a path from an Auto slot, or **Edit on field** from the Path & Point Index.

<div class="with-shot">
<figure>

![Path editor with field canvas and sidebar](/path-editor.png)

</figure>

<div>

Toolbar, left to right:

- **Paths** — back to the index (when you opened the editor from there).
- **Path name** — click to rename; the rename follows into every Auto that uses it.
- **Undo / Redo**
- **Start L / R** — start-side metadata only; waypoints stay put.
- **Add (+)** — click the field to place waypoints in order.
- **Select** — drag waypoints, control handles, and rotation dots. Right-click to delete.
- **Velocity** — show or hide the speed overlay along the trajectory.
- **Clear** — remove every waypoint.

A simulation bar at the bottom of the canvas **plays**, **pauses**, **restarts**, and scrubs the path.

</div>
</div>

<div class="with-shot">
<figure>

![Velocity overlay](/velocity-overlay.png)

</figure>

<div>

Turn **Velocity** on to tint the trajectory by speed. Faster stretches read brighter; slow approaches and stops go darker. Use it to check that constraints and per-waypoint speed caps are doing what you expect before you run the path on a robot.

</div>
</div>

## Waypoints and Bézier curves

<div class="with-shot">
<figure>

![Waypoints and control handles](/waypoints-zoom.png)

</figure>

<div>

- **Start / End** — green and red robot icons with rotation control.
- **Mid waypoints** — blue dots; support optional parameters.
- **End point** — red robot icon; supports optional parameters (e.g. distance tolerance for the final stop).
- **Control handles** — white dots on a straight dashed line through the waypoint (180° locked).
- **Insert waypoint** — sidebar button subdivides a segment.

</div>
</div>

## Optional parameters

<div class="with-shot">
<figure>

![Optional parameters](/optional-parameters.png)

</figure>

<div>

Select any waypoint except the start point, then expand **Optional Parameters** in the sidebar. The end point is a common place to set distance tolerance for how precisely the robot must finish the path.

Extremely small **distance tolerance** or **heading tolerance** values can cause the robot to hunt back and forth around a waypoint. If you see jitter at a stop, loosen these slightly before tuning other parameters.

</div>
</div>

| Key | Label | FRC default | FTC default | What it does |
| --- | --- | --- | --- | --- |
| `distTol` | Distance Tolerance | 0.1 m | 2 in | How close the robot must get before the waypoint counts as reached. |
| `headingTol` | Heading Tolerance | 3° | 3° | Maximum heading error allowed when finishing the segment. |
| `minLinearSpeed` | Min Linear Speed | 0 m/s | 0 in/s | Handover speed so the robot does not stop at the joint. |
| `maxLinearSpeed` | Max Linear Speed | 1 m/s | 60 in/s | Speed cap for the leg ending at this waypoint. |
| `maxTurnPower` | Max Turn Power | 1 (100%) | 1 (100%) | Cap on rotational power while correcting heading. |
| `maxTime` | Max Time | 10 s | 10 s | Time limit to reach this waypoint before the segment times out. |
| `passPosition` | Pass Position | false | false | If the robot overshoots, continue instead of backing up. |

The editor stores the league's units in the JSON envelope.

## Rotation targets

<div class="with-shot with-shot--wide">
<figure>

![Rotation targets](/rotation-targets.png)

</figure>

<div>

Schedule heading changes independent of the drive path (holonomic drivetrains):

- Add targets from the sidebar **Rotation Targets** section.
- The progress slider positions the target along the path; a cyan ghost robot previews heading.
- Cyan dots on the canvas are draggable.

</div>
</div>

## Subsystem triggers

<div class="with-shot with-shot--wide">
<figure>

![Subsystem triggers](/subsystem-triggers.png)

</figure>

<div>

Configure subsystems first (home → **Subsystems**). Then set progress, subsystem, and command for each trigger. Stars on the canvas mark trigger locations.

Names must match `PilotRegistry.addCommand(...)` on the robot.

</div>
</div>

## Constraints

<div class="with-shot">
<figure>

![Constraints](/constraints-panel.png)

</figure>

<div>

Override max velocity and max acceleration per path. Untouched values inherit from Robot Settings (FRC defaults 3.0 m/s and 2.5 m/s²; FTC defaults 60 in/s and 40 in/s²). A path that uses the project defaults still writes the numbers out, with `usingDefaults: true`.

</div>
</div>
