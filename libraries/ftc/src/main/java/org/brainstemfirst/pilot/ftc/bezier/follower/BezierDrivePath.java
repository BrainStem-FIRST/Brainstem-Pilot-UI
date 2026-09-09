package org.brainstemfirst.pilot.ftc.bezier.follower;

import androidx.annotation.NonNull;

import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.PoseVelocity2d;
import com.acmerobotics.roadrunner.Vector2d;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.brainstemfirst.pilot.ftc.model.FieldConstants;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.PathFollowerUtils;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.RotationPoint;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

/** Road Runner action that tracks a {@link BezierPath}. */
public class BezierDrivePath implements Action {

    private static final int CLOSEST_T_COARSE_SAMPLES = 40;
    private static final int CLOSEST_T_MAX_ITERATIONS = 20;
    private static final double CLOSEST_T_TOLERANCE = 1e-4;

    private static final int REMAINING_LENGTH_SAMPLES = 30;
    private static final double LOOKAHEAD_T = 0.08;

    private static final Status STATUS = new Status();

    private final String name;
    private final Supplier<Pose2d> pose;
    private final Supplier<PoseVelocity2d> lastVelRobot;
    private final Consumer<PoseVelocity2d> setDrivePowers;
    private final DoubleSupplier maxAngVel;
    private final BezierPath[] paths;
    private final FieldConstants.Alliance alliance;

    private int currentPathIndex = 0;
    private int lastPathIndex = -1;
    private boolean finished = false;
    private boolean initialized = false;
    private boolean isRed;
    private final ElapsedTime segmentTimer = new ElapsedTime();

    private double segmentEntryHeadingRad = 0.0;
    private BezierCurve activeCurve;
    private List<RotationPoint> activeRotationPoints = List.of();

    private static final double ROTATION_START_T_EPSILON = 1e-4;

    /**
     * Latest follower sample. Written every loop of the active path action.
     * Read from team code with {@link #status()}.
     */
    public static final class Status {
        public String pathName = "";
        public Vector2d robotPosition = new Vector2d(0, 0);
        public Vector2d closestPoint = new Vector2d(0, 0);
        /** Current waypoint end — the point being finished — not the lookahead sample. */
        public Vector2d targetPoint = new Vector2d(0, 0);
        public Vector2d pathEnd = new Vector2d(0, 0);
        public double robotHeadingRad;
        public double targetHeadingRad;
        public double closestT;
        public double remainingLength;
        public double distToTarget;
        /** True while the current waypoint is in its finish condition. */
        public boolean finished;
        public boolean pathFinished;
        public boolean inPositionTolerance;
        public boolean inHeadingTolerance;
        public boolean timedOut;
        public int waypointIndex;
        public int waypointCount;
    }

    public BezierDrivePath(
            String name,
            Supplier<Pose2d> pose,
            Supplier<PoseVelocity2d> lastVelRobot,
            Consumer<PoseVelocity2d> setDrivePowers,
            DoubleSupplier maxAngVel,
            FieldConstants.Alliance alliance,
            BezierPath... paths) {
        this.name = name;
        this.pose = pose;
        this.lastVelRobot = lastVelRobot;
        this.setDrivePowers = setDrivePowers;
        this.maxAngVel = maxAngVel;
        this.alliance = alliance;
        this.paths = paths;
    }

    /** Current path-follow sample. Safe to read from {@code PilotAutoBase.updateRobot}. */
    public static Status status() {
        return STATUS;
    }

    public static Vector2d getTargetPoint() {
        return STATUS.targetPoint;
    }

    public static Vector2d getClosestPoint() {
        return STATUS.closestPoint;
    }

    public static Vector2d getPathEnd() {
        return STATUS.pathEnd;
    }

    public static double getTargetHeadingRad() {
        return STATUS.targetHeadingRad;
    }

    public static boolean isFinished() {
        return STATUS.finished;
    }

