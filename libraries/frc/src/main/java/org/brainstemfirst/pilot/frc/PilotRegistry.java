package org.brainstemfirst.pilot.frc;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.Commands;

/**
 * Maps Pilot JSON subsystem/command names to WPILib commands.
 * Register from team code: {@code PilotRegistry.addCommand("Collector", "Intake On", () -> ...)}.
 */
public final class PilotRegistry {
    private static final Map<String, Supplier<Command>> registry = new HashMap<>();

    private PilotRegistry() {}

    public static void addCommand(String subsystemName, String commandName, Supplier<Command> commandSupplier) {
        registry.put(key(subsystemName, commandName), commandSupplier);
    }

    public static Command getCommand(String subsystemName, String commandName) {
        Supplier<Command> supplier = registry.get(key(subsystemName, commandName));
        if (supplier == null) {
            System.err.println("[PilotRegistry] WARNING: No registered command for: " + key(subsystemName, commandName));
            return Commands.none();
        }
        return supplier.get();
    }

    private static String key(String subsystemName, String commandName) {
        return subsystemName + ":" + commandName;
    }
}
