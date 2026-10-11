// Demo: the 3D view. A test data source plays a robot driving a loop (TF over LCM, a planned path, a lidar ring),
// while a room-shaped point cloud and a pose array come in as props.
import { useEffect, useMemo, useState } from "react"
import { h } from "../../src/h.js"
import { encode } from "../../src/lcm.js"
import { Badge, Card, DataSourceProvider, Field, memorySource, Row, Select, Toggle } from "../../mod.js"
import {
    FramePicker,
    Path,
    PointCloud,
    Pose,
    PoseArray,
    RobotModel,
    Scene3D,
    SceneControls,
    SceneStats,
    TfFeed,
    TfFrames,
    TfTree,
    useTfFrames,
} from "../../three.js"

const TF_KEY = "dimos/tf/tf2_msgs.TFMessage"
const TF_STATIC_KEY = "dimos/tf_static/tf2_msgs.TFMessage"
const PATH_KEY = "dimos/path/nav_msgs.Path"
const LIDAR_KEY = "dimos/lidar/sensor_msgs.PointCloud2"
const ODOM_KEY = "dimos/odom/nav_msgs.Odometry"

const stamped = (parent, child, [x, y, z], yaw = 0) => ({
    header: { frame_id: parent },
    child_frame_id: child,
    transform: {
        translation: { x, y, z },
        rotation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
    },
})

/** A 12 × 8 m room: floor speckle, four walls and a few boxes, in "world". */
function roomCloud() {
    const points = []
    const add = (x, y, z) => points.push(x, y, z)
    for (let index = 0; index < 9000; index++) {
        add(Math.random() * 12 - 6, Math.random() * 8 - 4, Math.random() * 0.02)
    }
    for (let index = 0; index < 14000; index++) {
        const along = Math.random()
        const z = Math.random() * 2.4
        const wall = index % 4
        if (wall === 0) add(-6 + along * 12, -4, z)
        if (wall === 1) add(-6 + along * 12, 4, z)
        if (wall === 2) add(-6, -4 + along * 8, z)
        if (wall === 3) add(6, -4 + along * 8, z)
    }
    for (const [cx, cy, size] of [[3.5, 2, 0.8], [-3, -2.5, 1.1], [-4, 2.5, 0.6]]) {
        for (let index = 0; index < 2500; index++) {
            add(cx + (Math.random() - 0.5) * size, cy + (Math.random() - 0.5) * size, Math.random() * size)
        }
    }
    return new Float32Array(points)
}

/** The loop the robot drives: a rounded rectangle, as [x, y, yaw] at t (0..1). */
function loopAt(t) {
    const angle = t * Math.PI * 2
    const x = 3.2 * Math.cos(angle)
    const y = 2 * Math.sin(angle)
    return [x, y, Math.atan2(2 * Math.cos(angle), -3.2 * Math.sin(angle))]
}

