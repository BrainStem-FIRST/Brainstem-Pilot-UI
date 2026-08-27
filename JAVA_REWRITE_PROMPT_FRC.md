# Handoff prompt — rewrite the FRC Java reader for the new Auto format

Paste everything below into a fresh Claude Code window opened at
`/Users/keerthana/Robotics-Code/8393RebuiltCompBot`.

There is a companion prompt for the FTC repo (`JAVA_REWRITE_PROMPT.md`). The JSON format is
identical between the two; **this prompt covers the FRC-specific differences**, which are real:
no OpModes, a different package layout, WPILib `Command` instead of RoadRunner `Action`, and
side/alliance mirroring that FTC does not have.

---

The robot-side Java in this repo still reads the **old skeleton/variant Auto format**. The
Brainstem Pilot UI has moved to a **self-contained per-Auto format**, and the old format is
retired. Rewrite the reader to consume the new files directly. Do not build a compatibility
shim — the UI has already migrated this project, and the old files now sit inertly in
`src/main/deploy/brainstemPilotAuto/legacy/` for reference only.

## Where things live

- Reader: `src/main/java/frc/robot/util/autoReader/`
  - `BrainstemPilot.java` (479 lines) — entry point, builds WPILib `Command`s, owns mirroring
  - `PathParser.java` (262) — parses `paths/*.path.json` into `BezierPath[]`
  - `PilotAutoBuilder.java` (59) — fluent builder with `forSide()` / `mirrorSide()`
  - `FieldSide.java` (18) — `LEFT` / `RIGHT` enum, `fromStartSideKey`, `opposite`
  - `TriggerWatcher.java` (125), `PilotCommands.java` (27) — keep, just re-feed them
  - `SkeletonAuto.java`, `SkeletonCommand.java`, `VariantAuto.java`, `CommandOverride.java` — **delete**
- JSON project: `src/main/deploy/brainstemPilotAuto/` — read at runtime via
  `Filesystem.getDeployDirectory()`. No asset-copy step (unlike FTC); the deploy folder ships
  to the roboRIO as-is.
- `FieldConstants.mirrorSide(...)` is what actually reflects a point across the field.

## FRC-specific differences from the FTC port

1. **No OpModes.** There is no `opmodeAutos/` and nothing generates Java per Auto. Autos are
   selected at runtime (SendableChooser / dashboard), so the reader needs to enumerate
   `autos/*.auto.json` and build by id. If you find a stray `opmodeAutos/` folder with FTC
   imports, it is leftover junk — the UI now deletes it from non-FTC projects on open.
2. **`Command`, not `Action`.** Keep returning WPILib `Command`s and keep the existing
   composition helpers.
3. **Units are metres.** FRC files carry `"units": "m"` and `"coordinateSystem":
   "frc-bottom-left"`. Read the field rather than assuming — the same code path serves both
   leagues in the editor.
4. **Side mirroring is the big one.** See below.

## Side and alliance mirroring — what must not regress

`PilotAutoBuilder` currently supports:

```java
BrainstemPilot.auto("Trench_Double_Sweep").build();                  // authored side
BrainstemPilot.auto("Trench_Double_Sweep").mirrorSide().build();     // opposite side
BrainstemPilot.auto("Trench_Double_Sweep").forSide(FieldSide.LEFT).build();
```

This resolves through `BrainstemPilot.getAuthoredStartSide(name)`, which today reads
`startSide` **from the first non-skipped path in the variant's skeleton**. That lookup is the
part that breaks — there are no skeletons any more.

Two things to know:

- `startSide` still exists, and it lives on **path** records (`paths/*.path.json`), not on
  Autos. Auto files carry no `startSide`.
- So `getAuthoredStartSide(autoId)` must be rewritten to: load `autos/<autoId>.auto.json`,
  walk `sequence` in order, find the first slot with `type == "path"` and `skip == false`,
  and read `startSide` from that path's file. Preserve the existing fallback behaviour when
  nothing is found (`FieldSide.fromStartSideKey(null)` → `RIGHT`, with the warning log).

Keep `mirrorSide(BezierPath[])` and `FieldConstants.mirrorSide(...)` exactly as they are.
**Point slots must mirror too** — a point is a field position like any other, so when running
mirrored, the point's pose has to go through the same reflection before it becomes a target.
This is new: the old format had no point slots.

Alliance handling stays wherever it lives today (it is applied downstream of path geometry) —
just make sure the new code path doesn't bypass it.

## New file shapes

