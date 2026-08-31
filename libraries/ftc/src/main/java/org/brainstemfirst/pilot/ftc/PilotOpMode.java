package org.brainstemfirst.pilot.ftc;

import com.acmerobotics.dashboard.FtcDashboard;
import com.acmerobotics.dashboard.canvas.Canvas;
import com.acmerobotics.dashboard.config.Config;
import com.acmerobotics.dashboard.telemetry.MultipleTelemetry;
import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.ParallelAction;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.ftc.Actions;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierFollowerConfig;
import org.brainstemfirst.pilot.ftc.bezier.tolerance.CircleTolerance;
import org.brainstemfirst.pilot.ftc.reader.BrainstemPilot;
import org.brainstemfirst.pilot.ftc.model.PilotAlliance;
import org.brainstemfirst.pilot.ftc.model.PilotDrive;
import org.brainstemfirst.pilot.ftc.model.PilotLog;

/**
 * Generic Pilot OpMode loop. Team {@code PilotAutoBase} (created once in the
 * FTC project folder by the editor) subclasses this and supplies robot wiring.
 * Generated OpModes extend the team class, not this one.
 */
@Config
public abstract class PilotOpMode extends LinearOpMode {
    public static PilotAlliance defaultAlliance = PilotAlliance.BLUE;
    public static double maxLinearSpeed = 60;

    private final String autoId;
    private PilotAlliance alliance;
    private BezierParams defaultParams;
    private Action pilotAuto;
    private Pose2d startPose;

    protected PilotOpMode(String autoId) {
        this.autoId = autoId;
    }

    protected abstract void setupRobot(PilotAlliance alliance, Pose2d startPose);

    protected abstract PilotDrive getDrive();

    protected abstract void registerCommands();

    /** Called once after START, before the auto action runs. */
    protected void onOpModeStart() {}

    /** Robot/subsystem loop body. Pose updates belong here. */
    protected abstract boolean updateRobot(TelemetryPacket packet);

    /** Optional field overlay (robot outline, etc.). Path overlay is drawn by the library. */
    protected void drawRobot(Canvas canvas) {}

    protected BezierParams createDefaultBezierParams() {
        return new BezierParams()
                .setMaxLinearSpeed(maxLinearSpeed)
                .setProfileCruiseVel(maxLinearSpeed)
                .setProfileDecel(BezierFollowerConfig.profileDecel)
                .setTolerance(new CircleTolerance(2, 5));
    }

    protected final String autoId() {
        return autoId;
    }

    protected final PilotAlliance alliance() {
        return alliance;
    }

    protected final Pose2d startPose() {
        return startPose;
    }

    @Override
    public void runOpMode() throws InterruptedException {
        telemetry = new MultipleTelemetry(telemetry, FtcDashboard.getInstance().getTelemetry());
        telemetry.setMsTransmissionInterval(11);
        PilotLog.set(telemetry);

        defaultParams = createDefaultBezierParams();
        BrainstemPilot.prepareAssets(hardwareMap.appContext, defaultParams);
        alliance = defaultAlliance;
        applyAllianceConfiguration();

        while (!isStarted() && !isStopRequested()) {
            PilotAlliance previousAlliance = alliance;

            if (gamepad1.xWasPressed()) alliance = PilotAlliance.BLUE;
            if (gamepad1.bWasPressed()) alliance = PilotAlliance.RED;
            if (alliance != previousAlliance) applyAllianceConfiguration();

            telemetry.addData("Auto", autoId);
            telemetry.addData("Alliance", alliance);
            telemetry.addData("Start pose", startPose);
            telemetry.addLine("X = Blue | B = Red");
            telemetry.addLine("Ready — waiting for START");
            telemetry.update();
        }

        waitForStart();

        onOpModeStart();
        Actions.runBlocking(new ParallelAction(pilotAuto, this::runUpdateLoop));
    }

    private void applyAllianceConfiguration() {
        startPose = BrainstemPilot.getStartingPose(autoId, alliance)
                .orElse(new Pose2d(0, 0, 0));
        setupRobot(alliance, startPose);
        registerCommands();
        BrainstemPilot.initialize(hardwareMap.appContext, getDrive(), alliance, defaultParams);
        pilotAuto = BrainstemPilot.buildAuto(autoId).build();
    }

    private boolean runUpdateLoop(TelemetryPacket packet) {
        boolean keepRunning = updateRobot(packet);
        BrainstemPilot.draw(packet.fieldOverlay(), autoId);
        drawRobot(packet.fieldOverlay());
        return keepRunning;
    }
}
