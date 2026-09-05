package org.brainstemfirst.pilot.frc.reader;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.kinematics.ChassisSpeeds;
import edu.wpi.first.wpilibj.DriverStation.Alliance;
import edu.wpi.first.wpilibj.Filesystem;
import edu.wpi.first.wpilibj.smartdashboard.Field2d;
import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.Commands;
import edu.wpi.first.wpilibj2.command.Subsystem;
import org.brainstemfirst.pilot.frc.PilotRegistry;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.RotationPoint;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierDrivePath;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierPath;
import org.brainstemfirst.pilot.frc.model.FieldConstants;
import org.brainstemfirst.pilot.frc.model.FieldSide;
import org.brainstemfirst.pilot.frc.model.PilotAuto;
import org.brainstemfirst.pilot.frc.model.PilotPoint;
import org.brainstemfirst.pilot.frc.model.PilotSlot;
import org.brainstemfirst.pilot.frc.model.TriggerWatcher;

/**
 * Reads Brainstem Pilot autos from the deploy directory and builds them into WPILib commands.
 *
 * <p>An auto is one self-contained {@code autos/<id>.auto.json} listing its slots in execution
 * order. Building one runs three passes, in this order — the order matters:
 *
 * <ol>
 *   <li><b>Chain</b> — walk the sequence, snapping each positional slot onto the running pose left
 *       by the previous one. This reproduces {@code buildAutoChain} in the editor, so the robot
 *       drives the route the editor previewed.
 *   <li><b>Mirror</b> — reflect the whole resolved geometry across the field's centre line if the
 *       requested side differs from the authored one. Mirroring individual paths <em>before</em>
 *       chaining would not produce the same route.
 *   <li><b>Compose</b> — turn the resolved slots into a command sequence.
 * </ol>
 *
 * <p>Alliance mirroring is not handled here; it is applied downstream, per curve, by
 * {@link BezierDrivePath}.
 */
public class BrainstemPilot {

    private static final ObjectMapper m_objectMapper = new ObjectMapper();
    private static Supplier<Pose2d> m_pose;
    private static Supplier<ChassisSpeeds> m_fieldRelativeSpeeds;
    private static Consumer<ChassisSpeeds> m_runVelocity;
    private static DoubleSupplier m_maxAngularSpeedRadPerSec;
    private static Subsystem m_driveSubsystem;
    private static BezierParams m_defaultParams;

    private static final Map<String, List<BezierPath[]>> m_parsedAutosCache = new HashMap<>();
    private static final Map<String, Pose2d> m_startingPoseCache = new HashMap<>();

    public static final String PATH_CHOOSER_PREFIX = "path:";

    /**
     * Geometry-only init (tests, starting-pose resolution). Drive commands cannot be built until
     * the drive callbacks are bound.
     */
    public static void initialize(BezierParams defaultParams) {
        m_pose = null;
        m_fieldRelativeSpeeds = null;
        m_runVelocity = null;
        m_maxAngularSpeedRadPerSec = null;
        m_driveSubsystem = null;
        m_defaultParams = defaultParams;
    }

    /**
     * Bind the team's drive without that class implementing a library interface.
     *
     * @param drive subsystem required by path-follow commands
     */
    public static void initialize(
            Subsystem drive,
            Supplier<Pose2d> pose,
            Supplier<ChassisSpeeds> fieldRelativeSpeeds,
            Consumer<ChassisSpeeds> runVelocity,
            DoubleSupplier maxAngularSpeedRadPerSec) {
        initialize(drive, pose, fieldRelativeSpeeds, runVelocity, maxAngularSpeedRadPerSec, new BezierParams());
    }

    public static void initialize(
            Subsystem drive,
            Supplier<Pose2d> pose,
            Supplier<ChassisSpeeds> fieldRelativeSpeeds,
            Consumer<ChassisSpeeds> runVelocity,
            DoubleSupplier maxAngularSpeedRadPerSec,
            BezierParams defaultParams) {
        m_driveSubsystem = drive;
        m_pose = pose;
        m_fieldRelativeSpeeds = fieldRelativeSpeeds;
        m_runVelocity = runVelocity;
        m_maxAngularSpeedRadPerSec = maxAngularSpeedRadPerSec;
        m_defaultParams = defaultParams;
    }

