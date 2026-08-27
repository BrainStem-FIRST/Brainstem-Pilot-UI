import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FRC_PROJECT_PATH, FTC_PROJECT_PATH, PROJECT_FOLDER_NAME } from '../lib/projectLocation';
import {
  ChevronLeft, BookOpen, Route, Code2, Play, Cpu, FolderOpen,
  MapPin, Sparkles, RotateCcw, Zap, Settings2, Copy, MousePointer2,
} from 'lucide-react';
import {
  FIELD_IMAGE,
  DOC_IMAGES,
  DocScreenshot,
  DocSplitScreens,
  NewPathPopupScreen,
  OptionalParamsScreen,
  WaypointsBezierSection,
  DuplicatePathPopupScreen,
  ConstraintsPanelScreen,
  DocSideBySide,
} from '../components/docs/DocScreens';

const NAV = [
  { id: 'setup', label: 'Setup', icon: FolderOpen },
  { id: 'paths', label: 'Paths Overview', icon: Route },
  { id: 'editor', label: 'Path Editor', icon: MousePointer2 },
  { id: 'waypoints', label: 'Waypoints & Curves', icon: MapPin },
  { id: 'optional-params', label: 'Optional Parameters', icon: Sparkles },
  { id: 'rotation', label: 'Rotation Targets', icon: RotateCcw },
  { id: 'triggers', label: 'Subsystem Triggers', icon: Zap },
  { id: 'constraints', label: 'Constraints', icon: Settings2 },
  { id: 'duplicate', label: 'Duplicating Paths', icon: Copy },
  { id: 'skeleton', label: 'Skeleton Autos', icon: Code2 },
  { id: 'variant', label: 'Variant Autos', icon: Play },
  { id: 'simulate', label: 'Simulate & Preview', icon: Play },
  { id: 'subsystems', label: 'Subsystems', icon: Cpu },
];

const OPTIONAL_PARAMS = [
  {
    key: 'distTol',
    label: 'Distance Tolerance',
    unit: 'm',
    default: 0.1,
    summary: 'How close the robot must get to a waypoint before that waypoint counts as reached.',
    detail: 'This applies to any waypoint you configure it on, including the last one — the path is not finished until the robot is within this distance of the final point. Use a smaller value when you need a precise stop; use a larger value when “close enough” is acceptable.',
  },
  {
    key: 'headingTol',
    label: 'Heading Tolerance',
    unit: '°',
    default: 3.0,
    summary: 'Maximum heading error allowed when finishing the segment to this waypoint.',
    detail: 'If the robot is within distance tolerance but its heading is outside this band, the follower keeps correcting rotation before advancing. Tighten for align-and-score moves; loosen when heading at the waypoint matters less.',
  },
  {
    key: 'minLinearSpeed',
    label: 'Min Linear Speed',
    unit: 'm/s',
    default: 0,
    summary: 'Floor on forward speed so the robot does not stop while passing through this waypoint.',
    detail: 'Use this on points the robot should drive through rather than settle at. A non-zero minimum keeps the robot moving at least that fast through the waypoint instead of braking to a halt between segments. Value is in meters per second.',
  },
  {
    key: 'maxLinearSpeed',
    label: 'Max Linear Speed',
    unit: 'm/s',
    default: 1,
    summary: 'Speed cap for the leg ending at this waypoint.',
    detail: 'Lowers the top speed on that segment only — a simple way to manually slow down part of a path (e.g. a careful approach) without changing the path-wide max velocity in Constraints. Value is in meters per second.',
  },
  {
    key: 'maxTurnPower',
    label: 'Max Turn Power',
    unit: '0–1 power',
    default: 1,
    summary: 'Cap on rotational power while correcting heading on this segment.',
    detail: 'Lower this when you want a slower, controlled turn instead of a snap rotation — helpful near obstacles or when carrying game pieces.',
  },
  {
    key: 'maxTime',
    label: 'Max Time',
    unit: 's',
    default: 10,
    summary: 'Time limit allowed to reach this waypoint before the segment times out.',
    detail: 'Acts as a safety bound on a single leg of the path. Increase for long cross-field segments; decrease on short moves so a stuck robot fails fast during testing.',
  },
  {
    key: 'passPosition',
    label: 'Pass Position',
    default: false,
    summary: 'If the robot overshoots this waypoint, continue to the next one instead of backing up.',
    detail: 'When enabled, missing the point by driving past it will not trigger a reverse or retry — the follower moves on to the next waypoint. Leave off when the robot must actually reach the point (e.g. pickup or scoring positions).',
  },
];

