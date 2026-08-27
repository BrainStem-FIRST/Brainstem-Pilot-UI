import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Settings2, Cpu, SlidersHorizontal } from 'lucide-react';
import RobotPreview from '../components/settings/RobotPreview';
import AppSettingsTab from '../components/settings/AppSettingsTab';
import { motion } from 'framer-motion';
import { readEntity, writeEntity } from '../lib/dataService';
import { saveSettingsToProject } from '../lib/projectFolder';
import { useLeague } from '../context/LeagueContext';

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

const M_TO_IN = 39.3701;
const IN_TO_M = 1 / M_TO_IN;
const MS_TO_FTS = 3.28084;
const FTS_TO_MS = 1 / MS_TO_FTS;

function toDisplay(val, unit, storageUnit = 'm') {
  if (storageUnit === 'in') {
    if (unit === 'in' || unit === 'in/s' || unit === 'in/s²') {
      return parseFloat(Number(val ?? 0).toFixed(unit === 'in' ? 3 : 2));
    }
  }
  if (storageUnit === unit) return parseFloat(Number(val ?? 0).toFixed(unit === 'in' ? 3 : 4));
  if (unit === 'in') return parseFloat((val * M_TO_IN).toFixed(3));
  if (unit === 'ft/s') return parseFloat((val * MS_TO_FTS).toFixed(3));
  return parseFloat(Number(val ?? 0).toFixed(4));
}

function fromDisplay(val, unit, storageUnit = 'm') {
  if (storageUnit === 'in') {
    if (unit === 'in' || unit === 'in/s' || unit === 'in/s²') return val;
  }
  if (storageUnit === unit) return val;
  if (unit === 'in') return val * IN_TO_M;
  if (unit === 'ft/s') return val * FTS_TO_MS;
  return val;
}

