import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Code2, ChevronRight, Zap, Settings2, Cpu, FolderOpen, FolderCheck, BookOpen, Route, Gauge, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { getProjectDir, setProjectDir, hasProjectDir, initializeProjectFolder } from '../lib/projectFolder';
import { useLeague } from '../context/LeagueContext';

const cards = [
{
  icon: Code2,
  title: 'Build an Auto',
  description: 'Create and edit your autonomous routines in one workspace — paths, points, subsystem commands, and live simulation preview.',
  href: '/string-builder',
  cta: 'Open Auto Workspace',
  color: 'from-violet-500/25 to-purple-500/5',
  border: 'border-violet-500/30',
  iconBg: 'bg-violet-500/15',
  iconColor: 'text-violet-400',
  badge: 'Auto Builder',
  badgeColor: 'bg-violet-500/10 text-violet-400',
},
{
  icon: Cpu,
  title: 'Configure Subsystems',
  description: 'Define your robot subsystems, add commands for each, and bind them to visual drawings. Used throughout the auto builder.',
  href: '/subsystem-config',
  cta: 'Open Configurator',
  color: 'from-yellow-500/25 to-orange-500/5',
  border: 'border-yellow-500/30',
  iconBg: 'bg-yellow-500/15',
  iconColor: 'text-yellow-400',
  badge: 'Subsystems',
  badgeColor: 'bg-yellow-500/10 text-yellow-400',
},
];

const stats = [
  { icon: Route, label: 'Path Planning', value: 'Bézier curves' },
  { icon: Gauge, label: 'Live Simulation', value: 'Real-time playback' },
  { icon: Layers, label: 'Multi-League', value: 'FRC & FTC' },
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
    <div className="h-screen w-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background decoration — full-bleed mesh gradient + grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-violet-500/[0.06]" />
        <motion.div
          className="absolute top-[-10%] left-[-5%] w-[38rem] h-[38rem] bg-primary/10 rounded-full blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[-15%] right-[-5%] w-[34rem] h-[34rem] bg-violet-500/10 rounded-full blur-[120px]"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 top-1/3 w-64 h-64 bg-yellow-500/5 rounded-full blur-[100px]"
        />
        <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground text-sm tracking-tight">BrainSTEM Pilot</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/docs" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <BookOpen className="w-3.5 h-3.5" />
            Documentation
          </Link>
          <Link to="/settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <Settings2 className="w-3.5 h-3.5" />
            Settings
          </Link>
          <div className="w-px h-5 bg-border mx-1" />
          <LeagueToggle
            projectType={projectType}
            setProjectType={setProjectType}
            canChangeLeague={canChangeLeague}
            projectName={projectName}
          />
          <button
            onClick={openProject}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              projectName
                ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            {projectName ? <FolderCheck className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
            {projectName ? projectName : 'Open Project'}
          </button>
        </div>
      </header>

      {/* Main hero — fills remaining viewport */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 sm:mb-12">

          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary/60" />
            <span className="font-semibold text-primary uppercase tracking-[0.2em] text-xs sm:text-sm">Autonomous Builder</span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-primary/60" />
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-foreground tracking-tight mb-4 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text">
            BrainSTEM Pilot
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Plan drive paths, sequence auto commands, and preview full routines on the field —
            built for FRC and FTC teams.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-4xl relative">
          {cards.map((card, i) =>
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 * i }}>

            <Link
              to={card.href}
              className={`relative rounded-2xl bg-gradient-to-br ${card.color} border ${card.border} p-7 flex flex-col gap-4 group hover:scale-[1.015] transition-all duration-200 hover:shadow-xl hover:shadow-primary/10 block backdrop-blur-sm h-full`}>
              <CardContent card={card} />
            </Link>
          </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex items-center gap-6 sm:gap-10 flex-wrap justify-center">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-secondary/60 border border-border flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-foreground leading-tight">{value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 flex items-center justify-center py-4 px-6 shrink-0 border-t border-border/50">
        <p className="text-xs text-muted-foreground">BrainSTEM Pilot · FRC/FTC Auto Building Tool</p>
      </motion.footer>
    </div>
  );
}

function CardContent({ card }) {
  return (
    <>
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>
          <card.icon className="w-6 h-6" />
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
          {card.badge}
        </span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground mb-2">{card.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 group-hover:text-foreground transition-colors mt-auto">
        {card.cta}
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </>
  );
}
