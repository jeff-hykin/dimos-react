// Demo: the 3D view. A test data source plays a robot driving a loop (TF over LCM, a planned path, a lidar ring),
// while a room-shaped point cloud and a pose array come in as props.
import { useEffect, useMemo, useRef, useState } from "react"
import { encode } from "../../src/lcm"
import {
    Badge,
    Button,
    Card,
    Column,
    DataSourceProvider,
    Field,
    memorySource,
    Row,
    Select,
    Slider,
    Tabs,
    Toggle,
} from "../../mod"
import {
    FrameHighlight,
    FramePicker,
    GradientPicker,
    KeyboardFly,
    LayersPanel,
    Path,
    PointCloud,
    Pose,
    PoseArray,
    RenderingSettings,
    RobotModel,
    Scene3D,
    SceneControls,
    SceneStats,
    TfFeed,
    TfFootnote,
    TfFrames,
    TfPanel,
    TfTree,
    TopicLayers,
    useLayerManager,
    useScene,
    useTfFrames,
    useTfIssues,
} from "../../three"

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
    for (const [cx, cy, size] of [
        [3.5, 2, 0.8],
        [-3, -2.5, 1.1],
        [-4, 2.5, 0.6],
    ]) {
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
    return <Badge tone={frames.length ? "ok" : "default"}>{`${frames.length} TF frames`}</Badge>
}

export function SceneSection() {
    return (
        <Column gap={16}>
            <LiveDemo />
            <ReplayDemo />
        </Column>
    )
}

function LiveDemo() {
    const source = useMemo(() => memorySource(), [])
    // the scene's tree, made here so the frame picker below the scene can list its frames too
    const tf = useMemo(() => new TfTree(), [])
    useDemoRobot(source)
    const room = useMemo(roomCloud, [])
    const waypoints = useMemo(
        () =>
            [
                [-5, -3, 0.4],
                [5, -3, 1.6],
                [5, 3, 2.8],
                [-5, 3, -1.6],
            ].map(([x, y, yaw]) => ({ x, y, yaw })),
        [],
    )
    const [follow, setFollow] = useState(false)
    const [followFrame, setFollowFrame] = useState("base_link")
    const [style, setStyle] = useState("voxel")
    const [names, setNames] = useState(true)
    const [gradient, setGradient] = useState("memworld")
    return (
        <DataSourceProvider source={source}>
            <Card title="3D view" description="Scene3D with TF streamed over a test data source, plus props-fed layers">
                <Scene3D
                    tf={tf}
                    followFrame={follow ? followFrame : null}
                    fixedFrame="world"
                    style={{ height: 420 }}
                    cameraPosition={[-8, -9, 7]}
                >
                    <TfFeed />
                    <TfFrames names={names} axesSize={0.3} />
                    <PointCloud
                        points={room}
                        frame="world"
                        style={style}
                        size={0.06}
                        colorMode="height"
                        gradient={gradient}
                    />
                    <PointCloud topic={LIDAR_KEY} style="disc" size={0.05} colorMode="solid" color="var(--warn)" />
                    <Path topic={PATH_KEY} width={4} />
                    <Pose topic={ODOM_KEY} trail={true} axesSize={0} color="var(--accent-alt)" width={2} />
                    <PoseArray poses={waypoints} frame="world" length={0.6} />
                    <RobotModel kind="dog" frame="base_link" />
                    <KeyboardFly speed={4} />
                    <SceneStats />
                    <SceneControls />
                    <div className="dr-scene-overlay" style={{ top: 10, left: 10 }}>
                        <Row gap={8}>
                            <Toggle value={follow} onChange={setFollow} label="Follow" />
                            <FrameCount />
                            <Badge>WASD/QE fly · IJKL look</Badge>
                        </Row>
                    </div>
                </Scene3D>
                <Row gap={16} wrap={true} style={{ marginTop: 12 }}>
                    <Field label="Follow frame">
                        <FramePicker tf={tf} value={followFrame} onChange={setFollowFrame} />
                    </Field>
                    <Field label="Point style">
                        <Select
                            value={style}
                            onChange={setStyle}
                            options={[
                                ["voxel", "Cubes"],
                                ["disc", "Spheres"],
                                ["square", "Squares"],
                                ["splat", "Glow"],
                            ]}
                        />
                    </Field>
                    <Field label="Frame names">
                        <Toggle value={names} onChange={setNames} />
                    </Field>
                    <Field label="Gradient" style={{ minWidth: 260 }}>
                        <GradientPicker value={gradient} onChange={setGradient} />
                    </Field>
                </Row>
            </Card>
        </DataSourceProvider>
    )
}

