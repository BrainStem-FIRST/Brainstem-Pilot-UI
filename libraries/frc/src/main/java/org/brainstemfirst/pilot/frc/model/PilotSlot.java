package org.brainstemfirst.pilot.frc.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * One entry in a {@link PilotAuto}'s sequence.
 *
 * <p>Only {@code path} and {@code point} slots are positional — they move the robot and
 * advance the running pose used to chain the next positional slot. {@code subsystem},
 * {@code wait} and {@code parallel} slots pass the running pose through unchanged.
 *
 * <p>A slot with {@code skip == true} contributes no motion and no time.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotSlot {
    public String id;
    public String type;
    public boolean skip;

    /** {@code path} slots: file stem under {@code paths/}. */
    public String pathId;

    /** {@code point} slots: file stem under {@code points/}. */
    public String pointId;

    /** {@code subsystem} slots (and parallel sub-entries). */
    public String subsystemName;
    public String commandName;

    /** {@code wait} slots, in seconds. */
    public double duration;

    /** Wait duration for a sub-entry inside a {@code parallel} slot. */
    public double defaultWait;

    /** {@code parallel} slots: entries run simultaneously. */
    public List<PilotSlot> parallelSubs;

    /** {@code point} slots: per-slot follower overrides, same shape as a waypoint's {@code params}. */
    public JsonNode params;

    /** {@code point} slots: triggers fired along the connecting segment into this point. */
    public List<SlotTrigger> subsystemTriggers;

    public boolean isType(String candidate) {
        return candidate.equalsIgnoreCase(type);
    }

    /** True for slot types that move the robot and therefore advance the chain pose. */
    public boolean isPositional() {
        return isType("path") || isType("point");
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SlotTrigger {
        public String id;
        public String subsystemName;
        public String commandName;

        /** 0-1 along the segment this trigger belongs to. */
        public double progress = -1.0;

        /**
         * Distance along the segment, in the enclosing file's {@code units} — despite the name,
         * this is NOT guaranteed to be metres. Scaled via {@link PathParser#unitScale}.
         */
        public double arcLengthM = -1.0;

        /** A trigger missing either name is still being authored — skip it rather than throwing. */
        public boolean isComplete() {
            return subsystemName != null && !subsystemName.isBlank()
                && commandName != null && !commandName.isBlank();
        }
    }
}
