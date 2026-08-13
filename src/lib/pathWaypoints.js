/** Rename legacy param keys when loading or exporting saved paths. */
export function migrateWaypointParams(params) {
  if (!params || typeof params !== 'object') return {};
  const next = { ...params };
  if (Object.prototype.hasOwnProperty.call(next, 'maxLinearPow') && !Object.prototype.hasOwnProperty.call(next, 'maxLinearSpeed')) {
    next.maxLinearSpeed = next.maxLinearPow;
  }
  delete next.maxLinearPow;
  if (Object.prototype.hasOwnProperty.call(next, 'minLinearPow') && !Object.prototype.hasOwnProperty.call(next, 'minLinearSpeed')) {
    next.minLinearSpeed = next.minLinearPow;
  }
  delete next.minLinearPow;
  if (Object.prototype.hasOwnProperty.call(next, 'maxTurnSpeed') && !Object.prototype.hasOwnProperty.call(next, 'maxTurnPower')) {
    next.maxTurnPower = next.maxTurnSpeed;
  }
  delete next.maxTurnSpeed;
  return next;
}

/** Merge legacy index-keyed waypointParams into each waypoint; params stay on the waypoint object. */
export function normalizeSavedPath(pathRecord) {
  if (!pathRecord) return pathRecord;
  const legacy = pathRecord.waypointParams ?? {};
  const waypoints = (pathRecord.waypoints ?? []).map((w, i) => {
    const fromLegacy = legacy[i] ?? legacy[String(i)] ?? {};
    const params = migrateWaypointParams({ ...fromLegacy, ...(w.params ?? {}) });
    return { ...w, params };
  });
  return { ...pathRecord, waypoints };
}

export function normalizeSavedPaths(paths) {
  if (!Array.isArray(paths)) return [];
  return paths.map(normalizeSavedPath);
}

/** Metadata added to exported path JSON for league-specific consumers. */
export function getPathExportMetadata(projectType) {
  if (projectType === 'ftc') {
    return {
      coordinateSystem: 'pedro-center',
      units: 'in',
      headingUnit: 'deg',
      speedUnit: 'in/s',
      accelUnit: 'in/s²',
    };
  }
  return {
    coordinateSystem: 'frc-bottom-left',
    units: 'm',
    headingUnit: 'deg',
    speedUnit: 'm/s',
    accelUnit: 'm/s²',
  };
}

/** Format a waypoint for JSON export — params live on the waypoint, not by index. */
export function formatWaypointForExport(w, i, total, fmt4) {
  const wp = {
    x: fmt4(w.x),
    y: fmt4(w.y),
    prevControl: i === 0 ? null : (w.prevControl ? { x: fmt4(w.prevControl.x), y: fmt4(w.prevControl.y) } : null),
    nextControl: i === total - 1 ? null : (w.nextControl ? { x: fmt4(w.nextControl.x), y: fmt4(w.nextControl.y) } : null),
    rotation: fmt4(w.rotation ?? 0),
  };
  const params = migrateWaypointParams(w.params ?? {});
  if (Object.keys(params).length > 0) wp.params = params;
  return wp;
}

export const WAYPOINT_CLIPBOARD_PREFIX = 'brainstem-waypoint:';

/** Serialize a waypoint for system clipboard copy/paste between paths. */
export function serializeWaypointForClipboard(wp) {
  const params = migrateWaypointParams(wp.params ?? {});
  const payload = {
    x: wp.x,
    y: wp.y,
    rotation: wp.rotation ?? 0,
    prevControl: wp.prevControl ? { x: wp.prevControl.x, y: wp.prevControl.y } : null,
    nextControl: wp.nextControl ? { x: wp.nextControl.x, y: wp.nextControl.y } : null,
  };
  if (Object.keys(params).length > 0) payload.params = params;
  return WAYPOINT_CLIPBOARD_PREFIX + JSON.stringify(payload);
}

/** Parse clipboard text copied from serializeWaypointForClipboard. */
export function parseWaypointFromClipboard(text) {
  if (!text?.startsWith(WAYPOINT_CLIPBOARD_PREFIX)) return null;
  try {
    const raw = JSON.parse(text.slice(WAYPOINT_CLIPBOARD_PREFIX.length));
    if (typeof raw.x !== 'number' || typeof raw.y !== 'number') return null;
    return {
      x: raw.x,
      y: raw.y,
      rotation: raw.rotation ?? 0,
      prevControl: raw.prevControl ?? null,
      nextControl: raw.nextControl ?? null,
      params: migrateWaypointParams(raw.params ?? {}),
    };
  } catch {
    return null;
  }
}

/** Insert a pasted waypoint into an existing waypoint list. */
export function insertPastedWaypoint(waypoints, wp, insertIndex) {
  const total = waypoints.length + 1;
  const isFirst = insertIndex === 0;
  const isLast = insertIndex === waypoints.length;

  const adapted = {
    x: wp.x,
    y: wp.y,
    rotation: wp.rotation ?? 0,
    params: migrateWaypointParams(wp.params ?? {}),
    prevControl: isFirst ? null : (wp.prevControl ?? null),
    nextControl: isLast ? null : (wp.nextControl ?? null),
  };

  if (waypoints.length === 0) return [adapted];

  const next = [...waypoints];

  if (isLast) {
    const prev = next[insertIndex - 1];
    const dx = (adapted.x - prev.x) / 3;
    const dy = (adapted.y - prev.y) / 3;
    next[insertIndex - 1] = {
      ...prev,
      nextControl: prev.nextControl ?? { x: prev.x + dx, y: prev.y + dy },
    };
    adapted.prevControl = adapted.prevControl ?? { x: adapted.x - dx, y: adapted.y - dy };
    adapted.nextControl = null;
  } else if (isFirst) {
    const after = next[0];
    const dx = (after.x - adapted.x) / 3;
    const dy = (after.y - adapted.y) / 3;
    adapted.nextControl = adapted.nextControl ?? { x: adapted.x + dx, y: adapted.y + dy };
    next[0] = {
      ...after,
      prevControl: after.prevControl ?? { x: after.x - dx, y: after.y - dy },
    };
  } else {
    const before = next[insertIndex - 1];
    const after = next[insertIndex];
    adapted.prevControl = adapted.prevControl ?? {
      x: before.x + (adapted.x - before.x) / 3,
      y: before.y + (adapted.y - before.y) / 3,
    };
    adapted.nextControl = adapted.nextControl ?? {
      x: adapted.x + (after.x - adapted.x) / 3,
      y: adapted.y + (after.y - adapted.y) / 3,
    };
    next[insertIndex - 1] = {
      ...before,
      nextControl: before.nextControl ?? {
        x: before.x + (adapted.x - before.x) / 3,
        y: before.y + (adapted.y - before.y) / 3,
      },
    };
    next[insertIndex] = {
      ...after,
      prevControl: after.prevControl ?? {
        x: after.x + (adapted.x - after.x) / 3,
        y: after.y + (adapted.y - after.y) / 3,
      },
    };
  }

  next.splice(insertIndex, 0, adapted);
  return next;
}