// ── a replay: the same robot as a recording with a playhead (play / pause / scrub), every topic drawn by its layer
// type through TopicLayers, switched and tuned in LayersPanel, the TF tree in TfPanel ──

const REPLAY_SECONDS = 60
const loopPose = (seconds) => loopAt((seconds / REPLAY_SECONDS) % 1)

/** Everything a recording of the demo robot holds at `seconds` (keys → values), for a replay to publish. */
function replayFrame(seconds) {
    const [x, y, yaw] = loopPose(seconds)
    const out = {}
    out[TF_KEY] = { transforms: [stamped("odom", "base_link", [x, y, 0.35], yaw)] }
    out[TF_STATIC_KEY] = {
        transforms: [
            stamped("world", "map", [0, 0, 0]),
            stamped("map", "odom", [0, 0, 0]),
            stamped("base_link", "lidar_link", [0.2, 0, 0.3]),
        ],
    }
    out[ODOM_KEY] = {
        header: { frame_id: "odom" },
        pose: { pose: { position: { x, y, z: 0.05 }, orientation: { z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) } } },
    }
    const ring = new Float32Array(720 * 3)
    for (let index = 0; index < 720; index++) {
        const angle = (index / 720) * Math.PI * 2
        // what the lidar sees of the 12 × 8 m room from where the robot is
        const dx = Math.cos(angle + yaw),
            dy = Math.sin(angle + yaw)
        const range = Math.min(
            dx > 0 ? (6 - x) / dx : dx < 0 ? (-6 - x) / dx : 99,
            dy > 0 ? (4 - y) / dy : dy < 0 ? (-4 - y) / dy : 99,
        )
        ring.set([Math.cos(angle) * range, Math.sin(angle) * range, (index % 8) * 0.25 - 0.3], index * 3)
    }
    out["dimos/lidar/sensor_msgs.PointCloud2"] = { positions: ring, frame: "lidar_link" }
    return out
}

/** A costmap of the room: free floor, lethal walls and boxes, inflated costs around them. */
function costmap() {
    const resolution = 0.1,
        width = 130,
        height = 90
    const data = new Int8Array(width * height)
    const boxes = [
        [3.5, 2, 0.8],
        [-3, -2.5, 1.1],
        [-4, 2.5, 0.6],
    ]
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const px = -6.5 + column * resolution,
                py = -4.5 + row * resolution
            let distance = Math.min(6 - Math.abs(px), 4 - Math.abs(py))
            for (const [cx, cy, size] of boxes) {
                distance = Math.min(distance, Math.max(Math.abs(px - cx), Math.abs(py - cy)) - size / 2)
            }
            data[row * width + column] =
                distance <= 0 ? 100 : distance < 0.6 ? Math.round(99 * (1 - distance / 0.6)) : 0
        }
    }
    return {
        header: { frame_id: "map" },
        info: { width, height, resolution, origin: { position: { x: -6.5, y: -4.5, z: 0 }, orientation: { w: 1 } } },
        data,
    }
}

