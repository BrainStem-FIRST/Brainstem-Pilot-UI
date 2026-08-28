import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { readEntity, createEntity, updateEntity, deleteEntity, safeNameFromString } from '../lib/dataService';
import { Plus, ChevronLeft, Trash2, Layers, Pencil, Check, X, MonitorPlay, Copy, Library } from 'lucide-react';
import { motion } from 'framer-motion';
import { buildAutoChain, generateTrajectory } from '../lib/trajectoryMath';
import { normalizeSavedPath } from '../lib/pathWaypoints';
import { computeFieldLayout, drawFieldImage, fieldToPixels } from '../lib/fieldCoordinates';
import { useFieldConfig } from '../context/FieldConfigContext';
import { useLeague } from '../context/LeagueContext';
import { getMotionUnitsForLeague } from '../lib/motionUnits';
import { ftcClassNameClash } from '../lib/ftcOpmodeGenerator';
import { groupByFolder, folderNames, folderOf } from '../lib/folders';
import { useFolders } from '../hooks/useFolders';
import { NewFolderButton, FolderPicker, FolderSection } from '../components/library/FolderControls';

function safeId(name) {
  return safeNameFromString(name);
}

/** Small field-diagram thumbnail with this Auto's chained path(s) overlaid, like the old path picker. */
function AutoPreview({ sequence, paths, points, constraints }) {
  const { activeField, imageUrl } = useFieldConfig();
  const canvasRef = useRef(null);
  const [fieldImage, setFieldImage] = useState(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setFieldImage(img);
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const zoom = 1;
    const pan = { x: 0, y: 0 };
    const layout = computeFieldLayout(W, H, pan, zoom, activeField);
    if (fieldImage) {
      drawFieldImage(ctx, fieldImage, layout);
    }

    const toPixel = (x, y) => fieldToPixels(x, y, W, H, pan, zoom, activeField);
    const resolved = buildAutoChain(sequence ?? [], { paths, points });

    resolved.forEach(slot => {
      if (!slot.chainedWaypoints || slot.chainedWaypoints.length < 2) return;
      const traj = generateTrajectory(slot.chainedWaypoints, constraints, []);
      if (!traj?.states?.length) return;
      ctx.beginPath();
      const first = toPixel(traj.states[0].x, traj.states[0].y);
      ctx.moveTo(first.px, first.py);
      for (let i = 1; i < traj.states.length; i++) {
        const { px, py } = toPixel(traj.states[i].x, traj.states[i].y);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = slot.type === 'point' ? 'rgba(34,211,238,0.9)' : 'rgba(50,200,255,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(50,200,255,0.5)';
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      [slot.chainedWaypoints[0], slot.chainedWaypoints[slot.chainedWaypoints.length - 1]].forEach((wp, i) => {
        const { px, py } = toPixel(wp.x, wp.y);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#22dd66' : '#ff4444';
        ctx.fill();
      });
    });
  }, [sequence, paths, points, fieldImage, activeField, constraints]);

  return <canvas ref={canvasRef} width={280} height={130} className="w-full h-full block" />;
}

