// Round-trip checks for the persistence layer, run against a fake project folder.
//
// The File System Access API needs a real user gesture to hand out a directory, so the save
// layer could never be exercised without a person clicking "Open project" — which meant every
// change to it was verified by reading code rather than by watching it write a file. This
// stands in an in-memory directory handle so the *real* projectFolder.js runs unmodified, and
// asserts the bytes that land on disk. Those bytes are the contract the robot-side Java reads,
// so this doubles as the format spec's test.
//
// Run it from the app's browser console (it needs Vite to resolve the JSON field catalog):
//
//   const t = await import('/Brainstem-Pilot-UI/src/lib/projectFolder.test.mjs');
//   await t.runPersistenceChecks();            // or { league: 'frc' }
//
// Import it *without* a cache-busting query. projectFolder and ftcOpmodeGenerator import each
// other, so a second module instance gets its own `_dirHandle` and the OpMode checks fail for
// reasons that have nothing to do with the app. Reload the page instead.
//
// Returns { passed, failed, results }. It never touches a real folder.

import {
  setProjectDir, getProjectDir,
  savePathToProject, savePointToProject, saveAutoToProject,
  loadPathsFromProject, loadPointsFromProject, loadAutosFromProject,
  saveAppSettingsToProject, initializeProjectFolder,
  deletePathFromProject,
} from './projectFolder.js';

// ── An in-memory FileSystemDirectoryHandle ───────────────────────────────────

function makeFile(name, contents = '') {
  return {
    kind: 'file',
    name,
    _contents: contents,
    async getFile() {
      const self = this;
      return { async text() { return self._contents; } };
    },
    async createWritable() {
      const self = this;
      let buffer = '';
      return {
        async write(chunk) { buffer += chunk; },
        async close() { self._contents = buffer; },
      };
    },
  };
}

function makeDir(name) {
  const entries = new Map();
  return {
    kind: 'directory',
    name,
    _entries: entries,
    async getDirectoryHandle(childName, opts = {}) {
      const found = entries.get(childName);
      if (found?.kind === 'directory') return found;
      if (!opts.create) throw new DOMException(`no dir ${childName}`, 'NotFoundError');
      const dir = makeDir(childName);
      entries.set(childName, dir);
      return dir;
    },
    async getFileHandle(childName, opts = {}) {
      const found = entries.get(childName);
      if (found?.kind === 'file') return found;
      if (!opts.create) throw new DOMException(`no file ${childName}`, 'NotFoundError');
      const file = makeFile(childName);
      entries.set(childName, file);
      return file;
    },
    async removeEntry(childName) {
      if (!entries.has(childName)) throw new DOMException(`no entry ${childName}`, 'NotFoundError');
      entries.delete(childName);
    },
    async *values() { yield* entries.values(); },
    async isSameEntry(other) { return other === this; },
  };
}

/** Every file in the fake folder as `{ "paths/X.path.json": "…" }`, for asserting on. */
function snapshot(dir, prefix = '') {
  const out = {};
  for (const entry of dir._entries.values()) {
    const key = prefix + entry.name;
    if (entry.kind === 'file') out[key] = entry._contents;
    else Object.assign(out, snapshot(entry, `${key}/`));
  }
  return out;
}

// ── Harness ──────────────────────────────────────────────────────────────────

