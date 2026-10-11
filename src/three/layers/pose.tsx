// nav_msgs.Odometry, geometry_msgs.PoseStamped / PoseWithCovarianceStamped: the pose as axes, and the path it has
// driven, kept in the fixed frame (bounded, configurable length; a jump leaves a gap instead of a streak). When the
// data source knows a topic's whole route up front (a recording: `source.route(key)`), it's drawn faintly ahead of
// the robot, and after a seek the trail is rebuilt from it up to the playhead instead of starting empty.
import * as THREE from "three"
import { h } from "../../h.js"
import { useStore } from "../store.js"
import { themeColors } from "../../theme/theme.js"
import { FatLines } from "../lines.js"
import { cssColor } from "../robot_model.js"
import { registerLayer, subscribeDecoded } from "./registry.js"
import { Field, Select, Slider, Toggle } from "../../components/controls.js"
import { ColorSwatch } from "../../components/input_devices.js"

/**
 * @typedef {{ trail: boolean, trailLength: number, jumpMeters: number, color: string, width: number,
 *   axesSize: number, onTop: boolean, route: boolean }} PoseSettings
 *   `trailLength`: most trail segments kept; `jumpMeters`: a longer step is a teleport (no segment); `onTop`: drawn
 *   over everything; `route`: the whole recorded route, faint (when the source knows it); `color`: CSS or a token
 */

export const POSE_DEFAULTS = {
    trail: true,
    trailLength: 20000,
    jumpMeters: 2.5,
    color: "var(--primary)",
    width: 4,
    axesSize: 0.6,
    onTop: true,
    route: true,
}

const MIN_STEP = 0.02

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

const routes = new WeakMap()

/** The source's recorded route of a pose topic, cached per source and topic (null when it has none). */
function routeOf(source, key) {
    if (typeof source.route !== "function") {
        return Promise.resolve(null)
    }
    let cache = routes.get(source)
    if (!cache) {
        cache = new Map()
        routes.set(source, cache)
    }
    if (!cache.has(key)) {
        cache.set(key, Promise.resolve(source.route(key)).catch(() => null))
    }
    return cache.get(key)
}

export class PoseLayer {
    root = new THREE.Group()
    #axes
    #trail
    #ghost
    #stop = () => {}
    #pose = null
    #frame = ""
    #last = null
    #fixedFrame = ""
    #count = 0
    #since = performance.now()
    #route = null
    #ghostFrame = ""
    #unsubscribe

