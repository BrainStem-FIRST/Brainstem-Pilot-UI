package org.brainstemfirst.pilot.ftc.bezier.tolerance;

import com.acmerobotics.roadrunner.Vector2d;

public interface Tolerance {
    boolean inPositionTolerance(Vector2d positionError);
    boolean inHeadingTolerance(double headingErrorRad);
    double getPositionDampening(Vector2d positionError);
    double getHeadingDampening(double headingErrorRad);
}