    private void initialize() {
        currentPathIndex = 0;
        lastPathIndex = -1;
        finished = false;
        segmentEntryHeadingRad = pose.get().heading.toDouble();
        activeCurve = null;
        activeRotationPoints = List.of();
        isRed = alliance == FieldConstants.Alliance.RED;
        STATUS.pathName = name;
        STATUS.finished = false;
        STATUS.pathFinished = false;
        STATUS.timedOut = false;
        STATUS.waypointIndex = 0;
        STATUS.waypointCount = paths.length;
    }

    private void execute() {
        if (finished || currentPathIndex >= paths.length) {
            finished = true;
            STATUS.finished = true;
            STATUS.pathFinished = true;
            return;
        }

        BezierPath basePath = paths[currentPathIndex];

        Pose2d robotPose = pose.get();
        Vector2d robotPos = robotPose.position;
        double robotHeadingRad = robotPose.heading.toDouble();

        Vector2d fieldVelocity = PathFollowerUtils.rotate(lastVelRobot.get().linearVel, robotHeadingRad);

        double closestT;
        if (currentPathIndex != lastPathIndex) {
            lastPathIndex = currentPathIndex;
            segmentTimer.reset();
            segmentEntryHeadingRad = robotHeadingRad;
            activeCurve = createSegmentCurve(basePath.curve, robotPos);
            activeRotationPoints = createSegmentRotationPoints(basePath.rotationPoints);
            closestT = 0.0;
        } else {
            closestT = PathFollowerUtils.findClosestT(
                    activeCurve,
                    robotPos,
                    CLOSEST_T_COARSE_SAMPLES,
                    CLOSEST_T_MAX_ITERATIONS,
                    CLOSEST_T_TOLERANCE
            );
        }

        Vector2d endPoint = activeCurve.getEnd();
        Vector2d robotToEndPoint = endPoint.minus(robotPos);
        Vector2d closestPoint = activeCurve.getPoint(closestT);
        Vector2d lookaheadPoint = PathFollowerUtils.getLookaheadPoint(activeCurve, closestT, LOOKAHEAD_T);

        double targetHeadingRad;
        if (!activeRotationPoints.isEmpty()) {
            targetHeadingRad = PathFollowerUtils.getTargetRotation(activeRotationPoints, closestT, segmentEntryHeadingRad);
        } else {
            targetHeadingRad = robotHeadingRad;
        }

        double headingErrorRad = PathFollowerUtils.absHeadingError(targetHeadingRad, robotHeadingRad);

        boolean inPositionTolerance = basePath.params.tolerance.inPositionTolerance(robotToEndPoint);
        boolean inHeadingTolerance = basePath.params.tolerance.inHeadingTolerance(headingErrorRad);
        boolean passedEnd = hasPassedEnd(activeCurve, robotToEndPoint);
        boolean flyingThrough = basePath.params.minLinearSpeed > 1e-6;

        boolean passPosition = basePath.params.passPosition && passedEnd;
        boolean timedOut = basePath.params.hasMaxTime() && segmentTimer.seconds() > basePath.params.maxTime;

        // Min speed means this waypoint is a fly-through: finish on the position band (or once
        // past the end) without waiting to settle heading. Waiting for heading at 50 in/s is
        // what overshoots, reverses, then continues.
        boolean waypointReached = timedOut
                || passPosition
                || (flyingThrough && (inPositionTolerance || passedEnd))
                || (inPositionTolerance && inHeadingTolerance);

        publishStatus(
                robotPos,
                robotHeadingRad,
                closestPoint,
                endPoint,
                endPoint,
                targetHeadingRad,
                closestT,
                robotToEndPoint.norm(),
                waypointReached,
                timedOut,
                inPositionTolerance,
                inHeadingTolerance);

        if (waypointReached) {
            currentPathIndex++;
            STATUS.timedOut = timedOut;
            STATUS.finished = true;

            if (currentPathIndex >= paths.length) {
                finished = true;
                STATUS.pathFinished = true;
                setDrivePowers.accept(new PoseVelocity2d(new Vector2d(0, 0), 0));
            }
            return;
        }

        double totalRemainingLength = Math.max(
                PathFollowerUtils.estimateRemainingLength(activeCurve, closestT, REMAINING_LENGTH_SAMPLES),
                robotToEndPoint.norm()
        );

        for (int i = currentPathIndex + 1; i < paths.length; i++) {
            BezierCurve nextCurve = applyAllianceTransform(paths[i].curve);
            totalRemainingLength += PathFollowerUtils.estimateRemainingLength(nextCurve, 0, REMAINING_LENGTH_SAMPLES);
        }

        double signedRemainingLength = totalRemainingLength;
        if (currentPathIndex == paths.length - 1 && closestT >= 1.0 - 1e-3) {
            signedRemainingLength = PathFollowerUtils.projectOnTangent(
                    activeCurve, closestT, robotToEndPoint);
        }

        publishStatus(
                robotPos,
                robotHeadingRad,
                closestPoint,
                endPoint,
                endPoint,
                targetHeadingRad,
                closestT,
                totalRemainingLength,
                false,
                false,
                inPositionTolerance,
                inHeadingTolerance);

        Vector2d driveVector;
        Vector2d linearVector;
        if (BezierFollowerConfig.useVelocityProfile) {
            driveVector = PathFollowerUtils.calculateProfiledDriveVector(
                    activeCurve,
                    robotPos,
                    closestT,
                    signedRemainingLength,
                    fieldVelocity,
                    cruiseVel(basePath),
                    profileDecel(basePath),
                    BezierFollowerConfig.velKv,
                    BezierFollowerConfig.velKs,
                    BezierFollowerConfig.velKp,
                    BezierFollowerConfig.crossTrackKp,
                    basePath.params.minLinearSpeed
            );

            linearVector = driveVector;
        } else {
            driveVector = PathFollowerUtils.calculateDriveVector(
                    activeCurve,
                    robotPos,
                    lookaheadPoint,
                    closestT,
                    totalRemainingLength,
                    BezierFollowerConfig.speedkP,
                    BezierFollowerConfig.speedkF,
                    BezierFollowerConfig.speedkD,
                    fieldVelocity,
                    BezierFollowerConfig.correctivePower
            );
            linearVector = driveVector.times(basePath.params.tolerance.getPositionDampening(robotToEndPoint));
        }

        double rotationPower = PathFollowerUtils.getRotationPower(
                robotHeadingRad,
                targetHeadingRad,
                BezierFollowerConfig.headingkP,
                BezierFollowerConfig.headingkF,
                BezierFollowerConfig.headingkD,
                lastVelRobot.get().angVel,
                Math.toRadians(BezierFollowerConfig.headingFfDeadbandDeg));

        double linearMagnitude = linearVector.norm();

        if (!BezierFollowerConfig.useVelocityProfile) {
            if (linearMagnitude > 1e-6 && linearMagnitude < basePath.params.minLinearSpeed) {
                linearVector = linearVector.times(basePath.params.minLinearSpeed / linearMagnitude);
            }

            if (linearMagnitude > basePath.params.maxLinearSpeed) {
                linearVector = linearVector.times(basePath.params.maxLinearSpeed / linearMagnitude);
            }
        }

        rotationPower = Math.max(-basePath.params.maxTurnPower, Math.min(basePath.params.maxTurnPower, rotationPower));

        Vector2d robotRelativeLinear = PathFollowerUtils.fieldToRobot(linearVector, robotHeadingRad);
        setDrivePowers.accept(new PoseVelocity2d(
                robotRelativeLinear,
                rotationPower * maxAngVel.getAsDouble()
        ));
    }

