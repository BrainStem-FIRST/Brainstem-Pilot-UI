package org.brainstemfirst.pilot.frc.bezier.buildingBlocks;

import edu.wpi.first.math.geometry.Rotation2d;

/**
 * Associates a target heading ({@link Rotation2d}) with a position along a Bezier curve,
 * expressed as a t-value in [0, 1].
 *
 * <p>The path follower smoothly interpolates between consecutive {@code RotationPoint}s.
 * Place one at t = 0 and one at t = 1 at minimum so the robot always has a valid target
 * heading across the full curve.
 *
 * <p>Example usage:
 * <pre>{@code
 * List<RotationPoint> headings = List.of(
 *     new RotationPoint(Rotation2d.fromDegrees(0),   0.0),
 *     new RotationPoint(Rotation2d.fromDegrees(90),  0.5),
 *     new RotationPoint(Rotation2d.fromDegrees(180), 1.0)
 * );
 * }</pre>
 */
public class RotationPoint {

    private final Rotation2d rotation;
    private final double t;

    /**
     * @param rotation The target heading at this waypoint.
     * @param t        Curve parameter in [0, 1] at which the robot should achieve this heading.
     */
    public RotationPoint(Rotation2d rotation, double t) {
        this.rotation = rotation;
        this.t        = Math.max(0.0, Math.min(1.0, t));
    }

    /** @return The target heading. */
    public Rotation2d getRotation() { return rotation; }

    /** @return The curve t-value (0 = start, 1 = end) for this rotation waypoint. */
    public double getT() { return t; }
}
