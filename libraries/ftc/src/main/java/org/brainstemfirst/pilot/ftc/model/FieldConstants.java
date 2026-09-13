package org.brainstemfirst.pilot.ftc.model;

import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.Vector2d;

/** Field coordinate transforms for Brainstem Pilot paths (blue-field authoring). */
public final class FieldConstants {
    public enum Alliance { BLUE, RED }

    /**
     * How red maps from blue-authored coordinates.
     * {@link AllianceMirror#FLIP_X} reflects across the Y axis (DECODE).
     * {@link AllianceMirror#ORIGIN} rotates 180° about the origin (BioBuzz).
     */
    public enum AllianceMirror { FLIP_X, ORIGIN }

    private static AllianceMirror allianceMirror = AllianceMirror.FLIP_X;

    private FieldConstants() {}

    public static AllianceMirror allianceMirror() {
        return allianceMirror;
    }

    public static void setAllianceMirror(AllianceMirror mode) {
        allianceMirror = mode == null ? AllianceMirror.FLIP_X : mode;
    }

    /**
     * Resolves the red-alliance transform from {@code app_settings.json}.
     * Explicit {@code allianceMirror} wins; {@code biobuzz_2027} falls back to origin.
     */
    public static AllianceMirror parseAllianceMirror(String allianceMirrorValue, String fieldId) {
        if (allianceMirrorValue != null && !allianceMirrorValue.isBlank()) {
            if ("origin".equalsIgnoreCase(allianceMirrorValue.trim())) {
                return AllianceMirror.ORIGIN;
            }
            return AllianceMirror.FLIP_X;
        }
        if (fieldId != null && fieldId.trim().equalsIgnoreCase("biobuzz_2027")) {
            return AllianceMirror.ORIGIN;
        }
        return AllianceMirror.FLIP_X;
    }

    /** Mirror across the field centerline (left/right start side). */
    public static Vector2d mirrorSide(Vector2d point) {
        return new Vector2d(-point.x, point.y);
    }

    public static Pose2d mirrorSide(Pose2d pose) {
        return new Pose2d(-pose.position.x, pose.position.y, -pose.heading.toDouble());
    }

    /** Map blue-authored coordinates onto red for the active field. */
    public static Vector2d mirrorAlliance(Vector2d point) {
        if (allianceMirror == AllianceMirror.ORIGIN) {
            return new Vector2d(-point.x, -point.y);
        }
        return new Vector2d(-point.x, point.y);
    }

    public static double mirrorAllianceHeading(double headingRad) {
        double heading = allianceMirror == AllianceMirror.ORIGIN
                ? headingRad + Math.PI
                : Math.PI - headingRad;
        return wrapHeadingRad(heading);
    }

    public static Pose2d mirrorAlliance(Pose2d pose) {
        Vector2d point = mirrorAlliance(pose.position);
        return new Pose2d(point.x, point.y, mirrorAllianceHeading(pose.heading.toDouble()));
    }

    private static double wrapHeadingRad(double rad) {
        double wrapped = (rad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        return wrapped;
    }
}
