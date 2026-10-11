// The 3D view as React components. <Scene3D> owns a Viewer (three.js renderer, orbit/pan/zoom, follow camera) and a
// TfTree; layers inside it add themselves to its scene and take data from a topic (through the data source: live
// zenoh-gateway, a replay, a test source) or from props. <TopicLayers> draws every discovered topic with its layer
// type (the Controller's layer list); <LayersPanel> (panels.js) switches them and edits their settings.
//
//     h(Scene3D, { followFrame: "base_link", style: { height: 480 } },
//         h(TfFeed),                                                   // every tf2_msgs.TFMessage topic → the TF tree
//         h(TfFrames),
//         h(PointCloud, { topic: "dimos/lidar/sensor_msgs.PointCloud2" }),
//         h(Path, { topic: "dimos/path/nav_msgs.Path" }),
//         h(Pose, { topic: "dimos/odom/nav_msgs.Odometry", trail: true }),
//         h(RobotModel, { kind: "dog", frame: "base_link" }))
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { cx } from "../cx"
import { decodeMessage, parseKey, useDataSource, useTopicList } from "../data"
import { cameraStreamsFor } from "../components/camera"
import { Viewer } from "./viewer"
import { TfTree } from "./tf"
import { cssColor, disposeTree, robotModel } from "./robot_model"
import { Store, useStore } from "./store"
import { IconButton, Select } from "../components/controls"
import "./layers/index"
import { defaultSettings, layerTypeById, RobotPose } from "./layers/registry"
import { CLOUD_DEFAULTS, CloudLayer } from "./layers/pointcloud"
import { POSE_DEFAULTS, PoseLayer } from "./layers/pose"
import { PathLayer } from "./layers/path"
import { PoseArrayLayer } from "./layers/pose_array"
import { TF_DEFAULTS, TfFramesLayer } from "./layers/tf_frames"
import { checkTf, confirmedIssues } from "./tf_check"
import { FrameHighlighter } from "./frame_highlight"
import { poseMatrix as poseMatrixOf } from "./layers/pose"

export { pointCloud2ToPositions } from "./layers/pointcloud"
export { poseMatrix, poseOf } from "./layers/pose"
export { colorFor } from "./layers/path"

const SceneContext = createContext({ viewer: null, tf: null, fixedFrame: "world" })

/**
 * The enclosing Scene3D: `{ viewer, tf, fixedFrame, source, video, robotPose, options, frameInfo, actions }` (viewer
 * is null until it has mounted). `frameInfo`: a Store of `{ fixedFrame, robotFound, followFound, following }`;
 * `actions`: `{ recenter(), topDown() }`.
 */
export function useScene() {
    return useContext(SceneContext)
}

/** The enclosing Scene3D's Viewer (null until mounted). */
export function useViewer() {
    return useContext(SceneContext).viewer
}

/** The enclosing Scene3D's TfTree. */
export function useTf() {
    return useContext(SceneContext).tf
}

/** The fixed frame the enclosing Scene3D draws in. */
export function useFixedFrame() {
    return useContext(SceneContext).fixedFrame
}

/** The enclosing Scene3D's camera actions: `{ recenter(), topDown() }`. */
export function useSceneActions() {
    return useContext(SceneContext).actions
}

/** Calls `callback(frame)` every animation frame of the enclosing scene (frame: { now, dataNow, fixedFrame, camera }). */
export function useSceneFrame(callback) {
    const viewer = useViewer()
    const ref = useRef(callback)
    ref.current = callback
    useEffect(() => viewer?.onFrame((frame) => ref.current(frame)), [viewer])
}

/** The TF tree's frame names, re-rendered (at most every `throttleMs`) when the tree changes. */
export function useTfFrames({ throttleMs = 500, tf: given } = {}) {
    const context = useTf()
    const tf = given ?? context
    const [frames, setFrames] = useState(() => tf?.frames() ?? [])
    useEffect(() => {
        if (!tf) {
            return
        }
        let timer = null
        let last = ""
        const read = () => {
            timer = null
            const next = tf.frames()
            const signature = next.join("\n")
            if (signature !== last) {
                last = signature
                setFrames(next)
            }
        }
        read()
        const off = tf.onChange(() => {
            timer ??= setTimeout(read, throttleMs)
        })
        return () => {
            off()
            clearTimeout(timer)
        }
    }, [tf, throttleMs])
    return frames
}

/**
 * Mounts a custom layer in the enclosing scene: `create({ viewer, tf, ... })` returns
 * `{ root?: THREE.Object3D, update?(frame), reset?(), dispose?() }` (or null). `root` is added to the scene and
 * removed on cleanup, `update` runs every frame, `reset` on a replay's seek. Re-created when `deps` change; returns a
 * ref to the live layer (push new data into it from your own effects instead of re-creating it).
 */
export function useLayer(create, deps = []) {
    const scene = useScene()
    const { viewer, tf } = scene
    const ref = useRef(null)
    useEffect(() => {
        if (!viewer) {
            return
        }
        const layer = create(scene)
        if (!layer) {
            return
        }
        if (layer.root) {
            viewer.scene.add(layer.root)
        }
        const offFrame = layer.update ? viewer.onFrame((frame) => layer.update(frame)) : null
        const offReset = layer.reset ? viewer.onReset(() => layer.reset()) : null
        ref.current = layer
        viewer.requestRender()
        return () => {
            offFrame?.()
            offReset?.()
            layer.root?.removeFromParent()
            layer.dispose?.()
            if (ref.current === layer) {
                ref.current = null
            }
            viewer.requestRender()
        }
    }, [viewer, tf, ...deps])
    return ref
}