    /**
     * @param {import("./registry.js").LayerContext} context
     * @param {import("./registry.js").Topic | null} topic null: poses come through setData
     * @param {import("../store.js").Store<PoseSettings>} settings
     */
    constructor(context, topic, settings) {
        this.context = context
        this.topic = topic
        this.settings = settings
        this.#axes = new THREE.AxesHelper(1)
        this.#axes.matrixAutoUpdate = false
        this.#axes.visible = false
        this.root.add(this.#axes)
        this.#trail = new FatLines(context.viewer.resolution, {
            width: settings.get().width,
            color: 0xffffff,
            capacity: 1024,
        })
        this.#ghost = new FatLines(context.viewer.resolution, {
            width: Math.max(1, settings.get().width - 1.5),
            color: 0xffffff,
            capacity: 1024,
            opacity: 0.28,
        })
        this.root.add(this.#trail.object, this.#ghost.object)
        this.#unsubscribe = settings.subscribe(() => this.#restyle())
        addEventListener("dimos-react-theme", this.#restyle)
        this.#restyle()
        if (topic) {
            routeOf(context.source, topic.key).then((route) => {
                if (route?.points?.length) {
                    this.#route = route
                    this.#drawGhost()
                    this.reset()
                }
            })
            this.#stop = subscribeDecoded(context, topic, { maxHz: 50 }, (message, timestamp) => {
                this.#onPose(poseOf(message), message?.header?.frame_id ?? message?.frame ?? "", timestamp)
            })
        }
    }

    #restyle = () => {
        const settings = this.settings.get()
        const color = cssColor(settings.color, "white")
        const theme = themeColors()
        this.#axes.setColors(
            cssColor(theme.axisX, "red"),
            cssColor(theme.axisY, "green"),
            cssColor(theme.axisZ, "blue"),
        )
        this.#trail.material.color.copy(color)
        this.#trail.material.linewidth = settings.width
        this.#trail.object.visible = settings.trail
        this.#trail.material.depthTest = settings.onTop === false
        // three draws every transparent object after every opaque one: on top of blended (glow) clouds needs the
        // trail in the transparent list too, where renderOrder puts it last
        this.#trail.material.transparent = settings.onTop !== false
        this.#trail.object.renderOrder = settings.onTop === false ? 0 : 10
        this.#ghost.material.color.copy(color)
        this.#ghost.material.linewidth = Math.max(1, settings.width - 1.5)
        this.#ghost.object.visible = settings.route !== false
        this.#ghost.material.depthTest = settings.onTop === false
        this.#ghost.object.renderOrder = settings.onTop === false ? 0 : 9
        if (!settings.trail) {
            this.#clearTrail()
        }
        this.context.viewer.requestRender()
    }

    /** the whole route, in the fixed frame */
    #drawGhost() {
        this.#ghost.clear()
        const route = this.#route
        const world = route && this.context.tf.lookup(route.frame ?? "", this.context.viewer.fixedFrame)
        this.#ghostFrame = world ? this.context.viewer.fixedFrame : ""
        if (route && world) {
            const jump = this.settings.get().jumpMeters
            const a = new THREE.Vector3(), b = new THREE.Vector3()
            for (let index = 1; index < route.points.length; index++) {
                const [, ax, ay, az] = route.points[index - 1]
                const [, bx, by, bz] = route.points[index]
                a.set(ax, ay, az).applyMatrix4(world)
                b.set(bx, by, bz).applyMatrix4(world)
                if (a.distanceTo(b) <= jump) {
                    this.#ghost.push(a.x, a.y, a.z, b.x, b.y, b.z)
                }
            }
        }
        this.#ghost.commit()
        this.context.viewer.requestRender()
    }

    #clearTrail() {
        this.#trail.clear()
        this.#trail.commit()
        this.#last = null
    }

    /** The data jumped (a seek): the trail becomes the recorded route up to the playhead (or starts over). */
    reset() {
        this.#trail.clear()
        this.#last = null
        const route = this.#route
        const world = route && this.context.tf.lookup(route.frame ?? "", this.context.viewer.fixedFrame)
        if (route && world && this.settings.get().trail) {
            const now = this.context.viewer.dataClock() / 1000
            const settings = this.settings.get()
            const position = new THREE.Vector3()
            for (const [t, x, y, z] of route.points) {
                if (t > now) {
                    break
                }
                position.set(x, y, z).applyMatrix4(world)
                if (this.#last && position.distanceTo(this.#last) <= settings.jumpMeters) {
                    this.#trail.push(this.#last.x, this.#last.y, this.#last.z, position.x, position.y, position.z)
                }
                this.#last = (this.#last ?? new THREE.Vector3()).copy(position)
            }
            if (this.#trail.count > settings.trailLength) {
                this.#trail.shift(this.#trail.count - settings.trailLength)
            }
        }
        this.#trail.commit()
        this.context.viewer.requestRender()
    }

    /** Props data: `{ pose, frame?, timestamp? }` (pose: geometry_msgs Pose, `{ x, y, yaw }` or a Matrix4). */
    setData(data) {
        if (data?.pose) {
            this.#onPose(data.pose, data.frame ?? "", data.timestamp ?? Date.now())
        }
    }

    #onPose(pose, frame, timestamp) {
        this.#frame = frame
        this.#pose = poseMatrix(pose, this.#pose ?? new THREE.Matrix4())
        this.#count++
        const world = this.context.tf.lookup(frame, this.context.viewer.fixedFrame)
        if (!world) {
            this.context.setStatus({
                problem: `no TF path from "${frame}" to "${this.context.viewer.fixedFrame}"`,
                frame,
            })
            return
        }
        const placed = world.clone().multiply(this.#pose)
        this.context.robotPose?.report(this.topic?.key ?? this, placed)
        this.context.onPose?.(placed)
        const position = new THREE.Vector3().setFromMatrixPosition(placed)
        const settings = this.settings.get()
        if (settings.trail && this.#last) {
            const step = position.distanceTo(this.#last)
            if (step < MIN_STEP) {
                this.context.viewer.noteData(timestamp)
                return
            }
            if (step <= settings.jumpMeters) {
                this.#trail.push(this.#last.x, this.#last.y, this.#last.z, position.x, position.y, position.z)
                if (this.#trail.count > settings.trailLength) {
                    this.#trail.shift(Math.max(1, Math.floor(settings.trailLength * 0.1)))
                }
                this.#trail.commit()
            }
        }
        this.#last = position
        this.context.viewer.noteData(timestamp)
    }

    update(frame) {
        if (frame.fixedFrame !== this.#fixedFrame) {
            this.#fixedFrame = frame.fixedFrame
            this.reset()
        }
        if (this.#route && this.#ghostFrame !== frame.fixedFrame) {
            this.#drawGhost()
        }
        if (this.#pose) {
            const world = this.context.tf.lookup(this.#frame, frame.fixedFrame)
            const size = this.settings.get().axesSize
            this.#axes.visible = !!world && size > 0
            if (world) {
                this.#axes.matrix.multiplyMatrices(world, this.#pose).scale(new THREE.Vector3().setScalar(size))
                this.#axes.matrixWorldNeedsUpdate = true
                this.context.setStatus({ problem: null, frame: this.#frame })
                this.context.viewer.requestRender()
            }
        }
        if (frame.now - this.#since > 1000) {
            this.context.setStatus({
                info: `${
                    ((this.#count * 1000) / (frame.now - this.#since)).toFixed(0)
                } Hz · trail ${this.#trail.count} · ${this.#frame || "no frame"}`,
            })
            this.#count = 0
            this.#since = frame.now
        }
    }

    dispose() {
        this.#stop()
        this.#unsubscribe()
        removeEventListener("dimos-react-theme", this.#restyle)
        this.context.robotPose?.forget(this.topic?.key ?? this)
        this.#trail.dispose()
        this.#ghost.dispose()
        this.#axes.dispose()
    }
}

/** A color setting: a swatch for hex colors (a token like var(--primary) shows as its current color). */
export function ColorSetting({ value, onChange }) {
    const hex = `#${cssColor(value, "white").getHexString()}`
    return h(ColorSwatch, { value: hex, onChange })
}

export function PoseSettingsEditor({ settings }) {
    const value = useStore(settings)
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            { label: "Trail" },
            h(Toggle, { value: value.trail, onChange: (trail) => settings.update({ trail }) }),
        ),
        h(
            Field,
            { label: "Whole route", hint: "when the source knows it (a recording)" },
            h(Toggle, { value: value.route !== false, onChange: (route) => settings.update({ route }) }),
        ),
        h(
            Field,
            { label: "Length" },
            h(Select, {
                value: value.trailLength,
                options: [[500, "500 steps"], [5000, "5k steps"], [20000, "20k steps"], [100000, "100k steps"]],
                onChange: (trailLength) => settings.update({ trailLength }),
            }),
        ),
        h(
            Field,
            { label: "On top" },
            h(Toggle, { value: value.onTop !== false, onChange: (onTop) => settings.update({ onTop }) }),
        ),
        h(
            Field,
            { label: "Color" },
            h(ColorSetting, { value: value.color, onChange: (color) => settings.update({ color }) }),
        ),
        h(
            Field,
            { label: "Width" },
            h(Slider, {
                min: 1,
                max: 8,
                step: 0.5,
                value: value.width,
                format: (width) => `${width}px`,
                onChange: (width) => settings.update({ width }),
            }),
        ),
        h(
            Field,
            { label: "Axes" },
            h(Slider, {
                min: 0,
                max: 2,
                step: 0.1,
                value: value.axesSize,
                format: (size) => `${size} m`,
                onChange: (axesSize) => settings.update({ axesSize }),
            }),
        ),
    )
}

registerLayer({
    id: "pose",
    label: "Pose + trail",
    types: ["nav_msgs.Odometry", "geometry_msgs.PoseStamped", "geometry_msgs.PoseWithCovarianceStamped"],
    defaults: () => ({ ...POSE_DEFAULTS }),
    create: (context, topic, settings) => new PoseLayer(context, topic, settings),
    Settings: PoseSettingsEditor,
})
