package org.brainstemfirst.pilot.frc.reader;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.geometry.Rotation2d;
import edu.wpi.first.math.geometry.Translation2d;
import edu.wpi.first.wpilibj.Filesystem;
import edu.wpi.first.wpilibj2.command.Command;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.frc.bezier.buildingBlocks.RotationPoint;
import org.brainstemfirst.pilot.frc.bezier.follower.BezierPath;
import org.brainstemfirst.pilot.frc.bezier.tolerance.CircleTolerance;
import org.brainstemfirst.pilot.frc.PilotRegistry;
import org.brainstemfirst.pilot.frc.model.FieldSide;
import org.brainstemfirst.pilot.frc.model.PilotPoint;
import org.brainstemfirst.pilot.frc.model.PilotSlot;

/**
 * Reads {@code paths/*.path.json} into follower-ready {@link BezierPath} segments.
 *
 * <p>Parsing is split in two so that chaining can happen in between: {@link #readPathData} pulls
 * the raw geometry out of the file, {@link PathData#chainTo} snaps its first waypoint onto a
 * previous slot's end pose, and {@link #buildSegments} turns the result into Bezier segments.
 * Side mirroring is applied later still, by {@link BrainstemPilot}, to the whole resolved auto.
 */
public class PathParser {

    private static final ObjectMapper m_objectMapper = new ObjectMapper();

    /** Highest {@code schemaVersion} this reader understands. Newer files are refused, not guessed at. */
    public static final int SUPPORTED_SCHEMA_VERSION = 2;

    // ---------------------------------------------------------------- raw model

    /** One authored waypoint. Control handles are null at the ends of a path. */
    public static class Waypoint {
        public double x;
        public double y;
        public double rotationDeg;
        public Translation2d prevControl;
        public Translation2d nextControl;
        public JsonNode params;

        Waypoint(double x, double y, double rotationDeg) {
            this.x = x;
            this.y = y;
            this.rotationDeg = rotationDeg;
        }

        public Translation2d translation() {
            return new Translation2d(x, y);
        }
    }

    /** A trigger or rotation keyframe positioned along a path. */
    public static class Marker {
        public final double progress;
        public final double distance;
        public final double rotationDeg;
        public final String subsystemName;
        public final String commandName;

        Marker(double progress, double distance, double rotationDeg, String subsystemName, String commandName) {
            this.progress = progress;
            this.distance = distance;
            this.rotationDeg = rotationDeg;
            this.subsystemName = subsystemName;
            this.commandName = commandName;
        }

        /**
         * Resolves this marker to an absolute distance from the path start.
         *
         * <p>{@code progress} wins over {@code distance} because chaining moves the first
         * waypoint, which changes the first segment's length and leaves any stored absolute
         * distance stale. For an unchained path the two agree by construction.
         */
        double distanceAlong(double totalLength) {
            if (progress >= 0.0) {
                return progress * totalLength;
            }
            return Math.max(distance, 0.0);
        }
    }

    /** Everything read out of a single {@code .path.json}, before Bezier construction. */
    public static class PathData {
        public final String id;
        public final List<Waypoint> waypoints = new ArrayList<>();
        public final List<Marker> rotationTargets = new ArrayList<>();
        public final List<Marker> triggers = new ArrayList<>();
        public FieldSide startSide = FieldSide.RIGHT;
        public double maxVel = Double.NaN;
        public double maxAccel = Double.NaN;

        PathData(String id) {
            this.id = id;
        }

        public int segmentCount() {
            return waypoints.size() - 1;
        }

        public Waypoint first() {
            return waypoints.get(0);
        }

        public Waypoint last() {
            return waypoints.get(waypoints.size() - 1);
        }

        /** Pose the robot ends this path at — the running pose for the next positional slot. */
        public Pose2d endPose() {
            Waypoint end = last();
            return new Pose2d(end.x, end.y, Rotation2d.fromDegrees(end.rotationDeg));
        }

