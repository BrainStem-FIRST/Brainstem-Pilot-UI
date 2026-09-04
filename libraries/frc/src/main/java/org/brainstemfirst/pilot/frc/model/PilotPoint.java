package org.brainstemfirst.pilot.frc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A shared field pose, loaded from {@code points/<id>.point.json}.
 *
 * <p>{@link #rotation} on this record is the robot heading at the point and is shared by every
 * slot that references it. Any {@code rotation} carried on a point <em>slot</em> is stale and
 * is deliberately ignored.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotPoint {
    public int schemaVersion;
    public String id;
    public String name;

    public double x;
    public double y;

    /** Robot heading at this point, in {@code headingUnit} (degrees). */
    public double rotation;

    public String units;
    public String coordinateSystem;
    public String headingUnit;
}
