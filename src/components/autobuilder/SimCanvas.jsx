import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getPoseAtProgress } from '../../lib/trajectoryMath';
import { fieldToPixels, computeFieldLayout, drawFieldImage, getDefaultSimulatorView } from '../../lib/fieldCoordinates';
import { useLeague } from '../../context/LeagueContext';

function drawStar(ctx, cx, cy, r, color) {
  const spikes = 5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export default function SimCanvas({ segments, robotSettings, simTime, visibleVisuals, robotSubsystems, bounds, imageUrl, activeField, alliance, showResetButton = true }) {
  const { isFtc } = useLeague();
  const canvasRef = useRef(null);
  const [fieldImage, setFieldImage] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const viewIsDefaultRef = useRef(false);
  const prevAllianceRef = useRef(alliance);

  const getCanvasSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0 };
    return { w: c.width, h: c.height };
  }, []);

  const applyDefaultView = useCallback(() => {
    const { w, h } = getCanvasSize();
    if (!w || !h) return;
    const view = getDefaultSimulatorView(w, h, activeField, alliance);
    setZoom(view.zoom);
    panRef.current = view.pan;
    setPan(view.pan);
    viewIsDefaultRef.current = true;
  }, [activeField, alliance, getCanvasSize]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setFieldImage(img);
  }, [imageUrl]);

  const lastPoseRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const layout = computeFieldLayout(W, H, pan, zoom, activeField);
    const toPx = (x, y) => fieldToPixels(x, y, W, H, pan, zoom, activeField);

    if (fieldImage) {
      drawFieldImage(ctx, fieldImage, layout);
    } else {
      const { px: x0, py: y0 } = toPx(bounds.xMin, bounds.yMin);
      const { px: x1, py: y1 } = toPx(bounds.xMax, bounds.yMax);
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    const starColors = ['#a855f7', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];
    let elapsed = 0;
    segments.forEach((seg) => {
      if (!seg.trajectory) { elapsed += seg.duration ?? 0; return; }
      const isActive = simTime >= elapsed && simTime < elapsed + (seg.duration ?? 0);
      const pts = seg.trajectory.states;
      if (!pts || pts.length === 0) return;

      ctx.beginPath();
      const { px, py } = toPx(pts[0].x, pts[0].y);
      ctx.moveTo(px, py);
      for (let i = 1; i < pts.length; i++) {
        const { px: nx, py: ny } = toPx(pts[i].x, pts[i].y);
        ctx.lineTo(nx, ny);
      }
      ctx.strokeStyle = isActive ? 'rgba(86,180,100,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = isActive ? 4 : 2.5;
      ctx.shadowColor = isActive ? 'rgba(86,180,100,0.8)' : 'rgba(255,255,255,0.2)';
      ctx.shadowBlur = isActive ? 16 : 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const dotColor = isActive ? '#56b464' : '#ffffff';
      const { px: startPx, py: startPy } = toPx(pts[0].x, pts[0].y);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(startPx, startPy, 3, 0, Math.PI * 2);
      ctx.fill();

      const lastPt = pts[pts.length - 1];
      const { px: endPx, py: endPy } = toPx(lastPt.x, lastPt.y);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(endPx, endPy, 3, 0, Math.PI * 2);
      ctx.fill();

      elapsed += seg.duration ?? 0;

      (seg.subsystemTriggers ?? []).forEach((trig, ti) => {
        const pose = getPoseAtProgress(seg.trajectory, trig.progress ?? 0);
        if (!pose) return;
        const { px: sx, py: sy } = toPx(pose.x, pose.y);
        drawStar(ctx, sx, sy, 8, starColors[ti % starColors.length]);
      });
    });

    const firstPathSeg = segments.find(s => s.trajectory);
    if (simTime === 0) {
      lastPoseRef.current = firstPathSeg ? getPoseAtProgress(firstPathSeg.trajectory, 0) : null;
    } else if (lastPoseRef.current === null && firstPathSeg) {
      lastPoseRef.current = getPoseAtProgress(firstPathSeg.trajectory, 0);
    }

    elapsed = 0;
    let currentPose = null;
    for (const seg of segments) {
      const dur = seg.duration ?? 0;
      if (simTime <= elapsed + dur) {
        if (seg.trajectory) {
          const progress = dur > 0 ? (simTime - elapsed) / dur : 0;
          currentPose = getPoseAtProgress(seg.trajectory, Math.min(1, Math.max(0, progress)));
        }
        break;
      }
      if (seg.trajectory) {
        lastPoseRef.current = getPoseAtProgress(seg.trajectory, 1);
      }
      elapsed += dur;
    }

    const pose = currentPose ?? lastPoseRef.current;

    if (pose) {
      const defaultRobotSize = activeField?.league === 'ftc' ? 18 : 0.76;
      const ROBOT_W_M = robotSettings?.width ?? defaultRobotSize;
      const ROBOT_H_M = robotSettings?.length ?? defaultRobotSize;
      const { px, py } = toPx(pose.x, pose.y);
      const { px: rx1 } = toPx(pose.x + ROBOT_W_M, pose.y);
      const { py: ry1 } = toPx(pose.x, pose.y - ROBOT_H_M);
      const rw = rx1 - px;
      const rh = ry1 - py;
      const scale = rw / ROBOT_W_M;
      const rad = (-(pose.rotation ?? pose.heading ?? 0) * Math.PI) / 180;

      const activeVisuals = Object.entries(visibleVisuals ?? {}).filter(([, v]) => v).map(([k]) => k);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rad + Math.PI / 2);

      (robotSubsystems ?? []).forEach(sub => {
        if (!activeVisuals.includes(sub.name)) return;
        const sw = (sub.width ?? 0.2) * scale;
        const sh = (sub.length ?? 0.2) * scale;
        const sx = (sub.offsetX ?? 0) * scale - sw / 2;
        const sy = -(sub.offsetY ?? 0) * scale - sh / 2;
        ctx.fillStyle = 'rgba(168,85,247,0.55)';
        ctx.strokeStyle = 'rgba(220,160,255,1)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.shadowBlur = 0;
      });

      ctx.fillStyle = 'rgba(255,180,30,0.92)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, -rh / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
  }, [segments, simTime, visibleVisuals, robotSubsystems, robotSettings, bounds, fieldImage, activeField, pan, zoom]);

  useEffect(() => { draw(); });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      setCanvasSize({ w: canvas.offsetWidth, h: canvas.offsetHeight });
      draw();
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);
    updateSize();
    return () => ro.disconnect();
  }, [activeField, draw]);

  const didInitialViewRef = useRef(false);

  useEffect(() => {
    if (!canvasSize.w || !canvasSize.h || didInitialViewRef.current) return;
    applyDefaultView();
    didInitialViewRef.current = true;
  }, [canvasSize, applyDefaultView]);

  useEffect(() => {
    if (prevAllianceRef.current === alliance) return;
    prevAllianceRef.current = alliance;
    if (viewIsDefaultRef.current) applyDefaultView();
  }, [alliance, applyDefaultView]);

  // Panning has been removed — the field stays centered at all times. Zoom (FRC only,
  // via ctrl/cmd + wheel) is kept, anchored to the field center rather than the cursor.
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (isFtc) return;
    if (e.ctrlKey || e.metaKey) {
      setZoom((z) => {
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        return Math.max(0.5, Math.min(5, z * factor));
      });
    }
  }, [isFtc]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ background: '#0d1117' }}
        onWheel={handleWheel}
      />
      {showResetButton && (
        <button
          type="button"
          onClick={applyDefaultView}
          className="absolute top-3 right-3 px-2.5 py-1 bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground rounded-lg transition-all backdrop-blur-sm"
        >
          Reset View
        </button>
      )}
    </div>
  );
}
