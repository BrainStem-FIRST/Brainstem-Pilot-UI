package org.brainstemfirst.pilot.ftc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** A self-contained Brainstem Pilot auto: {@code autos/<id>.auto.json}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotAuto {
    public int schemaVersion;
    public String id;
    public String name;
    public List<PilotSlot> sequence;

    public String units;
    public String headingUnit;
    public String coordinateSystem;
}
