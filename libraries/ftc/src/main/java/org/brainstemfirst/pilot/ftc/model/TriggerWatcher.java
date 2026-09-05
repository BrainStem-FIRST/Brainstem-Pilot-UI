package org.brainstemfirst.pilot.ftc.model;

import androidx.annotation.NonNull;

import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.Vector2d;

import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.PathFollowerUtils;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierPath;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierPath.SubsystemTriggerPoint;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

public class TriggerWatcher implements Action {

    private static final int ARC_LENGTH_SAMPLES = 40;

    private final Supplier<Pose2d> m_pose;
    private final BezierPath[] m_paths;

    private final double[] m_segmentStartDistances;
    private boolean initialized;
    private final List<RunningTriggerAction> m_activeTriggers = new ArrayList<>();

    public TriggerWatcher(Supplier<Pose2d> pose, BezierPath[] paths) {
        m_pose = pose;
        m_paths = paths;

        m_segmentStartDistances = new double[paths.length];
        double running = 0.0;
        for (int i = 0; i < paths.length; i++) {
            m_segmentStartDistances[i] = running;
            running += estimateArcLength(paths[i].curve, 0.0, 1.0);
        }
    }

    private void initialize() {
        for (BezierPath path : m_paths) {
            for (SubsystemTriggerPoint trigger : path.subsystemTriggers) {
                trigger.triggered = false;
            }
        }
        m_activeTriggers.clear();
    }

    @Override
    public boolean run(@NonNull TelemetryPacket packet) {
        if (!initialized) {
            initialize();
            initialized = true;
        }

        Vector2d robotPos = m_pose.get().position;
        double traveledDistance = estimateTraveledDistance(robotPos);

        for (int i = 0; i < m_paths.length; i++) {
            for (SubsystemTriggerPoint trigger : m_paths[i].subsystemTriggers) {
                if (!trigger.triggered && traveledDistance >= trigger.arcLength) {
                    trigger.triggered = true;
                    m_activeTriggers.add(new RunningTriggerAction(trigger.action));
                }
            }
        }

        for (RunningTriggerAction runningTrigger : m_activeTriggers) {
            if (runningTrigger.running) {
                runningTrigger.running = runningTrigger.action.run(packet);
            }
        }

        return true;
    }

    private double estimateTraveledDistance(Vector2d robotPos) {
        double bestDist = Double.MAX_VALUE;
        double bestTraveledLength = 0.0;

        for (int i = 0; i < m_paths.length; i++) {
            BezierCurve curve = m_paths[i].curve;
            double closestT = findClosestT(curve, robotPos);
            double distToRobot = PathFollowerUtils.vecDist(curve.getPoint(closestT), robotPos);

            if (distToRobot < bestDist) {
                bestDist = distToRobot;
                bestTraveledLength = m_segmentStartDistances[i] + estimateArcLength(curve, 0.0, closestT);
            }
        }

        return bestTraveledLength;
    }

    private double findClosestT(BezierCurve curve, Vector2d robotPos) {
        double bestT = 0.0;
        double bestDist = Double.MAX_VALUE;
        for (int i = 0; i <= ARC_LENGTH_SAMPLES; i++) {
            double t = (double) i / ARC_LENGTH_SAMPLES;
            double d = PathFollowerUtils.vecDist(curve.getPoint(t), robotPos);
            if (d < bestDist) {
                bestDist = d;
                bestT = t;
            }
        }

        double lo = Math.max(0, bestT - 1.0 / ARC_LENGTH_SAMPLES);
        double hi = Math.min(1, bestT + 1.0 / ARC_LENGTH_SAMPLES);
        for (int i = 0; i < 16; i++) {
            double mid = (lo + hi) / 2.0;
            double dLo = PathFollowerUtils.vecDist(curve.getPoint(lo), robotPos);
            double dHi = PathFollowerUtils.vecDist(curve.getPoint(hi), robotPos);
            if (dLo < dHi) hi = mid;
            else lo = mid;
        }

        return (lo + hi) / 2.0;
    }

    private double estimateArcLength(BezierCurve curve, double tStart, double tEnd) {
        double length = 0.0;
        Vector2d last = curve.getPoint(tStart);
        for (int i = 1; i <= ARC_LENGTH_SAMPLES; i++) {
            double t = tStart + (tEnd - tStart) * i / ARC_LENGTH_SAMPLES;
            Vector2d pt = curve.getPoint(t);
            length += PathFollowerUtils.vecDist(pt, last);
            last = pt;
        }
        return length;
    }

    private static final class RunningTriggerAction {
        private final Action action;
        private boolean running = true;

        private RunningTriggerAction(Action action) {
            this.action = action;
        }
    }
}
