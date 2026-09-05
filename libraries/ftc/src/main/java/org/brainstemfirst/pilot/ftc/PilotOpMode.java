package org.brainstemfirst.pilot.ftc;

import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.ParallelAction;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.PoseVelocity2d;
import com.acmerobotics.roadrunner.ftc.Actions;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierFollowerConfig;
import org.brainstemfirst.pilot.ftc.bezier.tolerance.CircleTolerance;
import org.brainstemfirst.pilot.ftc.model.FieldConstants;
import org.brainstemfirst.pilot.ftc.reader.BrainstemPilot;

import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

public abstract class PilotOpMode extends LinearOpMode {
    public static FieldConstants.Alliance defaultAlliance = FieldConstants.Alliance.BLUE;
    public static double maxLinearSpeed = 60;

    private final String autoId;
    private FieldConstants.Alliance alliance;
    private BezierParams defaultParams;
    private Action pilotAuto;
    private Pose2d startPose;

    protected PilotOpMode(String autoId) {
        this.autoId = autoId;
    }

    protected abstract void setupRobot(FieldConstants.Alliance alliance, Pose2d startPose);

    protected abstract Supplier<Pose2d> pose();

    protected abstract Supplier<PoseVelocity2d> lastVelRobot();

    protected abstract Consumer<PoseVelocity2d> setDrivePowers();

    protected abstract DoubleSupplier maxAngVel();

    protected abstract void registerCommands();

    protected void onOpModeStart() {}

    protected abstract boolean updateRobot(TelemetryPacket packet);

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

    protected final FieldConstants.Alliance alliance() {
        return alliance;
    }

    protected final Pose2d startPose() {
        return startPose;
    }

    @Override
    public void runOpMode() throws InterruptedException {
        defaultParams = createDefaultBezierParams();
        BrainstemPilot.initialize(hardwareMap.appContext, defaultParams);
        alliance = defaultAlliance;
        applyAllianceConfiguration();

        while (!isStarted() && !isStopRequested()) {
            FieldConstants.Alliance previousAlliance = alliance;

            if (gamepad1.xWasPressed()) alliance = FieldConstants.Alliance.BLUE;
            if (gamepad1.bWasPressed()) alliance = FieldConstants.Alliance.RED;
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
        BrainstemPilot.initialize(
                hardwareMap.appContext,
                pose(),
                lastVelRobot(),
                setDrivePowers(),
                maxAngVel(),
                alliance,
                defaultParams);
        pilotAuto = BrainstemPilot.buildAuto(autoId).build();
    }

    private boolean runUpdateLoop(TelemetryPacket packet) {
        return updateRobot(packet);
    }
}
