package org.brainstemfirst.pilot.ftc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A shared named pose: {@code points/<id>.point.json}.
 *
 * <p>{@code rotation} is the robot heading at this point and is shared by every slot that
 * references it — there is no per-slot heading override in the current format.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class PilotPoint {
    public int schemaVersion;
    public String id;
    public String name;
    public double x;
    public double y;
    public double rotation;

    public String units;
    public String headingUnit;
}
