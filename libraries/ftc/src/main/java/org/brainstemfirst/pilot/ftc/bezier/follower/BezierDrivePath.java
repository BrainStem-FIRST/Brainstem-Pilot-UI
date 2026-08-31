package org.brainstemfirst.pilot.ftc.bezier.follower;

import androidx.annotation.NonNull;

import com.acmerobotics.dashboard.canvas.Canvas;
import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.PoseVelocity2d;
import com.acmerobotics.roadrunner.Vector2d;
import com.qualcomm.robotcore.util.ElapsedTime;

import org.brainstemfirst.pilot.ftc.model.FieldConstants;
import org.brainstemfirst.pilot.ftc.model.PilotAlliance;
import org.brainstemfirst.pilot.ftc.model.PilotDrive;
import org.brainstemfirst.pilot.ftc.model.PilotGeometry;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.PathFollowerUtils;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.RotationPoint;

import java.util.ArrayList;
import java.util.List;

public class BezierDrivePath implements Action {

    private static final int CLOSEST_T_COARSE_SAMPLES = 40;
    private static final int CLOSEST_T_MAX_ITERATIONS = 20;
    private static final double CLOSEST_T_TOLERANCE = 1e-4;

    private static final int REMAINING_LENGTH_SAMPLES = 30;
    private static final double LOOKAHEAD_T = 0.08;

    private String name;
    private final PilotDrive drive;
    private final BezierPath[] paths;
    private final PilotAlliance alliance;

    private int currentPathIndex = 0;
    private int lastPathIndex = -1;
    private boolean finished = false;
    private boolean initialized = false;
    private Canvas canvas = null;
    private boolean isRed;

    private final ElapsedTime loopTimer = new ElapsedTime();
    private double loopMs = 0.0;

    private double segmentEntryHeadingRad = 0.0;
    private BezierCurve activeCurve;
    private List<RotationPoint> activeRotationPoints = List.of();

    private static final double ROTATION_START_T_EPSILON = 1e-4;

    public BezierDrivePath(String name, PilotDrive drive, PilotAlliance alliance, BezierPath... paths) {
        this.name = name;
        this.drive = drive;
        this.alliance = alliance;
        this.paths = paths;
    }

    public BezierDrivePath(PilotDrive drive, PilotAlliance alliance, BezierPath... paths) {
        this("PilotPath", drive, alliance, paths);
    }

    public BezierDrivePath setDrawName(String name) {
        this.name = name;
        return this;
    }

    private void initialize() {
        currentPathIndex = 0;
        lastPathIndex = -1;
        finished = false;
        segmentEntryHeadingRad = drive.getPose().heading.toDouble();
        activeCurve = null;
        activeRotationPoints = List.of();
        isRed = alliance == PilotAlliance.RED;
    }

    private void execute(TelemetryPacket packet) {
        loopMs = loopTimer.milliseconds();
        loopTimer.reset();

        if (finished || currentPathIndex >= paths.length) {
            finished = true;
            return;
        }

        BezierPath basePath = paths[currentPathIndex];

        Pose2d robotPose = drive.getPose();
        Vector2d robotPos = robotPose.position;
        double robotHeadingRad = robotPose.heading.toDouble();

        // Cached from the opmode's updatePoseEstimate() call — updating the localizer a second
        // time in the same cycle yields a near-zero dt and a meaningless velocity.
        Vector2d fieldVelocity = PilotGeometry.rotate(drive.lastVelRobot().linearVel, robotHeadingRad);

        double closestT;
        if (currentPathIndex != lastPathIndex) {
            lastPathIndex = currentPathIndex;
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

        double targetHeadingRad;
        if (!activeRotationPoints.isEmpty()) {
            targetHeadingRad = PathFollowerUtils.getTargetRotation(activeRotationPoints, closestT, segmentEntryHeadingRad);
        } else {
            targetHeadingRad = robotHeadingRad;
        }

        double headingErrorRad = PilotGeometry.absHeadingError(targetHeadingRad, robotHeadingRad);

        boolean inPositionTolerance = basePath.params.tolerance.inPositionTolerance(robotToEndPoint);
        boolean inHeadingTolerance = basePath.params.tolerance.inHeadingTolerance(headingErrorRad);

        boolean passPosition = false;
        if (basePath.params.passPosition) {
            Vector2d endTangent = activeCurve.getDerivative(1);
            double dot = endTangent.x * robotToEndPoint.x + endTangent.y * robotToEndPoint.y;
            passPosition = dot < 0;
        }

        if (packet != null) {
            packet.put(preface() + "/end point x", endPoint.x);
            packet.put(preface() + "/end point y", endPoint.y);
            packet.put(preface() + "/current point x", robotPos.x);
            packet.put(preface() + "/current point y", robotPos.y);
            packet.put(preface() + "/in pos tol", inPositionTolerance);
            packet.put(preface() + "/in heading tol", inHeadingTolerance);
            packet.put(preface() + "/loop ms", loopMs);
        }

        if ((inPositionTolerance && inHeadingTolerance) || passPosition) {
            currentPathIndex++;

            if (currentPathIndex >= paths.length) {
                finished = true;
                drive.setDrivePowers(new PoseVelocity2d(new Vector2d(0, 0), 0));
            }
            return;
        }

        Vector2d lookaheadPoint = PathFollowerUtils.getLookaheadPoint(activeCurve, closestT, LOOKAHEAD_T);

        // The curve-projected remaining length collapses to 0 once the robot's closest point
        // reaches/overshoots t=1, even if the robot is still far from the actual end point
        // (e.g. after overshooting). Floor it with the straight-line distance to the end point
        // so the proportional speed term never vanishes while real position error remains.

        double totalRemainingLength = Math.max(
                PathFollowerUtils.estimateRemainingLength(activeCurve, closestT, REMAINING_LENGTH_SAMPLES),
                robotToEndPoint.norm()
        );

        for (int i = currentPathIndex + 1; i < paths.length; i++) {
            BezierCurve nextCurve = applyAllianceTransform(paths[i].curve);
            totalRemainingLength += PathFollowerUtils.estimateRemainingLength(nextCurve, 0, REMAINING_LENGTH_SAMPLES);
        }

        // Unsigned remaining distance is correct while the robot is still short of the endpoint,
        // and correct for every segment that has another one after it. On the final segment,
        // once the robot reaches or passes the end of the curve, the sign has to come from which
        // side of the endpoint it is actually on.
        double signedRemainingLength = totalRemainingLength;
        if (currentPathIndex == paths.length - 1 && closestT >= 1.0 - 1e-3) {
            signedRemainingLength = PathFollowerUtils.projectOnTangent(
                    activeCurve, closestT, robotToEndPoint);
        }

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
                    BezierFollowerConfig.crossTrackKp
            );
            // No tolerance dampening here: the profile already shapes the approach, and scaling
            // the command down near the target would blunt the braking term exactly when it
            // matters most.
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
                robotHeadingRad, targetHeadingRad, BezierFollowerConfig.headingkP, BezierFollowerConfig.headingkF);

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

