package org.brainstemfirst.pilot.frc.model;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.kinematics.ChassisSpeeds;

/**
 * Internal drive port used by the follower. Teams do not implement this — pass pose, velocity,
 * and {@code runVelocity} into {@code BrainstemPilot.initialize}.
 */
public interface PilotDrive {
    Pose2d getPose();

    ChassisSpeeds getFieldRelativeSpeeds();

    void runVelocity(ChassisSpeeds speeds);

    double getMaxAngularSpeedRadPerSec();
}
