import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export default function SimulationBar({ trajectory, isSimulating, simProgress, onSimulate, onStop, onReset, onScrub }) {
  if (!trajectory) return null;

  const currentTime = simProgress * trajectory.totalTime;

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-card/95 backdrop-blur border-t border-border px-4 py-2.5">
      {/* Restart from beginning */}
      <button
        onClick={onReset}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Restart"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={isSimulating ? onStop : onSimulate}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shrink-0 ${
          isSimulating
            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
            : 'bg-primary text-primary-foreground hover:bg-primary/80'
        }`}
        title={isSimulating ? 'Pause' : 'Play'}
      >
        {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={simProgress}
        onChange={e => { onStop?.(); onScrub(parseFloat(e.target.value)); }}
        className="flex-1 accent-primary"
      />

      {/* Time display */}
      <span className="text-xs font-num text-muted-foreground w-20 text-right shrink-0">
        {currentTime.toFixed(2)}s / {trajectory.totalTime.toFixed(2)}s
      </span>
    </div>
  );
}