/**
 * Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides the object. Returns whether it could
 * be placed (and why not, through `onStatus`).
 */
export function placeInFixedFrame(viewer, tf, object, frame, fixedFrame, onStatus) {
    const matrix = tf.lookup(frame, fixedFrame)
    if (!matrix) {
        if (object.visible) {
            object.visible = false
            viewer.requestRender()
        }
        onStatus?.({ problem: `no TF path from "${frame}" to "${fixedFrame}"`, frame })
        return false
    }
    if (!object.visible || !object.matrix.equals(matrix)) {
        object.matrix.copy(matrix)
        object.matrixWorldNeedsUpdate = true
        object.visible = true
        viewer.requestRender()
    }
    return true
}

/** The layer context a layer type's instance gets (registry.js LayerContext). */
function layerContext(scene, setStatus, extra = {}) {
    return {
        viewer: scene.viewer,
        tf: scene.tf,
        source: scene.source,
        video: scene.video,
        robotPose: scene.robotPose,
        options: scene.options ?? {},
        topics: () => scene.topics?.() ?? [],
        setStatus,
        ...extra,
    }
}

/**
 * The 3D view. Give it a size (style/className); layers go in `children`, and any DOM children (buttons, stats) are
 * laid over it.
 * @param {{
 *   fixedFrame?: string, followFrame?: string | null, follow?: boolean, onFollowChange?: (follow: boolean) => void,
 *   robotFrame?: string | null, viewDistance?: number, grid?: boolean, tf?: TfTree, clock?: () => number,
 *   onPick?: (pick: { point: THREE.Vector3, on: string, event: MouseEvent }) => void,
 *   onViewer?: (viewer: Viewer) => void, layerOptions?: { baseFrame?: string, cameraInfo?: Record<string, string> },
 *   topics?: () => object[], className?: string, style?: object, children?: any,
 *   cameraPosition?: [number, number, number], cameraTarget?: [number, number, number],
 *   near?: number, far?: number, fov?: number, gridSize?: number, gridDivisions?: number, freeOrbit?: boolean,
 * }} props
 *   `fixedFrame`: the frame everything is drawn in (default: the TF tree's world-ish root). `followFrame`: a TF frame
 *   the camera follows while `follow` (orbit and zoom keep following; a pan pauses it until resumed). `robotFrame`:
 *   the robot's frame (default `followFrame`): the camera frames it once when it first shows up, and without it in
 *   TF the newest pose from a Pose layer stands in for it. A replay source (memorySource({ clock })) drives the data
 *   clock (fading, staleness, lifetimes) and its seek() resets the layers. `near`, `far`, `fov`, `gridSize`,
 *   `gridDivisions`, `freeOrbit`: the Viewer's options, read once when it mounts.
 */
