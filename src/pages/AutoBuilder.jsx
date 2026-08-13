import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FieldCanvas from '../components/autobuilder/FieldCanvas';
import WaypointSidebar from '../components/autobuilder/WaypointSidebar';
import Toolbar from '../components/autobuilder/Toolbar';
import SimulationBar from '../components/autobuilder/SimulationBar';
import { generateTrajectory } from '../lib/trajectoryMath';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getDefaultPathEditorView } from '../lib/fieldCoordinates';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import { normalizeSavedPath, serializeWaypointForClipboard, parseWaypointFromClipboard, insertPastedWaypoint } from '../lib/pathWaypoints';
import { readEntity, updateEntity } from '../lib/dataService';
import { savePathToProject } from '../lib/projectFolder';

const lerp = (a, b, t) => a + (b - a) * t;
const MAX_HISTORY = 100;

function captureEditorState(ref) {
  const { waypoints, constraints, subsystemTriggers, rotationTargets, startSide } = ref.current;
  return {
    waypoints: JSON.parse(JSON.stringify(waypoints)),
    constraints: { ...constraints },
    subsystemTriggers: JSON.parse(JSON.stringify(subsystemTriggers)),
    rotationTargets: JSON.parse(JSON.stringify(rotationTargets)),
    startSide,
  };
}

