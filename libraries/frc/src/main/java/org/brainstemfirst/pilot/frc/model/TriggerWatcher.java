package org.brainstemfirst.pilot.frc.model;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.wpilibj2.command.Command;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierPath;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierPath.SubsystemTriggerPoint;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierCurve;

import java.util.function.Supplier;

public class TriggerWatcher extends Command {

    private static final int ARC_LENGTH_SAMPLES = 40;

    private final Supplier<Pose2d> m_pose;
    private final BezierPath[] m_paths;

    // Precomputed: cumulative arc length at the START of each segment
    private final double[] m_segmentStartDistances;
    private final double m_totalLength;

    public TriggerWatcher(Supplier<Pose2d> pose, BezierPath[] paths) {
        m_pose = pose;
        m_paths = paths;

        // Precompute segment start distances
        m_segmentStartDistances = new double[paths.length];
        double running = 0.0;
        for (int i = 0; i < paths.length; i++) {
            m_segmentStartDistances[i] = running;
            running += estimateArcLength(paths[i].curve, 0.0, 1.0);
        }
        m_totalLength = running;

        // No drive requirement — we only read pose and schedule commands
    }

    @Override
    public void initialize() {
        // Reset all trigger flags
        for (BezierPath path : m_paths) {
            for (SubsystemTriggerPoint trigger : path.subsystemTriggers) {
                trigger.triggered = false;
            }
        }
    }

    @Override
    public void execute() {
        Translation2d robotPos = m_pose.get().getTranslation();
        double traveledDistance = estimateTraveledDistance(robotPos);

        for (int i = 0; i < m_paths.length; i++) {
            for (SubsystemTriggerPoint trigger : m_paths[i].subsystemTriggers) {
                if (!trigger.triggered && traveledDistance >= trigger.arcLengthM) {
                    trigger.triggered = true;
                    trigger.command.schedule();
                }
            }
        }
    }

    @Override
    public boolean isFinished() {
        return false; // Deadline is BezierDrivePath — this runs until that ends
    }

    /**
     * Estimates how far the robot has traveled along the full multi-segment path
     * by finding the closest point on each segment and picking the best match.
     */
    private double estimateTraveledDistance(Translation2d robotPos) {
        double bestDist = Double.MAX_VALUE;
        double bestTraveledLength = 0.0;

        for (int i = 0; i < m_paths.length; i++) {
            BezierCurve curve = m_paths[i].curve;
            double closestT = findClosestT(curve, robotPos);
            double distToRobot = curve.getPoint(closestT).getDistance(robotPos);

            if (distToRobot < bestDist) {
                bestDist = distToRobot;
                bestTraveledLength = m_segmentStartDistances[i] + estimateArcLength(curve, 0.0, closestT);
            }
        }

        return bestTraveledLength;
    }

    private double findClosestT(BezierCurve curve, Translation2d robotPos) {
        // Coarse pass
        double bestT = 0.0;
        double bestDist = Double.MAX_VALUE;
        for (int i = 0; i <= ARC_LENGTH_SAMPLES; i++) {
            double t = (double) i / ARC_LENGTH_SAMPLES;
            double d = curve.getPoint(t).getDistance(robotPos);
            if (d < bestDist) {
                bestDist = d;
                bestT = t;
            }
        }

        // Binary refinement
        double lo = Math.max(0, bestT - 1.0 / ARC_LENGTH_SAMPLES);
        double hi = Math.min(1, bestT + 1.0 / ARC_LENGTH_SAMPLES);
        for (int i = 0; i < 16; i++) {
            double mid = (lo + hi) / 2.0;
            double dLo = curve.getPoint(lo).getDistance(robotPos);
            double dHi = curve.getPoint(hi).getDistance(robotPos);
            if (dLo < dHi) hi = mid; else lo = mid;
        }

        return (lo + hi) / 2.0;
    }

    private double estimateArcLength(BezierCurve curve, double tStart, double tEnd) {
        double length = 0.0;
        Translation2d last = curve.getPoint(tStart);
        for (int i = 1; i <= ARC_LENGTH_SAMPLES; i++) {
            double t = tStart + (tEnd - tStart) * i / ARC_LENGTH_SAMPLES;
            Translation2d pt = curve.getPoint(t);
            length += pt.getDistance(last);
            last = pt;
        }
        return length;
    }
}