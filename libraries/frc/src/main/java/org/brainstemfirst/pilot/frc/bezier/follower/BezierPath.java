package org.brainstemfirst.pilot.frc.bezier.follower;

import java.util.ArrayList;
import java.util.List;
import edu.wpi.first.wpilibj2.command.Command;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.RotationPoint;

public class BezierPath {
    public final BezierCurve curve;
    public final BezierParams params;
    public final ArrayList<RotationPoint> rotationPoints;
    
    public List<SubsystemTriggerPoint> subsystemTriggers = new ArrayList<>();

    public static class SubsystemTriggerPoint {
        public final Command command;
        public final double arcLengthM;
        public boolean triggered = false;

        public SubsystemTriggerPoint(Command command, double arcLengthM) {
            this.command = command;
            this.arcLengthM = arcLengthM;
        }
    }

    public BezierPath(BezierCurve curve, BezierParams params, ArrayList<RotationPoint> rotationPoints) {
        this.curve = curve;
        this.params = params;
        this.rotationPoints = rotationPoints;
    }
}