    public static PilotAutoBuilder buildAuto(String autoId) {
        requireInitialized();
        return PilotAutoBuilder.forAuto(autoId);
    }

    /**
     * Starts building a standalone drive command from a single path JSON file.
     *
     * @param pathId The path filename without {@code .path.json} (e.g. {@code Drive_to_Neutral_Zone})
     */
    public static PilotAutoBuilder buildPath(String pathId) {
        requireInitialized();
        return PilotAutoBuilder.forPath(pathId);
    }

    private static void requireInitialized() {
        if (m_pose == null || m_defaultParams == null) {
            throw new IllegalStateException("BrainstemPilot must be initialized before constructing autonomous routes.");
        }
    }

    /** Returns the {@code startSide} field from a path JSON file. */
    public static FieldSide getPathStartSide(String pathId) {
        try {
            return PathParser.readStartSide(pathId);
        } catch (IOException e) {
            System.err.println("[BrainstemPilot] WARNING: Failed to read startSide for path: " + pathId);
            e.printStackTrace();
            return FieldSide.RIGHT;
        }
    }

    /**
     * Returns the side an auto was authored on.
     *
     * <p>{@code startSide} lives on path records, not on autos, so this walks the sequence for the
     * first non-skipped {@code path} slot and reads {@code startSide} from that path's file. Falls
     * back to {@link FieldSide#fromStartSideKey}'s default when the auto contains no usable path.
     */
    public static FieldSide getAuthoredStartSide(String autoId) {
        try {
            PilotAuto auto = loadAuto(autoId);
            if (auto == null) {
                return FieldSide.fromStartSideKey(null);
            }

            String firstPathId = resolveFirstPathId(auto);
            if (firstPathId == null) {
                System.err.println("[BrainstemPilot] WARNING: No path found to read startSide for: " + autoId);
                return FieldSide.fromStartSideKey(null);
            }

            return PathParser.readStartSide(firstPathId);
        } catch (IOException e) {
            System.err.println("[BrainstemPilot] WARNING: Failed to read startSide for: " + autoId);
            e.printStackTrace();
            return FieldSide.fromStartSideKey(null);
        }
    }


    /** One sequence slot after chaining and mirroring. {@code segments} is null for non-positional slots. */
    static class ResolvedSlot {
        final PilotSlot slot;
        final String label;
        BezierPath[] segments;

        ResolvedSlot(PilotSlot slot, String label, BezierPath[] segments) {
            this.slot = slot;
            this.label = label;
            this.segments = segments;
        }
    }

    /** An auto's geometry after chaining and mirroring, with the pose it starts from. */
    static class ResolvedAuto {
        final List<ResolvedSlot> slots = new ArrayList<>();
        Pose2d startPose = null;
    }