export default function Settings() {
  const navigate = useNavigate();
  const { isFtc } = useLeague();
  const [tab, setTab] = useState('robot');
  const [settings, setSettings] = useState(null);
  const [dimUnit, setDimUnit] = useState(isFtc ? 'in' : 'm');
  const [velUnit, setVelUnit] = useState(isFtc ? 'in/s' : 'm/s');
  const saveTimer = useRef(null);

  useEffect(() => {
    readEntity('RobotSettings').then(data => {
      if (data && Array.isArray(data) && data.length > 0) {
        setSettings(data[0]);
      } else if (data && !Array.isArray(data)) {
        setSettings(data);
      } else {
        setSettings(isFtc
          ? { width: 18, length: 18, maxVel: 60, maxAccel: 40, unit: 'in', subsystems: [] }
          : { width: 0.76, length: 0.76, maxVel: 3.0, maxAccel: 2.5, unit: 'm', subsystems: [] });
      }
      if (data?.unit === 'in' || (Array.isArray(data) && data[0]?.unit === 'in')) {
        setDimUnit('in');
        setVelUnit('in/s');
      }
    });
  }, []);

  const save = async (s) => {
    const data = s || settings;
    if (!data) return;
    await writeEntity('RobotSettings', data);
    saveSettingsToProject(data).catch(() => {});
  };

  const handleBack = async () => {
    clearTimeout(saveTimer.current);
    if (tab === 'robot') await save();
    navigate('/');
  };

  const update = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 500);
      return next;
    });
  };

  const addSubsystem = () => {
    setSettings(prev => {
      const next = {
        ...prev,
        subsystems: [...(prev.subsystems || []), { name: 'Intake', offsetX: 0, offsetY: 0, width: 0.3, length: 0.2 }]
      };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 500);
      return next;
    });
  };

  const updateSubsystem = (i, key, value) => {
    setSettings(prev => {
      const subs = [...prev.subsystems];
      subs[i] = { ...subs[i], [key]: value };
      const next = { ...prev, subsystems: subs };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 500);
      return next;
    });
  };

  const removeSubsystem = (i) => {
    setSettings(prev => {
      const next = { ...prev, subsystems: prev.subsystems.filter((_, idx) => idx !== i) };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 500);
      return next;
    });
  };

  const switchDimUnit = (newUnit) => {
    if (newUnit === dimUnit) return;
    setDimUnit(newUnit);
  };

  const switchVelUnit = (newUnit) => {
    if (newUnit === velUnit) return;
    setVelUnit(newUnit);
  };

  if (!settings && tab === 'robot') return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-6 pl-10">
          <button onClick={handleBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Home</span>
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Settings2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
          </div>
          {tab === 'robot' && !isFtc && (
            <div className="flex items-center gap-2">
              <UnitToggle options={['m', 'in']} value={dimUnit} onChange={switchDimUnit} />
              <UnitToggle options={['m/s', 'ft/s']} value={velUnit} onChange={switchVelUnit} />
            </div>
          )}
        </div>

        <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 mb-6 w-fit">
          <button
            type="button"
            onClick={() => setTab('robot')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'robot' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Cpu className="w-4 h-4" /> Robot Settings
          </button>
          <button
            type="button"
            onClick={() => setTab('app')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'app' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" /> App Settings
          </button>
        </div>

        {tab === 'app' ? (
          <AppSettingsTab />
        ) : settings && (
        <div className="space-y-6">
          {(() => {
            const dimUnitLabel = dimUnit;
            const velUnitLabel = velUnit;
            const accelUnitLabel = velUnit === 'in/s' ? 'in/s²' : velUnit === 'ft/s' ? 'ft/s²' : 'm/s²';
            const storageUnit = settings.unit ?? (isFtc ? 'in' : 'm');
            const dimMax = dimUnit === 'in' ? 48 : 1.2;
            const dimMin = dimUnit === 'in' ? 4 : 0.1;
            return (
              <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Robot Frame Dimensions</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Width" unit={dimUnitLabel}
                value={toDisplay(settings.width, dimUnit, storageUnit)}
                onChange={v => update('width', clamp(fromDisplay(v, dimUnit, storageUnit), dimMin, dimMax))}
                step={dimUnit === 'in' ? 0.1 : 0.01} min={dimMin} max={dimMax}
              />
              <Field
                label="Length" unit={dimUnitLabel}
                value={toDisplay(settings.length, dimUnit, storageUnit)}
                onChange={v => update('length', clamp(fromDisplay(v, dimUnit, storageUnit), dimMin, dimMax))}
                step={dimUnit === 'in' ? 0.1 : 0.01} min={dimMin} max={dimMax}
              />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex gap-4 items-stretch">
            <RobotPreview settings={settings} />
            <div className="flex-1 bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1">Motion Constraints</h2>
              <p className="text-xs text-muted-foreground mb-4">Defaults for path builder.</p>
              <div className="grid grid-cols-1 gap-4">
                <Field
                  label="Max Velocity" unit={velUnitLabel}
                  value={toDisplay(settings.maxVel, velUnit, storageUnit)}
                  onChange={v => update('maxVel', clamp(fromDisplay(v, velUnit, storageUnit), fromDisplay(0.1, velUnit, storageUnit), storageUnit === 'in' ? 150 : 20))}
                  step={0.1} min={0.1}
                />
                <Field
                  label="Max Acceleration" unit={accelUnitLabel}
                  value={toDisplay(settings.maxAccel, velUnit, storageUnit)}
                  onChange={v => update('maxAccel', clamp(fromDisplay(v, velUnit, storageUnit), fromDisplay(0.1, velUnit, storageUnit), storageUnit === 'in' ? 150 : 20))}
                  step={0.1} min={0.1}
                />
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Subsystems / Attachments</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Components that stick out of the robot frame</p>
              </div>
              <button onClick={addSubsystem} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-primary/20 transition-all">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {(settings.subsystems || []).length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-4">No subsystems added yet.</p>
            ) : (
              <div className="space-y-4">
                {settings.subsystems.map((sub, i) => (
                  <div key={i} className="bg-secondary/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        value={sub.name}
                        onChange={e => updateSubsystem(i, 'name', e.target.value)}
                        className="flex-1 bg-transparent border-b border-border text-sm font-semibold text-foreground outline-none focus:border-primary transition-colors"
                        placeholder="Subsystem name"
                      />
                      <button onClick={() => removeSubsystem(i)} className="text-destructive/60 hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Width" unit={dimUnitLabel} value={toDisplay(sub.width, dimUnit, storageUnit)} onChange={v => updateSubsystem(i, 'width', clamp(fromDisplay(v, dimUnit, storageUnit), 0.01, dimMax))} step={dimUnit === 'in' ? 0.1 : 0.01} />
                      <Field label="Length" unit={dimUnitLabel} value={toDisplay(sub.length, dimUnit, storageUnit)} onChange={v => updateSubsystem(i, 'length', clamp(fromDisplay(v, dimUnit, storageUnit), 0.01, dimMax))} step={dimUnit === 'in' ? 0.1 : 0.01} />
                      <Field label="Offset X" unit={dimUnitLabel} value={toDisplay(sub.offsetX, dimUnit, storageUnit)} onChange={v => updateSubsystem(i, 'offsetX', fromDisplay(v, dimUnit, storageUnit))} step={dimUnit === 'in' ? 0.1 : 0.01} />
                      <Field label="Offset Y" unit={dimUnitLabel} value={toDisplay(sub.offsetY, dimUnit, storageUnit)} onChange={v => updateSubsystem(i, 'offsetY', fromDisplay(v, dimUnit, storageUnit))} step={dimUnit === 'in' ? 0.1 : 0.01} />
                    </div>
                    <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sub.visibleOnStart ?? false}
                        onChange={e => updateSubsystem(i, 'visibleOnStart', e.target.checked)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className="text-xs text-muted-foreground">Visible at auto start</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
              </>
            );
          })()}
        </div>
        )}
      </div>
    </div>
  );
}

function UnitToggle({ options, value, onChange }) {
  return (
    <div className="flex items-center bg-secondary/50 rounded-lg p-0.5 text-xs">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 py-1 rounded-md font-medium transition-all ${
            value === opt ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Field({ label, value, unit, onChange, step, min, max }) {
  const [localVal, setLocalVal] = React.useState(String(value));
  const focusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusedRef.current) {
      setLocalVal(String(value));
    }
  }, [value]);

  const handleChange = (e) => {
    setLocalVal(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) onChange(parsed);
  };

  const handleFocus = (e) => {
    focusedRef.current = true;
    e.target.select();
  };

  const handleBlur = () => {
    focusedRef.current = false;
    setLocalVal(String(value));
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={localVal}
          step={step}
          min={min}
          max={max}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="flex-1 bg-secondary/50 border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary transition-colors"
        />
        <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
      </div>
    </div>
  );
}