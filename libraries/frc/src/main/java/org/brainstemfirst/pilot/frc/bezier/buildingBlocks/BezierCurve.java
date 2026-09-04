package org.brainstemfirst.pilot.frc.bezier.buildingBlocks;

import java.util.ArrayList;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.wpilibj.smartdashboard.Field2d;

/**
 * Represents a cubic Bezier curve defined by a start point, two control/anchor points,
 * and an end point. Provides mathematical primitives used by {@link PathFollowerUtils}.
 *
 * <p>Cubic Bezier formula:
 * B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3
 * where t ∈ [0, 1]
 */
public class BezierCurve {

    private final Translation2d start;
    private final Translation2d control1;
    private final Translation2d control2;
    private final Translation2d end;

    /**
     * Constructs a cubic Bezier curve.
     *
     * @param start    The starting position of the curve (t = 0).
     * @param control1 The first anchor/control point (pulls the curve near the start).
     * @param control2 The second anchor/control point (pulls the curve near the end).
     * @param end      The ending position of the curve (t = 1).
     */
    public BezierCurve(Translation2d start, Translation2d control1,
                        Translation2d control2, Translation2d end) {
        this.start    = start;
        this.control1 = control1;
        this.control2 = control2;
        this.end      = end;
    }
    public BezierCurve(Translation2d start, Translation2d end) {
        this.start    = start;
        this.end      = end;
        Translation2d startToEnd = end.minus(start);
        this.control1 = start.plus(startToEnd.times(0.333));
        this.control2 = start.plus(startToEnd.times(0.667));
    }

    // -------------------------------------------------------------------------
    // Core math
    // -------------------------------------------------------------------------

    /**
     * Evaluates the curve position at parameter {@code t}.
     *
     * @param t Curve parameter, clamped to [0, 1].
     * @return The {@link Translation2d} position on the curve.
     */
    public Translation2d getPoint(double t) {
        t = clamp01(t);
        double u  = 1.0 - t;
        double u2 = u * u;
        double u3 = u2 * u;
        double t2 = t * t;
        double t3 = t2 * t;

        // B(t) = u³·P0 + 3u²t·P1 + 3u·t²·P2 + t³·P3
        return start.times(u3)
                .plus(control1.times(3.0 * u2 * t))
                .plus(control2.times(3.0 * u  * t2))
                .plus(end.times(t3));
    }

    /**
     * Evaluates the first derivative (tangent vector, NOT normalized) at parameter {@code t}.
     * The magnitude of the returned vector is proportional to the curve's speed.
     *
     * @param t Curve parameter, clamped to [0, 1].
     * @return The tangent {@link Translation2d} at {@code t}.
     */
    public Translation2d getDerivative(double t) {
        t = clamp01(t);
        double u  = 1.0 - t;
        double u2 = u * u;
        double t2 = t * t;

        // B'(t) = 3u²·(P1-P0) + 6ut·(P2-P1) + 3t²·(P3-P2)
        return control1.minus(start).times(3.0 * u2)
                .plus(control2.minus(control1).times(6.0 * u * t))
                .plus(end.minus(control2).times(3.0 * t2));
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public Translation2d getStart()    { return start; }
    public Translation2d getControl1() { return control1; }
    public Translation2d getControl2() { return control2; }
    public Translation2d getEnd()      { return end; }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static double clamp01(double v) {
        return Math.max(0.0, Math.min(1.0, v));
    }

    public void draw(Field2d field, String name, int numPoints) {
        ArrayList<Pose2d> poses = new ArrayList<>();
        for (int i=0; i<numPoints; i++) {
            double t = i * 1. / (numPoints-1);
            Translation2d point = getPoint(t);
            poses.add(new Pose2d(point, new Rotation2d()));
        }
        field.getObject(name).setPoses(poses);
    }
}
