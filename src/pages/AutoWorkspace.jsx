import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Plus, Trash2, GripVertical, Route, MapPin, Zap, Clock, GitBranch,
  X, Play, Square, RotateCcw, SkipForward, Pencil, Undo2, Redo2, Library, AlertTriangle,
} from 'lucide-react';
import FieldCanvas from '../components/autobuilder/FieldCanvas';
import SimCanvas from '../components/autobuilder/SimCanvas';
import WaypointSidebar, { OptionalParamsSection } from '../components/autobuilder/WaypointSidebar';
import { generateTrajectory, buildAutoChain, mirrorTrajectoryFieldSide, mirrorTrajectoryAcrossYAxis } from '../lib/trajectoryMath';
import { resolveVisibleVisuals, chainToSegments, wrapAngle } from '../lib/simSegments';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getDefaultPathEditorView } from '../lib/fieldCoordinates';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import { normalizeSavedPath } from '../lib/pathWaypoints';
import { readEntity, updateEntity, createEntity, safeNameFromString } from '../lib/dataService';
import { savePathToProject, savePointToProject, saveAutoToProject } from '../lib/projectFolder';
import { seedWaypointsForNewPath } from '../lib/autoSequence';
import {
  findPath, findPoint, matchesRef, persistPathsDiff, persistPointsDiff, persistAutosDiff, applyRename,
} from '../lib/library';
import {
  changedEndpoints, propagateChainLinks, setRecordEndpoint, chainLinkGaps, hasLinkedStart,
} from '../lib/chainLinks';
import { slotIssues, issueSummary, subsystemRefIssues } from '../lib/slotIssues';
import { readTabs, writeTabs } from '../lib/workspaceTabs';
import { ftcClassNameClash } from '../lib/ftcOpmodeGenerator';
import { useUndoRedo } from '../hooks/useUndoRedo';