export function Scene3D({
    fixedFrame,
    followFrame = null,
    follow = true,
    onFollowChange,
    robotFrame,
    viewDistance = 7,
    grid = true,
    tf: givenTf,
    clock,
    onPick,
    onViewer,
    layerOptions,
    topics,
    className,
    style,
    children,
    cameraPosition,
    cameraTarget,
    near,
    far,
    fov,
    gridSize,
    gridDivisions,
    freeOrbit,
    ...rest
}) {
    const hostRef = useRef(null)
    const source = useDataSource()
    const [viewer, setViewer] = useState(null)
    const tf = useMemo(() => givenTf ?? new TfTree(), [givenTf])
    const robotPose = useMemo(() => new RobotPose(), [])
    const frameInfo = useMemo(
        () => new Store({ fixedFrame: "", robotFound: false, followFound: false, following: false }),
        [],
    )
    const [autoFixed, setAutoFixed] = useState("world")
    const fixed = fixedFrame || autoFixed
    const robot = robotFrame === undefined ? followFrame : robotFrame
    const props = useRef({})
    props.current = { follow, followFrame, robot, viewDistance, onFollowChange }

    useEffect(() => {
        const created = new Viewer(hostRef.current, {
            clock: clock ?? (() => source.now?.() ?? Date.now()),
            grid,
            near,
            far,
            fov,
            gridSize,
            gridDivisions,
            freeOrbit,
        })
        setViewer(created)
        const onTheme = () => created.setTheme()
        addEventListener("dimos-react-theme", onTheme)
        return () => {
            removeEventListener("dimos-react-theme", onTheme)
            created.dispose()
            setViewer(null)
        }
    }, [])

    // a replay: its playhead is the data clock (TF staleness too), and a seek resets the layers
    useEffect(() => {
        if (!viewer) {
            return
        }
        if (source.replay) {
            viewer.dataClock = () => source.now()
            tf.now = () => source.now()
        }
        const off = source.onSeek?.(() => viewer.reset())
        return () => {
            off?.()
            viewer.dataClock = () => performance.now()
        }
    }, [viewer, source, tf])

    useEffect(() => {
        if (viewer) {
            onViewer?.(viewer)
        }
    }, [viewer])

    useEffect(() => viewer?.setGrid(grid), [viewer, grid])

    useEffect(() => {
        if (!viewer) {
            return
        }
        if (cameraTarget) {
            viewer.controls.target.set(...cameraTarget)
        }
        if (cameraPosition) {
            viewer.camera.position.set(...cameraPosition)
        }
        viewer.controls.update()
        viewer.requestRender()
    }, [viewer, cameraPosition?.join(","), cameraTarget?.join(",")])

    // no fixed frame given: the tree's world-ish root, re-checked as frames arrive
    useEffect(() => {
        if (fixedFrame) {
            return
        }
        const check = () => setAutoFixed(tf.defaultFixedFrame())
        check()
        let timer = null
        const off = tf.onChange(() => {
            timer ??= setTimeout(() => {
                timer = null
                check()
            }, 300)
        })
        return () => {
            off()
            clearTimeout(timer)
        }
    }, [tf, fixedFrame])

    useEffect(() => {
        if (viewer) {
            viewer.fixedFrame = fixed
            viewer.requestRender()
        }
    }, [viewer, fixed])

    // where the robot and the followed frame are, every frame; the camera follows the latter while following
    const positions = useRef({ robot: null, follow: null, framed: false })
    useEffect(() => {
        if (!viewer) {
            return
        }
        positions.current.framed = false
        const robotAt = new THREE.Vector3()
        const followAt = new THREE.Vector3()
        const off = viewer.onFrame((frame) => {
            const { follow, followFrame, robot, viewDistance } = props.current
            const robotMatrix = robot ? (tf.lookup(robot, frame.fixedFrame) ?? robotPose.matrix) : robotPose.matrix
            const robotPosition = robotMatrix ? robotAt.setFromMatrixPosition(robotMatrix) : null
            if (robotPosition && !positions.current.framed) {
                positions.current.framed = true
                viewer.frame(robotPosition.clone(), viewDistance)
            }
            let followed = null
            if (followFrame) {
                followed = followFrame === robot ? robotPosition : null
                if (!followed) {
                    const matrix = tf.lookup(followFrame, frame.fixedFrame)
                    followed = matrix ? followAt.setFromMatrixPosition(matrix) : null
                }
            }
            positions.current.robot = robotPosition
            positions.current.follow = followed
            viewer.followTarget = follow ? followed : null
            const following = !!(follow && followFrame) && !viewer.followPaused.get().paused
            const info = frameInfo.get()
            if (
                info.fixedFrame !== frame.fixedFrame ||
                info.robotFound !== !!robotPosition ||
                info.followFound !== !!followed ||
                info.following !== following
            ) {
                frameInfo.set({
                    fixedFrame: frame.fixedFrame,
                    robotFound: !!robotPosition,
                    followFound: !!followed,
                    following,
                })
            }
        })
        return () => {
            off()
            viewer.followTarget = null
        }
    }, [viewer, tf, robotPose])

    useEffect(() => {
        viewer?.resumeFollow()
    }, [viewer, followFrame])

    const actions = useMemo(
        () => ({
            /**
             * Not following (paused by a pan, or off): follows again, gliding the followed frame back to the middle with
             * the angle and zoom kept. Already following: frames it afresh. Without it in TF, frames the data that's
             * drawn, or else the origin.
             */
            recenter() {
                if (!viewer) {
                    return
                }
                const { follow, followFrame, viewDistance, onFollowChange } = props.current
                const wasFollowing = follow && !!followFrame && !viewer.followPaused.get().paused
                if (!follow) {
                    onFollowChange?.(true)
                }
                viewer.resumeFollow()
                const followed = positions.current.follow
                if (wasFollowing && followed) {
                    viewer.frame(followed.clone(), viewDistance)
                    return
                }
                if (followed) {
                    return
                }
                const bounds = viewer.dataBounds()
                if (bounds) {
                    const size = bounds.getSize(new THREE.Vector3())
                    viewer.frame(
                        bounds.getCenter(new THREE.Vector3()),
                        THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) * 1.2, 4, 300),
                    )
                    return
                }
                viewer.frame(new THREE.Vector3(), viewDistance)
            },
            /** Straight down on the area around the robot (or on everything drawn without one). */
            topDown() {
                viewer?.topDownAround(positions.current.robot)
            },
        }),
        [viewer],
    )

    // a click (not the end of a drag) picks the point under it
    const pickRef = useRef(onPick)
    pickRef.current = onPick
    useEffect(() => {
        if (!viewer) {
            return
        }
        const canvas = viewer.renderer.domElement
        let down = null
        const onDown = (event) => {
            down = { x: event.clientX, y: event.clientY }
        }
        const onUp = (event) => {
            if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || !pickRef.current) {
                return
            }
            const picked = viewer.pick(event.clientX, event.clientY)
            if (picked) {
                pickRef.current({ ...picked, event })
            }
        }
        canvas.addEventListener("pointerdown", onDown)
        canvas.addEventListener("pointerup", onUp)
        return () => {
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointerup", onUp)
        }
    }, [viewer])

    const topicsRef = useRef(topics)
    topicsRef.current = topics
    const optionsSignature = JSON.stringify(layerOptions ?? {})
    const value = useMemo(
        () => ({
            viewer,
            tf,
            fixedFrame: fixed,
            source,
            video: cameraStreamsFor(source),
            robotPose,
            options: { baseFrame: robot ?? undefined, ...layerOptions },
            topics: () => topicsRef.current?.() ?? [],
            frameInfo,
            actions,
        }),
        [viewer, tf, fixed, source, robotPose, robot, optionsSignature, frameInfo, actions],
    )
    return (
        <div className={cx("dr-scene", className)} style={style} {...rest}>
            <div className="dr-scene-host" ref={hostRef} />
            <SceneContext.Provider value={value}>{viewer ? children : null}</SceneContext.Provider>
        </div>
    )
}

