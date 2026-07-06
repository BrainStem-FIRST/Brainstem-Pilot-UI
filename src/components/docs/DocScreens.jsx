import React, { useState } from 'react';
import { OptionalParamsSection } from '../autobuilder/WaypointSidebar';

export const FIELD_IMAGE = '/fields/frc/rebuilt_2026.png';

export const DOC_IMAGES = {
  welcome: '/docs/welcome.png',
  pathsList: '/docs/paths-list.png',
  pathEditor: '/docs/path-editor.png',
  waypointsZoom: '/docs/waypoints-zoom.png',
  constraintsPanel: '/docs/constraints-panel.png',
  rotationTargets: '/docs/rotation-targets.png',
  subsystemTriggers: '/docs/subsystem-triggers.png',
  skeletonBuilder: '/docs/skeleton-builder.png',
  variantAuto: '/docs/variant-auto.png',
  robotSettings: '/docs/robot-settings.png',
  appSettings: '/docs/app-settings.png',
  simulator: '/docs/simulator.png',
  subsystemConfig: '/docs/subsystem-config.png',
};

export function DocScreenshot({ src, alt, caption, className = '' }) {
  return (
    <figure className={`my-6 ${className}`}>
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5">
        <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
      </div>
      {caption && (
        <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Two screenshots side by side with individual captions. */
export function DocSplitScreens({ left, right, className = '' }) {
  return (
    <figure className={`my-6 ${className}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[left, right].map(({ src, alt, label }) => (
          <div key={label} className="min-w-0">
            <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5">
              <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
            </div>
            <p className="text-xs font-medium text-foreground mt-2 text-center">{label}</p>
          </div>
        ))}
      </div>
      {(left.caption || right.caption) && (
        <figcaption className="text-xs text-muted-foreground mt-3 text-center italic">
          {left.caption ?? right.caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Cropped/zoomed region of a screenshot. */
export function DocImageCrop({
  src,
  alt,
  caption,
  height = 200,
  objectPosition = '50% 50%',
  scale = 1.75,
  className = '',
}) {
  return (
    <figure className={`my-0 ${className}`}>
      <div
        className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5"
        style={{ height }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto block"
          style={{ transform: `scale(${scale})`, transformOrigin: objectPosition }}
          loading="lazy"
        />
      </div>
      {caption && (
        <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Simpler crop using object-cover in a fixed box. */
export function DocImageZoom({ src, alt, caption, height = 200, objectPosition = '50% 50%', className = '' }) {
  return (
    <figure className={`my-0 ${className}`}>
      <div
        className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5"
        style={{ height }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          style={{ objectPosition }}
          loading="lazy"
        />
      </div>
      {caption && (
        <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">{caption}</figcaption>
      )}
    </figure>
  );
}

export function DocSideBySide({ src, alt, objectPosition, imageHeight = 200, imageWidth = 'sm:w-40', scale, children }) {
  const image = scale != null ? (
    <DocImageCrop
      src={src}
      alt={alt}
      height={imageHeight}
      objectPosition={objectPosition}
      scale={scale}
    />
  ) : (
    <div className="rounded-lg overflow-hidden border border-border shadow-md bg-[#0d1117] ring-1 ring-white/5">
      <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
    </div>
  );

  return (
    <div className="flex flex-col sm:flex-row gap-5 items-start my-6">
      <div className={`shrink-0 w-full ${imageWidth}`}>{image}</div>
      <div className="flex-1 min-w-0 text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function line(x1, y1, x2, y2, key, dashed = false) {
  return (
    <line
      key={key}
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={dashed ? 'rgba(148,163,184,0.55)' : 'rgba(100,180,255,0.35)'}
      strokeWidth={dashed ? 1.2 : 1.5}
      strokeDasharray={dashed ? '4 4' : undefined}
    />
  );
}

export function BezierLerpDiagram() {
  const P0 = { x: 36, y: 168 };
  const P1 = { x: 72, y: 36 };
  const P2 = { x: 168, y: 184 };
  const P3 = { x: 228, y: 72 };
  const t = 0.55;
  const Q0 = lerp(P0, P1, t);
  const Q1 = lerp(P1, P2, t);
  const Q2 = lerp(P2, P3, t);
  const R0 = lerp(Q0, Q1, t);
  const R1 = lerp(Q1, Q2, t);
  const B = lerp(R0, R1, t);

  const curvePath = `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`;

  const dot = (p, fill, label, sub, key) => (
    <g key={key}>
      <circle cx={p.x} cy={p.y} r={5} fill={fill} stroke="#fff" strokeWidth={1.2} />
      <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#e2e8f0" fontSize={9} fontWeight={600}>{label}</text>
      {sub && <text x={p.x} y={p.y + 16} textAnchor="middle" fill="#94a3b8" fontSize={7}>{sub}</text>}
    </g>
  );

  return (
    <figure className="my-0 h-full flex flex-col">
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5 flex-1 flex items-center justify-center p-3 min-h-[220px]">
        <svg viewBox="0 0 264 210" className="w-full max-w-[280px]" aria-label="Bezier curve lerp diagram">
          {[line(P0.x, P0.y, P1.x, P1.y, 'a'), line(P1.x, P1.y, P2.x, P2.y, 'b'), line(P2.x, P2.y, P3.x, P3.y, 'c')]}
          {[line(P0.x, P0.y, Q0.x, Q0.y, 'l1', true), line(P1.x, P1.y, Q1.x, Q1.y, 'l2', true),
            line(P2.x, P2.y, Q2.x, Q2.y, 'l3', true), line(Q0.x, Q0.y, Q1.x, Q1.y, 'l4', true),
            line(Q1.x, Q1.y, Q2.x, Q2.y, 'l5', true), line(R0.x, R0.y, R1.x, R1.y, 'l6', true),
            line(R0.x, R0.y, B.x, B.y, 'l7', true)]}
          <path d={curvePath} fill="none" stroke="#38bdf8" strokeWidth={2.5} />
          {dot(P0, '#22c55e', 'P₀', 'start', 'p0')}
          {dot(P1, '#fff', 'P₁', 'control', 'p1')}
          {dot(P2, '#fff', 'P₂', 'control', 'p2')}
          {dot(P3, '#ef4444', 'P₃', 'end', 'p3')}
          <circle cx={B.x} cy={B.y} r={4} fill="#38bdf8" stroke="#fff" strokeWidth={1} />
          <text x={B.x + 10} y={B.y + 4} fill="#38bdf8" fontSize={8} fontWeight={600}>B(t)</text>
          <text x={132} y={200} textAnchor="middle" fill="#64748b" fontSize={7}>
            dotted = lerp steps at t ≈ {Math.round(t * 100)}%
          </text>
        </svg>
      </div>
      <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">
        Cubic Bézier — lerp along control polygon builds the smooth curve.
      </figcaption>
    </figure>
  );
}

export function WaypointsBezierSection() {
  return (
    <div className="my-6 space-y-3">
      <div className="grid md:grid-cols-2 gap-4 items-stretch">
        <figure className="my-0 h-full flex flex-col">
          <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5 flex-1 flex items-center justify-center min-h-[220px]">
            <img
              src={DOC_IMAGES.waypointsZoom}
              alt="Zoomed path with waypoints and 180-degree locked control handles"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
          <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">
            Waypoints with collinear control handles (180° locked).
          </figcaption>
        </figure>
        <BezierLerpDiagram />
      </div>
      <p className="text-xs text-muted-foreground text-center italic">
        Left: path on the field. Right: how P₀–P₃ lerp into a Bézier segment.
      </p>
    </div>
  );
}

export function NewPathPopupScreen() {
  return (
    <figure className="my-6">
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5 min-h-[240px] flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl z-10">
          <h2 className="text-lg font-semibold text-foreground mb-1">New Path — Starting Side</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Which side of the field does this path start on? You can change this later in the path editor.
          </p>
          <div className="flex gap-3">
            <div className="flex-1 py-3 rounded-lg bg-secondary text-foreground font-bold text-lg border border-border text-center">
              Left (L)
            </div>
            <div className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-lg text-center">
              Right (R)
            </div>
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">
        New Path popup — choose Left (L) or Right (R) starting side.
      </figcaption>
    </figure>
  );
}

export function DuplicatePathPopupScreen() {
  return (
    <figure className="my-6">
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-[#0d1117] ring-1 ring-white/5 min-h-[240px] flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl z-10">
          <h2 className="text-lg font-semibold text-foreground mb-1">Duplicate Path</h2>
          <p className="text-sm text-muted-foreground mb-4">
            How should &quot;Drive to Neutral Zone&quot; be duplicated?
          </p>
          <div className="flex flex-col gap-2">
            <div className="w-full py-2.5 rounded-lg bg-secondary text-foreground text-sm font-semibold border border-border text-center">
              Same Side
            </div>
            <div className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold text-center">
              Opposite Side (mirrored)
            </div>
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">
        Duplicate Path popup — copy on the same side or mirror across the field midline.
      </figcaption>
    </figure>
  );
}

export function OptionalParamsScreen() {
  const [wp, setWp] = useState({ params: { distTol: 0.1, headingTol: 3.0 } });
  return (
    <figure className="my-6 max-w-xs mx-auto">
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-card ring-1 ring-white/5 p-3">
        <OptionalParamsSection
          wp={wp}
          onUpdate={(updates) => setWp((prev) => ({ ...prev, ...updates }))}
          initialOpen
        />
      </div>
      <figcaption className="text-xs text-muted-foreground mt-2 text-center italic">
        Optional Parameters — per-waypoint tuning on mid and end waypoints (not the start point).
      </figcaption>
    </figure>
  );
}

export function ConstraintsPanelScreen() {
  return (
    <DocScreenshot
      src={DOC_IMAGES.constraintsPanel}
      alt="Constraints panel — max velocity and max acceleration"
      caption="Constraints panel — override max velocity and acceleration for this path."
      className="max-w-xs mx-auto"
    />
  );
}
