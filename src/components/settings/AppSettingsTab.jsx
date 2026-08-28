import React from 'react';
import { Check, Lock } from 'lucide-react';
import { getFieldImageUrl } from '../../lib/fieldConfig';
import { useFieldConfig } from '../../context/FieldConfigContext';
import { useLeague } from '../../context/LeagueContext';
import { hasProjectDir } from '../../lib/projectFolder';

function LeagueBadge() {
  const { projectType, canChangeLeague } = useLeague();
  const label = projectType === 'ftc' ? 'FTC' : 'FRC';

  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold text-foreground">Project League</h2>
        {!canChangeLeague && hasProjectDir() && (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" title="Locked while a project folder is open" />
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {canChangeLeague
          ? 'Change FRC/FTC on the Welcome page before opening a project folder.'
          : 'League is locked while a project folder is open.'}
      </p>
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
        projectType === 'ftc'
          ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
          : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
      }`}>
        {label}
      </span>
    </div>
  );
}

export default function AppSettingsTab() {
  const { fields, selectedFieldId, setSelectedFieldId } = useFieldConfig();

  return (
    <div>
      <LeagueBadge />
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Field Image</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Choose which season field to use in the path editor, path previews, and simulator.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((field) => {
            const selected = field.id === selectedFieldId;
            const previewUrl = getFieldImageUrl(field);
            const aspectClass = field.league === 'ftc' ? 'aspect-square' : 'aspect-[2.4/1]';
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => setSelectedFieldId(field.id)}
                className={`text-left rounded-lg border overflow-hidden transition-all ${
                  selected
                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                    : 'border-border bg-secondary/20 hover:border-primary/40'
                }`}
              >
                <div className={`${aspectClass} bg-[#0d1117] overflow-hidden relative`}>
                  <img
                    src={previewUrl}
                    alt={field.name}
                    className="w-full h-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  {selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground">{field.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{field.season} season</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
