# Handoff prompt — rewrite the FTC Java reader for the new Auto format

Paste everything below into a fresh Claude Code window opened at
`/Users/keerthana/Robotics-Code/FTC-BrainSTEM-Pilot-Test`.

---

The robot-side Java in this repo still reads the **old skeleton/variant Auto format**. The
Brainstem Pilot UI that produces these files has moved to a **self-contained per-Auto
format**, and the old format is now dead. I need you to rewrite the reader so the robot
consumes the new files directly. Do not add a compatibility shim for the old format — it is
being retired, and the UI now moves the old files into `legacy/` on open.

## Where things live

- Robot code: `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/utils/pilotAutoBuilder/`
  - `PilotAutoBase.java` — abstract LinearOpMode that generated OpModes extend
  - `autoReader/BrainstemPilot.java` — the entry point; builds RoadRunner `Action`s
  - `autoReader/PathParser.java` — parses `paths/*.path.json` into Bézier segments
  - `autoReader/PilotAssetLoader.java` — reads JSON out of Android assets
  - `autoReader/PilotAutoBuilder.java` — fluent builder wrapper
  - `helperClasses/` — Jackson models plus `TriggerWatcher`, `PilotCommands`, `PilotGeometry`
- JSON project (edited by the UI, source of truth):
  `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/brainstemPilotAuto/`
- Generated OpModes: `.../brainstemPilotAuto/opmodeAutos/*.java`
- **Asset pipeline:** `TeamCode/build.gradle` has a `syncBrainstemPilotAssets` Sync task that
  mirrors the JSON folder into `src/main/assets/brainstemPilotAuto/` before every build,
  excluding `opmodeAutos/**` and `**/*.java`. `PilotAssetLoader` reads from there. The assets
  copy is currently stale (still has `skeletons/`, `variants/`, no `autos/` or `points/`) —
  it refreshes on the next build. Check the Sync task still excludes the right things after
  your changes.

## What has to change

### 1. Delete the old model, read `autos/` instead

Old: `skeletons/<Name>.skeleton.json` (a shared list of commands) + `variants/<Name>.variant.json`
(`skeletonId` plus `commandOverrides[]` patching commands by `cmdId`). `BrainstemPilot`
resolved a variant to its skeleton and merged the overrides.

New: `autos/<Safe_Name>.auto.json` is **self-contained**. There is no skeleton, no variant, no
override merging. One file, one Auto, read it and run it.

These become dead and should go: `helperClasses/SkeletonAuto.java`,
`helperClasses/SkeletonCommand.java`, `helperClasses/VariantAuto.java`,
`helperClasses/CommandOverride.java`, and `PilotAssetLoader`'s
`variantAssetRelativePath` / `skeletonAssetRelativePath`.

The generated OpMode constructor argument is unchanged in form but changed in meaning — it is
now an **Auto id** (the file slug), not a variant name:

```java
@Autonomous(name = "Nine Ball (123)", group = "Pilot")
public class NineBall123Auto extends PilotAutoBase {
    public NineBall123Auto() { super("Nine_Ball_(123)"); }   // → autos/Nine_Ball_(123).auto.json
}
```

Rename `variantAutoName` throughout to `autoId`, and add
`PilotAssetLoader.autoAssetRelativePath(String autoId)` returning `"autos/" + autoId + ".auto.json"`.

### 2. New file shapes

Every record now carries an envelope: `schemaVersion` (currently `2`), `updated_date`, and
unit metadata — `coordinateSystem`, `units`, `headingUnit`, `speedUnit`, `accelUnit`. For FTC
these are `pedro-center`, `in`, `deg`, `in/s`, `in/s²`. Read `units` rather than assuming;
refuse a file whose `schemaVersion` is newer than you understand rather than misreading it.

**`autos/<id>.auto.json`**

```json
{
  "schemaVersion": 2,
  "id": "Nine_Ball_(123)",
  "name": "Nine Ball (123)",
  "sequence": [ /* slots, in execution order */ ],
  "units": "in", "headingUnit": "deg", "coordinateSystem": "pedro-center"
}
```

Slot types — every slot has `id`, `type`, and `skip`:

