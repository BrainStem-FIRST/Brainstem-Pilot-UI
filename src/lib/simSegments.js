import { generateTrajectory, buildAutoChain } from './trajectoryMath';

/** Resolve which visual bindings (subsystem names) are currently "shown" at a given simTime. */
export function resolveVisibleVisuals(segments, subsystemConfigs, robotSubsystems, simTime) {
  const visibilityMap = {};
  (robotSubsystems ?? []).forEach(sub => {
    if (sub.visibleOnStart) visibilityMap[sub.name] = true;
  });

  let elapsed = 0;
  for (const seg of segments) {
    const dur = seg.duration ?? 0;
    const segStart = elapsed;
    const segEnd = elapsed + dur;

    if (seg.type === 'subsystem' || seg.type === 'parallel') {
      const cmdsToCheck = seg.type === 'subsystem'
        ? [{ subsystemName: seg.subsystemName, commandName: seg.commandName }]
        : (seg.parallelSubs ?? []).filter(s => s.type === 'subsystem');

      if (segStart < simTime) {
        cmdsToCheck.forEach(cmd => {
          const sys = subsystemConfigs.find(s => s.name === cmd.subsystemName);
          const cmdDef = sys?.commands?.find(c => c.name === cmd.commandName);
          if (cmdDef?.visualBinding && cmdDef.visualBinding !== 'none') {
            const action = cmdDef.visualAction ?? 'show';
            visibilityMap[cmdDef.visualBinding] = action === 'show';
          }
        });
      }
    }

    if ((seg.type === 'path' || seg.type === 'point') && seg.trajectory) {
      (seg.subsystemTriggers ?? []).forEach(trig => {
        const trigTime = segStart + (trig.progress ?? 0) * dur;
        if (trigTime > 0 && trigTime <= simTime) {
          const sys = subsystemConfigs.find(s => s.name === trig.subsystemName);
          const cmdDef = sys?.commands?.find(c => c.name === trig.commandName);
          if (cmdDef?.visualBinding && cmdDef.visualBinding !== 'none') {
            const action = cmdDef.visualAction ?? 'show';
            visibilityMap[cmdDef.visualBinding] = action === 'show';
          }
        }
      });
    }

    if (simTime < segEnd) break;
    elapsed += dur;
  }
  return visibilityMap;
}

export function wrapAngle(degrees) {
  let angle = degrees;
  while (angle > 180) angle -= 360;
  while (angle <= -180) angle += 360;
  return angle;
}

/** Resolve an Auto's sequence + shared paths/points into flat, timed playback segments. */
export function buildSegments(auto, paths, points, constraints) {
  const resolved = buildAutoChain(auto?.sequence ?? [], { paths, points });
  const segs = [];
  const rotationTargets = [];

  for (const slot of resolved) {
    if (slot.skip) continue;

    if (slot.type === 'path') {
      if (!slot.chainedWaypoints || slot.chainedWaypoints.length < 2) continue;
      const pathRotationTargets = slot.path?.rotationTargets ?? [];
      const traj = generateTrajectory(slot.chainedWaypoints, constraints, pathRotationTargets);
      if (traj) {
        rotationTargets.push(...pathRotationTargets);
        segs.push({
          cmdId: slot.id,
          type: 'path',
          label: slot.path?.name ?? 'Path',
          trajectory: traj,
          duration: traj.totalTime,
          subsystemTriggers: slot.path?.subsystemTriggers ?? [],
          startSide: slot.path?.startSide === 'L' ? 'L' : 'R',
        });
      }
    } else if (slot.type === 'point') {
      if (!slot.chainedWaypoints || slot.chainedWaypoints.length < 2) continue;
      const traj = generateTrajectory(slot.chainedWaypoints, constraints, []);
      if (traj) {
        segs.push({
          cmdId: slot.id,
          type: 'point',
          label: slot.point?.name ? `→ ${slot.point.name}` : 'Point',
          trajectory: traj,
          duration: traj.totalTime,
          subsystemTriggers: slot.subsystemTriggers ?? [],
          startSide: 'R',
        });
      }
    } else if (slot.type === 'wait') {
      segs.push({ cmdId: slot.id, type: 'wait', label: 'Wait', duration: slot.duration ?? 0 });
    } else if (slot.type === 'subsystem') {
      segs.push({ cmdId: slot.id, type: 'subsystem', label: slot.subsystemName || 'Subsystem', subsystemName: slot.subsystemName, commandName: slot.commandName, duration: 0.02 });
    } else if (slot.type === 'parallel') {
      const maxDur = Math.max(0.02, ...(slot.parallelSubs ?? []).map(s => s.type === 'wait' ? (s.defaultWait ?? 0) : 0.02));
      segs.push({ cmdId: slot.id, type: 'parallel', label: 'Parallel', duration: maxDur, parallelSubs: slot.parallelSubs ?? [] });
    }
  }
  return { segments: segs, rotationTargets };
}

/** Same as buildSegments, but reuses an already-resolved+trajectoried chain (e.g. from AutoWorkspace). */
export function chainToSegments(chain) {
  const segs = [];
  for (const slot of chain ?? []) {
    if (slot.skip) continue;
    if (slot.type === 'path') {
      if (!slot.trajectory) continue;
      segs.push({
        cmdId: slot.id,
        type: 'path',
        label: slot.path?.name ?? 'Path',
        trajectory: slot.trajectory,
        duration: slot.trajectory.totalTime,
        subsystemTriggers: slot.path?.subsystemTriggers ?? [],
        startSide: slot.path?.startSide === 'L' ? 'L' : 'R',
      });
    } else if (slot.type === 'point') {
      if (!slot.trajectory) continue;
      segs.push({
        cmdId: slot.id,
        type: 'point',
        label: slot.point?.name ? `→ ${slot.point.name}` : 'Point',
        trajectory: slot.trajectory,
        duration: slot.trajectory.totalTime,
        subsystemTriggers: slot.subsystemTriggers ?? [],
        startSide: 'R',
      });
    } else if (slot.type === 'wait') {
      segs.push({ cmdId: slot.id, type: 'wait', label: 'Wait', duration: slot.duration ?? 0 });
    } else if (slot.type === 'subsystem') {
      segs.push({ cmdId: slot.id, type: 'subsystem', label: slot.subsystemName || 'Subsystem', subsystemName: slot.subsystemName, commandName: slot.commandName, duration: 0.02 });
    } else if (slot.type === 'parallel') {
      const maxDur = Math.max(0.02, ...(slot.parallelSubs ?? []).map(s => s.type === 'wait' ? (s.defaultWait ?? 0) : 0.02));
      segs.push({ cmdId: slot.id, type: 'parallel', label: 'Parallel', duration: maxDur, parallelSubs: slot.parallelSubs ?? [] });
    }
  }
  return segs;
}
