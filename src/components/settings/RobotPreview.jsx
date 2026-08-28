import React, { useRef, useEffect } from 'react';

export default function RobotPreview({ settings }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !settings) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const pad = 20;
    const rw = settings.width ?? 0.76;
    const rl = settings.length ?? 0.76;

    // Bounding box including subsystems
    let minX = -rw / 2, maxX = rw / 2, minY = -rl / 2, maxY = rl / 2;
    (settings.subsystems || []).forEach(sub => {
      minX = Math.min(minX, (sub.offsetX ?? 0) - (sub.width ?? 0.2) / 2);
      maxX = Math.max(maxX, (sub.offsetX ?? 0) + (sub.width ?? 0.2) / 2);
      minY = Math.min(minY, (sub.offsetY ?? 0) - (sub.length ?? 0.2) / 2);
      maxY = Math.max(maxY, (sub.offsetY ?? 0) + (sub.length ?? 0.2) / 2);
    });

    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    // Use same scale for both axes to keep proportions correct
    const scale = Math.min((W - pad * 2) / bboxW, (H - pad * 2) / bboxH);

    // Center in canvas; Y flipped (up = positive Y)
    const cx = W / 2 - ((minX + maxX) / 2) * scale;
    const cy = H / 2 + ((minY + maxY) / 2) * scale;

    const toX = (x) => cx + x * scale;
    const toY = (y) => cy - y * scale; // flip Y so +Y = up

    // Subsystems
    (settings.subsystems || []).forEach(sub => {
      const sx = toX((sub.offsetX ?? 0) - (sub.width ?? 0.2) / 2);
      const sy = toY((sub.offsetY ?? 0) + (sub.length ?? 0.2) / 2);
      const sw = (sub.width ?? 0.2) * scale;
      const sh = (sub.length ?? 0.2) * scale;
      ctx.fillStyle = 'rgba(150,100,255,0.45)';
      ctx.strokeStyle = 'rgba(180,130,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      if (sw > 18 && sh > 10) {
        ctx.fillStyle = 'rgba(220,200,255,0.9)';
        ctx.font = `bold ${Math.max(7, Math.min(10, sw * 0.25))}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sub.name || '?', sx + sw / 2, sy + sh / 2);
      }
    });

    // Robot frame
    const rx = toX(-rw / 2);
    const ry = toY(rl / 2);
    const rws = rw * scale;
    const rhs = rl * scale;
    ctx.fillStyle = 'rgba(26,144,204,0.55)';
    ctx.strokeStyle = 'rgba(50,200,255,0.9)';
    ctx.lineWidth = 2;
    ctx.fillRect(rx, ry, rws, rhs);
    ctx.strokeRect(rx, ry, rws, rhs);

    // Center dot
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    // Front indicator dot — top edge center (+Y = front = visual top)
    const frontDotX = toX(0);
    const frontDotY = toY(rl / 2);
    ctx.beginPath();
    ctx.arc(frontDotX, frontDotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#32c8ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [settings]);

  return (
    <div className="bg-secondary/20 rounded-lg overflow-hidden border border-border flex-shrink-0 flex flex-col">
      <p className="text-xs text-muted-foreground font-medium px-3 pt-2 pb-1">Preview</p>
      <canvas ref={canvasRef} width={160} height={160} className="block" style={{ width: 160, height: 160 }} />
    </div>
  );
}