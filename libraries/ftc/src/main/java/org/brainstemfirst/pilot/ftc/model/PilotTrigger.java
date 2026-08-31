package org.brainstemfirst.pilot.ftc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A subsystem command fired partway along a positional segment.
 *
 * <p>Despite its name, {@code arcLengthM} is expressed in the owning file's {@code units}
 * (inches for FTC), not metres.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotTrigger {
    public String id;
    public String subsystemName;
    public String commandName;
    public double progress;
    public double arcLengthM = -1.0;

    /** The UI can persist a trigger before its subsystem/command have been chosen. */
    public boolean isComplete() {
        return subsystemName != null && !subsystemName.isEmpty()
                && commandName != null && !commandName.isEmpty();
    }

    /** Distance along the segment in file units, resolving {@code progress} when needed. */
    public double resolveDistance(double totalLength) {
        return arcLengthM >= 0 ? arcLengthM : progress * totalLength;
    }
}