/**
 * Feeds the scene's TF tree: every tf2_msgs.TFMessage topic on the bus (or `topics`), and/or `transforms` given as
 * props. A topic named like tf_static is static (exempt from staleness).
 * @param {{ topics?: string[], transforms?: any, staticTransforms?: any, tf?: TfTree }} props `transforms`: a
 *   decoded TFMessage, an array of TransformStamped, or `[{ parent, child, translation, rotation }]`
 */
export function TfFeed({ topics, transforms, staticTransforms, tf: given }) {
    const context = useScene()
    const tf = given ?? context.tf
    const viewer = context.viewer
    const source = useDataSource()
    const listed = useTopicList({ types: ["tf2_msgs.TFMessage"], intervalMs: topics ? 3_600_000 : 2000 })
    const keys = topics ?? listed.map((topic) => topic.key)
    const keysSignature = keys.join("\n")
    useEffect(() => {
        if (!tf) {
            return
        }
        const stops = keys.map((key) =>
            // reliable: one tf topic often carries different edges from different publishers, so none may be dropped
            source.subscribe(key, { delivery: "reliable" }, (message) => {
                let decoded
                try {
                    decoded = decodeMessage(message, "auto", parseKey(key)?.type ?? "tf2_msgs.TFMessage")
                } catch {
                    return
                }
                tf.setMessage(decoded, /static/i.test(key))
                viewer?.noteData(message.timestamp)
            }),
        )
        return () => stops.forEach((stop) => stop())
    }, [source, tf, viewer, keysSignature])
    useEffect(() => {
        applyTransforms(tf, staticTransforms, true)
        viewer?.requestRender()
    }, [tf, staticTransforms])
    useEffect(() => {
        applyTransforms(tf, transforms, false)
        viewer?.requestRender()
    }, [tf, transforms])
    return null
}

/** Same as TfFeed (the name the component inventory uses). */
export const TfProvider = TfFeed

function applyTransforms(tf, transforms, isStatic) {
    if (!tf || !transforms) {
        return
    }
    const list = Array.isArray(transforms) ? transforms : (transforms.transforms ?? [])
    for (const item of list) {
        if (item?.child !== undefined) {
            tf.set(
                item.parent,
                item.child,
                item.translation ?? [0, 0, 0],
                item.rotation ?? [0, 0, 0, 1],
                item.static ?? isStatic,
            )
        } else {
            tf.setMessage([item], isStatic)
        }
    }
}

/**
 * One layer of a registered type (layers/registry.js) in the scene: from a topic, or from `data` (types that take
 * props data: pointcloud, pose, path, posearray, labeled-points `[{ label, position, frame, color }]`, boxes3d
 * `[{ center, size, yaw, frame, label, color, fill }]`). `settings` override the type's defaults (live: a change restyles,
 * it doesn't re-create).
 * @param {{ type: string | object, topic?: string | { key: string, name: string, type: string } | null,
 *   settings?: object, data?: any, onStatus?: (status: object) => void, onPose?: (matrix: THREE.Matrix4) => void }} props
 */
export function Layer({ type, topic, settings, data, onStatus, onPose }) {
    const scene = useScene()
    const layerType = typeof type === "string" ? layerTypeById(type) : type
    if (!layerType) {
        throw new Error(`[dimos-react] no layer type "${type}"`)
    }
    const topicObject =
        typeof topic === "string" ? (parseKey(topic) ?? { key: topic, name: topic, type: "" }) : (topic ?? null)
    const store = useMemo(
        () => new Store({ ...defaultSettings(layerType, topicObject), ...settings }),
        [layerType, topicObject?.key],
    )
    const settingsSignature = JSON.stringify(settings ?? {})
    useEffect(() => {
        if (settings) {
            store.update(settings)
        }
    }, [store, settingsSignature])
    const callbacks = useRef({})
    callbacks.current = { onStatus, onPose }
    const instance = useLayer(() => {
        const created = layerType.create(
            layerContext(scene, (status) => callbacks.current.onStatus?.(status), {
                onPose: (matrix) => callbacks.current.onPose?.(matrix),
            }),
            topicObject,
            store,
        )
        // registry layers place their root by its matrix
        created.root.matrixAutoUpdate = false
        return created
    }, [layerType, topicObject?.key, store])
    useEffect(() => {
        if (data !== undefined && instance.current?.setData) {
            instance.current.setData(data)
        }
    }, [scene.viewer, data, instance.current])
    return null
}

/**
 * Every topic a LayerManager lists, drawn by its layer type while switched on (unsubscribed while off or paused).
 * The manager (panels.js useLayerManager) is shared with a LayersPanel outside the scene.
 * @param {{ manager: import("./layers/manager").LayerManager }} props
 */
