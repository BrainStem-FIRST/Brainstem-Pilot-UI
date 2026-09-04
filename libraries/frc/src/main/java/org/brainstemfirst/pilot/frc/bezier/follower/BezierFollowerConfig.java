package org.brainstemfirst.pilot.frc.bezier.follower;

/**
 * Tunable Bézier follower gains. Not team-robot specific — edit these (or bind them to a dashboard)
 * rather than putting controller gains on each path.
 *
 * <p>Unlike the FTC library, FRC commands {@code ChassisSpeeds} in m/s, so {@code velKv}/{@code velKs}/{@code velKp}
 * and {@code crossTrackKp} are in metres, not normalised power / inches.
 */
public class BezierFollowerConfig {
    public static boolean useVelocityProfile = true;
    public static double velKv = 1.0;
    public static double velKs = 0.05;
    public static double velKp = 0.5;
    public static double crossTrackKp = 2.0;

    public static double speedkP = 1.0, speedkF = 0.1, speedkD = 0.0;
    public static double correctivePower = 0.9;

    public static double headingkP = 0.75, headingkF = 0.01;
    public static boolean overrideCruiseVel = false;
    public static double cruiseVel = 4.0;
    public static boolean overrideProfileDecel = false;
    public static double profileDecel = 3.0;
}
