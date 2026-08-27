import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Route, MapPin, Trash2, Pencil, Check, X, Undo2, Redo2, Layers, Search,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { computeFieldLayout, drawFieldImage, fieldToPixels } from '../lib/fieldCoordinates';
import { generateTrajectory } from '../lib/trajectoryMath';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import {
  loadLibrary, persistLibraryDiff, applyRename, applyDelete, autosUsing, safeId,
} from '../lib/library';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { changedEndpoints, propagateChainLinks } from '../lib/chainLinks';
import { groupByFolder, folderNames, folderOf } from '../lib/folders';
import { useFolders } from '../hooks/useFolders';
import RecordEditor from '../components/library/RecordEditor';
import { NewFolderButton, FolderPicker, FolderSection } from '../components/library/FolderControls';

const EMPTY_LIBRARY = { paths: [], points: [], autos: [] };

function useFieldImage(imageUrl) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);
  return image;
}

/** Field-diagram thumbnail; `paint` receives a ctx plus a field→canvas projector. */
function FieldThumbnail({ paint, width = 300, height = 150 }) {
  const { activeField, imageUrl } = useFieldConfig();
  const canvasRef = useRef(null);
  const fieldImage = useFieldImage(imageUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    const pan = { x: 0, y: 0 };
    const layout = computeFieldLayout(width, height, pan, 1, activeField);
    if (fieldImage) drawFieldImage(ctx, fieldImage, layout);
    paint(ctx, (x, y) => fieldToPixels(x, y, width, height, pan, 1, activeField));
  }, [paint, fieldImage, activeField, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full block" />;
}

function PathThumbnail({ path, constraints }) {
  const paint = useCallback((ctx, toPixel) => {
    const waypoints = path.waypoints ?? [];
    if (waypoints.length < 2) {
      ctx.font = '11px Inter';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('No waypoints yet', 150, 75);
      return;
    }
    const traj = generateTrajectory(waypoints, path.constraints?.maxVel ? path.constraints : constraints, []);
    if (!traj?.states?.length) return;
    ctx.beginPath();
    const first = toPixel(traj.states[0].x, traj.states[0].y);
    ctx.moveTo(first.px, first.py);
    traj.states.slice(1).forEach(s => {
      const { px, py } = toPixel(s.x, s.y);
      ctx.lineTo(px, py);
    });
    ctx.strokeStyle = 'rgba(50,200,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(50,200,255,0.5)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    [waypoints[0], waypoints[waypoints.length - 1]].forEach((wp, i) => {
      const { px, py } = toPixel(wp.x, wp.y);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#22dd66' : '#ff4444';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [path, constraints]);

  return <FieldThumbnail paint={paint} />;
}

function PointThumbnail({ point }) {
  const paint = useCallback((ctx, toPixel) => {
    const { px, py } = toPixel(point.x ?? 0, point.y ?? 0);
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,211,238,0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const rad = (-(point.rotation ?? 0) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(rad) * 20, py + Math.sin(rad) * 20);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [point]);

  return <FieldThumbnail paint={paint} />;
}

function NameField({ name, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(name); }, [name, editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onCommit(trimmed);
    else setDraft(name);
  };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className="group/name flex items-center gap-1.5 min-w-0 text-left"
        title="Rename">
        <span className="text-sm font-semibold text-foreground truncate">{name}</span>
        <Pencil className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(name); setEditing(false); }
        }}
        onBlur={commit}
        className="flex-1 min-w-0 bg-secondary border border-primary/40 rounded px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-primary" />
      <button onMouseDown={e => e.preventDefault()} onClick={commit} className="text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
      <button onMouseDown={e => e.preventDefault()} onClick={() => { setDraft(name); setEditing(false); }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function UsageChips({ autos, onOpen }) {
  if (autos.length === 0) {
    return <p className="text-[10px] text-muted-foreground/60">Not used by any Auto yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {autos.map(auto => (
        <button key={auto.id} onClick={() => onOpen(auto)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all max-w-full">
          <Layers className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{auto.name}</span>
        </button>
      ))}
    </div>
  );
}

function RecordCard({ accent, thumbnail, name, onRename, meta, usage, onDelete, onEdit, folderPicker }) {
  return (
    <div className={`rounded-xl bg-card border ${accent} overflow-hidden flex flex-col group`}>
      <button onClick={onEdit} title="Edit on the field"
        className="relative aspect-[2/1] bg-[#0d1117] border-b border-border/60 overflow-hidden block w-full text-left">
        {thumbnail}
        <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-xs font-semibold text-foreground">
            <Pencil className="w-3 h-3" /> Edit on field
          </span>
        </span>
      </button>
      <div className="p-3 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <NameField name={name} onCommit={onRename} />
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{meta}</p>
          </div>
          {folderPicker}
          <button onClick={onDelete} title="Delete (also removes its JSON file)"
            className="p-1 rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="mt-auto pt-1 border-t border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">Used in</p>
          {usage}
        </div>
      </div>
    </div>
  );
}

export default function LibraryIndex() {
  const navigate = useNavigate();
  const { projectType } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);

  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('paths');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { kind, id }

  const libraryRef = useRef(EMPTY_LIBRARY);
  const persistedRef = useRef(EMPTY_LIBRARY);
  const saveTimer = useRef(null);

  useEffect(() => {
    loadLibrary().then(data => {
      libraryRef.current = data;
      persistedRef.current = structuredClone(data);
      setLibrary(data);
      setLoading(false);
    });
    return () => clearTimeout(saveTimer.current);
  }, []);

  const flush = useCallback(async () => {
    const next = libraryRef.current;
    const prev = persistedRef.current;
    persistedRef.current = structuredClone(next);
    await persistLibraryDiff(prev, next);
  }, []);

  const commit = useCallback((next, { immediate = false } = {}) => {
    libraryRef.current = next;
    setLibrary(next);
    clearTimeout(saveTimer.current);
    if (immediate) flush();
    else saveTimer.current = setTimeout(flush, 400);
  }, [flush]);

  const getSnapshot = useCallback(() => structuredClone(libraryRef.current), []);
  const applySnapshot = useCallback((snapshot) => commit(snapshot, { immediate: true }), [commit]);
  const {
    record, undo, redo, canUndo, canRedo, beginGesture, endGesture,
  } = useUndoRedo({ getSnapshot, applySnapshot });

  const mutate = useCallback((fn, options) => {
    record();
    commit(fn(libraryRef.current), options);
  }, [record, commit]);

  const renameRecord = (kind, rec, name) => {
    const siblings = kind === 'path' ? libraryRef.current.paths : libraryRef.current.points;
    if (siblings.some(r => r.id !== rec.id && safeId(r.name) === safeId(name))) {
      window.alert(`Another ${kind} is already named "${name}".`);
      return;
    }
    mutate(lib => applyRename(lib, kind, rec, name), { immediate: true });
  };

  const deleteRecord = (kind, rec) => {
    const used = autosUsing(libraryRef.current.autos, kind, rec);
    const warning = used.length > 0
      ? `\n\nIt is used by ${used.length} Auto${used.length === 1 ? '' : 's'} (${used.map(a => a.name).join(', ')}); those slots will be removed.`
      : '';
    if (!window.confirm(`Delete "${rec.name}" and its JSON file?${warning}`)) return;
    mutate(lib => applyDelete(lib, kind, rec), { immediate: true });
  };

  // Moving an end of a record drags whatever it is joined to in every Auto along with it, so
  // a sequence never quietly develops a gap because it was edited from the index instead.
  const updateRecord = useCallback((kind, id, updates) => {
    const listKey = kind === 'path' ? 'paths' : 'points';
    mutate(lib => {
      const before = lib[listKey].find(r => r.id === id);
      if (!before) return lib;
      const after = { ...before, ...updates };
      const edited = { ...lib, [listKey]: lib[listKey].map(r => (r.id === id ? after : r)) };
      const ends = changedEndpoints(kind, before, after);
      if (ends.length === 0) return edited;
      const linked = propagateChainLinks(edited, [{ kind, id, ends }]);
      return { ...edited, paths: linked.paths, points: linked.points };
    });
  }, [mutate]);

  // Folders are a label on the record, so renaming or deleting one is just a bulk retag of
  // whatever claimed it — the JSON files never move.
  const kindKey = tab === 'paths' ? 'paths' : 'points';
  const retagFolder = useCallback((from, to) => {
    const listKey = tab === 'paths' ? 'paths' : 'points';
    mutate(lib => ({
      ...lib,
      [listKey]: lib[listKey].map(r => (folderOf(r) === from ? { ...r, folder: to } : r)),
    }), { immediate: true });
  }, [tab, mutate]);

  const {
    folderRegistry, collapsed, toggleCollapsed, createFolder, renameFolder, deleteFolder,
  } = useFolders(kindKey, retagFolder);

  const moveToFolder = useCallback((kind, rec, folder) => {
    const listKey = kind === 'path' ? 'paths' : 'points';
    mutate(lib => ({
      ...lib,
      [listKey]: lib[listKey].map(r => (r.id === rec.id ? { ...r, folder } : r)),
    }), { immediate: true });
  }, [mutate]);

  const closeEditor = useCallback(() => {
    setEditing(null);
    clearTimeout(saveTimer.current);
    flush();
  }, [flush]);

  const editingRecord = useMemo(() => {
    if (!editing) return null;
    const list = editing.kind === 'path' ? library.paths : library.points;
    return list.find(r => r.id === editing.id) ?? null;
  }, [editing, library]);

  const openAuto = async (auto, kind, rec) => {
    clearTimeout(saveTimer.current);
    await flush();
    const param = kind === 'path' ? 'path' : 'point';
    navigate(`/auto-workspace/${auto.id}?${param}=${encodeURIComponent(rec.id ?? safeId(rec.name))}`);
  };

  const filter = useCallback((records) => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(r => (r.name ?? '').toLowerCase().includes(q));
  }, [query]);

  const paths = useMemo(() => filter(library.paths), [library.paths, filter]);
  const points = useMemo(() => filter(library.points), [library.points, filter]);
  const visible = tab === 'paths' ? paths : points;
  const kind = tab === 'paths' ? 'path' : 'point';
  // Folders come from the registry *and* from whatever records already claim one, so a
  // hand-edited JSON file with a folder name shows up without needing the registry rewritten.
  const allOfKind = tab === 'paths' ? library.paths : library.points;
  const availableFolders = useMemo(() => folderNames(folderRegistry, allOfKind), [folderRegistry, allOfKind]);
  // Group the *filtered* list, so searching narrows within folders instead of flattening them.
  const groups = useMemo(() => groupByFolder(visible, folderRegistry), [visible, folderRegistry]);

  const pathLength = (path) => {
    const wps = path.waypoints ?? [];
    if (wps.length < 2) return null;
    const traj = generateTrajectory(wps, path.constraints?.maxVel ? path.constraints : motionUnits.defaultConstraints, []);
    return traj?.totalLength ?? null;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-6">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold text-foreground">Path &amp; Point Index</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every saved path and point in the project. Renaming or moving one updates every Auto that uses it.
            </p>
          </div>
          <div className="flex items-center gap-0.5 bg-secondary/50 rounded-lg p-0.5">
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card transition-all disabled:opacity-30">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
            <button onClick={() => setTab('paths')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'paths' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
              <Route className="w-3.5 h-3.5 text-blue-400" /> Paths
              <span className="text-[10px] text-muted-foreground">{library.paths.length}</span>
            </button>
            <button onClick={() => setTab('points')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'points' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Points
              <span className="text-[10px] text-muted-foreground">{library.points.length}</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by name…"
              className="bg-secondary/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-primary w-56" />
          </div>
          <NewFolderButton onCreate={createFolder} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 && availableFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center">
              {tab === 'paths' ? <Route className="w-6 h-6 text-blue-400/60" /> : <MapPin className="w-6 h-6 text-cyan-400/60" />}
            </div>
            <p className="text-sm text-muted-foreground">
              {query ? `No ${tab} match "${query}".` : `No ${tab} saved yet — add one from an Auto to see it here.`}
            </p>
          </div>
        ) : (
          <div className="pb-8">
            {groups.map(group => (
              <FolderSection
                key={group.name || '\u0000unfiled'}
                group={group}
                count={group.records.length}
                collapsed={collapsed.has(group.name)}
                onToggle={() => toggleCollapsed(group.name)}
                onRename={name => renameFolder(group.name, name)}
                onDelete={() => deleteFolder(group.name)}
              >
                {group.records.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 py-2">
                    Empty — move a {kind} here with the folder dropdown on its card.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.records.map((rec, i) => {
                      const used = autosUsing(library.autos, kind, rec);
                      const picker = (
                        <FolderPicker
                          value={rec.folder}
                          folders={availableFolders}
                          onMove={folder => moveToFolder(kind, rec, folder)}
                          onCreateFolder={createFolder}
                        />
                      );
                      return (
                        <motion.div key={rec.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                          {kind === 'path' ? (
                            <RecordCard
                              accent="border-blue-500/25 hover:border-blue-500/50"
                              thumbnail={<PathThumbnail path={rec} constraints={motionUnits.defaultConstraints} />}
                              name={rec.name}
                              onRename={name => renameRecord('path', rec, name)}
                              meta={`${(rec.waypoints ?? []).length} waypoints${pathLength(rec) != null ? ` · ${pathLength(rec).toFixed(2)} ${motionUnits.lengthUnit}` : ''}`}
                              usage={<UsageChips autos={used} onOpen={auto => openAuto(auto, 'path', rec)} />}
                              onDelete={() => deleteRecord('path', rec)}
                              onEdit={() => setEditing({ kind: 'path', id: rec.id })}
                              folderPicker={picker}
                            />
                          ) : (
                            <RecordCard
                              accent="border-cyan-500/25 hover:border-cyan-500/50"
                              thumbnail={<PointThumbnail point={rec} />}
                              name={rec.name}
                              onRename={name => renameRecord('point', rec, name)}
                              meta={`x ${(rec.x ?? 0).toFixed(2)} · y ${(rec.y ?? 0).toFixed(2)} · ${Math.round(rec.rotation ?? 0)}°`}
                              usage={<UsageChips autos={used} onOpen={auto => openAuto(auto, 'point', rec)} />}
                              onDelete={() => deleteRecord('point', rec)}
                              onEdit={() => setEditing({ kind: 'point', id: rec.id })}
                              folderPicker={picker}
                            />
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </FolderSection>
            ))}
          </div>
        )}
      </div>

      {editingRecord && (
        <RecordEditor
          kind={editing.kind}
          record={editingRecord}
          onChange={updates => updateRecord(editing.kind, editing.id, updates)}
          onBeginEdit={beginGesture}
          onEndEdit={endGesture}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
