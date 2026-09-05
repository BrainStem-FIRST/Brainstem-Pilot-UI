package org.brainstemfirst.pilot.frc.bezier.follower;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.math.kinematics.ChassisSpeeds;
import edu.wpi.first.wpilibj.DriverStation;
import edu.wpi.first.wpilibj.DriverStation.Alliance;
import edu.wpi.first.wpilibj.Timer;
import edu.wpi.first.wpilibj.smartdashboard.Field2d;
import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.Subsystem;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.PathFollowerUtils;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.RotationPoint;
import org.brainstemfirst.pilot.frc.model.FieldConstants;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

public class BezierDrivePath extends Command {

    private static final int CLOSEST_T_COARSE_SAMPLES = 40;
    private static final int CLOSEST_T_MAX_ITERATIONS = 20;
    private static final double CLOSEST_T_TOLERANCE = 1e-4;

    private static final int REMAINING_LENGTH_SAMPLES = 30;
    private static final double LOOKAHEAD_T = 0.08;

    private String name;
    private final Supplier<Pose2d> pose;
    private final Supplier<ChassisSpeeds> fieldSpeeds;
    private final Consumer<ChassisSpeeds> setVelocity;
    private final DoubleSupplier maxAngVel;
    private final BezierPath[] paths;

    private int currentPathIndex = 0;
    private int lastPathIndex = -1;
    private boolean finished = false;
    private Field2d field = null;
    private boolean isRed;
    private final Timer segmentTimer = new Timer();

    private Rotation2d segmentEntryHeading = new Rotation2d();
    private BezierCurve activeCurve;
    private List<RotationPoint> activeRotationPoints = List.of();

    private static final double ROTATION_START_T_EPSILON = 1e-4;

    public BezierDrivePath(
            String name,
            Supplier<Pose2d> pose,
            Supplier<ChassisSpeeds> fieldRelativeSpeeds,
            Consumer<ChassisSpeeds> runVelocity,
            DoubleSupplier maxAngularSpeedRadPerSec,
            Subsystem requirement,
            BezierPath... paths) {
        this.name = name;
        this.pose = pose;
        this.fieldSpeeds = fieldRelativeSpeeds;
        this.setVelocity = runVelocity;
        this.maxAngVel = maxAngularSpeedRadPerSec;
        this.paths = paths;

        if (requirement != null) {
            addRequirements(requirement);
        }
    }

    public BezierDrivePath setDrawName(String name) {
        this.name = name;
        return this;
    }

    @Override
    public void initialize() {
        this.currentPathIndex = 0;
        this.lastPathIndex = -1;
        this.finished = false;
        this.segmentEntryHeading = pose.get().getRotation();
        this.activeCurve = null;
        this.activeRotationPoints = List.of();
        isRed = DriverStation.getAlliance().orElse(Alliance.Blue) == Alliance.Red;
        segmentTimer.restart();
    }