    private void publishStatus(
            Vector2d robotPos,
            double robotHeadingRad,
            Vector2d closestPoint,
            Vector2d targetPoint,
            Vector2d pathEnd,
            double targetHeadingRad,
            double closestT,
            double remainingLength,
            boolean waypointFinished,
            boolean timedOut,
            boolean inPositionTolerance,
            boolean inHeadingTolerance) {
        STATUS.pathName = name;
        STATUS.robotPosition = robotPos;
        STATUS.robotHeadingRad = robotHeadingRad;
        STATUS.closestPoint = closestPoint;
        STATUS.targetPoint = targetPoint;
        STATUS.pathEnd = pathEnd;
        STATUS.targetHeadingRad = targetHeadingRad;
        STATUS.closestT = closestT;
        STATUS.remainingLength = remainingLength;
        STATUS.distToTarget = PathFollowerUtils.vecDist(robotPos, targetPoint);
        STATUS.finished = waypointFinished;
        STATUS.pathFinished = finished;
        STATUS.inPositionTolerance = inPositionTolerance;
        STATUS.inHeadingTolerance = inHeadingTolerance;
        STATUS.timedOut = timedOut;
        STATUS.waypointIndex = Math.min(currentPathIndex + 1, paths.length);
        STATUS.waypointCount = paths.length;
    }

