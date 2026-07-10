import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronLeft, Trash2, Route, Settings2, Pencil, Check, X, Copy } from 'lucide-react'; // Added Copy icon
import { readEntity, createEntity, updateEntity, deleteEntity, safeNameFromString } from '../lib/dataService';
import { mirrorPathData, flipStartSide } from '../lib/trajectoryMath';
import { useLeague } from '../context/LeagueContext';
import { motion } from 'framer-motion';
import { metersToPixels, computeFieldLayout, drawFieldImage } from '../lib/fieldCoordinates';
import { useFieldConfig } from '../context/FieldConfigContext';

function generateSplinePoints(waypoints, samplesPerSegment = 40) {
  const pts = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[i];
    const p3 = waypoints[i + 1];
    const p1 = p0.nextControl ?? { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
    const p2 = p3.prevControl ?? { x: p0.x + 2 * (p3.x - p0.x) / 3, y: p0.y + 2 * (p3.y - p0.y) / 3 };
    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const u = 1 - t;
      pts.push({
        x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
        y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
      });
    }
  }
  return pts;
}

function safeId(name) {
  return safeNameFromString(name);
}

function ChoiceModal({ open, title, description, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        {children}
      </div>
    </div>
  );
}

function PathPreview({ waypoints }) {
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

    const toPixel = (x, y) => metersToPixels(x, y, W, H, pan, zoom, activeField);

    if (!waypoints || waypoints.length < 2) return;

    const pts = generateSplinePoints(waypoints, 40);
    if (pts.length > 1) {
      ctx.beginPath();
      const { px: x0, py: y0 } = toPixel(pts[0].x, pts[0].y);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < pts.length; i++) {
        const { px, py } = toPixel(pts[i].x, pts[i].y);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(50,200,255,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(50,200,255,0.5)';
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    waypoints.forEach((wp, i) => {
      const { px, py } = toPixel(wp.x, wp.y);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#22dd66' : i === waypoints.length - 1 ? '#ff4444' : '#32c8ff';
      ctx.fill();
    });
  }, [waypoints, fieldImage, activeField]);

  return <canvas ref={canvasRef} width={240} height={120} className="w-full h-full border border-white/30 rounded" />;
}

