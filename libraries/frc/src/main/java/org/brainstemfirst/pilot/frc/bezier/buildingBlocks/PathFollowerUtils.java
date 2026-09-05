package org.brainstemfirst.pilot.frc.bezier.buildingBlocks;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;

import java.util.List;

/**
 * Static utility class containing all calculations needed to follow a {@link BezierCurve}
 * with a swerve drive robot.
 */
public final class PathFollowerUtils {

    public static double findClosestT(BezierCurve curve, Translation2d robotPos, int coarseSamples, int maxIterations, double tolerance) {
        // --- Coarse scan ---
        double bestT    = 0.0;
        double bestDist = Double.MAX_VALUE;

        for (int i = 0; i <= coarseSamples; i++) {
            double t    = (double) i / coarseSamples;
            double dist = curve.getPoint(t).getDistance(robotPos);
            if (dist < bestDist) {
                bestDist = dist;
                bestT    = t;
            }
        }

        // --- Ternary search within ± one coarse step ---
        double step = 1.0 / coarseSamples;
        double lo   = Math.max(0.0, bestT - step);
        double hi   = Math.min(1.0, bestT + step);

        double prevMinDist = bestDist;

        for (int i = 0; i < maxIterations; i++) {
            double span = hi - lo;
            double m1   = lo + span / 3.0;
            double m2   = hi - span / 3.0;

            double d1 = curve.getPoint(m1).getDistance(robotPos);
            double d2 = curve.getPoint(m2).getDistance(robotPos);

            if (d1 < d2) {
                hi = m2;
            } else {
                lo = m1;
            }

            double newMinDist = Math.min(d1, d2);
            if (Math.abs(prevMinDist - newMinDist) < tolerance) break;
            prevMinDist = newMinDist;
        }

        return (lo + hi) / 2.0;
    }


    public static Translation2d getLookaheadPoint(BezierCurve curve, double closestT, double lookaheadT) {
        return curve.getPoint(Math.min(1.0, closestT + lookaheadT));
    }


    public static double estimateRemainingLength(BezierCurve curve, double fromT, int samples) {
        double      length = 0.0;
        Translation2d prev = curve.getPoint(fromT);

        for (int i = 1; i <= samples; i++) {
            double        t    = fromT + (1.0 - fromT) * i / samples;
            Translation2d curr = curve.getPoint(t);
            length += curr.getDistance(prev);
            prev    = curr;
        }

        return length;
    }

    public static Translation2d calculateDriveVector(
            BezierCurve curve,
            Translation2d robotPos,
            Translation2d lookaheadPoint,
            double closestT,
            double remainingLength,
            double speedKP,
            double speedKF,
            double speedKD,
            Translation2d fieldVelocity,
            double correctiveStrength) {

        double speed = remainingLength * speedKP + speedKF;

        Translation2d toTarget = lookaheadPoint.minus(robotPos);
        double toTargetNorm    = toTarget.getNorm();

        if (toTargetNorm < 1e-6) {
            return new Translation2d();
        }

        Translation2d driveVec = toTarget.times(speed / toTargetNorm);

        Translation2d tangent     = curve.getDerivative(closestT);
        double        tangentNorm = tangent.getNorm();

        if (tangentNorm < 1e-6) {
            return driveVec;
        }

        Translation2d tangentUnit = tangent.times(1.0 / tangentNorm);
        Translation2d perpUnit = new Translation2d(-tangentUnit.getY(), tangentUnit.getX());

        // The D term is applied only to the tangential component. Folding it into `speed` above
        // would flip the sign of the perpendicular correction whenever braking dominates, steering
        // the robot away from the path exactly when it is closest to the end.
        double parallelMag = dot(driveVec, tangentUnit) - speedKD * dot(fieldVelocity, tangentUnit);
        double perpMag     = dot(driveVec, perpUnit);

        Translation2d parallelComponent = tangentUnit.times(parallelMag);
        Translation2d perpComponent     = perpUnit.times(perpMag * correctiveStrength);

        return parallelComponent.plus(perpComponent);
    }

    /**
     * Target speed for the current point on the path, in m/s.
     *
     * <p>This is the descending ramp of a trapezoidal profile. Braking distance grows as v^2, so
     * the ramp is sqrt-shaped rather than linear: {@code v = sqrt(2*a*d)} is exactly the speed
     * from which the robot can still stop in {@code d} metres at {@code a} m/s^2. The ascending
     * ramp is left to the drivetrain — commanding cruise from a standstill produces a large
     * velocity error, and the resulting command saturates, which is the acceleration limit.
     */
    public static double profileTargetVelocity(double remainingLength, double cruiseVel, double decel) {
        return profileTargetVelocity(remainingLength, cruiseVel, decel, 0.0);
    }

    public static double profileTargetVelocity(double remainingLength, double cruiseVel, double decel, double minVel) {
        double cruise = Math.max(0.0, cruiseVel);
        double floor = Math.max(0.0, minVel);
        if (decel <= 0) return Math.max(cruise, floor);
        double braking = Math.sqrt(Math.max(0.0, 2.0 * decel * remainingLength));
        return Math.max(floor, Math.min(cruise, braking));
    }