/** Plays the robot into `source`: static and dynamic TF, odometry, a path ahead of it, a lidar ring around it. */
function useDemoRobot(source) {
    useEffect(() => {
        // tf_static is latched on a real bus; this test source isn't, so it repeats (late subscribers get it too)
        const publishStatic = () =>
            source.publish(
                TF_STATIC_KEY,
                encode("tf2_msgs.TFMessage", {
                    transforms: [
                        stamped("world", "map", [0, 0, 0]),
                        stamped("map", "odom", [0, 0, 0]),
                        stamped("base_link", "lidar_link", [0.2, 0, 0.3]),
                        stamped("base_link", "camera_link", [0.3, 0, 0.2]),
                    ],
                }),
            )
        publishStatic()
        const staticTimer = setInterval(publishStatic, 1000)
        const ring = new Float32Array(360 * 3)
        let t = 0
        const timer = setInterval(() => {
            t = (t + 0.0025) % 1
            const [x, y, yaw] = loopAt(t)
            source.publish(
                TF_KEY,
                encode("tf2_msgs.TFMessage", { transforms: [stamped("odom", "base_link", [x, y, 0.35], yaw)] }),
            )
            source.publish(
                ODOM_KEY,
                encode("nav_msgs.Odometry", {
                    header: { frame_id: "odom" },
                    child_frame_id: "base_link",
                    pose: {
                        pose: {
                            position: { x, y, z: 0.05 },
                            orientation: { z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
                        },
                    },
                }),
            )
            if (Math.round(t * 400) % 10 === 0) {
                const poses = []
                for (let step = 0; step <= 40; step++) {
                    const [px, py] = loopAt(t + step * 0.006)
                    poses.push({
                        header: { frame_id: "map" },
                        pose: { position: { x: px, y: py, z: 0 }, orientation: { w: 1 } },
                    })
                }
                source.publish(PATH_KEY, encode("nav_msgs.Path", { header: { frame_id: "map" }, poses }))
                for (let index = 0; index < 360; index++) {
                    const angle = (index / 360) * Math.PI * 2
                    const range = 2.5 + 0.3 * Math.sin(angle * 5 + t * 30)
                    ring.set([Math.cos(angle) * range, Math.sin(angle) * range, 0.1 * Math.sin(angle * 3)], index * 3)
                }
                source.publish(LIDAR_KEY, { positions: ring.slice(), frame: "lidar_link" })
            }
        }, 50)
        return () => {
            clearInterval(timer)
            clearInterval(staticTimer)
        }
    }, [source])
}

function FrameCount() {
    const frames = useTfFrames()
    return h(Badge, { tone: frames.length ? "ok" : "default" }, `${frames.length} TF frames`)
}

export function SceneSection() {
    const source = useMemo(() => memorySource(), [])
    // the scene's tree, made here so the frame picker below the scene can list its frames too
    const tf = useMemo(() => new TfTree(), [])
    useDemoRobot(source)
    const room = useMemo(roomCloud, [])
    const waypoints = useMemo(
        () => [[-5, -3, 0.4], [5, -3, 1.6], [5, 3, 2.8], [-5, 3, -1.6]].map(([x, y, yaw]) => ({ x, y, yaw })),
        [],
    )
    const [follow, setFollow] = useState(false)
    const [followFrame, setFollowFrame] = useState("base_link")
    const [style, setStyle] = useState("voxel")
    const [names, setNames] = useState(true)
    return h(
        DataSourceProvider,
        { source },
        h(
            Card,
            {
                title: "3D view",
                description: "Scene3D with TF streamed over a test data source, plus props-fed layers",
            },
            h(
                Scene3D,
                {
                    tf,
                    followFrame: follow ? followFrame : null,
                    fixedFrame: "world",
                    style: { height: 420 },
                    cameraPosition: [-8, -9, 7],
                },
                h(TfFeed),
                h(TfFrames, { names, axesSize: 0.3 }),
                h(PointCloud, { points: room, frame: "world", style, size: 0.06, colorMode: "height" }),
                h(PointCloud, {
                    topic: LIDAR_KEY,
                    style: "disc",
                    size: 0.05,
                    colorMode: "solid",
                    color: "var(--warn)",
                }),
                h(Path, { topic: PATH_KEY, width: 4 }),
                h(Pose, { topic: ODOM_KEY, trail: true, axesSize: 0, color: "var(--accent-alt)", width: 2 }),
                h(PoseArray, { poses: waypoints, frame: "world", length: 0.6 }),
                h(RobotModel, { kind: "dog", frame: "base_link" }),
                h(SceneStats),
                h(SceneControls),
                h(
                    "div",
                    { className: "dr-scene-overlay", style: { top: 10, left: 10 } },
                    h(
                        Row,
                        { gap: 8 },
                        h(Toggle, { value: follow, onChange: setFollow, label: "Follow" }),
                        h(FrameCount),
                    ),
                ),
            ),
            h(
                Row,
                { gap: 16, wrap: true, style: { marginTop: 12 } },
                h(
                    Field,
                    { label: "Follow frame" },
                    h(FramePicker, { tf, value: followFrame, onChange: setFollowFrame }),
                ),
                h(
                    Field,
                    { label: "Point style" },
                    h(Select, {
                        value: style,
                        onChange: setStyle,
                        options: [["voxel", "Cubes"], ["disc", "Spheres"], ["square", "Squares"], ["splat", "Glow"]],
                    }),
                ),
                h(Field, { label: "Frame names" }, h(Toggle, { value: names, onChange: setNames })),
            ),
        ),
    )
}
