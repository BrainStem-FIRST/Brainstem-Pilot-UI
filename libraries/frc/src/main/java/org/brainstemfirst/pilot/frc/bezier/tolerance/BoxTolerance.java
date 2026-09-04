package org.brainstemfirst.pilot.frc.bezier.tolerance;

import java.util.ArrayList;
import java.util.Arrays;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.math.util.Units;

public class BoxTolerance implements Tolerance {
    public static class DefaultParams {
        public double xTol = Units.inchesToMeters(3);
        public double yTol = Units.inchesToMeters(3);
        public Rotation2d headingTol = Rotation2d.fromDegrees(4);
    }
    public static DefaultParams defaultParams = new DefaultParams();
    private final double xTol, yTol;
    private final Rotation2d headingTol;
    public BoxTolerance(double xTol, double yTol, Rotation2d headingTol) {
        this.xTol = xTol;
        this.yTol = yTol;
        this.headingTol = headingTol;
    }

    public BoxTolerance(double distTol, Rotation2d headingTol) {
        this(distTol, distTol, headingTol);
    }
    public BoxTolerance() {
        this(defaultParams.xTol, defaultParams.yTol, defaultParams.headingTol);
    }
    @Override
    public boolean inPositionTolerance(Translation2d positionError) {
        return Math.abs(positionError.getX()) <= xTol && Math.abs(positionError.getY()) <= yTol;
    }

    @Override
    public boolean inHeadingTolerance(Rotation2d headingRadError) {
        return Math.abs(headingRadError.getRadians()) < headingTol.getRadians();
    }

    @Override
    public double getPositionDampening(Translation2d positionError) {
        double radius = Math.min(xTol, yTol);
        return Math.min(1, positionError.getSquaredNorm() / radius * radius);
    }
    @Override
    public double getHeadingDampening(Rotation2d headingError) {
        return Math.min(1, Math.abs(headingError.getRadians()) / headingTol.getRadians());
    }

    @Override
    public ArrayList<Translation2d> getToleranceCorners(Translation2d position) {
        double x = xTol * 0.5;
        double y = yTol * 0.5;
        return new ArrayList<>(Arrays.asList(
                new Translation2d(-x, -y).plus(position),
                new Translation2d( x, -y).plus(position),
                new Translation2d( x,  y).plus(position),
                new Translation2d(-x,  y).plus(position)
        ));
    }
}