const SLOT_META = {
  path: { label: 'Path', icon: Route, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  point: { label: 'Point', icon: MapPin, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  subsystem: { label: 'Subsystem', icon: Zap, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  wait: { label: 'Wait', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  parallel: { label: 'Parallel', icon: GitBranch, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
};

function safeId(name) { return safeNameFromString(name); }

const resolvePathRef = (paths, targetId) => findPath(paths, targetId);
const EMPTY_ISSUES = [];

/**
 * A Point's heading lives on the shared record, so every slot that uses the Point turns with
 * it. Older Autos stored a per-slot `rotation` override; drop it on load so the record wins.
 */
function normalizeAuto(auto) {
  const seq = auto?.sequence ?? [];
  if (!seq.some(s => s.type === 'point' && s.rotation != null)) return auto;
  return {
    ...auto,
    sequence: seq.map(s => {
      if (s.type !== 'point' || s.rotation == null) return s;
      const { rotation, ...rest } = s;
      return rest;
    }),
  };
}

function nameTaken(records, candidate) {
  const slug = safeId(candidate);
  return (records ?? []).some(r => safeId(r.name) === slug || String(r.id) === slug);
}

/** First `${prefix} N` that no existing record already claims, so we never clobber a file. */
function nextAvailableName(prefix, records) {
  let n = (records?.length ?? 0) + 1;
  while (nameTaken(records, `${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

function uniqueFallbackAuto(urlId, list) {
  const records = list ?? [];
  const isGeneric = !urlId || safeId(urlId) === 'New_Auto' || urlId === 'New Auto';
  const preferredName = isGeneric
    ? nextAvailableName('Auto', records)
    : (String(urlId).startsWith('gen-')
      ? `Auto ${String(urlId).slice(4)}`
      : String(urlId).replace(/_/g, ' '));
  let name = preferredName;
  let n = 1;
  while (nameTaken(records, name)) {
    name = `${preferredName}_${n}`;
    n++;
  }
  return normalizeAuto({ id: safeId(name), name, sequence: [] });
}

// Native HTML5 drag-and-drop (not a library) — each button is draggable and reports its
// slot type via onPaletteDragStart, which the sequence list reads on drop to insert at
// whatever index the user dropped over (start, middle, or end).
function AddSlotMenu({ paths, points, subsystems, onAddPath, onAddPoint, onAddSubsystem, onAddWait, onAddParallel, onPaletteDragStart, onPaletteDragEnd }) {
  const [open, setOpen] = useState(null); // 'path' | 'point' | null

  const dragProps = (type) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', `palette-${type}`);
      onPaletteDragStart?.(type);
    },
    onDragEnd: () => onPaletteDragEnd?.(),
  });

  return (
    <div className="relative flex flex-wrap gap-1.5">
      <div className="relative" {...dragProps('path')}>
        <button onClick={() => setOpen(o => o === 'path' ? null : 'path')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-all cursor-grab active:cursor-grabbing">
          <Route className="w-3.5 h-3.5" /> Path
        </button>
        {open === 'path' && (
          <div className="absolute z-20 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl p-1.5 max-h-64 overflow-y-auto">
            <button onClick={() => { onAddPath(null); setOpen(null); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-all">
              <Plus className="w-3 h-3" /> New Path
            </button>
            {paths.length > 0 && <div className="h-px bg-border my-1" />}
            {paths.map(p => (
              <button key={p.id} onClick={() => { onAddPath(p.id); setOpen(null); }}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-secondary/60 transition-all truncate">
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative" {...dragProps('point')}>
        <button onClick={() => setOpen(o => o === 'point' ? null : 'point')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all cursor-grab active:cursor-grabbing">
          <MapPin className="w-3.5 h-3.5" /> Point
        </button>
        {open === 'point' && (
          <div className="absolute z-20 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl p-1.5 max-h-64 overflow-y-auto">
            <button onClick={() => { onAddPoint(null); setOpen(null); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-all">
              <Plus className="w-3 h-3" /> New Point
            </button>
            {points.length > 0 && <div className="h-px bg-border my-1" />}
            {points.map(p => (
              <button key={p.id} onClick={() => { onAddPoint(p.id); setOpen(null); }}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-secondary/60 transition-all truncate">
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button {...dragProps('subsystem')} onClick={onAddSubsystem}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20 transition-all cursor-grab active:cursor-grabbing">
        <Zap className="w-3.5 h-3.5" /> Subsystem
      </button>
      <button {...dragProps('wait')} onClick={onAddWait}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all cursor-grab active:cursor-grabbing">
        <Clock className="w-3.5 h-3.5" /> Wait
      </button>
      <button {...dragProps('parallel')} onClick={onAddParallel}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-all cursor-grab active:cursor-grabbing">
        <GitBranch className="w-3.5 h-3.5" /> Parallel
      </button>
    </div>
  );
}

/**
 * Inline rename for the record behind a slot. Click-to-edit rather than always-an-input, so
 * the sequence list still reads as a list; clicks are kept off the card's select handler.
 */
function SlotNameField({ name, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  };

  if (!editing) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        title="Rename — updates every Auto that uses it"
        className="group/name flex items-center gap-1 min-w-0 w-full text-left"
      >
        <span className="text-xs text-foreground truncate">{name}</span>
        <Pencil className="w-2.5 h-2.5 text-muted-foreground/50 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onClick={e => e.stopPropagation()}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(name); setEditing(false); }
      }}
      onBlur={commit}
      className="w-full bg-secondary border border-primary/40 rounded px-1 py-0.5 text-xs text-foreground outline-none focus:border-primary"
    />
  );
}

/** Amber hazard marker; renders nothing when there is nothing wrong. */
function IssueBadge({ issues, className = '' }) {
  if (!issues || issues.length === 0) return null;
  return (
    <span className={`shrink-0 text-amber-400 ${className}`} title={issueSummary(issues)}>
      <AlertTriangle className="w-3.5 h-3.5" />
    </span>
  );
}

function SlotCard({ slot, isSelected, isActive, duration, onSelect, onDelete, onToggleSkip, onUpdate, subsystems, resolvedName, registerRef, onSlotDragStart, onSlotDragEnd, isDropTarget, isDragging, issues, onRenameRecord }) {
  const meta = SLOT_META[slot.type] ?? SLOT_META.path;
  const Icon = meta.icon;
  // Subsystem/parallel/wait blocks expand inline as soon as they're selected — no separate button.
  const expanded = isSelected;
  const sysCommands = (subsystems.find(s => s.name === slot.subsystemName)?.commands) ?? [];

  return (
    <div ref={registerRef} className="relative">
      {isDropTarget && <div className="h-0.5 mx-1 mb-1.5 rounded-full bg-primary" />}
      <div
        onClick={() => onSelect(slot.id)}
        className={`rounded-lg border bg-card transition-all cursor-pointer ${meta.border} ${
          isSelected ? 'ring-2 ring-primary/50' : ''
        } ${isActive ? 'bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]' : ''} ${slot.skip ? 'opacity-40' : ''} ${isDragging ? 'shadow-xl opacity-40' : ''}`}
      >
        <div className="flex items-center gap-2 p-2.5">
          <div
            draggable
            onDragStart={onSlotDragStart}
            onDragEnd={onSlotDragEnd}
            onClick={e => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 ${isActive ? 'ring-2 ring-primary/60' : ''}`}>
            <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
            {(slot.type === 'path' || slot.type === 'point') && onRenameRecord
              && resolvedName && resolvedName !== 'Unassigned' ? (
              <SlotNameField name={resolvedName} onRename={name => onRenameRecord(slot, name)} />
            ) : (
              <p className="text-xs text-foreground truncate">{resolvedName ?? '—'}</p>
            )}
            {issues.length > 0 && (
              <p className="text-[10px] text-amber-400 mt-0.5 leading-tight truncate">
                {issues[0].message}{issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}
              </p>
            )}
          </div>
          <IssueBadge issues={issues} />
          {duration != null && (
            <span className={`text-[10px] font-num shrink-0 ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{duration.toFixed(1)}s</span>
          )}
          <button onClick={e => { e.stopPropagation(); onToggleSkip(slot.id); }}
            title={slot.skip ? 'Skipped' : 'Skip'}
            className={`p-1 rounded transition-all ${slot.skip ? 'text-destructive' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}>
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(slot.id); }} className="text-destructive/50 hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {slot.type === 'wait' && expanded && (
          <div className="px-3 pb-2.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <span className="text-xs text-muted-foreground">Duration:</span>
            <input type="number" value={slot.duration ?? 0} step={0.1} min={0}
              onChange={e => onUpdate(slot.id, { duration: parseFloat(e.target.value) || 0 })}
              className="w-16 bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-xs font-num text-foreground outline-none focus:border-primary" />
            <span className="text-xs text-muted-foreground">s</span>
          </div>
        )}

        {slot.type === 'subsystem' && expanded && (
          <div className="px-3 pb-2.5 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            <select value={slot.subsystemName ?? ''} onChange={e => onUpdate(slot.id, { subsystemName: e.target.value, commandName: '' })}
              className="bg-secondary/50 border border-border rounded px-1.5 py-1 text-xs text-foreground outline-none focus:border-primary">
              <option value="">— Subsystem —</option>
              {subsystems.map(s => <option key={s.id ?? s.name} value={s.name}>{s.name}</option>)}
            </select>
            {slot.subsystemName && (
              <div className="flex items-center gap-1.5">
                <select value={slot.commandName ?? ''} onChange={e => onUpdate(slot.id, { commandName: e.target.value })}
                  className="flex-1 min-w-0 bg-secondary/50 border border-border rounded px-1.5 py-1 text-xs text-foreground outline-none focus:border-primary">
                  <option value="">— Command —</option>
                  {sysCommands.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                </select>
                <IssueBadge issues={subsystemRefIssues(slot, subsystems)} />
              </div>
            )}
          </div>
        )}

        {slot.type === 'parallel' && expanded && (
          <ParallelEditor slot={slot} onUpdate={onUpdate} subsystems={subsystems} />
        )}
      </div>
    </div>
  );
}

function ParallelEditor({ slot, onUpdate, subsystems }) {
  const subs = slot.parallelSubs ?? [];
  const addSub = (type) => onUpdate(slot.id, { parallelSubs: [...subs, { id: `psub-${Date.now()}`, type, defaultWait: 0, subsystemName: '', commandName: '' }] });
  const updateSub = (i, updates) => onUpdate(slot.id, { parallelSubs: subs.map((s, idx) => idx === i ? { ...s, ...updates } : s) });
  const removeSub = (i) => onUpdate(slot.id, { parallelSubs: subs.filter((_, idx) => idx !== i) });

  return (
    <div className="px-3 pb-2.5 space-y-2" onClick={e => e.stopPropagation()}>
      {subs.map((sub, i) => (
        <div key={sub.id} className="bg-secondary/30 rounded-lg p-2 space-y-1.5">
          {sub.type === 'wait' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-yellow-400 font-semibold">Wait</span>
              <input type="number" value={sub.defaultWait ?? 0} step={0.1} min={0}
                onChange={e => updateSub(i, { defaultWait: parseFloat(e.target.value) || 0 })}
                className="w-14 bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-xs font-num text-foreground outline-none" />
              <span className="text-[10px] text-muted-foreground">s</span>
              <button onClick={() => removeSub(i)} className="ml-auto text-destructive/50 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <select value={sub.subsystemName ?? ''} onChange={e => updateSub(i, { subsystemName: e.target.value, commandName: '' })}
                  className="flex-1 min-w-0 bg-secondary/50 border border-border rounded px-1.5 py-1 text-xs text-foreground outline-none">
                  <option value="">— Subsystem —</option>
                  {subsystems.map(s => <option key={s.id ?? s.name} value={s.name}>{s.name}</option>)}
                </select>
                {!sub.subsystemName && <IssueBadge issues={subsystemRefIssues(sub, subsystems)} />}
                <button onClick={() => removeSub(i)} className="text-destructive/50 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
              {sub.subsystemName && (
                <div className="flex items-center gap-1.5">
                  <select value={sub.commandName ?? ''} onChange={e => updateSub(i, { commandName: e.target.value })}
                    className="flex-1 min-w-0 bg-secondary/50 border border-border rounded px-1.5 py-1 text-xs text-foreground outline-none">
                    <option value="">— Command —</option>
                    {(subsystems.find(s => s.name === sub.subsystemName)?.commands ?? []).map(c => (
                      <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <IssueBadge issues={subsystemRefIssues(sub, subsystems)} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-1.5">
        <button onClick={() => addSub('wait')} className="flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-medium hover:bg-green-500/20">
          <Plus className="w-2.5 h-2.5" /> Wait
        </button>
        <button onClick={() => addSub('subsystem')} className="flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-medium hover:bg-green-500/20">
          <Plus className="w-2.5 h-2.5" /> Subsystem
        </button>
      </div>
    </div>
  );
}

function PointSlotPanel({ slot, point, onUpdateSlot, onUpdatePoint, subsystems, motionUnits, onEditStart, onEditEnd }) {
  const addTrigger = () => onUpdateSlot({ subsystemTriggers: [...(slot.subsystemTriggers ?? []), { id: `trig-${Date.now()}`, subsystemName: '', commandName: '', progress: 0 }] });
  const updateTrigger = (i, updates) => onUpdateSlot({ subsystemTriggers: (slot.subsystemTriggers ?? []).map((t, idx) => idx === i ? { ...t, ...updates } : t) });
  const removeTrigger = (i) => onUpdateSlot({ subsystemTriggers: (slot.subsystemTriggers ?? []).filter((_, idx) => idx !== i) });

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Point: {point?.name ?? '—'}
        </h3>
        <p className="text-[10px] text-muted-foreground/70 mb-3">
          This point's pose is shared — moving or turning it here changes every slot in every Auto that uses it.
        </p>
        {point && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">X</label>
              <input type="number" value={parseFloat((point.x ?? 0).toFixed(3))} step={0.01}
                onChange={e => onUpdatePoint({ x: parseFloat(e.target.value) || 0 })}
                className="bg-secondary/50 border border-border rounded px-2 py-1 text-xs font-num text-foreground outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Y</label>
              <input type="number" value={parseFloat((point.y ?? 0).toFixed(3))} step={0.01}
                onChange={e => onUpdatePoint({ y: parseFloat(e.target.value) || 0 })}
                className="bg-secondary/50 border border-border rounded px-2 py-1 text-xs font-num text-foreground outline-none focus:border-primary" />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Robot Rotation (shared)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={-180} max={180} step={1} value={-(point?.rotation ?? 0)}
              onMouseDown={() => onEditStart?.()} onMouseUp={() => onEditEnd?.()}
              onChange={e => onUpdatePoint({ rotation: -parseFloat(e.target.value) })}
              className="flex-1 accent-primary" />
            <span className="text-xs font-num text-foreground w-10 text-right">{Math.round(point?.rotation ?? 0)}°</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <OptionalParamsSection wp={slot} onUpdate={(updates) => onUpdateSlot(updates)} optionalParams={motionUnits.optionalParams} />
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-violet-400" /> Subsystem Triggers
        </p>
        <div className="space-y-2">
          {(slot.subsystemTriggers ?? []).length === 0 && (
            <p className="text-[10px] text-muted-foreground/60">No triggers on this segment yet.</p>
          )}
          {(slot.subsystemTriggers ?? []).map((trig, i) => {
            const sys = subsystems.find(s => s.name === trig.subsystemName);
            return (
              <div key={trig.id ?? i} className="bg-secondary/30 rounded-lg p-2 space-y-1.5 border border-violet-500/20">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-violet-400 font-semibold">@ {Math.round((trig.progress ?? 0) * 100)}%</span>
                  <input type="range" min={0} max={1} step={0.01} value={trig.progress ?? 0}
                    onChange={e => updateTrigger(i, { progress: parseFloat(e.target.value) })}
                    className="flex-1 accent-primary" />
                  <IssueBadge issues={subsystemRefIssues(trig, subsystems)} />
                  <button onClick={() => removeTrigger(i)} className="text-destructive/50 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
                <select value={trig.subsystemName ?? ''} onChange={e => updateTrigger(i, { subsystemName: e.target.value, commandName: '' })}
                  className="w-full bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-primary">
                  <option value="">— Subsystem —</option>
                  {subsystems.map(s => <option key={s.id ?? s.name} value={s.name}>{s.name}</option>)}
                </select>
                {trig.subsystemName && (
                  <select value={trig.commandName ?? ''} onChange={e => updateTrigger(i, { commandName: e.target.value })}
                    className="w-full bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-primary">
                    <option value="">— Command —</option>
                    {(sys?.commands ?? []).map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          <button onClick={addTrigger} className="flex items-center gap-1 px-2 py-1 bg-violet-500/10 text-violet-400 rounded text-xs font-medium hover:bg-violet-500/20 transition-all">
            <Plus className="w-3 h-3" /> Add Trigger
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AutoWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeField, bounds, imageUrl } = useFieldConfig();
  const { projectType, isFrc, isFtc } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);

  const [tabs, setTabs] = useState([]);
  const [auto, setAuto] = useState(null);
  const [allPaths, setAllPaths] = useState([]);
  const [allPoints, setAllPoints] = useState([]);
  const [subsystems, setSubsystems] = useState([]);
  const [robotSettings, setRobotSettings] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(null);
  const [tool, setTool] = useState('select');
  const [showVelocity, setShowVelocity] = useState(false);
  const [zoom, setZoom] = useState(1.5);

  // ── Simulation (embedded — no separate route, no mode toggle) ────────────
  const [alliance, setAlliance] = useState('blue');
  const [fieldSide, setFieldSide] = useState('R');
  const [isPlaying, setIsPlaying] = useState(false);
  const [simTime, setSimTime] = useState(0);
  // Playback takes over the field until Back to Edit (or a click on the sequence panel)
  // explicitly returns to the editor. Stopping or scrubbing must not leak the path panel.
  const [simPreview, setSimPreview] = useState(false);
  const simPreviewRef = useRef(false);
  const leavingSimRef = useRef(false);
  const simAnimRef = useRef(null);
  const simStartRef = useRef(null);

  const resetPanRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const viewAdjustedRef = useRef(false);
  const fittedSizeRef = useRef({ w: 0, h: 0 });
  const slotNodeRefs = useRef({});

  // ── Native drag-and-drop for the sequence list (palette → sequence, and reordering) ──
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingSlotId, setDraggingSlotId] = useState(null);
  const dragDataRef = useRef(null);
  const autoRef = useRef(null);
  const allPathsRef = useRef([]);
  const allPointsRef = useRef([]);
  // Every Auto in the project, read-only: joints are shared, so an edit here has to know
  // which paths and points touch each other in sequences that aren't currently open.
  const allAutosRef = useRef([]);
  const saveTimer = useRef(null);
  const savedAutoNameRef = useRef(null);
  const nameClashRef = useRef(null);
  const savedPathNameRef = useRef({});

  useEffect(() => { allPathsRef.current = allPaths; }, [allPaths]);
  useEffect(() => { allPointsRef.current = allPoints; }, [allPoints]);

  // ── Load tabs, auto, and shared entities ─────────────────────────────────

  useEffect(() => {
    const stored = readTabs();
    setTabs(stored);
  }, []);

  useEffect(() => {
    if (!id) return;
    setTabs(prev => {
      if (prev.some(t => t.id === id)) return prev;
      const next = [...prev, { id }];
      writeTabs(next);
      return next;
    });
  }, [id]);

  const refreshShared = useCallback(() => {
    return Promise.all([
      readEntity('SavedAuto'),
      readEntity('Point'),
      readEntity('SubsystemConfig'),
      readEntity('RobotSettings'),
    ]).then(([paths, points, scList, rList]) => {
      setAllPaths(Array.isArray(paths) ? paths.map(normalizeSavedPath) : []);
      setAllPoints(Array.isArray(points) ? points : []);
      const sc = Array.isArray(scList) ? scList : [];
      setSubsystems(sc[0]?.subsystems ?? []);
      const rs = Array.isArray(rList) ? rList : [];
      if (rs.length > 0) setRobotSettings(rs[0]);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoaded(false);
    setSelectedSlotId(null);
    setSimPreview(false);
    setIsPlaying(false);
    setSimTime(0);
    resetHistory();
    Promise.all([readEntity('Auto'), refreshShared()]).then(([autos]) => {
      const list = Array.isArray(autos) ? autos : [];
      const found = list.find(a => a.id === id) ?? list.find(a => safeId(a.name) === id);
      const record = found ? normalizeAuto(found) : uniqueFallbackAuto(id, list);
      allAutosRef.current = list.map(normalizeAuto);
      setAuto(record);
      // Name *every* open tab, not just the one being opened. A tab restored from storage
      // has only its id, and an id is a safe-name slug ("Auto_2"), so an unnamed tab used to
      // render the slug until you clicked it — the tab strip disagreeing with the Auto.
      setTabs(prev => {
        const named = prev.map(t => {
          const match = t.id === id ? record : list.find(a => a.id === t.id || safeId(a.name) === t.id);
          return match ? { ...t, name: match.name } : t;
        });
        if (named.every((t, i) => t.name === prev[i].name)) return prev;
        writeTabs(named);
        return named;
      });
      autoRef.current = record;
      savedAutoNameRef.current = record.name;
      setLoaded(true);
    });
  }, [id, refreshShared]);

  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => {
    const current = auto;
    if (!current?.id) return;
    const list = allAutosRef.current ?? [];
    allAutosRef.current = list.some(a => a.id === current.id)
      ? list.map(a => (a.id === current.id ? current : a))
      : [...list, current];
  }, [auto]);
  useEffect(() => { simPreviewRef.current = simPreview; }, [simPreview]);
  useEffect(() => {
    if (!auto) return;
    const list = allAutosRef.current ?? [];
    allAutosRef.current = list.some(a => a.id === auto.id)
      ? list.map(a => (a.id === auto.id ? auto : a))
      : [...list, auto];
  }, [auto]);

  const defaultConstraints = useMemo(() => motionUnits.defaultConstraints, [motionUnits]);

  // ── Persist Auto sequence/name (debounced) ───────────────────────────────

  const saveAuto = useCallback(async (overrideAuto) => {
    const record = overrideAuto ?? autoRef.current;
    if (!record) return;
    // An Auto's filename is its safe-name slug, so writing under a name another Auto already
    // uses would overwrite that Auto's .auto.json (and its generated FTC OpMode). Hold the
    // save until the name is unique again — the name bar says so while it is not.
    if (nameClashRef.current) return;
    const previousName = savedAutoNameRef.current;
    await updateEntity('Auto', record.id, { name: record.name, sequence: record.sequence });
    // Write the whole record, not just the edited fields — this file is the Auto, so a
    // partial object here would silently drop anything the workspace doesn't touch (its folder).
    await saveAutoToProject({ ...record, name: record.name, sequence: record.sequence }, previousName);
    savedAutoNameRef.current = record.name;
  }, []);

  const scheduleSaveAuto = useCallback((nextAuto) => {
    autoRef.current = nextAuto;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAuto(nextAuto), 500);
  }, [saveAuto]);

  // ── Undo / redo ───────────────────────────────────────────────────────────
  // A single history covers everything editable here — the slot sequence plus the
  // shared path/point records, since dragging a waypoint edits a path, not the Auto.

  const getSnapshot = useCallback(() => {
    if (!autoRef.current) return null;
    return {
      sequence: structuredClone(autoRef.current.sequence ?? []),
      paths: structuredClone(allPathsRef.current ?? []),
      points: structuredClone(allPointsRef.current ?? []),
    };
  }, []);

  const applySnapshot = useCallback((snapshot, current) => {
    clearTimeout(saveTimer.current);
    clearTimeout(pathSaveTimer.current);
    clearTimeout(pointSaveTimer.current);

    allPathsRef.current = snapshot.paths;
    allPointsRef.current = snapshot.points;
    setAllPaths(snapshot.paths);
    setAllPoints(snapshot.points);

    const nextAuto = { ...autoRef.current, sequence: snapshot.sequence };
    autoRef.current = nextAuto;
    setAuto(nextAuto);

    saveAuto(nextAuto);
    persistPathsDiff(current?.paths ?? [], snapshot.paths);
    persistPointsDiff(current?.points ?? [], snapshot.points);
  }, [saveAuto]);

  const { record, beginGesture, endGesture, undo, redo, canUndo, canRedo, reset: resetHistory } =
    useUndoRedo({ getSnapshot, applySnapshot });

  const updateAuto = useCallback((updates) => {
    record();
    setAuto(prev => {
      const next = { ...prev, ...updates };
      scheduleSaveAuto(next);
      return next;
    });
  }, [scheduleSaveAuto, record]);

  const updateSequence = useCallback((nextSequence) => updateAuto({ sequence: nextSequence }), [updateAuto]);

  // ── Chain resolution ──────────────────────────────────────────────────────

  const chain = useMemo(() => {
    if (!auto) return [];
    const resolved = buildAutoChain(auto.sequence ?? [], { paths: allPaths, points: allPoints });
    return resolved.map(slot => {
      if (!slot.chainedWaypoints || slot.chainedWaypoints.length < 2) return slot;
      const constraints = slot.type === 'path' ? (slot.path?.constraints?.maxVel ? slot.path.constraints : defaultConstraints) : defaultConstraints;
      const rotationTargets = slot.type === 'path' ? (slot.path?.rotationTargets ?? []) : [];
      const trajectory = generateTrajectory(slot.chainedWaypoints, constraints, rotationTargets);
      return { ...slot, trajectory };
    });
  }, [auto, allPaths, allPoints, defaultConstraints]);

  const selectedSlot = useMemo(() => (auto?.sequence ?? []).find(s => s.id === selectedSlotId) ?? null, [auto, selectedSlotId]);
  const selectedChainSlot = useMemo(() => chain.find(s => s.id === selectedSlotId) ?? null, [chain, selectedSlotId]);

  // Reordering a sequence hands a slot new neighbours without moving any coordinates, so the
  // joint it used to have no longer lines up; flag those rather than quietly dragging paths.
  const linkGaps = useMemo(() => chainLinkGaps(auto?.sequence, {
    paths: allPaths,
    points: allPoints,
    tolerance: isFtc ? 0.25 : 0.01,
  }), [auto, allPaths, allPoints, isFtc]);

  // Every half-filled-in slot in the sequence, so the list can flag them with a hazard badge.
  // Warnings only — a slot you are still wiring up is a normal state, not a save blocker.
  const issuesBySlot = useMemo(() => {
    const map = {};
    for (const slot of auto?.sequence ?? []) {
      const record = slot.type === 'path' ? resolvePathRef(allPaths, slot.pathId)
        : slot.type === 'point' ? (allPoints.find(p => p.id === slot.pointId) ?? null)
          : null;
      const issues = slotIssues(slot, {
        subsystems,
        record,
        gap: linkGaps[slot.id],
        lengthUnit: motionUnits.lengthUnit,
      });
      if (issues.length > 0) map[slot.id] = issues;
    }
    return map;
  }, [auto, allPaths, allPoints, subsystems, linkGaps, motionUnits.lengthUnit]);

  const contextSegments = useMemo(() => {
    return chain
      .filter(s => s.id !== selectedSlotId && s.trajectory)
      .map(s => ({ trajectory: s.trajectory, dashed: s.type === 'point' }));
  }, [chain, selectedSlotId]);

  // ── Simulation segments (built from the same chain used for editing) ────

  const segments = useMemo(() => chainToSegments(chain), [chain]);
  const totalTime = useMemo(() => segments.reduce((s, seg) => s + (seg.duration ?? 0), 0), [segments]);
  const durationById = useMemo(() => {
    const map = {};
    segments.forEach(seg => { map[seg.cmdId] = seg.duration ?? 0; });
    return map;
  }, [segments]);

  const fieldSideInitRef = useRef(false);
  useEffect(() => {
    if (fieldSideInitRef.current || segments.length === 0) return;
    const firstPositional = segments.find(s => s.type === 'path' || s.type === 'point');
    if (!firstPositional) return;
    setFieldSide(firstPositional.startSide ?? 'R');
    fieldSideInitRef.current = true;
  }, [segments]);

  const displaySegments = useMemo(() => segments.map(seg => {
    if (!seg.trajectory) return seg;
    let traj = seg.trajectory;
    if (isFrc) {
      if (fieldSide !== (seg.startSide ?? 'R')) traj = mirrorTrajectoryFieldSide(traj);
      if (alliance === 'red') {
        const { xMax, yMax } = bounds;
        traj = {
          ...traj,
          states: traj.states.map(p => ({
            ...p,
            x: xMax - p.x,
            y: yMax - p.y,
            heading: wrapAngle((p.heading ?? p.rotation ?? 0) - 180),
            rotation: wrapAngle((p.rotation ?? p.heading ?? 0) - 180),
          })),
        };
      }
    } else if (alliance === 'red') {
      traj = mirrorTrajectoryAcrossYAxis(traj);
    }
    return { ...seg, trajectory: traj };
  }), [segments, isFrc, fieldSide, alliance, bounds]);

  let simElapsed = 0, activeSegIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (simTime <= simElapsed + segments[i].duration) { activeSegIdx = i; break; }
    simElapsed += segments[i].duration;
  }
  // Playback preview takes over the center canvas until the user explicitly returns
  // to edit — stopping or letting the routine finish must not reopen the path panel.
  const showSimCanvas = simPreview;
  const activeSegId = showSimCanvas ? segments[activeSegIdx]?.cmdId ?? null : null;

  // As playback progresses, keep the active slot in view in the left sequence panel.
  useEffect(() => {
    if (!isPlaying || !activeSegId) return;
    const node = slotNodeRefs.current[activeSegId];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isPlaying, activeSegId]);

  const stopSim = useCallback(() => {
    setIsPlaying(false);
    if (simAnimRef.current) cancelAnimationFrame(simAnimRef.current);
  }, []);

  const enterSimPreview = useCallback(() => {
    setSimPreview(true);
    setSelectedSlotId(null);
  }, []);

  const playSim = useCallback(() => {
    enterSimPreview();
    setSimTime(prev => {
      const t = prev >= totalTime - 0.01 ? 0 : prev;
      simStartRef.current = performance.now() - t * 1000;
      return t;
    });
    setIsPlaying(true);
  }, [totalTime, enterSimPreview]);

  const replaySim = useCallback(() => {
    stopSim();
    enterSimPreview();
    setSimTime(0);
    simStartRef.current = performance.now();
    setIsPlaying(true);
  }, [stopSim, enterSimPreview]);

  const resetSimClock = useCallback(() => { stopSim(); setSimTime(0); }, [stopSim]);

  const exitSimPreview = useCallback(() => {
    stopSim();
    setSimTime(0);
    setSimPreview(false);
  }, [stopSim]);

  useEffect(() => {
    if (!isPlaying) return;
    if (!simStartRef.current) simStartRef.current = performance.now() - simTime * 1000;
    const tick = (ts) => {
      const elapsed = (ts - simStartRef.current) / 1000;
      const t = Math.min(elapsed, totalTime);
      setSimTime(t);
      if (t < totalTime) simAnimRef.current = requestAnimationFrame(tick);
      else { setIsPlaying(false); simStartRef.current = null; }
    };
    simAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(simAnimRef.current);
  }, [isPlaying, totalTime]);

  // ── Slot CRUD ─────────────────────────────────────────────────────────────

  const genSlotId = () => `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /**
   * A brand new path is pre-filled with a start/end pair that already connects to its
   * neighbours in the sequence, so it lands as a usable segment instead of an empty slot.
   */
  const createSeededPath = useCallback(async (insertIndex) => {
    const waypoints = seedWaypointsForNewPath(autoRef.current?.sequence ?? [], insertIndex, {
      paths: allPathsRef.current,
      points: allPointsRef.current,
      fallbackSpan: isFtc ? 24 : 1,
    });
    const created = await createEntity('SavedAuto', {
      name: nextAvailableName('Path', allPathsRef.current),
      waypoints,
      constraints: {},
    });
    const next = [...allPathsRef.current, created];
    allPathsRef.current = next;
    setAllPaths(next);
    return created;
  }, [isFtc]);

  const createPoint = useCallback(async () => {
    const created = await createEntity('Point', {
      name: nextAvailableName('Point', allPointsRef.current),
      x: 0, y: 0, rotation: 0,
    });
    const next = [...allPointsRef.current, created];
    allPointsRef.current = next;
    setAllPoints(next);
    return created;
  }, []);

  /**
   * Creating a slot touches both the shared record list and the sequence; grouping them
   * means one undo step removes the slot *and* the record it created.
   */
  const asTransaction = useCallback(async (fn) => {
    beginGesture();
    record();
    try {
      return await fn();
    } finally {
      endGesture();
    }
  }, [beginGesture, record, endGesture]);

  const addPathSlot = useCallback((existingPathId) => asTransaction(async () => {
    const seqLength = (autoRef.current?.sequence ?? []).length;
    const pathId = existingPathId ?? (await createSeededPath(seqLength)).id;
    const slot = { id: genSlotId(), type: 'path', pathId, skip: false };
    updateSequence([...(autoRef.current?.sequence ?? []), slot]);
    setSelectedSlotId(slot.id);
  }), [asTransaction, createSeededPath, updateSequence]);

  const addPointSlot = useCallback((existingPointId) => asTransaction(async () => {
    const pointId = existingPointId ?? (await createPoint()).id;
    const slot = { id: genSlotId(), type: 'point', pointId, params: {}, subsystemTriggers: [], skip: false };
    updateSequence([...(autoRef.current?.sequence ?? []), slot]);
    setSelectedSlotId(slot.id);
  }), [asTransaction, createPoint, updateSequence]);

  const addSimpleSlot = useCallback((type) => {
    const base = { id: genSlotId(), type, skip: false };
    const extra = type === 'wait' ? { duration: 0 } : type === 'parallel' ? { parallelSubs: [] } : { subsystemName: '', commandName: '' };
    const slot = { ...base, ...extra };
    const nextSeq = [...(autoRef.current?.sequence ?? []), slot];
    updateSequence(nextSeq);
    setSelectedSlotId(slot.id);
  }, [updateSequence]);

  const deleteSlot = useCallback((slotId) => {
    const nextSeq = (autoRef.current?.sequence ?? []).filter(s => s.id !== slotId);
    updateSequence(nextSeq);
    if (selectedSlotId === slotId) setSelectedSlotId(null);
  }, [updateSequence, selectedSlotId]);

  const toggleSkip = useCallback((slotId) => {
    const nextSeq = (autoRef.current?.sequence ?? []).map(s => s.id === slotId ? { ...s, skip: !s.skip } : s);
    updateSequence(nextSeq);
  }, [updateSequence]);

  const updateSlot = useCallback((slotId, updates) => {
    const nextSeq = (autoRef.current?.sequence ?? []).map(s => s.id === slotId ? { ...s, ...updates } : s);
    updateSequence(nextSeq);
  }, [updateSequence]);

  const insertSlotAt = useCallback((type, atIndex) => asTransaction(async () => {
    const seq = Array.from(autoRef.current?.sequence ?? []);
    const clampedIndex = Math.max(0, Math.min(seq.length, atIndex));
    let slot;
    if (type === 'path') {
      const created = await createSeededPath(clampedIndex);
      slot = { id: genSlotId(), type: 'path', pathId: created.id, skip: false };
    } else if (type === 'point') {
      const created = await createPoint();
      slot = { id: genSlotId(), type: 'point', pointId: created.id, params: {}, subsystemTriggers: [], skip: false };
    } else {
      const extra = type === 'wait' ? { duration: 0 } : type === 'parallel' ? { parallelSubs: [] } : { subsystemName: '', commandName: '' };
      slot = { id: genSlotId(), type, skip: false, ...extra };
    }
    seq.splice(clampedIndex, 0, slot);
    updateSequence(seq);
    setSelectedSlotId(slot.id);
  }), [asTransaction, createSeededPath, createPoint, updateSequence]);

  const reorderSlot = useCallback((fromIndex, toIndex) => {
    const seq = Array.from(autoRef.current?.sequence ?? []);
    if (fromIndex < 0 || fromIndex >= seq.length) return;
    const [moved] = seq.splice(fromIndex, 1);
    let insertAt = toIndex;
    if (fromIndex < toIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(seq.length, insertAt));
    if (insertAt === fromIndex) return;
    seq.splice(insertAt, 0, moved);
    updateSequence(seq);
  }, [updateSequence]);

  const clearDragState = useCallback(() => {
    setDragOverIndex(null);
    setDraggingSlotId(null);
    dragDataRef.current = null;
  }, []);

  const handlePaletteDragStart = useCallback((type) => {
    dragDataRef.current = { kind: 'palette', slotType: type };
  }, []);

  const handleSlotDragStart = useCallback((slot, index) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', slot.id);
    dragDataRef.current = { kind: 'sequence', slotId: slot.id, fromIndex: index };
    setDraggingSlotId(slot.id);
  }, []);

  const handleItemDragOver = useCallback((index) => (e) => {
    if (!dragDataRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragDataRef.current.kind === 'palette' ? 'copy' : 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    setDragOverIndex(before ? index : index + 1);
  }, []);

  const handleListDragOver = useCallback((e) => {
    if (!dragDataRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragDataRef.current.kind === 'palette' ? 'copy' : 'move';
    setDragOverIndex(prev => prev ?? (autoRef.current?.sequence ?? []).length);
  }, []);

  const handleListDrop = useCallback((e) => {
    e.preventDefault();
    const data = dragDataRef.current;
    const seqLen = (autoRef.current?.sequence ?? []).length;
    const idx = Math.max(0, Math.min(seqLen, dragOverIndex ?? seqLen));
    clearDragState();
    if (!data) return;
    if (data.kind === 'palette') {
      insertSlotAt(data.slotType, idx);
    } else if (data.kind === 'sequence') {
      reorderSlot(data.fromIndex, idx);
    }
  }, [dragOverIndex, clearDragState, insertSlotAt, reorderSlot]);

  // ── Active path-slot editing (native/unshifted waypoints) ───────────────

  const activePathRecord = useMemo(() => {
    if (selectedSlot?.type !== 'path') return null;
    return resolvePathRef(allPaths, selectedSlot.pathId) ?? null;
  }, [selectedSlot, allPaths]);

  const savePathRecord = useCallback(async (record) => {
    const previousName = savedPathNameRef.current[record.id] ?? record.name;
    await updateEntity('SavedAuto', record.id, record);
    await savePathToProject(record, previousName);
    savedPathNameRef.current[record.id] = record.name;
  }, []);

  // ── Chain links ───────────────────────────────────────────────────────────
  // Records are shared between Autos, so moving one end of a path or point has to drag
  // whatever it joins in every sequence. The edited record is saved by its own debounce; the
  // records propagation moves are written here by diffing against the pre-propagation lists.

  const linkSaveTimer = useRef(null);

  const autosForLinking = useCallback(() => {
    const current = autoRef.current;
    const list = allAutosRef.current ?? [];
    if (!current) return list;
    return list.some(a => a.id === current.id)
      ? list.map(a => (a.id === current.id ? current : a))
      : [...list, current];
  }, []);

  const propagateLinks = useCallback((seed, basePaths, basePoints) => {
    const linked = propagateChainLinks(
      { paths: basePaths, points: basePoints, autos: autosForLinking() },
      [seed],
    );
    if (linked.paths === basePaths && linked.points === basePoints) return;

    allPathsRef.current = linked.paths;
    allPointsRef.current = linked.points;
    setAllPaths(linked.paths);
    setAllPoints(linked.points);

    clearTimeout(linkSaveTimer.current);
    linkSaveTimer.current = setTimeout(() => {
      persistPathsDiff(basePaths, linked.paths);
      persistPointsDiff(basePoints, linked.points);
    }, 400);
  }, [autosForLinking]);

  const pathSaveTimer = useRef(null);
  const persistOriginRef = useRef(null);
  const updatePathRecord = useCallback((pathId, updates) => {
    record();
    if (!persistOriginRef.current) {
      persistOriginRef.current = {
        paths: structuredClone(allPathsRef.current),
        points: structuredClone(allPointsRef.current),
      };
    }
    const before = findPath(allPathsRef.current, pathId);
    if (!before) return;
    const after = { ...before, ...updates };
    let nextPaths = allPathsRef.current.map(p => (p === before || (before.id != null && p.id === before.id) ? after : p));
    let nextPoints = allPointsRef.current;
    const ends = changedEndpoints('path', before, after);
    if (ends.length > 0) {
      const linked = propagateChainLinks(
        { paths: nextPaths, points: nextPoints, autos: autosForLinking() },
        [{ kind: 'path', id: after.id ?? after.name ?? pathId, ends }],
      );
      nextPaths = linked.paths;
      nextPoints = linked.points;
    }
    allPathsRef.current = nextPaths;
    allPointsRef.current = nextPoints;
    setAllPaths(nextPaths);
    setAllPoints(nextPoints);
    clearTimeout(pathSaveTimer.current);
    pathSaveTimer.current = setTimeout(() => {
      const origin = persistOriginRef.current;
      persistOriginRef.current = null;
      if (!origin) return;
      persistPathsDiff(origin.paths, allPathsRef.current);
      persistPointsDiff(origin.points, allPointsRef.current);
    }, 400);
  }, [record, autosForLinking]);

  /**
   * Rename the path or point behind a slot. A record's id *is* its safe-name slug, so a rename
   * changes the id too, and every slot in every Auto that pointed at the old one has to be
   * retargeted or it goes Unassigned. That is exactly what the Path & Point Index does, so
   * this reuses the same helper rather than open-coding a second version of it.
   */
  const renameSlotRecord = useCallback(async (slot, newName) => {
    const kind = slot.type === 'point' ? 'point' : 'path';
    const siblings = kind === 'point' ? allPointsRef.current : allPathsRef.current;
    const rec = kind === 'point'
      ? findPoint(siblings, slot.pointId)
      : resolvePathRef(siblings, slot.pathId);
    if (!rec) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === rec.name) return;
    if (siblings.some(r => r.id !== rec.id && safeId(r.name) === safeId(trimmed))) {
      window.alert(`Another ${kind} is already named "${trimmed}".`);
      return;
    }

    const prevPaths = allPathsRef.current;
    const prevPoints = allPointsRef.current;
    const prevAutos = autosForLinking();
    const renamed = applyRename(
      { paths: prevPaths, points: prevPoints, autos: prevAutos },
      kind, rec, trimmed,
    );

    record();
    allPathsRef.current = renamed.paths;
    setAllPaths(renamed.paths);
    allPointsRef.current = renamed.points;
    setAllPoints(renamed.points);
    allAutosRef.current = renamed.autos;
    const nextAuto = renamed.autos.find(a => a.id === autoRef.current?.id);
    if (nextAuto) {
      autoRef.current = nextAuto;
      setAuto(nextAuto);
    }
    // The record's own debounce would write the *new* name to the *old* filename.
    clearTimeout(pathSaveTimer.current);
    clearTimeout(pointSaveTimer.current);
    savedPathNameRef.current[safeId(trimmed)] = trimmed;
    delete savedPathNameRef.current[rec.id];
    await persistPathsDiff(prevPaths, renamed.paths);
    await persistPointsDiff(prevPoints, renamed.points);
    await persistAutosDiff(prevAutos, renamed.autos);
  }, [record, autosForLinking]);

  const nativeWaypoints = activePathRecord?.waypoints ?? [];
  const startLinked = !!(selectedSlot?.type === 'path' && hasLinkedStart(auto?.sequence, selectedSlotId));

  // Edit the stored path, not a display-only chain snap. Neighbours are written through
  // in updatePathRecord so the next path you select is the one you just dragged.
  const editorWaypoints = nativeWaypoints;

  const activeTrajectory = useMemo(() => {
    if (!activePathRecord || nativeWaypoints.length < 2) return null;
    return generateTrajectory(nativeWaypoints, activePathRecord.constraints?.maxVel ? activePathRecord.constraints : defaultConstraints, activePathRecord.rotationTargets ?? []);
  }, [activePathRecord, nativeWaypoints, defaultConstraints]);

  const onAddPathWaypoint = useCallback((wp) => {
    if (!activePathRecord) return;
    updatePathRecord(activePathRecord.id, { waypoints: [...nativeWaypoints, wp] });
    setSelectedWaypointIndex(nativeWaypoints.length);
  }, [activePathRecord, nativeWaypoints, updatePathRecord]);

  const onDeletePathWaypoint = useCallback((index) => {
    if (!activePathRecord) return;
    if (startLinked && index === 0) return;
    const next = nativeWaypoints.filter((_, i) => i !== index);
    updatePathRecord(activePathRecord.id, { waypoints: next });
    setSelectedWaypointIndex(idx => idx != null && idx >= next.length ? next.length - 1 : idx);
  }, [activePathRecord, nativeWaypoints, updatePathRecord, startLinked]);

  // ── Active point-slot editing ─────────────────────────────────────────────

  const activePoint = useMemo(() => {
    if (selectedSlot?.type !== 'point') return null;
    return allPoints.find(p => p.id === selectedSlot.pointId) ?? null;
  }, [selectedSlot, allPoints]);

  const pointSaveTimer = useRef(null);
  const updatePointRecord = useCallback((pointId, updates) => {
    const before = allPointsRef.current.find(p => p.id === pointId);
    if (!before) return;
    record();
    const after = { ...before, ...updates };
    const next = allPointsRef.current.map(p => (p.id === pointId ? after : p));
    allPointsRef.current = next;
    setAllPoints(next);
    clearTimeout(pointSaveTimer.current);
    pointSaveTimer.current = setTimeout(async () => {
      await updateEntity('Point', after.id, after);
      await savePointToProject(after, after.name);
    }, 400);

    const ends = changedEndpoints('point', before, after);
    if (ends.length > 0) propagateLinks({ kind: 'point', id: after.id, ends }, allPathsRef.current, next);
  }, [record, propagateLinks]);

  const updateActivePoint = useCallback((updates) => {
    if (!activePoint) return;
    updatePointRecord(activePoint.id, updates);
  }, [activePoint, updatePointRecord]);

  const pointActiveWaypoints = useMemo(() => {
    if (!selectedSlot || selectedSlot.type !== 'point' || !activePoint) return [];
    const endWp = { x: activePoint.x, y: activePoint.y, rotation: activePoint.rotation ?? 0, prevControl: null, nextControl: null, params: selectedSlot.params ?? {} };
    if (selectedChainSlot?.chainedWaypoints?.length === 2) {
      return [selectedChainSlot.chainedWaypoints[0], endWp];
    }
    return [endWp];
  }, [selectedSlot, activePoint, selectedChainSlot]);

  const pointActiveTrajectory = useMemo(() => {
    if (pointActiveWaypoints.length < 2) return null;
    return generateTrajectory(pointActiveWaypoints, defaultConstraints, []);
  }, [pointActiveWaypoints, defaultConstraints]);

  const findPrevPositionalSlot = useCallback((slotId) => {
    const seq = autoRef.current?.sequence ?? auto?.sequence ?? [];
    const idx = seq.findIndex(s => s.id === slotId);
    for (let i = idx - 1; i >= 0; i--) {
      const s = seq[i];
      if (s.skip) continue;
      if (s.type === 'path' || s.type === 'point') return s;
    }
    return null;
  }, [auto]);

  // Moves only the previous slot's end pose to match — used by a point's virtual start marker.
  const movePrevSlotEnd = useCallback((prevSlot, updates) => {
    if (!prevSlot) return;
    if (prevSlot.type === 'point') {
      const target = allPointsRef.current.find(p => p.id === prevSlot.pointId);
      if (!target) return;
      updatePointRecord(target.id, { x: updates.x ?? target.x, y: updates.y ?? target.y });
      return;
    }
    if (prevSlot.type === 'path') {
      const prevPath = resolvePathRef(allPathsRef.current, prevSlot.pathId);
      if (!prevPath?.waypoints?.length) return;
      const last = prevPath.waypoints[prevPath.waypoints.length - 1];
      const moved = setRecordEndpoint('path', prevPath, 'end', {
        x: updates.x ?? last.x,
        y: updates.y ?? last.y,
      });
      if (moved !== prevPath) updatePathRecord(prevPath.id, { waypoints: moved.waypoints });
    }
  }, [updatePathRecord, updatePointRecord]);

  const onUpdatePathWaypoint = useCallback((index, updates) => {
    if (!activePathRecord) return;
    const source = allPathsRef.current.find(p => p.id === activePathRecord.id)?.waypoints ?? nativeWaypoints;
    const next = source.map((w, i) => (i === index ? { ...w, ...updates } : w));
    updatePathRecord(activePathRecord.id, { waypoints: next });
  }, [activePathRecord, nativeWaypoints, updatePathRecord]);

  const onUpdatePointWaypoint = useCallback((index, updates) => {
    const pointWpIndex = pointActiveWaypoints.length - 1;
    if (index === pointWpIndex) {
      if (updates.x != null || updates.y != null) {
        updateActivePoint({ x: updates.x ?? activePoint.x, y: updates.y ?? activePoint.y });
      }
      if (updates.rotation != null) updateActivePoint({ rotation: updates.rotation });
      return;
    }
    // Dragging the (virtual, chained) start marker moves the previous slot's end pose —
    // it stretches that connection instead of moving every other path/point in the auto.
    if (index === 0 && (updates.x != null || updates.y != null)) {
      movePrevSlotEnd(findPrevPositionalSlot(selectedSlotId), updates);
    }
  }, [pointActiveWaypoints.length, activePoint, updateActivePoint, selectedSlotId, findPrevPositionalSlot, movePrevSlotEnd]);

  // ── View helpers ───────────────────────────────────────────────────────────

  const applyInitialView = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const { zoom: z, pan } = getDefaultPathEditorView(el.offsetWidth, el.offsetHeight, activeField);
    viewAdjustedRef.current = false;
    fittedSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
    setZoom(z);
    resetPanRef.current?.(pan);
  }, [activeField]);

  const onResetViewCallback = useCallback((fn) => {
    resetPanRef.current = fn;
    requestAnimationFrame(() => applyInitialView());
  }, [applyInitialView]);

  // Zooming is the signal that the view is *yours* — after that a window resize leaves it
  // alone, so resizing never yanks you out of a waypoint you were lining up. Reset View
  // hands the fit back.
  const onZoomChange = useCallback((next) => {
    viewAdjustedRef.current = true;
    setZoom(next);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const raf = requestAnimationFrame(() => applyInitialView());
    return () => cancelAnimationFrame(raf);
  }, [loaded, applyInitialView]);

  // The canvas only resized its own bitmap on a layout change; zoom and pan kept the values
  // fitted to the *old* size, so the field drifted off-centre and clipped after any window
  // resize. Re-fit whenever the box actually changes size.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el || !loaded) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      const { w, h } = fittedSizeRef.current;
      if (el.offsetWidth === w && el.offsetHeight === h) return;
      if (viewAdjustedRef.current) {
        fittedSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyInitialView());
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [loaded, applyInitialView]);

  useEffect(() => { setSelectedWaypointIndex(null); }, [selectedSlotId]);

  // Deep link from the Path & Point Index: focus the slot that uses the given record.
  useEffect(() => {
    if (!loaded || !auto) return;
    const pathRef = searchParams.get('path');
    const pointRef = searchParams.get('point');
    if (!pathRef && !pointRef) return;
    const match = (auto.sequence ?? []).find(s =>
      (pathRef && s.type === 'path' && matchesRef(findPath(allPaths, s.pathId) ?? { id: s.pathId }, pathRef))
      || (pointRef && s.type === 'point' && matchesRef(findPoint(allPoints, s.pointId) ?? { id: s.pointId }, pointRef)));
    if (match) {
      setSelectedSlotId(match.id);
      requestAnimationFrame(() => slotNodeRefs.current[match.id]?.scrollIntoView({ block: 'nearest' }));
    }
    const next = new URLSearchParams(searchParams);
    next.delete('path');
    next.delete('point');
    setSearchParams(next, { replace: true });
  }, [loaded, auto, searchParams, setSearchParams]);

  const handleNameChange = (name) => updateAuto({ name });

  const handleBack = async () => {
    clearTimeout(saveTimer.current);
    await saveAuto();
    navigate('/string-builder');
  };

  const closeTab = (e, tabId) => {
    e.stopPropagation();
    const next = tabs.filter(t => t.id !== tabId);
    setTabs(next);
    writeTabs(next);
    if (tabId === id) {
      if (next.length > 0) navigate(`/auto-workspace/${next[next.length - 1].id}`);
      else navigate('/string-builder');
    }
  };

  const resolveSlotLabel = (slot) => {
    if (slot.type === 'path') return resolvePathRef(allPaths, slot.pathId)?.name ?? 'Unassigned';
    if (slot.type === 'point') return allPoints.find(p => p.id === slot.pointId)?.name ?? 'Unassigned';
    if (slot.type === 'subsystem') return slot.subsystemName ? `${slot.subsystemName}${slot.commandName ? ' → ' + slot.commandName : ''}` : 'Unassigned';
    if (slot.type === 'wait') return `Wait ${slot.duration ?? 0}s`;
    if (slot.type === 'parallel') return `${(slot.parallelSubs ?? []).length} sub-commands`;
    return '';
  };

  if (!loaded || !auto) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Checked on every keystroke but reported inline rather than as a dialog — you are mid-word
  // most of the time, and an alert per character would be unusable.
  const typedName = auto.name ?? '';
  const slugClash = (allAutosRef.current ?? []).find(a =>
    a.id !== auto.id && safeId(a.name) === safeId(typedName));
  // FTC strips punctuation to build the OpMode class name, so two Autos with different
  // filenames can still land on one .java file. Only one of them would be selectable.
  const classClash = isFtc ? ftcClassNameClash(typedName, allAutosRef.current ?? [], auto.id) : null;
  const nameClash = slugClash ?? classClash;
  nameClashRef.current = nameClash ?? null;

  const isPathSelected = selectedSlot?.type === 'path';
  const isPointSelected = selectedSlot?.type === 'point';
  const showPathTools = isPathSelected && !!activePathRecord;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Tab strip */}
      <div className="flex items-center gap-1 pl-12 pr-2 pt-2 bg-card border-b border-border shrink-0 overflow-x-auto">
        <button onClick={handleBack} className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {tabs.map(t => (
          <button key={t.id} onClick={() => navigate(`/auto-workspace/${t.id}`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all shrink-0 max-w-[160px] ${
              t.id === id ? 'bg-background text-foreground border border-border border-b-background -mb-px' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}>
            <span className="truncate">{t.id === id ? auto.name : (t.name ?? t.id)}</span>
            <X className="w-3 h-3 shrink-0 opacity-60 hover:opacity-100" onClick={(e) => closeTab(e, t.id)} />
          </button>
        ))}
        <button onClick={() => navigate('/string-builder')} title="Open another Auto"
          className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <Link to="/library" title="Path & Point Index"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all shrink-0">
          <Library className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Path &amp; Point Index</span>
        </Link>
      </div>

      {/* Name bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border shrink-0 flex-wrap gap-y-1.5">
        <div className="flex-1 min-w-[120px] flex items-center gap-2">
          <input value={auto.name} onChange={e => handleNameChange(e.target.value)}
            className={`flex-1 min-w-[100px] bg-transparent border-none outline-none text-sm font-semibold focus:bg-secondary/50 px-1.5 py-0.5 rounded transition-colors ${nameClash ? 'text-amber-400' : 'text-foreground'}`}
            placeholder="Auto name…" />
          {nameClash && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 shrink-0"
              title={slugClash
                ? `Another Auto is already named "${nameClash.name}". Saving is paused until this name is unique.`
                : `This would generate the same FTC OpMode class as "${nameClash.name}" — punctuation is stripped from class names. Saving is paused.`}>
              <AlertTriangle className="w-3.5 h-3.5" /> {slugClash ? 'Name already used' : 'Same OpMode class'} — not saving
            </span>
          )}
        </div>
        <div className="flex gap-0.5 bg-secondary/50 rounded-lg p-0.5">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30 disabled:hover:bg-transparent">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30 disabled:hover:bg-transparent">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Canvas tools only make sense alongside the path sidebar, i.e. with a Path slot selected. */}
        {!showSimCanvas && showPathTools && (
          <>
            <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button onClick={() => setTool('select')} className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${tool === 'select' ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>Select</button>
              <button onClick={() => setTool('add')} className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${tool === 'add' ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`} title="Add waypoints">Add</button>
            </div>
            <button onClick={() => setShowVelocity(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${showVelocity ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-secondary/50 border-border text-muted-foreground'}`}>
              Velocity
            </button>
          </>
        )}
        {showSimCanvas && (
          <button onClick={exitSimPreview}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-all">
            <Pencil className="w-3.5 h-3.5" /> Back to Edit
          </button>
        )}
        {showSimCanvas && isFrc && (
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            <button onClick={() => setFieldSide('L')} className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${fieldSide === 'L' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'text-muted-foreground hover:text-foreground'}`}>Left</button>
            <button onClick={() => setFieldSide('R')} className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${fieldSide === 'R' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'text-muted-foreground hover:text-foreground'}`}>Right</button>
          </div>
        )}
        {showSimCanvas && (
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            <button onClick={() => setAlliance('blue')} className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${alliance === 'blue' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'text-muted-foreground hover:text-foreground'}`}>Blue</button>
            <button onClick={() => setAlliance('red')} className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${alliance === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'text-muted-foreground hover:text-foreground'}`}>Red</button>
          </div>
        )}
      </div>

      {/* Both side panels are a fixed 288px. Below roughly 900px they add up to more than
          the window, and the field canvas — the thing you are actually editing — gets
          squeezed to zero width and disappears with no explanation. Give the canvas a floor
          and let the row scroll instead, so a small laptop or a split window degrades to
          "scroll sideways" rather than "the editor is gone". */}
      <div className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {/* Left: sequence panel. A click during playback only returns to edit — it must
            not also select a slot, or the path panel would populate while still in sim. */}
        <div
          onPointerDownCapture={() => {
            if (!simPreviewRef.current) return;
            leavingSimRef.current = true;
            exitSimPreview();
          }}
          onPointerUpCapture={() => {
            if (!leavingSimRef.current) return;
            setTimeout(() => { leavingSimRef.current = false; }, 0);
          }}
          onClickCapture={(e) => {
            if (!leavingSimRef.current) return;
            e.stopPropagation();
            e.preventDefault();
            leavingSimRef.current = false;
          }}
          className="w-72 bg-card border-r border-border flex flex-col shrink-0 min-h-0">
          <div className="p-3 border-b border-border shrink-0">
            <AddSlotMenu
              paths={allPaths}
              points={allPoints}
              subsystems={subsystems}
              onAddPath={addPathSlot}
              onAddPoint={addPointSlot}
              onAddSubsystem={() => addSimpleSlot('subsystem')}
              onAddWait={() => addSimpleSlot('wait')}
              onAddParallel={() => addSimpleSlot('parallel')}
              onPaletteDragStart={handlePaletteDragStart}
              onPaletteDragEnd={clearDragState}
            />
          </div>
          <div
            onDragOver={handleListDragOver}
            onDrop={handleListDrop}
            className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5"
          >
            {(auto.sequence ?? []).length === 0 && (
              <div className="text-center py-10 text-muted-foreground/50 border-2 border-dashed border-border rounded-lg">
                <p className="text-xs">No slots yet</p>
                <p className="text-[10px] mt-1">Add a Path or Point to get started</p>
              </div>
            )}
            {(auto.sequence ?? []).map((slot, i) => (
              <div key={slot.id} onDragOver={handleItemDragOver(i)}>
                <SlotCard
                  slot={slot}
                  isSelected={slot.id === selectedSlotId}
                  isActive={activeSegId === slot.id}
                  isDragging={draggingSlotId === slot.id}
                  isDropTarget={dragOverIndex === i}
                  duration={durationById[slot.id]}
                  registerRef={(node) => { slotNodeRefs.current[slot.id] = node; }}
                  onSlotDragStart={handleSlotDragStart(slot, i)}
                  onSlotDragEnd={clearDragState}
                  onSelect={setSelectedSlotId}
                  onDelete={deleteSlot}
                  onToggleSkip={toggleSkip}
                  onUpdate={updateSlot}
                  subsystems={subsystems}
                  resolvedName={resolveSlotLabel(slot)}
                  issues={issuesBySlot[slot.id] ?? EMPTY_ISSUES}
                  onRenameRecord={renameSlotRecord}
                />
              </div>
            ))}
            {(auto.sequence ?? []).length > 0 && dragOverIndex === (auto.sequence ?? []).length && (
              <div className="h-0.5 mx-1 rounded-full bg-primary" />
            )}
          </div>
        </div>

        {/* Center: canvas + (in sim mode) playback bar */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden min-w-[360px]">
          <div className="flex-1 relative overflow-hidden min-h-0" ref={canvasContainerRef}>
            {showSimCanvas ? (
              <SimCanvas
                segments={displaySegments}
                robotSettings={robotSettings}
                robotSubsystems={robotSettings?.subsystems ?? []}
                simTime={simTime}
                visibleVisuals={resolveVisibleVisuals(displaySegments, subsystems, robotSettings?.subsystems ?? [], simTime)}
                bounds={bounds}
                imageUrl={imageUrl}
                activeField={activeField}
                alliance={alliance}
                showResetButton={false}
              />
            ) : (
              <>
                <FieldCanvas
                  waypoints={isPathSelected ? editorWaypoints : isPointSelected ? pointActiveWaypoints : []}
                  selectedIndex={isPathSelected ? selectedWaypointIndex : isPointSelected ? pointActiveWaypoints.length - 1 : null}
                  tool={isPathSelected ? tool : 'select'}
                  trajectory={isPathSelected ? activeTrajectory : isPointSelected ? pointActiveTrajectory : null}
                  showVelocity={showVelocity}
                  simProgress={0}
                  isSimulating={false}
                  onAddWaypoint={isPathSelected ? onAddPathWaypoint : () => {}}
                  onUpdateWaypoint={isPathSelected ? onUpdatePathWaypoint : isPointSelected ? onUpdatePointWaypoint : () => {}}
                  onDeleteWaypoint={isPathSelected ? onDeletePathWaypoint : () => {}}
                  onSelectWaypoint={isPathSelected ? setSelectedWaypointIndex : () => {}}
                  robotSettings={robotSettings}
                  zoom={zoom}
                  setZoom={onZoomChange}
                  onResetView={onResetViewCallback}
                  subsystemTriggers={isPathSelected ? (activePathRecord?.subsystemTriggers ?? []) : []}
                  subsystemConfig={subsystems}
                  rotationTargets={isPathSelected ? (activePathRecord?.rotationTargets ?? []) : []}
                  onUpdateRotationTargets={isPathSelected ? (rots) => updatePathRecord(activePathRecord.id, { rotationTargets: rots }) : undefined}
                  contextSegments={contextSegments}
                  onBeginEdit={beginGesture}
                  onEndEdit={endGesture}
                />
                {!selectedSlot && (
                  <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-card/90 border border-border text-xs text-muted-foreground rounded-lg backdrop-blur-sm">
                    Select a Path or Point slot on the left to edit it here.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Playback bar — always present at the bottom, no separate "Simulate" mode */}
          <div className="bg-card border-t border-border px-4 py-3 flex items-center gap-3 shrink-0">
            <button onClick={resetSimClock} disabled={!showSimCanvas} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={isPlaying ? stopSim : (simTime >= totalTime - 0.01 && totalTime > 0 ? replaySim : playSim)}
              disabled={totalTime <= 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              {isPlaying ? <><Square className="w-3.5 h-3.5" /> Stop</> : simTime >= totalTime - 0.01 && totalTime > 0 ? <><RotateCcw className="w-3.5 h-3.5" /> Replay</> : <><Play className="w-3.5 h-3.5" /> Play</>}
            </button>
            <input type="range" min={0} max={totalTime || 1} step={0.01} value={simTime}
              disabled={totalTime <= 0}
              onChange={e => {
                enterSimPreview();
                stopSim();
                simStartRef.current = null;
                setSimTime(parseFloat(e.target.value));
              }}
              className="flex-1 accent-primary disabled:opacity-30" />
            <span className="text-xs font-num text-muted-foreground w-24 text-right">
              {simTime.toFixed(2)}s / {(totalTime || 0).toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Right: waypoint / params panel — always visible */}
        <div className="w-72 shrink-0 bg-card border-l border-border overflow-y-auto shrink-0 flex flex-col">
          {showSimCanvas ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xs text-muted-foreground/60 text-center">
                Playback mode — press Back to Edit to change paths and points.
              </p>
            </div>
          ) : isPathSelected && activePathRecord ? (
            <WaypointSidebar
              waypoints={editorWaypoints}
              selectedIndex={selectedWaypointIndex}
              onSelect={setSelectedWaypointIndex}
              onUpdate={onUpdatePathWaypoint}
              onDelete={onDeletePathWaypoint}
              startLinked={startLinked}
              constraints={activePathRecord.constraints?.maxVel ? activePathRecord.constraints : defaultConstraints}
              setConstraints={(updater) => {
                const prev = activePathRecord.constraints?.maxVel ? activePathRecord.constraints : defaultConstraints;
                const next = typeof updater === 'function' ? updater(prev) : updater;
                updatePathRecord(activePathRecord.id, { constraints: next });
              }}
              trajectory={activeTrajectory}
              subsystemTriggers={activePathRecord.subsystemTriggers ?? []}
              onUpdateTriggers={(trigs) => updatePathRecord(activePathRecord.id, { subsystemTriggers: trigs })}
              rotationTargets={activePathRecord.rotationTargets ?? []}
              onUpdateRotationTargets={(rots) => updatePathRecord(activePathRecord.id, { rotationTargets: rots })}
              onEditStart={beginGesture}
              onEditEnd={endGesture}
            />
          ) : isPointSelected ? (
            <PointSlotPanel
              slot={selectedSlot}
              point={activePoint}
              onUpdateSlot={(updates) => updateSlot(selectedSlotId, updates)}
              onUpdatePoint={updateActivePoint}
              subsystems={subsystems}
              motionUnits={motionUnits}
              onEditStart={beginGesture}
              onEditEnd={endGesture}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xs text-muted-foreground/60 text-center">No point selected</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