const color = (r, g, b, a = 1) => ({ r, g, b, a })
const STATIC_TOPICS = {
    "dimos/costmap/nav_msgs.OccupancyGrid": costmap,
    "dimos/markers/visualization_msgs.MarkerArray": () => ({
        markers: [
            {
                ns: "goal",
                id: 0,
                type: 2,
                action: 0,
                header: { frame_id: "map" },
                pose: { position: { x: 4.6, y: -2.6, z: 0.3 }, orientation: { w: 1 } },
                scale: { x: 0.4, y: 0.4, z: 0.4 },
                color: color(0.2, 0.9, 0.5),
            },
            {
                ns: "goal",
                id: 1,
                type: 9,
                action: 0,
                header: { frame_id: "map" },
                pose: { position: { x: 4.6, y: -2.6, z: 0.8 }, orientation: { w: 1 } },
                text: "goal",
                color: color(0.2, 0.9, 0.5),
            },
            {
                ns: "zone",
                id: 2,
                type: 4,
                action: 0,
                header: { frame_id: "map" },
                pose: { orientation: { w: 1 } },
                scale: { x: 0.05 },
                color: color(1, 0.7, 0.2),
                points: [
                    [-1, -1],
                    [1, -1],
                    [1, 1],
                    [-1, 1],
                    [-1, -1],
                ].map(([x, y]) => ({ x, y, z: 0.02 })),
            },
        ],
    }),
    "dimos/detections/vision_msgs.Detection3DArray": () => ({
        header: { frame_id: "map" },
        detections: [
            [3.5, 2, 0.8, "box", 0.93],
            [-3, -2.5, 1.1, "crate", 0.81],
            [-4, 2.5, 0.6, "box", 0.66],
        ].map(([x, y, size, class_id, score]) => ({
            bbox: {
                center: { position: { x, y, z: size / 2 }, orientation: { w: 1 } },
                size: { x: size, y: size, z: size },
            },
            results: [{ hypothesis: { class_id, score } }],
        })),
    }),
    "dimos/roadmap/nav_msgs.LineSegments3D": () => {
        const nodes = [
            [-5, -3],
            [0, -3.2],
            [5, -3],
            [5, 0],
            [5, 3],
            [0, 3.2],
            [-5, 3],
            [-5, 0],
            [0, 0],
        ]
        const edges = [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 6],
            [6, 7],
            [7, 0],
            [1, 8],
            [8, 5],
            [7, 8],
            [8, 3],
        ]
        const pose = ([x, y], w = 1) => ({ pose: { position: { x, y, z: 0.05 }, orientation: { w } } })
        return {
            header: { frame_id: "map" },
            poses: edges.flatMap(([a, b], index) => [pose(nodes[a], 1 + index * 3), pose(nodes[b])]),
        }
    },
    "dimos/clicked_point/geometry_msgs.PointStamped": () => ({
        header: { frame_id: "map" },
        point: { x: -1.5, y: 1.2, z: 0 },
    }),
    "dimos/waypoints/geometry_msgs.PoseArray": () => ({
        header: { frame_id: "map" },
        poses: [
            [-5, -3, 0.4],
            [5, -3, 1.6],
            [5, 3, 2.8],
            [-5, 3, -1.6],
        ].map(([x, y, yaw]) => ({
            position: { x, y, z: 0 },
            orientation: { z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
        })),
    }),
    "dimos/map/sensor_msgs.PointCloud2": () => ({ positions: roomCloud(), frame: "world" }),
}

/** The demo's replay: a playhead (ms) the scene's clock follows; each tick publishes the recording at it. */
function useReplay() {
    const playhead = useRef(0)
    const source = useMemo(
        () =>
            memorySource({
                clock: () => playhead.current,
                // the whole odometry route up front, like a recording's index
                route: (key) =>
                    key === ODOM_KEY
                        ? {
                              frame: "odom",
                              points: Array.from({ length: 600 }, (_, index) => {
                                  const t = (index / 600) * REPLAY_SECONDS
                                  const [x, y] = loopPose(t)
                                  return [t, x, y, 0.05]
                              }),
                          }
                        : null,
            }),
        [],
    )
    const [state, setState] = useState({ seconds: 0, playing: true })
    useEffect(() => {
        const statics = Object.entries(STATIC_TOPICS).map(([key, make]) => [key, make()])
        let last = performance.now()
        const publish = () => {
            for (const [key, value] of Object.entries(replayFrame(playhead.current / 1000))) {
                source.publish(key, value)
            }
            for (const [key, value] of statics) {
                source.publish(key, value)
            }
        }
        const timer = setInterval(() => {
            const now = performance.now()
            setState((current) => {
                if (current.playing) {
                    playhead.current = (playhead.current + (now - last)) % (REPLAY_SECONDS * 1000)
                }
                return { ...current, seconds: playhead.current / 1000 }
            })
            last = now
            publish()
        }, 100)
        return () => clearInterval(timer)
    }, [source])
    const seek = (seconds) => {
        playhead.current = seconds * 1000
        source.seek()
        setState((current) => ({ ...current, seconds }))
    }
    return { source, state, setPlaying: (playing) => setState((current) => ({ ...current, playing })), seek }
}

