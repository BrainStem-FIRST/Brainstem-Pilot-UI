import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Code2, ArrowRight, Zap, Settings2, Cpu, FolderOpen, FolderCheck, BookOpen, Library,
} from 'lucide-react';
import { getProjectDir, setProjectDir, hasProjectDir, initializeProjectFolder } from '../lib/projectFolder';
import { useLeague } from '../context/LeagueContext';

const cards = [
  {
    icon: Code2,
    title: 'Build an Auto',
    description: 'Sequence paths, points, waits and subsystem commands, then play the whole routine back on the field.',
    href: '/string-builder',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
    hover: 'hover:border-violet-500/50',
    arrowHover: 'group-hover:text-violet-400',
  },
  {
    icon: Library,
    title: 'Path & Point Index',
    description: 'Every saved path and point in one list — rename, reposition or delete, and every Auto follows along.',
    href: '/library',
    accent: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    hover: 'hover:border-sky-500/50',
    arrowHover: 'group-hover:text-sky-400',
  },
  {
    icon: Cpu,
    title: 'Configure Subsystems',
    description: 'Define mechanisms and their commands once, then trigger them from anywhere in an auto routine.',
    href: '/subsystem-config',
    accent: 'text-yellow-400',
    accentBg: 'bg-yellow-500/10',
    hover: 'hover:border-yellow-500/50',
    arrowHover: 'group-hover:text-yellow-400',
  },
];

function LeagueToggle({ projectType, setProjectType, canChangeLeague }) {
  return (
    <div
      className={`flex gap-0.5 rounded-lg p-0.5 border ${
        canChangeLeague ? 'bg-secondary/80 border-border' : 'bg-secondary/40 border-border/60 opacity-60 pointer-events-none'
      }`}
      title={canChangeLeague ? 'Select league for your next project' : 'League is locked while a project folder is open'}
    >
      {['frc', 'ftc'].map(id => (
        <button
          key={id}
          type="button"
          disabled={!canChangeLeague}
          onClick={() => setProjectType(id)}
          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
            projectType === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function Welcome() {
  const [projectName, setProjectName] = useState(null);
  const { projectType, setProjectType, canChangeLeague, loadLeagueFromProject } = useLeague();

  useEffect(() => {
    if (hasProjectDir()) setProjectName(getProjectDir().name);
  }, []);

  const openProject = async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Please use Chrome or Edge.');
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setProjectDir(dirHandle);
      setProjectName(dirHandle.name);
      await initializeProjectFolder(projectType);
      await loadLeagueFromProject();
      try {
        localStorage.setItem('lastProjectFolder', dirHandle.name);
      } catch (e) {
        // localStorage unavailable; that's ok
      }
    } catch (err) {
      if (err.name === 'SecurityError') {
        // Silently ignore — only works when the app is opened in a standalone browser tab
      } else if (err.name !== 'AbortError') {
        throw err;
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/70">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold text-foreground text-sm tracking-tight">BrainSTEM Pilot</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link to="/docs" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Docs</span>
            </Link>
            <Link to="/settings" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            <div className="w-px h-5 bg-border mx-1" />
            <LeagueToggle projectType={projectType} setProjectType={setProjectType} canChangeLeague={canChangeLeague} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 sm:py-16">
        <div>
          <p className="font-mono text-xs text-primary tracking-wider mb-3">
            {projectType.toUpperCase()} · TRAJECTORY &amp; AUTO PLANNER
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight max-w-2xl leading-[1.15]">
            Draw the path. Sequence the auto. Ship the JSON.
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-4 max-w-xl leading-relaxed">
            A visual editor for autonomous routines. Everything you build is written straight into your
            robot project as plain JSON, so the whole team edits the same files.
          </p>
        </div>

        {/* Project folder — the one thing that has to happen before anything else works */}
        <div className="mt-8 flex items-center gap-3 flex-wrap rounded-lg border border-border bg-card px-4 py-3">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${projectName ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground'}`}>
            {projectName ? <FolderCheck className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs font-semibold text-foreground">
              {projectName ? `Project folder: ${projectName}` : 'No project folder open'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {projectName
                ? 'Paths, points and autos are saved here as you edit.'
                : 'Point at deploy/brainstemPilotAuto/ in your robot code to load and save your files.'}
            </p>
          </div>
          <button
            onClick={openProject}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border shrink-0 ${
              projectName
                ? 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                : 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25'
            }`}
          >
            {projectName ? 'Change folder' : 'Open project'}
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((card, i) => (
            <Link
              key={card.title}
              to={card.href}
              className={`group h-full flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors ${card.hover}`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-9 h-9 rounded-md ${card.accentBg} ${card.accent} flex items-center justify-center`}>
                  <card.icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{card.title}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{card.description}</p>
              </div>
              <ArrowRight className={`w-4 h-4 mt-auto text-muted-foreground/60 transition-all group-hover:translate-x-0.5 ${card.arrowHover}`} />
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-border/70">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
          <p className="text-[11px] text-muted-foreground">BrainSTEM Pilot · auto planning for FRC &amp; FTC</p>
          <Link to="/docs" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Read the documentation →
          </Link>
        </div>
      </footer>
    </div>
  );
}
