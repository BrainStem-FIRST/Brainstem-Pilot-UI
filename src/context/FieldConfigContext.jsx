import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getFieldsCatalog,
  resolveField,
  setActiveField,
  getFieldDimensions,
  getFieldImageUrl,
  getDefaultFieldId,
  getFieldBounds,
} from '../lib/fieldConfig';
import { readEntity, writeEntity } from '../lib/dataService';
import { useLeague } from './LeagueContext';

const FieldConfigContext = createContext(null);

export function FieldConfigProvider({ children }) {
  const { projectType, loadedFromProject, projectRevision } = useLeague();
  const [selectedFieldId, setSelectedFieldIdState] = useState(() => getDefaultFieldId('frc'));
  const [loaded, setLoaded] = useState(false);
  const userChangedRef = useRef(false);

  useEffect(() => {
    if (!loadedFromProject) return;
    const resolved = resolveField(selectedFieldId, projectType);
    if (!resolved || resolved.id === selectedFieldId) return;
    setSelectedFieldIdState(resolved.id);
    setActiveField(resolved.id, projectType);
  }, [projectType, loadedFromProject, selectedFieldId]);

  useEffect(() => {
    let cancelled = false;
    userChangedRef.current = false;
    readEntity('AppSettings').then(data => {
      if (cancelled || userChangedRef.current) {
        if (!cancelled) setLoaded(true);
        return;
      }
      let settings = data;
      if (Array.isArray(data) && data.length > 0) settings = data[0];
      const id = settings?.selectedFieldId ?? getDefaultFieldId(projectType);
      const resolved = resolveField(id, projectType);
      setSelectedFieldIdState(resolved?.id ?? getDefaultFieldId(projectType));
      setActiveField(resolved?.id, projectType);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled && !userChangedRef.current) {
        const fallback = getDefaultFieldId(projectType);
        setActiveField(fallback, projectType);
      }
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [projectType, projectRevision]);

  const activeField = useMemo(
    () => resolveField(selectedFieldId, projectType),
    [selectedFieldId, projectType],
  );

  useEffect(() => {
    if (loaded) setActiveField(selectedFieldId, projectType);
  }, [selectedFieldId, projectType, loaded]);

  const setSelectedFieldId = useCallback(async (fieldId) => {
    userChangedRef.current = true;
    const resolved = resolveField(fieldId, projectType);
    if (!resolved) return;
    setSelectedFieldIdState(resolved.id);
    setActiveField(resolved.id, projectType);
    try {
      await writeEntity('AppSettings', { selectedFieldId: resolved.id, projectType });
    } catch (err) {
      console.error('Failed to save app settings:', err);
    }
  }, [projectType]);

  const value = useMemo(() => {
    const dims = getFieldDimensions(activeField);
    const bounds = getFieldBounds(activeField);
    return {
      fields: getFieldsCatalog(projectType),
      activeField,
      selectedFieldId,
      setSelectedFieldId,
      widthM: dims.widthM,
      heightM: dims.heightM,
      bounds,
      unit: dims.unit,
      imageUrl: getFieldImageUrl(activeField),
      loaded,
      projectType,
    };
  }, [activeField, selectedFieldId, setSelectedFieldId, loaded, projectType]);

  return (
    <FieldConfigContext.Provider value={value}>
      {children}
    </FieldConfigContext.Provider>
  );
}

export function useFieldConfig() {
  const ctx = useContext(FieldConfigContext);
  if (!ctx) {
    throw new Error('useFieldConfig must be used within FieldConfigProvider');
  }
  return ctx;
}