export default function AutoBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [waypoints, setWaypoints] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const selectedIndexRef = useRef(null);
  selectedIndexRef.current = selectedIndex;
  const [tool, setTool] = useState('select');
  const { activeField } = useFieldConfig();
  const { projectType, isFrc } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);
  const [constraints, setConstraints] = useState(motionUnits.defaultConstraints);
  const customizedConstraintsRef = useRef({ maxVel: false, maxAccel: false });
  const [showVelocity, setShowVelocity] = useState(false);
  const [robotSettings, setRobotSettings] = useState(null);
  const [simProgress, setSimProgress] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [trajectory, setTrajectory] = useState(null);
  const [pathName, setPathName] = useState('Auto 1');
  const [subsystemTriggers, setSubsystemTriggers] = useState([]);
  const [rotationTargets, setRotationTargets] = useState([]);
  const [startSide, setStartSide] = useState('R');
  const [loaded, setLoaded] = useState(false);
  const [subsystemConfig, setSubsystemConfig] = useState([]);
  const savedNameRef = useRef(null);
  const [zoom, setZoom] = useState(1.5);
  const resetPanRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const editSessionRef = useRef(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Unified State Tracker for deep async synchronization
  const stateRef = useRef({ waypoints, constraints, pathName, subsystemTriggers, rotationTargets, startSide });
  stateRef.current = { waypoints, constraints, pathName, subsystemTriggers, rotationTargets, startSide };

  const applyInitialView = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { zoom: z, pan } = getDefaultPathEditorView(el.offsetWidth, el.offsetHeight, activeField);
    setZoom(z);
    resetPanRef.current?.(pan);
  }, [activeField]);

  const onResetViewCallback = useCallback((fn) => {
    resetPanRef.current = fn;
    requestAnimationFrame(() => applyInitialView());
  }, [applyInitialView]);

  // Recompute trajectory leveraging unified state tracking to avoid closures collapsing
  const recomputeTrajectory = useCallback((wps, c, rots, trigs, rtgts) => {
    const targetWps = wps ?? stateRef.current.waypoints;
    const con = c ?? stateRef.current.constraints;
    const rt = rots ?? stateRef.current.rotationTargets;

    if (targetWps.length >= 2) {
      const traj = generateTrajectory(targetWps, con, rt);
      setTrajectory(traj);
      
      if (traj && traj.totalLength > 0) {
        const trigList = trigs ?? stateRef.current.subsystemTriggers;
        const rtgtList = rtgts ?? stateRef.current.rotationTargets;
        
        if (trigList?.length) {
          const rescaled = trigList.map(item => item.arcLengthM != null
            ? { ...item, progress: Math.min(1, Math.max(0, item.arcLengthM / traj.totalLength)) }
            : { ...item, arcLengthM: (item.progress ?? 0) * traj.totalLength });
          setSubsystemTriggers(rescaled);
          stateRef.current.subsystemTriggers = rescaled;
        }
        if (rtgtList?.length) {
          const rescaled = rtgtList.map(item => item.arcLengthM != null
            ? { ...item, progress: Math.min(1, Math.max(0, item.arcLengthM / traj.totalLength)) }
            : { ...item, arcLengthM: (item.progress ?? 0) * traj.totalLength });
          setRotationTargets(rescaled);
          stateRef.current.rotationTargets = rescaled;
        }
      }
    } else {
      setTrajectory(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      readEntity('RobotSettings'),
      readEntity('SubsystemConfig'),
    ]).then(([rList, scList]) => {
      const rs = Array.isArray(rList) ? rList : [];
      const sc = Array.isArray(scList) ? scList : [];
      if (rs.length > 0) {
        const rsettings = rs[0];
        setRobotSettings(rsettings);
        setConstraints(prev => ({
          maxVel: customizedConstraintsRef.current.maxVel ? prev.maxVel : (rsettings.maxVel ?? prev.maxVel),
          maxAccel: customizedConstraintsRef.current.maxAccel ? prev.maxAccel : (rsettings.maxAccel ?? prev.maxAccel),
        }));
      }
      if (sc.length > 0) setSubsystemConfig(sc[0].subsystems ?? []);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    readEntity('SavedAuto').then(results => {
      const autos = Array.isArray(results) ? results : [];
      const auto = autos.find(a => a.id === id)
        ?? autos.find(a => (a.name ?? '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_') === id);
      if (!auto) return;

      const normalized = normalizeSavedPath(auto);
      const wps = normalized.waypoints || [];
      const savedConstraints = auto.constraints || {};
      const rots = auto.rotationTargets ?? [];
      const trigs = auto.subsystemTriggers ?? [];

      readEntity('RobotSettings').then(rList => {
        const rs = Array.isArray(rList) && rList.length > 0 ? rList[0] : null;
        const defaultVel = rs?.maxVel ?? motionUnits.defaultConstraints.maxVel;
        const defaultAccel = rs?.maxAccel ?? motionUnits.defaultConstraints.maxAccel;
        customizedConstraintsRef.current = {
          maxVel: savedConstraints.maxVel != null && savedConstraints.maxVel !== defaultVel,
          maxAccel: savedConstraints.maxAccel != null && savedConstraints.maxAccel !== defaultAccel,
        };
        const c = {
          maxVel: savedConstraints.maxVel ?? defaultVel,
          maxAccel: savedConstraints.maxAccel ?? defaultAccel,
        };

        setPathName(auto.name || 'Path 1');
        savedNameRef.current = auto.name || 'Path 1';
        setConstraints(c);
        setWaypoints(wps);
        setSubsystemTriggers(trigs);
        setRotationTargets(rots);
        setStartSide(auto.startSide === 'L' ? 'L' : 'R');
        
        stateRef.current = { waypoints: wps, constraints: c, pathName: auto.name || 'Path 1', subsystemTriggers: trigs, rotationTargets: rots, startSide: auto.startSide === 'L' ? 'L' : 'R' };

        if (wps.length >= 2) {
          setTrajectory(generateTrajectory(wps, c, rots));
        }
        setLoaded(true);
      });
    });
  }, [id, recomputeTrajectory]);

  useEffect(() => {
    if (!loaded) return;
    const id = requestAnimationFrame(() => {
      applyInitialView();
    });
    return () => cancelAnimationFrame(id);
  }, [loaded, applyInitialView]);

  const save = useCallback(async (overrides = {}) => {
    const { waypoints: wps, constraints: c, pathName: name, subsystemTriggers: trigs, rotationTargets: rots, startSide: side } = { ...stateRef.current, ...overrides };
    const savedConstraints = {};
    if (customizedConstraintsRef.current.maxVel) savedConstraints.maxVel = c.maxVel;
    if (customizedConstraintsRef.current.maxAccel) savedConstraints.maxAccel = c.maxAccel;
    const pathData = { id, name, waypoints: wps, constraints: savedConstraints, subsystemTriggers: trigs, rotationTargets: rots };
    if (isFrc) {
      pathData.startSide = side ?? startSide;
    }
    const previousName = savedNameRef.current;
    await updateEntity('SavedAuto', id, pathData);
    await savePathToProject(pathData, previousName);
    savedNameRef.current = name;
  }, [id, isFrc]);

  const saveTimer = useRef(null);
  const scheduleSaveRef = useRef(null);
  scheduleSaveRef.current = (overrides = {}) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(overrides), 500);
  };
  const scheduleSave = useCallback((overrides) => scheduleSaveRef.current(overrides), []);

  const bumpHistory = useCallback(() => {
    setHistoryVersion(v => v + 1);
  }, []);

  const pushHistory = useCallback(() => {
    historyRef.current.push(captureEditorState(stateRef));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    futureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const restoreSnapshot = useCallback((snapshot) => {
    setWaypoints(snapshot.waypoints);
    setConstraints(snapshot.constraints);
    setSubsystemTriggers(snapshot.subsystemTriggers);
    setRotationTargets(snapshot.rotationTargets);
    setStartSide(snapshot.startSide);
    stateRef.current = {
      ...stateRef.current,
      waypoints: snapshot.waypoints,
      constraints: snapshot.constraints,
      subsystemTriggers: snapshot.subsystemTriggers,
      rotationTargets: snapshot.rotationTargets,
      startSide: snapshot.startSide,
    };
    if (snapshot.waypoints.length >= 2) {
      recomputeTrajectory(snapshot.waypoints, snapshot.constraints, snapshot.rotationTargets);
    } else {
      setTrajectory(null);
    }
    scheduleSave(snapshot);
  }, [recomputeTrajectory, scheduleSave]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    futureRef.current.push(captureEditorState(stateRef));
    const prev = historyRef.current.pop();
    restoreSnapshot(prev);
    bumpHistory();
  }, [restoreSnapshot, bumpHistory]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    historyRef.current.push(captureEditorState(stateRef));
    const next = futureRef.current.pop();
    restoreSnapshot(next);
    bumpHistory();
  }, [restoreSnapshot, bumpHistory]);

  const beginEdit = useCallback(() => {
    if (editSessionRef.current) return;
    editSessionRef.current = true;
    pushHistory();
  }, [pushHistory]);

  const endEdit = useCallback(() => {
    editSessionRef.current = null;
  }, []);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  // historyVersion keeps toolbar buttons in sync with ref-based stacks
  void historyVersion;

  const handleNameChange = (name) => {
    setPathName(name);
    stateRef.current.pathName = name;
    scheduleSave({ pathName: name });
  };

  const handleTriggersChange = (trigs) => {
    const totalLength = trajectory?.totalLength ?? 1;
    const seeded = trigs.map(t => t.arcLengthM != null ? t : { ...t, arcLengthM: (t.progress ?? 0) * totalLength });
    stateRef.current.subsystemTriggers = seeded;
    setSubsystemTriggers(seeded);
    scheduleSave({ subsystemTriggers: seeded });
  };

  const handleRotationTargetsChange = (rots, skipRecompute = false) => {
    const totalLength = trajectory?.totalLength ?? 1;
    const seeded = rots.map(t => t.arcLengthM != null ? t : { ...t, arcLengthM: (t.progress ?? 0) * totalLength });
    stateRef.current.rotationTargets = seeded;
    setRotationTargets(seeded);
    if (!skipRecompute) recomputeTrajectory(stateRef.current.waypoints, stateRef.current.constraints, seeded);
    scheduleSave({ rotationTargets: seeded });
  };

  const handleStartSideChange = useCallback((newSide) => {
    if (newSide === startSide) return;
    pushHistory();
    setStartSide(newSide);
    stateRef.current.startSide = newSide;
    scheduleSave({ startSide: newSide });
  }, [startSide, scheduleSave, pushHistory]);

  const handleBack = async () => {
    clearTimeout(saveTimer.current);
    await save();
    navigate('/autos');
  };

  const addWaypoint = useCallback((wp) => {
    pushHistory();
    setWaypoints(prev => {
      const next = [...prev, wp];
      stateRef.current.waypoints = next;
      recomputeTrajectory(next);
      scheduleSave({ waypoints: next });
      return next;
    });
  }, [recomputeTrajectory, pushHistory]);

  const updateWaypoint = useCallback((index, updates) => {
    setWaypoints(prev => {
      const next = prev.map((w, i) => i === index ? { ...w, ...updates } : w);
      stateRef.current.waypoints = next;
      recomputeTrajectory(next);
      scheduleSave({ waypoints: next });
      return next;
    });
  }, [recomputeTrajectory]);

  const deleteWaypoint = useCallback((index) => {
    pushHistory();
    setWaypoints(prev => {
      const next = prev.filter((_, i) => i !== index);
      stateRef.current.waypoints = next;
      if (selectedIndex >= next.length) setSelectedIndex(next.length - 1);
      recomputeTrajectory(next);
      scheduleSave({ waypoints: next });
      return next;
    });
  }, [selectedIndex, recomputeTrajectory, pushHistory]);

  const insertWaypointAfter = useCallback((index) => {
    pushHistory();
    setWaypoints(prev => {
      const a = prev[index];
      const b = prev[index + 1];
      if (!a || !b) return prev;

      const aNext = a.nextControl ?? { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
      const bPrev = b.prevControl ?? { x: b.x + (a.x - b.x) / 3, y: b.y + (a.y - b.y) / 3 };

      const t = 0.5;
      const p0 = a, p1 = aNext, p2 = bPrev, p3 = b;
      const q0 = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
      const q1 = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
      const q2 = { x: lerp(p2.x, p3.x, t), y: lerp(p2.y, p3.y, t) };
      const r0 = { x: lerp(q0.x, q1.x, t), y: lerp(q0.y, q1.y, t) };
      const r1 = { x: lerp(q1.x, q2.x, t), y: lerp(q1.y, q2.y, t) };
      const mid = { x: lerp(r0.x, r1.x, t), y: lerp(r0.y, r1.y, t) };

      const newWp = {
        x: mid.x, y: mid.y, rotation: ((a.rotation ?? 0) + (b.rotation ?? 0)) / 2,
        prevControl: r0,
        nextControl: r1,
        params: {},
      };
      const updatedA = { ...a, nextControl: q0 };
      const updatedB = { ...b, prevControl: q2 };
      const next = [...prev.slice(0, index), updatedA, newWp, updatedB, ...prev.slice(index + 2)];
      stateRef.current.waypoints = next;
      recomputeTrajectory(next);
      scheduleSave({ waypoints: next });
      setSelectedIndex(index + 1);
      return next;
    });
  }, [recomputeTrajectory, pushHistory]);

  const clearAll = useCallback(() => {
    if (waypoints.length === 0) return;
    pushHistory();
    setWaypoints([]);
    setTrajectory(null);
    setSelectedIndex(null);
    setSimProgress(0);
    setIsSimulating(false);
    scheduleSave({ waypoints: [] });
  }, [waypoints.length, pushHistory, scheduleSave]);

  const copySelectedWaypoint = useCallback(async () => {
    const idx = selectedIndexRef.current;
    if (idx == null) return;
    const wp = stateRef.current.waypoints[idx];
    if (!wp) return;
    try {
      await navigator.clipboard.writeText(serializeWaypointForClipboard(wp));
    } catch {
      // clipboard may be unavailable
    }
  }, []);

  const pasteWaypoint = useCallback((wp) => {
    pushHistory();
    const insertAt = selectedIndexRef.current != null ? selectedIndexRef.current + 1 : stateRef.current.waypoints.length;
    setWaypoints(prev => {
      const next = insertPastedWaypoint(prev, wp, insertAt);
      stateRef.current.waypoints = next;
      recomputeTrajectory(next);
      scheduleSave({ waypoints: next });
      return next;
    });
    setSelectedIndex(insertAt);
  }, [pushHistory, recomputeTrajectory, scheduleSave]);

  const exportPath = useCallback(() => {
    const fmt4 = v => parseFloat(v.toFixed(4));
    const data = {
      version: '2.0',
      name: pathName,
      waypoints: waypoints.map((w, i) => ({
        x: fmt4(w.x),
        y: fmt4(w.y),
        prevControl: (i === 0) ? null : (w.prevControl ? { x: fmt4(w.prevControl.x), y: fmt4(w.prevControl.y) } : null),
        nextControl: (i === waypoints.length - 1) ? null : (w.nextControl ? { x: fmt4(w.nextControl.x), y: fmt4(w.nextControl.y) } : null),
        rotation: fmt4(w.rotation ?? 0),
        params: w.params ?? {},
      })),
      constraints: { maxVelocity: constraints.maxVel, maxAcceleration: constraints.maxAccel },
      subsystemTriggers: (subsystemTriggers ?? []).map(t => ({
        subsystemName: t.subsystemName,
        commandName: t.commandName,
        progress: fmt4(t.progress ?? 0),
        arcLengthM: fmt4(t.arcLengthM ?? 0),
      })),
      rotationTargets: (rotationTargets ?? []).map(t => ({
        progress: fmt4(t.progress ?? 0),
        rotation: fmt4(t.rotation ?? 0),
        arcLengthM: fmt4(t.arcLengthM ?? 0),
      })),
    };
    if (isFrc) {
      data.startSide = startSide;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pathName.replace(/\s+/g, '_')}.path.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [waypoints, constraints, pathName, subsystemTriggers, rotationTargets, isFrc, startSide]);

  const importPath = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = JSON.parse(ev.target.result);
      const normalized = normalizeSavedPath(data);
      const rawWps = normalized.waypoints || [];
      const wps = rawWps.map(w => {
        if (w.anchor) {
          return { x: w.anchor.x, y: w.anchor.y, rotation: w.rotation ?? 0, prevControl: w.prevControl ?? null, nextControl: w.nextControl ?? null, params: w.params ?? {} };
        }
        const rad = ((w.heading ?? 0) * Math.PI) / 180;
        const tl = (w.tangentLength ?? 1.5) / 3;
        return { x: w.x, y: w.y, rotation: w.rotation ?? 0, params: w.params ?? {},
          prevControl: { x: w.x - Math.cos(rad) * tl, y: w.y - Math.sin(rad) * tl },
          nextControl: { x: w.x + Math.cos(rad) * tl, y: w.y + Math.sin(rad) * tl },
        };
      });
      const c = data.constraints
        ? { maxVel: data.constraints.maxVelocity, maxAccel: data.constraints.maxAcceleration }
        : constraints;
      setWaypoints(wps);
      if (data.name) setPathName(data.name);
      setConstraints(c);
      if (data.subsystemTriggers) setSubsystemTriggers(data.subsystemTriggers);
      if (data.rotationTargets) setRotationTargets(data.rotationTargets);
      recomputeTrajectory(wps, c, data.rotationTargets ?? []);
    };
    reader.readAsText(file);
  }, [recomputeTrajectory, constraints]);

  const simCancelledRef = useRef(false);
  const simProgressRef = useRef(0);
  simProgressRef.current = simProgress;

  useEffect(() => {
    if (!isSimulating || !trajectory) return;
    simCancelledRef.current = false;
    const duration = trajectory.totalTime * 1000;
    let startOffset = null;
    let raf;
    const animate = (ts) => {
      if (simCancelledRef.current) return;
      if (startOffset === null) startOffset = ts - simProgressRef.current * duration;
      const t = Math.min((ts - startOffset) / duration, 1);
      setSimProgress(t);
      if (t < 1) raf = requestAnimationFrame(animate);
      else setIsSimulating(false);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      simCancelledRef.current = true;
      cancelAnimationFrame(raf);
    };
  }, [isSimulating, trajectory]);

  useEffect(() => {
    recomputeTrajectory(stateRef.current.waypoints, constraints, stateRef.current.rotationTargets);
  }, [constraints, recomputeTrajectory]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.target.closest('[data-path-name]')) return;

      const key = e.key.toLowerCase();
      if (key === 'c' && selectedIndexRef.current != null) {
        e.preventDefault();
        copySelectedWaypoint();
        return;
      }
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelectedWaypoint]);

  useEffect(() => {
    const handlePaste = (e) => {
      if (e.target.closest('[data-path-name]')) return;
      const text = e.clipboardData?.getData('text/plain');
      const wp = parseWaypointFromClipboard(text);
      if (!wp) return;
      e.preventDefault();
      pasteWaypoint(wp);
    };
    window.addEventListener('paste', handlePaste, true);
    return () => window.removeEventListener('paste', handlePaste, true);
  }, [pasteWaypoint]);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Toolbar
        tool={tool}
        setTool={setTool}
        showVelocity={showVelocity}
        setShowVelocity={setShowVelocity}
        pathName={pathName}
        setPathName={handleNameChange}
        onClear={clearAll}
        waypointCount={waypoints.length}
        onBack={handleBack}
        startSide={startSide}
        onStartSideChange={handleStartSideChange}
        showStartSide={isFrc}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative overflow-hidden pb-[44px]" ref={canvasContainerRef}>
          <FieldCanvas
            waypoints={waypoints}
            selectedIndex={selectedIndex}
            tool={tool}
            trajectory={trajectory}
            showVelocity={showVelocity}
            simProgress={simProgress}
            isSimulating={isSimulating}
            onAddWaypoint={addWaypoint}
            onUpdateWaypoint={updateWaypoint}
            onDeleteWaypoint={deleteWaypoint}
            onSelectWaypoint={setSelectedIndex}
            robotSettings={robotSettings}
            zoom={zoom}
            setZoom={setZoom}
            onResetView={onResetViewCallback}
            subsystemTriggers={subsystemTriggers}
            subsystemConfig={subsystemConfig}
            rotationTargets={rotationTargets}
            onUpdateRotationTargets={handleRotationTargetsChange}
            onBeginEdit={beginEdit}
            onEndEdit={endEdit}
          />
          <button
            onClick={applyInitialView}
            className="absolute top-3 right-3 px-2.5 py-1 bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground rounded-lg transition-all backdrop-blur-sm"
          >
            Reset View
          </button>
          <SimulationBar
            trajectory={trajectory}
            isSimulating={isSimulating}
            simProgress={simProgress}
            onSimulate={() => { if (simProgress >= 1) setSimProgress(0); setIsSimulating(true); }}
            onStop={() => { simCancelledRef.current = true; setIsSimulating(false); }}
            onReset={() => { simCancelledRef.current = true; setIsSimulating(false); setSimProgress(0); }}
            onScrub={setSimProgress}
          />
        </div>

        <WaypointSidebar
          waypoints={waypoints}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onUpdate={updateWaypoint}
          onDelete={deleteWaypoint}
          onInsertAfter={insertWaypointAfter}
          constraints={constraints}
          setConstraints={(updater) => {
            setConstraints(prev => {
              const next = typeof updater === 'function' ? updater(prev) : updater;
              if (next.maxVel !== prev.maxVel) customizedConstraintsRef.current.maxVel = true;
              if (next.maxAccel !== prev.maxAccel) customizedConstraintsRef.current.maxAccel = true;
              stateRef.current.constraints = next;
              scheduleSave({ constraints: next });
              return next;
            });
          }}
          trajectory={trajectory}
          subsystemTriggers={subsystemTriggers}
          onUpdateTriggers={handleTriggersChange}
          rotationTargets={rotationTargets}
          onUpdateRotationTargets={handleRotationTargetsChange}
          onEditStart={beginEdit}
          onEditEnd={endEdit}
          onRecordHistory={pushHistory}
        />
      </div>
    </div>
  );
}