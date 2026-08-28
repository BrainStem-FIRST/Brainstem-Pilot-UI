import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play, Square, RotateCcw, Zap, Clock, GitBranch, ChevronDown } from 'lucide-react';
import { mirrorTrajectoryFieldSide, mirrorTrajectoryAcrossYAxis } from '../lib/trajectoryMath';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import { readEntity } from '../lib/dataService';
import { resolveVisibleVisuals, buildSegments, wrapAngle } from '../lib/simSegments';
import SimCanvas from '../components/autobuilder/SimCanvas';

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
      readEntity('Auto'),
      readEntity('RobotSettings'),
    ]).then(([autos, rs]) => {
      const autoList = Array.isArray(autos) ? autos : [];
      const rsList = Array.isArray(rs) ? rs : [];
      setAllChildren(autoList);
      if (rsList[0]) setRobotSettings(rsList[0]);
      if (!urlId && autoList.length > 0) {
        setSelectedChildId(autoList[0].id);
      }
    });
  }, [urlId]);

  useEffect(() => {
    if (!selectedChildId) return;
    stop();
    setSimTime(0);
    setSegments([]);

    Promise.all([
      readEntity('Auto'),
      readEntity('RobotSettings'),
      readEntity('Point'),
      readEntity('SavedAuto'),
      readEntity('SubsystemConfig'),
    ]).then(([autos, rs, points, paths, scList]) => {
      const autoList = Array.isArray(autos) ? autos : [];
      const rsList = Array.isArray(rs) ? rs : [];
      const pointList = Array.isArray(points) ? points : [];
      const pathList = Array.isArray(paths) ? paths : [];
      const scListArray = Array.isArray(scList) ? scList : [];

      const auto = autoList.find(a => a.id === selectedChildId);
      if (!auto) return;
      setChild(auto);
      const rsettings = rsList[0];
      const motionDefaults = getMotionUnitsForLeague(projectType).defaultConstraints;
      const constraints = {
        maxVel: rsettings?.maxVel ?? motionDefaults.maxVel,
        maxAccel: rsettings?.maxAccel ?? motionDefaults.maxAccel,
      };
      const { segments: segs, rotationTargets: rotTargets } = buildSegments(auto, pathList, pointList, constraints);
      setSegments(segs);
      const firstPositional = segs.find(s => s.type === 'path' || s.type === 'point');
      setFieldSide(firstPositional?.startSide ?? 'R');
      setTotalTime(segs.reduce((s, seg) => s + (seg.duration ?? 0), 0));
      setSubsystemConfigs(scListArray[0]?.subsystems ?? []);
      setRotationTargets(rotTargets);
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
    if (isFrc) {
      if (fieldSide !== (seg.startSide ?? 'R')) {
        traj = mirrorTrajectoryFieldSide(traj);
      }
      if (alliance === 'red') {
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
        traj = {
          ...traj,
          states: traj.states.map(transformPointForRed),
        };
      }
    } else if (alliance === 'red') {
      traj = mirrorTrajectoryAcrossYAxis(traj);
    }

    return { ...seg, trajectory: traj };
  });

  const displayRotationTargets = (() => {
    const targets = rotationTargets ?? [];
    if (alliance === 'blue') return targets;
    if (isFrc) {
      return targets.map(t => ({ ...t, rotation: wrapAngle(t.rotation - 180) }));
    }
    return targets.map(t => ({ ...t, rotation: wrapAngle(180 - t.rotation) }));
  })();

  if (allChildren.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex items-center gap-3 pl-14 pr-4 py-2.5 bg-card border-b border-border shrink-0">
          <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-xs font-medium">Home</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">No Autos Created</p>
            <p className="text-sm text-muted-foreground">Build an Auto to simulate it here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 pl-14 pr-4 py-2.5 bg-card border-b border-border shrink-0 flex-wrap gap-y-1">
        <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
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
              {allChildren.length === 0 && <option value="">No autos</option>}
              {allChildren.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {isFrc && (
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
          )}
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
            <span className="text-xs font-num text-muted-foreground w-24 text-right">
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
              const typeColors = { path: 'text-blue-400', point: 'text-cyan-400', subsystem: 'text-violet-400', wait: 'text-yellow-400', parallel: 'text-green-400' };
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
                  {(seg.type === 'path' || seg.type === 'point') && (seg.subsystemTriggers ?? []).length > 0 && (
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
            <div className="m-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg shrink-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-violet-400">Subsystem Active</span>
              </div>
              <p className="text-xs text-foreground font-medium">{activeCmd.subsystemName}</p>
              {activeCmd.commandName && <p className="text-[10px] text-muted-foreground mt-0.5">→ {activeCmd.commandName}</p>}
            </div>
          )}
          {activeCmd?.type === 'wait' && (
            <div className="m-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-400">Waiting…</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{activeCmd.duration.toFixed(1)}s</p>
            </div>
          )}
          {activeCmd?.type === 'parallel' && (
            <div className="m-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg shrink-0">
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