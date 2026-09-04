package org.brainstemfirst.pilot.frc.bezier.buildingBlocks;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;

import java.util.List;

/**
 * Static utility class containing all calculations needed to follow a {@link BezierCurve}
 * with a swerve drive robot.
 */
public final class PathFollowerUtils {
    // =========================================================================
    // 1. Closest-T search  (coarse scan + ternary refinement)
    // =========================================================================

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

    // =========================================================================
    // 2. Lookahead point
    // =========================================================================

    public static Translation2d getLookaheadPoint(BezierCurve curve, double closestT, double lookaheadT) {
        return curve.getPoint(Math.min(1.0, closestT + lookaheadT));
    }

    // =========================================================================
    // 3. Remaining arc-length estimate
    // =========================================================================

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

    // =========================================================================
    // 4. Drive vector (with parallel / perpendicular decomposition)
    // =========================================================================

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
        if (decel <= 0) return cruiseVel;
        return Math.min(cruiseVel, Math.sqrt(Math.max(0.0, 2.0 * decel * remainingLength)));
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

        Translation2d tangent = curve.getDerivative(closestT);
        double tangentNorm = tangent.getNorm();
        if (tangentNorm < 1e-6) {
            return new Translation2d();
        }
        Translation2d tangentUnit = tangent.times(1.0 / tangentNorm);
        Translation2d perpUnit = new Translation2d(-tangentUnit.getY(), tangentUnit.getX());

        // Signed, so that a robot which has driven past the endpoint gets a negative target and
        // reverses back to it. With an unsigned distance the command points down-tangent no matter
        // which side of the target the robot is on, which is positive feedback: the further past it
        // goes, the harder it drives away.
        double targetVel = Math.signum(signedRemainingLength)
                * profileTargetVelocity(Math.abs(signedRemainingLength), cruiseVel, decel);
        double actualVel = dot(fieldVelocity, tangentUnit);

        double tangentialCmd = velKv * targetVel + velKp * (targetVel - actualVel);
        // Static feedforward follows the sign of the command. Adding it unconditionally would
        // push the robot forward during the braking phase, when the command is negative.
        if (Math.abs(tangentialCmd) > 1e-3) {
            tangentialCmd += Math.signum(tangentialCmd) * velKs;
        }

        // Signed perpendicular offset of the robot from the path, pushed back toward the curve.
        double crossTrackError = dot(robotPos.minus(curve.getPoint(closestT)), perpUnit);
        double perpCmd = -crossTrackKp * crossTrackError;

