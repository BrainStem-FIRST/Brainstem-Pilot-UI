import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, MapPin, Route } from 'lucide-react';
import FieldCanvas from '../autobuilder/FieldCanvas';
import { getDefaultPathEditorView } from '../../lib/fieldCoordinates';
import { generateTrajectory } from '../../lib/trajectoryMath';
import { useFieldConfig } from '../../context/FieldConfigContext';
import { useLeague } from '../../context/LeagueContext';
import { getMotionUnitsForLeague } from '../../lib/motionUnits';
import { readEntity } from '../../lib/dataService';

const POSE_KEYS = ['x', 'y', 'rotation'];

function CoordField({ label, value, unit, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}{unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        step={0.01}
        value={Number.isFinite(value) ? parseFloat(value.toFixed(3)) : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 bg-secondary/60 border border-border rounded px-2 py-1 text-sm font-mono text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

/**
 * Full-screen field editor for a single library record. Points are edited as a
 * one-waypoint pose; paths keep their whole waypoint chain with Bézier handles.
 * Deliberately chrome-free: the field and the selected pose's numbers, nothing else.
 */
export default function RecordEditor({ kind, record, onChange, onBeginEdit, onEndEdit, onClose }) {
  const { activeField, unit } = useFieldConfig();
  const { projectType } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);

  const isPoint = kind === 'point';
  const containerRef = useRef(null);
  const resetPanRef = useRef(null);
  const [zoom, setZoom] = useState(1.5);
  // Draw the robot at the size configured in Settings — a default-sized box here would
  // misrepresent clearance against the field on the very screen you position a pose from.
  const [robotSettings, setRobotSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readEntity('RobotSettings').then(list => {
      if (!cancelled && Array.isArray(list) && list[0]) setRobotSettings(list[0]);
    });
    return () => { cancelled = true; };
  }, []);
  const [selectedIndex, setSelectedIndex] = useState(isPoint ? 0 : null);

  const waypoints = useMemo(() => (isPoint
    ? [{
      x: record.x ?? 0,
      y: record.y ?? 0,
      rotation: record.rotation ?? 0,
      prevControl: null,
      nextControl: null,
    }]
    : record.waypoints ?? []), [isPoint, record]);

  const trajectory = useMemo(() => {
    if (isPoint || waypoints.length < 2) return null;
    const constraints = record.constraints?.maxVel ? record.constraints : motionUnits.defaultConstraints;
    return generateTrajectory(waypoints, constraints, record.rotationTargets ?? []);
  }, [isPoint, waypoints, record, motionUnits]);

  useEffect(() => {
    if (isPoint) return;
    setSelectedIndex(i => (i != null && i >= waypoints.length ? null : i));
  }, [isPoint, waypoints.length]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const applyInitialView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { zoom: z, pan } = getDefaultPathEditorView(el.offsetWidth, el.offsetHeight, activeField);
    setZoom(z);
    resetPanRef.current?.(pan);
  }, [activeField]);

  const onResetView = useCallback((fn) => {
    resetPanRef.current = fn;
    requestAnimationFrame(() => applyInitialView());
  }, [applyInitialView]);

  const updateWaypoint = useCallback((index, updates) => {
    if (isPoint) {
      const pose = {};
      POSE_KEYS.forEach(key => { if (updates[key] != null) pose[key] = updates[key]; });
      if (Object.keys(pose).length > 0) onChange(pose);
      return;
    }
    onChange({ waypoints: waypoints.map((wp, i) => (i === index ? { ...wp, ...updates } : wp)) });
  }, [isPoint, waypoints, onChange]);

  // A path needs a start and an end, so the last two waypoints stay put.
  const deleteWaypoint = useCallback((index) => {
    if (isPoint || waypoints.length <= 2) return;
    onChange({ waypoints: waypoints.filter((_, i) => i !== index) });
  }, [isPoint, waypoints, onChange]);

  const activeIndex = isPoint ? 0 : selectedIndex;
  const activeWaypoint = activeIndex != null ? waypoints[activeIndex] : null;
  const showRotation = isPoint || activeIndex === 0 || activeIndex === waypoints.length - 1;
  const editPose = (updates) => updateWaypoint(activeIndex, updates);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Index</span>
        </button>
        <div className="w-px h-5 bg-border" />
        {isPoint
          ? <MapPin className="w-4 h-4 text-cyan-400" />
          : <Route className="w-4 h-4 text-blue-400" />}
        <h1 className="text-sm font-semibold text-foreground truncate">{record.name}</h1>
      </div>

      <div className="flex-1 relative min-h-0 overflow-hidden" ref={containerRef}>
        <FieldCanvas
          waypoints={waypoints}
          selectedIndex={activeIndex}
          tool="select"
          trajectory={trajectory}
          showVelocity={false}
          simProgress={0}
          isSimulating={false}
          onAddWaypoint={() => {}}
          onUpdateWaypoint={updateWaypoint}
          onDeleteWaypoint={deleteWaypoint}
          onSelectWaypoint={isPoint ? () => {} : setSelectedIndex}
          zoom={zoom}
          setZoom={setZoom}
          onResetView={onResetView}
          rotationTargets={isPoint ? [] : record.rotationTargets ?? []}
          robotSettings={robotSettings}
          onBeginEdit={onBeginEdit}
          onEndEdit={onEndEdit}
        />

        <div className="absolute bottom-4 left-4 rounded-xl border border-border bg-card/95 backdrop-blur-sm px-3 py-2.5">
          {activeWaypoint ? (
            <div className="flex items-end gap-2.5">
              <CoordField label="X" unit={unit} value={activeWaypoint.x ?? 0}
                onChange={v => editPose({ x: v })} />
              <CoordField label="Y" unit={unit} value={activeWaypoint.y ?? 0}
                onChange={v => editPose({ y: v })} />
              {showRotation && (
                <CoordField label="Rotation" unit="°" value={activeWaypoint.rotation ?? 0}
                  onChange={v => editPose({ rotation: v })} />
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click a waypoint to see its position.</p>
          )}
        </div>
      </div>
    </div>
  );
}
