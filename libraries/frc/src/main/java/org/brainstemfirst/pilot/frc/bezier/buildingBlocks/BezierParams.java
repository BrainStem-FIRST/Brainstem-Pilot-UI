package org.brainstemfirst.pilot.frc.bezier.buildingBlocks;

import org.brainstemfirst.pilot.frc.bezier.tolerance.CircleTolerance;
import org.brainstemfirst.pilot.frc.bezier.tolerance.Tolerance;

/**
 * Per-path Bezier parameters — the values that legitimately differ between one path and the next,
 * and that come from the path JSON.
 *
 * <p>Controller gains are deliberately NOT here. They are global to the robot, not to a path, and
 * they live on {@code BezierFollowerConfig} so there is a single surface to tune. Keeping them
 * out of this class also means a gain edit takes effect immediately, rather than being baked into
 * every segment at auto-build time.
 */
public class BezierParams {

    public Tolerance tolerance = new CircleTolerance();

    public boolean passPosition = false;

    public double profileCruiseVel = 4.0;
    public double profileDecel = 3.0;

    public double minLinearSpeed = 0.0;
    public double maxLinearSpeed = 4.75;
    public double maxTurnPower = 1.0;

    /** Seconds to finish this segment. {@code NaN} means unset (no timeout). Set from the UI optional param. */
    public double maxTime = Double.NaN;

    public BezierParams setTolerance(Tolerance tolerance) {
        this.tolerance = tolerance;
        return this;
    }

    public BezierParams setPassPosition(boolean passPosition) {
        this.passPosition = passPosition;
        return this;
    }

    public BezierParams setProfileCruiseVel(double profileCruiseVel) {
        this.profileCruiseVel = profileCruiseVel;
        return this;
    }

    public BezierParams setProfileDecel(double profileDecel) {
        this.profileDecel = profileDecel;
        return this;
    }

    public BezierParams setMinLinearSpeed(double minLinearPower) {
        this.minLinearSpeed = minLinearPower;
        return this;
    }

    public BezierParams setMaxLinearSpeed(double maxLinearSpeed) {
        this.maxLinearSpeed = maxLinearSpeed;
        return this;
    }

    public BezierParams setFixedLinearPower(double power) {
        this.minLinearSpeed = power;
        this.maxLinearSpeed = power;
        return this;
    }

    public BezierParams setMaxTurnPower(double maxTurnPower) {
        this.maxTurnPower = maxTurnPower;
        return this;
    }

    public BezierParams setMaxTime(double maxTime) {
        this.maxTime = maxTime;
        return this;
    }

    public boolean hasMaxTime() {
        return Double.isFinite(maxTime) && maxTime > 0;
    }
}
