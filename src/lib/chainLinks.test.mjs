import {
  propagateChainLinks, recordEndpoint, chainLinkGaps, hasLinkedStart, changedEndpoints,
} from './chainLinks.js';

function path(id, start, end, mid) {
  const waypoints = mid
    ? [
      { x: start[0], y: start[1], rotation: 0, prevControl: null, nextControl: { x: start[0] + 0.3, y: start[1] } },
      { x: mid[0], y: mid[1], rotation: 0, prevControl: { x: mid[0] - 0.3, y: mid[1] }, nextControl: { x: mid[0] + 0.3, y: mid[1] } },
      { x: end[0], y: end[1], rotation: 0, prevControl: { x: end[0] - 0.3, y: end[1] }, nextControl: null },
    ]
    : [
      { x: start[0], y: start[1], rotation: 0, prevControl: null, nextControl: { x: start[0] + 0.3, y: start[1] } },
      { x: end[0], y: end[1], rotation: 0, prevControl: { x: end[0] - 0.3, y: end[1] }, nextControl: null },
    ];
  return { id, name: id, waypoints };
}

function point(id, x, y) {
  return { id, name: id, x, y, rotation: 0 };
}

function auto(id, sequence) {
  return { id, name: id, sequence };
}

function slot(id, type, ref) {
  return type === 'path'
    ? { id, type, pathId: ref, skip: false }
    : { id, type, pointId: ref, skip: false };
}

function pose(rec, which) {
  return recordEndpoint('path', rec, which);
}

