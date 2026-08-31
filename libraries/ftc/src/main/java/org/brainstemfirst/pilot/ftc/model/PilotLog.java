package org.brainstemfirst.pilot.ftc.model;

import com.acmerobotics.dashboard.FtcDashboard;

import org.firstinspires.ftc.robotcore.external.Telemetry;

/** Optional DS/dashboard logging for library code that has no OpMode reference. */
public final class PilotLog {
    private static Telemetry telemetry;

    private PilotLog() {}

    public static void set(Telemetry telemetry) {
        PilotLog.telemetry = telemetry;
    }

    public static void warn(String tag, String message) {
        emit(tag, "WARNING", message, null);
    }

    public static void warn(String tag, String message, Throwable throwable) {
        emit(tag, "WARNING", message, throwable);
    }

    public static void error(String tag, String message) {
        emit(tag, "ERROR", message, null);
    }

    public static void error(String tag, String message, Throwable throwable) {
        emit(tag, "ERROR", message, throwable);
    }

    public static void critical(String tag, String message) {
        emit(tag, "CRITICAL", message, null);
    }

    public static void critical(String tag, String message, Throwable throwable) {
        emit(tag, "CRITICAL", message, throwable);
    }

    private static void emit(String tag, String level, String message, Throwable throwable) {
        Telemetry out = resolveTelemetry();
        if (out == null) {
            return;
        }

        out.addLine("[" + tag + "] " + level + ": " + message);
        if (throwable != null) {
            out.addData("Exception", throwable.getClass().getSimpleName() + ": " + throwable.getMessage());
        }
        out.update();
    }

    private static Telemetry resolveTelemetry() {
        if (telemetry != null) {
            return telemetry;
        }
        try {
            return FtcDashboard.getInstance().getTelemetry();
        } catch (Exception ignored) {
            return null;
        }
    }
}