export function TopicLayers({ manager }) {
    const scene = useScene()
    const { list } = useStore(manager.entries)
    const { paused } = useStore(manager.paused)
    const instances = useRef(new Map())
    const sceneRef = useRef(scene)
    sceneRef.current = scene
    useEffect(() => {
        const viewer = scene.viewer
        if (!viewer) {
            return
        }
        const wanted = new Map(
            paused ? [] : list.filter((entry) => entry.enabled).map((entry) => [entry.topic.key, entry]),
        )
        for (const [key, running] of instances.current) {
            if (!wanted.has(key) || wanted.get(key).type !== running.type) {
                stop(key)
            }
        }
        for (const [key, entry] of wanted) {
            if (instances.current.has(key)) {
                continue
            }
            const context = layerContext(sceneRef.current, (status) => manager.setStatus(key, status), {
                topics: () => manager.topics.get().list,
            })
            try {
                const instance = entry.type.create(context, entry.topic, entry.settings)
                instance.root.matrixAutoUpdate = false
                viewer.scene.add(instance.root)
                const offFrame = instance.update ? viewer.onFrame((frame) => instance.update(frame)) : null
                const offReset = instance.reset ? viewer.onReset(() => instance.reset()) : null
                instances.current.set(key, { instance, type: entry.type, offFrame, offReset })
            } catch (error) {
                manager.setStatus(key, { problem: `failed to start: ${error?.message ?? error}` })
            }
        }
        viewer.requestRender()
        function stop(key) {
            const running = instances.current.get(key)
            instances.current.delete(key)
            running.offFrame?.()
            running.offReset?.()
            running.instance.root.removeFromParent()
            running.instance.dispose()
            manager.clearStatus(key)
        }
    }, [scene.viewer, list, paused, manager])
    // the scene went away: everything stops
    useEffect(
        () => () => {
            for (const [key, running] of instances.current) {
                running.offFrame?.()
                running.offReset?.()
                running.instance.root.removeFromParent()
                running.instance.dispose()
                manager.clearStatus(key)
            }
            instances.current.clear()
        },
        [scene.viewer, manager],
    )
    return null
}

/**
 * The TF tree drawn: an axes gizmo per frame (theme --axis-x/y/z), its name, and a line to its parent. A big tree
 * names only `named` frames (and the fixed frame) past `maxNames`.
 * @param {Record<string, any>} props
 */
export function TfFrames({
    axesSize = 0.25,
    names = true,
    links = true,
    maxNames = 16,
    named = [],
    maxFrames = 512,
    onStatus,
}) {
    const settings = { axesSize, names, links, maxNames, named, maxFrames }
    return <Layer type={tfType} settings={settings} onStatus={onStatus} />
}
const tfType = {
    id: "tf-frames",
    defaults: TF_DEFAULTS,
    create: (context, _topic, settings) => new TfFramesLayer(context, settings),
}

const cloudType = {
    id: "pointcloud-props",
    create: (context, topic, settings) => new CloudLayer(context, topic, settings),
}

/**
 * A point cloud: from a topic (sensor_msgs.PointCloud2 through the gateway's dimos_lcm_pointcloud2 encoding at this
 * viewer's bandwidth preset, or any source publishing `{ positions, intensity?, frame? }` or a decoded PointCloud2) or
 * from `points` props.
 * @param {{
 *   topic?: string, points?: Float32Array | number[], intensity?: Uint8Array, frame?: string,
 *   mode?: "latest" | "accumulate", windowSeconds?: number, maxPoints?: number, maxHz?: number, quality?: number,
 *   style?: "default" | "voxel" | "splat" | "disc" | "square", size?: number,
 *   colorMode?: "height" | "intensity" | "range" | "solid", gradient?: string, axis?: 0 | 1 | 2,
 *   period?: number,
 *   rangeMin?: number | null, rangeMax?: number | null, color?: string, opacity?: number, cubeShade?: string,
 *   onStatus?: (status: object) => void,
 * }} props `color`: the solid color (CSS or a token like "var(--primary)"; colorMode "solid"); `maxHz` / `quality`
 *   pin the subscription instead of the viewer's preset
 */
export function PointCloud({
    topic,
    points,
    intensity,
    frame,
    mode = "latest",
    windowSeconds = 10,
    maxPoints = 2_000_000,
    maxHz,
    quality,
    style,
    size,
    colorMode,
    gradient,
    period,
    axis,
    rangeMin,
    rangeMax,
    color,
    opacity,
    cubeShade,
    onStatus,
}) {
    const look = { ...CLOUD_DEFAULTS.look, style: "voxel", size: 0.05 }
    for (const [name, value] of Object.entries({
        style,
        size,
        colorMode,
        gradient,
        period,
        axis,
        rangeMin,
        rangeMax,
        opacity,
        cubeShade,
    })) {
        if (value !== undefined) {
            look[name] = value
        }
    }
    if (color !== undefined) {
        look.solid = `#${cssColor(color, "white").getHexString()}`
    }
    const settings = { look, mode, windowSeconds, maxPoints, maxHz, quality, frame }
    const data = useMemo(
        () => (points ? { positions: points, intensity, frame } : undefined),
        [points, intensity, frame],
    )
    return <Layer type={cloudType} topic={topic} settings={settings} data={data} onStatus={onStatus} />
}

const pathType = { id: "path-props", create: (context, topic, settings) => new PathLayer(context, topic, settings) }

