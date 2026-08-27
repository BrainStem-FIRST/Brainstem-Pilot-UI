import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, FolderPlus, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { UNFILED, UNFILED_LABEL, normalizeFolderName } from '../../lib/folders';

/**
 * In-app name prompt. Rendered through a portal so it escapes the card it was opened from —
 * a record card is itself clickable, and the picker sits inside overflow-hidden containers.
 */
function FolderNameDialog({ title, initial = '', confirmLabel = 'Create', onSubmit, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const submit = () => {
    const name = normalizeFolderName(draft);
    if (!name) return;
    onSubmit(name);
  };

  return createPortal(
    <div
      onClick={e => { e.stopPropagation(); onCancel(); }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
    >
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-xl border border-border bg-card shadow-2xl p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <FolderPlus className="w-4 h-4 text-amber-400" /> {title}
        </h2>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Folder name"
          className="bg-secondary/60 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            Cancel
          </button>
          <button onClick={submit} disabled={!normalizeFolderName(draft)}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Toolbar button that asks for a name and hands back a cleaned one. */
export function NewFolderButton({ onCreate, className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all ${className}`}
      >
        <FolderPlus className="w-3.5 h-3.5" /> New Folder
      </button>
      {open && (
        <FolderNameDialog
          title="New folder"
          onSubmit={name => { setOpen(false); onCreate(name); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Per-record "move to folder" picker. Choosing the last option asks for a new folder and
 * moves the record there in one step, so filing something never needs two trips.
 */
export function FolderPicker({ value, folders, onMove, onCreateFolder }) {
  const NEW = ' new';
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        value={normalizeFolderName(value)}
        onClick={e => e.stopPropagation()}
        onChange={e => {
          e.stopPropagation();
          if (e.target.value === NEW) setCreating(true);
          else onMove(e.target.value);
        }}
        title="Move to folder"
        className="max-w-full bg-secondary/50 border border-border rounded px-1.5 py-0.5 text-[10px] text-muted-foreground outline-none focus:border-primary hover:text-foreground transition-colors"
      >
        <option value={UNFILED}>{UNFILED_LABEL}</option>
        {folders.map(f => <option key={f} value={f}>{f}</option>)}
        <option value={NEW}>New folder…</option>
      </select>
      {creating && (
        <FolderNameDialog
          title="New folder"
          confirmLabel="Create & move"
          onSubmit={name => {
            setCreating(false);
            onCreateFolder?.(name);
            onMove(name);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}

/**
 * Collapsible heading for one folder's records. The Unfiled bucket (`name === UNFILED`) is a
 * catch-all rather than a real folder, so it has no rename or delete.
 */
export function FolderSection({ group, count, collapsed, onToggle, onRename, onDelete, children }) {
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const isUnfiled = group.name === UNFILED;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const Icon = collapsed ? Folder : FolderOpen;

  return (
    <section className="mb-5">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center gap-2 mb-2.5 pb-1.5 border-b border-border/60"
      >
        <button onClick={onToggle} className="flex items-center gap-1.5 min-w-0 text-muted-foreground hover:text-foreground transition-colors">
          <Chevron className="w-3.5 h-3.5 shrink-0" />
          <Icon className={`w-3.5 h-3.5 shrink-0 ${isUnfiled ? 'text-muted-foreground/60' : 'text-amber-400/80'}`} />
          <span className={`text-xs font-semibold truncate ${isUnfiled ? 'text-muted-foreground' : 'text-foreground'}`}>
            {isUnfiled ? UNFILED_LABEL : group.name}
          </span>
          <span className="text-[10px] text-muted-foreground/70 shrink-0">{count}</span>
        </button>
        {!isUnfiled && (
          <div className={`ml-auto flex items-center gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={() => setRenaming(true)} title="Rename folder"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onDelete} title="Delete folder (its contents move to Unfiled)"
              className="p-1 rounded text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      {!collapsed && children}
      {renaming && (
        <FolderNameDialog
          title="Rename folder"
          initial={group.name}
          confirmLabel="Rename"
          onSubmit={name => { setRenaming(false); if (name !== group.name) onRename(name); }}
          onCancel={() => setRenaming(false)}
        />
      )}
    </section>
  );
}