    /**
     * Walks the sequence, chaining positional slots onto one another, then mirrors the whole
     * result if requested.
     *
     * @param withTriggers when false, trigger commands are not instantiated — used by geometry-only
     *                     callers such as {@link #getStartingPose}
     */
    static ResolvedAuto resolveAuto(PilotAuto auto, boolean shouldMirrorSide, boolean withTriggers) {
        ResolvedAuto resolved = new ResolvedAuto();
        Pose2d runningPose = null;

        for (PilotSlot slot : auto.sequence) {
            if (slot == null || slot.type == null) {
                continue;
            }
            if (slot.skip) {
                continue;
            }

            if (slot.isType("path")) {
                if (slot.pathId == null || slot.pathId.isEmpty()) {
                    System.err.println("[BrainstemPilot] WARNING: Path ID was empty for slot: " + slot.id);
                    continue;
                }
                try {
                    PathParser.PathData data = PathParser.readPathData(slot.pathId);
                    data.chainTo(runningPose);
                    if (resolved.startPose == null) {
                        resolved.startPose = new Pose2d(
                            data.first().x, data.first().y, Rotation2d.fromDegrees(data.first().rotationDeg));
                    }
                    runningPose = data.endPose();
                    resolved.slots.add(new ResolvedSlot(
                        slot, slot.pathId, PathParser.buildSegments(data, m_defaultParams, withTriggers)));
                } catch (IOException e) {
                    System.err.println("[BrainstemPilot] ERROR: Skipping invalid path: " + slot.pathId);
                    e.printStackTrace();
                }

            } else if (slot.isType("point")) {
                if (slot.pointId == null || slot.pointId.isEmpty()) {
                    System.err.println("[BrainstemPilot] WARNING: Point ID was empty for slot: " + slot.id);
                    continue;
                }
                try {
                    PilotPoint point = loadPoint(slot.pointId);
                    if (point == null) {
                        continue;
                    }
                    Pose2d pointPose = new Pose2d(point.x, point.y, Rotation2d.fromDegrees(point.rotation));

                    if (runningPose == null) {
                        resolved.startPose = pointPose;
                        runningPose = pointPose;
                        resolved.slots.add(new ResolvedSlot(slot, slot.pointId, null));
                    } else {
                        PathParser.PathData data = PathParser.connectingSegment(
                            slot.pointId, runningPose, point, slot.params, slot.subsystemTriggers);
                        runningPose = data.endPose();
                        resolved.slots.add(new ResolvedSlot(
                            slot, slot.pointId, PathParser.buildSegments(data, m_defaultParams, withTriggers)));
                    }
                } catch (IOException e) {
                    System.err.println("[BrainstemPilot] ERROR: Skipping invalid point: " + slot.pointId);
                    e.printStackTrace();
                }

            } else {
                resolved.slots.add(new ResolvedSlot(slot, slot.id, null));
            }
        }

        if (shouldMirrorSide) {
            for (ResolvedSlot resolvedSlot : resolved.slots) {
                if (resolvedSlot.segments != null) {
                    resolvedSlot.segments = mirrorSide(resolvedSlot.segments);
                }
            }
            if (resolved.startPose != null) {
                resolved.startPose = FieldConstants.mirrorSide(resolved.startPose);
            }
        }

        return resolved;
    }

    static Command buildAutoInternal(String autoId, FieldSide runSide) {
        requireInitialized();
        try {
            PilotAuto auto = loadAuto(autoId);
            if (auto == null || auto.sequence == null) {
                return Commands.none();
            }

            boolean shouldMirrorSide = runSide != getAuthoredStartSide(autoId);
            ResolvedAuto resolved = resolveAuto(auto, shouldMirrorSide, true);

            List<Command> autoCommandsSequence = new ArrayList<>();
            List<BezierPath[]> pathsToCache = new ArrayList<>();

            for (ResolvedSlot resolvedSlot : resolved.slots) {
                PilotSlot slot = resolvedSlot.slot;

                if (resolvedSlot.segments != null) {
                    autoCommandsSequence.add(buildPathCommand(resolvedSlot.label, resolvedSlot.segments));
                    pathsToCache.add(resolvedSlot.segments);

                } else if (slot.isType("wait")) {
                    if (slot.duration > 0) {
                        autoCommandsSequence.add(Commands.waitSeconds(slot.duration));
                    }

                } else if (slot.isType("subsystem")) {
                    if (slot.subsystemName != null && slot.commandName != null) {
                        autoCommandsSequence.add(PilotRegistry.getCommand(slot.subsystemName, slot.commandName));
                    } else {
                        System.err.println("[BrainstemPilot] WARNING: Subsystem command missing name fields, id: " + slot.id);
                    }

                } else if (slot.isType("parallel")) {
                    Command parallel = buildParallelCommand(slot);
                    if (parallel != null) {
                        autoCommandsSequence.add(parallel);
                    }
                }
            }

            if (!pathsToCache.isEmpty()) {
                m_parsedAutosCache.put(autoCacheKey(autoId, runSide), pathsToCache);
            }

            return Commands.sequence(autoCommandsSequence.toArray(new Command[0]));

        } catch (Exception e) {
            System.err.println("[BrainstemPilot] CRITICAL: Engine failure loading routing profiles for: " + autoId);
            e.printStackTrace();
            return Commands.none();
        }
    }

