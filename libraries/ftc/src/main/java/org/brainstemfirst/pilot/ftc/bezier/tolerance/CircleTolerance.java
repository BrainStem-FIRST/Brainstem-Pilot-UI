package org.brainstemfirst.pilot.ftc.bezier.tolerance;

import com.acmerobotics.roadrunner.Vector2d;

public class CircleTolerance implements Tolerance {
    public static class DefaultParams {
        public double distTol = 3.0;
        public double headingTolDeg = 4.0;
    }
    public static DefaultParams defaultParams = new DefaultParams();
    private final double distTol;
    private final double headingTolRad;

    public CircleTolerance(double distTol, double headingTolDeg) {
        this.distTol = distTol;
        this.headingTolRad = Math.toRadians(headingTolDeg);
    }

    public CircleTolerance() {
        this(defaultParams.distTol, defaultParams.headingTolDeg);
    }

    @Override
    public boolean inPositionTolerance(Vector2d positionError) {
        return positionError.dot(positionError) <= distTol * distTol;
    }

    @Override
    public boolean inHeadingTolerance(double headingErrorRad) {
        return Math.abs(headingErrorRad) < headingTolRad;
    }

    @Override
    public double getPositionDampening(Vector2d positionError) {
        return Math.min(1, positionError.dot(positionError) / (distTol * distTol));
    }

    @Override
    public double getHeadingDampening(double headingErrorRad) {
        return Math.min(1, Math.abs(headingErrorRad) / headingTolRad);
    }
}
