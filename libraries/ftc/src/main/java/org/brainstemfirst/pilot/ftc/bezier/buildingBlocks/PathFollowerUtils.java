package org.brainstemfirst.pilot.ftc.bezier.buildingBlocks;

import com.acmerobotics.roadrunner.Vector2d;

import java.util.List;

/**
 * Static utility class containing all calculations needed to follow a {@link BezierCurve}.
 */
public final class PathFollowerUtils {
    private PathFollowerUtils() {}

    public static double findClosestT(BezierCurve curve, Vector2d robotPos, int coarseSamples, int maxIterations, double tolerance) {
        double bestT = 0.0;
        double bestDist = Double.MAX_VALUE;

        for (int i = 0; i <= coarseSamples; i++) {
            double t = (double) i / coarseSamples;
            double dist = vecDist(curve.getPoint(t), robotPos);
            if (dist < bestDist) {
                bestDist = dist;
                bestT = t;
            }
        }

        double step = 1.0 / coarseSamples;
        double lo = Math.max(0.0, bestT - step);
        double hi = Math.min(1.0, bestT + step);

        double prevMinDist = bestDist;

        for (int i = 0; i < maxIterations; i++) {
            double span = hi - lo;
            double m1 = lo + span / 3.0;
            double m2 = hi - span / 3.0;

            double d1 = vecDist(curve.getPoint(m1), robotPos);
            double d2 = vecDist(curve.getPoint(m2), robotPos);

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

    public static Vector2d getLookaheadPoint(BezierCurve curve, double closestT, double lookaheadT) {
        return curve.getPoint(Math.min(1.0, closestT + lookaheadT));
    }

    public static double estimateRemainingLength(BezierCurve curve, double fromT, int samples) {
        double length = 0.0;
        Vector2d prev = curve.getPoint(fromT);

        for (int i = 1; i <= samples; i++) {
            double t = fromT + (1.0 - fromT) * i / samples;
            Vector2d curr = curve.getPoint(t);
            length += vecDist(curr, prev);
            prev = curr;
        }

        return length;
    }

    public static Vector2d calculateDriveVector(
            BezierCurve curve,
            Vector2d robotPos,
            Vector2d lookaheadPoint,
            double closestT,
            double remainingLength,
            double speedKP,
            double speedKF,
            double speedKD,
            Vector2d fieldVelocity,
            double correctiveStrength) {

        double speed = remainingLength * speedKP + speedKF;

        Vector2d toTarget = lookaheadPoint.minus(robotPos);
        double toTargetNorm = toTarget.norm();

        if (toTargetNorm < 1e-6) {
            return new Vector2d(0, 0);
        }

        Vector2d driveVec = toTarget.times(speed / toTargetNorm);

        Vector2d tangent = curve.getDerivative(closestT);
        double tangentNorm = tangent.norm();

        if (tangentNorm < 1e-6) {
            return driveVec;
        }

        Vector2d tangentUnit = tangent.times(1.0 / tangentNorm);
        Vector2d perpUnit = new Vector2d(-tangentUnit.y, tangentUnit.x);

        double parallelMag = dot(driveVec, tangentUnit) - speedKD * dot(fieldVelocity, tangentUnit);
        double perpMag = dot(driveVec, perpUnit);

        Vector2d parallelComponent = tangentUnit.times(parallelMag);
        Vector2d perpComponent = perpUnit.times(perpMag * correctiveStrength);

        return parallelComponent.plus(perpComponent);
    }

    /**
     * Target speed for the current point on the path, in in/s.
     *
     * <p>This is the descending ramp of a trapezoidal profile. Braking distance grows as v^2, so
     * the ramp is sqrt-shaped rather than linear: {@code v = sqrt(2*a*d)} is exactly the speed
     * from which the robot can still stop in {@code d} inches at {@code a} in/s^2. The ascending
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
     */
    public static Vector2d calculateProfiledDriveVector(
            BezierCurve curve,
            Vector2d robotPos,
            double closestT,
            double signedRemainingLength,
            Vector2d fieldVelocity,
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

    public static Vector2d calculateProfiledDriveVector(
            BezierCurve curve,
            Vector2d robotPos,
            double closestT,
            double signedRemainingLength,
            Vector2d fieldVelocity,
            double cruiseVel,
            double decel,
            double velKv,
            double velKs,
            double velKp,
            double crossTrackKp,
            double minVel) {

        Vector2d tangent = curve.getDerivative(closestT);
        double tangentNorm = tangent.norm();
        if (tangentNorm < 1e-6) {
            return new Vector2d(0, 0);
        }
        Vector2d tangentUnit = tangent.times(1.0 / tangentNorm);
        Vector2d perpUnit = new Vector2d(-tangentUnit.y, tangentUnit.x);

        double targetVel = Math.signum(signedRemainingLength)
                * profileTargetVelocity(Math.abs(signedRemainingLength), cruiseVel, decel, minVel);
        double actualVel = dot(fieldVelocity, tangentUnit);

        double tangentialCmd = velKv * targetVel + velKp * (targetVel - actualVel);
        if (Math.abs(tangentialCmd) > 1e-3) {
            tangentialCmd += Math.signum(tangentialCmd) * velKs;
        }
        tangentialCmd = Math.max(-1.0, Math.min(1.0, tangentialCmd));

        double crossTrackError = dot(robotPos.minus(curve.getPoint(closestT)), perpUnit);
        double perpCmd = -crossTrackKp * crossTrackError;

        return tangentUnit.times(tangentialCmd).plus(perpUnit.times(perpCmd));
    }

    public static double projectOnTangent(BezierCurve curve, double t, Vector2d vec) {
        Vector2d tangent = curve.getDerivative(t);
        double norm = tangent.norm();
        if (norm < 1e-6) return 0.0;
        return dot(vec, tangent.times(1.0 / norm));
    }

    public static double getTargetRotation(List<RotationPoint> rotationPoints, double t, double entryHeadingRad) {
        if (rotationPoints == null || rotationPoints.isEmpty()) {
            return entryHeadingRad;
        }

        if (rotationPoints.size() == 1) {
            RotationPoint targetPoint = rotationPoints.get(0);

            if (t >= targetPoint.getT()) {
                return targetPoint.getHeadingRad();
            }

            if (targetPoint.getT() < 1e-6) {
                return targetPoint.getHeadingRad();
            }

            double localPct = t / targetPoint.getT();
            return lerpHeading(entryHeadingRad, targetPoint.getHeadingRad(), localPct);
        }

        if (t <= rotationPoints.get(0).getT()) {
            RotationPoint first = rotationPoints.get(0);
            if (first.getT() < 1e-6) {
                return first.getHeadingRad();
            }
            return lerpHeading(entryHeadingRad, first.getHeadingRad(), t / first.getT());
        }

        if (t >= rotationPoints.get(rotationPoints.size() - 1).getT()) {
            return rotationPoints.get(rotationPoints.size() - 1).getHeadingRad();
        }

        for (int i = 0; i < rotationPoints.size() - 1; i++) {
            RotationPoint p1 = rotationPoints.get(i);
            RotationPoint p2 = rotationPoints.get(i + 1);

            if (t >= p1.getT() && t <= p2.getT()) {
                double segmentSpan = p2.getT() - p1.getT();

                if (segmentSpan < 1e-6) {
                    return p2.getHeadingRad();
                }

                double localPct = (t - p1.getT()) / segmentSpan;
                return lerpHeading(p1.getHeadingRad(), p2.getHeadingRad(), localPct);
            }
        }

        return rotationPoints.get(rotationPoints.size() - 1).getHeadingRad();
    }

    public static double getRotationPower(double currentHeadingRad, double targetHeadingRad, double kP, double kF) {
        double errorRadians = angleNormDeltaRad(targetHeadingRad - currentHeadingRad);
        double power = errorRadians * kP;
        if (Math.abs(power) > 1e-6) {
            return power + (Math.signum(power) * kF);
        }
        return power;
    }

    public static double vecDist(Vector2d a, Vector2d b) {
        return b.minus(a).norm();
    }

    public static double angleNormRad(double rad) {
        if (rad >= 0 && rad < Math.PI * 2) {
            return rad;
        }
        return (rad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    }

    public static double angleNormDeltaRad(double rad) {
        rad = angleNormRad(rad);
        if (rad > Math.PI) {
            rad -= 2 * Math.PI;
        }
        return rad;
    }

    public static double absHeadingError(double targetRad, double currentRad) {
        return Math.abs(angleNormDeltaRad(targetRad - currentRad));
    }

    public static double lerpHeading(double startRad, double endRad, double t) {
        double delta = angleNormDeltaRad(endRad - startRad);
        return angleNormRad(startRad + delta * t);
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

    private static double dot(Vector2d a, Vector2d b) {
        return a.x * b.x + a.y * b.y;
    }
}