function Callout({ color = 'primary', title, children }) {
  const colors = {
    primary: 'border-primary/30 bg-primary/5',
    violet: 'border-violet-500/30 bg-violet-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 my-4 ${colors[color] ?? colors.primary}`}>
      {title && <p className="text-sm font-semibold text-foreground mb-1">{title}</p>}
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function Section({ id, title, subtitle, icon: Icon, children }) {
  return (
    <section id={id} className="scroll-mt-6 mb-16 pb-16 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-3 mb-6">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-4">{children}</div>
    </section>
  );
}

export default function Documentation() {
  const [active, setActive] = useState('setup');
  const mainRef = useRef(null);

  const scrollTo = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const onScroll = () => {
      const sections = NAV.map(n => document.getElementById(n.id)).filter(Boolean);
      const top = root.scrollTop + 80;
      let current = NAV[0].id;
      for (const el of sections) {
        if (el.offsetTop <= top) current = el.id;
      }
      setActive(current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 shrink-0 z-20">
        <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs font-medium">Home</span>
        </Link>
        <div className="w-px h-5 bg-border" />
        <BookOpen className="w-4 h-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">BrainSTEM Pilot Docs</h1>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="hidden md:flex w-52 shrink-0 flex-col border-r border-border bg-card/80 overflow-y-auto">
          <div className="p-3 space-y-0.5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                  active === id
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 backdrop-blur px-2 py-2 overflow-x-auto flex gap-1">
          {NAV.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => scrollTo(id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold ${active === id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto pb-20 md:pb-8">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="relative rounded-2xl overflow-hidden mb-12 border border-border">
              <img src={FIELD_IMAGE} alt="FRC field" className="w-full h-48 object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h1 className="text-2xl font-bold text-foreground">BrainSTEM Pilot Guide</h1>
                <p className="text-sm text-muted-foreground mt-1">Everything you need to plan, build, and simulate FRC autonomous routines.</p>
              </div>
            </div>

            <Section id="setup" title="Initial Setup" subtitle="Connect BrainSTEM Pilot to your robot project" icon={FolderOpen}>
              <p>All paths, autos, and settings are saved as JSON files in a folder you choose on your computer.</p>
              <DocScreenshot
                src={DOC_IMAGES.welcome}
                alt="BrainSTEM Pilot home screen with Open Project"
                caption="Home screen — open your project folder, then pick a module to start."
              />
              <ol className="list-decimal ml-5 space-y-3 text-sm">
                <li>In your robot codebase, create the folder for your league:
                  <div className="mt-1 space-y-0.5">
                    <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground">FRC</span> <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">{FRC_PROJECT_PATH}</code></div>
                    <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground">FTC</span> <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">{FTC_PROJECT_PATH}</code></div>
                  </div>
                </li>
                <li>Open BrainSTEM Pilot → click <strong>Open Project</strong> (top-right).</li>
                <li>Select that folder (Chrome or Edge required).</li>
                <li>Default files are created: <code className="text-xs font-mono bg-secondary px-1 rounded">robot_settings.json</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">app_settings.json</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">subsystem_config.json</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">paths/</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">skeletons/</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">variants/</code></li>
              </ol>
              <h3 className="text-sm font-bold text-foreground mt-8 mb-2">Settings</h3>
              <p className="text-sm">
                Open <Link to="/settings" className="text-primary hover:underline">Settings</Link> from the home screen (top-left). There are two tabs:
              </p>
              <ul className="list-disc ml-5 space-y-2 text-sm mt-3">
                <li>
                  <strong>Robot Settings</strong> — your robot’s frame size, default max velocity and acceleration, and physical subsystem attachments drawn on the robot icon in the path editor. New paths inherit these motion defaults until you override them per path.
                </li>
                <li>
                  <strong>App Settings</strong> — which season field image to use across the app. This updates the background in the path editor, path list previews, and simulator. Pick the field that matches your current game; the choice is saved in your project folder as <code className="text-xs font-mono bg-secondary px-1 rounded">app_settings.json</code>.
                </li>
              </ul>
              <Callout title="First step after opening" color="green">
                In <strong>Robot Settings</strong>, set robot width, length, max velocity, and max acceleration before drawing paths. In <strong>App Settings</strong>, confirm the correct season field is selected.
              </Callout>
              <DocSplitScreens
                left={{
                  src: DOC_IMAGES.robotSettings,
                  alt: 'Robot Settings tab',
                  label: 'Robot Settings',
                }}
                right={{
                  src: DOC_IMAGES.appSettings,
                  alt: 'App Settings tab with field image picker',
                  label: 'App Settings',
                }}
                caption="Robot Settings (left) — frame and motion defaults. App Settings (right) — season field image for the path editor, previews, and simulator."
              />
            </Section>

            <Section id="paths" title="Paths Overview" subtitle="Bezier drive paths saved as JSON" icon={Route}>
              <p>Paths are standalone trajectories you plug into variant autos. Each path is a sequence of waypoints connected by smooth Bezier curves.</p>
              <DocScreenshot
                src={DOC_IMAGES.pathsList}
                alt="My Autonomous Paths list"
                caption="My Autonomous Paths — path cards with field previews."
              />
              <h3 className="text-sm font-bold text-foreground mt-6 mb-2">Creating a path</h3>
              <p>Home → <strong>Create a Path</strong> → <strong>New Path</strong>. Choose whether the path starts on the <strong>Left (L)</strong> or <strong>Right (R)</strong> side. This is metadata only — it does not move your waypoints.</p>
              <NewPathPopupScreen />
              <Callout color="violet" title="What does start side mean?">
                The L/R flag tells your robot code which side of the field the path was designed for. The simulator can mirror display for the opposite side without changing saved coordinates.
              </Callout>
            </Section>

            <Section id="editor" title="Path Editor" subtitle="Toolbar, canvas, and sidebar" icon={MousePointer2}>
              <DocScreenshot
                src={DOC_IMAGES.pathEditor}
                alt="Path editor with field canvas and sidebar"
                caption="Path editor — Drive to Neutral Zone with toolbar, field canvas, and sidebar."
              />
              <ul className="list-disc ml-5 space-y-2 text-sm">
                <li><strong>Add (+):</strong> Click the field to place waypoints in order.</li>
                <li><strong>Select:</strong> Drag waypoints, control handles, and rotation dots. Right-click to delete.</li>
                <li><strong>L / R toggle:</strong> Sets start side metadata only — waypoints stay put.</li>
                <li><strong>Simulation bar:</strong> Scrub or play the path at the bottom of the canvas.</li>
              </ul>
            </Section>

            <Section id="waypoints" title="Waypoints & Bezier Curves" subtitle="Shape your path with control points" icon={MapPin}>
              <WaypointsBezierSection />
              <ul className="list-disc ml-5 space-y-2 text-sm">
                <li><strong>Start / End</strong> — green and red robot icons with rotation control.</li>
                <li><strong>Mid waypoints</strong> — blue dots; support optional parameters.</li>
                <li><strong>End point</strong> — red robot icon; supports optional parameters (e.g. distance tolerance for the final stop).</li>
                <li><strong>Control handles</strong> — white dots on a straight dashed line through the waypoint (180° locked).</li>
                <li><strong>Insert waypoint</strong> — sidebar button subdivides a segment.</li>
              </ul>
            </Section>

            <Section id="optional-params" title="Optional Parameters" subtitle="Per-waypoint tuning on mid and end points" icon={Sparkles}>
              <p>Select any waypoint except the start point, then expand <strong>Optional Parameters</strong> in the sidebar. The end point is a common place to set distance tolerance for how precisely the robot must finish the path.</p>
              <OptionalParamsScreen />
              <Callout color="yellow" title="Avoid overly tight tolerances">
                Extremely small <strong>distance tolerance</strong> or <strong>heading tolerance</strong> values can cause the robot to hunt back and forth around a waypoint — oscillating in position or rotation without settling. If you see jitter or repeated corrections at a stop, loosen these tolerances slightly before tuning other parameters.
              </Callout>
              <div className="space-y-6 mt-6">
                {OPTIONAL_PARAMS.map(p => (
                  <div key={p.key} className="rounded-xl border border-border bg-card/50 p-4">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{p.key}</code>
                      <span className="text-sm font-semibold text-foreground">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        default: {String(p.default)}{p.unit ? ` (${p.unit})` : ''}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 mb-1">{p.summary}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.detail}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="rotation" title="Rotation Targets" subtitle="Change heading mid-path" icon={RotateCcw}>
              <DocSideBySide
                src={DOC_IMAGES.rotationTargets}
                alt="Rotation Targets sidebar panel"
                objectPosition="50% 50%"
                imageHeight={200}
                imageWidth="sm:w-40"
              >
                <ul className="list-disc ml-4 space-y-1.5">
                  <li>Add targets from the sidebar <strong>Rotation Targets</strong> section.</li>
                  <li>Progress slider positions the target along the path; cyan ghost robot previews heading.</li>
                  <li>Cyan dots on the canvas are draggable for quick adjustment.</li>
                </ul>
              </DocSideBySide>
            </Section>

            <Section id="triggers" title="Subsystem Triggers" subtitle="Fire commands along the path" icon={Zap}>
              <DocSideBySide
                src={DOC_IMAGES.subsystemTriggers}
                alt="Subsystem Triggers sidebar panel"
                objectPosition="50% 50%"
                imageHeight={200}
                imageWidth="sm:w-40"
              >
                <ul className="list-disc ml-4 space-y-1.5">
                  <li>Configure subsystems first (see Subsystems section).</li>
                  <li>Set progress, subsystem, and command for each trigger.</li>
                  <li>Stars on the canvas mark trigger locations during editing.</li>
                </ul>
              </DocSideBySide>
            </Section>

            <Section id="constraints" title="Constraints" subtitle="Speed limits for this path" icon={Settings2}>
              <p>Override max velocity and max acceleration per path. Untouched values inherit from <Link to="/settings" className="text-primary hover:underline">Robot Settings</Link>.</p>
              <ConstraintsPanelScreen />
            </Section>

            <Section id="duplicate" title="Duplicating Paths" subtitle="Same side or mirrored opposite" icon={Copy}>
              <p>Hover a path card → copy icon → choose <strong>Same Side</strong> or <strong>Opposite Side</strong> (mirrors geometry across the field horizontal midline and flips L↔R).</p>
              <DuplicatePathPopupScreen />
            </Section>

            <Section id="skeleton" title="Skeleton Autos" subtitle="Reusable command templates" icon={Code2}>
              <DocScreenshot
                src={DOC_IMAGES.skeletonBuilder}
                alt="Skeleton auto builder"
                caption="Skeleton auto editor — command sequence with frozen Add Command panel."
              />
              <ul className="list-disc ml-5 space-y-1 text-sm mt-4">
                <li><strong>Path slot</strong>, <strong>Subsystem command</strong>, <strong>Wait</strong>, <strong>Parallel group</strong></li>
                <li>Add Command panel stays fixed while scrolling the sequence.</li>
              </ul>
            </Section>

            <Section id="variant" title="Variant Autos" subtitle="Runnable autos linked to a skeleton" icon={Play}>
              <DocScreenshot
                src={DOC_IMAGES.variantAuto}
                alt="Variant auto editor"
                caption="Variant auto — fill path slots, adjust waits, and preview the runnable auto."
              />
              <ul className="list-disc ml-5 space-y-1 text-sm mt-4">
                <li>Assign paths to path slots; skip or adjust waits per command.</li>
                <li>Renaming a skeleton updates <code className="font-mono bg-secondary px-1 rounded">skeletonId</code> in linked variants.</li>
              </ul>
            </Section>

            <Section id="simulate" title="Simulate & Preview" subtitle="Watch your variant auto run" icon={Play}>
              <DocScreenshot
                src={DOC_IMAGES.simulator}
                alt="Auto simulator"
                caption="Simulate & Preview — field view, L/R and Blue/Red toggles, playback bar, and command list."
              />
              <ul className="list-disc ml-5 space-y-1 text-sm">
                <li><strong>Left / Right</strong> — flip display for opposite field side.</li>
                <li><strong>Blue / Red</strong> — alliance perspective.</li>
                <li><strong>Command list</strong> — scrollable; click to seek.</li>
              </ul>
            </Section>

            <Section id="subsystems" title="Subsystems" subtitle="Robot mechanisms and commands" icon={Cpu}>
              <DocScreenshot
                src={DOC_IMAGES.subsystemConfig}
                alt="Subsystem configuration"
                caption="Configure Subsystems — define mechanisms, commands, and visual bindings."
              />
              <ul className="list-disc ml-5 space-y-1 text-sm mt-4">
                <li><Link to="/subsystem-config" className="text-primary hover:underline">Configure Subsystems</Link> from the home screen.</li>
                <li>Visual bindings show/hide robot overlays during simulation.</li>
              </ul>
              <Callout color="green" title="Team workflow">
                Commit your <code className="font-mono bg-secondary px-1 rounded">{PROJECT_FOLDER_NAME}/</code> folder to git so the whole team shares paths and autos.
              </Callout>
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}