    /** True when the robot has crossed the plane at the waypoint, along the path's end tangent. */
    private static boolean hasPassedEnd(BezierCurve curve, Vector2d robotToEndPoint) {
        Vector2d endTangent = curve.getDerivative(1);
        double norm = endTangent.norm();
        if (norm < 1e-6) {
            return false;
        }
        return (endTangent.x * robotToEndPoint.x + endTangent.y * robotToEndPoint.y) < 0;
    }

    private static double cruiseVel(BezierPath path) {
        return BezierFollowerConfig.overrideCruiseVel ? BezierFollowerConfig.cruiseVel : path.params.profileCruiseVel;
    }

    private static double profileDecel(BezierPath path) {
        return BezierFollowerConfig.overrideProfileDecel ? BezierFollowerConfig.profileDecel : path.params.profileDecel;
    }

    private void end() {
        setDrivePowers.accept(new PoseVelocity2d(new Vector2d(0, 0), 0));
    }

    @Override
    public boolean run(@NonNull TelemetryPacket packet) {
        if (!initialized) {
            initialize();
            initialized = true;
        }

        execute();

        if (finished) {
            end();
            return false;
        }
        return true;
    }

    /**
     * Alliance-transforms the authored curve. The start point stays on the JSON geometry so the
     * spline does not warp when the robot is a few inches off the first waypoint.
     */
    private BezierCurve createSegmentCurve(BezierCurve baseCurve, Vector2d robotPos) {
        return applyAllianceTransform(baseCurve);
    }

    private List<RotationPoint> createSegmentRotationPoints(ArrayList<RotationPoint> rotationPoints) {
        if (rotationPoints == null || rotationPoints.isEmpty()) {
            return List.of();
        }

        List<RotationPoint> segmentRotationPoints = new ArrayList<>();
        for (RotationPoint rotationPoint : rotationPoints) {
            if (rotationPoint.getT() < ROTATION_START_T_EPSILON) {
                continue;
            }
            double headingRad = rotationPoint.getHeadingRad();
            if (isRed) {
                headingRad = PathFollowerUtils.flipHeadingForRed(headingRad);
            }
            segmentRotationPoints.add(new RotationPoint(headingRad, rotationPoint.getT()));
        }
        return segmentRotationPoints;
    }

    private BezierCurve applyAllianceTransform(BezierCurve curve) {
        if (!isRed) {
            return curve;
        }
        return new BezierCurve(
                FieldConstants.mirrorAlliance(curve.getStart()),
                FieldConstants.mirrorAlliance(curve.getControl1()),
                FieldConstants.mirrorAlliance(curve.getControl2()),
                FieldConstants.mirrorAlliance(curve.getEnd())
        );
    }
}