/**
 * A path as a thick line: a nav_msgs.Path topic, or `poses` (+ `frame`) as props.
 * @param {{ topic?: string, poses?: any[], frame?: string, color?: string, width?: number, lift?: number,
 *   onTop?: boolean, onStatus?: Function }} props `color`: CSS or token (default var(--primary))
 */
export function Path({
    topic,
    poses,
    frame = "",
    color = "var(--primary)",
    width = 4,
    lift = 0.03,
    onTop = false,
    onStatus,
}) {
    const data = useMemo(() => (poses ? { poses, frame } : undefined), [poses, frame])
    return (
        <Layer type={pathType} topic={topic} settings={{ color, width, lift, onTop }} data={data} onStatus={onStatus} />
    )
}

const poseType = {
    id: "pose-props",
    defaults: POSE_DEFAULTS,
    create: (context, topic, settings) => new PoseLayer(context, topic, settings),
}

/**
 * A pose as axes (theme axis colors), with an optional trail of where it has been (kept in the fixed frame; a jump
 * leaves a gap) and, when the source knows it (a recording), the whole route faint ahead. From a topic
 * (nav_msgs.Odometry, geometry_msgs.PoseStamped / PoseWithCovarianceStamped) or `pose` (+ `frame`) as props.
 * @param {{ topic?: string, pose?: any, frame?: string, axesSize?: number, trail?: boolean, trailLength?: number,
 *   jumpMeters?: number, color?: string, width?: number, onTop?: boolean, route?: boolean,
 *   onPose?: (matrix: THREE.Matrix4) => void, onStatus?: Function }} props `onPose`: the pose in the fixed frame
 */
export function Pose({
    topic,
    pose,
    frame = "",
    axesSize = 0.6,
    trail = false,
    trailLength = 20000,
    jumpMeters = 2.5,
    color = "var(--primary)",
    width = 4,
    onTop = true,
    route = true,
    onPose,
    onStatus,
}) {
    const data = useMemo(() => (pose ? { pose, frame } : undefined), [pose, frame])
    return (
        <Layer
            type={poseType}
            topic={topic}
            settings={{ axesSize, trail, trailLength, jumpMeters, color, width, onTop, route }}
            data={data}
            onPose={onPose}
            onStatus={onStatus}
        />
    )
}

const poseArrayType = {
    id: "posearray-props",
    create: (context, topic, settings) => new PoseArrayLayer(context, topic, settings),
}

/**
 * Many poses as arrows: a geometry_msgs.PoseArray topic, or `poses` (+ `frame`) as props.
 * @param {{ topic?: string, poses?: any[], frame?: string, color?: string, length?: number, width?: number }} props
 */
export function PoseArray({
    topic,
    poses,
    frame = "",
    color = "var(--accent-alt)",
    length = 0.4,
    width = 2,
    onStatus,
}) {
    const data = useMemo(() => (poses ? { poses, frame } : undefined), [poses, frame])
    return (
        <Layer type={poseArrayType} topic={topic} settings={{ color, length, width }} data={data} onStatus={onStatus} />
    )
}

/**
 * A stand-in robot model (ROBOT_KINDS: dog, humanoid, wheeled, drone, arrow) at a TF frame (`frame`, default the
 * scene's robotFrame, else base_link) or at `pose` (in `poseFrame`). Without its frame in TF it stands at the newest
 * pose a Pose layer reported. Colors follow the theme unless `colors` says otherwise.
 * @param {{ kind?: string, frame?: string, pose?: any, poseFrame?: string, scale?: number, visible?: boolean,
 *   colors?: { body?: string, dark?: string, nose?: string } }} props
 */
export function RobotModel({ kind = "wheeled", frame, pose, poseFrame = "", scale = 1, visible = true, colors }) {
    const scene = useScene()
    const settings = useRef({})
    settings.current = { frame: frame ?? scene.options?.baseFrame ?? "base_link", pose, poseFrame, scale, visible }
    const colorsSignature = JSON.stringify(colors ?? {})
    useLayer(
        ({ viewer, tf, robotPose }) => {
            let model = robotModel(kind, colors)
            if (!model) {
                return null
            }
            const root = new THREE.Group()
            root.add(model)
            const rebuild = () => {
                disposeTree(model)
                model = robotModel(kind, colors)
                root.add(model)
                viewer.requestRender()
            }
            addEventListener("dimos-react-theme", rebuild)
            const local = new THREE.Matrix4()
            const scaleVector = new THREE.Vector3()
            return {
                root,
                update(frameInfo) {
                    const { frame, pose, poseFrame, scale, visible } = settings.current
                    const base = pose
                        ? tf.lookup(poseFrame, frameInfo.fixedFrame)
                        : (tf.lookup(frame, frameInfo.fixedFrame) ?? robotPose?.matrix ?? null)
                    if (!base || !visible) {
                        if (model.visible) {
                            model.visible = false
                            viewer.requestRender()
                        }
                        return
                    }
                    const matrix = pose ? base.clone().multiply(poseMatrixOf(pose, local)) : base.clone()
                    matrix.scale(scaleVector.setScalar(scale))
                    if (!model.visible || !model.matrix.equals(matrix)) {
                        model.matrix.copy(matrix)
                        model.matrixWorldNeedsUpdate = true
                        model.visible = true
                        viewer.requestRender()
                    }
                },
                dispose() {
                    removeEventListener("dimos-react-theme", rebuild)
                    disposeTree(model)
                },
            }
        },
        [kind, colorsSignature],
    )
    return null
}

