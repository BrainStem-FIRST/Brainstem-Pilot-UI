package org.brainstemfirst.pilot.ftc.reader;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import androidx.annotation.NonNull;

import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.InstantAction;
import com.acmerobotics.roadrunner.ParallelAction;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.PoseVelocity2d;
import com.acmerobotics.roadrunner.SequentialAction;
import com.acmerobotics.roadrunner.SleepAction;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.brainstemfirst.pilot.ftc.PilotRegistry;
import org.brainstemfirst.pilot.ftc.model.FieldConstants;
import org.brainstemfirst.pilot.ftc.model.PilotAuto;
import org.brainstemfirst.pilot.ftc.model.PilotPoint;
import org.brainstemfirst.pilot.ftc.model.PilotSlot;
import org.brainstemfirst.pilot.ftc.model.TriggerWatcher;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierDrivePath;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierPath;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import java.util.function.Supplier;

public class BrainstemPilot {

    private static final String TAG = "BrainstemPilot";

    private static final ObjectMapper m_objectMapper = new ObjectMapper();
    private static Context m_appContext;
    private static Supplier<Pose2d> m_pose;
    private static Supplier<PoseVelocity2d> m_lastVelRobot;
    private static Consumer<PoseVelocity2d> m_setDrivePowers;
    private static DoubleSupplier m_maxAngVel;
    private static FieldConstants.Alliance m_alliance;
    private static BezierParams m_defaultParams;

    private static final Map<String, List<BezierPath[]>> m_parsedAutosCache = new HashMap<>();
    private static final Map<String, Pose2d> m_startingPoseCache = new HashMap<>();
    private static final Map<String, PilotPoint> m_pointCache = new HashMap<>();

    public static final String PATH_CHOOSER_PREFIX = "path:";

    public static void initialize(Context appContext, BezierParams defaultParams) {
        m_appContext = appContext.getApplicationContext();
        m_pose = null;
        m_lastVelRobot = null;
        m_setDrivePowers = null;
        m_maxAngVel = null;
        m_alliance = null;
        m_defaultParams = defaultParams;
    }

    public static void initialize(
            Context appContext,
            Supplier<Pose2d> pose,
            Supplier<PoseVelocity2d> lastVelRobot,
            Consumer<PoseVelocity2d> setDrivePowers,
            DoubleSupplier maxAngVel,
            FieldConstants.Alliance alliance,
            BezierParams defaultParams) {
        m_appContext = appContext.getApplicationContext();
        m_pose = pose;
        m_lastVelRobot = lastVelRobot;
        m_setDrivePowers = setDrivePowers;
        m_maxAngVel = maxAngVel;
        m_alliance = alliance;
        m_defaultParams = defaultParams;
    }

    public static PilotAutoBuilder buildAuto(String autoId) {
        requireInitialized();
        return PilotAutoBuilder.forAuto(autoId);
    }

    public static PilotAutoBuilder buildPath(String pathId) {
        requireInitialized();
        return PilotAutoBuilder.forPath(pathId);
    }

    private static void requireInitialized() {
        if (m_pose == null || m_defaultParams == null || m_alliance == null) {
            Log.e(TAG, "BrainstemPilot must be initialized before constructing autonomous routes.");
            throw new IllegalStateException("BrainstemPilot must be initialized before constructing autonomous routes.");
        }
    }

    static Action buildPathInternal(String pathId) {
        try {
            BezierPath[] pathSegments = PathParser.parsePathFile(pathId, m_defaultParams);

            List<BezierPath[]> cachedPaths = new ArrayList<>();
            cachedPaths.add(pathSegments);
            m_parsedAutosCache.put(pathCacheKey(pathId), cachedPaths);
            return buildPathAction(pathId, pathSegments);
        } catch (IOException e) {
            Log.e(TAG, "Failed to load path: " + pathId, e);
            return new InstantAction(() -> {});
        }
    }

    public static String pathChooserValue(String pathId) {
        return PATH_CHOOSER_PREFIX + pathId;
    }

    public static boolean isPathChooserValue(String chooserValue) {
        return chooserValue != null && chooserValue.startsWith(PATH_CHOOSER_PREFIX);
    }

    public static Action buildFromChooser(String chooserValue) {
        if (isPathChooserValue(chooserValue)) {
            return buildPath(chooserValue.substring(PATH_CHOOSER_PREFIX.length())).build();
        }
        return buildAuto(chooserValue).build();
    }