        Vector2d robotRelativeLinear = PilotGeometry.fieldToRobot(linearVector, robotHeadingRad);
        drive.setDrivePowers(new PoseVelocity2d(
                robotRelativeLinear,
                rotationPower * drive.maxAngVel()
        ));

        if (packet != null) {
            packet.put(preface() + "/is finished", finished);
            packet.put(preface() + "/axial power", robotRelativeLinear.x);
            packet.put(preface() + "/lateral power", robotRelativeLinear.y);
            packet.put(preface() + "/rotation power", rotationPower);
            packet.put(preface() + "/remaining length", totalRemainingLength);
            packet.put(preface() + "/commanded speed", PathFollowerUtils.commandedSpeed(
                    totalRemainingLength, BezierFollowerConfig.speedkP, BezierFollowerConfig.speedkF));
            packet.put(preface() + "/tangential vel", PathFollowerUtils.tangentialVelocity(
                    activeCurve, closestT, fieldVelocity));
            packet.put(preface() + "/linear power", linearVector.norm());
            packet.put(preface() + "/signed remaining", signedRemainingLength);
            packet.put(preface() + "/target vel", Math.signum(signedRemainingLength)
                    * PathFollowerUtils.profileTargetVelocity(
                            Math.abs(signedRemainingLength), cruiseVel(basePath), profileDecel(basePath)));
        }

        if (canvas != null) {
            canvas.setStrokeWidth(1);
            canvas.strokeLine(robotPos.x, robotPos.y, robotPos.x + linearVector.x, robotPos.y + linearVector.y);
            canvas.strokeLine(robotPos.x, robotPos.y, robotPos.x + driveVector.x, robotPos.y + driveVector.y);
        }
    }

    /** Path's own `maxVel`, unless a tuning override is forcing one cruise speed everywhere. */
    private static double cruiseVel(BezierPath path) {
        return BezierFollowerConfig.overrideCruiseVel ? BezierFollowerConfig.cruiseVel : path.params.profileCruiseVel;
    }

    /** Path's own `maxAccel`, unless a tuning override is forcing one decel everywhere. */
    private static double profileDecel(BezierPath path) {
        return BezierFollowerConfig.overrideProfileDecel ? BezierFollowerConfig.profileDecel : path.params.profileDecel;
    }

    private void end() {
        drive.setDrivePowers(new PoseVelocity2d(new Vector2d(0, 0), 0));
    }

    @Override
    public boolean run(@NonNull TelemetryPacket packet) {
        if (!initialized) {
            initialize();
            initialized = true;
        }

        execute(packet);

        if (finished) {
            end();
            return false;
        }
        return true;
    }

    public void draw(Canvas canvas) {
        if (canvas == null) return;
        this.canvas = canvas;
        for (BezierPath path : paths) {
            applyAllianceTransform(path.curve).draw(canvas, 20);
        }
    }

    private BezierCurve createSegmentCurve(BezierCurve baseCurve, Vector2d robotPos) {
        BezierCurve fieldCurve = applyAllianceTransform(baseCurve);
        return new BezierCurve(
                robotPos,
                fieldCurve.getControl1(),
                fieldCurve.getControl2(),
                fieldCurve.getEnd()
        );
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
                headingRad = PilotGeometry.flipHeadingForRed(headingRad);
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
                FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(curve.getStart())),
                FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(curve.getControl1())),
                FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(curve.getControl2())),
                FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(curve.getEnd()))
        );
    }

    public String preface() {
        return "BezierDrive/" + name;
    }
}
