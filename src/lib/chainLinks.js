// Keeps the joints between positional slots stitched together across *every* Auto.
//
// A path's start has no independent location — it *is* the previous positional
// slot's end. Those two handles are one live joint, not two copies. Moving either
// side writes the new pose into the adjacent endpoint (the next path's start, or
// the previous path's end) in every Auto that uses the edited path, then walks
// *their* neighbours until the chain is connected again.
//
// A joint carries the robot's whole pose — position *and* heading — so the two sides of a
// joint always agree on which way the robot is facing there, just as buildAutoChain draws it.
//
// Only the connecting waypoint is rewritten — the rest of each neighbour keeps the
// shape it was drawn with. A following Point is a destination the robot drives to,
// so a path's end is *not* coincident with it.

const EPS = 1e-6;
/** Headings equal to within this many degrees count as the same. */
const EPS_ANGLE = 1e-4;

function safeId(name) {
  return (name ?? '').trim().replace(/\s+/g, '_');
}

function slug(value) {
  return (value ?? '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function matchesRef(record, targetId) {
  if (!record || targetId == null || targetId === '') return false;
  const target = String(targetId);
  const name = (record.name ?? '').trim();
  const recordSlugs = [
    String(record._id ?? ''),
    String(record.id ?? ''),
    safeId(name),
    slug(name),
  ].filter(Boolean);
  const targetSlugs = [target, safeId(target), slug(target)].filter(Boolean);
  return recordSlugs.some(s => targetSlugs.includes(s));
}

function findPath(paths, id) {
  return (paths ?? []).find(p => matchesRef(p, id)) ?? null;
}

function findPoint(points, id) {
  return (points ?? []).find(p => matchesRef(p, id)) ?? null;
}

/** Endpoints closer than this count as joined. Native field units, so ~1cm for FRC. */
export const DEFAULT_LINK_TOLERANCE = 0.01;

const otherEnd = which => (which === 'start' ? 'end' : 'start');

/** Slots that hold a position; the rest of a sequence passes the running pose through. */
export function positionalSlots(sequence) {
  return (sequence ?? []).filter(s => !s.skip && (s.type === 'path' || s.type === 'point'));
}

function slotRefId(slot) {
  return slot.type === 'path' ? slot.pathId : slot.pointId;
}

function slotTargets(slot, kind, rec) {
  return slot.type === kind && matchesRef(rec, slotRefId(slot));
}

function resolveSlot(slot, paths, points) {
  return slot.type === 'path' ? findPath(paths, slot.pathId) : findPoint(points, slot.pointId);
}

function recordKey(rec, fallback) {
  return String(rec?.id ?? rec?._id ?? fallback ?? '');
}

function sameRecord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aId = a.id ?? a._id;
  const bId = b.id ?? b._id;
  if (aId != null && bId != null && String(aId) === String(bId)) return true;
  return matchesRef(a, bId) || matchesRef(b, aId)
    || matchesRef(a, b.name) || matchesRef(b, a.name);
}

/** Previous positional slot, or null when `slotId` is first (or not in the sequence). */
export function previousPositionalSlot(sequence, slotId) {
  const slots = positionalSlots(sequence);
  const i = slots.findIndex(s => s.id === slotId);
  return i > 0 ? slots[i - 1] : null;
}

/** True when this slot's start is defined by the previous slot's end. */
export function hasLinkedStart(sequence, slotId) {
  return previousPositionalSlot(sequence, slotId) != null;
}

/** Stored (authored) pose at one end of a record; a point is both of its own ends. */
export function recordEndpoint(kind, rec, which) {
  if (!rec) return null;
  if (kind !== 'path') return { x: rec.x ?? 0, y: rec.y ?? 0, rotation: rec.rotation ?? 0 };
  const wps = rec.waypoints ?? [];
  if (wps.length === 0) return null;
  const wp = which === 'start' ? wps[0] : wps[wps.length - 1];
  return { x: wp.x ?? 0, y: wp.y ?? 0, rotation: wp.rotation ?? 0 };
}

