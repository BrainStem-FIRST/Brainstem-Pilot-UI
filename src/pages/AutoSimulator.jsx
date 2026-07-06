import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play, Square, RotateCcw, Zap, Clock, GitBranch, ChevronDown } from 'lucide-react';
import { generateTrajectory, getPoseAtProgress, mirrorTrajectoryFieldSide, chainPathToPose } from '../lib/trajectoryMath';
import { fieldToPixels, computeFieldLayout, drawFieldImage, getDefaultSimulatorView, clampPan } from '../lib/fieldCoordinates';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import { readEntity } from '../lib/dataService';

// Resolve which visual bindings (subsystem names) are currently "shown" at a given simTime
function resolveVisibleVisuals(segments, subsystemConfigs, robotSubsystems, simTime) {
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

    if (seg.type === 'path' && seg.trajectory) {
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

function drawStar(ctx, cx, cy, r, color) {
  const spikes = 5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function SimCanvas({ segments, robotSettings, simTime, visibleVisuals, robotSubsystems, bounds, imageUrl, activeField, alliance }) {
  const canvasRef = useRef(null);
  const [fieldImage, setFieldImage] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const viewIsDefaultRef = useRef(false);
  const prevAllianceRef = useRef(alliance);

  const getCanvasSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0 };
    return { w: c.width, h: c.height };
  }, []);

  const applyDefaultView = useCallback(() => {
    const { w, h } = getCanvasSize();
    if (!w || !h) return;
    const view = getDefaultSimulatorView(w, h, activeField, alliance);
    setZoom(view.zoom);
    panRef.current = view.pan;
    setPan(view.pan);
    viewIsDefaultRef.current = true;
  }, [activeField, alliance, getCanvasSize]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setFieldImage(img);
  }, [imageUrl]);

  const lastPoseRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const layout = computeFieldLayout(W, H, pan, zoom, activeField);
    const toPx = (x, y) => fieldToPixels(x, y, W, H, pan, zoom, activeField);

    if (fieldImage) {
      drawFieldImage(ctx, fieldImage, layout);
    } else {
      const { px: x0, py: y0 } = toPx(bounds.xMin, bounds.yMin);
      const { px: x1, py: y1 } = toPx(bounds.xMax, bounds.yMax);
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    const starColors = ['#a855f7', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];
    let elapsed = 0;
    segments.forEach((seg, si) => {
      if (!seg.trajectory) { elapsed += seg.duration ?? 0; return; }
      const isActive = simTime >= elapsed && simTime < elapsed + (seg.duration ?? 0);
      const pts = seg.trajectory.states;
      if (!pts || pts.length === 0) return;
      
      ctx.beginPath();
      const { px, py } = toPx(pts[0].x, pts[0].y);
      ctx.moveTo(px, py);
      for (let i = 1; i < pts.length; i++) {
        const { px: nx, py: ny } = toPx(pts[i].x, pts[i].y);
        ctx.lineTo(nx, ny);
      }
      ctx.strokeStyle = isActive ? 'rgba(86,180,100,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = isActive ? 4 : 2.5;
      ctx.shadowColor = isActive ? 'rgba(86,180,100,0.8)' : 'rgba(255,255,255,0.2)';
      ctx.shadowBlur = isActive ? 16 : 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const dotColor = isActive ? '#56b464' : '#ffffff';
      const { px: startPx, py: startPy } = toPx(pts[0].x, pts[0].y);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(startPx, startPy, 3, 0, Math.PI * 2);
      ctx.fill();

      const lastPt = pts[pts.length - 1];
      const { px: endPx, py: endPy } = toPx(lastPt.x, lastPt.y);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(endPx, endPy, 3, 0, Math.PI * 2);
      ctx.fill();

      elapsed += seg.duration ?? 0;

      (seg.subsystemTriggers ?? []).forEach((trig, ti) => {
        const pose = getPoseAtProgress(seg.trajectory, trig.progress ?? 0);
        if (!pose) return;
        const { px: sx, py: sy } = toPx(pose.x, pose.y);
        drawStar(ctx, sx, sy, 8, starColors[ti % starColors.length]);
      });
    });

    const firstPathSeg = segments.find(s => s.trajectory);
    if (simTime === 0) {
      lastPoseRef.current = firstPathSeg ? getPoseAtProgress(firstPathSeg.trajectory, 0) : null;
    } else if (lastPoseRef.current === null && firstPathSeg) {
      lastPoseRef.current = getPoseAtProgress(firstPathSeg.trajectory, 0);
    }

    elapsed = 0;
    let currentPose = null;
    for (const seg of segments) {
      const dur = seg.duration ?? 0;
      if (simTime <= elapsed + dur) {
        if (seg.trajectory) {
          const progress = dur > 0 ? (simTime - elapsed) / dur : 0;
          currentPose = getPoseAtProgress(seg.trajectory, Math.min(1, Math.max(0, progress)));
        }
        break;
      }
      if (seg.trajectory) {
        lastPoseRef.current = getPoseAtProgress(seg.trajectory, 1);
      }
      elapsed += dur;
    }

    const pose = currentPose ?? lastPoseRef.current;

    if (pose) {
      const defaultRobotSize = activeField?.league === 'ftc' ? 18 : 0.76;
      const ROBOT_W_M = robotSettings?.width ?? defaultRobotSize;
      const ROBOT_H_M = robotSettings?.length ?? defaultRobotSize;
      const { px, py } = toPx(pose.x, pose.y);
      const { px: rx1 } = toPx(pose.x + ROBOT_W_M, pose.y);
      const { py: ry1 } = toPx(pose.x, pose.y - ROBOT_H_M);
      const rw = rx1 - px;
      const rh = ry1 - py;
      const scale = rw / ROBOT_W_M; 
      const rad = (-(pose.rotation ?? pose.heading ?? 0) * Math.PI) / 180;

      const activeVisuals = Object.entries(visibleVisuals ?? {}).filter(([, v]) => v).map(([k]) => k);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rad + Math.PI / 2);

      (robotSubsystems ?? []).forEach(sub => {
        if (!activeVisuals.includes(sub.name)) return;
        const sw = (sub.width ?? 0.2) * scale;
        const sh = (sub.length ?? 0.2) * scale;
        const sx = (sub.offsetX ?? 0) * scale - sw / 2;
        const sy = -(sub.offsetY ?? 0) * scale - sh / 2;
        ctx.fillStyle = 'rgba(168,85,247,0.55)';
        ctx.strokeStyle = 'rgba(220,160,255,1)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.shadowBlur = 0;
      });

      ctx.fillStyle = 'rgba(255,180,30,0.92)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, -rh / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
  }, [segments, simTime, visibleVisuals, robotSubsystems, robotSettings, bounds, fieldImage, activeField, canvasSize, zoom, pan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      setCanvasSize({ w: canvas.offsetWidth, h: canvas.offsetHeight });
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);
    updateSize();
    return () => ro.disconnect();
  }, [activeField]);

  const didInitialViewRef = useRef(false);

  useEffect(() => {
    if (!canvasSize.w || !canvasSize.h || didInitialViewRef.current) return;
    applyDefaultView();
    didInitialViewRef.current = true;
  }, [canvasSize, applyDefaultView]);

  useEffect(() => {
    if (prevAllianceRef.current === alliance) return;
    prevAllianceRef.current = alliance;
    if (viewIsDefaultRef.current) applyDefaultView();
  }, [alliance, applyDefaultView]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    viewIsDefaultRef.current = false;
    const { w, h } = getCanvasSize();
    if (!w || !h) return;
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom((z) => {
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        const newZoom = Math.max(0.5, Math.min(5, z * factor));
        const scaleDelta = newZoom - z;
        const dx = (mx - w / 2 - panRef.current.x) * (scaleDelta / z);
        const dy = (my - h / 2 - panRef.current.y) * (scaleDelta / z);
        const newPan = clampPan({ x: panRef.current.x - dx, y: panRef.current.y - dy }, newZoom, w, h, 0.15, activeField);
        panRef.current = newPan;
        setPan(newPan);
        return newZoom;
      });
    } else {
      const newPan = clampPan(
        { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY },
        zoom,
        w,
        h,
        0.15,
        activeField,
      );
      panRef.current = newPan;
      setPan(newPan);
    }
  }, [zoom, activeField, getCanvasSize]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ background: '#0d1117' }}
        onWheel={handleWheel}
      />
      <button
        type="button"
        onClick={applyDefaultView}
        className="absolute top-3 right-3 px-2.5 py-1 bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground rounded-lg transition-all backdrop-blur-sm"
      >
        Reset View
      </button>
    </div>
  );
}