    static Command buildPathInternal(String pathId, FieldSide runSide) {
        requireInitialized();
        boolean shouldMirrorSide = runSide != getPathStartSide(pathId);

        try {
            PathParser.PathData data = PathParser.readPathData(pathId);
            BezierPath[] pathSegments = PathParser.buildSegments(data, m_defaultParams, true);
            if (shouldMirrorSide) {
                pathSegments = mirrorSide(pathSegments);
            }

            List<BezierPath[]> cachedPaths = new ArrayList<>();
            cachedPaths.add(pathSegments);
            m_parsedAutosCache.put(pathCacheKey(pathId, runSide), cachedPaths);
            return buildPathCommand(pathId, pathSegments);
        } catch (IOException e) {
            System.err.println("[BrainstemPilot] ERROR: Failed to load path: " + pathId);
            e.printStackTrace();
            return Commands.none();
        }
    }

    private static Command buildParallelCommand(PilotSlot slot) {
        if (slot.parallelSubs == null || slot.parallelSubs.isEmpty()) {
            return null;
        }
        List<Command> parallelCmds = new ArrayList<>();
        for (PilotSlot sub : slot.parallelSubs) {
            if (sub == null || sub.skip) {
                continue;
            }
            if (sub.isType("wait")) {
                double wait = sub.defaultWait > 0 ? sub.defaultWait : sub.duration;
                if (wait > 0) {
                    parallelCmds.add(Commands.waitSeconds(wait));
                }
            } else if (sub.subsystemName != null && sub.commandName != null) {
                parallelCmds.add(PilotRegistry.getCommand(sub.subsystemName, sub.commandName));
            }
        }
        return parallelCmds.isEmpty() ? null : Commands.parallel(parallelCmds.toArray(new Command[0]));
    }

    private static Command buildPathCommand(String pathId, BezierPath[] pathSegments) {
        BezierDrivePath driveCommand = new BezierDrivePath(
            pathId, m_pose, m_fieldRelativeSpeeds, m_runVelocity, m_maxAngularSpeedRadPerSec, m_driveSubsystem, pathSegments);

        boolean hasTriggers = false;
        for (BezierPath segment : pathSegments) {
            if (!segment.subsystemTriggers.isEmpty()) {
                hasTriggers = true;
                break;
            }
        }

        return hasTriggers
            ? Commands.deadline(driveCommand, new TriggerWatcher(m_pose, pathSegments))
            : driveCommand;
    }

    /** Chooser value prefix for standalone paths — use with {@link #buildFromChooser(String, FieldSide)}. */
    public static String pathChooserValue(String pathId) {
        return PATH_CHOOSER_PREFIX + pathId;
    }

    public static boolean isPathChooserValue(String chooserValue) {
        return chooserValue != null && chooserValue.startsWith(PATH_CHOOSER_PREFIX);
    }

    /** Builds either a full auto or a standalone path from an auto-chooser entry. */
    public static Command buildFromChooser(String chooserValue, FieldSide runSide) {
        if (isPathChooserValue(chooserValue)) {
            return buildPath(chooserValue.substring(PATH_CHOOSER_PREFIX.length())).forSide(runSide).build();
        }
        return buildAuto(chooserValue).forSide(runSide).build();
    }

    /** Registers every deployed {@code .auto.json} file as an option. */
    public static void registerAutoOptions(java.util.function.BiConsumer<String, String> addOption) {
        for (File autoFile : listFiles("brainstemPilotAuto/autos", ".auto.json")) {
            String autoId = stripSuffix(autoFile.getName(), ".auto.json");
            addOption.accept(autoId.replace("_", " "), autoId);
        }
    }

    /** Registers every deployed {@code .path.json} file as an option. */
    public static void registerPathOptions(java.util.function.BiConsumer<String, String> addOption) {
        for (File pathFile : listFiles("brainstemPilotAuto/paths", ".path.json")) {
            String pathId = stripSuffix(pathFile.getName(), ".path.json");
            addOption.accept("Path - " + pathId.replace("_", " "), pathChooserValue(pathId));
        }
    }

    private static List<File> listFiles(String relativeDir, String suffix) {
        File dir = new File(Filesystem.getDeployDirectory(), relativeDir);
        File[] files = dir.listFiles((d, name) -> name.endsWith(suffix) || name.endsWith(".json"));
        if (files == null) {
            return List.of();
        }
        Arrays.sort(files, Comparator.comparing(File::getName));
        return Arrays.asList(files);
    }

