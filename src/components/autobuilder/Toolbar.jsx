import React from 'react';
import { MousePointer2, Plus, Eye, EyeOff, Trash2, ChevronLeft, Undo2, Redo2 } from 'lucide-react';

export default function Toolbar({
  tool, setTool, showVelocity, setShowVelocity,
  pathName, setPathName, onClear, waypointCount, onBack,
  startSide, onStartSideChange, showStartSide = true,
  onUndo, onRedo, canUndo, canRedo,
}) {

  const tools = [
    { id: 'add', icon: Plus, label: 'Add Waypoint (click to place)' },
    { id: 'select', icon: MousePointer2, label: 'Select & Drag' },
  ];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border z-10 flex-shrink-0">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mr-1">
        <ChevronLeft className="w-4 h-4" />
        <span className="text-xs font-medium">Paths</span>
      </button>

      <div className="w-px h-5 bg-border" />

      {/* Path name — grows to fill space */}
      <input
        data-path-name
        value={pathName}
        onChange={e => setPathName(e.target.value)}
        className="bg-transparent border-none outline-none text-sm font-semibold text-foreground flex-1 min-w-0 max-w-xs focus:bg-secondary/50 px-1.5 py-0.5 rounded transition-colors"
        placeholder="Path name..."
      />

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        <button
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          title="Redo (Ctrl+Y)"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      {showStartSide && (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">Start</span>
            <div className="flex gap-0.5 bg-secondary/50 rounded-lg p-0.5">
              {['L', 'R'].map((side) => (
                <button
                  key={side}
                  title={side === 'L' ? 'Path created for left side of field (metadata only)' : 'Path created for right side of field (metadata only)'}
                  onClick={() => onStartSideChange?.(side)}
                  className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                    startSide === side
                      ? 'bg-primary text-primary-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-5 bg-border" />
        </>
      )}

      {/* Tool buttons */}
      <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
        {tools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => setTool(id)}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-all ${
              tool === id
                ? 'bg-primary text-primary-foreground shadow'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border" />

      <button
        title={showVelocity ? 'Hide Velocity' : 'Show Velocity'}
        onClick={() => setShowVelocity(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
          showVelocity ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}
      >
        {showVelocity ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">Velocity</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-num">{waypointCount} pts</span>
        <button
          title="Clear all waypoints"
          onClick={onClear}
          disabled={waypointCount === 0}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>
    </div>
  );
}