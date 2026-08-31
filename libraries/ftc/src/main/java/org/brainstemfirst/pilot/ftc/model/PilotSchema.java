package org.brainstemfirst.pilot.ftc.model;

import java.io.IOException;

/**
 * Envelope validation shared by every Brainstem Pilot record.
 *
 * <p>Each record carries a {@code schemaVersion} plus unit metadata. A file from a newer
 * schema than this reader understands, or one authored in units other than inches and
 * degrees, is refused rather than misread — a metres-valued path silently consumed as
 * inches would drive the robot roughly 39x short.
 */
public final class PilotSchema {
    /** Highest schema version this reader understands. */
    public static final int SUPPORTED_VERSION = 2;

    public static final String EXPECTED_UNITS = "in";
    public static final String EXPECTED_HEADING_UNIT = "deg";

    private PilotSchema() {}

    /**
     * @param schemaVersion the record's version; {@code 0} means the field was absent, which
     *                      is treated as compatible so pre-envelope files still load.
     */
    public static void validate(String description, int schemaVersion, String units, String headingUnit)
            throws IOException {
        if (schemaVersion > SUPPORTED_VERSION) {
            throw new IOException(description + " uses schemaVersion " + schemaVersion
                    + ", newer than this reader supports (" + SUPPORTED_VERSION + "). Update the robot code.");
        }
        if (units != null && !units.isEmpty() && !EXPECTED_UNITS.equalsIgnoreCase(units)) {
            throw new IOException(description + " is authored in units '" + units
                    + "'; this reader only handles '" + EXPECTED_UNITS + "'.");
        }
        if (headingUnit != null && !headingUnit.isEmpty() && !EXPECTED_HEADING_UNIT.equalsIgnoreCase(headingUnit)) {
            throw new IOException(description + " is authored in heading unit '" + headingUnit
                    + "'; this reader only handles '" + EXPECTED_HEADING_UNIT + "'.");
        }
    }
}
