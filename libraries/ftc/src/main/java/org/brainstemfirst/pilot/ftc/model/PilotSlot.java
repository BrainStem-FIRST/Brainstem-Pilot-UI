package org.brainstemfirst.pilot.ftc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * One entry in a {@link PilotAuto} sequence. A slot is one of
 * {@code path}, {@code point}, {@code subsystem}, {@code wait} or {@code parallel};
 * only the fields relevant to its type are populated.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotSlot {
    public String id;
    public String type;
    public boolean skip;

    /** type = path */
    public String pathId;

    /** type = point */
    public String pointId;
    public JsonNode params;
    public List<SlotTrigger> subsystemTriggers;

    /** type = subsystem, and parallel sub-entries */
    public String subsystemName;
    public String commandName;

    /** type = wait (seconds). {@code defaultWait} is the parallel sub-entry spelling. */
    public double duration;
    public double defaultWait;

    /** type = parallel */
    public List<PilotSlot> parallelSubs;

    public boolean isType(String candidate) {
        return candidate.equalsIgnoreCase(type);
    }

    public boolean isPositional() {
        return isType("path") || isType("point");
    }

    public double waitSeconds() {
        return duration > 0 ? duration : defaultWait;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SlotTrigger {
        public String id;
        public String subsystemName;
        public String commandName;
        public double progress;
        public double arcLengthM = -1.0;

        public boolean isComplete() {
            return subsystemName != null && !subsystemName.isEmpty()
                    && commandName != null && !commandName.isEmpty();
        }

        public double resolveDistance(double totalLength) {
            return arcLengthM >= 0 ? arcLengthM : progress * totalLength;
        }
    }
}
