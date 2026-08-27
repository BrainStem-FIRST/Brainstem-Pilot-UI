import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { readEntity, writeEntity } from '../lib/dataService';
import { saveSubsystemConfigToProject } from '../lib/projectFolder';

export default function SubsystemConfigPage() {
  const navigate = useNavigate();
  const [configId, setConfigId] = useState(null);
  const [subsystems, setSubsystems] = useState([]);
  const [robotSettings, setRobotSettings] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    Promise.all([
      readEntity('SubsystemConfig'),
      readEntity('RobotSettings'),
    ]).then(([configs, rsettings]) => {
      const configList = Array.isArray(configs) ? configs : [];
      const settingsList = Array.isArray(rsettings) ? rsettings : [];
      if (configList.length > 0) {
        setConfigId(configList[0].id);
        setSubsystems(configList[0].subsystems ?? []);
      }
      if (settingsList.length > 0) setRobotSettings(settingsList[0]);
    });
  }, []);

  const save = async (subs) => {
    const data = { subsystems: subs };
    if (configId) {
      await writeEntity('SubsystemConfig', data);
    } else {
      const results = await readEntity('SubsystemConfig');
      const configList = Array.isArray(results) ? results : [];
      if (configList.length > 0) setConfigId(configList[0].id);
    }
    saveSubsystemConfigToProject(data).catch(() => {});
  };

  const handleBack = async () => {
    clearTimeout(saveTimer.current);
    await save(subsystems);
    navigate('/');
  };

  const updateSubsystems = (next) => {
    setSubsystems(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 500);
  };

  const addSubsystem = () => {
    const next = [...subsystems, { id: `sys-${Date.now()}`, name: 'New Subsystem', visualBinding: '', commands: [] }];
    updateSubsystems(next);
    setExpandedIdx(next.length - 1);
  };

  const removeSubsystem = (i) => {
    const next = subsystems.filter((_, idx) => idx !== i);
    updateSubsystems(next);
    setExpandedIdx(null);
  };

  const updateSys = (i, updates) => {
    const next = subsystems.map((s, idx) => idx === i ? { ...s, ...updates } : s);
    updateSubsystems(next);
  };

  const addCommand = (sysIdx) => {
    const sys = subsystems[sysIdx];
    const cmds = [...(sys.commands ?? []), { id: `cmd-${Date.now()}`, name: 'New Command', visualBinding: '' }];
    updateSys(sysIdx, { commands: cmds });
  };

  const updateCommand = (sysIdx, cmdIdx, updates) => {
    const sys = subsystems[sysIdx];
    const cmds = sys.commands.map((c, i) => i === cmdIdx ? { ...c, ...updates } : c);
    updateSys(sysIdx, { commands: cmds });
  };

  const removeCommand = (sysIdx, cmdIdx) => {
    const sys = subsystems[sysIdx];
    const cmds = sys.commands.filter((_, i) => i !== cmdIdx);
    updateSys(sysIdx, { commands: cmds });
  };

  // Visual bindings: subsystem drawings from RobotSettings
  const visualOptions = ['none', ...(robotSettings?.subsystems?.map(s => s.name) ?? [])];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Home</span>
        </button>
        <div className="w-px h-5 bg-border" />
        <Zap className="w-4 h-4 text-yellow-400" />
        <h1 className="text-sm font-bold text-foreground flex-1">Configure Subsystems</h1>
        <span className="text-[10px] text-muted-foreground italic">Auto-saves on back</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-muted-foreground mb-6">
            Define your robot's subsystems, their commands, and optionally bind each command to a visual drawing from Robot Settings.
          </p>

          {subsystems.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-xl text-muted-foreground/50">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No subsystems yet</p>
              <p className="text-xs mt-1">Add your first subsystem below</p>
            </div>
          )}

          {subsystems.map((sys, i) => (
            <motion.div key={sys.id ?? i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Subsystem header */}
              <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={sys.name}
                    onChange={e => { e.stopPropagation(); updateSys(i, { name: e.target.value }); }}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent text-sm font-semibold text-foreground outline-none border-b border-transparent focus:border-border w-full"
                    placeholder="Subsystem name"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">{(sys.commands ?? []).length} commands</p>
                </div>
                <button onClick={e => { e.stopPropagation(); removeSubsystem(i); }} className="text-destructive/50 hover:text-destructive transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {expandedIdx === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>

              {expandedIdx === i && (
                <div className="px-4 pb-4 border-t border-border space-y-4">
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground font-medium">Visual Binding (drawing)</label>
                      <select
                        value={sys.visualBinding ?? 'none'}
                        onChange={e => updateSys(i, { visualBinding: e.target.value })}
                        className="bg-secondary/50 border border-border rounded px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {visualOptions.map(opt => <option key={opt} value={opt}>{opt === 'none' ? '— none —' : opt}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Commands */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commands</p>
                      <button onClick={() => addCommand(i)}
                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium hover:bg-primary/20 transition-all">
                        <Plus className="w-3 h-3" /> Add Command
                      </button>
                    </div>
                    {(sys.commands ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground/50 text-center py-3">No commands yet</p>
                    )}
                    <div className="space-y-2">
                      {(sys.commands ?? []).map((cmd, ci) => (
                        <div key={cmd.id ?? ci} className="flex flex-col gap-2 bg-secondary/30 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={cmd.name}
                              onChange={e => updateCommand(i, ci, { name: e.target.value })}
                              placeholder="Command name"
                              className="flex-1 bg-transparent text-xs text-foreground outline-none min-w-0"
                            />
                            <button onClick={() => removeCommand(i, ci)} className="text-destructive/50 hover:text-destructive transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {visualOptions.length > 1 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-muted-foreground shrink-0">Visual binding:</span>
                              <select
                                value={cmd.visualBinding ?? 'none'}
                                onChange={e => updateCommand(i, ci, { visualBinding: e.target.value })}
                                className="bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none focus:border-primary"
                              >
                                {visualOptions.map(opt => <option key={opt} value={opt}>{opt === 'none' ? '— none —' : opt}</option>)}
                              </select>
                              {cmd.visualBinding && cmd.visualBinding !== 'none' && (
                                <>
                                  <span className="text-[9px] text-muted-foreground shrink-0">Action:</span>
                                  <div className="flex rounded overflow-hidden border border-border text-[10px]">
                                    <button
                                      onClick={() => updateCommand(i, ci, { visualAction: 'show' })}
                                      className={`px-2 py-0.5 transition-all ${(cmd.visualAction ?? 'show') === 'show' ? 'bg-green-500/20 text-green-400' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}
                                    >Show</button>
                                    <button
                                      onClick={() => updateCommand(i, ci, { visualAction: 'hide' })}
                                      className={`px-2 py-0.5 transition-all ${cmd.visualAction === 'hide' ? 'bg-red-500/20 text-red-400' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}
                                    >Hide</button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          <button onClick={addSubsystem}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-all">
            <Plus className="w-4 h-4" /> Add Subsystem
          </button>
        </div>
      </div>
    </div>
  );
}