function buildSegments(sk, ch, paths, constraints) {
  const overrideMap = Object.fromEntries((ch.commandOverrides ?? []).map(o => [o.cmdId, o]));
  const segs = [];
  let lastEndPose = null;
  let pathCount = 0;

  for (const cmd of (sk?.commands ?? [])) {
    const override = overrideMap[cmd.id] ?? {};
    if (override.skip) continue;
    if (cmd.type === 'path') {
      const pathId = override.pathId ?? cmd.pathId;
      const path = paths.find(p => p.id === pathId);
      if (path && (path.waypoints?.length ?? 0) >= 2) {
        let waypoints = path.waypoints;
        if (pathCount > 0 && lastEndPose) {
          waypoints = chainPathToPose(path.waypoints, lastEndPose);
        }
        const traj = generateTrajectory(waypoints, constraints, path.rotationTargets ?? []);
        if (traj) {
          lastEndPose = getPoseAtProgress(traj, 1);
          pathCount += 1;
          segs.push({
            cmdId: cmd.id,
            type: 'path',
            label: cmd.label || path.name,
            trajectory: traj,
            duration: traj.totalTime,
            subsystemTriggers: path.subsystemTriggers ?? [],
            startSide: path.startSide === 'L' ? 'L' : 'R',
          });
        }
      }
    } else if (cmd.type === 'wait') {
      const dur = override.waitDuration ?? cmd.defaultWait ?? 0;
      segs.push({ cmdId: cmd.id, type: 'wait', label: cmd.label || 'Wait', duration: dur });
    } else if (cmd.type === 'subsystem') {
      segs.push({ cmdId: cmd.id, type: 'subsystem', label: cmd.label || cmd.subsystemName, subsystemName: cmd.subsystemName, commandName: cmd.commandName, duration: 0.02 });
    } else if (cmd.type === 'parallel') {
      const maxDur = Math.max(0.02, ...(cmd.parallelSubs ?? []).map(s => s.type === 'wait' ? (s.defaultWait ?? 0) : 0.02));
      segs.push({ cmdId: cmd.id, type: 'parallel', label: cmd.label || 'Parallel', duration: maxDur, parallelSubs: cmd.parallelSubs ?? [] });
    }
  }
  return segs;
}

