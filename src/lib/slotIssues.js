// Everything in an Auto that is half-filled-in and would generate broken (or silently
// no-op) code. These are warnings, not errors — a slot mid-edit is a normal state, so
// nothing here blocks saving; the sequence list just flags it with a hazard badge.
//
// A subsystem reference can be wrong in two different ways, and they read differently to
// whoever has to fix it: *blank* means "you haven't picked one yet", while *dangling* means
// "the subsystem you picked was renamed or deleted out from under this slot".

/** Commands configured for `name`, or null when no such subsystem exists any more. */
function commandsFor(subsystems, name) {
  const sys = (subsystems ?? []).find(s => s.name === name);
  return sys ? (sys.commands ?? []) : null;
}

/**
 * Check one subsystem+command pair — a slot, a parallel branch, or a trigger all reference
 * one the same way. Pass `label` to name the thing being checked; without it the messages
 * stand alone, for a badge sitting right next to the offending dropdown.
 */
export function subsystemRefIssues(ref, subsystems, label) {
  const at = label ? `${label}: ` : '';
  const subsystemName = ref?.subsystemName ?? '';
  const commandName = ref?.commandName ?? '';

  if (!subsystemName) return [{ message: `${at}no subsystem selected` }];

  const commands = commandsFor(subsystems, subsystemName);
  if (commands == null) {
    return [{ message: `${at}subsystem "${subsystemName}" no longer exists` }];
  }

  if (!commandName) return [{ message: `${at}no command selected` }];
  if (!commands.some(c => c.name === commandName)) {
    return [{ message: `${at}"${subsystemName}" has no command "${commandName}"` }];
  }
  return [];
}

/**
 * Triggers fire a subsystem command partway along a path or connecting segment, so an
 * unfinished one just never fires. `triggers` may live on a path record or on a point slot.
 */
export function triggerIssues(triggers, subsystems) {
  return (triggers ?? []).flatMap((trig, i) =>
    subsystemRefIssues(trig, subsystems, `Trigger ${i + 1} (@ ${Math.round((trig.progress ?? 0) * 100)}%)`));
}

/**
 * Warnings for a single sequence slot.
 *
 * @param slot     the sequence slot
 * @param context  `{ subsystems, record, gap, lengthUnit }` — `record` is the resolved path
 *                 or point behind a positional slot (null when the reference is dangling),
 *                 and `gap` is this slot's entry from `chainLinkGaps`.
 * @returns array of `{ message }`, most structural first. Empty means the slot is complete.
 */
export function slotIssues(slot, { subsystems = [], record = null, gap = null, lengthUnit = 'm' } = {}) {
  const issues = [];
  if (!slot) return issues;

  switch (slot.type) {
    case 'path': {
      if (!record) {
        issues.push({ message: 'No path assigned to this slot' });
        break;
      }
      const waypoints = record.waypoints ?? [];
      if (waypoints.length < 2) {
        issues.push({ message: `"${record.name}" needs at least 2 waypoints to drive` });
      }
      issues.push(...triggerIssues(record.subsystemTriggers, subsystems));
      break;
    }
    case 'point': {
      if (!record) {
        issues.push({ message: 'No point assigned to this slot' });
        break;
      }
      issues.push(...triggerIssues(slot.subsystemTriggers, subsystems));
      break;
    }
    case 'subsystem':
      issues.push(...subsystemRefIssues(slot, subsystems, 'Action'));
      break;
    case 'parallel': {
      const subs = slot.parallelSubs ?? [];
      if (subs.length === 0) {
        issues.push({ message: 'Parallel group has no sub-commands' });
        break;
      }
      subs.forEach((sub, i) => {
        if (sub.type === 'wait') {
          if (!(sub.defaultWait > 0)) issues.push({ message: `Branch ${i + 1}: wait is 0s` });
          return;
        }
        issues.push(...subsystemRefIssues(sub, subsystems, `Branch ${i + 1}`));
      });
      break;
    }
    case 'wait':
      if (!(slot.duration > 0)) issues.push({ message: 'Wait duration is 0s' });
      break;
    default:
      break;
  }

  if (gap) {
    issues.push({
      message: `Start doesn't match ${gap.previousName}`,
      detail: `Starts ${gap.distance.toFixed(2)} ${lengthUnit} away from where "${gap.previousName}" ends.`,
    });
  }

  return issues;
}

/** One-line tooltip for a slot's warnings — the badge itself is just the hazard icon. */
export function issueSummary(issues) {
  return (issues ?? []).map(i => `• ${i.message}${i.detail ? ` — ${i.detail}` : ''}`).join('\n');
}