        /**
         * Snaps the first waypoint (position <em>and</em> heading) onto {@code startPose}. Only that
         * waypoint moves; the rest of the path keeps its authored shape and the first waypoint's
         * outgoing Bezier handle translates with it.
         *
         * <p>Mirrors {@code chainPathToPose} in the editor's {@code trajectoryMath.js}.
         */
        public void chainTo(Pose2d startPose) {
            if (startPose == null || waypoints.isEmpty()) {
                return;
            }
            Waypoint wp0 = first();
            double dx = startPose.getX() - wp0.x;
            double dy = startPose.getY() - wp0.y;

            wp0.x = startPose.getX();
            wp0.y = startPose.getY();
            wp0.rotationDeg = startPose.getRotation().getDegrees();
            if (wp0.nextControl != null) {
                wp0.nextControl = new Translation2d(wp0.nextControl.getX() + dx, wp0.nextControl.getY() + dy);
            }
        }
    }

    // ---------------------------------------------------------------- reading

    /** Reads a path file into its raw, unchained geometry. */
    public static PathData readPathData(String pathId) throws IOException {
        File pathFile = resolvePathFile(pathId);
        if (!pathFile.exists()) {
            throw new IOException("Could not locate path asset file target: " + pathFile.getAbsolutePath());
        }

        JsonNode root = m_objectMapper.readTree(pathFile);
        checkSchemaVersion(root, pathFile);
        double scale = unitScale(root);

        JsonNode waypointsNode = root.get("waypoints");
        if (waypointsNode == null || !waypointsNode.isArray() || waypointsNode.size() < 2) {
            throw new IOException("Path layout sequence requires at least two valid anchor coordinates: " + pathId);
        }

        PathData data = new PathData(pathId);
        data.startSide = FieldSide.fromStartSideKey(
            root.hasNonNull("startSide") ? root.get("startSide").asText(null) : null);

        // constraints is populated on current files, but older ones carry {} — fall back to defaults.
        JsonNode constraints = root.get("constraints");
        if (constraints != null && constraints.hasNonNull("maxVel")) {
            data.maxVel = constraints.get("maxVel").asDouble() * scale;
        }
        if (constraints != null && constraints.hasNonNull("maxAccel")) {
            data.maxAccel = constraints.get("maxAccel").asDouble() * scale;
        }

        for (JsonNode wpNode : waypointsNode) {
            Waypoint wp = new Waypoint(
                wpNode.path("x").asDouble(0.0) * scale,
                wpNode.path("y").asDouble(0.0) * scale,
                wpNode.path("rotation").asDouble(0.0));
            wp.prevControl = readControl(wpNode.get("prevControl"), scale);
            wp.nextControl = readControl(wpNode.get("nextControl"), scale);
            // waypointParams is no longer written; params live inline on each waypoint.
            wp.params = wpNode.get("params");
            data.waypoints.add(wp);
        }

        readMarkers(root.get("rotationTargets"), scale, data.rotationTargets, false);
        readMarkers(root.get("subsystemTriggers"), scale, data.triggers, true);
        return data;
    }

    /**
     * Builds the straight connecting segment that drives from {@code startPose} to a point,
     * finishing at the point's own heading. A point is a destination driven to, not a joint the
     * previous path already ends on.
     */
    public static PathData connectingSegment(String label, Pose2d startPose, PilotPoint point,
                                             JsonNode slotParams, List<PilotSlot.SlotTrigger> slotTriggers) {
        PathData data = new PathData(label);
        data.waypoints.add(new Waypoint(startPose.getX(), startPose.getY(), startPose.getRotation().getDegrees()));

        Waypoint end = new Waypoint(point.x, point.y, point.rotation);
        end.params = slotParams;
        data.waypoints.add(end);

        if (slotTriggers != null) {
            for (PilotSlot.SlotTrigger trigger : slotTriggers) {
                if (!trigger.isComplete()) {
                    System.err.println("[BrainstemPilot] WARNING: Ignoring incomplete trigger on point slot: " + label);
                    continue;
                }
                data.triggers.add(new Marker(trigger.progress, trigger.arcLengthM, 0.0,
                    trigger.subsystemName, trigger.commandName));
            }
        }
        return data;
    }