function find(list, id) {
  return list.find(r => r.id === id);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

function near(a, b, msg) {
  assert(Math.abs(a - b) < 1e-6, msg ?? `${a} ≈ ${b}`);
}

function poseIs(rec, which, x, y, msg) {
  const p = rec.waypoints ? pose(rec, which) : { x: rec.x, y: rec.y };
  near(p.x, x, `${msg ?? rec.id} ${which} x`);
  near(p.y, y, `${msg ?? rec.id} ${which} y`);
}

// ── 1. Moving Path B start rewrites Path A end only; C stays put
{
  const paths = [
    path('A', [0, 0], [1, 0], [0.5, 0]),
    path('B', [1, 0], [2, 0]),
    path('C', [2, 0], [3, 0]),
  ];
  const afterB = path('B', [1, 1], [2, 0]);
  assert(changedEndpoints('path', paths[1], afterB).join() === 'start', 'B start is the changed end');
  const { paths: next } = propagateChainLinks(
    { paths: [paths[0], afterB, paths[2]], points: [], autos: [auto('auto1', [
      slot('sA', 'path', 'A'), slot('sB', 'path', 'B'), slot('sC', 'path', 'C'),
    ])] },
    [{ kind: 'path', id: 'B', ends: ['start'] }],
  );
  poseIs(find(next, 'A'), 'end', 1, 1, 'A end follows B start');
  poseIs(find(next, 'A'), 'start', 0, 0, 'A start stays');
  near(find(next, 'A').waypoints[1].x, 0.5, 'A mid x stays');
  near(find(next, 'A').waypoints[1].y, 0, 'A mid stays');
  poseIs(find(next, 'B'), 'end', 2, 0, 'B end stays');
  poseIs(find(next, 'C'), 'start', 2, 0, 'C start stays');
  poseIs(find(next, 'C'), 'end', 3, 0, 'C end stays');
}

// ── 2. Moving Path B end rewrites Path C start only
{
  const paths = [
    path('A', [0, 0], [1, 0]),
    path('B', [1, 0], [2, 1]),
    path('C', [2, 0], [3, 0], [2.5, 0]),
  ];
  const { paths: next } = propagateChainLinks(
    { paths, points: [], autos: [auto('auto1', [
      slot('sA', 'path', 'A'), slot('sB', 'path', 'B'), slot('sC', 'path', 'C'),
    ])] },
    [{ kind: 'path', id: 'B', ends: ['end'] }],
  );
  poseIs(find(next, 'C'), 'start', 2, 1, 'C start follows B end');
  poseIs(find(next, 'C'), 'end', 3, 0, 'C end stays');
  near(find(next, 'C').waypoints[1].x, 2.5, 'C mid x stays');
  near(find(next, 'C').waypoints[1].y, 0, 'C mid stays');
  poseIs(find(next, 'A'), 'end', 1, 0, 'A end stays');
  poseIs(find(next, 'B'), 'start', 1, 0, 'B start stays');
}

// ── 3. Cross-auto: Path B in two autos; both previous paths' ends follow
{
  const paths = [
    path('A', [0, 0], [1, 0]),
    path('B', [1, 1], [2, 0]),
    path('D', [0, 5], [1, 0]),
  ];
  const { paths: next } = propagateChainLinks(
    { paths, points: [], autos: [
      auto('auto1', [slot('sA', 'path', 'A'), slot('sB', 'path', 'B')]),
      auto('auto2', [slot('sD', 'path', 'D'), slot('sB2', 'path', 'B')]),
    ] },
    [{ kind: 'path', id: 'B', ends: ['start'] }],
  );
  poseIs(find(next, 'A'), 'end', 1, 1, 'Auto1 A end follows');
  poseIs(find(next, 'D'), 'end', 1, 1, 'Auto2 D end follows');
  poseIs(find(next, 'A'), 'start', 0, 0, 'A start stays');
  poseIs(find(next, 'D'), 'start', 0, 5, 'D start stays');
}

// ── 3b. Cascade: A→B in auto1 and A→E in auto3; rewriting A end also rewrites E start
{
  const paths = [
    path('A', [0, 0], [1, 0]),
    path('B', [1, 1], [2, 0]),
    path('E', [1, 0], [4, 0]),
  ];
  const { paths: next } = propagateChainLinks(
    { paths, points: [], autos: [
      auto('auto1', [slot('sA', 'path', 'A'), slot('sB', 'path', 'B')]),
      auto('auto3', [slot('sA3', 'path', 'A'), slot('sE', 'path', 'E')]),
    ] },
    [{ kind: 'path', id: 'B', ends: ['start'] }],
  );
  poseIs(find(next, 'A'), 'end', 1, 1, 'A end follows B start');
  poseIs(find(next, 'E'), 'start', 1, 1, 'E start follows A end across autos');
  poseIs(find(next, 'E'), 'end', 4, 0, 'E end stays');
  poseIs(find(next, 'A'), 'start', 0, 0, 'A start stays');
}

// ── 4. Path then Point: moving the path end does NOT yank the point
{
  const paths = [path('A', [0, 0], [1, 0])];
  const points = [point('P', 4, 4)];
  const { paths: nextPaths, points: nextPoints } = propagateChainLinks(
    { paths, points, autos: [auto('auto1', [slot('sA', 'path', 'A'), slot('sP', 'point', 'P')])] },
    [{ kind: 'path', id: 'A', ends: ['end'] }],
  );
  poseIs(find(nextPaths, 'A'), 'end', 1, 0, 'A end unchanged by empty follow');
  near(find(nextPoints, 'P').x, 4, 'point x stays');
  near(find(nextPoints, 'P').y, 4, 'point y stays');
}

// ── 5. Point then Path: moving the point rewrites the next path's start
{
  const paths = [path('B', [1, 0], [2, 0])];
  const points = [point('P', 3, 3)];
  const { paths: next } = propagateChainLinks(
    { paths, points, autos: [auto('auto1', [slot('sP', 'point', 'P'), slot('sB', 'path', 'B')])] },
    [{ kind: 'point', id: 'P', ends: ['start', 'end'] }],
  );
  poseIs(find(next, 'B'), 'start', 3, 3, 'B start follows the point');
  poseIs(find(next, 'B'), 'end', 2, 0, 'B end stays');
}

// ── 5b. Slot refs by display name / slug still stitch the next path start
{
  const pathA = { ...path('path-a', [0, 0], [1, 0]), name: 'Path A' };
  const pathB = { ...path('path-b', [9, 9], [2, 0]), name: 'Path B' };
  const movedA = { ...path('path-a', [0, 0], [4, 5]), name: 'Path A' };
  const { paths: next } = propagateChainLinks(
    { paths: [movedA, pathB], points: [], autos: [auto('auto1', [
      { id: 'sA', type: 'path', pathId: 'Path_A', skip: false },
      { id: 'sB', type: 'path', pathId: 'Path B', skip: false },
    ])] },
    [{ kind: 'path', id: 'path-a', ends: ['end'] }],
  );
  poseIs(find(next, 'path-b'), 'start', 4, 5, 'B start follows via name/slug ref');
  poseIs(find(next, 'path-b'), 'end', 2, 0, 'B end stays');
}

// ── 6. Moving a path start when previous is a point moves the point
{
  const paths = [path('B', [5, 5], [2, 0])];
  const points = [point('P', 1, 1)];
  const { points: nextPoints } = propagateChainLinks(
    { paths, points, autos: [auto('auto1', [slot('sP', 'point', 'P'), slot('sB', 'path', 'B')])] },
    [{ kind: 'path', id: 'B', ends: ['start'] }],
  );
  near(find(nextPoints, 'P').x, 5, 'point follows B start x');
  near(find(nextPoints, 'P').y, 5, 'point follows B start y');
}

// ── 7. hasLinkedStart / gaps
{
  const seq = [slot('sA', 'path', 'A'), slot('sB', 'path', 'B')];
  assert(!hasLinkedStart(seq, 'sA'), 'first slot is not linked');
  assert(hasLinkedStart(seq, 'sB'), 'second slot is linked');
  const gapped = [
    path('A', [0, 0], [1, 0]),
    path('B', [9, 9], [10, 0]),
  ];
  const gaps = chainLinkGaps(seq, { paths: gapped, points: [] });
  assert(gaps.sB != null, 'gap flagged when B start ≠ A end');
  const stitched = [
    path('A', [0, 0], [1, 0]),
    path('B', [1, 0], [10, 0]),
  ];
  const none = chainLinkGaps(seq, { paths: stitched, points: [] });
  assert(none.sB == null, 'no gap when joints coincide');
}

// ── 8. Heading is part of the joint
{
  const paths = [path('A', [0, 0], [1, 0]), path('B', [1, 0], [5, 0])];
  const autos = [auto('auto1', [slot('sA', 'path', 'A'), slot('sB', 'path', 'B')])];

  // Turning A's end turns B's start to match, without moving either.
  const turnedA = {
    ...paths[0],
    waypoints: paths[0].waypoints.map((w, i) => (i === 1 ? { ...w, rotation: 90 } : w)),
  };
  const ends = changedEndpoints('path', paths[0], turnedA);
  assert(ends.length === 1 && ends[0] === 'end', 'a heading-only edit counts as an endpoint change');
  const turned = propagateChainLinks(
    { paths: [turnedA, paths[1]], points: [], autos },
    [{ kind: 'path', id: 'A', ends }],
  );
  near(pose(find(turned.paths, 'B'), 'start').rotation, 90, 'B start heading follows A end');
  poseIs(find(turned.paths, 'B'), 'start', 1, 0, 'B start stays put while turning');
  near(pose(find(turned.paths, 'B'), 'end').rotation, 0, 'B far end keeps its own heading');

  // A Point turns the path that leaves it, since that path starts on the point.
  const pt = { ...point('P', 0, 0), rotation: 140 };
  const leaving = path('C', [0, 0], [3, 3]);
  const ptAutos = [auto('auto2', [slot('sP', 'point', 'P'), slot('sC', 'path', 'C')])];
  const linked = propagateChainLinks(
    { paths: [leaving], points: [pt], autos: ptAutos },
    [{ kind: 'point', id: 'P', ends: ['start', 'end'] }],
  );
  near(pose(find(linked.paths, 'C'), 'start').rotation, 140, 'path leaving a point takes its heading');

  // A move with no heading given leaves the heading alone.
  const moved = propagateChainLinks(
    { paths: [path('D', [0, 0], [1, 0]), turnedA], points: [], autos: [] },
    [],
  );
  assert(moved.paths[1] === turnedA, 'no seeds means no rewrite');
}

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('chainLinks tests passed');
