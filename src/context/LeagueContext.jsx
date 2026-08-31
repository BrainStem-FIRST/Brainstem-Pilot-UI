import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { hasProjectDir } from '../lib/projectFolder';
import { readEntity } from '../lib/dataService';

const LEAGUE_STORAGE_KEY = 'brainstem_league_preference';

export const LEAGUES = ['frc', 'ftc'];

function readStoredPreference() {
  try {
    const raw = localStorage.getItem(LEAGUE_STORAGE_KEY);
    if (raw === 'frc' || raw === 'ftc') return raw;
  } catch { /* ignore */ }
  return 'frc';
}

function writeStoredPreference(league) {
  try {
    localStorage.setItem(LEAGUE_STORAGE_KEY, league);
  } catch { /* ignore */ }
}

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const [projectType, setProjectTypeState] = useState(readStoredPreference);
  const [loadedFromProject, setLoadedFromProject] = useState(false);
  const [projectRevision, setProjectRevision] = useState(0);

  const canChangeLeague = !hasProjectDir();

  const setProjectType = useCallback((league) => {
    if (!LEAGUES.includes(league)) return;
    if (hasProjectDir()) return;
    setProjectTypeState(league);
    writeStoredPreference(league);
  }, []);

  const loadLeagueFromProject = useCallback(async () => {
    if (!hasProjectDir()) {
      setLoadedFromProject(true);
      return;
    }
    try {
      const settings = await readEntity('AppSettings');
      const resolved = settings?.projectType === 'ftc' ? 'ftc' : 'frc';
      setProjectTypeState(resolved);
    } catch {
      setProjectTypeState('frc');
    }
    setLoadedFromProject(true);
    setProjectRevision(n => n + 1);
  }, []);

  useEffect(() => {
    if (!hasProjectDir()) {
      setProjectTypeState(readStoredPreference());
      setLoadedFromProject(true);
    }
  }, []);

  const value = {
    projectType,
    setProjectType,
    canChangeLeague,
    loadLeagueFromProject,
    loadedFromProject,
    projectRevision,
    isFrc: projectType === 'frc',
    isFtc: projectType === 'ftc',
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeague must be used within LeagueProvider');
  return ctx;
}
