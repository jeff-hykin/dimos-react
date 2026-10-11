// The 3D view as React components. <Scene3D> owns a Viewer (three.js renderer, orbit/pan/zoom, follow camera) and a
// TfTree; layers inside it add themselves to its scene and take data from a topic (through the data source: live
// zenoh-gateway, a replay, a test source) or from props.
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
import { cx, h } from "../h.js"
import { decodeMessage, parseKey, useDataSource, useTopicList } from "../data.js"
import { headerFrameId } from "../lcm.js"
import { themeColors } from "../theme/theme.js"
import { Viewer } from "./viewer.js"
import { TfTree } from "./tf.js"
import { FatLines } from "./lines.js"
import { LabelPool } from "./labels.js"
import { applyLook, DEFAULT_LOOK, makePointMaterial } from "./point_material.js"
import { cssColor, disposeTree, robotModel } from "./robot_model.js"
import { Store, useStore } from "./store.js"
import { Select } from "../components/controls.js"
import { Icon } from "../components/icon.js"

const SceneContext = createContext({ viewer: null, tf: null, fixedFrame: "world" })

/** `{ viewer, tf, fixedFrame }` of the enclosing Scene3D (viewer is null until it has mounted). */
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

/** Calls `callback(frame)` every animation frame of the enclosing scene (frame: { now, fixedFrame, camera }). */
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
 * Mounts a custom layer in the enclosing scene: `create({ viewer, tf, fixedFrame })` returns
 * `{ root?: THREE.Object3D, update?(frame), dispose?() }` (or null). `root` is added to the scene and removed on
 * cleanup, `update` runs every frame. Re-created when `deps` change; returns a ref to the live layer (push new data
 * into it from your own effects instead of re-creating it).
 */