function RenameInline({ name, onSave, onCancel }) {
  const [val, setVal] = React.useState(name);
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
        className="flex-1 min-w-0 bg-secondary border border-primary/40 rounded px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
      />
      <button onClick={() => onSave(val)} className="text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function StringBuilderList() {
  const navigate = useNavigate();
  const { projectType, isFtc } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);
  const [autos, setAutos] = useState([]);
  const [allPaths, setAllPaths] = useState([]);
  const [allPoints, setAllPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const autosRef = useRef([]);
  useEffect(() => { autosRef.current = autos; }, [autos]);

  useEffect(() => {
    Promise.all([
      readEntity('Auto'),
      readEntity('SavedAuto'),
      readEntity('Point'),
    ]).then(([data, paths, points]) => {
      const sorted = Array.isArray(data) ? data.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)) : [];
      setAutos(sorted);
      setAllPaths(Array.isArray(paths) ? paths.map(normalizeSavedPath) : []);
      setAllPoints(Array.isArray(points) ? points : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  /** `baseName`, or the first `baseName_N` that no existing Auto already slugs to. */
  const uniqueCopyName = (baseName) => {
    let uniqueName = baseName;
    let counter = 1;
    while (autos.some(item => safeId(item.name) === safeId(uniqueName))) {
      uniqueName = `${baseName}_${counter}`;
      counter++;
    }
    return uniqueName;
  };

  const createAuto = async () => {
    const name = uniqueCopyName('Auto');
    try {
      const created = await createEntity('Auto', { name, sequence: [] });
      const recordId = created?.id ?? safeId(name);
      navigate(`/auto-workspace/${recordId}`);
    } catch (err) {
      navigate(`/auto-workspace/gen-${Date.now()}`);
    }
  };

  const deleteAuto = async (e, auto) => {
    e.stopPropagation();
    const id = auto._id ?? auto.id;
    if (!window.confirm(`Delete "${auto.name}" and its JSON file?`)) return;
    await deleteEntity('Auto', id);
    setAutos(prev => prev.filter(a => (a._id ?? a.id) !== id));
  };

  // An Auto's filename is its safe-name slug, so two Autos that slug the same would write
  // over each other's .auto.json (and, in FTC, each other's generated OpMode). Reject the
  // rename rather than silently destroying the other one.
  const renameAuto = async (id, name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) { setRenamingId(null); return; }
    const clash = autos.find(a => (a._id ?? a.id) !== id && safeId(a.name) === safeId(trimmed));
    if (clash) {
      window.alert(`Another Auto is already named "${clash.name}".`);
      return;
    }
    // FTC additionally needs the generated OpMode class to be unique — punctuation is
    // stripped from class names, so distinct filenames can still collide there.
    const classClash = isFtc ? ftcClassNameClash(trimmed, autos, id) : null;
    if (classClash) {
      window.alert(`"${trimmed}" would generate the same OpMode class as "${classClash.name}". Pick a name that differs by more than punctuation.`);
      return;
    }
    await updateEntity('Auto', id, { name: trimmed });
    const newId = safeId(trimmed);
    setAutos(prev => prev.map(a => (a._id ?? a.id) === id ? { ...a, name: trimmed, id: newId } : a));
    setRenamingId(null);
  };

  const duplicateAuto = async (e, auto) => {
    e.stopPropagation();
    const name = uniqueCopyName(`${auto.name}_Copy`);
    const created = await createEntity('Auto', {
      name,
      sequence: JSON.parse(JSON.stringify(auto.sequence || [])),
    });
    setAutos(prev => [created, ...prev]);
  };

  // Folders label the Auto record; the .auto.json files stay flat in autos/.
  const persistFolder = useCallback(async (auto, folder) => {
    const aId = auto._id ?? auto.id;
    setAutos(prev => prev.map(a => ((a._id ?? a.id) === aId ? { ...a, folder } : a)));
    await updateEntity('Auto', aId, { folder });
  }, []);

  const retagFolder = useCallback(async (from, to) => {
    const affected = autosRef.current.filter(a => folderOf(a) === from);
    setAutos(prev => prev.map(a => (folderOf(a) === from ? { ...a, folder: to } : a)));
    for (const a of affected) await updateEntity('Auto', a._id ?? a.id, { folder: to });
  }, []);

  const {
    folderRegistry, collapsed, toggleCollapsed, createFolder, renameFolder, deleteFolder,
  } = useFolders('autos', retagFolder);

  const availableFolders = useMemo(() => folderNames(folderRegistry, autos), [folderRegistry, autos]);
  const groups = useMemo(() => groupByFolder(autos, folderRegistry), [autos, folderRegistry]);

  return (
    <div className="min-h-screen bg-background flex flex-col p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid2)" />
        </svg>
      </div>

      <div className="relative max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8 pl-10">
          <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Home</span>
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Build an Auto</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Create and edit your autonomous routines — paths, points, and subsystem commands in one workspace.</p>
          </div>
          <button onClick={() => navigate('/library')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Library className="w-4 h-4" /> Path &amp; Point Index
          </button>
          <NewFolderButton onCreate={createFolder} />
          <button onClick={createAuto} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-accent transition-colors">
            <Plus className="w-4 h-4" /> New Auto
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : autos.length === 0 && availableFolders.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center">
              <Layers className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No autos yet. Create one to get started.</p>
            <button onClick={createAuto} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-accent transition-colors">
              <Plus className="w-4 h-4" /> Create Auto
            </button>
          </motion.div>
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
                    Empty — move an Auto here with the folder dropdown on its card.
                  </p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.records.map((auto, i) => {
              const aId = auto._id ?? auto.id;
              if (!aId) return null;
              return (
                <motion.div key={aId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => renamingId !== aId && navigate(`/auto-workspace/${aId}`)}
                  className="group cursor-pointer surface-interactive overflow-hidden">
                  <div className="relative w-full aspect-[280/130] bg-[hsl(var(--field-bg))] border-b border-border overflow-hidden">
                    <AutoPreview sequence={auto.sequence} paths={allPaths} points={allPoints} constraints={motionUnits.defaultConstraints} />
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {renamingId === aId ? (
                          <RenameInline name={auto.name} onSave={name => renameAuto(aId, name)} onCancel={() => setRenamingId(null)} />
                        ) : (
                          <p className="text-sm font-semibold text-foreground truncate">{auto.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{(auto.sequence?.length ?? 0)} slots</p>
                      </div>
                    </div>
                  </div>
                  {renamingId !== aId && (
                    <div className="px-4 pb-3 flex items-center gap-1">
                      <div onClick={e => e.stopPropagation()} className="min-w-0 mr-auto">
                        <FolderPicker
                          value={auto.folder}
                          folders={availableFolders}
                          onMove={folder => persistFolder(auto, folder)}
                          onCreateFolder={createFolder}
                        />
                      </div>
                      <button onClick={e => duplicateAuto(e, auto)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all opacity-0 group-hover:opacity-100" title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); navigate(`/auto-simulator/${aId}`); }} className="p-1.5 rounded-md text-green-400/70 hover:text-green-400 hover:bg-green-500/10 transition-all opacity-0 group-hover:opacity-100" title="Simulate">
                        <MonitorPlay className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setRenamingId(aId); }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all opacity-0 group-hover:opacity-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => deleteAuto(e, auto)} className="p-1.5 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
    </div>
  );
}
