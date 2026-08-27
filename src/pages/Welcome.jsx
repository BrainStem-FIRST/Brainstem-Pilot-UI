import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Code2, Library, ChevronRight, Zap, Settings2, Cpu, FolderOpen, FolderCheck, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { getProjectDir, setProjectDir, hasProjectDir, initializeProjectFolder } from '../lib/projectFolder';
import { clearTabs } from '../lib/workspaceTabs';
import { projectFolderPath } from '../lib/projectLocation';
import { useLeague } from '../context/LeagueContext';
import AppLogo from '../components/AppLogo';

const cards = [
{
  icon: Code2,
  title: 'Build an Auto',
  description: 'Sequence paths, points, waits and subsystem commands, then play the whole routine back on the field.',
  href: '/string-builder',
  cta: 'Open Auto Workspace',
  color: 'from-violet-500/20 to-purple-500/10',
  border: 'border-violet-500/30',
  iconColor: 'text-violet-400',
  badge: 'Auto Sequencer',
  badgeColor: 'bg-violet-500/10 text-violet-400',
},
{
  icon: Library,
  title: 'Path & Point Index',
  description: 'Every saved path and point in one list — rename, reposition or delete, and every Auto follows along.',
  href: '/library',
  cta: 'Open Index',
  color: 'from-blue-500/20 to-cyan-500/10',
  border: 'border-blue-500/30',
  iconColor: 'text-blue-400',
  badge: 'Paths & Points',
  badgeColor: 'bg-blue-500/10 text-blue-400',
},
{
  icon: Cpu,
  title: 'Configure Subsystems',
  description: 'Define your robot subsystems, add commands for each, and bind them to visual drawings. Used throughout the auto builder.',
  href: '/subsystem-config',
  cta: 'Open Configurator',
  color: 'from-yellow-500/20 to-orange-500/10',
  border: 'border-yellow-500/30',
  iconColor: 'text-yellow-400',
  badge: 'Subsystems',
  badgeColor: 'bg-yellow-500/10 text-yellow-400',
},
];


function LeagueToggle({ projectType, setProjectType, canChangeLeague, projectName }) {
  const leagues = [
    { id: 'frc', label: 'FRC' },
    { id: 'ftc', label: 'FTC' },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={`flex gap-0.5 rounded-lg p-0.5 border ${
          canChangeLeague
            ? 'bg-secondary/80 border-border'
            : 'bg-secondary/40 border-border/60 opacity-60 pointer-events-none'
        }`}
        title={canChangeLeague ? 'Select league for your next project' : 'League is locked while a project folder is open'}
      >
        {leagues.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={!canChangeLeague}
            onClick={() => setProjectType(id)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
              projectType === id
                ? 'bg-primary text-primary-foreground shadow'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!canChangeLeague && projectName && (
        <span className="text-[10px] text-muted-foreground">
          {projectType.toUpperCase()} · {projectName}
        </span>
      )}
    </div>
  );
}


/**
 * Is `handle` the project that is already open? Prefers `isSameEntry` (exact, even for two
 * folders with the same name); falls back to the last-opened folder name on a cold start,
 * where there is no previous handle to compare against.
 */
async function isSameProject(handle) {
  const previous = getProjectDir();
  if (previous) {
    try { return await previous.isSameEntry(handle); } catch { return false; }
  }
  try { return localStorage.getItem('lastProjectFolder') === handle.name; } catch { return false; }
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
      // Open tabs name Autos by a slug that only resolves inside one project, so switching
      // projects has to close them. Reopening the *same* folder keeps them.
      if (!(await isSameProject(dirHandle))) clearTabs();
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Documentation + Settings top-left */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <Link to="/docs" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
          <BookOpen className="w-3.5 h-3.5" />
          Documentation
        </Link>
        <Link to="/settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
          <Settings2 className="w-3.5 h-3.5" />
          Settings
        </Link>
      </div>
      {/* League toggle top-right */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <LeagueToggle
          projectType={projectType}
          setProjectType={setProjectType}
          canChangeLeague={canChangeLeague}
          projectName={projectName}
        />
      </div>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10 relative mt-10">

        <AppLogo className="w-24 h-24 mx-auto mb-5 shadow-lg shadow-primary/20" />
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-primary uppercase tracking-widest text-base">AUTONOMOUS BUILDER </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-3">BrainSTEM Pilot</h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          Plan drive paths, sequence auto commands, and preview full routines on the field (built for FRC and FTC teams).
        </p>
      </motion.div>

      {/* Project folder — the one thing that has to happen before anything else works */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-5xl relative mb-5">
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
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
                : `Point at ${projectFolderPath(projectType)} in your robot code to load and save your files.`}
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
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl relative">
        {cards.map((card, i) =>
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 * i }}>

            <Link
              to={card.href}
              className={`relative h-full rounded-2xl bg-gradient-to-br ${card.color} border ${card.border} p-6 flex flex-col gap-4 group hover:scale-[1.02] transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 block`}>

              <CardContent card={card} />
            </Link>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-10 flex items-center gap-4">

        <p className="text-base bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]">BrainSTEM Pilot · FRC/FTC Auto Building Tool</p>
      </motion.div>
    </div>);

}

function CardContent({ card }) {
  return (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-card/50 flex items-center justify-center ${card.iconColor}`}>
          <card.icon className="w-5 h-5" />
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
          {card.badge}
        </span>
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground mb-1.5">{card.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 group-hover:text-foreground transition-colors mt-auto">
        {card.cta}
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </>);

}
