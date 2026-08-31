package org.brainstemfirst.pilot.ftc.reader;

import android.content.Context;

import com.acmerobotics.dashboard.canvas.Canvas;
import com.acmerobotics.roadrunner.Action;
import com.acmerobotics.roadrunner.InstantAction;
import com.acmerobotics.roadrunner.ParallelAction;
import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.SequentialAction;
import com.acmerobotics.roadrunner.SleepAction;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.brainstemfirst.pilot.ftc.model.PilotAlliance;
import org.brainstemfirst.pilot.ftc.model.PilotDrive;
import org.brainstemfirst.pilot.ftc.model.PilotLog;
import org.brainstemfirst.pilot.ftc.model.PilotAuto;
import org.brainstemfirst.pilot.ftc.PilotRegistry;
import org.brainstemfirst.pilot.ftc.model.FieldConstants;
import org.brainstemfirst.pilot.ftc.model.ParallelWhilePrimaryRuns;
import org.brainstemfirst.pilot.ftc.model.PilotPoint;
import org.brainstemfirst.pilot.ftc.model.PilotSchema;
import org.brainstemfirst.pilot.ftc.model.PilotSlot;
import org.brainstemfirst.pilot.ftc.model.TriggerWatcher;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierDrivePath;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierPath;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class BrainstemPilot {

    private static final String TAG = "BrainstemPilot";

    private static final ObjectMapper m_objectMapper = new ObjectMapper();
    private static PilotDrive m_drive;
    private static PilotAlliance m_alliance;
    private static BezierParams m_defaultParams;

    private static final Map<String, List<BezierPath[]>> m_parsedAutosCache = new HashMap<>();
    private static final Map<String, Pose2d> m_startingPoseCache = new HashMap<>();
    private static final Map<String, PilotPoint> m_pointCache = new HashMap<>();

    public static final String PATH_CHOOSER_PREFIX = "path:";

    public static void prepareAssets(Context appContext, BezierParams defaultParams) {
        PilotAssetLoader.initialize(appContext);
        m_defaultParams = defaultParams;
    }

    public static void initialize(Context appContext, PilotDrive drive, PilotAlliance alliance, BezierParams defaultParams) {
        prepareAssets(appContext, defaultParams);
        m_drive = drive;
        m_alliance = alliance;
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
        if (m_drive == null || m_defaultParams == null || m_alliance == null) {
            PilotLog.critical(TAG, "BrainstemPilot must be initialized before constructing autonomous routes.");
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
            PilotLog.error(TAG, "Failed to load path: " + pathId, e);
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

    public static Optional<Pose2d> getStartingPose(String chooserValue, PilotAlliance alliance) {
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

            Pose2d pose = alliance == PilotAlliance.RED
                    ? FieldConstants.mirrorAlliance(FieldConstants.mirrorSide(bluePose))
                    : bluePose;
            m_startingPoseCache.put(cacheKey, pose);
            return Optional.of(pose);
        } catch (IOException e) {
            PilotLog.warn(TAG, "Failed to resolve starting pose for: " + chooserValue, e);
            return Optional.empty();
        }
    }

    /** Returns display name -> chooser value entries for all bundled path JSON files. */
    public static Map<String, String> getAvailablePathOptions() {
        Map<String, String> options = new LinkedHashMap<>();
        try {
            for (String pathId : PilotAssetLoader.listPathIds()) {
                String displayName = "Path - " + pathId.replace("_", " ");
                options.put(displayName, pathChooserValue(pathId));
            }
        } catch (IOException e) {
            PilotLog.warn(TAG, "Failed to list path assets.", e);
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
                PilotLog.warn(TAG, "Auto has no sequence: " + autoId);
                return new InstantAction(() -> {});
            }

            List<Action> autoActionsSequence = new ArrayList<>();
            List<BezierPath[]> pathsToCache = new ArrayList<>();
            Pose2d runningPose = null;

            for (PilotSlot slot : auto.sequence) {
                if (slot.skip) continue;

                if (slot.isType("path")) {
                    if (slot.pathId == null || slot.pathId.isEmpty()) {
                        PilotLog.warn(TAG, "Path ID was empty for slot: " + slot.id);
                        continue;
                    }
                    try {
                        BezierPath[] pathSegments =
                                PathParser.parsePathFile(slot.pathId, m_defaultParams, runningPose);

                        autoActionsSequence.add(buildPathAction(slot.pathId, pathSegments));
                        pathsToCache.add(pathSegments);
                        runningPose = PathParser.endPose(pathSegments);
                    } catch (IOException e) {
                        PilotLog.error(TAG, "Skipping invalid path: " + slot.pathId, e);
                    }

                } else if (slot.isType("point")) {
                    if (slot.pointId == null || slot.pointId.isEmpty()) {
                        PilotLog.warn(TAG, "Point ID was empty for slot: " + slot.id);
                        continue;
                    }
                    try {
                        PilotPoint point = loadPoint(slot.pointId);
                        Pose2d pointPose = poseOf(point);

                        if (runningPose == null) {
                            // First positional slot: nothing to connect from, so it only
                            // establishes where the auto begins.
                            runningPose = pointPose;
                            continue;
                        }

                        BezierPath[] pointSegments = PathParser.buildPointSegment(
                                runningPose, point, slot.params, slot.subsystemTriggers, m_defaultParams);

                        autoActionsSequence.add(buildPathAction(slot.pointId, pointSegments));
                        pathsToCache.add(pointSegments);
                        runningPose = pointPose;
                    } catch (IOException e) {
                        PilotLog.error(TAG, "Skipping invalid point: " + slot.pointId, e);
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
                        PilotLog.warn(TAG, "Subsystem slot missing name fields, id: " + slot.id);
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
                    PilotLog.warn(TAG, "Unknown slot type '" + slot.type + "' for slot: " + slot.id);
                }
            }

            if (!pathsToCache.isEmpty()) {
                m_parsedAutosCache.put(autoId, pathsToCache);
            }

            return new SequentialAction(autoActionsSequence.toArray(new Action[0]));

        } catch (Exception e) {
            PilotLog.critical(TAG, "Engine failure loading routing profiles for: " + autoId, e);
            return new InstantAction(() -> {});
        }
    }

    private static Action buildPathAction(String pathId, BezierPath[] pathSegments) {
        BezierDrivePath driveAction = new BezierDrivePath(pathId, m_drive, m_alliance, pathSegments);

        boolean hasTriggers = false;
        for (BezierPath segment : pathSegments) {
            if (!segment.subsystemTriggers.isEmpty()) {
                hasTriggers = true;
                break;
            }
        }

        return hasTriggers
                ? new ParallelWhilePrimaryRuns(driveAction, new TriggerWatcher(m_drive, pathSegments))
                : driveAction;
    }

    private static String pathCacheKey(String pathId) {
        return "path_" + pathId;
    }

    public static void draw(Canvas canvas, String autoId) {
        drawCachedPaths(canvas, autoId);
    }

    private static PilotAuto loadAuto(String autoId) throws IOException {
        String json = PilotAssetLoader.readText(PilotAssetLoader.autoAssetRelativePath(autoId));
        PilotAuto auto = m_objectMapper.readValue(json, PilotAuto.class);
        PilotSchema.validate("Auto '" + autoId + "'", auto.schemaVersion, auto.units, auto.headingUnit);
        return auto;
    }

    private static PilotPoint loadPoint(String pointId) throws IOException {
        PilotPoint cachedPoint = m_pointCache.get(pointId);
        if (cachedPoint != null) {
            return cachedPoint;
        }

        String json = PilotAssetLoader.readText(PilotAssetLoader.pointAssetRelativePath(pointId));
        PilotPoint point = m_objectMapper.readValue(json, PilotPoint.class);
        PilotSchema.validate("Point '" + pointId + "'", point.schemaVersion, point.units, point.headingUnit);
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

    public static void drawPath(Canvas canvas, String pathId) {
        drawCachedPaths(canvas, pathCacheKey(pathId));
    }

    private static void drawCachedPaths(Canvas canvas, String cacheKey) {
        if (canvas == null) return;

        List<BezierPath[]> completeSequence = m_parsedAutosCache.get(cacheKey);
        if (completeSequence != null) {
            for (BezierPath[] segmentGroup : completeSequence) {
                for (BezierPath segment : segmentGroup) {
                    segment.curve.draw(canvas, 20);
                }
            }
        }
    }
}
