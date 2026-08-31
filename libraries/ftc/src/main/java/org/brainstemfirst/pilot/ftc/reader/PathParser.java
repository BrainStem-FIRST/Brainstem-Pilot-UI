package org.brainstemfirst.pilot.ftc.reader;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.brainstemfirst.pilot.ftc.PilotRegistry;
import org.brainstemfirst.pilot.ftc.model.PilotGeometry;
import org.brainstemfirst.pilot.ftc.model.PilotPoint;
import org.brainstemfirst.pilot.ftc.model.PilotSchema;
import org.brainstemfirst.pilot.ftc.model.PilotTrigger;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierCurve;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.BezierParams;
import org.brainstemfirst.pilot.ftc.bezier.buildingBlocks.RotationPoint;
import org.brainstemfirst.pilot.ftc.bezier.follower.BezierPath;
import org.brainstemfirst.pilot.ftc.bezier.tolerance.CircleTolerance;

import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.Vector2d;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PathParser {
    private static final ObjectMapper m_objectMapper = new ObjectMapper();

    private static final int ARC_LENGTH_SAMPLES = 50;

    private static class GlobalRotation {
        final double distance;
        final double headingRad;

        GlobalRotation(double distance, double headingRad) {
            this.distance = distance;
            this.headingRad = headingRad;
        }
    }

    /** A path anchor after chaining has been applied. */
    private static class Waypoint {
        double x;
        double y;
        Vector2d prevControl;
        Vector2d nextControl;
        double rotationDeg;
        JsonNode params;

        Vector2d position() {
            return new Vector2d(x, y);
        }
    }

    /** A heading keyframe along a path, positioned by arc length or fractional progress. */
    private static class RotationTarget {
        final double progress;
        final double rotationDeg;
        final double arcLength;

        RotationTarget(double progress, double rotationDeg, double arcLength) {
            this.progress = progress;
            this.rotationDeg = rotationDeg;
            this.arcLength = arcLength;
        }

        double resolveDistance(double totalLength) {
            return arcLength >= 0 ? arcLength : progress * totalLength;
        }
    }

    public static BezierPath[] parsePathFile(String pathId, BezierParams defaultParams) throws IOException {
        return parsePathFile(pathId, defaultParams, null);
    }

    /**
     * Parses {@code paths/<pathId>.path.json} into drivable segments.
     *
     * @param startOverride when non-null, the path's first waypoint is snapped to this pose —
     *                      position and heading — and its outgoing Bézier handle translates with
     *                      it. Every other waypoint keeps its authored shape. This reproduces the
     *                      editor's chaining so a resequenced auto still joins up.
     */
    public static BezierPath[] parsePathFile(String pathId, BezierParams defaultParams, Pose2d startOverride)
            throws IOException {
        return parsePathJson(pathId, PilotAssetLoader.readPathText(pathId), defaultParams, startOverride);
    }

    /** Path parsing proper, decoupled from asset loading. */
    public static BezierPath[] parsePathJson(String pathId, String json, BezierParams defaultParams, Pose2d startOverride)
            throws IOException {
        JsonNode root = m_objectMapper.readTree(json);

        PilotSchema.validate(
                "Path '" + pathId + "'",
                root.path("schemaVersion").asInt(0),
                root.path("units").asText(null),
                root.path("headingUnit").asText(null));

        JsonNode waypointsNode = root.get("waypoints");
        if (waypointsNode == null || !waypointsNode.isArray() || waypointsNode.size() < 2) {
            throw new IOException("Path layout sequence requires at least two valid anchor coordinates.");
        }

        List<Waypoint> waypoints = new ArrayList<>();
        for (JsonNode wpNode : waypointsNode) {
            Waypoint wp = new Waypoint();
            wp.x = wpNode.path("x").asDouble(0.0);
            wp.y = wpNode.path("y").asDouble(0.0);
            wp.prevControl = readControl(wpNode, "prevControl");
            wp.nextControl = readControl(wpNode, "nextControl");
            wp.rotationDeg = wpNode.path("rotation").asDouble(0.0);
            wp.params = wpNode.get("params");
            waypoints.add(wp);
        }

        if (startOverride != null) {
            snapToPose(waypoints.get(0), startOverride);
        }

        JsonNode constraintsNode = root.get("constraints");
        double maxLinearVelocity = defaultParams.maxLinearSpeed;
        double maxAcceleration = defaultParams.profileDecel;
        if (constraintsNode != null) {
            maxLinearVelocity = constraintsNode.path("maxVel").asDouble(defaultParams.maxLinearSpeed);
            maxAcceleration = constraintsNode.path("maxAccel").asDouble(defaultParams.profileDecel);
        }

        List<RotationTarget> rotationTargets = new ArrayList<>();
        JsonNode rotationTargetsNode = root.get("rotationTargets");
        if (rotationTargetsNode != null && rotationTargetsNode.isArray()) {
            for (JsonNode rotTarget : rotationTargetsNode) {
                rotationTargets.add(new RotationTarget(
                        rotTarget.path("progress").asDouble(0.0),
                        rotTarget.path("rotation").asDouble(0.0),
                        rotTarget.path("arcLengthM").asDouble(-1.0)));
            }
        }

        List<PilotTrigger> triggers = readTriggers(root.get("subsystemTriggers"));

        return buildSegments(waypoints, maxLinearVelocity, maxAcceleration, rotationTargets, triggers, defaultParams);
    }

    /**
     * Builds the straight connecting segment that drives from {@code startPose} to a point,
     * finishing at the point's own heading. A point is a destination, not a coincident joint —
     * the preceding path's end is not expected to sit on it.
     */
    public static BezierPath[] buildPointSegment(Pose2d startPose,
                                                 PilotPoint point,
                                                 JsonNode slotParams,
                                                 List<PilotTrigger> slotTriggers,
                                                 BezierParams defaultParams) throws IOException {
        Waypoint start = new Waypoint();
        start.x = startPose.position.x;
        start.y = startPose.position.y;
        start.rotationDeg = PilotGeometry.toDegrees(startPose.heading.toDouble());

        Waypoint end = new Waypoint();
        end.x = point.x;
        end.y = point.y;
        end.rotationDeg = point.rotation;
        end.params = slotParams;

        List<Waypoint> waypoints = new ArrayList<>();
        waypoints.add(start);
        waypoints.add(end);

        List<PilotTrigger> triggers = slotTriggers == null ? Collections.emptyList() : slotTriggers;

        return buildSegments(waypoints, defaultParams.maxLinearSpeed, defaultParams.profileDecel,
                Collections.emptyList(), triggers, defaultParams);
    }

    /** Position and heading of the last anchor of a parsed path, for chaining onward. */
    public static Pose2d endPose(BezierPath[] segments) {
        BezierPath last = segments[segments.length - 1];
        double headingRad = last.rotationPoints.isEmpty()
                ? 0.0
                : last.rotationPoints.get(last.rotationPoints.size() - 1).getHeadingRad();
        return new Pose2d(last.curve.getEnd(), headingRad);
    }

    /** Position and heading of the first anchor of a parsed path. */
    public static Pose2d startPose(BezierPath[] segments) {
        BezierPath first = segments[0];
        double headingRad = first.rotationPoints.isEmpty()
                ? 0.0
                : first.rotationPoints.get(0).getHeadingRad();
        return new Pose2d(first.curve.getStart(), headingRad);
    }

    private static void snapToPose(Waypoint first, Pose2d pose) {
        double dx = pose.position.x - first.x;
        double dy = pose.position.y - first.y;

        first.x = pose.position.x;
        first.y = pose.position.y;
        first.rotationDeg = PilotGeometry.toDegrees(pose.heading.toDouble());
        if (first.nextControl != null) {
            first.nextControl = new Vector2d(first.nextControl.x + dx, first.nextControl.y + dy);
        }
    }

    private static BezierPath[] buildSegments(List<Waypoint> waypoints,
                                              double maxLinearVelocity,
                                              double maxAcceleration,
                                              List<RotationTarget> rotationTargets,
                                              List<PilotTrigger> triggers,
                                              BezierParams defaultParams) {
        int segmentCount = waypoints.size() - 1;
        List<BezierCurve> curves = new ArrayList<>();

        double[] segmentLengths = new double[segmentCount];
        double totalPathLength = 0.0;

        for (int i = 0; i < segmentCount; i++) {
            Waypoint wpStart = waypoints.get(i);
            Waypoint wpEnd = waypoints.get(i + 1);

            Vector2d startPoint = wpStart.position();
            Vector2d endPoint = wpEnd.position();

            Vector2d control1 = wpStart.nextControl != null
                    ? wpStart.nextControl
                    : startPoint.plus(endPoint.minus(startPoint).times(0.333));

            Vector2d control2 = wpEnd.prevControl != null
                    ? wpEnd.prevControl
                    : startPoint.plus(endPoint.minus(startPoint).times(0.667));

            BezierCurve curve = new BezierCurve(startPoint, control1, control2, endPoint);
            curves.add(curve);

            double segLength = 0.0;
            Vector2d lastPoint = curve.getPoint(0.0);
            for (int j = 1; j <= ARC_LENGTH_SAMPLES; j++) {
                Vector2d currentPoint = curve.getPoint((double) j / ARC_LENGTH_SAMPLES);
                segLength += PilotGeometry.vecDist(currentPoint, lastPoint);
                lastPoint = currentPoint;
            }
            segmentLengths[i] = segLength;
            totalPathLength += segLength;
        }

        List<GlobalRotation> globalRotations = new ArrayList<>();

        globalRotations.add(new GlobalRotation(0.0, PilotGeometry.fromDegrees(waypoints.get(0).rotationDeg)));

        for (RotationTarget rotTarget : rotationTargets) {
            globalRotations.add(new GlobalRotation(
                    rotTarget.resolveDistance(totalPathLength),
                    PilotGeometry.fromDegrees(rotTarget.rotationDeg)));
        }

        double finalHeading = waypoints.get(waypoints.size() - 1).rotationDeg;
        globalRotations.add(new GlobalRotation(totalPathLength, PilotGeometry.fromDegrees(finalHeading)));

        globalRotations.sort((r1, r2) -> Double.compare(r1.distance, r2.distance));

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
                if (gr.distance > currentSegmentStartDist + 1e-4 && gr.distance < currentSegmentEndDist - 1e-4) {
                    double localT = (gr.distance - currentSegmentStartDist) / segmentLengths[i];
                    segmentList.add(new RotationPoint(gr.headingRad, localT));
                }
            }

            segmentList.sort((p1, p2) -> Double.compare(p1.getT(), p2.getT()));
            currentSegmentStartDist = currentSegmentEndDist;
        }

        BezierParams[] segmentParams = new BezierParams[segmentCount];
        for (int i = 0; i < segmentCount; i++) {
            // A segment is governed by the params of the waypoint it arrives at.
            segmentParams[i] = buildSegmentParams(
                    waypoints.get(i + 1).params, maxLinearVelocity, maxAcceleration, defaultParams);
        }

        List<List<BezierPath.SubsystemTriggerPoint>> triggersPerSegment = new ArrayList<>();
        for (int i = 0; i < segmentCount; i++) triggersPerSegment.add(new ArrayList<>());

        double runningDist = 0.0;
        for (int i = 0; i < segmentCount; i++) {
            double segEnd = runningDist + segmentLengths[i];
            for (PilotTrigger trig : triggers) {
                if (!trig.isComplete()) {
                    continue;
                }
                double trigDist = trig.resolveDistance(totalPathLength);
                if (trigDist >= runningDist && trigDist < segEnd) {
                    triggersPerSegment.get(i).add(
                            new BezierPath.SubsystemTriggerPoint(
                                    PilotRegistry.getCommand(trig.subsystemName, trig.commandName),
                                    trigDist
                            )
                    );
                }
            }
            runningDist = segEnd;
        }

        BezierPath[] pathSegments = new BezierPath[segmentCount];
        for (int i = 0; i < segmentCount; i++) {
            pathSegments[i] = new BezierPath(curves.get(i), segmentParams[i], rotationPointsPerSegment.get(i));
            pathSegments[i].subsystemTriggers = triggersPerSegment.get(i);
        }

        return pathSegments;
    }

    private static BezierParams buildSegmentParams(JsonNode params,
                                                   double maxLinearVelocity,
                                                   double maxAcceleration,
                                                   BezierParams defaultParams) {
        BezierParams bp = new BezierParams()
                .setMaxLinearSpeed(maxLinearVelocity)
                .setProfileCruiseVel(maxLinearVelocity)
                .setProfileDecel(maxAcceleration)
                .setMinLinearSpeed(defaultParams.minLinearSpeed)
                .setMaxTurnPower(defaultParams.maxTurnPower)
                .setMaxTime(defaultParams.maxTime)
                .setTolerance(defaultParams.tolerance)
                .setPassPosition(defaultParams.passPosition);

        if (params == null || params.isNull()) {
            return bp;
        }

        double dist = defaultParams.tolerance instanceof CircleTolerance
                ? CircleTolerance.defaultParams.distTol : 3.0;
        double headDeg = defaultParams.tolerance instanceof CircleTolerance
                ? CircleTolerance.defaultParams.headingTolDeg : 4.0;
        boolean toleranceOverridden = false;

        if (params.has("distTol")) {
            dist = params.get("distTol").asDouble();
            toleranceOverridden = true;
        }
        if (params.has("headingTol")) {
            headDeg = params.get("headingTol").asDouble();
            toleranceOverridden = true;
        }
        if (toleranceOverridden) bp.setTolerance(new CircleTolerance(dist, headDeg));
        if (params.has("minLinearSpeed")) bp.setMinLinearSpeed(params.get("minLinearSpeed").asDouble());
        // An absolute speed in the file's units (in/s), clamped by the path's own limit —
        // not a fraction. The editor treats it as min(maxVel, value).
        if (params.has("maxLinearSpeed")) {
            bp.setMaxLinearSpeed(Math.min(maxLinearVelocity, params.get("maxLinearSpeed").asDouble()));
        }
        if (params.has("maxTurnPower")) bp.setMaxTurnPower(params.get("maxTurnPower").asDouble());
        if (params.has("maxTime")) bp.setMaxTime(params.get("maxTime").asDouble());
        if (params.has("passPosition")) bp.setPassPosition(params.get("passPosition").asBoolean());

        return bp;
    }

    private static List<PilotTrigger> readTriggers(JsonNode triggersNode) {
        List<PilotTrigger> triggers = new ArrayList<>();
        if (triggersNode == null || !triggersNode.isArray()) {
            return triggers;
        }
        for (JsonNode trig : triggersNode) {
            PilotTrigger trigger = new PilotTrigger();
            trigger.id = trig.path("id").asText(null);
            trigger.subsystemName = trig.path("subsystemName").asText("");
            trigger.commandName = trig.path("commandName").asText("");
            trigger.progress = trig.path("progress").asDouble(0.0);
            trigger.arcLengthM = trig.path("arcLengthM").asDouble(-1.0);
            triggers.add(trigger);
        }
        return triggers;
    }

    private static double sampleGlobalRotation(List<GlobalRotation> timeline, double distance) {
        if (timeline.isEmpty()) return 0.0;
        if (distance <= timeline.get(0).distance) return timeline.get(0).headingRad;
        if (distance >= timeline.get(timeline.size() - 1).distance) {
            return timeline.get(timeline.size() - 1).headingRad;
        }

        for (int i = 0; i < timeline.size() - 1; i++) {
            GlobalRotation r1 = timeline.get(i);
            GlobalRotation r2 = timeline.get(i + 1);
            if (distance >= r1.distance && distance <= r2.distance) {
                double t = (distance - r1.distance) / (r2.distance - r1.distance);
                return PilotGeometry.lerpHeading(r1.headingRad, r2.headingRad, t);
            }
        }
        return timeline.get(timeline.size() - 1).headingRad;
    }

    private static Vector2d readControl(JsonNode waypointNode, String field) {
        JsonNode control = waypointNode.get(field);
        if (control == null || control.isNull()) {
            return null;
        }
        return new Vector2d(control.path("x").asDouble(0.0), control.path("y").asDouble(0.0));
    }
}
