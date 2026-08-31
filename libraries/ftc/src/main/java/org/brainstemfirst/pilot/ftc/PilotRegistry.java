package org.brainstemfirst.pilot.ftc;

import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.InstantAction;

import org.brainstemfirst.pilot.ftc.model.PilotLog;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Maps Pilot JSON subsystem/command names to Road Runner actions.
 * Register from team code: {@code PilotRegistry.addCommand("Collector", "Intake On", () -> ...)}.
 */
public final class PilotRegistry {
    private static final String TAG = "PilotRegistry";
    private static final Map<String, Supplier<Action>> registry = new HashMap<>();

    private PilotRegistry() {}

    public static void addCommand(String subsystemName, String commandName, Supplier<Action> commandSupplier) {
        registry.put(key(subsystemName, commandName), commandSupplier);
    }

    public static Action getCommand(String subsystemName, String commandName) {
        Supplier<Action> supplier = registry.get(key(subsystemName, commandName));
        if (supplier == null) {
            PilotLog.warn(TAG, "No registered command for: " + key(subsystemName, commandName));
            return new InstantAction(() -> {});
        }
        return supplier.get();
    }

    private static String key(String subsystemName, String commandName) {
        return subsystemName + ":" + commandName;
    }
}