| `type` | fields |
|---|---|
| `path` | `pathId` → `paths/<pathId>.path.json` |
| `point` | `pointId` → `points/<pointId>.point.json`, `params`, `subsystemTriggers[]` |
| `subsystem` | `subsystemName`, `commandName` |
| `wait` | `duration` (seconds) |
| `parallel` | `parallelSubs[]`, each `{ id, type: "subsystem"\|"wait", subsystemName, commandName, defaultWait }` |

`skip: true` means skip the slot entirely — it contributes no motion and no time.

**`points/<id>.point.json`** — a single shared pose:

```json
{ "schemaVersion": 2, "id": "Shoot_Location", "name": "Shoot Location",
  "x": -15.047, "y": 14.316, "rotation": 140, "units": "in", "headingUnit": "deg" }
```

**Important:** `rotation` on the *point record* is the robot heading at that point, and it is
shared by every slot that uses the point. The old format had a per-slot `rotation` override;
that is gone. If you see `rotation` on a point *slot*, ignore it — it is stale.

**`paths/<id>.path.json`** — `waypoints[]` of `{x, y, prevControl, nextControl, rotation, params?}`
(controls are `null` at the ends), plus `subsystemTriggers[]`, `rotationTargets[]`, and:

```json
"constraints": { "maxVel": 60, "maxAccel": 40, "usingDefaults": true }
```

`constraints` is now always populated — it used to be `{}`. `usingDefaults` records that these
came from the project default rather than being set on the path; either way the numbers are
authoritative, so just use them.

`waypointParams` is no longer written. Read `params` inline on each waypoint.

⚠️ `rotationTargets[].arcLengthM` is **misnamed** — despite the `M`, it holds distance in the
file's `units`, so inches for FTC. Treat it as `units`, not metres.

### 3. Chaining semantics you must reproduce

This is the part most likely to go wrong, because the geometry is not in the files — it is
implied by sequence order. The UI's `buildAutoChain` in
`/Users/keerthana/Robotics-Code/Brainstem-Pilot-UI/src/lib/trajectoryMath.js` is the reference
implementation; match it exactly or the robot drives a different route than the preview showed.

- Only `path` and `point` slots are **positional**. `subsystem`, `wait`, and `parallel` pass
  the running pose through unchanged.
- The first positional slot starts at its own stored pose.
- **A path's first waypoint is snapped to the previous positional slot's end pose** — position
  *and* heading. Only that first waypoint moves; the rest of the path keeps its authored shape,
  and its Bézier handle translates with it. The UI writes joints through on edit, so a
  well-formed file already lines up; the snap is the fallback for a resequenced Auto.
- **A point is a destination driven to,** not a coincident joint. It produces a straight
  connecting segment from the current pose to the point, finishing at the point's own
  `rotation`. A path's end is therefore *not* coincident with a following point.
- After a point, the running pose is the point's pose — so the next path starts on the point.

### 4. Triggers and rotation targets

`subsystemTriggers[]` on a path record (and on a point *slot*) are
`{ id, subsystemName, commandName, progress, arcLengthM }`. `progress` is 0–1 along that
segment. `TriggerWatcher` already implements this — keep it, just feed it from the new shape.
A trigger with a blank `subsystemName` or `commandName` is unfinished; skip it rather than
throwing. The UI flags these, but a file can still arrive incomplete.

`rotationTargets[]` are `{ id, progress, rotation, arcLengthM }` — heading keyframes along a
path, already handled by the existing code.

## How I'd like you to work

1. Read `BrainstemPilot.java`, `PathParser.java`, and `PilotAutoBase.java` first and tell me
   what the current control flow is before changing anything.
2. Propose the new model classes (`PilotAuto`, `PilotSlot`, `PilotPoint`, …) and the loading
   flow, and let me approve before you write them.
3. Then implement, and make sure `./gradlew :TeamCode:compileDebugJavaWithJavac` passes.
4. Sanity-check against the one real Auto in this repo: `autos/Nine_Ball_(123).auto.json`,
   which references 7 paths and the `Shoot_Location` point three times. All three point slots
   must resolve to the same pose and the same 140° heading.

Do not modify anything under
`/Users/keerthana/Robotics-Code/Brainstem-Pilot-UI/` — that is the editor, and I am working
in it separately.
