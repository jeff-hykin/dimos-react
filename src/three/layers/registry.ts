// How a message type becomes something in the 3D view. A layer type registers the dimos message types it draws; a
// LayerManager (or a single <Layer>) makes one instance per topic. Apps add their own types with registerLayer (a
// later registration for the same id wins, so an app can override a built-in one).
//
//     registerLayer({
//         id: "my-layer", label: "My layer", types: ["my_msgs.Thing"],
//         defaults: { color: "#ffaa00" },             // per-topic settings (a Store the Settings component edits)
//         create(context, topic, settings) {          // → { root, update?(frame), dispose(), reset?(), setData?() }
//             const root = new THREE.Group()
//             const stop = subscribeDecoded(context, topic, { maxHz: 10 }, (message, timestamp) => { ... })
//             return { root, update: (frame) => placeLayer(context, root, "base_link", frame.fixedFrame), dispose: stop }
//         },
//         Settings: ({ settings, topic }) => h(...),  // optional, built from dimos-react components
//     })
import * as THREE from "three"
import { decodeMessage } from "../../data.js"

/**
 * @typedef {{ key: string, name: string, type: string }} Topic
 * @typedef {{ info?: string, problem?: string | null, frame?: string }} LayerStatus
 *   `info`: short live info ("84k pts · 10 Hz"); `problem`: why it isn't drawn as expected; `frame`: its data's frame_id
 * @typedef {{
 *   viewer: import("../viewer.js").Viewer, tf: import("../tf.js").TfTree, source: any,
 *   video: import("../../components/camera.js").CameraStreams, topics: () => Topic[], setStatus: (status: LayerStatus) => void,
 *   robotPose: RobotPose, options: { baseFrame?: string, cameraInfo?: Record<string, string> },
 * }} LayerContext
 * @typedef {{ root: THREE.Object3D, update?: (frame: any) => void, dispose: () => void, reset?: () => void,
 *   setData?: (data: any) => void }} LayerInstance
 * @typedef {{ id: string, label: string, types: string[], defaults: object | ((topic: Topic) => object),
 *   enabledByDefault?: (topic: Topic) => boolean, create: (context: LayerContext, topic: Topic | null, settings: any) => LayerInstance,
 *   Settings?: Function }} LayerType
 * @typedef {{ id: string, label: string, types: string[],
 *   draw: (context: CanvasRenderingContext2D, message: any, image: { width: number, height: number }) => void }} OverlayType
 */

/** @type {LayerType[]} */
const layerTypes = []

/** Registers a layer type (replacing one with the same id). @param {LayerType} type */
export function registerLayer(type) {
    const existing = layerTypes.findIndex((other) => other.id === type.id)
    if (existing >= 0) {
        layerTypes.splice(existing, 1)
    }
    layerTypes.push(type)
}

/** The layer type drawing a message type (the latest registration wins), or undefined. */
export function layerTypeFor(messageType) {
    for (let index = layerTypes.length - 1; index >= 0; index--) {
        if (layerTypes[index].types.includes(messageType)) {
            return layerTypes[index]
        }
    }
    return undefined
}

/** A layer type by id. */
export const layerTypeById = (id) => layerTypes.find((type) => type.id === id)

/** @returns {readonly LayerType[]} */
export function allLayerTypes() {
    return layerTypes
}

/** A type's default settings for a topic (a fresh copy). */
export function defaultSettings(type, topic) {
    return typeof type.defaults === "function" ? type.defaults(topic) : structuredClone(type.defaults ?? {})
}

/** @type {OverlayType[]} */
const overlayTypes = []

/** Registers a 2D overlay drawn over camera images (e.g. Detection2DArray boxes). @param {OverlayType} type */
export function registerOverlay(type) {
    const existing = overlayTypes.findIndex((other) => other.id === type.id)
    if (existing >= 0) {
        overlayTypes.splice(existing, 1)
    }
    overlayTypes.push(type)
}

export function overlayTypeFor(messageType) {
    return [...overlayTypes].reverse().find((type) => type.types.includes(messageType))
}

export function allOverlayTypes() {
    return overlayTypes
}

/**
 * Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides it and reports why. Returns whether
 * it could be placed.
 */
export function placeLayer(context, object, frame, fixedFrame) {
    const matrix = context.tf.lookup(frame, fixedFrame)
    if (!matrix) {
        if (object.visible) {
            object.visible = false
            context.viewer.requestRender()
        }
        context.setStatus({ problem: `no TF path from "${frame}" to "${fixedFrame}"`, frame })
        return false
    }
    if (!object.visible || !object.matrix.equals(matrix)) {
        object.matrix.copy(matrix)
        object.matrixWorldNeedsUpdate = true
        object.visible = true
        context.viewer.requestRender()
    }
    context.setStatus({ problem: frame === "" ? "no frame_id: drawn in the fixed frame" : null, frame })
    return true
}

/**
 * Subscribes to a topic and hands each decoded message (and its timestamp) to `onMessage`; decode failures are
 * counted into the layer's status.
 * @param {{ maxHz?: number, reliable?: boolean, decodeAs?: string }} options
 */
export function subscribeDecoded(context, topic, options, onMessage) {
    let failures = 0
    return context.source.subscribe(
        topic.key,
        { delivery: options.reliable ? "reliable" : "latest", maxHz: options.maxHz ?? 30 },
        (message) => {
            let decoded
            try {
                decoded = decodeMessage(message, "auto", options.decodeAs ?? topic.type)
            } catch (error) {
                failures++
                context.setStatus({ problem: `cannot decode ${topic.type} (${failures}×): ${error?.message ?? error}` })
                return
            }
            onMessage(decoded, message.timestamp, message)
        },
    )
}

/** std_msgs ColorRGBA → THREE.Color + alpha. */
export function rgba(color) {
    return { color: new THREE.Color(color?.r ?? 1, color?.g ?? 1, color?.b ?? 1), alpha: color?.a ?? 1 }
}

/**
 * The robot's latest pose in the fixed frame from any pose/odometry layer, for following it when no TF frame names
 * the robot. The first topic to report keeps it until it goes away. One per Scene3D.
 */
export class RobotPose {
    /** @type {THREE.Matrix4 | null} */
    matrix = null
    source = null
    report(source, matrix) {
        if (this.source === null || this.source === source) {
            this.source = source
            this.matrix = matrix
        }
    }
    forget(source) {
        if (this.source === source) {
            this.source = null
            this.matrix = null
        }
    }
}