function wrapAngle(degrees) {
  let angle = degrees;
  while (angle > 180) angle -= 360;
  while (angle <= -180) angle += 360;
  return angle;
}

export default function AutoSimulator() {
  const navigate = useNavigate();
  const { id: urlId } = useParams();
  const { bounds, imageUrl, activeField } = useFieldConfig();
  const { isFrc, projectType } = useLeague();
  const [allChildren, setAllChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(urlId ?? null);
  const [child, setChild] = useState(null);
  const [segments, setSegments] = useState([]);
  const [robotSettings, setRobotSettings] = useState(null);
  const [subsystemConfigs, setSubsystemConfigs] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [alliance, setAlliance] = useState('blue');
  const [fieldSide, setFieldSide] = useState('R');
  const [rotationTargets, setRotationTargets] = useState([]);
  const animRef = useRef(null);
  const startRef = useRef(null);

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  const play = useCallback(() => {
    setSimTime(prev => {
      const t = prev >= totalTime - 0.01 ? 0 : prev;
      startRef.current = performance.now() - t * 1000;
      return t;
    });
    setIsPlaying(true);
  }, [totalTime]);

  const replay = useCallback(() => {
    stop();
    setSimTime(0);
    startRef.current = performance.now();
    setIsPlaying(true);
  }, [stop]);

  const reset = useCallback(() => { stop(); setSimTime(0); }, [stop]);

  useEffect(() => {
    Promise.all([
      readEntity('ChildAuto'),
      readEntity('RobotSettings'),
    ]).then(([children, rs]) => {
      const childList = Array.isArray(children) ? children : [];
      const rsList = Array.isArray(rs) ? rs : [];
      setAllChildren(childList);
      if (rsList[0]) setRobotSettings(rsList[0]);
      if (!urlId && childList.length > 0) {
        setSelectedChildId(childList[0].id);
      }
    });
  }, [urlId]);

  useEffect(() => {
    if (!selectedChildId) return;
    stop();
    setSimTime(0);
    setSegments([]);

    Promise.all([
      readEntity('ChildAuto'),
      readEntity('RobotSettings'),
      readEntity('SkeletonAuto'),
      readEntity('SavedAuto'),
      readEntity('SubsystemConfig'),
    ]).then(([children, rs, skeletons, paths, scList]) => {
      const childList = Array.isArray(children) ? children : [];
      const rsList = Array.isArray(rs) ? rs : [];
      const skList = Array.isArray(skeletons) ? skeletons : [];
      const pathList = Array.isArray(paths) ? paths : [];
      const scListArray = Array.isArray(scList) ? scList : [];

      const ch = childList.find(c => c.id === selectedChildId);
      if (!ch) return;
      setChild(ch);
      const sk = skList.find(s => s.id === ch.skeletonId);
      const rsettings = rsList[0];
      const motionDefaults = getMotionUnitsForLeague(projectType).defaultConstraints;
      const constraints = {
        maxVel: rsettings?.maxVel ?? motionDefaults.maxVel,
        maxAccel: rsettings?.maxAccel ?? motionDefaults.maxAccel,
      };
      const segs = buildSegments(sk, ch, pathList, constraints);
      setSegments(segs);
      const firstPath = segs.find(s => s.type === 'path');
      setFieldSide(firstPath?.startSide ?? 'R');
      setTotalTime(segs.reduce((s, seg) => s + (seg.duration ?? 0), 0));
      setSubsystemConfigs(scListArray[0]?.subsystems ?? []);
      setRotationTargets((sk?.commands ?? []).flatMap(cmd => {
        const pathId = (ch.commandOverrides ?? []).find(o => o.cmdId === cmd.id)?.pathId || cmd.pathId;
        const path = pathList.find(p => p.id === pathId);
        return path?.rotationTargets ?? [];
      }));
    });
  }, [selectedChildId, stop, projectType]);

  useEffect(() => {
    if (!isPlaying) return;
    if (!startRef.current) startRef.current = performance.now() - simTime * 1000;
    const tick = (ts) => {
      const elapsed = (ts - startRef.current) / 1000;
      const t = Math.min(elapsed, totalTime);
      setSimTime(t);
      if (t < totalTime) animRef.current = requestAnimationFrame(tick);
      else { setIsPlaying(false); startRef.current = null; }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, totalTime]);

  const seekToSegment = useCallback((segIndex) => {
    stop();
    let t = 0;
    for (let i = 0; i < segIndex; i++) t += segments[i]?.duration ?? 0;
    setSimTime(t);
    startRef.current = null;
  }, [segments, stop]);

  let elapsed = 0, activeSegIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (simTime <= elapsed + segments[i].duration) { activeSegIdx = i; break; }
    elapsed += segments[i].duration;
  }
  const activeCmd = segments[activeSegIdx];

  const displaySegments = segments.map(seg => {
    if (!seg.trajectory) return seg;

    let traj = seg.trajectory;
    if (isFrc && fieldSide !== (seg.startSide ?? 'R')) {
      traj = mirrorTrajectoryFieldSide(traj);
    }

    if (!isFrc || alliance === 'blue') {
      return { ...seg, trajectory: traj };
    }

    const { xMax, yMax } = bounds;
    const transformPointForRed = (p) => {
      const rawHeading = p.heading ?? p.rotation ?? 0;
      const rawRotation = p.rotation ?? p.heading ?? 0;
      
      return {
        ...p,
        x: xMax - p.x,
        y: yMax - p.y,
        heading: wrapAngle(rawHeading - 180),
        rotation: wrapAngle(rawRotation - 180),
      };
    };

    return {
      ...seg,
      trajectory: {
        ...traj,
        states: traj.states.map(transformPointForRed),
      },
      subsystemTriggers: seg.subsystemTriggers,
    };
  });

  const displayRotationTargets = !isFrc || alliance === 'blue'
    ? (rotationTargets ?? [])
    : (rotationTargets ?? []).map(t => ({
        ...t,
        rotation: wrapAngle(t.rotation - 180),
      }));

  if (allChildren.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border shrink-0">
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-xs font-medium">Home</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">No Variant Autos Created</p>
            <p className="text-sm text-muted-foreground">Create a variant auto to simulate</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border shrink-0 flex-wrap gap-y-1">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs font-medium">Home</span>
        </button>
        <div className="w-px h-5 bg-border" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">Previewing:</span>
          <div className="relative">
            <select
              value={selectedChildId ?? ''}
              onChange={e => setSelectedChildId(e.target.value)}
              className="bg-secondary/60 border border-border rounded-lg px-3 py-1 pr-7 text-sm font-semibold text-foreground outline-none focus:border-primary appearance-none cursor-pointer"
            >
              {allChildren.length === 0 && <option value="">No variant autos</option>}
              {allChildren.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {isFrc && (
            <>
              <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                <button
                  onClick={() => setFieldSide('L')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    fieldSide === 'L'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Left
                </button>
                <button
                  onClick={() => setFieldSide('R')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    fieldSide === 'R'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Right
                </button>
              </div>
              <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
                <button
                  onClick={() => setAlliance('blue')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    alliance === 'blue'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Blue
                </button>
                <button
                  onClick={() => setAlliance('red')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    alliance === 'red'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Red
                </button>
              </div>
            </>
          )}
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">Simulation</span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Field canvas + playback — fixed in view */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <SimCanvas
              segments={displaySegments}
              robotSettings={robotSettings}
              robotSubsystems={robotSettings?.subsystems ?? []}
              simTime={simTime}
              visibleVisuals={resolveVisibleVisuals(displaySegments, subsystemConfigs, robotSettings?.subsystems ?? [], simTime)}
              rotationTargets={displayRotationTargets}
              bounds={bounds}
              imageUrl={imageUrl}
              activeField={activeField}
              alliance={alliance}
            />
          </div>

          {/* Playback bar */}
          <div className="bg-card border-t border-border px-4 py-3 flex items-center gap-3 shrink-0">
            <button onClick={reset} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={isPlaying ? stop : (simTime >= totalTime - 0.01 && totalTime > 0 ? replay : play)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/80 transition-all">
              {isPlaying ? <><Square className="w-3.5 h-3.5" /> Stop</> : simTime >= totalTime - 0.01 && totalTime > 0 ? <><RotateCcw className="w-3.5 h-3.5" /> Replay</> : <><Play className="w-3.5 h-3.5" /> Play</>}
            </button>
            <input type="range" min={0} max={totalTime || 1} step={0.01} value={simTime}
              onChange={e => { stop(); startRef.current = null; setSimTime(parseFloat(e.target.value)); }}
              className="flex-1 accent-primary" />
            <span className="text-xs font-mono text-muted-foreground w-24 text-right">
              {simTime.toFixed(2)}s / {(totalTime || 0).toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Side panel — scrollable command sequence only */}
        <div className="w-60 bg-card border-l border-border shrink-0 flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Command Sequence</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Click to seek</p>
          </div>
          <div className="p-2 space-y-1 flex-1 min-h-0 overflow-y-auto">
            {segments.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-8">No segments loaded</p>
            )}
            {segments.map((seg, i) => {
              const isActive = i === activeSegIdx;
              const typeColors = { path: 'text-blue-400', subsystem: 'text-violet-400', wait: 'text-yellow-400', parallel: 'text-green-400' };
              return (
                <button key={seg.cmdId} onClick={() => seekToSegment(i)}
                  className={`w-full text-left flex flex-col gap-1 px-2.5 py-2 rounded-lg transition-all text-xs border ${isActive ? 'bg-primary/20 border-primary/40' : 'border-transparent hover:bg-secondary/50'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary animate-pulse' : 'bg-border'}`} />
                    <span className={`flex-1 truncate font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{seg.label || seg.type}</span>
                    <span className={`text-[9px] font-semibold ${typeColors[seg.type] ?? 'text-muted-foreground'}`}>{seg.type}</span>
                  </div>
                  {seg.type === 'parallel' && (seg.parallelSubs ?? []).length > 0 && (
                    <div className="ml-5 space-y-0.5">
                      {seg.parallelSubs.map((sub, si) => (
                        <div key={si} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="text-green-400/70">∥</span>
                          {sub.type === 'wait' ? `Wait ${sub.defaultWait ?? 0}s` : `${sub.subsystemName || '?'}${sub.commandName ? ' → ' + sub.commandName : ''}`}
                        </div>
                      ))}
                    </div>
                  )}
                  {seg.type === 'path' && (seg.subsystemTriggers ?? []).length > 0 && (
                    <div className="ml-5 space-y-0.5">
                      {seg.subsystemTriggers.map((t, ti) => (
                        <div key={ti} className="text-[10px] text-violet-400/80 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" />
                          {t.subsystemName}{t.commandName ? ' → ' + t.commandName : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  <span className="ml-3.5 text-[9px] text-muted-foreground/60">{seg.duration?.toFixed(1)}s</span>
                </button>
              );
            })}
          </div>

          {activeCmd?.type === 'subsystem' && (
            <div className="m-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl shrink-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-violet-400">Subsystem Active</span>
              </div>
              <p className="text-xs text-foreground font-medium">{activeCmd.subsystemName}</p>
              {activeCmd.commandName && <p className="text-[10px] text-muted-foreground mt-0.5">→ {activeCmd.commandName}</p>}
            </div>
          )}
          {activeCmd?.type === 'wait' && (
            <div className="m-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-400">Waiting…</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{activeCmd.duration.toFixed(1)}s</p>
            </div>
          )}
          {activeCmd?.type === 'parallel' && (
            <div className="m-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl shrink-0">
              <div className="flex items-center gap-1.5 mb-1">
                <GitBranch className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs font-semibold text-green-400">Parallel Running</span>
              </div>
              {(activeCmd.parallelSubs ?? []).map((s, i) => (
                <p key={i} className="text-[10px] text-muted-foreground">
                  {s.type === 'wait' ? `⏱ ${s.defaultWait ?? 0}s` : `⚡ ${s.subsystemName || '?'}${s.commandName ? ' → ' + s.commandName : ''}`}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}