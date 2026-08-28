import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { getProjectDir, setProjectDir, hasProjectDir, initializeProjectFolder } from '../lib/projectFolder';
import { clearTabs } from '../lib/workspaceTabs';
import { projectFolderPath } from '../lib/projectLocation';
import { useLeague } from '../context/LeagueContext';
import AppLogo from '../components/AppLogo';

const MEDIA = import.meta.env.BASE_URL + 'media/';

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

/**
 * The clip for whichever league is selected. Keyed on the league so switching remounts the
 * element and autoplay restarts from the first frame; one panel at full height rather than
 * two stacked halves, so the toggle visibly does something and the footage gets the room.
 *
 * The file may be missing, so a failed load falls back to a labelled panel rather than the
 * black rectangle a broken <video> leaves behind.
 */
function LeaguePreview({ league }) {
  const [failed, setFailed] = useState(false);

  // A new league means a new file: clear the previous failure before judging this one.
  useEffect(() => setFailed(false), [league]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[hsl(var(--field-bg))]">
      {!failed ? (
        <video
          key={league}
          className="absolute inset-0 w-full h-full object-cover"
          src={`${MEDIA}${league}.mp4`}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">{league.toUpperCase()} preview</span>
        </div>
      )}

      {/* Keeps the caption legible over whatever frame is on screen. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/85 to-transparent" />
      <div className="absolute bottom-5 left-6 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
          {league.toUpperCase()} field
        </span>
      </div>
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const { projectType, setProjectType, canChangeLeague, loadLeagueFromProject } = useLeague();

  // Arriving here with a project already open means the guard let it through by mistake, or
  // the user hit Back — either way there is nothing to gate.
  useEffect(() => {
    if (hasProjectDir()) navigate('/home', { replace: true });
  }, [navigate]);

  const openProject = async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Please use Chrome or Edge, or install the desktop app.');
      return;
    }
    setOpening(true);
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      // Open tabs name Autos by a slug that only resolves inside one project, so switching
      // projects has to close them. Reopening the *same* folder keeps them.
      if (!(await isSameProject(dirHandle))) clearTabs();
      setProjectDir(dirHandle);
      await initializeProjectFolder(projectType);
      await loadLeagueFromProject();
      try {
        localStorage.setItem('lastProjectFolder', dirHandle.name);
      } catch (e) {
        // localStorage unavailable; that's ok
      }
      navigate('/home', { replace: true });
    } catch (err) {
      if (err.name === 'SecurityError') {
        // Silently ignore — only works when the app is opened in a standalone browser tab
      } else if (err.name !== 'AbortError') {
        throw err;
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      <div className="hidden lg:block lg:w-1/2 border-r border-border">
        <LeaguePreview league={projectType} />
      </div>

      <div className="flex-1 flex items-center justify-center px-10 py-12">
        <div className="w-full max-w-md">
          <AppLogo className="w-28 h-28" />
          <h1 className="mt-8 text-[46px] leading-[1.05] font-semibold text-foreground">
            BrainSTEM Pilot
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Autonomous path planning for FRC and FTC.
          </p>

          <div className="mt-12">
            <h2 className="label-eyebrow mb-2.5">League</h2>
            <div
              className={`inline-flex rounded-md border p-0.5 ${
                canChangeLeague ? 'border-border bg-secondary/60' : 'border-border/60 bg-secondary/30 opacity-60 pointer-events-none'
              }`}
            >
              {['ftc', 'frc'].map(id => (
                <button
                  key={id}
                  type="button"
                  disabled={!canChangeLeague}
                  onClick={() => setProjectType(id)}
                  className={`px-6 py-2 rounded text-sm font-semibold tracking-wide transition-colors ${
                    projectType === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {id.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
              Pick a league when starting a new project — the preview follows your choice.
              Opening an existing project uses the league already saved in it.
            </p>
          </div>

          <button
            onClick={openProject}
            disabled={opening}
            className="mt-10 w-full h-12 rounded-md bg-primary text-primary-foreground text-[15px] font-semibold hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <FolderOpen className="w-[18px] h-[18px]" />
            {opening ? 'Opening…' : 'Open project'}
          </button>
          <p className="mt-3 text-[13px] text-muted-foreground text-center truncate font-num">
            {projectFolderPath(projectType)}
          </p>
        </div>
      </div>
    </div>
  );
}
