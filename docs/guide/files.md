# File format

Each record is one JSON file, indented so it diffs cleanly in git. Every file carries the same envelope:

- `schemaVersion` — the format version. Refuse a file newer than your parser understands rather than misreading it.
- `units`, `headingUnit`, `speedUnit`, `accelUnit`, `coordinateSystem` — read these rather than assuming a league.

## Folders

- `paths/<Name>.path.json` — `waypoints[]`, `constraints`, `subsystemTriggers[]`, `rotationTargets[]`.
- `points/<Name>.point.json` — `x`, `y`, `rotation`.
- `autos/<Name>.auto.json` — `sequence[]` of slots, each with `id`, `type` and `skip`.

A path that uses the project defaults still writes the numbers out, with `usingDefaults: true`. The file stands on its own — robot code never has to know what the editor's defaults were.

A file's name is derived from the record's name, and so is its id — which is why renaming a record retargets every Auto that referenced it, and why two records of the same kind cannot share a name.