function RenameInline({ name, onSave, onCancel }) {
  const [val, setVal] = useState(name);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
        className="flex-1 min-w-0 bg-secondary border border-primary/40 rounded px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
      />
      <button onClick={() => onSave(val)} className="text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function AutoList() {
  const navigate = useNavigate();
  const { isFrc } = useLeague();
  const [autos, setAutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState(null);

  useEffect(() => {
    readEntity('SavedAuto').then(data => {
      const sorted = Array.isArray(data) ? data.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)) : [];
      setAutos(sorted);
      setLoading(false);
    });
  }, []);

  const createNew = async (side) => {
    setShowCreateModal(false);
    const name = `Path ${autos.length + 1}`;
    const payload = {
      name,
      waypoints: [],
      constraints: {},
    };
    if (isFrc) {
      payload.startSide = side;
    }
    const created = await createEntity('SavedAuto', payload);
    navigate(`/auto-builder/${safeId(created.name)}`);
  };

  const uniqueCopyName = (baseName) => {
    let uniqueName = baseName;
    let counter = 1;
    while (autos.some(a => safeId(a.name) === safeId(uniqueName))) {
      uniqueName = `${baseName}_${counter}`;
      counter++;
    }
    return uniqueName;
  };

  const duplicateAuto = async (targetAuto, mirror) => {
    setDuplicateTarget(null);
    const uniqueName = uniqueCopyName(`${targetAuto.name}_Copy`);
    let payload = {
      name: uniqueName,
      waypoints: JSON.parse(JSON.stringify(targetAuto.waypoints || [])),
      constraints: JSON.parse(JSON.stringify(targetAuto.constraints || {})),
      rotationTargets: JSON.parse(JSON.stringify(targetAuto.rotationTargets || [])),
      subsystemTriggers: JSON.parse(JSON.stringify(targetAuto.subsystemTriggers || [])),
    };
    if (isFrc) {
      const sourceSide = targetAuto.startSide === 'L' ? 'L' : 'R';
      payload.startSide = mirror ? flipStartSide(sourceSide) : sourceSide;
    }
    if (mirror) {
      const mirrored = mirrorPathData(payload);
      payload = { ...payload, ...mirrored };
    }
    const duplicatedObj = await createEntity('SavedAuto', payload);
    setAutos(prev => [duplicatedObj, ...prev]);
  };

  const deleteAuto = async (e, id) => {
    e.stopPropagation();
    await deleteEntity('SavedAuto', id);
    setAutos(prev => prev.filter(a => a.id !== id));
  };

  const renameAuto = async (id, name) => {
    await updateEntity('SavedAuto', id, { name });
    setAutos(prev => prev.map(a => a.id === id ? { ...a, name, id: safeId(name) } : a));
    setRenamingId(null);
  };

  const promptDuplicate = (e, targetAuto) => {
    e.stopPropagation();
    if (isFrc) {
      setDuplicateTarget(targetAuto);
      return;
    }
    duplicateAuto(targetAuto, false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative flex items-center gap-4 mb-8 max-w-5xl mx-auto w-full">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Home</span>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">My Autonomous Paths</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Select a path to edit, or create a new one.</p>
        </div>
        <button onClick={() => navigate('/settings')} className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg text-sm transition-all">
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-medium">Settings</span>
        </button>
        <button onClick={() => isFrc ? setShowCreateModal(true) : createNew()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/80 transition-all">
          <Plus className="w-4 h-4" />
          New Path
        </button>
      </div>

      <div className="relative max-w-5xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : autos.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Route className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-muted-foreground text-sm">No paths yet. Create your first one!</p>
            <button onClick={() => isFrc ? setShowCreateModal(true) : createNew()} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/80 transition-all">
              <Plus className="w-4 h-4" /> Create Path
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {autos.map((auto, i) => (
              <motion.div
                key={auto.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => renamingId !== auto.id && navigate(`/auto-builder/${safeId(auto.name)}`)}
                className="group cursor-pointer rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all overflow-hidden"
              >
                <div className="aspect-[2/1] bg-[#0d1117] overflow-hidden">
                  <PathPreview waypoints={auto.waypoints || []} />
                </div>
                <div className="px-3 py-2.5 flex items-center gap-2">
                  {renamingId === auto.id ? (
                    <RenameInline
                      name={auto.name}
                      onSave={name => renameAuto(auto.id, name)}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{auto.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{(auto.waypoints?.length ?? 0)} waypoints</p>
                    </div>
                  )}
                  {renamingId !== auto.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={e => promptDuplicate(e, auto)}
                        title="Duplicate Path"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingId(auto.id); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => deleteAuto(e, auto.id)}
                        className="p-1.5 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {isFrc && (
        <ChoiceModal
          open={showCreateModal}
          title="New Path — Starting Side"
          description="Which side of the field does this path start on? You can change this later in the path editor."
          onClose={() => setShowCreateModal(false)}
        >
          <div className="flex gap-3">
            <button onClick={() => createNew('L')} className="flex-1 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-bold text-lg border border-border transition-all">
              Left (L)
            </button>
            <button onClick={() => createNew('R')} className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-lg hover:bg-primary/80 transition-all">
              Right (R)
            </button>
          </div>
        </ChoiceModal>
      )}

      {isFrc && (
        <ChoiceModal
          open={!!duplicateTarget}
          title="Duplicate Path"
          description={`How should "${duplicateTarget?.name}" be duplicated?`}
          onClose={() => setDuplicateTarget(null)}
        >
          <div className="flex flex-col gap-2">
            <button
              onClick={() => duplicateAuto(duplicateTarget, false)}
              className="w-full py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm font-semibold border border-border transition-all"
            >
              Same Side
            </button>
            <button
              onClick={() => duplicateAuto(duplicateTarget, true)}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-all"
            >
              Opposite Side (mirrored)
            </button>
          </div>
        </ChoiceModal>
      )}
    </div>
  );
}