/** The TF footnote over the replay's view, from the scene's own tree and the drawn layers' frames. */
function ReplayFootnote({ manager, onOpen }) {
    const issues = useTfIssues({ layers: () => manager.layerFrames() })
    return <TfFootnote issues={issues} onOpen={onOpen} />
}

function SceneInfo({ onInfo }) {
    const { frameInfo } = useScene()
    useEffect(() => frameInfo.subscribe(() => onInfo(frameInfo.get())), [frameInfo])
    return null
}

function ReplayDemo() {
    const { source, state, setPlaying, seek } = useReplay()
    return (
        <DataSourceProvider source={source}>
            <ReplayView state={state} setPlaying={setPlaying} seek={seek} />
        </DataSourceProvider>
    )
}

function ReplayView({ state, setPlaying, seek }) {
    const manager = useLayerManager({ storagePrefix: "dimos-react-demo.layers", intervalMs: 1000 })
    const tf = useMemo(() => new TfTree(), [])
    const [tab, setTab] = useState("layers")
    const [hovered, setHovered] = useState(null)
    const [placed, setPlaced] = useState(true)
    const [fixedFrame, setFixedFrame] = useState("")
    const [follow, setFollow] = useState(true)
    const [info, setInfo] = useState({ fixedFrame: "", robotFound: false })
    const issues = useTfIssues({ tf, layers: () => manager.layerFrames(), fixedFrame: info.fixedFrame || "world" })
    return (
        <Card
            title="Topic layers (a replay)"
            description="TopicLayers draws every topic by its layer type; LayersPanel switches and tunes them; the playhead is the data clock and a seek resets trails and maps"
        >
            <Row gap={12} align="stretch" wrap={true}>
                <Scene3D
                    tf={tf}
                    fixedFrame={fixedFrame || undefined}
                    followFrame="base_link"
                    follow={follow}
                    onFollowChange={setFollow}
                    style={{ height: 460, flex: "2 1 420px" }}
                >
                    <TfFeed />
                    <TopicLayers manager={manager} />
                    <RobotModel kind="dog" />
                    <FrameHighlight frame={hovered} onPlaced={setPlaced} />
                    <SceneInfo onInfo={setInfo} />
                    <ReplayFootnote manager={manager} onOpen={() => setTab("tf")} />
                    <SceneStats />
                    <SceneControls />
                </Scene3D>
                <Column gap={8} style={{ flex: "1 1 260px", maxHeight: 460, overflow: "auto" }}>
                    <Tabs
                        value={tab}
                        onChange={setTab}
                        items={[
                            ["layers", "Layers"],
                            ["tf", "TF"],
                            ["rendering", "Rendering"],
                        ]}
                    />
                    {tab === "layers" ? (
                        <LayersPanel manager={manager} />
                    ) : tab === "tf" ? (
                        <TfPanel
                            tf={tf}
                            fixedFrame={fixedFrame}
                            activeFixedFrame={info.fixedFrame}
                            onFixedFrame={setFixedFrame}
                            issues={issues}
                            robotFrame="base_link"
                            robotFound={info.robotFound}
                            hovered={hovered}
                            hoveredPlaced={placed}
                            onHover={setHovered}
                        />
                    ) : (
                        <RenderingSettings />
                    )}
                </Column>
            </Row>
            <Row gap={12} align="center" style={{ marginTop: 12 }}>
                <Button size="sm" icon={state.playing ? "pause" : "play"} onClick={() => setPlaying(!state.playing)}>
                    {state.playing ? "Pause" : "Play"}
                </Button>
                <Slider
                    min={0}
                    max={REPLAY_SECONDS}
                    step={0.1}
                    value={state.seconds}
                    format={(seconds) => `${seconds.toFixed(1)} s`}
                    onChange={seek}
                    style={{ flex: 1 }}
                />
            </Row>
        </Card>
    )
}