export async function runPersistenceChecks({ league = 'ftc' } = {}) {
  const results = [];
  const check = (name, condition, detail = '') => {
    results.push({ name, ok: !!condition, detail: condition ? '' : detail });
  };

  // Expectations differ by league — inches and pedro-center for FTC, metres and
  // frc-bottom-left for FRC — so the checks read them from the league under test rather than
  // hardcoding one league's answers.
  const isFtc = league === 'ftc';
  const expect = {
    units: isFtc ? 'in' : 'm',
    coordinateSystem: isFtc ? 'pedro-center' : 'frc-bottom-left',
    maxVel: isFtc ? 60 : 3,
    maxAccel: isFtc ? 40 : 2.5,
  };

  const previousDir = getProjectDir();
  const root = makeDir('fake-project');
  setProjectDir(root);

  try {
    await saveAppSettingsToProject({ projectType: league, selectedFieldId: 'decode_2026' });

    // ── 1. A path round-trips, and carries the envelope the Java reads ──
    await savePathToProject({
      id: 'Drive_off_Wall',
      name: 'Drive off Wall',
      waypoints: [
        { x: 1, y: 2, rotation: -90, prevControl: null, nextControl: { x: 3, y: 4 } },
        { x: 9, y: 8, rotation: 180, prevControl: { x: 7, y: 6 }, nextControl: null },
      ],
      constraints: {},
      subsystemTriggers: [],
      rotationTargets: [],
      waypointParams: { 0: { distTol: 2 } },   // legacy key: must not be written back
    }, null, league);

    const files = snapshot(root);
    const pathKey = 'paths/Drive_off_Wall.path.json';
    check('path file written at the expected name', files[pathKey] != null, Object.keys(files).join(', '));

    const pathJson = JSON.parse(files[pathKey] ?? '{}');
    check('path declares schemaVersion', pathJson.schemaVersion === 2, `got ${pathJson.schemaVersion}`);
    check('path declares units', pathJson.units === expect.units, `got ${pathJson.units}`);
    check('path declares coordinateSystem',
      pathJson.coordinateSystem === expect.coordinateSystem, `got ${pathJson.coordinateSystem}`);
    check('path stamps updated_date', typeof pathJson.updated_date === 'string');
    check('constraints resolved to real numbers',
      pathJson.constraints?.maxVel === expect.maxVel && pathJson.constraints?.maxAccel === expect.maxAccel,
      JSON.stringify(pathJson.constraints));
    check('constraints record usingDefaults',
      pathJson.constraints?.usingDefaults === true, JSON.stringify(pathJson.constraints));
    check('legacy waypointParams no longer written',
      pathJson.waypointParams === undefined, JSON.stringify(pathJson.waypointParams));
    check('end controls are null at the ends',
      pathJson.waypoints[0].prevControl === null && pathJson.waypoints[1].nextControl === null);
    check('JSON is indented for diffing', (files[pathKey] ?? '').includes('\n  "'));

    const loadedPaths = await loadPathsFromProject();
    check('path reloads', loadedPaths?.length === 1, `got ${loadedPaths?.length}`);

    // ── 2. Points carry the same envelope (they used to carry none) ──
    await savePointToProject({ id: 'Shoot_Location', name: 'Shoot Location', x: -15.05, y: 14.32, rotation: 140 });
    const pointJson = JSON.parse(snapshot(root)['points/Shoot_Location.point.json'] ?? '{}');
    check('point declares units', pointJson.units === expect.units, `got ${pointJson.units}`);
    check('point declares schemaVersion', pointJson.schemaVersion === 2);
    check('point keeps its heading', pointJson.rotation === 140, `got ${pointJson.rotation}`);
    const loadedPoints = await loadPointsFromProject();
    check('point reloads with its pose',
      loadedPoints?.[0]?.x === -15.05 && loadedPoints?.[0]?.rotation === 140);

    // ── 3. Autos, and the FTC OpMode generated alongside them ──
    await saveAutoToProject({
      id: 'Nine_Ball',
      name: 'Nine Ball',
      sequence: [
        { id: 's1', type: 'path', pathId: 'Drive_off_Wall', skip: false },
        { id: 's2', type: 'point', pointId: 'Shoot_Location', skip: false },
      ],
    }, null);
    const after = snapshot(root);
    const autoJson = JSON.parse(after['autos/Nine_Ball.auto.json'] ?? '{}');
    check('auto declares units', autoJson.units === expect.units, `got ${autoJson.units}`);
    check('auto keeps its sequence', autoJson.sequence?.length === 2);
    check('auto stamps updated_date', typeof autoJson.updated_date === 'string');

    const opmode = after['opmodeAutos/NineBallAuto.java'];
    if (league === 'ftc') {
      check('FTC OpMode generated for the auto', opmode != null, Object.keys(after).join(', '));
      check('OpMode points at the auto id', (opmode ?? '').includes('super("Nine_Ball")'));
      check('OpMode is marked generated', (opmode ?? '').includes('AUTO-GENERATED'));
    } else {
      check('no OpMode generated outside FTC', opmode == null);
    }

    const loadedAutos = await loadAutosFromProject();
    check('auto reloads', loadedAutos?.length === 1, `got ${loadedAutos?.length}`);

    // ── 4. Rename deletes the old file rather than leaving an orphan ──
    await savePathToProject({
      id: 'Drive_off_the_Wall', name: 'Drive off the Wall',
      waypoints: [{ x: 1, y: 2, rotation: 0, prevControl: null, nextControl: null }],
    }, 'Drive off Wall', league);
    const renamed = snapshot(root);
    check('renamed path written under the new name',
      renamed['paths/Drive_off_the_Wall.path.json'] != null);
    check('old path file removed on rename',
      renamed['paths/Drive_off_Wall.path.json'] == null, 'orphan left behind');

    // ── 5. Delete removes the file ──
    await deletePathFromProject('Drive off the Wall');
    check('delete removes the path file',
      snapshot(root)['paths/Drive_off_the_Wall.path.json'] == null);

    // ── 6. Legacy skeleton/variant files are retired on open ──
    const legacyRoot = makeDir('legacy-project');
    setProjectDir(legacyRoot);
    await saveAppSettingsToProject({ projectType: league, selectedFieldId: 'decode_2026' });
    const skeletons = await legacyRoot.getDirectoryHandle('skeletons', { create: true });
    const sk = await skeletons.getFileHandle('Double_Sweep.skeleton.json', { create: true });
    let w = await sk.createWritable();
    await w.write(JSON.stringify({ name: 'Double Sweep', commands: [{ id: 'c1', type: 'wait', defaultWait: 1 }] }));
    await w.close();
    const variants = await legacyRoot.getDirectoryHandle('variants', { create: true });
    const vf = await variants.getFileHandle('Trench.variant.json', { create: true });
    w = await vf.createWritable();
    await w.write(JSON.stringify({ name: 'Trench', skeletonId: 'Double_Sweep', commandOverrides: [] }));
    await w.close();

    await initializeProjectFolder(league);
    const migrated = snapshot(legacyRoot);
    check('legacy variant migrated into autos/', migrated['autos/Trench.auto.json'] != null,
      Object.keys(migrated).join(', '));
    check('legacy files moved under legacy/',
      migrated['legacy/variants/Trench.variant.json'] != null
      && migrated['legacy/skeletons/Double_Sweep.skeleton.json'] != null);
    check('legacy/ explains itself', (migrated['legacy/README.md'] ?? '').includes('Safe to delete'));
    check('original variants/ folder cleared',
      migrated['variants/Trench.variant.json'] == null, 'stale copy still present');
  } finally {
    setProjectDir(previousDir);
  }

  const failed = results.filter(r => !r.ok);
  return { passed: results.length - failed.length, failed: failed.length, results };
}