/**
 * One TF frame picked out (e.g. a TF panel's hovered row): big axes drawn over everything with a halo and its name,
 * following the frame as it moves. `onPlaced(placed)` says whether it could be placed in the fixed frame.
 * @param {{ frame: string | null, onPlaced?: (placed: boolean) => void }} props
 */
export function FrameHighlight({ frame, onPlaced }) {
    const placedRef = useRef(onPlaced)
    placedRef.current = onPlaced
    const layer = useLayer(
        ({ viewer, tf }) => new FrameHighlighter(viewer, tf, (placed) => placedRef.current?.(placed)),
        [],
    )
    useEffect(() => {
        layer.current?.set(frame ?? null)
    }, [frame, layer.current])
    return null
}

/**
 * What's wrong with the scene's TF tree (tf_check.js), checked every `intervalMs`; a problem shows once two checks in a
 * row see it. `layers`: the drawn layers' frames (a LayerManager's layerFrames()).
 * @returns {import("./tf_check").TfIssue[]}
 */
export function useTfIssues({ layers, tf: given, fixedFrame: givenFixed, intervalMs = 2000 } = {}) {
    const scene = useScene()
    const tf = given ?? scene.tf
    const fixedRef = useRef(givenFixed ?? scene.fixedFrame)
    fixedRef.current = givenFixed ?? scene.viewer?.fixedFrame ?? scene.fixedFrame
    const layersRef = useRef(layers)
    layersRef.current = layers
    const [issues, setIssues] = useState([])
    useEffect(() => {
        if (!tf) {
            return
        }
        let seen = []
        let shown = "[]"
        const check = () => {
            const fixedFrame = fixedRef.current
            const next = checkTf({
                snapshot: tf.snapshot(),
                fixedFrame,
                layers: typeof layersRef.current === "function" ? layersRef.current() : (layersRef.current ?? []),
                placed: (frame) => tf.lookup(frame, fixedFrame) !== null,
            })
            const confirmed = confirmedIssues(seen, next)
            seen = next
            const signature = JSON.stringify(confirmed)
            if (signature !== shown) {
                shown = signature
                setIssues(confirmed)
            }
        }
        const timer = setInterval(check, intervalMs)
        return () => clearInterval(timer)
    }, [tf, intervalMs])
    return issues
}

/**
 * A Select of the scene's TF frames (inside a Scene3D, or pass `tf`).
 * @param {{ value?: string | null, onChange: (frame: string | null) => void, tf?: TfTree, noneLabel?: string | null,
 *   placeholder?: string, size?: "sm" | "md", className?: string }} props `noneLabel`: an extra "none" option (null)
 */
export function FramePicker({ value, onChange, tf, noneLabel = null, placeholder = "frame…", ...rest }) {
    const frames = useTfFrames({ tf })
    const options = [...(noneLabel !== null ? [[null, noneLabel]] : []), ...frames.map((name) => [name, name])]
    if (value && !frames.includes(value)) {
        options.push([value, `${value} (not seen)`])
    }
    return <Select value={value ?? null} onChange={onChange} options={options} placeholder={placeholder} {...rest} />
}

const emptyStats = new Store({
    fps: 0,
    frameMs: 0,
    latencyP50: null,
    latencyP95: null,
    arrivalToFrameMs: null,
    drawCalls: 0,
    points: 0,
})

/**
 * The scene's render numbers as a small overlay: fps · points · frame ms · latency, or with `detailed` the full set
 * (CPU per frame, latency p50/p95, arrival→frame, `rttMs` if given, points, draw calls).
 * @param {{ className?: string, detailed?: boolean, rttMs?: number | null }} props
 */
export function SceneStats({ className, detailed = false, rttMs }) {
    const viewer = useViewer()
    const stats = useStore(viewer?.stats ?? emptyStats)
    if (detailed) {
        const ms = (value) => (value === null || value === undefined ? "–" : `${value.toFixed(1)} ms`)
        return (
            <div className={cx("dr-scene-stats dr-scene-stats--detailed", className)} data-testid="stats">
                <div>{`${stats.fps} fps · ${stats.frameMs.toFixed(2)} ms/frame CPU`}</div>
                <div>{`latency p50 ${ms(stats.latencyP50)} · p95 ${ms(stats.latencyP95)}`}</div>
                <div>{`arrival→frame ${ms(stats.arrivalToFrameMs)}${rttMs !== undefined ? ` · rtt ${ms(rttMs)}` : ""}`}</div>
                <div>{`${stats.points.toLocaleString()} points · ${stats.drawCalls} draws`}</div>
            </div>
        )
    }
    const points =
        stats.points > 1e6
            ? `${(stats.points / 1e6).toFixed(1)}M`
            : stats.points > 1e3
              ? `${(stats.points / 1e3).toFixed(0)}k`
              : String(stats.points)
    return (
        <div className={cx("dr-scene-stats", className)}>
            {`${stats.fps} fps · ${points} pts · ${stats.frameMs.toFixed(1)} ms`}
            {stats.latencyP50 !== null ? ` · ${Math.round(stats.latencyP50)} ms latency` : ""}
        </div>
    )
}

