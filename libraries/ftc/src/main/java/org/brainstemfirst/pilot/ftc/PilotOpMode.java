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

/**
 * Base OpMode for BrainSTEM Pilot autos. Generated OpModes extend team {@code PilotAutoBase},
 * which extends this class.
 *
 * <p>Implement {@link #setupRobot}, drive callbacks, {@link #registerCommands}, and
 * {@link #updateRobot}. {@link org.brainstemfirst.pilot.ftc.reader.BrainstemPilot} loads the
 * matching {@code autos/<id>.auto.json} from APK assets.
 */
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

    /** Construct your robot and seed odometry at {@code startPose}. */
    protected abstract void setupRobot(FieldConstants.Alliance alliance, Pose2d startPose);

    /** Current estimated field pose. */
    protected abstract Supplier<Pose2d> pose();

    /** Last robot-relative velocity from the drivetrain. */
    protected abstract Supplier<PoseVelocity2d> lastVelRobot();

    /** Apply a robot-relative velocity command. */
    protected abstract Consumer<PoseVelocity2d> setDrivePowers();

    /** Maximum angular speed (rad/s) used by the follower. */
    protected abstract DoubleSupplier maxAngVel();

    /** Register every UI subsystem/command name with {@link PilotRegistry#addCommand}. */
    protected abstract void registerCommands();

    /** Called once after START, before the auto action runs. */
    protected void onOpModeStart() {}

    /**
     * Subsystem loop while the auto is running. Return {@code true} to keep the parallel update
     * action alive (typically after {@code updatePoseEstimate()}).
     */
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
