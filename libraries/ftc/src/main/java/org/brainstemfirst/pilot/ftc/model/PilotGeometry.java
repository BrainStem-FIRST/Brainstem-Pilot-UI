package org.brainstemfirst.pilot.ftc.model;

import com.acmerobotics.roadrunner.Vector2d;

/** Heading and vector helpers for Brainstem Pilot path math. */
public final class PilotGeometry {
    private PilotGeometry() {}

    public static double fromDegrees(double degrees) {
        return Math.toRadians(degrees);
    }

    public static double toDegrees(double radians) {
        return Math.toDegrees(radians);
    }

    /** Normalizes to [0, 2π). */
    public static double angleNormRad(double rad) {
        if (rad >= 0 && rad < Math.PI * 2) {
            return rad;
        }
        return (rad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    }

    /** Normalizes to (−π, π]. */
    public static double angleNormDeltaRad(double rad) {
        rad = angleNormRad(rad);
        if (rad > Math.PI) {
            rad -= 2 * Math.PI;
        }
        return rad;
    }

    public static double vecDist(Vector2d a, Vector2d b) {
        return b.minus(a).norm();
    }

    public static double absHeadingError(double targetRad, double currentRad) {
        return Math.abs(angleNormDeltaRad(targetRad - currentRad));
    }

    public static double lerpHeading(double startRad, double endRad, double t) {
        double delta = angleNormDeltaRad(endRad - startRad);
        return angleNormRad(startRad + delta * t);
    }

    public static double negateHeading(double headingRad) {
        return angleNormRad(-headingRad);
    }

    public static double flipHeadingForRed(double headingRad) {
        return angleNormRad(headingRad + Math.PI);
    }

    public static Vector2d rotate(Vector2d vector, double angleRad) {
        double cos = Math.cos(angleRad);
        double sin = Math.sin(angleRad);
        return new Vector2d(
                vector.x * cos - vector.y * sin,
                vector.x * sin + vector.y * cos
        );
    }

    public static Vector2d fieldToRobot(Vector2d fieldVelocity, double robotHeadingRad) {
        double cos = Math.cos(robotHeadingRad);
        double sin = Math.sin(robotHeadingRad);
        return new Vector2d(
                fieldVelocity.x * cos + fieldVelocity.y * sin,
                -fieldVelocity.x * sin + fieldVelocity.y * cos
        );
    }
}
