package org.brainstemfirst.pilot.ftc.bezier.follower;

/**
 * Global Bézier follower gains, read every loop.
 * FTC teams should edit these from FTC Dashboard via the TeamCode {@code BezierFollower} mirror
 * (library classes are not scanned by Dashboard).
 */
public class BezierFollowerConfig {
    public static boolean useVelocityProfile = true;
    public static double velKv = 0.014;
    public static double velKs = 0.03;
    public static double velKp = 0.05;
    public static double crossTrackKp = 0.12;

    public static double speedkP = 0.05, speedkF = 0.05, speedkD = 0.0;
    public static double correctivePower = 0.7;

    public static double headingkP = 0.35;
    public static double headingkD = 0.02;
    public static double headingkF = 0.0;
    /** Static heading FF is applied only when |heading error| exceeds this, in degrees. */
    public static double headingFfDeadbandDeg = 8.0;

    public static boolean overrideCruiseVel = false;
    public static double cruiseVel = 30;
    public static boolean overrideProfileDecel = false;
    public static double profileDecel = 40;
}