    public static Optional<Pose2d> getStartingPose(String chooserValue, FieldConstants.Alliance alliance) {
        if (m_defaultParams == null || chooserValue == null || alliance == null) {
            return Optional.empty();
        }

        String cacheKey = chooserValue + "|" + alliance.name();
        Pose2d cached = m_startingPoseCache.get(cacheKey);
        if (cached != null) {
            return Optional.of(cached);
        }

        try {
            Pose2d bluePose = isPathChooserValue(chooserValue)
                    ? parseStartingPoseFromPath(chooserValue.substring(PATH_CHOOSER_PREFIX.length()))
                    : parseStartingPoseFromAuto(chooserValue);
            if (bluePose == null) {
                return Optional.empty();
            }

            Pose2d pose = alliance == FieldConstants.Alliance.RED
                    ? FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(bluePose))
                    : bluePose;
            m_startingPoseCache.put(cacheKey, pose);
            return Optional.of(pose);
        } catch (IOException e) {
            Log.w(TAG, "Failed to resolve starting pose for: " + chooserValue, e);
            return Optional.empty();
        }
    }

    /** Returns display name -> chooser value entries for all bundled path JSON files. */
    public static Map<String, String> getAvailablePathOptions() {
        Map<String, String> options = new LinkedHashMap<>();
        try {
            for (String pathId : listPathIds()) {
                String displayName = "Path - " + pathId.replace("_", " ");
                options.put(displayName, pathChooserValue(pathId));
            }
        } catch (IOException e) {
            Log.w(TAG, "Failed to list path assets.", e);
        }
        return options;
    }

    /**
     * Builds {@code autos/<autoId>.auto.json} into a single sequential action.
     *
     * <p>The geometry that joins slots together is not stored in the files — it is implied by
     * sequence order, and is reproduced here to match the editor's preview:
     * <ul>
     *   <li>only {@code path} and {@code point} slots are positional; the rest pass the running
     *       pose through unchanged</li>
     *   <li>the first positional slot starts at its own stored pose</li>
     *   <li>a path's first waypoint snaps to the previous positional slot's end pose</li>
     *   <li>a point is a destination driven to, producing a straight connecting segment that
     *       finishes at the point's own heading</li>
     * </ul>
     */
    static Action buildAutoInternal(String autoId) {
        try {
            PilotAuto auto = loadAuto(autoId);
            if (auto == null || auto.sequence == null) {
                Log.w(TAG, "Auto has no sequence: " + autoId);
                return new InstantAction(() -> {});
            }

            List<Action> autoActionsSequence = new ArrayList<>();
            List<BezierPath[]> pathsToCache = new ArrayList<>();
            Pose2d runningPose = null;

            for (PilotSlot slot : auto.sequence) {
                if (slot.skip) continue;

                if (slot.isType("path")) {
                    if (slot.pathId == null || slot.pathId.isEmpty()) {
                        Log.w(TAG, "Path ID was empty for slot: " + slot.id);
                        continue;
                    }
                    try {
                        BezierPath[] pathSegments =
                                PathParser.parsePathFile(slot.pathId, m_defaultParams, runningPose);

                        autoActionsSequence.add(buildPathAction(slot.pathId, pathSegments));
                        pathsToCache.add(pathSegments);
                        runningPose = PathParser.endPose(pathSegments);
                    } catch (IOException e) {
                        Log.e(TAG, "Skipping invalid path: " + slot.pathId, e);
                    }

                } else if (slot.isType("point")) {
                    if (slot.pointId == null || slot.pointId.isEmpty()) {
                        Log.w(TAG, "Point ID was empty for slot: " + slot.id);
                        continue;
                    }
                    try {
                        PilotPoint point = loadPoint(slot.pointId);
                        Pose2d pointPose = poseOf(point);

                        if (runningPose == null) {
                            runningPose = pointPose;
                            continue;
                        }

                        BezierPath[] pointSegments = PathParser.buildPointSegment(
                                runningPose, point, slot.params, slot.subsystemTriggers, m_defaultParams);

                        autoActionsSequence.add(buildPathAction(slot.pointId, pointSegments));
                        pathsToCache.add(pointSegments);
                        runningPose = pointPose;
                    } catch (IOException e) {
                        Log.e(TAG, "Skipping invalid point: " + slot.pointId, e);
                    }

                } else if (slot.isType("wait")) {
                    double seconds = slot.waitSeconds();
                    if (seconds > 0) {
                        autoActionsSequence.add(new SleepAction(seconds));
                    }

                } else if (slot.isType("subsystem")) {
                    if (slot.subsystemName != null && slot.commandName != null) {
                        autoActionsSequence.add(PilotRegistry.getCommand(slot.subsystemName, slot.commandName));
                    } else {
                        Log.w(TAG, "Subsystem slot missing name fields, id: " + slot.id);
                    }

                } else if (slot.isType("parallel")) {
                    if (slot.parallelSubs != null && !slot.parallelSubs.isEmpty()) {
                        List<Action> parallelActions = new ArrayList<>();
                        for (PilotSlot sub : slot.parallelSubs) {
                            if (sub.isType("wait")) {
                                double seconds = sub.waitSeconds();
                                if (seconds > 0) {
                                    parallelActions.add(new SleepAction(seconds));
                                }
                            } else if (sub.subsystemName != null && sub.commandName != null) {
                                parallelActions.add(PilotRegistry.getCommand(sub.subsystemName, sub.commandName));
                            }
                        }
                        if (!parallelActions.isEmpty()) {
                            autoActionsSequence.add(new ParallelAction(parallelActions.toArray(new Action[0])));
                        }
                    }

                } else {
                    Log.w(TAG, "Unknown slot type '" + slot.type + "' for slot: " + slot.id);
                }
            }

            if (!pathsToCache.isEmpty()) {
                m_parsedAutosCache.put(autoId, pathsToCache);
            }

            return new SequentialAction(autoActionsSequence.toArray(new Action[0]));

        } catch (Exception e) {
            Log.e(TAG, "Engine failure loading routing profiles for: " + autoId, e);
            return new InstantAction(() -> {});
        }
    }

    private static Action buildPathAction(String pathId, BezierPath[] pathSegments) {
        BezierDrivePath driveAction = new BezierDrivePath(
                pathId, m_pose, m_lastVelRobot, m_setDrivePowers, m_maxAngVel, m_alliance, pathSegments);

        boolean hasTriggers = false;
        for (BezierPath segment : pathSegments) {
            if (!segment.subsystemTriggers.isEmpty()) {
                hasTriggers = true;
                break;
            }
        }

        return hasTriggers
                ? new DeadlineAction(driveAction, new TriggerWatcher(m_pose, pathSegments))
                : driveAction;
    }

    private static String pathCacheKey(String pathId) {
        return "path_" + pathId;
    }

    private static PilotAuto loadAuto(String autoId) throws IOException {
        String json = readText("autos/" + autoId + ".auto.json");
        PilotAuto auto = m_objectMapper.readValue(json, PilotAuto.class);
        PathParser.checkSchemaVersion("Auto '" + autoId + "'", auto.schemaVersion, auto.units, auto.headingUnit);
        return auto;
    }

    private static PilotPoint loadPoint(String pointId) throws IOException {
        PilotPoint cachedPoint = m_pointCache.get(pointId);
        if (cachedPoint != null) {
            return cachedPoint;
        }

        String json = readText("points/" + pointId + ".point.json");
        PilotPoint point = m_objectMapper.readValue(json, PilotPoint.class);
        PathParser.checkSchemaVersion("Point '" + pointId + "'", point.schemaVersion, point.units, point.headingUnit);
        m_pointCache.put(pointId, point);
        return point;
    }

    private static Pose2d poseOf(PilotPoint point) {
        return new Pose2d(point.x, point.y, Math.toRadians(point.rotation));
    }

    /** Start pose of an auto: the stored pose of its first non-skipped positional slot. */
    private static Pose2d parseStartingPoseFromAuto(String autoId) throws IOException {
        PilotAuto auto = loadAuto(autoId);
        if (auto == null || auto.sequence == null) {
            return null;
        }

        for (PilotSlot slot : auto.sequence) {
            if (slot.skip) continue;

            if (slot.isType("path") && slot.pathId != null && !slot.pathId.isEmpty()) {
                return parseStartingPoseFromPath(slot.pathId);
            }
            if (slot.isType("point") && slot.pointId != null && !slot.pointId.isEmpty()) {
                return poseOf(loadPoint(slot.pointId));
            }
        }
        return null;
    }

    private static Pose2d parseStartingPoseFromPath(String pathId) throws IOException {
        BezierPath[] segments = PathParser.parsePathFile(pathId, m_defaultParams);
        if (segments.length == 0) {
            throw new IOException("Path has no segments: " + pathId);
        }
        return PathParser.startPose(segments);
    }

    static String readPathText(String pathId) throws IOException {
        try {
            return readText("paths/" + pathId + ".path.json");
        } catch (IOException firstFailure) {
            return readText("paths/" + pathId + ".json");
        }
    }

    static String readText(String relativePath) throws IOException {
        if (m_appContext == null) {
            throw new IllegalStateException("BrainstemPilot must be initialized with app context before loading assets.");
        }
        try (InputStream inputStream = m_appContext.getAssets().open("brainstemPilotAuto/" + relativePath)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[4096];
            int bytesRead;
            while ((bytesRead = inputStream.read(data)) != -1) {
                buffer.write(data, 0, bytesRead);
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static List<String> listPathIds() throws IOException {
        if (m_appContext == null) {
            return List.of();
        }
        AssetManager assets = m_appContext.getAssets();
        String[] files = assets.list("brainstemPilotAuto/paths");
        if (files == null) {
            return List.of();
        }
        Arrays.sort(files, Comparator.naturalOrder());
        List<String> ids = new ArrayList<>();
        for (String fileName : files) {
            if (fileName.endsWith(".path.json")) {
                ids.add(fileName.substring(0, fileName.length() - ".path.json".length()));
            } else if (fileName.endsWith(".json")) {
                ids.add(fileName.substring(0, fileName.length() - ".json".length()));
            }
        }
        return ids;
    }

    private static final class DeadlineAction implements Action {
        private final Action primary;
        private final Action secondary;
        private boolean initialized;

        DeadlineAction(Action primary, Action secondary) {
            this.primary = primary;
            this.secondary = secondary;
        }

        @Override
        public boolean run(@NonNull TelemetryPacket packet) {
            if (!initialized) {
                initialized = true;
            }
            boolean primaryRunning = primary.run(packet);
            secondary.run(packet);
            return primaryRunning;
        }
    }
}
