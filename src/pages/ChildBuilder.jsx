import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Route, Zap, Clock, GitBranch, SkipForward, Play, Plus, GitFork } from 'lucide-react';
import { readEntity, updateEntity, createEntity } from '../lib/dataService';
import { saveVariantToProject } from '../lib/projectFolder';

const TYPE_META = {
  path:      { label: 'Path Slot',         icon: Route,      color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  subsystem: { label: 'Subsystem Command', icon: Zap,        color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  wait:      { label: 'Wait',              icon: Clock,      color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  parallel:  { label: 'Parallel Group',   icon: GitBranch,  color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
};

export default function ChildBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [child, setChild] = useState(null);
  const [skeleton, setSkeleton] = useState(null);
  const [name, setName] = useState('');
  const [overrides, setOverrides] = useState([]);
  const [paths, setPaths] = useState([]);
  const [subsystemConfig, setSubsystemConfig] = useState(null);
  const stateRef = useRef({});
  const savedNameRef = useRef(null);
  const nameTimer = useRef(null);

  useEffect(() => {
    Promise.all([
      readEntity('ChildAuto'),
      readEntity('SkeletonAuto'),
      readEntity('SavedAuto'),
      readEntity('SubsystemConfig'),
    ]).then(([childList, skeletonList, pathList, subsysConfig]) => {
      const children = Array.isArray(childList) ? childList : [];
      const skList = Array.isArray(skeletonList) ? skeletonList : [];
      const pathsData = Array.isArray(pathList) ? pathList : [];

      // Flexible matching for Child Variant
      let ch = children.find(c => String(c._id ?? c.id) === String(id));

      // CRITICAL DRAFT FALLBACK: If draft state, mock the child instance rather than returning early
      if (!ch && String(id).startsWith('gen-')) {
        const defaultSk = skList[0];
        ch = {
          id: id,
          name: defaultSk ? `${defaultSk.name} - Variant` : 'New Variant Auto',
          skeletonId: defaultSk ? (defaultSk._id ?? defaultSk.id) : '',
          commandOverrides: []
        };
      }

      if (!ch) return;

      setChild(ch);
      setName(ch.name ?? '');
      savedNameRef.current = ch.name ?? '';
      setPaths(pathsData);
      
      if (Array.isArray(subsysConfig) && subsysConfig[0]) {
        setSubsystemConfig(subsysConfig[0]);
      }

      // Flexible matching for the Template Skeleton
      const sk = skList.find(s => String(s._id ?? s.id) === String(ch.skeletonId));
      setSkeleton(sk ?? null);

      const skCmds = sk?.commands ?? [];
      const existingMap = Object.fromEntries((ch.commandOverrides ?? []).map(o => [o.cmdId, o]));
      
      const integratedOverrides = skCmds.map(c => existingMap[c.id] ?? { cmdId: c.id, skip: false });
      setOverrides(integratedOverrides);
      stateRef.current = { name: ch.name ?? '', overrides: integratedOverrides };
    });
  }, [id]);

  useEffect(() => { 
    stateRef.current = { name, overrides }; 
  }, [name, overrides]);

  const save = async () => {
    const { name: n, overrides: ov } = stateRef.current;
    const variantData = { name: n, skeletonId: child?.skeletonId, commandOverrides: ov };
    
    if (String(id).startsWith('gen-')) {
      await createEntity('ChildAuto', variantData);
    } else {
      await updateEntity('ChildAuto', id, variantData);
    }
    await saveVariantToProject(variantData, savedNameRef.current);
    savedNameRef.current = n;
  };

  const handleBack = async () => { 
    clearTimeout(nameTimer.current);
    stateRef.current = { name, overrides };
    try {
      await save(); 
    } catch(e){}
    navigate('/string-builder?tab=children'); 
  };

  const handleNameChange = (v) => {
    setName(v);
    stateRef.current.name = v;
    clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(save, 600);
  };

  const updateOverride = (cmdId, updates) => {
    setOverrides(prev => {
      const next = prev.map(o => o.cmdId === cmdId ? { ...o, ...updates } : o);
      stateRef.current.overrides = next;
      clearTimeout(nameTimer.current);
      nameTimer.current = setTimeout(save, 600);
      return next;
    });
  };

  const createNewVariant = async () => {
    await save();
    const newVariant = await createEntity('ChildAuto', {
      name: `${skeleton?.name ?? 'Auto'} - Variant`,
      skeletonId: child?.skeletonId,
      commandOverrides: (skeleton?.commands ?? []).map(c => ({ cmdId: c.id, skip: false })),
    });
    const newId = newVariant?._id ?? newVariant?.id ?? `gen-${Date.now()}`;
    navigate(`/child-builder/${newId}`);
  };

  if (!child || !skeleton) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
    </div>
  );

  const commands = skeleton.commands ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border z-10 shrink-0 flex-wrap gap-y-2">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs font-medium">Variant Autos</span>
        </button>
        <div className="w-px h-5 bg-border" />
        <input
          value={name}
          onChange={e => handleNameChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-semibold text-foreground focus:bg-secondary/50 px-1.5 py-0.5 rounded transition-colors"
          placeholder="Variant auto name..."
        />
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">Variant · Runnable</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">Template: <span className="text-foreground font-medium">{skeleton.name}</span></span>
        <button onClick={createNewVariant}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-xs font-semibold hover:bg-secondary/80 transition-all border border-border">
          <Plus className="w-3.5 h-3.5" /> New Variant
        </button>
        <button onClick={async () => { await save(); navigate(`/auto-simulator/${id}`); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/80 transition-all">
          <Play className="w-3.5 h-3.5" /> Preview
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto space-y-3">
          <p className="text-xs text-muted-foreground mb-4">
            Fill in each slot from the skeleton. Toggle skip to ignore a command for this auto.
          </p>

          {commands.length === 0 && (
            <div className="text-center py-12 text-muted-foreground/50 border-2 border-dashed border-border rounded-xl">
              <p className="text-sm">Skeleton has no commands</p>
              <p className="text-xs mt-1">Edit the skeleton to add commands first.</p>
            </div>
          )}

          {commands.map((cmd) => {
            const meta = TYPE_META[cmd.type] ?? TYPE_META.path;
            const Icon = meta.icon;
            const override = overrides.find(o => o.cmdId === cmd.id) ?? { cmdId: cmd.id, skip: false };
            const skipped = override.skip;

            return (
              <div key={cmd.id} className={`rounded-xl border ${meta.border} bg-card transition-all ${skipped ? 'opacity-40' : ''}`}>
                <div className={`flex items-center gap-3 p-3 ${meta.bg} rounded-t-xl`}>
                  <Icon className={`w-4 h-4 ${meta.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                    {cmd.label && <span className="text-xs text-muted-foreground ml-2">· {cmd.label}</span>}
                  </div>
                  <button
                    onClick={() => updateOverride(cmd.id, { skip: !skipped })}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      skipped ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <SkipForward className="w-3 h-3" />
                    {skipped ? 'Skipped' : 'Skip'}
                  </button>
                </div>

                {!skipped && (
                  <div className="p-3 space-y-2">
                    {cmd.type === 'path' && (() => {
                      // FIX: Matches via raw database IDs, internal systems, or safe string tags securely
                      const selectedPath = paths.find(p => {
                        const pId = String(p._id ?? p.id ?? '');
                        const pSafeName = (p.name ?? '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
                        const targetId = String(override.pathId ?? '');
                        return pId === targetId || pSafeName === targetId;
                      });
                      const triggers = selectedPath?.subsystemTriggers ?? [];
                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground font-medium">Path to run</label>
                            <select
                              value={override.pathId ?? ''}
                              onChange={e => updateOverride(cmd.id, { pathId: e.target.value })}
                              className="bg-secondary/50 border border-border rounded px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                            >
                              <option value="">— Select path —</option>
                              {paths.map(p => {
                                const pId = p._id ?? p.id ?? (p.name ?? '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
                                return <option key={pId} value={pId}>{p.name}</option>;
                              })}
                            </select>
                          </div>
                          {triggers.length > 0 && (
                            <div className="space-y-1">
                              {triggers.map((t, ti) => (
                                <div key={ti} className="flex items-center gap-1.5 text-[10px] text-violet-400 bg-violet-500/5 border border-violet-500/20 rounded px-2 py-1">
                                  <Zap className="w-2.5 h-2.5 shrink-0" />
                                  <span className="font-medium">{t.subsystemName}</span>
                                  {t.commandName && <span className="text-muted-foreground">→ {t.commandName}</span>}
                                  <span className="ml-auto text-muted-foreground">@ {Math.round((t.progress ?? 0) * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {cmd.type === 'wait' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground font-medium">Wait duration</label>
                        <input type="number" value={override.waitDuration ?? cmd.defaultWait ?? 0} step={0.1} min={0}
                          onChange={e => updateOverride(cmd.id, { waitDuration: parseFloat(e.target.value) })}
                          className="w-20 bg-secondary/50 border border-border rounded px-2 py-1 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
                        />
                        <span className="text-xs text-muted-foreground">s</span>
                      </div>
                    )}

                    {cmd.type === 'subsystem' && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{cmd.subsystemName}</span>
                        {cmd.commandName && <span className="ml-1">→ {cmd.commandName}</span>}
                      </div>
                    )}

                    {cmd.type === 'parallel' && (cmd.parallelSubs ?? []).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Running simultaneously:</p>
                        {(cmd.parallelSubs ?? []).map((sub, si) => (
                          <div key={si} className="flex items-center gap-1.5 text-[10px] bg-green-500/5 border border-green-500/20 rounded px-2 py-1">
                            <GitFork className="w-2.5 h-2.5 text-green-400 shrink-0" />
                            {sub.type === 'wait'
                              ? <span className="text-yellow-400">Wait {sub.defaultWait ?? 0}s</span>
                              : <><span className="text-violet-400 font-medium">{sub.subsystemName || '?'}</span>{sub.commandName && <span className="text-muted-foreground ml-1">→ {sub.commandName}</span>}</>
                            }
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}