/**
 * Camera buttons over the scene: follow (reframes the followed frame, or follows again after a pan), top-down (on the
 * area around the robot), frame everything. `children`: extra buttons.
 * `onFrameAll` / `onTopDown` replace what those buttons do (an app's own idea of "everything"); `position`:
 * "bottom-right" (default) | "top-right" | "top-left" | "bottom-left".
 * @param {{ className?: string, children?: any, frameAll?: boolean, onFrameAll?: () => void,
 *   onTopDown?: () => void, position?: string }} props
 */
export function SceneControls({
    className,
    children,
    frameAll = true,
    onFrameAll,
    onTopDown,
    position = "bottom-right",
}) {
    const { viewer, frameInfo, actions } = useScene()
    const info = useStore(frameInfo ?? emptyFrameInfo)
    const button = (icon, label, onClick, pressed) => (
        <IconButton
            icon={icon}
            label={label}
            title={label}
            className="dr-scene-btn"
            aria-pressed={pressed}
            onClick={onClick}
        />
    )
    const followTitle = info.following
        ? `Following${
              info.followFound ? "" : " (waiting for the frame in TF)"
          }: orbit and zoom keep following, a pan looks around. Click to reframe`
        : "Follow again"
    return (
        <div
            className={cx(
                "dr-scene-controls",
                position !== "bottom-right" && `dr-scene-controls--${position}`,
                className,
            )}
            data-testid="view-controls"
        >
            {button("target", followTitle, () => actions?.recenter(), info.following)}
            {button("top", "Top-down", () => (onTopDown ? onTopDown() : actions?.topDown()))}
            {frameAll
                ? button("fit", "Frame everything", () => (onFrameAll ? onFrameAll() : viewer?.frameAll()))
                : null}
            {children}
        </div>
    )
}
const emptyFrameInfo = new Store({ fixedFrame: "", robotFound: false, followFound: false, following: false })

const FLY_KEYS = new Set([..."wasdqeijkl"])

/**
 * Keyboard flying for the enclosing scene, beside the mouse orbit: W/S forward/back and A/D left/right over the ground,
 * Q/E down/up, I/K look up/down and J/L look left/right (the camera stays put, the orbit target swings around it).
 * `speed` (m/s), `lookSpeed` (rad/s). Keys typed into inputs, and chords with ⌘/Ctrl/Alt, are ignored.
 */
export function KeyboardFly({ speed = 2, lookSpeed = 1.5, enabled = true }) {
    const viewer = useViewer()
    const settings = useRef({ speed, lookSpeed })
    settings.current = { speed, lookSpeed }
    useEffect(() => {
        if (!viewer || !enabled) {
            return
        }
        const held = new Set()
        const typing = (event) => event.target?.closest?.("input, select, textarea, [contenteditable]")
        const keydown = (event) => {
            if (typing(event)) {
                return
            }
            // macOS sends no keyup for a letter released while ⌘ is held: a chord would leave the key stuck
            if (event.metaKey || event.ctrlKey || event.altKey) {
                held.clear()
                return
            }
            const key = event.key.toLowerCase()
            if (FLY_KEYS.has(key)) {
                held.add(key)
            }
        }
        const keyup = (event) => held.delete(event.key.toLowerCase())
        const blur = () => held.clear()
        addEventListener("keydown", keydown)
        addEventListener("keyup", keyup)
        addEventListener("blur", blur)
        const { camera, controls } = viewer
        const forward = new THREE.Vector3()
        const right = new THREE.Vector3()
        const offset = new THREE.Vector3()
        const move = new THREE.Vector3()
        let last = 0
        const off = viewer.onFrame(({ now }) => {
            const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
            last = now
            if (held.size === 0 || dt === 0) {
                return
            }
            const step = settings.current.speed * dt
            const turn = settings.current.lookSpeed * dt
            forward.subVectors(controls.target, camera.position).setZ(0)
            if (forward.lengthSq() < 1e-12) {
                forward.set(0, 1, 0)
            }
            forward.normalize()
            right.crossVectors(forward, camera.up).normalize()
            move.set(0, 0, 0)
            if (held.has("w")) {
                move.add(forward)
            }
            if (held.has("s")) {
                move.sub(forward)
            }
            if (held.has("d")) {
                move.add(right)
            }
            if (held.has("a")) {
                move.sub(right)
            }
            if (move.lengthSq() > 0) {
                move.normalize().multiplyScalar(step)
            }
            move.addScaledVector(camera.up, ((held.has("e") ? 1 : 0) - (held.has("q") ? 1 : 0)) * step)
            camera.position.add(move)
            controls.target.add(move)
            offset.subVectors(controls.target, camera.position)
            if (held.has("j")) {
                offset.applyAxisAngle(camera.up, turn)
            }
            if (held.has("l")) {
                offset.applyAxisAngle(camera.up, -turn)
            }
            if (held.has("i") || held.has("k")) {
                const pitched = offset
                    .clone()
                    .applyAxisAngle(right, (held.has("i") ? 1 : 0) * turn - (held.has("k") ? 1 : 0) * turn)
                // never pitch fully vertical (the view would flip)
                if (Math.abs(pitched.clone().normalize().dot(camera.up)) < 0.985) {
                    offset.copy(pitched)
                }
            }
            controls.target.copy(camera.position).add(offset)
            viewer.requestRender()
        })
        return () => {
            off()
            removeEventListener("keydown", keydown)
            removeEventListener("keyup", keyup)
            removeEventListener("blur", blur)
        }
    }, [viewer, enabled])
    return null
}
