import { buildAutoChain } from './trajectoryMath.js';

function endPoseOf(slot) {
  if (slot.type === 'path') {
    const wps = slot.chainedWaypoints ?? slot.path?.waypoints;
    if (!wps?.length) return null;
    const last = wps[wps.length - 1];
    return { x: last.x, y: last.y, rotation: last.rotation ?? 0 };
  }
  if (slot.type === 'point' && slot.point) {
    return { x: slot.point.x ?? 0, y: slot.point.y ?? 0, rotation: slot.rotation ?? slot.point.rotation ?? 0 };
  }
  return null;
}

function startPoseOf(slot) {
  if (slot.type === 'path') {
    // Authored (unchained) start — chaining would have snapped it to whatever
    // currently precedes it, which is the slot being inserted.
    const wps = slot.path?.waypoints;
    if (!wps?.length) return null;
    const first = wps[0];
    return { x: first.x, y: first.y, rotation: first.rotation ?? 0 };
  }
  if (slot.type === 'point' && slot.point) {
    return { x: slot.point.x ?? 0, y: slot.point.y ?? 0, rotation: slot.rotation ?? slot.point.rotation ?? 0 };
  }
  return null;
}

/**
 * Starting waypoints for a path inserted at `insertIndex`: it begins where the previous
 * positional slot ends and finishes where the next one starts. A missing neighbour (the
 * path is first or last in the sequence) falls back to the field origin.
 */
export function seedWaypointsForNewPath(sequence, insertIndex, { paths = [], points = [], fallbackSpan = 1 } = {}) {
  const chain = buildAutoChain(sequence ?? [], { paths, points });
  const index = Math.max(0, Math.min(chain.length, insertIndex));

  let start = null;
  for (let i = index - 1; i >= 0 && !start; i--) {
    if (chain[i].skip) continue;
    start = endPoseOf(chain[i]);
  }

  let end = null;
  for (let i = index; i < chain.length && !end; i++) {
    if (chain[i].skip) continue;
    end = startPoseOf(chain[i]);
  }

  const a = start ?? { x: 0, y: 0, rotation: end?.rotation ?? 0 };
  let b = end ?? { x: 0, y: 0, rotation: start?.rotation ?? 0 };
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) b = { ...b, x: b.x + fallbackSpan };

  const dx = (b.x - a.x) / 3;
  const dy = (b.y - a.y) / 3;
  return [
    { x: a.x, y: a.y, rotation: a.rotation ?? 0, prevControl: null, nextControl: { x: a.x + dx, y: a.y + dy }, params: {} },
    { x: b.x, y: b.y, rotation: b.rotation ?? 0, prevControl: { x: b.x - dx, y: b.y - dy }, nextControl: null, params: {} },
  ];
}
