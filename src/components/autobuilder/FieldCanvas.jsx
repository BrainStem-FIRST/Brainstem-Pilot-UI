import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  fieldToPixels, pixelsToField, clampToField,
  computeFieldLayout, drawFieldImage, getGridSpacing,
} from '../../lib/fieldCoordinates';
import { getPoseAtProgress } from '../../lib/trajectoryMath';
import { useFieldConfig } from '../../context/FieldConfigContext';
import { useLeague } from '../../context/LeagueContext';
import { getMotionUnitsForLeague } from '../../lib/motionUnits';

function drawStar(ctx, cx, cy, r, color) {
  const spikes = 5;
  const outerR = r;
  const innerR = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

const CTRL_RADIUS = 7;

function lockControls180(wp, controlType, newControlPos) {
  const dx = newControlPos.x - wp.x;
  const dy = newControlPos.y - wp.y;
  const oppositeType = controlType === 'prevControl' ? 'nextControl' : 'prevControl';
  const updates = { [controlType]: newControlPos };
  const oppDist = wp[oppositeType]
    ? Math.hypot(wp[oppositeType].x - wp.x, wp[oppositeType].y - wp.y)
    : Math.hypot(dx, dy);
  const thisDist = Math.hypot(dx, dy);
  const scale = thisDist > 0 ? oppDist / thisDist : 1;
  updates[oppositeType] = { x: wp.x - dx * scale, y: wp.y - dy * scale };
  return updates;
}
const MIDPOINT_RADIUS = 7;

export default function FieldCanvas({
  waypoints, selectedIndex, tool, trajectory, showVelocity,
  simProgress, isSimulating,
  onAddWaypoint, onUpdateWaypoint, onDeleteWaypoint, onSelectWaypoint,
  robotSettings, zoom, setZoom, onResetView,
  subsystemTriggers, subsystemConfig, rotationTargets, onUpdateRotationTargets,
  onBeginEdit, onEndEdit,
  contextSegments,
}) {
  const { bounds, unit, imageUrl, activeField } = useFieldConfig();
  const { projectType, isFtc } = useLeague();
  const motionUnits = getMotionUnitsForLeague(projectType);
  const defaultRobotSize = unit === 'in' ? 18 : 0.76;
  const ROBOT_W_M = robotSettings?.width ?? defaultRobotSize;
  const ROBOT_H_M = robotSettings?.length ?? defaultRobotSize;

  const canvasRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [fieldImage, setFieldImage] = useState(null);

  useEffect(() => {
    if (onResetView) onResetView((panOverride) => {
      const p = panOverride ?? { x: 0, y: 0 };
      panRef.current = p;
      setPan(p);
    });
  }, [onResetView]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setFieldImage(img);
  }, [imageUrl]);

  const getCanvasSize = () => {
    const c = canvasRef.current;
    if (!c) return { w: 800, h: 400 };
    return { w: c.width, h: c.height };
  };

  const getUiScale = useCallback(() => {
    const { w, h } = getCanvasSize();
    const iw = activeField?.imageWidth ?? 1024;
    const fieldScale = Math.min(w / iw, h / (activeField?.imageHeight ?? 415)) * zoom;
    const refScale = (800 / iw) * 1.2;
    return Math.max(0.35, Math.min(1.2, fieldScale / refScale));
  }, [zoom, activeField]);

  const toPixel = useCallback((x, y) => {
    const { w, h } = getCanvasSize();
    return fieldToPixels(x, y, w, h, panRef.current, zoom);
  }, [zoom, pan]);

  const toMeter = useCallback((px, py) => {
    const { w, h } = getCanvasSize();
    return pixelsToField(px, py, w, h, panRef.current, zoom);
  }, [zoom, pan]);

  const getControlPoints = useCallback((i) => {
    const wp = waypoints[i];
    const prev = waypoints[i - 1];
    const next = waypoints[i + 1];
    
    const prevCtrl = i === 0 ? null : (wp.prevControl ?? (prev ? { x: wp.x + (prev.x - wp.x) / 3, y: wp.y + (prev.y - wp.y) / 3 } : null));
    const nextCtrl = i === waypoints.length - 1 ? null : (wp.nextControl ?? (next ? { x: wp.x + (next.x - wp.x) / 3, y: wp.y + (next.y - wp.y) / 3 } : null));
    
    return { prevCtrl, nextCtrl };
  }, [waypoints]);

  // ── Draw helpers ─────────────────────────────────────────────────────────

  function drawGrid(ctx) {
    const gridSpacing = getGridSpacing(activeField);
    const { px: x0, py: y0 } = toPixel(bounds.xMin, bounds.yMin);
    const { px: x1, py: y1 } = toPixel(bounds.xMax, bounds.yMax);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    ctx.strokeStyle = 'rgba(100,180,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = bounds.xMin; x <= bounds.xMax + gridSpacing * 0.01; x += gridSpacing) {
      const { px } = toPixel(x, bounds.yMin);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
    }
    for (let y = bounds.yMin; y <= bounds.yMax + gridSpacing * 0.01; y += gridSpacing) {
      const { py } = toPixel(bounds.xMin, y);
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPath(ctx) {
    const s = getUiScale();
    const pts = trajectory.states;
    ctx.beginPath();
    const { px, py } = toPixel(pts[0].x, pts[0].y);
    ctx.moveTo(px, py);
    for (let i = 1; i < pts.length; i++) {
      const { px: nx, py: ny } = toPixel(pts[i].x, pts[i].y);
      ctx.lineTo(nx, ny);
    }
    ctx.strokeStyle = 'rgba(50,200,255,0.75)';
    ctx.lineWidth = 3 * s;
    ctx.shadowColor = 'rgba(50,200,255,0.4)';
    ctx.shadowBlur = 8 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (showVelocity) {
      const step = Math.max(1, Math.floor(pts.length / 20));
      for (let i = 0; i < pts.length; i += step) drawArrow(ctx, pts[i], 'rgba(255,220,50,0.8)');
    }
  }

  // Renders the other slots of an Auto's chained sequence in the background: solid
  // curves for path slots, dashed straight lines for point slots, brighter when the
  // slot is the currently-selected one in the workspace's left panel.
  function drawContextSegments(ctx) {
    if (!contextSegments?.length) return;
    const s = getUiScale();
    contextSegments.forEach((seg) => {
      const pts = seg.trajectory?.states;
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      const { px, py } = toPixel(pts[0].x, pts[0].y);
      ctx.moveTo(px, py);
      for (let i = 1; i < pts.length; i++) {
        const { px: nx, py: ny } = toPixel(pts[i].x, pts[i].y);
        ctx.lineTo(nx, ny);
      }
      ctx.setLineDash(seg.dashed ? [7 * s, 5 * s] : []);
      ctx.strokeStyle = seg.highlighted ? 'rgba(255,220,50,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = (seg.highlighted ? 3.5 : 2) * s;
      if (seg.highlighted) {
        ctx.shadowColor = 'rgba(255,220,50,0.5)';
        ctx.shadowBlur = 6 * s;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    });
  }

  function drawArrow(ctx, pt, color) {
    const s = getUiScale();
    const { px, py } = toPixel(pt.x, pt.y);
    const rad = (pt.heading * Math.PI) / 180;
    const len = 14 * s;
    const ex = px + Math.cos(rad) * len;
    const ey = py - Math.sin(rad) * len;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5 * s; ctx.stroke();
    const angle = Math.atan2(ey - py, ex - px);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 6 * s * Math.cos(angle - 0.4), ey - 6 * s * Math.sin(angle - 0.4));
    ctx.lineTo(ex - 6 * s * Math.cos(angle + 0.4), ey - 6 * s * Math.sin(angle + 0.4));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  function drawTriggerStars(ctx) {
    if (!trajectory || !subsystemTriggers?.length) return;
    const s = getUiScale();
    const colors = ['#a855f7', '#f59e0b', '#10b981', '#ef4444', '#3b82f6'];
    subsystemTriggers.forEach((trig, i) => {
      const pose = getPoseAtProgress(trajectory, Number(trig.progress ?? 0));
      if (!pose) return;
      const { px, py } = toPixel(pose.x, pose.y);
      drawStar(ctx, px, py, 11 * s, colors[i % colors.length]);
      ctx.font = `bold ${Math.round(10 * s)}px Inter`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(trig.subsystemName || `T${i + 1}`, px, py - 13 * s);
    });
  }

  function drawRotationTargetGhosts(ctx) {
    if (!trajectory || !rotationTargets?.length) return;
    const s = getUiScale();
    rotationTargets.forEach((tgt) => {
      const pose = getPoseAtProgress(trajectory, tgt.progress ?? 0);
      if (!pose) return;
      const { px, py } = toPixel(pose.x, pose.y);
      const { px: rx1 } = toPixel(pose.x + ROBOT_W_M, pose.y);
      const { py: ry1 } = toPixel(pose.x, pose.y - ROBOT_H_M);
      const rw = rx1 - px;
      const rh = ry1 - py;
      const rotRad = (-(tgt.rotation ?? 0) * Math.PI) / 180;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotRad + Math.PI / 2);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5 * s;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, -rh / 2, 7 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawRobotShape(ctx, rw, rh, subsystems, scale, fillColor, strokeColor, strokeW) {
    (subsystems || []).forEach(sub => {
      const sw = (sub.width ?? 0.2) * scale;
      const sh = (sub.length ?? 0.2) * scale;
      const sx = (sub.offsetX ?? 0) * scale - sw / 2;
      const sy = -(sub.offsetY ?? 0) * scale - sh / 2;
      ctx.fillStyle = 'rgba(150,100,255,0.6)';
      ctx.strokeStyle = 'rgba(200,160,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
    });
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeW;
    ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
    ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -rh / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function getVisibleSubsystemsAtProgress(progress) {
    if (!robotSettings?.subsystems) return [];
    const visMap = {};
    robotSettings.subsystems.forEach(sub => { visMap[sub.name] = sub.visibleOnStart ?? false; });
    if ((subsystemTriggers ?? []).length > 0) {
      const sorted = [...subsystemTriggers].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
      sorted.forEach(trig => {
        if ((trig.progress ?? 0) > progress) return;
        const sysCfg = (subsystemConfig ?? []).find(s => s.name === trig.subsystemName);
        const cmdCfg = sysCfg?.commands?.find(c => c.name === trig.commandName);
        if (cmdCfg?.visualBinding && cmdCfg.visualBinding !== 'none') {
          visMap[cmdCfg.visualBinding] = (cmdCfg.visualAction ?? 'show') === 'show';
        }
      });
    }
    return robotSettings.subsystems.filter(sub => visMap[sub.name]);
  }

  function getWaypointProgress(waypointIndex) {
    if (!trajectory || waypoints.length < 2) return waypointIndex / Math.max(1, waypoints.length - 1);
    if (waypointIndex === 0) return 0;
    if (waypointIndex >= waypoints.length - 1) return 1;
    const wp = waypoints[waypointIndex];
    const pts = trajectory.states;
    if (!pts || pts.length === 0) return waypointIndex / (waypoints.length - 1);
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - wp.x;
      const dy = pts[i].y - wp.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx / (pts.length - 1);
  }

  function drawWaypoint(ctx, wp, i) {
    const s = getUiScale();
    const { px, py } = toPixel(wp.x, wp.y);
    const isSelected = i === selectedIndex;
    const isFirst = i === 0;
    const isLast = i === waypoints.length - 1;

    if (isFirst || isLast) {
      const { px: rx1 } = toPixel(wp.x + ROBOT_W_M, wp.y);
      const { py: ry1 } = toPixel(wp.x, wp.y - ROBOT_H_M);
      const rw = rx1 - px;
      const rh = ry1 - py;
      const rad = (-(wp.rotation ?? 0) * Math.PI) / 180;
      const mPerPx = ROBOT_W_M / rw;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rad + Math.PI / 2);
      if (isSelected) {
        ctx.fillStyle = 'rgba(50,200,255,0.15)';
        ctx.fillRect(-rw / 2 - 4 * s, -rh / 2 - 4 * s, rw + 8 * s, rh + 8 * s);
      }
      const wpProgress = getWaypointProgress(i);
      const visibleSubs = getVisibleSubsystemsAtProgress(wpProgress);
      drawRobotShape(ctx, rw, rh, visibleSubs, 1 / mPerPx,
        isFirst ? 'rgba(34,221,102,0.75)' : 'rgba(255,68,68,0.75)',
        isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)',
        isSelected ? 2 * s : 1.5 * s);
      ctx.restore();
    } else {
      const r = (MIDPOINT_RADIUS + (isSelected ? 4 : 0)) * s;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(50,200,255,0.85)' : 'rgba(26,144,204,0.75)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = (isSelected ? 2 : 1.5) * s;
      ctx.stroke();
    }
  }

  function drawControlHandles(ctx, wpIdx) {
    const s = getUiScale();
    const wp = waypoints[wpIdx];
    const { px: ax, py: ay } = toPixel(wp.x, wp.y);
    const { prevCtrl, nextCtrl } = getControlPoints(wpIdx);
    const isFirst = wpIdx === 0;
    const isLast = wpIdx === waypoints.length - 1;
    const isSelected = wpIdx === selectedIndex;

    const drawHandle = (ctrl) => {
      if (!ctrl) return;
      const { px: cx, py: cy } = toPixel(ctrl.x, ctrl.y);
      ctx.beginPath();
      ctx.setLineDash(isSelected ? [] : [5, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2 * s;
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, CTRL_RADIUS * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    };

    if (!isFirst) drawHandle(prevCtrl);
    if (!isLast) drawHandle(nextCtrl);
  }

  function drawRobot(ctx, pose) {
    const { px, py } = toPixel(pose.x, pose.y);
    const rad = (-(pose.rotation ?? pose.heading) * Math.PI) / 180;
    const { px: rx1 } = toPixel(pose.x + ROBOT_W_M, pose.y);
    const { py: ry1 } = toPixel(pose.x, pose.y - ROBOT_H_M);
    const rw = rx1 - px;
    const rh = ry1 - py;
    const mPerPx = ROBOT_W_M / rw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rad + Math.PI / 2);
    drawRobotShape(ctx, rw, rh, getVisibleSubsystemsAtProgress(simProgress), 1 / mPerPx,
      'rgba(255,180,30,0.92)', '#ffffff', 2);
    ctx.restore();
  }

  function drawRobotVelocityOverlay(ctx, pose) {
    if (!pose) return;
    const { px, py } = toPixel(pose.x, pose.y);
    const vel = pose.velocity ?? 0;
    const acc = pose.acceleration ?? 0;
    const boxX = px + 28, boxY = py - 36;
    const padding = 6, lineH = 14, boxW = 90;
    const boxH = padding * 2 + lineH * 2 + 2;
    ctx.fillStyle = 'rgba(10,16,28,0.82)';
    ctx.strokeStyle = 'rgba(50,200,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 5);
    ctx.fill(); ctx.stroke();
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const accDisplay = Math.max(-motionUnits.constraintMax, Math.min(motionUnits.constraintMax, acc));
    ctx.fillStyle = '#32c8ff';
    ctx.fillText(`v: ${vel.toFixed(2)} ${motionUnits.speedUnit}`, boxX + padding, boxY + padding);
    ctx.fillStyle = '#ffdd33';
    ctx.fillText(`a: ${accDisplay.toFixed(2)} ${motionUnits.accelUnit}`, boxX + padding, boxY + padding + lineH + 2);
  }

  // ── Draw loop ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = { w: canvas.width, h: canvas.height };
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const layout = computeFieldLayout(w, h, panRef.current, zoom, activeField);
    if (fieldImage) {
      drawFieldImage(ctx, fieldImage, layout);
    } else {
      const { px: x0, py: y0 } = toPixel(bounds.xMin, bounds.yMin);
      const { px: x1, py: y1 } = toPixel(bounds.xMax, bounds.yMax);
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    drawGrid(ctx);
    drawContextSegments(ctx);
    if (trajectory && trajectory.states?.length > 1) drawPath(ctx);
    waypoints.forEach((wp, i) => drawWaypoint(ctx, wp, i));
    if (trajectory && trajectory.states?.length > 1) {
      drawTriggerStars(ctx);
      drawRotationTargetGhosts(ctx);
    }
    waypoints.forEach((_, i) => drawControlHandles(ctx, i));
    if (trajectory && (isSimulating || simProgress > 0)) {
      const pose = getPoseAtProgress(trajectory, simProgress);
      if (pose) {
        drawRobot(ctx, pose);
        if (showVelocity) drawRobotVelocityOverlay(ctx, pose);
      }
    }
  }, [waypoints, selectedIndex, trajectory, showVelocity, simProgress, isSimulating, contextSegments, subsystemTriggers, rotationTargets, robotSettings, fieldImage, zoom, activeField, bounds, toPixel]);

  useEffect(() => { draw(); });

  // ── Resize ────────────────────────────────────────────────────────────────
  // Setting canvas.width/height clears the canvas bitmap immediately, outside of React's
  // render cycle — without an explicit redraw here the field image can go blank after any
  // layout change (e.g. a side panel opening/closing) until some unrelated re-render happens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
    return () => ro.disconnect();
  }, [draw]);

  // ── Hit tests ─────────────────────────────────────────────────────────────

  const hitRotationDot = useCallback((px, py) => {
    const s = getUiScale();
    for (let i = waypoints.length - 1; i >= 0; i--) {
      const isFirst = i === 0;
      const isLast = i === waypoints.length - 1;
      if (!isFirst && !isLast) continue;

      const wp = waypoints[i];
      const { px: cx, py: cy } = toPixel(wp.x, wp.y);
      const { py: ry1 } = toPixel(wp.x, wp.y - ROBOT_H_M);
      const rh = ry1 - cy;
      const rad = (-(wp.rotation ?? 0) * Math.PI) / 180;
      const canvasRot = rad + Math.PI / 2;
      const dotX = cx + Math.cos(canvasRot) * 0 - Math.sin(canvasRot) * (-rh / 2);
      const dotY = cy + Math.sin(canvasRot) * 0 + Math.cos(canvasRot) * (-rh / 2);
      if (Math.hypot(px - dotX, py - dotY) <= 14 * s) return i;
    }
    return -1;
  }, [waypoints, toPixel, ROBOT_H_M, getUiScale]);

  const hitWaypoint = useCallback((px, py) => {
    const s = getUiScale();
    const { w, h } = getCanvasSize();
    for (let i = waypoints.length - 1; i >= 0; i--) {
      const wp = waypoints[i];
      const { px: cx, py: cy } = toPixel(wp.x, wp.y);
      const isFirst = i === 0;
      const isLast = i === waypoints.length - 1;

      if (isFirst || isLast) {
        const { px: rx1 } = fieldToPixels(wp.x + ROBOT_W_M, wp.y, w, h, panRef.current, zoom);
        const { py: ry1 } = fieldToPixels(wp.x, wp.y - ROBOT_H_M, w, h, panRef.current, zoom);
        const rw = (rx1 - cx) / 2 + 4 * s;
        const rh = (ry1 - cy) / 2 + 4 * s;
        const rad = (-(wp.rotation ?? 0) * Math.PI) / 180;
        const canvasRad = rad + Math.PI / 2;
        const dx = px - cx, dy = py - cy;
        const localX = dx * Math.cos(canvasRad) + dy * Math.sin(canvasRad);
        const localY = -dx * Math.sin(canvasRad) + dy * Math.cos(canvasRad);
        if (Math.abs(localX) <= rw && Math.abs(localY) <= rh) return i;
      } else {
        if (Math.hypot(px - cx, py - cy) <= (MIDPOINT_RADIUS + 6) * s) return i;
      }
    }
    return -1;
  }, [waypoints, toPixel, zoom, getUiScale]);

  const hitControlHandle = useCallback((px, py) => {
    const s = getUiScale();
    for (let i = 0; i < waypoints.length; i++) {
      const isFirst = i === 0;
      const isLast = i === waypoints.length - 1;
      const { prevCtrl, nextCtrl } = getControlPoints(i);
      if (!isFirst && prevCtrl) {
        const { px: cx, py: cy } = toPixel(prevCtrl.x, prevCtrl.y);
        if (Math.hypot(px - cx, py - cy) <= (CTRL_RADIUS + 5) * s) return { type: 'prevControl', index: i };
      }
      if (!isLast && nextCtrl) {
        const { px: cx, py: cy } = toPixel(nextCtrl.x, nextCtrl.y);
        if (Math.hypot(px - cx, py - cy) <= (CTRL_RADIUS + 5) * s) return { type: 'nextControl', index: i };
      }
    }
    return null;
  }, [waypoints, getControlPoints, toPixel, getUiScale]);

  const hitRotationTargetDot = useCallback((px, py) => {
    const s = getUiScale();
    if (!trajectory || !rotationTargets?.length) return -1;
    for (let i = rotationTargets.length - 1; i >= 0; i--) {
      const tgt = rotationTargets[i];
      const pose = getPoseAtProgress(trajectory, tgt.progress ?? 0);
      if (!pose) continue;
      const { px: cx, py: cy } = toPixel(pose.x, pose.y);
      const { py: ry1 } = toPixel(pose.x, pose.y - ROBOT_H_M);
      const rh = ry1 - cy;
      const rotRad = (-(tgt.rotation ?? 0) * Math.PI) / 180;
      const canvasRot = rotRad + Math.PI / 2;
      const dotX = cx + Math.cos(canvasRot) * 0 - Math.sin(canvasRot) * (-rh / 2);
      const dotY = cy + Math.sin(canvasRot) * 0 + Math.cos(canvasRot) * (-rh / 2);
      if (Math.hypot(px - dotX, py - dotY) <= 14 * s) return i;
    }
    return -1;
  }, [trajectory, rotationTargets, toPixel, ROBOT_H_M, getUiScale]);

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const startDrag = useCallback((dragState) => {
    onBeginEdit?.();
    setDragging(dragState);
  }, [onBeginEdit]);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (onUpdateRotationTargets) {
      const rtHit = hitRotationTargetDot(px, py);
      if (rtHit >= 0) {
        const tgt = rotationTargets[rtHit];
        const pose = getPoseAtProgress(trajectory, tgt.progress ?? 0);
        const { px: cx, py: cy } = toPixel(pose.x, pose.y);
        const mouseAngle = Math.atan2(py - cy, px - cx);
        // FIX: Account for the negative mapping multiplier during dragging angle assignment initialization
        const currentCanvasAngle = (-(tgt.rotation ?? 0) * Math.PI / 180) + Math.PI / 2;
        const angularOffset = mouseAngle - currentCanvasAngle;
        startDrag({ type: 'rotationTarget', index: rtHit, angularOffset });
        return;
      }
    }

    const rotDotHit = hitRotationDot(px, py);
    if (rotDotHit >= 0) {
      onSelectWaypoint(rotDotHit);
      const wp = waypoints[rotDotHit];
      const { px: cx, py: cy } = toPixel(wp.x, wp.y);
      const mouseAngle = Math.atan2(py - cy, px - cx);
      // FIX: Account for the negative mapping multiplier during dragging angle assignment initialization
      const currentCanvasAngle = (-(wp.rotation ?? 0) * Math.PI / 180) + Math.PI / 2;
      const angularOffset = mouseAngle - currentCanvasAngle;
      startDrag({ type: 'rotation', index: rotDotHit, angularOffset });
      return;
    }

    const ctrlHit = hitControlHandle(px, py);
    if (ctrlHit) {
      onSelectWaypoint(ctrlHit.index);
      startDrag({ type: 'control', controlType: ctrlHit.type, index: ctrlHit.index });
      return;
    }

    const hit = hitWaypoint(px, py);
    if (hit >= 0) {
      onSelectWaypoint(hit);
      startDrag({ type: 'waypoint', index: hit });
      return;
    }

    if (tool === 'add') {
      const { x, y } = toMeter(px, py);
      const clamped = clampToField(x, y);
      const prev = waypoints[waypoints.length - 1];
      const dx = prev ? (clamped.x - prev.x) / 3 : 0.5;
      const dy = prev ? (clamped.y - prev.y) / 3 : 0;
      
      const isFirstNode = waypoints.length === 0;

      if (prev) {
        const nextControl = { x: prev.x + dx, y: prev.y + dy };
        const prevIdx = waypoints.length - 1;
        const isPrevFirst = prevIdx === 0;
        const prevUpdates = isPrevFirst
          ? { nextControl }
          : lockControls180(prev, 'nextControl', nextControl);
        onUpdateWaypoint(prevIdx, prevUpdates);
      }
      
      onAddWaypoint({
        x: clamped.x, 
        y: clamped.y, 
        rotation: 0,
        prevControl: isFirstNode ? null : { x: clamped.x - dx, y: clamped.y - dy },
        nextControl: null,
      });
      onSelectWaypoint(waypoints.length);
    } else {
      onSelectWaypoint(null);
    }
  }, [tool, pan, hitRotationDot, hitControlHandle, hitWaypoint, hitRotationTargetDot, toMeter, toPixel, onAddWaypoint, onUpdateWaypoint, onSelectWaypoint, waypoints, rotationTargets, trajectory, onUpdateRotationTargets, startDrag]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (dragging.type === 'rotationTarget') {
      const tgt = rotationTargets[dragging.index];
      const pose = getPoseAtProgress(trajectory, tgt.progress ?? 0);
      if (!pose) return;
      const { px: cx, py: cy } = toPixel(pose.x, pose.y);
      const mouseAngle = Math.atan2(py - cy, px - cx);
      const canvasAngle = mouseAngle - (dragging.angularOffset ?? 0);
      const rotDeg = -(canvasAngle - Math.PI / 2) * 180 / Math.PI;
      const updated = rotationTargets.map((t, i) => i === dragging.index ? { ...t, rotation: rotDeg } : t);
      onUpdateRotationTargets(updated);
      return;
    }

    if (dragging.type === 'rotation') {
      const wp = waypoints[dragging.index];
      const { px: cx, py: cy } = toPixel(wp.x, wp.y);
      const mouseAngle = Math.atan2(py - cy, px - cx);
      const canvasAngle = mouseAngle - (dragging.angularOffset ?? 0);
      const rotDeg = -(canvasAngle - Math.PI / 2) * 180 / Math.PI;
      onUpdateWaypoint(dragging.index, { rotation: rotDeg });
      return;
    }

    if (dragging.type === 'waypoint') {
      const { x, y } = toMeter(px, py);
      const c = clampToField(x, y);
      const wp = waypoints[dragging.index];
      const dx = c.x - wp.x, dy = c.y - wp.y;
      const updates = { x: c.x, y: c.y };
      
      const isFirst = dragging.index === 0;
      const isLast = dragging.index === waypoints.length - 1;

      if (wp.prevControl && !isFirst) updates.prevControl = { x: wp.prevControl.x + dx, y: wp.prevControl.y + dy };
      if (wp.nextControl && !isLast) updates.nextControl = { x: wp.nextControl.x + dx, y: wp.nextControl.y + dy };
      
      if (isFirst) updates.prevControl = null;
      if (isLast) updates.nextControl = null;

      onUpdateWaypoint(dragging.index, updates);
    }

    if (dragging.type === 'control') {
      const { x, y } = toMeter(px, py);
      const clamped = clampToField(x, y);
      const wp = waypoints[dragging.index];
      
      const isFirst = dragging.index === 0;
      const isLast = dragging.index === waypoints.length - 1;

      if (dragging.controlType === 'prevControl' && isFirst) return;
      if (dragging.controlType === 'nextControl' && isLast) return;

      const updates = { [dragging.controlType]: { x: clamped.x, y: clamped.y } };
      const oppositeType = dragging.controlType === 'prevControl' ? 'nextControl' : 'prevControl';
      const isOppositeBoundary = (oppositeType === 'prevControl' && isFirst) || 
                                 (oppositeType === 'nextControl' && isLast);

      const oppositeExists = wp[oppositeType] != null && !isOppositeBoundary;
      if (oppositeExists) {
        const dx = clamped.x - wp.x;
        const dy = clamped.y - wp.y;
        const oppDist = Math.hypot(wp[oppositeType].x - wp.x, wp[oppositeType].y - wp.y);
        const thisDist = Math.hypot(dx, dy);
        const scale = thisDist > 0 ? oppDist / thisDist : 1;
        updates[oppositeType] = {
          x: wp.x - dx * scale,
          y: wp.y - dy * scale,
        };
      }
      onUpdateWaypoint(dragging.index, updates);
    }
  }, [dragging, toMeter, toPixel, onUpdateWaypoint, onUpdateRotationTargets, waypoints, rotationTargets, trajectory]);

  const handleMouseUp = useCallback(() => {
    if (dragging) onEndEdit?.();
    setDragging(null);
  }, [dragging, onEndEdit]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const hit = hitWaypoint(e.clientX - rect.left, e.clientY - rect.top);
    if (hit >= 0) onDeleteWaypoint(hit);
  }, [hitWaypoint, onDeleteWaypoint]);

  // Panning has been removed — the field stays centered at all times. Zoom (FRC only,
  // via ctrl/cmd + wheel) is kept, anchored to the field center rather than the cursor.
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (isFtc) return;
    if (e.ctrlKey || e.metaKey) {
      setZoom(z => {
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        return Math.max(0.5, Math.min(5, z * factor));
      });
    }
  }, [isFtc, setZoom]);

  const cursor = tool === 'add' ? 'crosshair' : dragging?.type === 'rotation' ? 'grabbing' : dragging ? 'grabbing' : 'default';

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ cursor, background: '#0d1117' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
    />
  );
}