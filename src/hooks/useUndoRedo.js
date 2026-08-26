import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_COALESCE_MS = 350;
const HISTORY_LIMIT = 100;

function isTextEntryTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(target.type);
}

/**
 * Snapshot-based undo/redo.
 *
 * `record()` stores the state as it was *before* the edit about to be applied. Rapid
 * edits collapse into one entry: explicitly between beginGesture()/endGesture() (canvas
 * drags, slider scrubs), otherwise by a short time window so typing doesn't flood the stack.
 */
export function useUndoRedo({ getSnapshot, applySnapshot, coalesceMs = DEFAULT_COALESCE_MS }) {
  const past = useRef([]);
  const future = useRef([]);
  const lastRecordAt = useRef(0);
  const gestureDepth = useRef(0);
  const gestureRecorded = useRef(false);
  const [depths, setDepths] = useState({ past: 0, future: 0 });

  const syncDepths = useCallback(() => {
    setDepths({ past: past.current.length, future: future.current.length });
  }, []);

  const record = useCallback((options = {}) => {
    const force = options.force ?? false;
    if (!force) {
      if (gestureDepth.current > 0) {
        if (gestureRecorded.current) return;
      } else if (past.current.length > 0 && Date.now() - lastRecordAt.current < coalesceMs) {
        lastRecordAt.current = Date.now();
        return;
      }
    }
    const snapshot = getSnapshot();
    if (snapshot == null) return;
    past.current.push(snapshot);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    lastRecordAt.current = Date.now();
    if (gestureDepth.current > 0) gestureRecorded.current = true;
    syncDepths();
  }, [getSnapshot, coalesceMs, syncDepths]);

  const beginGesture = useCallback(() => { gestureDepth.current += 1; }, []);
  const endGesture = useCallback(() => {
    gestureDepth.current = Math.max(0, gestureDepth.current - 1);
    if (gestureDepth.current === 0) {
      gestureRecorded.current = false;
      lastRecordAt.current = 0;
    }
  }, []);

  const step = useCallback((from, to) => {
    if (from.current.length === 0) return;
    const current = getSnapshot();
    const target = from.current.pop();
    if (current != null) to.current.push(current);
    lastRecordAt.current = 0;
    gestureRecorded.current = false;
    syncDepths();
    applySnapshot(target, current);
  }, [getSnapshot, applySnapshot, syncDepths]);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    lastRecordAt.current = 0;
    syncDepths();
  }, [syncDepths]);

  // Safety net: a slider released outside its own element never fires its onMouseUp, which
  // would otherwise leave a gesture open and silently swallow every later edit.
  useEffect(() => {
    const clearGesture = () => {
      gestureDepth.current = 0;
      gestureRecorded.current = false;
      lastRecordAt.current = 0;
    };
    window.addEventListener('mouseup', clearGesture);
    return () => window.removeEventListener('mouseup', clearGesture);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      // Inside a text field the browser's own undo stack is the expected behaviour.
      if (isTextEntryTarget(e.target)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return {
    record,
    beginGesture,
    endGesture,
    undo,
    redo,
    reset,
    canUndo: depths.past > 0,
    canRedo: depths.future > 0,
  };
}