    /**
     * Drive vector built from a velocity profile rather than a distance-proportional power.
     *
     * <p>The tangential command is free to go negative — that is the whole point, and it is what
     * the {@code speedKp/Kf} form structurally cannot do. The perpendicular command is computed
     * from the geometric cross-track error instead of being scaled off the forward speed, so
     * path-following authority does not vanish as the robot slows down, and it does not invert
     * when the tangential command flips sign to brake.
     *
     * <p>On FRC the returned vector is field-relative m/s, not a normalised power.
     */
    public static Translation2d calculateProfiledDriveVector(
            BezierCurve curve,
            Translation2d robotPos,
            double closestT,
            double signedRemainingLength,
            Translation2d fieldVelocity,
            double cruiseVel,
            double decel,
            double velKv,
            double velKs,
            double velKp,
            double crossTrackKp) {
        return calculateProfiledDriveVector(
                curve, robotPos, closestT, signedRemainingLength, fieldVelocity,
                cruiseVel, decel, velKv, velKs, velKp, crossTrackKp, 0.0);
    }

    public static Translation2d calculateProfiledDriveVector(
            BezierCurve curve,
            Translation2d robotPos,
            double closestT,
            double signedRemainingLength,
            Translation2d fieldVelocity,
            double cruiseVel,
            double decel,
            double velKv,
            double velKs,
            double velKp,
            double crossTrackKp,
            double minVel) {

        Translation2d tangent = curve.getDerivative(closestT);
        double tangentNorm = tangent.getNorm();
        if (tangentNorm < 1e-6) {
            return new Translation2d();
        }
        Translation2d tangentUnit = tangent.times(1.0 / tangentNorm);
        Translation2d perpUnit = new Translation2d(-tangentUnit.getY(), tangentUnit.getX());

        double targetVel = Math.signum(signedRemainingLength)
                * profileTargetVelocity(Math.abs(signedRemainingLength), cruiseVel, decel, minVel);
        double actualVel = dot(fieldVelocity, tangentUnit);

        double tangentialCmd = velKv * targetVel + velKp * (targetVel - actualVel);
        if (Math.abs(tangentialCmd) > 1e-3) {
            tangentialCmd += Math.signum(tangentialCmd) * velKs;
        }

        double crossTrackError = dot(robotPos.minus(curve.getPoint(closestT)), perpUnit);
        double perpCmd = -crossTrackKp * crossTrackError;

        return tangentUnit.times(tangentialCmd).plus(perpUnit.times(perpCmd));
    }

    public static double projectOnTangent(BezierCurve curve, double t, Translation2d vec) {
        Translation2d tangent = curve.getDerivative(t);
        double norm = tangent.getNorm();
        if (norm < 1e-6) return 0.0;
        return dot(vec, tangent.times(1.0 / norm));
    }

    /**
     * Calculates the dynamically interpolated target rotation using continuous Lerp blending.
     * If only one target is present, it smoothly blends from the path's entry heading.
     *
     * @param rotationPoints Ordered list of heading waypoints (sorted by ascending t).
     * @param t              Current curve parameter [0.0 - 1.0].
     * @param entryHeading   The heading of the robot/previous path at the exact start of this segment.
     * @return The smooth interpolated target {@link Rotation2d}.
     */
    public static Rotation2d getTargetRotation(List<RotationPoint> rotationPoints, double t, Rotation2d entryHeading) {
        if (rotationPoints == null || rotationPoints.isEmpty()) {
            return entryHeading;
        }

        if (rotationPoints.size() == 1) {
            RotationPoint targetPoint = rotationPoints.get(0);
            
            if (t >= targetPoint.getT()) {
                return targetPoint.getRotation();
            }
            
            if (targetPoint.getT() < 1e-6) {
                return targetPoint.getRotation();
            }

            double localPct = t / targetPoint.getT();
            
            return entryHeading.interpolate(targetPoint.getRotation(), localPct);
        }

        if (t <= rotationPoints.get(0).getT()) {
            RotationPoint first = rotationPoints.get(0);
            if (first.getT() < 1e-6) {
                return first.getRotation();
            }
            return entryHeading.interpolate(first.getRotation(), t / first.getT());
        }

        if (t >= rotationPoints.get(rotationPoints.size() - 1).getT()) {
            return rotationPoints.get(rotationPoints.size() - 1).getRotation();
        }

        
        for (int i = 0; i < rotationPoints.size() - 1; i++) {
            RotationPoint p1 = rotationPoints.get(i);
            RotationPoint p2 = rotationPoints.get(i + 1);

            if (t >= p1.getT() && t <= p2.getT()) {
                double segmentSpan = p2.getT() - p1.getT();
                
                if (segmentSpan < 1e-6) {
                    return p2.getRotation();
                }

                double localPct = (t - p1.getT()) / segmentSpan;
                return p1.getRotation().interpolate(p2.getRotation(), localPct);
            }
        }

        return rotationPoints.get(rotationPoints.size() - 1).getRotation();
    }

    public static double getRotationPower(Rotation2d currentHeading, Rotation2d targetHeading, double kP, double kF) {
        double errorRadians = targetHeading.minus(currentHeading).getRadians();
        double power = errorRadians * kP;
        if (Math.abs(power) > 1e-6) 
            return power + (Math.signum(power) * kF);
        return power;
    }

    private static double dot(Translation2d a, Translation2d b) {
        return a.getX() * b.getX() + a.getY() * b.getY();
    }
}