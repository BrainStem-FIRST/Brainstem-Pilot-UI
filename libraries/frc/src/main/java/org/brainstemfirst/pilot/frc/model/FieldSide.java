package org.brainstemfirst.pilot.frc.model;

/** Blue-field starting side for an auto path (left or right of center). */
public enum FieldSide {
    LEFT,
    RIGHT;

    public static FieldSide fromStartSideKey(String key) {
        if (key == null) {
            return RIGHT;
        }
        return key.equalsIgnoreCase("L") || key.equalsIgnoreCase("Left") ? LEFT : RIGHT;
    }

    public FieldSide opposite() {
        return this == LEFT ? RIGHT : LEFT;
    }
}
