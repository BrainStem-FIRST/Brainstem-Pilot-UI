import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Route, Layers, Cpu, Settings2, ArrowRight, FolderCheck, ChevronDown } from 'lucide-react';
import { getProjectDir, hasProjectDir } from '../lib/projectFolder';
import { pickAndBindProject } from '../lib/openProject';
import { projectFolderPath } from '../lib/projectLocation';
import { useLeague } from '../context/LeagueContext';
import AppLogo from '../components/AppLogo';

// Each destination owns one of the three blues: a flat fill for the card and the bright
// version of the same hue for the icon and the link.
const destinations = [
  {
    icon: Layers,
    title: 'Autos',
    blurb: 'Build and play back routines.',
    href: '/string-builder',
    fill: '--brand-1-fill',
    accent: '--brand-1',
  },
  {
    icon: Route,
    title: 'Paths & Points',
    blurb: 'Every saved path and point.',
    href: '/library',
    fill: '--brand-2-fill',
    accent: '--brand-2',
  },
  {
    icon: Cpu,
    title: 'Subsystems',
    blurb: 'Mechanisms and their commands.',
    href: '/subsystem-config',
    fill: '--brand-3-fill',
    accent: '--brand-3',
  },
];

function DestinationCard({ icon: Icon, title, blurb, href, fill, accent }) {
  return (
    <Link
      to={href}
      style={/** @type {React.CSSProperties} */ ({
        '--fill': `var(${fill})`,
        '--accent': `var(${accent})`,
        backgroundColor: 'hsl(var(--fill))',
        borderColor: 'hsl(var(--accent) / 0.25)',
      })}
      className="group relative flex flex-col h-full min-h-[300px] rounded-lg border p-7
                 transition-colors duration-200
                 hover:bg-[hsl(var(--accent)/0.16)] hover:border-[hsl(var(--accent)/0.55)]"
    >
      {/* The icon carries the card. It takes the whole middle so a tall tile doesn't read as
          a half-empty box, and it is the only thing at full hue strength. */}
      <div className="flex-1 flex items-center justify-center">
        <Icon
          className="w-24 h-24 group-hover:scale-105 transition-transform duration-200"
          strokeWidth={1.25}
          style={{ color: 'hsl(var(--accent))' }}
        />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1.5 text-[13.5px] text-foreground/60">{blurb}</p>
        <span
          className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: 'hsl(var(--accent))' }}
        >
          Open
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  const [projectName, setProjectName] = useState(null);
  const [opening, setOpening] = useState(false);
  const { projectType, loadLeagueFromProject } = useLeague();

  useEffect(() => {
    if (hasProjectDir()) setProjectName(getProjectDir().name);
  }, []);

  const changeProject = async () => {
    setOpening(true);
    try {
      const dirHandle = await pickAndBindProject({ projectType, loadLeagueFromProject });
      if (dirHandle) setProjectName(dirHandle.name);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
        <button
          type="button"
          onClick={changeProject}
          disabled={opening}
          title="Change project folder"
          className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 max-w-[320px]
                     rounded-md px-1.5 py-1 -ml-1.5 hover:text-foreground hover:bg-secondary
                     transition-colors disabled:opacity-60"
        >
          <FolderCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">{opening ? 'Opening…' : (projectName ?? 'Project')}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </button>
        <div className="flex-1" />
        <span className="px-2 py-1 rounded border border-border text-[11px] font-semibold text-muted-foreground">
          {projectType.toUpperCase()}
        </span>
        <Link
          to="/settings"
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Settings
        </Link>
      </header>

      <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-8 py-10 min-h-0">
        <div className="shrink-0 flex flex-col items-center text-center">
          <AppLogo className="w-14 h-14" />
          <h1 className="mt-4 text-[30px] leading-none font-semibold text-foreground">
            BrainSTEM Pilot
          </h1>
          <p className="mt-3 text-[13px] text-muted-foreground font-num">
            {projectType.toUpperCase()} project · {projectFolderPath(projectType)}
          </p>
        </div>

        {/* The row takes whatever height is left, so the cards stand tall instead of leaving
            a band of empty background beneath them. */}
        <div className="mt-9 flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-5">
          {destinations.map(d => (
            <DestinationCard key={d.title} {...d} />
          ))}
        </div>
      </main>
    </div>
  );
}
