package org.brainstemfirst.pilot.ftc.bezier.follower;

/**
 * Global Bézier follower gains. Set these in {@code PilotAutoBase.configureFollower()}.
 * They are read every loop — changing them in team code takes effect immediately.
 */
public class BezierFollowerConfig {
    public static boolean useVelocityProfile = true;
    public static double velKv = 0.014;
    public static double velKs = 0.03;
    public static double velKp = 0.05;
    public static double crossTrackKp = 0.05;

    public static double speedkP = 0.05, speedkF = 0.05, speedkD = 0.0;
    public static double correctivePower = 0.7;

    public static double headingkP = 0.05, headingkF = 0.05;
    public static boolean overrideCruiseVel = false;
    public static double cruiseVel = 30;
    public static boolean overrideProfileDecel = false;
    public static double profileDecel = 40;
}