export function useLayer(create, deps = []) {
    const { viewer, tf } = useScene()
    const ref = useRef(null)
    useEffect(() => {
        if (!viewer) {
            return
        }
        const layer = create({ viewer, tf })
        if (!layer) {
            return
        }
        if (layer.root) {
            viewer.scene.add(layer.root)
        }
        const off = layer.update ? viewer.onFrame((frame) => layer.update(frame)) : null
        ref.current = layer
        viewer.requestRender()
        return () => {
            off?.()
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

/** A geometry_msgs Pose ({ position, orientation }), a `{ x, y, z, yaw }` shorthand or a Matrix4, as a Matrix4. */
export function poseMatrix(pose, out = new THREE.Matrix4()) {
    if (pose?.isMatrix4) {
        return out.copy(pose)
    }
    if (pose && pose.position === undefined && (pose.x !== undefined || pose.yaw !== undefined)) {
        const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.yaw ?? 0)
        return out.compose(
            new THREE.Vector3(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0),
            quaternion,
            new THREE.Vector3(1, 1, 1),
        )
    }
    const position = pose?.position ?? {}
    const orientation = pose?.orientation ?? {}
    const quaternion = new THREE.Quaternion(
        orientation.x ?? 0,
        orientation.y ?? 0,
        orientation.z ?? 0,
        orientation.w ?? 1,
    )
    if (quaternion.lengthSq() < 1e-12) {
        quaternion.set(0, 0, 0, 1)
    }
    return out.compose(
        new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0),
        quaternion.normalize(),
        new THREE.Vector3(1, 1, 1),
    )
}

/** The pose inside a decoded message: Odometry / PoseWithCovarianceStamped (.pose.pose), PoseStamped (.pose), Pose. */
export function poseOf(message) {
    return message?.pose?.pose ?? message?.pose ?? message
}

/** A stable, distinct color per name (for paths, robots, boxes of one class). */
export function colorFor(name) {
    let hash = 0
    for (const char of String(name)) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0
    }
    return new THREE.Color().setHSL(((hash >>> 0) % 360) / 360, 0.75, 0.6)
}

/**
 * sensor_msgs.PointCloud2 (decoded LCM) → `{ positions: Float32Array, intensity?: Uint8Array, frame }`: reads the
 * x/y/z float32 fields (and intensity, scaled to 0..255) at their offsets; NaN points are skipped.
 */
export function pointCloud2ToPositions(cloud) {
    const fields = Object.fromEntries((cloud.fields ?? []).map((field) => [field.name, field]))
    const step = cloud.point_step
    const count = (cloud.width ?? 0) * (cloud.height ?? 1)
    const data = cloud.data
    if (!fields.x || !fields.y || !fields.z || !step || !data) {
        return { positions: new Float32Array(0), frame: cloud.header?.frame_id ?? "" }
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const little = !cloud.is_bigendian
    const positions = new Float32Array(count * 3)
    const intensityField = fields.intensity
    const intensity = intensityField ? new Uint8Array(count) : undefined
    const raw = intensityField ? new Float32Array(count) : null
    let kept = 0
    for (let index = 0; index < count; index++) {
        const at = index * step
        if (at + step > data.byteLength) {
            break
        }
        const x = view.getFloat32(at + fields.x.offset, little)
        const y = view.getFloat32(at + fields.y.offset, little)
        const z = view.getFloat32(at + fields.z.offset, little)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            continue
        }
        positions[kept * 3] = x
        positions[kept * 3 + 1] = y
        positions[kept * 3 + 2] = z
        if (raw) {
            raw[kept] = intensityField.datatype === 7
                ? view.getFloat32(at + intensityField.offset, little)
                : view.getUint8(at + intensityField.offset)
        }
        kept++
    }
    if (raw && intensity) {
        let max = 0
        for (let index = 0; index < kept; index++) {
            max = Math.max(max, raw[index])
        }
        for (let index = 0; index < kept; index++) {
            intensity[index] = max > 0 ? Math.round((raw[index] / max) * 255) : 0
        }
    }
    return {
        positions: positions.subarray(0, kept * 3),
        intensity: intensity?.subarray(0, kept),
        frame: cloud.header?.frame_id ?? "",
    }
}

/**
 * The 3D view. Give it a size (style/className); layers go in `children`, and any DOM children (buttons, stats) are
 * laid over it.
 * @param {{
 *   fixedFrame?: string, followFrame?: string | null, grid?: boolean, tf?: TfTree, clock?: () => number,
 *   onPick?: (pick: { point: THREE.Vector3, on: string, event: MouseEvent }) => void,
 *   onViewer?: (viewer: Viewer) => void, className?: string, style?: object, children?: any,
 *   cameraPosition?: [number, number, number], cameraTarget?: [number, number, number],
 *   near?: number, far?: number, fov?: number, gridSize?: number, gridDivisions?: number, freeOrbit?: boolean,
 * }} props
 *   `fixedFrame`: the frame everything is drawn in (default: the TF tree's world-ish root). `followFrame`: a TF frame
 *   the camera follows (orbit and zoom keep following; a pan pauses it until viewer.resumeFollow()). `near`, `far`,
 *   `fov`, `gridSize`, `gridDivisions`, `freeOrbit`: the Viewer's options, read once when it mounts.
 */
export function Scene3D({
    fixedFrame,
    followFrame = null,
    grid = true,
    tf: givenTf,
    clock,
    onPick,
    onViewer,
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
    const [viewer, setViewer] = useState(null)
    const tf = useMemo(() => givenTf ?? new TfTree(), [givenTf])
    const [autoFixed, setAutoFixed] = useState("world")
    const fixed = fixedFrame ?? autoFixed

    useEffect(() => {
        const created = new Viewer(hostRef.current, {
            clock: clock ?? (() => Date.now()),
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

    // follow a TF frame: its origin, every frame
    useEffect(() => {
        if (!viewer || !followFrame) {
            if (viewer) {
                viewer.followTarget = null
            }
            return
        }
        const target = new THREE.Vector3()
        viewer.resumeFollow()
        const off = viewer.onFrame((frame) => {
            const matrix = tf.lookup(followFrame, frame.fixedFrame)
            viewer.followTarget = matrix ? target.setFromMatrixPosition(matrix) : null
        })
        return () => {
            off()
            viewer.followTarget = null
        }
    }, [viewer, tf, followFrame])

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

    const value = useMemo(() => ({ viewer, tf, fixedFrame: fixed }), [viewer, tf, fixed])
    return h(
        "div",
        { className: cx("dr-scene", className), style, ...rest },
        h("div", { className: "dr-scene-host", ref: hostRef }),
        h(SceneContext.Provider, { value }, viewer ? children : null),
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
            })
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
    const list = Array.isArray(transforms) ? transforms : transforms.transforms ?? []
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
 * The TF tree drawn: an axes gizmo per frame (theme --axis-x/y/z), its name, and a line to its parent. A big tree
 * names only `named` frames (and the fixed frame) past `maxNames`.
 */
export function TfFrames(
    { axesSize = 0.25, names = true, links = true, maxNames = 16, named = [], maxFrames = 512, onStatus },
) {
    const statusRef = useRef(onStatus)
    statusRef.current = onStatus
    const namedSignature = named.join("\n")
    useLayer(({ viewer, tf }) => {
        const root = new THREE.Group()
        const axes = new FatLines(viewer.resolution, { width: 2.5, vertexColors: true, capacity: maxFrames * 3 })
        const linkLines = new FatLines(viewer.resolution, {
            width: 1,
            color: cssColor(themeColors().mutedFg, "gray"),
            opacity: 0.6,
        })
        const labels = new LabelPool("dr-scene-label dr-frame-label")
        root.add(axes.object, linkLines.object, labels.group)
        let version = -1
        let fixedFrame = ""
        let colors = null
        const restyle = () => {
            const theme = themeColors()
            colors = [cssColor(theme.axisX, "red"), cssColor(theme.axisY, "green"), cssColor(theme.axisZ, "blue")]
            linkLines.material.color.copy(cssColor(theme.mutedFg, "gray"))
            version = -1
        }
        restyle()
        addEventListener("dimos-react-theme", restyle)
        const unit = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
        return {
            root,
            update(frame) {
                if (tf.version === version && frame.fixedFrame === fixedFrame) {
                    return
                }
                version = tf.version
                fixedFrame = frame.fixedFrame
                const snapshot = tf.snapshot()
                axes.clear()
                linkLines.clear()
                labels.begin()
                const origin = new THREE.Vector3(), tip = new THREE.Vector3(), parent = new THREE.Vector3()
                let unplaced = 0
                for (const name of snapshot.frames.slice(0, maxFrames)) {
                    const matrix = tf.lookup(name, frame.fixedFrame)
                    if (!matrix) {
                        unplaced++
                        continue
                    }
                    origin.setFromMatrixPosition(matrix)
                    for (let axis = 0; axis < 3; axis++) {
                        tip.copy(unit[axis]).multiplyScalar(axesSize).applyMatrix4(matrix)
                        axes.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, colors[axis])
                    }
                    if (
                        names &&
                        (snapshot.frames.length <= maxNames || name === frame.fixedFrame || named.includes(name))
                    ) {
                        labels.place(name, origin)
                    }
                    const parentName = tf.parentOf(name)
                    const parentMatrix = parentName && tf.lookup(parentName, frame.fixedFrame)
                    if (links && parentMatrix) {
                        parent.setFromMatrixPosition(parentMatrix)
                        linkLines.push(origin.x, origin.y, origin.z, parent.x, parent.y, parent.z)
                    }
                }
                axes.commit()
                linkLines.commit()
                labels.end()
                statusRef.current?.({
                    info: `${snapshot.frames.length} frames`,
                    problem: unplaced ? `${unplaced} frames not connected to "${frame.fixedFrame}"` : null,
                })
                viewer.requestRender()
            },
            dispose() {
                removeEventListener("dimos-react-theme", restyle)
                axes.dispose()
                linkLines.dispose()
                labels.dispose()
            },
        }
    }, [axesSize, names, links, maxNames, namedSignature, maxFrames])
    return null
}

/** How often a topic cloud's frame_id is re-read from one raw message (the gateway's encoding carries no header). */
const FRAME_RECHECK_MS = 30_000
const SPLAT_BUDGET = 3_000_000

class CloudLayer {
    root = new THREE.Group()
    #points
    #geometry = new THREE.BufferGeometry()
    #material
    #capacity = 0
    #write = 0
    #filled = 0
    #range = [0, 2]
    #rangeSeen = false
    #fixedFrame = ""
    frame = null
    look = DEFAULT_LOOK
    mode = "latest"
    windowSeconds = 10
    maxPoints = 2_000_000
    onStatus = null
    #count = 0
    #lastCount = 0
    #since = 0

    constructor(viewer, tf) {
        this.viewer = viewer
        this.tf = tf
        this.#material = makePointMaterial(viewer.pixelsPerMeter)
        this.#points = new THREE.Points(this.#geometry, this.#material)
        this.#points.frustumCulled = false
        this.#points.matrixAutoUpdate = false
        this.root.add(this.#points)
        this.#resize(1024)
    }

    configure({ look, mode, windowSeconds, maxPoints }) {
        if (mode !== this.mode) {
            this.mode = mode
            this.clear()
        }
        this.look = look
        this.windowSeconds = windowSeconds
        this.maxPoints = maxPoints
        this.#material.uniforms.uWindow.value = mode === "accumulate" && windowSeconds > 0 ? windowSeconds : -1
        applyLook(this.#material, look, this.#range)
        this.#material.uniforms.uKeep.value = Math.min(1, SPLAT_BUDGET / Math.max(1, this.#filled))
        this.viewer.requestRender()
    }

    setFrame(frame) {
        if (frame !== this.frame) {
            this.frame = frame
            this.clear()
        }
    }

    #resize(capacity) {
        this.#capacity = capacity
        const position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage)
        const time = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage)
        const intensity = new THREE.BufferAttribute(new Uint8Array(capacity), 1).setUsage(THREE.DynamicDrawUsage)
        this.#geometry.dispose()
        this.#geometry = new THREE.BufferGeometry()
        this.#geometry.setAttribute("position", position)
        this.#geometry.setAttribute("aTime", time)
        this.#geometry.setAttribute("aIntensity", intensity)
        this.#geometry.setDrawRange(0, 0)
        this.#points.geometry = this.#geometry
        this.#write = 0
        this.#filled = 0
    }

    clear() {
        this.#write = 0
        this.#filled = 0
        this.#rangeSeen = false
        this.#geometry.setDrawRange(0, 0)
        this.viewer.requestRender()
    }

    /** One scan: xyz triples (in `this.frame`) and optional 0..255 intensity. */
    onCloud(positions, intensity, timestamp) {
        if (this.frame === null) {
            return // placed without its frame it would ride the wrong pose
        }
        const count = Math.floor(positions.length / 3)
        this.#lastCount = count
        this.#count++
        const accumulate = this.mode === "accumulate"
        let transform = null
        if (accumulate) {
            transform = this.tf.lookup(this.frame, this.viewer.fixedFrame)
            if (!transform) {
                this.onStatus?.({
                    problem: `no TF path from "${this.frame}" to "${this.viewer.fixedFrame}"`,
                    frame: this.frame,
                })
                return
            }
        }
        const wanted = accumulate ? Math.max(count, this.maxPoints) : count
        if (wanted > this.#capacity || (!accumulate && this.#capacity > 4 * Math.max(wanted, 1024))) {
            this.#resize(accumulate ? wanted : Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(1, wanted)))))
        }
        const position = this.#geometry.getAttribute("position")
        const time = this.#geometry.getAttribute("aTime")
        const strength = this.#geometry.getAttribute("aIntensity")
        const now = performance.now() / 1000
        const start = accumulate ? this.#write : 0
        const xyz = position.array
        const times = time.array
        const values = strength.array
        const e = transform?.elements
        for (let index = 0; index < count; index++) {
            const slot = (start + index) % this.#capacity
            const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2]
            if (e) {
                xyz[slot * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
                xyz[slot * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
                xyz[slot * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
            } else {
                xyz[slot * 3] = x
                xyz[slot * 3 + 1] = y
                xyz[slot * 3 + 2] = z
            }
            times[slot] = now
            values[slot] = intensity ? intensity[index] : 0
        }
        for (const attribute of [position, time, strength]) {
            attribute.clearUpdateRanges()
            const size = attribute.itemSize
            const firstLength = Math.min(count, this.#capacity - start)
            attribute.addUpdateRange(start * size, firstLength * size)
            if (firstLength < count) {
                attribute.addUpdateRange(0, (count - firstLength) * size)
            }
            attribute.needsUpdate = true
        }
        if (accumulate) {
            this.#write = (start + count) % this.#capacity
            this.#filled = Math.min(this.#capacity, this.#filled + count)
            this.#points.matrix.identity()
        } else {
            this.#filled = count
        }
        this.#geometry.setDrawRange(0, this.#filled)
        this.#material.uniforms.uKeep.value = Math.min(1, SPLAT_BUDGET / Math.max(1, this.#filled))
        this.#updateRange(positions, intensity, transform ?? this.tf.lookup(this.frame, this.viewer.fixedFrame))
        this.viewer.noteData(timestamp)
    }

    /** Auto color range: 5th-95th percentile of a sample, eased so it doesn't flicker scan to scan. */
    #updateRange(positions, intensity, transform) {
        const look = this.look
        const count = positions.length / 3
        if (!count) {
            return
        }
        let low, high
        if (look.colorMode === "intensity") {
            ;[low, high] = intensity ? [0, 255] : [0, 1]
        } else {
            const e = transform?.elements ?? new THREE.Matrix4().elements
            const step = Math.max(1, Math.floor(count / 2048))
            const samples = []
            for (let index = 0; index < count; index += step) {
                const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2]
                const world = [
                    e[0] * x + e[4] * y + e[8] * z + e[12],
                    e[1] * x + e[5] * y + e[9] * z + e[13],
                    e[2] * x + e[6] * y + e[10] * z + e[14],
                ]
                samples.push(
                    look.colorMode === "range"
                        ? Math.hypot(world[0] - e[12], world[1] - e[13], world[2] - e[14])
                        : world[look.axis ?? 2],
                )
            }
            samples.sort((a, b) => a - b)
            low = look.colorMode === "range" ? 0 : samples[Math.floor(samples.length * 0.05)]
            high = samples[Math.floor(samples.length * 0.95)]
        }
        if (!this.#rangeSeen) {
            this.#range = [low, high]
            this.#rangeSeen = true
        } else {
            this.#range = [
                this.#range[0] + (low - this.#range[0]) * 0.2,
                this.#range[1] + (high - this.#range[1]) * 0.2,
            ]
        }
        applyLook(this.#material, look, this.#range)
    }

    update(frame) {
        if (frame.fixedFrame !== this.#fixedFrame) {
            this.#fixedFrame = frame.fixedFrame
            if (this.mode === "accumulate") {
                this.clear()
            }
        }
        this.#material.uniforms.uNow.value = frame.now / 1000
        if (this.mode === "accumulate" && this.windowSeconds > 0) {
            this.viewer.requestRender() // old points fade out by time even with no new scans
        }
        if (this.frame !== null) {
            const placed = this.mode === "accumulate" ||
                placeInFixedFrame(this.viewer, this.tf, this.#points, this.frame, frame.fixedFrame, this.onStatus)
            if (placed) {
                const sensor = this.tf.lookup(this.frame, frame.fixedFrame)
                if (sensor) {
                    this.#material.uniforms.uSensor.value.setFromMatrixPosition(sensor)
                }
            }
        }
        if (frame.now - this.#since > 1000) {
            const hz = this.#since ? (this.#count * 1000) / (frame.now - this.#since) : 0
            this.#since = frame.now
            this.#count = 0
            const kept = this.mode === "accumulate" ? `${this.#filled} kept · ` : ""
            this.onStatus?.({
                info: this.frame === null
                    ? "waiting for frame_id…"
                    : `${kept}${this.#lastCount} pts · ${hz.toFixed(1)} Hz · ${this.frame || "no frame"}`,
                frame: this.frame ?? undefined,
            })
        }
    }

    dispose() {
        this.#geometry.dispose()
        this.#material.dispose()
    }
}

/**
 * A point cloud: from a topic (sensor_msgs.PointCloud2 through the gateway's dimos_lcm_pointcloud2 encoding, or any
 * source publishing `{ positions, intensity?, frame? }` or a decoded PointCloud2) or from `points` props.
 * @param {{
 *   topic?: string, points?: Float32Array | number[], intensity?: Uint8Array, frame?: string,
 *   mode?: "latest" | "accumulate", windowSeconds?: number, maxPoints?: number, maxHz?: number, quality?: number,
 *   style?: "voxel" | "splat" | "disc" | "square", size?: number, colorMode?: "height" | "intensity" | "range" | "solid",
 *   gradient?: string, period?: number, axis?: 0 | 1 | 2, rangeMin?: number | null, rangeMax?: number | null,
 *   color?: string, opacity?: number, cubeShade?: string, onStatus?: (status: object) => void,
 * }} props `color`: the solid color (CSS or a token like "var(--primary)"; colorMode "solid"); `gradient` a ramp
 *   (RAMPS, over rangeMin..rangeMax) or a repeating palette (PALETTES, one cycle every `period` meters)
 */
export function PointCloud({
    topic,
    points,
    intensity,
    frame,
    mode = "latest",
    windowSeconds = 10,
    maxPoints = 2_000_000,
    maxHz = 20,
    quality = 1,
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
    const source = useDataSource()
    const viewer = useViewer()
    const layer = useLayer(({ viewer, tf }) => new CloudLayer(viewer, tf), [])
    const look = { ...DEFAULT_LOOK }
    for (
        const [name, value] of Object.entries({
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
        })
    ) {
        if (value !== undefined) {
            look[name] = value
        }
    }
    if (color !== undefined) {
        look.solid = `#${cssColor(color, "white").getHexString()}`
    }
    const lookSignature = JSON.stringify(look)
    useEffect(() => {
        if (layer.current) {
            layer.current.onStatus = onStatus ?? null
            layer.current.configure({ look, mode, windowSeconds, maxPoints })
        }
    }, [viewer, lookSignature, mode, windowSeconds, maxPoints, onStatus])
    useEffect(() => {
        if (layer.current && frame !== undefined) {
            layer.current.setFrame(frame)
        }
    }, [viewer, frame])
    // props data
    useEffect(() => {
        if (!layer.current || !points) {
            return
        }
        if (frame === undefined) {
            layer.current.setFrame("")
        }
        layer.current.onCloud(
            points instanceof Float32Array ? points : Float32Array.from(points),
            intensity,
            Date.now(),
        )
    }, [viewer, points, intensity])
    // topic data
    useEffect(() => {
        const cloud = layer.current
        if (!cloud || !topic) {
            return
        }
        const type = parseKey(topic)?.type ?? "sensor_msgs.PointCloud2"
        const stops = []
        const takeFrame = (value) => {
            if (frame === undefined && typeof value === "string") {
                cloud.setFrame(value)
            }
        }
        // the frame_id: one raw message now and then (the encoded cloud carries no header)
        const readFrame = () => {
            if (frame !== undefined) {
                return
            }
            let stop = null
            stop = source.subscribe(topic, { delivery: "latest", maxHz: 1 }, (message) => {
                try {
                    takeFrame(
                        message.value
                            ? message.value.frame ?? message.value.header?.frame_id
                            : headerFrameId(type, message.bytes),
                    )
                } catch {
                    // not LCM: the payload says its frame itself
                }
                stop?.()
                stop = null
            })
            stops.push(() => stop?.())
        }
        readFrame()
        const timer = setInterval(readFrame, FRAME_RECHECK_MS)
        stops.push(() => clearInterval(timer))
        stops.push(
            source.subscribe(topic, {
                delivery: "latest",
                maxHz,
                encoding: "dimos_lcm_pointcloud2",
                encodeOptions: { quality },
            }, (message) => {
                let value
                try {
                    value = decodeMessage(message, "auto", type)
                } catch {
                    return
                }
                if (value?.positions) {
                    takeFrame(value.frame ?? value.header?.frame_id)
                    cloud.onCloud(value.positions, value.intensity, message.timestamp)
                } else if (value?.fields) {
                    const converted = pointCloud2ToPositions(value)
                    takeFrame(converted.frame)
                    cloud.onCloud(converted.positions, converted.intensity, message.timestamp)
                }
            }),
        )
        return () => stops.forEach((stop) => stop())
    }, [viewer, source, topic, frame, maxHz, quality])
    return null
}

/** Points of a path: nav_msgs.Path `poses` (PoseStamped), Poses, {x,y,z} or [x,y,z]. */
function pathPoints(poses) {
    const out = []
    for (const item of poses ?? []) {
        const position = Array.isArray(item)
            ? { x: item[0], y: item[1], z: item[2] ?? 0 }
            : item?.pose?.position ?? item?.position ?? item
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
            out.push([position.x, position.y, position.z ?? 0])
        }
    }
    return out
}

/**
 * A path as a thick line: a nav_msgs.Path topic, or `poses` (+ `frame`) as props.
 * @param {{ topic?: string, poses?: any[], frame?: string, color?: string, width?: number, lift?: number,
 *   onTop?: boolean, maxHz?: number, onStatus?: Function }} props `color`: CSS or token (default var(--primary))
 */
export function Path(
    { topic, poses, frame = "", color = "var(--primary)", width = 4, lift = 0.03, onTop = false, maxHz = 10, onStatus },
) {
    const source = useDataSource()
    const viewer = useViewer()
    const statusRef = useRef(onStatus)
    statusRef.current = onStatus
    const layer = useLayer(({ viewer, tf }) => {
        const root = new THREE.Group()
        root.matrixAutoUpdate = false
        const lines = new FatLines(viewer.resolution, { width, color: 0xffffff, capacity: 256 })
        root.add(lines.object)
        const state = { frame: null }
        return {
            root,
            lines,
            setColor(next) {
                lines.material.color.copy(cssColor(next, "white"))
            },
            set(points, pathFrame, timestamp, liftBy) {
                state.frame = pathFrame
                lines.clear()
                for (let index = 1; index < points.length; index++) {
                    const [a, b] = [points[index - 1], points[index]]
                    lines.push(a[0], a[1], a[2] + liftBy, b[0], b[1], b[2] + liftBy)
                }
                lines.commit()
                statusRef.current?.({ info: `${points.length} poses · ${pathFrame || "no frame"}`, frame: pathFrame })
                viewer.noteData(timestamp)
            },
            update(frameInfo) {
                if (state.frame !== null) {
                    placeInFixedFrame(viewer, tf, root, state.frame, frameInfo.fixedFrame, statusRef.current)
                }
            },
            dispose: () => lines.dispose(),
        }
    }, [])
    useEffect(() => {
        const path = layer.current
        if (!path) {
            return
        }
        path.setColor(color)
        path.lines.material.linewidth = width
        path.lines.material.depthTest = !onTop
        path.lines.material.transparent = onTop
        path.lines.object.renderOrder = onTop ? 10 : 0
        viewer?.requestRender()
    }, [viewer, color, width, onTop])
    useEffect(() => {
        if (layer.current && poses) {
            layer.current.set(pathPoints(poses), frame, Date.now(), lift)
        }
    }, [viewer, poses, frame, lift])
    useEffect(() => {
        if (!layer.current || !topic) {
            return
        }
        return source.subscribe(topic, { delivery: "latest", maxHz }, (message) => {
            let path
            try {
                path = decodeMessage(message, "auto", parseKey(topic)?.type ?? "nav_msgs.Path")
            } catch {
                return
            }
            layer.current?.set(
                pathPoints(path.poses ?? path),
                path.header?.frame_id ?? path.frame ?? "",
                message.timestamp,
                lift,
            )
        })
    }, [viewer, source, topic, maxHz, lift])
    return null
}

/**
 * A pose as axes (theme axis colors), with an optional trail of where it has been (kept in the fixed frame; a jump
 * leaves a gap). From a topic (nav_msgs.Odometry, geometry_msgs.PoseStamped / PoseWithCovarianceStamped) or `pose`
 * (+ `frame`) as props.
 * @param {{ topic?: string, pose?: any, frame?: string, axesSize?: number, trail?: boolean, trailLength?: number,
 *   jumpMeters?: number, color?: string, width?: number, onPose?: (matrix: THREE.Matrix4) => void, maxHz?: number,
 *   onStatus?: Function }} props `onPose`: the pose in the fixed frame, per message
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
    maxHz = 50,
    onPose,
    onStatus,
}) {
    const source = useDataSource()
    const viewer = useViewer()
    const callbacks = useRef({})
    callbacks.current = { onPose, onStatus }
    const settings = useRef({})
    settings.current = { trail, trailLength, jumpMeters, axesSize }
    const layer = useLayer(({ viewer, tf }) => {
        const root = new THREE.Group()
        const axes = new THREE.AxesHelper(1)
        axes.matrixAutoUpdate = false
        axes.visible = false
        const theme = themeColors()
        axes.setColors(cssColor(theme.axisX, "red"), cssColor(theme.axisY, "green"), cssColor(theme.axisZ, "blue"))
        const trailLines = new FatLines(viewer.resolution, { width, color: 0xffffff, capacity: 1024 })
        trailLines.material.depthTest = false
        trailLines.material.transparent = true
        trailLines.object.renderOrder = 10
        root.add(axes, trailLines.object)
        const state = { pose: null, frame: "", last: null, fixedFrame: "" }
        const scale = new THREE.Vector3()
        return {
            root,
            trailLines,
            set(poseValue, poseFrame, timestamp) {
                state.frame = poseFrame
                state.pose = poseMatrix(poseValue, state.pose ?? new THREE.Matrix4())
                const world = tf.lookup(poseFrame, viewer.fixedFrame)
                if (!world) {
                    callbacks.current.onStatus?.({
                        problem: `no TF path from "${poseFrame}" to "${viewer.fixedFrame}"`,
                        frame: poseFrame,
                    })
                    return
                }
                const placed = world.clone().multiply(state.pose)
                callbacks.current.onPose?.(placed)
                const position = new THREE.Vector3().setFromMatrixPosition(placed)
                const { trail, trailLength, jumpMeters } = settings.current
                if (trail && state.last) {
                    const step = position.distanceTo(state.last)
                    if (step < 0.02) {
                        viewer.noteData(timestamp)
                        return
                    }
                    if (step <= jumpMeters) {
                        trailLines.push(state.last.x, state.last.y, state.last.z, position.x, position.y, position.z)
                        if (trailLines.count > trailLength) {
                            trailLines.shift(Math.max(1, Math.floor(trailLength * 0.1)))
                        }
                        trailLines.commit()
                    }
                }
                state.last = position
                viewer.noteData(timestamp)
            },
            clearTrail() {
                trailLines.clear()
                trailLines.commit()
                state.last = null
            },
            update(frameInfo) {
                if (frameInfo.fixedFrame !== state.fixedFrame) {
                    state.fixedFrame = frameInfo.fixedFrame
                    this.clearTrail()
                }
                if (state.pose) {
                    const world = tf.lookup(state.frame, frameInfo.fixedFrame)
                    axes.visible = !!world && settings.current.axesSize > 0
                    if (world) {
                        axes.matrix.multiplyMatrices(world, state.pose).scale(
                            scale.setScalar(settings.current.axesSize),
                        )
                        axes.matrixWorldNeedsUpdate = true
                        viewer.requestRender()
                    }
                }
            },
            dispose() {
                trailLines.dispose()
                axes.dispose()
            },
        }
    }, [])
    useEffect(() => {
        const current = layer.current
        if (!current) {
            return
        }
        current.trailLines.material.color.copy(cssColor(color, "white"))
        current.trailLines.material.linewidth = width
        current.trailLines.object.visible = trail
        if (!trail) {
            current.clearTrail()
        }
        viewer?.requestRender()
    }, [viewer, color, width, trail])
    useEffect(() => {
        if (layer.current && pose) {
            layer.current.set(pose, frame, Date.now())
        }
    }, [viewer, pose, frame])
    useEffect(() => {
        if (!layer.current || !topic) {
            return
        }
        return source.subscribe(topic, { delivery: "latest", maxHz }, (message) => {
            let value
            try {
                value = decodeMessage(message, "auto", parseKey(topic)?.type)
            } catch {
                return
            }
            layer.current?.set(poseOf(value), value?.header?.frame_id ?? value?.frame ?? frame, message.timestamp)
        })
    }, [viewer, source, topic, maxHz, frame])
    return null
}

/**
 * Many poses as arrows: a geometry_msgs.PoseArray topic, or `poses` (+ `frame`) as props.
 * @param {{ topic?: string, poses?: any[], frame?: string, color?: string, length?: number, width?: number, maxHz?: number }} props
 */
export function PoseArray(
    { topic, poses, frame = "", color = "var(--accent-alt)", length = 0.4, width = 2, maxHz = 10 },
) {
    const source = useDataSource()
    const viewer = useViewer()
    const layer = useLayer(({ viewer, tf }) => {
        const root = new THREE.Group()
        root.matrixAutoUpdate = false
        const lines = new FatLines(viewer.resolution, { width, color: 0xffffff, capacity: 256 })
        root.add(lines.object)
        const state = { frame: null }
        const matrix = new THREE.Matrix4()
        const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
        return {
            root,
            lines,
            set(list, arrayFrame, timestamp, arrowLength) {
                state.frame = arrayFrame
                lines.clear()
                for (const item of list ?? []) {
                    poseMatrix(item?.pose ?? item, matrix)
                    const [tail, tip, left, right] = points
                    tail.set(0, 0, 0).applyMatrix4(matrix)
                    tip.set(arrowLength, 0, 0).applyMatrix4(matrix)
                    left.set(arrowLength * 0.7, arrowLength * 0.15, 0).applyMatrix4(matrix)
                    right.set(arrowLength * 0.7, -arrowLength * 0.15, 0).applyMatrix4(matrix)
                    lines.push(tail.x, tail.y, tail.z, tip.x, tip.y, tip.z)
                    lines.push(left.x, left.y, left.z, tip.x, tip.y, tip.z)
                    lines.push(right.x, right.y, right.z, tip.x, tip.y, tip.z)
                }
                lines.commit()
                viewer.noteData(timestamp)
            },
            update(frameInfo) {
                if (state.frame !== null) {
                    placeInFixedFrame(viewer, tf, root, state.frame, frameInfo.fixedFrame)
                }
            },
            dispose: () => lines.dispose(),
        }
    }, [])
    useEffect(() => {
        if (layer.current) {
            layer.current.lines.material.color.copy(cssColor(color, "white"))
            layer.current.lines.material.linewidth = width
            viewer?.requestRender()
        }
    }, [viewer, color, width])
    useEffect(() => {
        if (layer.current && poses) {
            layer.current.set(poses, frame, Date.now(), length)
        }
    }, [viewer, poses, frame, length])
    useEffect(() => {
        if (!layer.current || !topic) {
            return
        }
        return source.subscribe(topic, { delivery: "latest", maxHz }, (message) => {
            let value
            try {
                value = decodeMessage(message, "auto", parseKey(topic)?.type ?? "geometry_msgs.PoseArray")
            } catch {
                return
            }
            layer.current?.set(value.poses ?? value, value.header?.frame_id ?? frame, message.timestamp, length)
        })
    }, [viewer, source, topic, maxHz, length, frame])
    return null
}

/**
 * A stand-in robot model (ROBOT_KINDS: dog, humanoid, wheeled, drone, arrow) at a TF frame (`frame`, default
 * base_link) or at `pose` (in `poseFrame`). Colors follow the theme unless `colors` says otherwise.
 * @param {{ kind?: string, frame?: string, pose?: any, poseFrame?: string, scale?: number,
 *   colors?: { body?: string, dark?: string, nose?: string } }} props
 */
export function RobotModel({ kind = "wheeled", frame = "base_link", pose, poseFrame = "", scale = 1, colors }) {
    const settings = useRef({})
    settings.current = { frame, pose, poseFrame, scale }
    const colorsSignature = JSON.stringify(colors ?? {})
    useLayer(({ viewer, tf }) => {
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
                const { frame, pose, poseFrame, scale } = settings.current
                const base = tf.lookup(pose ? poseFrame : frame, frameInfo.fixedFrame)
                if (!base) {
                    model.visible = false
                    return
                }
                const matrix = pose ? base.clone().multiply(poseMatrix(pose, local)) : base.clone()
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
    }, [kind, colorsSignature])
    return null
}

/**
 * A Select of the scene's TF frames (inside a Scene3D, or pass `tf`).
 * @param {{ value?: string | null, onChange: (frame: string | null) => void, tf?: TfTree, noneLabel?: string | null,
 *   placeholder?: string, size?: "sm" | "md", className?: string }} props `noneLabel`: an extra "none" option (null)
 */
export function FramePicker({ value, onChange, tf, noneLabel = null, placeholder = "frame…", ...rest }) {
    const frames = useTfFrames({ tf })
    const options = [
        ...(noneLabel !== null ? [[null, noneLabel]] : []),
        ...frames.map((name) => [name, name]),
    ]
    if (value && !frames.includes(value)) {
        options.push([value, `${value} (not seen)`])
    }
    return h(Select, { value: value ?? null, onChange, options, placeholder, ...rest })
}

/** The scene's render numbers as a small overlay (fps, points, frame time, latency). */
export function SceneStats({ className }) {
    const viewer = useViewer()
    const empty = useMemo(() => new Store({ fps: 0, frameMs: 0, latencyP50: null, points: 0 }), [])
    const stats = useStore(viewer?.stats ?? empty)
    const points = stats.points > 1e6
        ? `${(stats.points / 1e6).toFixed(1)}M`
        : stats.points > 1e3
        ? `${(stats.points / 1e3).toFixed(0)}k`
        : String(stats.points)
    return h(
        "div",
        { className: cx("dr-scene-stats", className) },
        `${stats.fps} fps · ${points} pts · ${stats.frameMs.toFixed(1)} ms`,
        stats.latencyP50 !== null ? ` · ${Math.round(stats.latencyP50)} ms latency` : "",
    )
}

/**
 * Camera buttons over the scene: frame everything, top-down, and resume following (shown while following is paused).
 * @param {{ className?: string, children?: any, onFrameAll?: () => void, onTopDown?: () => void }} props extra buttons
 *   go in `children`; `onFrameAll` / `onTopDown` replace what those buttons do (an app's own idea of "everything")
 */
export function SceneControls({ className, children, onFrameAll, onTopDown }) {
    const viewer = useViewer()
    const empty = useMemo(() => new Store({ paused: false }), [])
    const { paused } = useStore(viewer?.followPaused ?? empty)
    const button = (icon, label, onClick) =>
        h(
            "button",
            { type: "button", className: "dr-scene-btn", title: label, "aria-label": label, onClick },
            h(Icon, { name: icon, size: 16 }),
        )
    return h(
        "div",
        { className: cx("dr-scene-controls", className) },
        button("fit", "Frame everything", () => (onFrameAll ? onFrameAll() : viewer?.frameAll())),
        button("top", "Top-down", () => {
            if (onTopDown) {
                return onTopDown()
            }
            const box = viewer?.dataBounds()
            const center = box ? box.getCenter(new THREE.Vector3()) : viewer.controls.target.clone()
            const extent = box ? Math.max(4, box.getSize(new THREE.Vector3()).length()) : 20
            viewer?.topDown(center, extent)
        }),
        paused ? button("target", "Resume following", () => viewer?.resumeFollow()) : null,
        children,
    )
}

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
                const pitched = offset.clone().applyAxisAngle(
                    right,
                    (held.has("i") ? 1 : 0) * turn - (held.has("k") ? 1 : 0) * turn,
                )
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