    /** Reads only the {@code startSide} field, without parsing geometry. */
    public static FieldSide readStartSide(String pathId) throws IOException {
        File pathFile = resolvePathFile(pathId);
        if (!pathFile.exists()) {
            throw new IOException("Could not locate path asset file target: " + pathFile.getAbsolutePath());
        }
        JsonNode root = m_objectMapper.readTree(pathFile);
        checkSchemaVersion(root, pathFile);
        return FieldSide.fromStartSideKey(
            root.hasNonNull("startSide") ? root.get("startSide").asText(null) : null);
    }

    // ---------------------------------------------------------------- building

    /**
     * Converts chained geometry into follower segments, distributing the path's rotation timeline
     * and subsystem triggers across them by arc length.
     *
     * @param withTriggers when false, trigger commands are not instantiated (geometry-only passes
     *                     such as starting-pose resolution)
     */
    public static BezierPath[] buildSegments(PathData data, BezierParams defaultParams, boolean withTriggers) {
        int segmentCount = data.segmentCount();
        double maxLinearVelocity = Double.isNaN(data.maxVel) ? defaultParams.maxLinearSpeed : data.maxVel;
        double maxAcceleration = Double.isNaN(data.maxAccel) ? defaultParams.profileDecel : data.maxAccel;

        List<BezierCurve> curves = new ArrayList<>();
        double[] segmentLengths = new double[segmentCount];
        double totalPathLength = 0.0;

        for (int i = 0; i < segmentCount; i++) {
            Waypoint wpStart = data.waypoints.get(i);
            Waypoint wpEnd = data.waypoints.get(i + 1);

            Translation2d startPoint = wpStart.translation();
            Translation2d endPoint = wpEnd.translation();

            Translation2d control1 = wpStart.nextControl != null
                ? wpStart.nextControl
                : startPoint.plus(endPoint.minus(startPoint).times(0.333));
            Translation2d control2 = wpEnd.prevControl != null
                ? wpEnd.prevControl
                : startPoint.plus(endPoint.minus(startPoint).times(0.667));

            BezierCurve curve = new BezierCurve(startPoint, control1, control2, endPoint);
            curves.add(curve);

            double segLength = 0.0;
            Translation2d lastPoint = curve.getPoint(0.0);
            int samples = 50;
            for (int j = 1; j <= samples; j++) {
                Translation2d currentPoint = curve.getPoint((double) j / samples);
                segLength += currentPoint.getDistance(lastPoint);
                lastPoint = currentPoint;
            }
            segmentLengths[i] = segLength;
            totalPathLength += segLength;
        }

        // --- GLOBAL ROTATION TIMELINE ---
        List<GlobalRotation> globalRotations = new ArrayList<>();
        globalRotations.add(new GlobalRotation(0.0, Rotation2d.fromDegrees(data.first().rotationDeg)));
        for (Marker rotTarget : data.rotationTargets) {
            globalRotations.add(new GlobalRotation(
                rotTarget.distanceAlong(totalPathLength), Rotation2d.fromDegrees(rotTarget.rotationDeg)));
        }
        globalRotations.add(new GlobalRotation(totalPathLength, Rotation2d.fromDegrees(data.last().rotationDeg)));
        globalRotations.sort((r1, r2) -> Double.compare(r1.distanceMeters, r2.distanceMeters));

        // --- DISTRIBUTE ROTATIONS PER SEGMENT ---
        List<ArrayList<RotationPoint>> rotationPointsPerSegment = new ArrayList<>();
        for (int i = 0; i < segmentCount; i++) {
            rotationPointsPerSegment.add(new ArrayList<>());
        }

        double currentSegmentStartDist = 0.0;
        for (int i = 0; i < segmentCount; i++) {
            double currentSegmentEndDist = currentSegmentStartDist + segmentLengths[i];
            ArrayList<RotationPoint> segmentList = rotationPointsPerSegment.get(i);

            segmentList.add(new RotationPoint(sampleGlobalRotation(globalRotations, currentSegmentStartDist), 0.0));
            segmentList.add(new RotationPoint(sampleGlobalRotation(globalRotations, currentSegmentEndDist), 1.0));

            for (GlobalRotation gr : globalRotations) {
                if (gr.distanceMeters > currentSegmentStartDist + 1e-4
                        && gr.distanceMeters < currentSegmentEndDist - 1e-4) {
                    double localT = (gr.distanceMeters - currentSegmentStartDist) / segmentLengths[i];
                    segmentList.add(new RotationPoint(gr.rotation, localT));
                }
            }

            segmentList.sort((p1, p2) -> Double.compare(p1.getT(), p2.getT()));
            currentSegmentStartDist = currentSegmentEndDist;
        }

        // --- PER-SEGMENT PARAMS (from the segment's END waypoint) ---
        BezierParams[] segmentParams = new BezierParams[segmentCount];
        for (int i = 0; i < segmentCount; i++) {
            segmentParams[i] = buildParams(
                data.waypoints.get(i + 1).params, defaultParams, maxLinearVelocity, maxAcceleration);
        }

        // --- SUBSYSTEM TRIGGERS ---
        List<List<BezierPath.SubsystemTriggerPoint>> triggersPerSegment = new ArrayList<>();
        for (int i = 0; i < segmentCount; i++) {
            triggersPerSegment.add(new ArrayList<>());
        }

        if (withTriggers && !data.triggers.isEmpty()) {
            double runningDist = 0.0;
            for (int i = 0; i < segmentCount; i++) {
                double segEnd = runningDist + segmentLengths[i];
                boolean lastSegment = i == segmentCount - 1;
                for (Marker trigger : data.triggers) {
                    double trigDist = trigger.distanceAlong(totalPathLength);
                    boolean inSegment = trigDist >= runningDist
                        && (trigDist < segEnd || (lastSegment && trigDist <= segEnd + 1e-6));
                    if (inSegment) {
                        Command trigCmd = PilotRegistry.getCommand(trigger.subsystemName, trigger.commandName);
                        triggersPerSegment.get(i).add(
                            new BezierPath.SubsystemTriggerPoint(trigCmd, trigDist));
                    }
                }
                runningDist = segEnd;
            }
        }

        BezierPath[] pathSegments = new BezierPath[segmentCount];
        for (int i = 0; i < segmentCount; i++) {
            pathSegments[i] = new BezierPath(curves.get(i), segmentParams[i], rotationPointsPerSegment.get(i));
            pathSegments[i].subsystemTriggers = triggersPerSegment.get(i);
        }
        return pathSegments;
    }

