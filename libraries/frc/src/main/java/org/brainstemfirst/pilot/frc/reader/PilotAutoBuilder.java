package org.brainstemfirst.pilot.frc.reader;

import edu.wpi.first.wpilibj2.command.Command;
import org.brainstemfirst.pilot.frc.model.FieldSide;

/**
 * Fluent builder for BrainstemPilot autos and standalone paths. By default builds for the side
 * marked in the path's {@code startSide} field; use {@link #forSide(FieldSide)} or
 * {@link #mirrorSide()} to run on the opposite side.
 */
public class PilotAutoBuilder {

    enum Target {
        AUTO,
        PATH
    }

    private final String m_name;
    private final Target m_target;
    private FieldSide m_runSide = null;

    PilotAutoBuilder(String name, Target target) {
        m_name = name;
        m_target = target;
    }

    static PilotAutoBuilder forAuto(String autoId) {
        return new PilotAutoBuilder(autoId, Target.AUTO);
    }

    static PilotAutoBuilder forPath(String pathId) {
        return new PilotAutoBuilder(pathId, Target.PATH);
    }

    /** Run on the given field side, mirroring if it differs from the path's authored {@code startSide}. */
    public PilotAutoBuilder forSide(FieldSide side) {
        m_runSide = side;
        return this;
    }

    /** Run on the opposite side from how the path was authored. */
    public PilotAutoBuilder mirrorSide() {
        m_runSide = getAuthoredStartSide().opposite();
        return this;
    }

    /** Build the command for the selected side (or the authored side if none was selected). */
    public Command build() {
        FieldSide runSide = m_runSide != null ? m_runSide : getAuthoredStartSide();
        return m_target == Target.AUTO
            ? BrainstemPilot.buildAutoInternal(m_name, runSide)
            : BrainstemPilot.buildPathInternal(m_name, runSide);
    }

    private FieldSide getAuthoredStartSide() {
        return m_target == Target.AUTO
            ? BrainstemPilot.getAuthoredStartSide(m_name)
            : BrainstemPilot.getPathStartSide(m_name);
    }
}