    @Override
    public void execute() {
        if (finished || currentPathIndex >= paths.length) {
            finished = true;
            return;
        }

        BezierPath basePath = paths[currentPathIndex];

        Pose2d robotPose = pose.get();
        Translation2d robotPos = robotPose.getTranslation();
        Rotation2d robotHeading = robotPose.getRotation();

        ChassisSpeeds fieldRel = fieldSpeeds.get();
        Translation2d fieldVelocity = new Translation2d(fieldRel.vxMetersPerSecond, fieldRel.vyMetersPerSecond);

        double closestT;
        if (currentPathIndex != lastPathIndex) {
            lastPathIndex = currentPathIndex;
            segmentTimer.restart();
            segmentEntryHeading = robotHeading;
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

        Translation2d endPoint = activeCurve.getEnd();
        Translation2d robotToEndPoint = endPoint.minus(robotPos);

        Rotation2d targetHeading;
        if (!activeRotationPoints.isEmpty()) {
            targetHeading = PathFollowerUtils.getTargetRotation(activeRotationPoints, closestT, segmentEntryHeading);
        } else {
            targetHeading = robotHeading;
        }

        Rotation2d headingError = Rotation2d.fromRadians(Math.abs(targetHeading.minus(robotHeading).getRadians()));

        boolean inPositionTolerance = basePath.params.tolerance.inPositionTolerance(robotToEndPoint);
        boolean inHeadingTolerance = basePath.params.tolerance.inHeadingTolerance(headingError);

        boolean passPosition = false;
        if (basePath.params.passPosition) {
            Translation2d endTangent = activeCurve.getDerivative(1);
            double dot = endTangent.dot(robotToEndPoint);
            passPosition = dot < 0;
        }

        boolean timedOut = basePath.params.hasMaxTime() && segmentTimer.get() > basePath.params.maxTime;
        if ((inPositionTolerance && inHeadingTolerance) || passPosition || timedOut) {
            currentPathIndex++;

            if (currentPathIndex >= paths.length) {
                finished = true;
                setVelocity.accept(new ChassisSpeeds(0, 0, 0));
            }
            return;
        }

        Translation2d lookaheadPoint = PathFollowerUtils.getLookaheadPoint(activeCurve, closestT, LOOKAHEAD_T);

        double totalRemainingLength = Math.max(
                PathFollowerUtils.estimateRemainingLength(activeCurve, closestT, REMAINING_LENGTH_SAMPLES),
                robotToEndPoint.getNorm()
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

        Translation2d driveVector;
        Translation2d linearVector;
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
                robotHeading, targetHeading, BezierFollowerConfig.headingkP, BezierFollowerConfig.headingkF);

        double linearMagnitude = linearVector.getNorm();

        if (!BezierFollowerConfig.useVelocityProfile) {
            if (linearMagnitude > 1e-6 && linearMagnitude < basePath.params.minLinearSpeed) {
                linearVector = linearVector.times(basePath.params.minLinearSpeed / linearMagnitude);
            }

            if (linearMagnitude > basePath.params.maxLinearSpeed) {
                linearVector = linearVector.times(basePath.params.maxLinearSpeed / linearMagnitude);
            }
        }

        rotationPower = Math.max(-basePath.params.maxTurnPower, Math.min(basePath.params.maxTurnPower, rotationPower));

        ChassisSpeeds fieldRelativeSpeeds = new ChassisSpeeds(
            linearVector.getX(),
            linearVector.getY(),
            rotationPower * maxAngVel.getAsDouble()
        );

        setVelocity.accept(ChassisSpeeds.fromFieldRelativeSpeeds(fieldRelativeSpeeds, robotHeading));

        if (field != null) {
            field.getObject(preface() + "LinearVector").setPoses(
                new Pose2d(robotPos, new Rotation2d()),
                new Pose2d(robotPos.plus(linearVector), new Rotation2d())
            );
            field.getObject(preface() + "DriveVector").setPoses(
                new Pose2d(robotPos, new Rotation2d()),
                new Pose2d(robotPos.plus(driveVector), new Rotation2d()));
        }
    }

    /** Path's own {@code maxVel}, unless a tuning override is forcing one cruise speed everywhere. */
    private static double cruiseVel(BezierPath path) {
        return BezierFollowerConfig.overrideCruiseVel
                ? BezierFollowerConfig.cruiseVel
                : path.params.profileCruiseVel;
    }

    /** Path's own {@code maxAccel}, unless a tuning override is forcing one decel everywhere. */
    private static double profileDecel(BezierPath path) {
        return BezierFollowerConfig.overrideProfileDecel
                ? BezierFollowerConfig.profileDecel
                : path.params.profileDecel;
    }

    @Override
    public void end(boolean interrupted) {
        setVelocity.accept(new ChassisSpeeds(0, 0, 0));
    }

    @Override
    public boolean isFinished() {
        return finished;
    }

    public void draw(Field2d field) {
        if (field == null) return;
        this.field = field;
        for (BezierPath path : paths) {
            applyAllianceTransform(path.curve).draw(field, name, 20);
        }
    }

    /**
     * Rebuilds a segment curve on entry so P0 is the robot's current position while the authored
     * control points and endpoint are preserved. This lets chained paths continue from wherever
     * the robot actually is instead of driving back to the JSON's first waypoint.
     */
    private BezierCurve createSegmentCurve(BezierCurve baseCurve, Translation2d robotPos) {
        BezierCurve fieldCurve = applyAllianceTransform(baseCurve);
        return new BezierCurve(
            robotPos,
            fieldCurve.getControl1(),
            fieldCurve.getControl2(),
            fieldCurve.getEnd()
        );
    }

    /** Drops authored t=0 headings; segment entry uses the robot's actual heading instead. */
    private List<RotationPoint> createSegmentRotationPoints(ArrayList<RotationPoint> rotationPoints) {
        if (rotationPoints == null || rotationPoints.isEmpty()) {
            return List.of();
        }

        List<RotationPoint> segmentRotationPoints = new ArrayList<>();
        for (RotationPoint rotationPoint : rotationPoints) {
            if (rotationPoint.getT() < ROTATION_START_T_EPSILON) {
                continue;
            }
            Rotation2d heading = rotationPoint.getRotation();
            if (isRed) {
                heading = Rotation2d.k180deg.plus(heading);
            }
            segmentRotationPoints.add(new RotationPoint(heading, rotationPoint.getT()));
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