    // ---------------------------------------------------------------- helpers

    private static BezierParams buildParams(
            JsonNode params, BezierParams defaultParams, double maxLinearVelocity, double maxAcceleration) {
        BezierParams bp = new BezierParams()
            .setMaxLinearSpeed(maxLinearVelocity)
            .setProfileCruiseVel(maxLinearVelocity)
            .setProfileDecel(maxAcceleration)
            .setMinLinearSpeed(defaultParams.minLinearSpeed)
            .setMaxTurnPower(defaultParams.maxTurnPower)
            .setMaxTime(defaultParams.maxTime)
            .setTolerance(defaultParams.tolerance)
            .setPassPosition(defaultParams.passPosition);

        if (params == null || params.isNull() || params.isEmpty()) {
            return bp;
        }

        boolean isCircle = defaultParams.tolerance instanceof CircleTolerance;
        double dist = isCircle ? CircleTolerance.defaultParams.distTol : 0.0762;
        Rotation2d head = isCircle ? CircleTolerance.defaultParams.headingTol : Rotation2d.fromDegrees(4);
        boolean toleranceOverridden = false;

        if (params.has("distTol")) { dist = params.get("distTol").asDouble(); toleranceOverridden = true; }
        if (params.has("headingTol")) { head = Rotation2d.fromDegrees(params.get("headingTol").asDouble()); toleranceOverridden = true; }
        if (toleranceOverridden) bp.setTolerance(new CircleTolerance(dist, head));
        if (params.has("minLinearSpeed")) bp.setMinLinearSpeed(params.get("minLinearSpeed").asDouble());
        // An absolute speed in the file's units (m/s), clamped by the path's own limit —
        // not a fraction. The editor treats it as min(maxVel, value).
        if (params.has("maxLinearSpeed")) {
            bp.setMaxLinearSpeed(Math.min(maxLinearVelocity, params.get("maxLinearSpeed").asDouble()));
        }
        if (params.has("maxTurnPower")) bp.setMaxTurnPower(params.get("maxTurnPower").asDouble());
        if (params.has("maxTime")) bp.setMaxTime(params.get("maxTime").asDouble());
        if (params.has("passPosition")) bp.setPassPosition(params.get("passPosition").asBoolean());
        return bp;
    }

