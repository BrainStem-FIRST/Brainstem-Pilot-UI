package org.brainstemfirst.pilot.frc.bezier.tolerance;

import java.util.ArrayList;
import java.util.Arrays;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;

public class RotatedBoxTolerance implements Tolerance {
    private final double parallelTol, perpendicularTol;
    private final Rotation2d headingTol;
    private final Rotation2d axisAngle;
    public RotatedBoxTolerance(double parallelTol, double perpendicularTol, Rotation2d axisAngle, Rotation2d headingTol) {
        this.parallelTol = parallelTol;
        this.perpendicularTol = perpendicularTol;
        this.axisAngle = axisAngle;
        this.headingTol = headingTol;
    }

    @Override
    public boolean inPositionTolerance(Translation2d positionError) {
        Translation2d rotatedErrors = positionError.rotateBy(axisAngle.times(-1));
        return Math.abs(rotatedErrors.getX()) <= parallelTol && Math.abs(rotatedErrors.getY()) <= perpendicularTol;
    }

    @Override
    public boolean inHeadingTolerance(Rotation2d headingError) {
        return Math.abs(headingError.getRadians()) < headingTol.getRadians();
    }

    @Override
    public double getPositionDampening(Translation2d positionError) {
        double radius = Math.min(parallelTol, perpendicularTol);
        return Math.min(1, positionError.getSquaredNorm() / (radius * radius));
    }
    @Override
    public double getHeadingDampening(Rotation2d headingError) {
        return Math.min(1, Math.abs(headingError.getRadians()) / headingTol.getRadians());
    }

    @Override
    public ArrayList<Translation2d> getToleranceCorners(Translation2d waypointPosition) {
        double x = parallelTol * 0.5;
        double y = perpendicularTol * 0.5;
        ArrayList<Translation2d> unRotated = new ArrayList<>(Arrays.asList(
                new Translation2d(-x, -y),
                new Translation2d( x, -y),
                new Translation2d( x,  y),
                new Translation2d(-x,  y)
        ));
        ArrayList<Translation2d> rotated = new ArrayList<>();
        for (Translation2d vec : unRotated)
            rotated.add(vec.rotateBy(axisAngle.times(-1)).plus(waypointPosition));
        return rotated;
    }
}
