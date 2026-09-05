package org.brainstemfirst.pilot.ftc.bezier.buildingBlocks;

import org.brainstemfirst.pilot.ftc.bezier.tolerance.CircleTolerance;
import org.brainstemfirst.pilot.ftc.bezier.tolerance.Tolerance;

/**
 * Per-path Bezier parameters — copied onto each segment when the path JSON is parsed.
 * Controller gains are not here; they live on {@code BezierFollowerConfig} and can be
 * changed from {@code PilotAutoBase} at any time.
 *
 * <p>Overrides in {@code createDefaultBezierParams()} apply only if they run before
 * paths are built (init). Editing this object afterwards does not update running segments.
 */
public class BezierParams {

    public Tolerance tolerance = new CircleTolerance();

    public boolean passPosition = false;

    public double profileCruiseVel = 60.0;
    public double profileDecel = 40.0;

    public double minLinearSpeed = 0.0;
    public double maxLinearSpeed = 100.0;
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