    private static void readMarkers(JsonNode arrayNode, double scale, List<Marker> out, boolean isTrigger) {
        if (arrayNode == null || !arrayNode.isArray()) {
            return;
        }
        for (JsonNode node : arrayNode) {
            String subsystemName = node.path("subsystemName").asText("");
            String commandName = node.path("commandName").asText("");
            if (isTrigger && (subsystemName.isBlank() || commandName.isBlank())) {
                // Authored but not finished in the UI yet — skipping beats throwing mid-match.
                System.err.println("[BrainstemPilot] WARNING: Ignoring incomplete subsystem trigger: "
                    + node.path("id").asText("<no id>"));
                continue;
            }
            out.add(new Marker(
                node.hasNonNull("progress") ? node.get("progress").asDouble() : -1.0,
                node.path("arcLengthM").asDouble(-1.0) * scale,
                node.path("rotation").asDouble(0.0),
                subsystemName,
                commandName));
        }
    }

    private static Translation2d readControl(JsonNode node, double scale) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new Translation2d(node.path("x").asDouble(0.0) * scale, node.path("y").asDouble(0.0) * scale);
    }

    /**
     * Distance multiplier that converts the file's {@code units} into metres.
     *
     * <p>Read the field rather than trusting field names: {@code arcLengthM} is misnamed and
     * actually holds a distance in whatever {@code units} says. FRC files are already metres.
     */
    static double unitScale(JsonNode root) {
        String units = root.path("units").asText("m");
        if (units.equalsIgnoreCase("in") || units.equalsIgnoreCase("inch") || units.equalsIgnoreCase("inches")) {
            return 0.0254;
        }
        if (units.equalsIgnoreCase("cm")) {
            return 0.01;
        }
        return 1.0;
    }

    /** Refuses a file written by a newer schema rather than silently misreading it. */
    static void checkSchemaVersion(JsonNode root, File source) throws IOException {
        JsonNode version = root.get("schemaVersion");
        if (version != null && version.isNumber() && version.asInt() > SUPPORTED_SCHEMA_VERSION) {
            throw new IOException("Refusing " + source.getName() + ": schemaVersion " + version.asInt()
                + " is newer than this reader understands (v" + SUPPORTED_SCHEMA_VERSION + ")");
        }
    }

    static File resolvePathFile(String pathId) {
        File pathFile = new File(Filesystem.getDeployDirectory(), "brainstemPilotAuto/paths/" + pathId + ".path.json");
        if (!pathFile.exists()) {
            pathFile = new File(Filesystem.getDeployDirectory(), "brainstemPilotAuto/paths/" + pathId + ".json");
        }
        return pathFile;
    }

    private static class GlobalRotation {
        final double distanceMeters;
        final Rotation2d rotation;

        GlobalRotation(double distanceMeters, Rotation2d rotation) {
            this.distanceMeters = distanceMeters;
            this.rotation = rotation;
        }
    }

    /** Samples the continuous global rotation timeline using linear interpolation. */
    private static Rotation2d sampleGlobalRotation(List<GlobalRotation> timeline, double distance) {
        if (timeline.isEmpty()) return new Rotation2d();
        if (distance <= timeline.get(0).distanceMeters) return timeline.get(0).rotation;
        if (distance >= timeline.get(timeline.size() - 1).distanceMeters) return timeline.get(timeline.size() - 1).rotation;

        for (int i = 0; i < timeline.size() - 1; i++) {
            GlobalRotation r1 = timeline.get(i);
            GlobalRotation r2 = timeline.get(i + 1);
            if (distance >= r1.distanceMeters && distance <= r2.distanceMeters) {
                double t = (distance - r1.distanceMeters) / (r2.distanceMeters - r1.distanceMeters);
                return r1.rotation.interpolate(r2.rotation, t);
            }
        }
        return timeline.get(timeline.size() - 1).rotation;
    }
}
