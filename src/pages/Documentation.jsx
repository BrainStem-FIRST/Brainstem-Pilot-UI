import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FRC_PROJECT_PATH, FTC_PROJECT_PATH, PROJECT_FOLDER_NAME } from '../lib/projectLocation';
import {
  ChevronLeft, BookOpen, Route, Code2, Play, Cpu, FolderOpen,
  MapPin, Sparkles, RotateCcw, Zap, Settings2, Copy, MousePointer2,
  Layers, Link2, AlertTriangle, Folder,
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
  { id: 'autos', label: 'Autos & the Sequence', icon: Layers },
  { id: 'points', label: 'Points', icon: MapPin },
  { id: 'chaining', label: 'How Slots Connect', icon: Link2 },
  { id: 'warnings', label: 'Warnings', icon: AlertTriangle },
  { id: 'folders', label: 'Folders', icon: Folder },
  { id: 'simulate', label: 'Simulate & Preview', icon: Play },
  { id: 'subsystems', label: 'Subsystems', icon: Cpu },
  { id: 'frc', label: 'FRC Specifics', icon: Cpu },
  { id: 'ftc', label: 'FTC Specifics', icon: Cpu },
  { id: 'files', label: 'File Format', icon: Code2 },
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
      <header className="border-b border-border bg-card pl-14 pr-4 py-3 flex items-center gap-3 shrink-0 z-20">
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
                <li>Default files are created: <code className="text-xs font-mono bg-secondary px-1 rounded">robot_settings.json</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">app_settings.json</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">subsystem_config.json</code>, and the <code className="text-xs font-mono bg-secondary px-1 rounded">paths/</code>, <code className="text-xs font-mono bg-secondary px-1 rounded">points/</code> and <code className="text-xs font-mono bg-secondary px-1 rounded">autos/</code> folders as you save into them.</li>
                <li>Opening a project from an older version migrates its <code className="text-xs font-mono bg-secondary px-1 rounded">skeletons/</code> and <code className="text-xs font-mono bg-secondary px-1 rounded">variants/</code> into <code className="text-xs font-mono bg-secondary px-1 rounded">autos/</code>, then moves the originals to <code className="text-xs font-mono bg-secondary px-1 rounded">legacy/</code>. Nothing reads them after that; delete the folder once the autos look right.</li>
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
              <p>Paths are standalone trajectories you drop into an Auto. Each path is a sequence of waypoints connected by smooth Bezier curves, saved as its own file and <strong>shared</strong> — the same path can appear in several Autos, and editing it changes all of them.</p>
              <DocScreenshot
                src={DOC_IMAGES.pathsList}
                alt="Path & Point Index"
                caption="Path & Point Index — every saved path and point, with field previews and where each is used."
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

            <Section id="autos" title="Autos & the Sequence" subtitle="One Auto, one file, one ordered list" icon={Layers}>
              <p>An Auto is a single ordered <strong>sequence</strong> of slots, saved as one self-contained file in <code className="font-mono bg-secondary px-1 rounded">autos/</code>. There is no separate template to keep in sync — what you see in the list is what runs.</p>
              <DocScreenshot
                src={DOC_IMAGES.autoWorkspace}
                alt="Auto workspace with a sequence of path, point, subsystem and wait slots"
                caption="Auto workspace — the sequence on the left, the field in the middle, and the selected slot's settings on the right."
              />
              <Callout color="violet" title="Replaces skeletons and variants">
                Older versions split an Auto into a shared <em>skeleton</em> of commands plus a <em>variant</em> of per-command overrides. That is gone. Opening an old project migrates it automatically and files the originals under <code className="font-mono bg-secondary px-1 rounded">legacy/</code>.
              </Callout>
              <h3 className="text-sm font-bold text-foreground mt-6 mb-2">Slot types</h3>
              <ul className="list-disc ml-5 space-y-1.5 text-sm">
                <li><strong>Path</strong> — drives a saved path. Click its name in the list to rename it; the rename follows into every Auto that uses it.</li>
                <li><strong>Point</strong> — drives to a saved field position. See <a href="#points" className="text-primary hover:underline">Points</a>.</li>
                <li><strong>Subsystem</strong> — runs one command on one subsystem, then moves on.</li>
                <li><strong>Wait</strong> — pauses for a number of seconds.</li>
                <li><strong>Parallel</strong> — runs several sub-commands at once. Each branch picks a subsystem and then a command under it.</li>
              </ul>
              <h3 className="text-sm font-bold text-foreground mt-6 mb-2">Working with the sequence</h3>
              <ul className="list-disc ml-5 space-y-1.5 text-sm">
                <li>Drag from the palette to insert at a position, or drag a slot by its grip to reorder.</li>
                <li><strong>Skip</strong> takes a slot out of the run without deleting it — it contributes no motion and no time.</li>
                <li>Selecting a Path or Point slot opens it on the field for editing, right there in the workspace.</li>
                <li>Undo and redo cover the sequence <em>and</em> the shared paths and points, since dragging a waypoint edits a path rather than the Auto.</li>
              </ul>
              <Callout color="yellow" title="Autos cannot share a name">
                An Auto&rsquo;s filename comes from its name, so two Autos with the same name would overwrite each other. Renaming to a name already in use is refused, and the name bar pauses saving until you pick another.
              </Callout>
            </Section>

            <Section id="points" title="Points" subtitle="A named field position the robot drives to" icon={MapPin}>
              <p>A Point is a saved pose — position and heading — that you can drop into any Auto. Like paths, points are <strong>shared</strong>: move or turn one and every slot using it moves with it, in every Auto.</p>
              <Callout color="primary" title="Heading belongs to the Point">
                A Point&rsquo;s rotation is part of the Point, not of the slot. Using the same Point three times in one Auto gives you the same position <em>and</em> the same heading all three times. If you need two different headings, make two Points.
              </Callout>
              <ul className="list-disc ml-5 space-y-1.5 text-sm mt-4">
                <li>A path ending into a Point is <strong>not</strong> joined to it — the robot drives a connecting segment from where the path ends to the Point.</li>
                <li>A path that comes <em>after</em> a Point starts on it, heading included.</li>
                <li>Rename a Point from its slot in the sequence, or from the Path &amp; Point Index.</li>
              </ul>
            </Section>

            <Section id="chaining" title="How Slots Connect" subtitle="Where one slot ends, the next begins" icon={Link2}>
              <p>Only <strong>Path</strong> and <strong>Point</strong> slots have a position. Subsystem, Wait and Parallel slots pass the robot&rsquo;s current pose straight through — they never move it.</p>
              <ul className="list-disc ml-5 space-y-1.5 text-sm mt-3">
                <li>The first positional slot starts wherever it was drawn.</li>
                <li>Every other joint is <strong>live</strong>: drag a path&rsquo;s end and the next path&rsquo;s start moves with it — position and heading together — and that change is written into the next path&rsquo;s file, in every Auto that chains them. Drag a start and the previous path&rsquo;s end follows.</li>
                <li>Only the connecting waypoint moves. The rest of each path keeps the shape you drew.</li>
              </ul>
              <Callout color="yellow" title="Reordering can leave a gap">
                Moving a slot gives it new neighbours without moving any coordinates, so its start may no longer match where the previous slot ends. The slot is flagged with a warning rather than having its path silently dragged across the field.
              </Callout>
            </Section>

            <Section id="warnings" title="Warnings" subtitle="Small amber triangles on anything unfinished" icon={AlertTriangle}>
              <p>A hazard triangle marks a slot that would not do what you meant. It is a warning, not an error — a half-filled slot is a normal state mid-edit and nothing blocks saving.</p>
              <DocScreenshot
                src={DOC_IMAGES.warnings}
                alt="Sequence with amber hazard triangles on an unassigned subsystem slot and a zero-second wait"
                caption="An unfinished Subsystem slot and a 0s Wait, each flagged with the reason underneath."
              />
              <ul className="list-disc ml-5 space-y-1.5 text-sm mt-3">
                <li>A Subsystem slot, Parallel branch, or trigger with no subsystem or no command selected.</li>
                <li>A subsystem or command that no longer exists — renamed or deleted in Configure Subsystems after the slot was set up.</li>
                <li>A Path or Point slot whose record is missing, or a path with fewer than two waypoints.</li>
                <li>A Wait set to 0s, or a Parallel group with no sub-commands.</li>
                <li>A slot whose start does not match where the previous one ends.</li>
              </ul>
              <p className="text-sm mt-3">Hover the triangle for the full list. The Subsystem Triggers header carries one too, so a trigger that would never fire is visible even when the section is collapsed.</p>
            </Section>

            <Section id="folders" title="Folders" subtitle="Grouping for Autos, paths and points" icon={Folder}>
              <DocScreenshot
                src={DOC_IMAGES.autosList}
                alt="Build an Auto list with folder grouping"
                caption="The Auto list — New Folder groups your routines; each card carries a folder dropdown."
              />
              <p className="mt-4">Use <strong>New Folder</strong> in the Auto list or the Path &amp; Point Index to group records. Move a record with the folder dropdown on its card; the last option creates a new folder and files it there in one step.</p>
              <Callout color="primary" title="Folders are labels, not directories">
                Every record stays in its own flat file under <code className="font-mono bg-secondary px-1 rounded">autos/</code>, <code className="font-mono bg-secondary px-1 rounded">paths/</code> or <code className="font-mono bg-secondary px-1 rounded">points/</code> and simply carries a <code className="font-mono bg-secondary px-1 rounded">folder</code> name. Nothing your robot code reads has to change, and moving a record is one field, not a file move.
              </Callout>
              <p className="text-sm mt-3">Deleting a folder moves its contents to <strong>Unfiled</strong>; it never deletes records. Searching narrows within folders rather than flattening them.</p>
            </Section>

            <Section id="simulate" title="Simulate & Preview" subtitle="Play the whole routine on the field" icon={Play}>
              <p>Playback lives in the Auto workspace — there is no separate simulator mode to switch into. The bar along the bottom plays the whole sequence, and the slot currently running is highlighted in the list.</p>
              <ul className="list-disc ml-5 space-y-1.5 text-sm mt-3">
                <li><strong>Play / Stop / Replay</strong>, plus a scrubber you can drag to any moment.</li>
                <li>Each slot shows its own duration, and the bar shows elapsed and total time.</li>
                <li>Clicking the sequence panel returns you to editing.</li>
                <li><strong>Blue / Red</strong> and, in FRC, <strong>L / R</strong> change the preview only — your saved coordinates never move.</li>
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
            </Section>

            <Section id="frc" title="FRC Specifics" subtitle="What differs on the FRC side" icon={Cpu}>
              <ul className="list-disc ml-5 space-y-1.5 text-sm">
                <li><strong>Project folder</strong> — <code className="font-mono bg-secondary px-1 rounded">{FRC_PROJECT_PATH}</code>. It sits inside <code className="font-mono bg-secondary px-1 rounded">deploy/</code> so it ships to the roboRIO with your code; nothing has to be copied.</li>
                <li><strong>Units</strong> — metres, metres per second, and degrees. Coordinates are <code className="font-mono bg-secondary px-1 rounded">frc-bottom-left</code>: origin at the bottom-left corner of the field.</li>
                <li><strong>Start side</strong> — each path carries an L or R flag. It is metadata: it does not move your waypoints, it tells your robot code which side the path was drawn for so it can mirror at runtime.</li>
                <li><strong>Mirroring</strong> — the L/R and Blue/Red toggles preview the opposite side and alliance without changing saved coordinates. Your robot code does the real mirroring when it builds the auto.</li>
                <li><strong>No generated code</strong> — FRC autos are chosen at runtime, so nothing is generated per Auto. Your code enumerates <code className="font-mono bg-secondary px-1 rounded">autos/</code> and builds by name.</li>
              </ul>
              <Callout color="green" title="Team workflow">
                Commit your <code className="font-mono bg-secondary px-1 rounded">{PROJECT_FOLDER_NAME}/</code> folder to git so the whole team shares paths and autos.
              </Callout>
            </Section>

            <Section id="ftc" title="FTC Specifics" subtitle="OpModes, assets, and inches" icon={Cpu}>
              <ul className="list-disc ml-5 space-y-1.5 text-sm">
                <li><strong>Project folder</strong> — <code className="font-mono bg-secondary px-1 rounded">{FTC_PROJECT_PATH}</code>. FTC has no deploy directory, so it lives in TeamCode next to your Java.</li>
                <li><strong>Units</strong> — inches, inches per second, and degrees. Coordinates are <code className="font-mono bg-secondary px-1 rounded">pedro-center</code>: origin at the centre of the field.</li>
                <li><strong>An OpMode per Auto</strong> — saving an Auto writes a matching Java file into <code className="font-mono bg-secondary px-1 rounded">opmodeAutos/</code>, so it appears on the Driver Station. Renaming an Auto renames the file; deleting one removes it. Files are marked <em>AUTO-GENERATED</em> — do not edit them by hand, your changes will be overwritten.</li>
                <li><strong>Assets</strong> — a Gradle task copies the JSON into <code className="font-mono bg-secondary px-1 rounded">src/main/assets/</code> before each build, which is where the robot reads it. Build after editing, or the robot runs the previous version.</li>
              </ul>
              <Callout color="yellow" title="Names must differ by more than punctuation">
                An OpMode class name strips punctuation, so <em>Nine Ball (123)</em> and <em>Nine Ball 123</em> would both become <code className="font-mono bg-secondary px-1 rounded">NineBall123Auto</code> and one Auto would be unreachable on the Driver Station. Renaming into that collision is refused.
              </Callout>
            </Section>

            <Section id="files" title="File Format" subtitle="What your robot code reads" icon={Code2}>
              <p>Each record is one JSON file, indented so it diffs cleanly in git. Every file carries the same envelope, so a reader never has to guess what the numbers mean:</p>
              <ul className="list-disc ml-5 space-y-1.5 text-sm mt-3">
                <li><code className="font-mono bg-secondary px-1 rounded">schemaVersion</code> — the format version. Refuse a file newer than your parser understands rather than misreading it.</li>
                <li><code className="font-mono bg-secondary px-1 rounded">units</code>, <code className="font-mono bg-secondary px-1 rounded">headingUnit</code>, <code className="font-mono bg-secondary px-1 rounded">speedUnit</code>, <code className="font-mono bg-secondary px-1 rounded">accelUnit</code>, <code className="font-mono bg-secondary px-1 rounded">coordinateSystem</code> — read these rather than assuming a league.</li>
                <li><code className="font-mono bg-secondary px-1 rounded">updated_date</code> — stamped on every write.</li>
              </ul>
              <h3 className="text-sm font-bold text-foreground mt-6 mb-2">Folders</h3>
              <ul className="list-disc ml-5 space-y-1.5 text-sm">
                <li><code className="font-mono bg-secondary px-1 rounded">paths/&lt;Name&gt;.path.json</code> — <code className="font-mono bg-secondary px-1 rounded">waypoints[]</code>, <code className="font-mono bg-secondary px-1 rounded">constraints</code>, <code className="font-mono bg-secondary px-1 rounded">subsystemTriggers[]</code>, <code className="font-mono bg-secondary px-1 rounded">rotationTargets[]</code>.</li>
                <li><code className="font-mono bg-secondary px-1 rounded">points/&lt;Name&gt;.point.json</code> — <code className="font-mono bg-secondary px-1 rounded">x</code>, <code className="font-mono bg-secondary px-1 rounded">y</code>, <code className="font-mono bg-secondary px-1 rounded">rotation</code>.</li>
                <li><code className="font-mono bg-secondary px-1 rounded">autos/&lt;Name&gt;.auto.json</code> — <code className="font-mono bg-secondary px-1 rounded">sequence[]</code> of slots, each with <code className="font-mono bg-secondary px-1 rounded">id</code>, <code className="font-mono bg-secondary px-1 rounded">type</code> and <code className="font-mono bg-secondary px-1 rounded">skip</code>.</li>
              </ul>
              <Callout color="primary" title="Constraints always hold real numbers">
                A path that uses the project defaults still writes them out, with <code className="font-mono bg-secondary px-1 rounded">usingDefaults: true</code> recording that they were inherited. The file stands on its own — your robot code never has to know what the editor&rsquo;s defaults were.
              </Callout>
              <p className="text-sm mt-4">A file&rsquo;s name is derived from the record&rsquo;s name, and so is its id — which is why renaming a record retargets every Auto that referenced it, and why two records of the same kind cannot share a name.</p>
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}