function isSamePosition(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

/** Shortest angle between two headings, so 179° and -179° read as 2° apart. */
function angleDelta(a, b) {
  const diff = (((b - a) % 360) + 540) % 360 - 180;
  return Math.abs(diff);
}

/** Position *and* heading — what a joint actually pins down. */
function isSamePose(a, b) {
  if (!isSamePosition(a, b)) return false;
  return angleDelta(a.rotation ?? 0, b.rotation ?? 0) < EPS_ANGLE;
}

function shiftHandle(ctrl, dx, dy) {
  return ctrl ? { x: ctrl.x + dx, y: ctrl.y + dy } : ctrl ?? null;
}

/**
 * Slide an entire record by `(dx, dy)` so it keeps the shape it was drawn with. A path's
 * waypoints and Bézier handles all move together; a point is just its pose.
 */
export function translateRecord(kind, rec, dx, dy) {
  if (!rec) return rec;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return rec;
  if (kind !== 'path') return { ...rec, x: (rec.x ?? 0) + dx, y: (rec.y ?? 0) + dy };
  return {
    ...rec,
    waypoints: (rec.waypoints ?? []).map(wp => ({
      ...wp,
      x: (wp.x ?? 0) + dx,
      y: (wp.y ?? 0) + dy,
      prevControl: shiftHandle(wp.prevControl, dx, dy),
      nextControl: shiftHandle(wp.nextControl, dx, dy),
    })),
  };
}

/**
 * Move one end of a record onto `pose`, returning the record unchanged when it is already
 * there. Heading travels with the joint — both sides of a connection face the same way — but
 * a `pose` with no `rotation` (a drag that only moved the robot) leaves the heading alone.
 */
export function setRecordEndpoint(kind, rec, which, pose) {
  if (!rec || !pose) return rec;
  const current = recordEndpoint(kind, rec, which);
  const target = { ...pose, rotation: pose.rotation ?? current?.rotation ?? 0 };
  if (isSamePose(current, target)) return rec;

  if (kind !== 'path') return { ...rec, x: target.x, y: target.y, rotation: target.rotation };

  const wps = rec.waypoints ?? [];
  if (wps.length === 0) return rec;
  const index = which === 'start' ? 0 : wps.length - 1;
  const wp = wps[index];
  const dx = target.x - (wp.x ?? 0);
  const dy = target.y - (wp.y ?? 0);
  return {
    ...rec,
    waypoints: wps.map((w, i) => (i === index ? {
      ...w,
      x: target.x,
      y: target.y,
      rotation: target.rotation,
      prevControl: shiftHandle(w.prevControl, dx, dy),
      nextControl: shiftHandle(w.nextControl, dx, dy),
    } : w)),
  };
}

/**
 * Which ends of a record an edit actually moved or turned — a point is both of its own ends,
 * so any change to it moves both at once.
 */
export function changedEndpoints(kind, before, after) {
  if (!before || !after) return [];
  if (kind !== 'path') {
    return isSamePose(before, after) ? [] : ['start', 'end'];
  }
  return ['start', 'end'].filter(which =>
    !isSamePose(recordEndpoint('path', before, which), recordEndpoint('path', after, which)));
}

/**
 * A path's end is not coincident with a following Point (the auto drives a connecting
 * segment to that destination). Every other sequence adjacency *is* a live joint:
 * path→path, and point→path (the next path starts on the point).
 */
function shouldFollowNeighbour(seedKind, which, neighbourSlot) {
  if (!neighbourSlot) return false;
  if (seedKind === 'point' && which === 'start') return false;
  if (seedKind === 'path' && which === 'end' && neighbourSlot.type === 'point') return false;
  return true;
}

/**
 * Pull every joint touching `seeds` back together, across all Autos.
 *
 * A seed is `{ kind, id, ends }`, where `ends` lists the endpoints that just moved: a moved
 * start rewrites the slot *before* it in each sequence (that slot's end), a moved end
 * rewrites the slot *after* (that slot's start). Only the connecting waypoint is updated.
 * Each (record, endpoint) is settled at most once, which both terminates cycles — an Auto
 * that revisits the same path — and makes the first joint to claim an endpoint win.
 *
 * Returns fresh `paths`/`points` arrays, or the ones passed in when nothing moved.
 */
export function propagateChainLinks({ paths = [], points = [], autos = [] }, seeds = []) {
  let nextPaths = paths;
  let nextPoints = points;
  const settled = new Set();
  const pulled = new Set();
  const queue = seeds.map(seed => ({ ...seed, ends: seed.ends ?? ['start', 'end'] }));

  const write = (kind, rec, updated) => {
    if (kind === 'path') nextPaths = nextPaths.map(r => (sameRecord(r, rec) ? updated : r));
    else nextPoints = nextPoints.map(r => (sameRecord(r, rec) ? updated : r));
  };

  while (queue.length > 0) {
    const seed = queue.shift();
    const rec = seed.kind === 'path' ? findPath(nextPaths, seed.id) : findPoint(nextPoints, seed.id);
    if (!rec) continue;

    for (const which of seed.ends) {
      const pullKey = `${seed.kind}:${recordKey(rec, seed.id)}:${which}`;
      if (pulled.has(pullKey)) continue;
      pulled.add(pullKey);

      for (const auto of autos) {
        const slots = positionalSlots(auto.sequence);
        slots.forEach((slot, i) => {
          if (!slotTargets(slot, seed.kind, rec)) return;

          const neighbourSlot = which === 'start' ? slots[i - 1] : slots[i + 1];
          if (!shouldFollowNeighbour(seed.kind, which, neighbourSlot)) return;
          const joint = recordEndpoint(seed.kind, rec, which);
          const neighbour = resolveSlot(neighbourSlot, nextPaths, nextPoints);
          if (!joint || !neighbour) return;

          // The neighbour meets us with its opposite end: our start joins their end.
          const neighbourEnd = otherEnd(which);
          const neighbourId = recordKey(neighbour, slotRefId(neighbourSlot));
          const key = `${neighbourSlot.type}:${neighbourId}:${neighbourEnd}`;
          if (settled.has(key)) return;
          settled.add(key);

          const updated = setRecordEndpoint(neighbourSlot.type, neighbour, neighbourEnd, joint);
          if (updated === neighbour) return;
          write(neighbourSlot.type, neighbour, updated);
          // Only the connecting end moved; walk that joint in every other Auto.
          queue.push({
            kind: neighbourSlot.type,
            id: neighbour.id ?? slotRefId(neighbourSlot),
            ends: [neighbourEnd],
          });
        });
      }
    }
  }

  return { paths: nextPaths, points: nextPoints };
}

/**
 * Gaps in one Auto's sequence, keyed by the slot that starts away from where the previous
 * one ends — which is what reordering a sequence leaves behind, since moving a slot gives it
 * new neighbours without moving any coordinates.
 */
export function chainLinkGaps(sequence, { paths = [], points = [], tolerance = DEFAULT_LINK_TOLERANCE } = {}) {
  const slots = positionalSlots(sequence);
  const gaps = {};
  for (let i = 1; i < slots.length; i++) {
    const prevSlot = slots[i - 1];
    const slot = slots[i];
    // A path ending into a point is a connecting segment, not a coincident joint.
    if (prevSlot.type === 'path' && slot.type === 'point') continue;
    const prevRec = resolveSlot(prevSlot, paths, points);
    const rec = resolveSlot(slot, paths, points);
    if (!prevRec || !rec) continue;
    const prevEnd = recordEndpoint(prevSlot.type, prevRec, 'end');
    const start = recordEndpoint(slot.type, rec, 'start');
    if (!prevEnd || !start) continue;
    const distance = Math.hypot(start.x - prevEnd.x, start.y - prevEnd.y);
    if (distance > tolerance) {
      gaps[slot.id] = { distance, previousName: prevRec.name ?? 'the previous slot' };
    }
  }
  return gaps;
}
