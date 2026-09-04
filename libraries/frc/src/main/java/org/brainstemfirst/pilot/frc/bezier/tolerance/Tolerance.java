package org.brainstemfirst.pilot.frc.bezier.tolerance;

import java.util.ArrayList;

import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;

public interface Tolerance {
    boolean inPositionTolerance(Translation2d positionError);
    boolean inHeadingTolerance(Rotation2d headingError);
    double getPositionDampening(Translation2d positionError);
    double getHeadingDampening(Rotation2d headingError);
    ArrayList<Translation2d> getToleranceCorners(Translation2d position);
}