        return tangentUnit.times(tangentialCmd).plus(perpUnit.times(perpCmd));
    }

    /** Commanded open-loop speed before the D term — useful for tuning telemetry. */
    public static double commandedSpeed(double remainingLength, double speedKP, double speedKF) {
        return remainingLength * speedKP + speedKF;
    }

    /** Signed projection of {@code vec} onto the path tangent at {@code t}. */
    public static double projectOnTangent(BezierCurve curve, double t, Translation2d vec) {
        Translation2d tangent = curve.getDerivative(t);
        double norm = tangent.getNorm();
        if (norm < 1e-6) return 0.0;
        return dot(vec, tangent.times(1.0 / norm));
    }

    /** Signed velocity along the path tangent at {@code t}. Positive means moving toward the end. */
    public static double tangentialVelocity(BezierCurve curve, double t, Translation2d fieldVelocity) {
        return projectOnTangent(curve, t, fieldVelocity);
    }

    // =========================================================================
    // 5. Heading interpolation
    // =========================================================================

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

        // 👉 FIX FOR PATH 2: If there is only ONE rotation target point, 
        // we lerp from the path's entry heading (115°) down to that target (0°) over the progress window.
        if (rotationPoints.size() == 1) {
            RotationPoint targetPoint = rotationPoints.get(0);
            
            // If we are past the target's t progress, lock exactly onto the target
            if (t >= targetPoint.getT()) {
                return targetPoint.getRotation();
            }
            
            // Guard against divide-by-zero if target is exactly at t=0
            if (targetPoint.getT() < 1e-6) {
                return targetPoint.getRotation();
            }

            // Calculate progress percentage from the start line (t=0) to the target milestone
            double localPct = t / targetPoint.getT();
            
            // Smoothly lerp from 115 degrees down to 0 degrees
            return entryHeading.interpolate(targetPoint.getRotation(), localPct);
        }

        // --- Standard Multi-Point Interpolation Logic (Path 1) ---
        
        // Fallback if the progress is behind our initial marker point
        if (t <= rotationPoints.get(0).getT()) {
            RotationPoint first = rotationPoints.get(0);
            if (first.getT() < 1e-6) {
                return first.getRotation();
            }
            return entryHeading.interpolate(first.getRotation(), t / first.getT());
        }

        // Fallback if progress has completed past our final marker point
        if (t >= rotationPoints.get(rotationPoints.size() - 1).getT()) {
            return rotationPoints.get(rotationPoints.size() - 1).getRotation();
        }

        // Find the two bounding rotation markers that our current progress 't' falls between
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

    // =========================================================================
    // 6. Rotation power
    // =========================================================================

    public static double getRotationPower(Rotation2d currentHeading, Rotation2d targetHeading, double kP, double kF) {
        double errorRadians = targetHeading.minus(currentHeading).getRadians();
        double power = errorRadians * kP;
        if (Math.abs(power) > 1e-6) 
            return power + (Math.signum(power) * kF);
        return power;
    }

    // =========================================================================
    // 7. Completion check
    // =========================================================================

    public static boolean isPathFinished(double closestT, Translation2d robotPos, BezierCurve curve, double distanceThreshold) {
        return closestT >= 0.99 && robotPos.getDistance(curve.getEnd()) < distanceThreshold;
    }

    // =========================================================================
    // 8. Centripetal force compensation
    // =========================================================================
 
    public static Translation2d getCentripetalCompensation(BezierCurve curve, double t, double robotSpeedMps, double centripetalGain, double epsilon) {
        double tA = Math.max(0.0, t - epsilon);
        double tC = Math.min(1.0, t + epsilon);
 
        Translation2d A = curve.getPoint(tA);
        Translation2d B = curve.getPoint(t);
        Translation2d C = curve.getPoint(tC);
 
        double ab = A.getDistance(B);
        double bc = B.getDistance(C);
        double ca = C.getDistance(A);
 
        double cross = (B.getX() - A.getX()) * (C.getY() - A.getY())
                     - (B.getY() - A.getY()) * (C.getX() - A.getX());
        double twoArea = Math.abs(cross);
 
        if (twoArea < 1e-3) return new Translation2d();
 
        double radius = (ab * bc * ca) / (2.0 * twoArea);
        double centripetalAccel = (robotSpeedMps * robotSpeedMps) / radius;
 
        double ax = A.getX(), ay = A.getY();
        double bx = B.getX(), by = B.getY();
        double cx = C.getX(), cy = C.getY();
 
        double D = 2.0 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        double ux = ((ax * ax + ay * ay) * (by - cy)
                   + (bx * bx + by * by) * (cy - ay)
                   + (cx * cx + cy * cy) * (ay - by)) / D;
        double uy = ((ax * ax + ay * ay) * (cx - bx)
                   + (bx * bx + by * by) * (ax - cx)
                   + (cx * cx + cy * cy) * (bx - ax)) / D;
 
        Translation2d toCenter = new Translation2d(ux - bx, uy - by);
        double toCenterNorm = toCenter.getNorm();
 
        if (toCenterNorm < 1e-9) return new Translation2d();
 
        Translation2d inwardUnit = toCenter.times(1.0 / toCenterNorm);
        return inwardUnit.times(centripetalAccel * centripetalGain);
    }

    public record CentripetalInfo(Translation2d circleCenter, double circleRadius, Translation2d compensation) {}

    public static CentripetalInfo getCentripetalCompensationDebug(BezierCurve curve, double t, double robotSpeedMps, double centripetalGain, double epsilon, double dtSeconds) {
        double tA = Math.max(0.0, t - epsilon);
        double tC = Math.min(1.0, t + epsilon);
 
        Translation2d A = curve.getPoint(tA);
        Translation2d B = curve.getPoint(t);
        Translation2d C = curve.getPoint(tC);
 
        double ab = A.getDistance(B);
        double bc = B.getDistance(C);
        double ca = C.getDistance(A);
 
        double cross = (B.getX() - A.getX()) * (C.getY() - A.getY())
                     - (B.getY() - A.getY()) * (C.getX() - A.getX());
        double twoArea = Math.abs(cross);
 
        if (twoArea < 1e-3) 
            return new CentripetalInfo(null, 0, new Translation2d());
 
        double radius = (ab * bc * ca) / (2.0 * twoArea);
        double centripetalAccel = (robotSpeedMps * robotSpeedMps) / radius;
        double deltaVelocity = centripetalAccel * dtSeconds;
 
        double ax = A.getX(), ay = A.getY();
        double bx = B.getX(), by = B.getY();
        double cx = C.getX(), cy = C.getY();
 
        double D = 2.0 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        double ux = ((ax * ax + ay * ay) * (by - cy)
                   + (bx * bx + by * by) * (cy - ay)
                   + (cx * cx + cy * cy) * (ay - by)) / D;
        double uy = ((ax * ax + ay * ay) * (cx - bx)
                   + (bx * bx + by * by) * (ax - cx)
                   + (cx * cx + cy * cy) * (bx - ax)) / D;
 
        Translation2d toCenter = new Translation2d(ux - bx, uy - by);
        double toCenterNorm = toCenter.getNorm();
 
        if (toCenterNorm < 1e-9) 
            return new CentripetalInfo(null, 0, new Translation2d());
 
        Translation2d inwardUnit = toCenter.times(1.0 / toCenterNorm);
        Translation2d compensation = inwardUnit.times(deltaVelocity * centripetalGain);
        return new CentripetalInfo(B.plus(toCenter), radius, compensation);
    }

    private static double dot(Translation2d a, Translation2d b) {
        return a.getX() * b.getX() + a.getY() * b.getY();
    }
}