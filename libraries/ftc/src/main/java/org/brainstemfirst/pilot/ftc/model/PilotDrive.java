package org.brainstemfirst.pilot.ftc.model;

import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.PoseVelocity2d;

/**
 * Drive port the Bézier follower needs. Team {@code MecanumDrive} (or any other drivetrain)
 * implements this so the library never imports robot-specific Road Runner classes.
 */
public interface PilotDrive {
    Pose2d getPose();

    PoseVelocity2d lastVelRobot();

    void setDrivePowers(PoseVelocity2d powers);

    double maxAngVel();
}