Every record carries an envelope: `schemaVersion` (currently `2`), `updated_date`, and units
metadata — `coordinateSystem`, `units`, `headingUnit`, `speedUnit`, `accelUnit`. Refuse a file
whose `schemaVersion` is newer than you understand rather than misreading it.

**`autos/<id>.auto.json`** — self-contained, replaces skeleton + variant + overrides:

```json
{ "schemaVersion": 2, "id": "Trench_Double_Sweep", "name": "Trench Double Sweep",
  "sequence": [ /* slots in execution order */ ],
  "units": "m", "coordinateSystem": "frc-bottom-left" }
```

Slot types — every slot has `id`, `type`, `skip`:

| `type` | fields |
|---|---|
| `path` | `pathId` → `paths/<pathId>.path.json` |
| `point` | `pointId` → `points/<pointId>.point.json`, `params`, `subsystemTriggers[]` |
| `subsystem` | `subsystemName`, `commandName` |
| `wait` | `duration` (seconds) |
| `parallel` | `parallelSubs[]`, each `{ id, type: "subsystem"\|"wait", subsystemName, commandName, defaultWait }` |

`skip: true` means the slot contributes no motion and no time.

**`points/<id>.point.json`** — a shared pose. `rotation` on the *record* is the robot heading
there and is shared by every slot using that point. Any `rotation` on a point *slot* is stale;
ignore it. This project has no points yet, but the format supports them and the UI writes them.

**`paths/<id>.path.json`** — `waypoints[]` of `{x, y, prevControl, nextControl, rotation, params?}`
(controls `null` at the ends), plus `startSide`, `subsystemTriggers[]`, `rotationTargets[]`, and:

```json
"constraints": { "maxVel": 3, "maxAccel": 2.5, "usingDefaults": true }
```

`constraints` is now always populated — it used to be `{}`. `usingDefaults` records that the
values came from the project default rather than being set per-path; either way the numbers
are authoritative. `waypointParams` is no longer written; read `params` inline per waypoint.

⚠️ `rotationTargets[].arcLengthM` is **misnamed** — it holds distance in the file's `units`.
For FRC that happens to be metres, so the name is accidentally correct here, but do not rely
on the name; read `units`.

## Chaining semantics you must reproduce

Not in the files — implied by sequence order. Reference implementation is `buildAutoChain` in
`/Users/keerthana/Robotics-Code/Brainstem-Pilot-UI/src/lib/trajectoryMath.js`. Match it or the
robot drives a different route than the editor previewed.

- Only `path` and `point` slots are **positional**. `subsystem`, `wait`, `parallel` pass the
  running pose through unchanged.
- The first positional slot starts at its own stored pose.
- **A path's first waypoint snaps to the previous positional slot's end pose** — position
  *and* heading. Only that waypoint moves; the rest keeps its authored shape and its Bézier
  handle translates with it.
- **A point is a destination driven to**, not a coincident joint: a straight connecting
  segment from the current pose to the point, finishing at the point's own `rotation`. A
  path's end is therefore *not* coincident with a following point.
- After a point, the running pose is the point's pose, so the next path starts on the point.
- Apply mirroring **after** chaining, to the whole resolved geometry — mirroring individual
  paths before they are chained will not produce the same route.

## Triggers

`subsystemTriggers[]` (on a path record, and on a point *slot*) are
`{ id, subsystemName, commandName, progress, arcLengthM }`, `progress` 0–1 along that segment.
`TriggerWatcher` already does this; just feed it the new shape. A trigger with a blank
`subsystemName` or `commandName` is unfinished — skip it rather than throwing.

## How I'd like you to work

1. Read `BrainstemPilot.java`, `PilotAutoBuilder.java`, and `PathParser.java` first and tell
   me the current control flow — especially where mirroring is applied relative to path
   parsing — before changing anything.
2. Propose the new model classes and the loading flow, and let me approve before you write.
3. Then implement, and make sure `./gradlew build` passes.
4. Sanity-check against the two real Autos here: `autos/Trench_Double_Sweep.auto.json` and
   `autos/Bump_Double_Sweep.auto.json`. Both must build on their authored side and mirrored,
   and `getAuthoredStartSide` must return the same side the old skeleton lookup did — compare
   against `legacy/skeletons/Double_Sweep.skeleton.json` and the two files in `legacy/variants/`
   to confirm you match the old behaviour before deleting anything.

Do not modify anything under `/Users/keerthana/Robotics-Code/Brainstem-Pilot-UI/` — that is
the editor, and I am working in it separately.
