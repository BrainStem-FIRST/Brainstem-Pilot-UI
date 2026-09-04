package org.brainstemfirst.pilot.frc.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A self-contained Brainstem Pilot auto, loaded from {@code autos/<id>.auto.json}.
 *
 * <p>Replaces the old skeleton + variant + override triple: every slot the auto runs is
 * listed inline, in execution order, in {@link #sequence}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotAuto {
    public int schemaVersion;
    public String id;
    public String name;
    public List<PilotSlot> sequence;

    /** Envelope metadata. {@code units} drives distance conversion; see {@link PathParser#unitScale}. */
    public String units;
    public String coordinateSystem;
    public String headingUnit;
}
