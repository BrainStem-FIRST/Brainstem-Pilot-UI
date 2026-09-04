package org.brainstemfirst.pilot.frc.model;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;

/** Field coordinate transforms for Brainstem Pilot paths (blue-field authoring). */
public final class FieldConstants {
    private FieldConstants() {}

    public static final double fieldWidthMeters = 8.0693;
    public static final double fieldLengthMeters = 16.541;
    public static final Translation2d fieldCenter =
            new Translation2d(fieldLengthMeters * 0.5, fieldWidthMeters * 0.5);

    public static double mirrorAlliance(double x) {
        return x + (fieldCenter.getX() - x) * 2;
    }

    public static double mirrorSide(double y) {
        return y + (fieldCenter.getY() - y) * 2;
    }

    public static Translation2d mirrorAlliance(Translation2d position) {
        return new Translation2d(mirrorAlliance(position.getX()), position.getY());
    }

    public static Translation2d mirrorSide(Translation2d position) {
        return new Translation2d(position.getX(), mirrorSide(position.getY()));
    }

    public static Pose2d mirrorAlliance(Pose2d pose) {
        return new Pose2d(mirrorAlliance(pose.getTranslation()), Rotation2d.k180deg.minus(pose.getRotation()));
    }

    public static Pose2d mirrorSide(Pose2d pose) {
        return new Pose2d(mirrorSide(pose.getTranslation()), pose.getRotation().times(-1));
    }
}
