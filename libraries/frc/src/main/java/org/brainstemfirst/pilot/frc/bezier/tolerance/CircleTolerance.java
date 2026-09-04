package org.brainstemfirst.pilot.frc.bezier.tolerance;

import java.util.ArrayList;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.math.util.Units;

public class CircleTolerance implements Tolerance {
    public static class DefaultParams {
        public double distTol = Units.inchesToMeters(3);
        public Rotation2d headingTol = Rotation2d.fromDegrees(4);
        public int numToleranceCorners = 16;
    }
    public static DefaultParams defaultParams = new DefaultParams();
    private final double distTol;
    private final Rotation2d headingTol;
    public CircleTolerance(double distTol, Rotation2d headingTol) {
        this.distTol = distTol;
        this.headingTol = headingTol;
    }

    public CircleTolerance() {
        this(defaultParams.distTol, defaultParams.headingTol);
    }
    @Override
    public boolean inPositionTolerance(Translation2d positionError) {
        return positionError.getSquaredNorm() <= distTol * distTol;
    }

    @Override
    public boolean inHeadingTolerance(Rotation2d headingError) {
        return Math.abs(headingError.getRadians()) < headingTol.getRadians();
    }

    @Override
    public double getPositionDampening(Translation2d positionError) {
        return Math.min(1, positionError.getSquaredNorm() / (distTol * distTol));
    }
    @Override
    public double getHeadingDampening(Rotation2d headingError) {
        return Math.min(1, Math.abs(headingError.getRadians()) / headingTol.getRadians());
    }

    @Override
    public ArrayList<Translation2d> getToleranceCorners(Translation2d waypointPosition) {
        double r = distTol * 0.5;
        ArrayList<Translation2d> edges = new ArrayList<>();
        double angleChange = 2 * Math.PI / defaultParams.numToleranceCorners;
        for (int i=0; i<defaultParams.numToleranceCorners; i++) {
            double angle = i * angleChange;
            edges.add(new Translation2d(Math.cos(angle) * r, Math.sin(angle) * r).plus(waypointPosition));
        }
        return edges;
    }
}