    private static String stripSuffix(String fileName, String suffix) {
        return fileName.endsWith(suffix)
            ? fileName.substring(0, fileName.length() - suffix.length())
            : fileName.substring(0, fileName.length() - ".json".length());
    }

    /**
     * Returns the expected disabled/default starting pose for an auto or standalone path, with the
     * same side and alliance transforms {@link BezierDrivePath} applies.
     */
    public static Optional<Pose2d> getStartingPose(String chooserValue, FieldSide runSide, Alliance alliance) {
        if (m_defaultParams == null || chooserValue == null || alliance == null) {
            return Optional.empty();
        }

        String cacheKey = chooserValue + "|" + runSide.name() + "|" + alliance.name();
        Pose2d cached = m_startingPoseCache.get(cacheKey);
        if (cached != null) {
            return Optional.of(cached);
        }

        try {
            Optional<Pose2d> bluePose = resolveBlueStartingPose(chooserValue, runSide);
            if (bluePose.isEmpty()) {
                return Optional.empty();
            }

            Pose2d pose = alliance == Alliance.Red
                ? FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(bluePose.get()))
                : bluePose.get();
            m_startingPoseCache.put(cacheKey, pose);
            return Optional.of(pose);
        } catch (IOException e) {
            System.err.println("[BrainstemPilot] WARNING: Failed to resolve starting pose for: " + chooserValue);
            e.printStackTrace();
            return Optional.empty();
        }
    }

    /** Starting pose on the blue side, after chaining and side mirroring but before alliance mirroring. */
    private static Optional<Pose2d> resolveBlueStartingPose(String chooserValue, FieldSide runSide) throws IOException {
        if (isPathChooserValue(chooserValue)) {
            String pathId = chooserValue.substring(PATH_CHOOSER_PREFIX.length());
            PathParser.PathData data = PathParser.readPathData(pathId);
            BezierPath[] segments = PathParser.buildSegments(data, m_defaultParams, false);
            if (segments.length == 0) {
                throw new IOException("Path has no segments: " + pathId);
            }
            if (runSide != PathParser.readStartSide(pathId)) {
                segments = mirrorSide(segments);
            }
            return Optional.of(startPoseOf(segments[0]));
        }

        PilotAuto auto = loadAuto(chooserValue);
        if (auto == null || auto.sequence == null) {
            return Optional.empty();
        }

        boolean shouldMirrorSide = runSide != getAuthoredStartSide(chooserValue);

        for (PilotSlot slot : auto.sequence) {
            if (slot == null || slot.skip || slot.type == null || !slot.isPositional()) {
                continue;
            }
            if (slot.isType("path")) {
                if (slot.pathId == null || slot.pathId.isEmpty()) {
                    continue;
                }
                PathParser.PathData data = PathParser.readPathData(slot.pathId);
                BezierPath[] segments = PathParser.buildSegments(data, m_defaultParams, false);
                if (segments.length == 0) {
                    return Optional.empty();
                }
                if (shouldMirrorSide) {
                    segments = mirrorSide(segments);
                }
                return Optional.of(startPoseOf(segments[0]));
            }

            PilotPoint point = loadPoint(slot.pointId);
            if (point == null) {
                return Optional.empty();
            }
            Pose2d pointPose = new Pose2d(point.x, point.y, Rotation2d.fromDegrees(point.rotation));
            return Optional.of(shouldMirrorSide ? FieldConstants.mirrorSide(pointPose) : pointPose);
        }
        return Optional.empty();
    }

    private static Pose2d startPoseOf(BezierPath segment) {
        Rotation2d heading = segment.rotationPoints.isEmpty()
            ? new Rotation2d()
            : segment.rotationPoints.get(0).getRotation();
        return new Pose2d(segment.curve.getStart(), heading);
    }

    public static BezierPath[] mirrorSide(BezierPath[] paths) {
        BezierPath[] mirrored = new BezierPath[paths.length];
        for (int i = 0; i < paths.length; i++) {
            mirrored[i] = mirrorSide(paths[i]);
        }
        return mirrored;
    }

    public static BezierPath mirrorSide(BezierPath path) {
        BezierCurve curve = path.curve;
        BezierCurve mirroredCurve = new BezierCurve(
            FieldConstants.mirrorSide(curve.getStart()),
            FieldConstants.mirrorSide(curve.getControl1()),
            FieldConstants.mirrorSide(curve.getControl2()),
            FieldConstants.mirrorSide(curve.getEnd())
        );

        ArrayList<RotationPoint> mirroredRotations = new ArrayList<>();
        for (RotationPoint rotationPoint : path.rotationPoints) {
            mirroredRotations.add(
                new RotationPoint(rotationPoint.getRotation().times(-1), rotationPoint.getT())
            );
        }

        BezierPath mirroredPath = new BezierPath(mirroredCurve, path.params, mirroredRotations);
        mirroredPath.subsystemTriggers = new ArrayList<>(path.subsystemTriggers);
        return mirroredPath;
    }

    static PilotAuto loadAuto(String autoId) throws IOException {
        File autoFile = new File(
            Filesystem.getDeployDirectory(),
            "brainstemPilotAuto/autos/" + autoId + ".auto.json"
        );
        if (!autoFile.exists()) {
            System.err.println("[BrainstemPilot] ERROR: Missing Auto file: " + autoFile.getAbsolutePath());
            return null;
        }
        JsonNode root = m_objectMapper.readTree(autoFile);
        PathParser.checkSchemaVersion(root, autoFile);
        return m_objectMapper.treeToValue(root, PilotAuto.class);
    }

    private static PilotPoint loadPoint(String pointId) throws IOException {
        File pointFile = new File(
            Filesystem.getDeployDirectory(),
            "brainstemPilotAuto/points/" + pointId + ".point.json"
        );
        if (!pointFile.exists()) {
            System.err.println("[BrainstemPilot] ERROR: Missing Point file: " + pointFile.getAbsolutePath());
            return null;
        }
        JsonNode root = m_objectMapper.readTree(pointFile);
        PathParser.checkSchemaVersion(root, pointFile);

        PilotPoint point = m_objectMapper.treeToValue(root, PilotPoint.class);
        double scale = PathParser.unitScale(root);
        point.x *= scale;
        point.y *= scale;
        return point;
    }

    /** First non-skipped {@code path} slot in the sequence, or null if the auto has none. */
    private static String resolveFirstPathId(PilotAuto auto) {
        if (auto.sequence == null) {
            return null;
        }
        for (PilotSlot slot : auto.sequence) {
            if (slot == null || slot.skip || slot.type == null) {
                continue;
            }
            if (slot.isType("path") && slot.pathId != null && !slot.pathId.isEmpty()) {
                return slot.pathId;
            }
        }
        return null;
    }


    private static String autoCacheKey(String autoId, FieldSide runSide) {
        return autoId + "_" + runSide.name();
    }

    private static String pathCacheKey(String pathId, FieldSide runSide) {
        return "path_" + pathId + "_" + runSide.name();
    }

    public static void draw(Field2d field, String autoId) {
        draw(field, autoId, getAuthoredStartSide(autoId));
    }

    /** Renders all underlying spline sequences of a built auto on a Field2d widget. */
    public static void draw(Field2d field, String autoId, FieldSide runSide) {
        drawCached(field, m_parsedAutosCache.get(autoCacheKey(autoId, runSide)), autoId + " (SeqSeg ");
    }

    public static void drawPath(Field2d field, String pathId, FieldSide runSide) {
        drawCached(field, m_parsedAutosCache.get(pathCacheKey(pathId, runSide)), pathId + " (Seg ");
    }

    private static void drawCached(Field2d field, List<BezierPath[]> completeSequence, String labelPrefix) {
        if (field == null || completeSequence == null) {
            return;
        }
        int globalSegmentCounter = 0;
        for (BezierPath[] segmentGroup : completeSequence) {
            for (BezierPath segment : segmentGroup) {
                segment.curve.draw(field, labelPrefix + globalSegmentCounter + ")", 20);
                globalSegmentCounter++;
            }
        }
    }
}
