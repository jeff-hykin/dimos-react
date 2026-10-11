// vision_msgs.Detection3DArray / Detection3D / BoundingBox3DArray: wireframe boxes with a "class score" label, colored
// per class so the same kind of object keeps its color.
import * as THREE from "three"
import { useStore } from "../store"
import { FatLines, pushBox } from "../lines"
import { LabelPool } from "../labels"
import { placeLayer, registerLayer, subscribeDecoded } from "./registry"
import { poseMatrix } from "./pose"
import { colorFor } from "./path"
import { cssColor } from "../robot_model"
import { Field, Slider, Toggle } from "../../components/controls"

/** @typedef {{ width: number, labels: boolean }} BoxSettings */

/** The boxes in a detection message: `{ pose, size, label, className }` each. */
export function boxesOf(type, message) {
    if (type === "vision_msgs.BoundingBox3DArray") {
        return (message.boxes ?? []).map((box, index) => ({
            pose: box.center,
            size: box.size,
            label: `#${index}`,
            className: "box",
        }))
    }
    const detections = type === "vision_msgs.Detection3D" ? [message] : (message.detections ?? [])
    return detections.map((detection) => {
        const best = [...(detection.results ?? [])].sort(
            (a, b) => (b.hypothesis?.score ?? 0) - (a.hypothesis?.score ?? 0),
        )[0]
        const className = best?.hypothesis?.class_id || detection.id || "object"
        const score = best?.hypothesis?.score
        return {
            pose: detection.bbox?.center,
            size: detection.bbox?.size,
            label: score !== undefined ? `${className} ${(score * 100).toFixed(0)}%` : className,
            className,
        }
    })
}

export class BoxLayer {
    root = new THREE.Group()
    #lines
    #labels = new LabelPool()
    #stop = () => {}
    #unsubscribe
    #frame = null
    /** props data: `[{ center, size, yaw, frame, label, color, fill }]`, each placed through TF every frame */
    #data = null
    #placed = ""
    #fills = new THREE.Group()
    settings: any
    context: any

    constructor(context, topic, settings) {
        this.context = context
        this.settings = settings
        this.#lines = new FatLines(context.viewer.resolution, { width: settings.get().width, vertexColors: true })
        this.root.add(this.#lines.object, this.#labels.group)
        const restyle = () => {
            this.#lines.material.linewidth = settings.get().width
            this.#labels.group.visible = settings.get().labels
            context.viewer.requestRender()
        }
        this.#unsubscribe = settings.subscribe(restyle)
        restyle()
        this.root.add(this.#fills)
        if (!topic) {
            return
        }
        this.#stop = subscribeDecoded(context, topic, { maxHz: 15 }, (message, timestamp) => {
            this.#frame = message.header?.frame_id ?? ""
            const boxes = boxesOf(topic.type, message)
            this.#lines.clear()
            this.#labels.begin()
            const matrix = new THREE.Matrix4()
            const top = new THREE.Vector3()
            for (const box of boxes) {
                const color = colorFor(box.className)
                poseMatrix(box.pose, matrix)
                pushBox(
                    this.#lines,
                    matrix,
                    { x: box.size?.x ?? 0.1, y: box.size?.y ?? 0.1, z: box.size?.z ?? 0.1 },
                    color,
                )
                top.set(0, 0, (box.size?.z ?? 0) / 2).applyMatrix4(matrix)
                this.#labels.place(box.label, top, `#${color.getHexString()}`)
            }
            this.#lines.commit()
            this.#labels.end()
            context.setStatus({ info: `${boxes.length} boxes · ${this.#frame || "no frame"}` })
            context.viewer.noteData(timestamp)
        })
    }

    /**
     * Boxes from props (no topic): `[{ center: [x, y, z], size: [x, y, z], yaw, frame, label, color, fill }]`; `color`
     * any CSS color or token, `fill` the opacity of a translucent fill (0 = edges only).
     */
    setData(data) {
        this.#data = Array.isArray(data) ? data : []
        this.#placed = ""
    }

    #drawData(fixedFrame) {
        const placed = []
        for (const box of this.#data) {
            const local = new THREE.Matrix4().makeRotationZ(box.yaw ?? 0).setPosition(...(box.center ?? [0, 0, 0]))
            if (box.frame && box.frame !== fixedFrame) {
                const transform = this.context.tf.lookup(box.frame, fixedFrame)
                if (!transform) {
                    continue
                }
                local.premultiply(transform)
            }
            placed.push({ box, matrix: local })
        }
        const signature = placed
            .map(
                ({ box, matrix }) =>
                    `${box.label}|${box.color}|${box.fill}|${box.size}|${matrix.elements.map((v) => v.toFixed(3))}`,
            )
            .join("\n")
        if (signature === this.#placed) {
            return
        }
        this.#placed = signature
        this.#lines.clear()
        this.#labels.begin()
        for (const child of [...this.#fills.children]) {
            child.geometry.dispose()
            child.material.dispose()
            child.removeFromParent()
        }
        const top = new THREE.Vector3()
        for (const { box, matrix } of placed) {
            const [sx, sy, sz] = box.size ?? [0.1, 0.1, 0.1]
            const color = cssColor(box.color ?? "var(--warn)")
            pushBox(this.#lines, matrix, { x: sx, y: sy, z: sz }, color)
            if (box.fill) {
                const fill = new THREE.Mesh(
                    new THREE.BoxGeometry(sx, sy, sz),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: box.fill, depthWrite: false }),
                )
                fill.matrixAutoUpdate = false
                fill.matrix.copy(matrix)
                this.#fills.add(fill)
            }
            if (box.label) {
                top.set(0, 0, sz / 2 + 0.12).applyMatrix4(matrix)
                this.#labels.place(box.label, top, `#${color.getHexString()}`)
            }
        }
        this.#lines.commit()
        this.#labels.end()
        this.context.setStatus({ info: `${placed.length} boxes` })
        this.context.viewer.requestRender()
    }

    update(frame) {
        if (this.#data) {
            this.#drawData(frame.fixedFrame)
            return
        }
        if (this.#frame !== null) {
            placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)
        }
    }

    dispose() {
        this.#stop()
        this.#unsubscribe()
        for (const child of this.#fills.children) {
            child.geometry.dispose()
            child.material.dispose()
        }
        this.#lines.dispose()
        this.#labels.dispose()
    }
}

export function BoxSettingsEditor({ settings }) {
    const value = useStore(settings)
    return (
        <div className="dr-layer-settings-grid">
            <Field label="Width">
                <Slider
                    min={1}
                    max={8}
                    step={0.5}
                    value={value.width}
                    format={(width) => `${width}px`}
                    onChange={(width) => settings.update({ width })}
                />
            </Field>
            <Field label="Labels">
                <Toggle value={value.labels} onChange={(labels) => settings.update({ labels })} />
            </Field>
        </div>
    )
}

registerLayer({
    id: "boxes3d",
    label: "3D boxes",
    types: ["vision_msgs.Detection3DArray", "vision_msgs.Detection3D", "vision_msgs.BoundingBox3DArray"],
    defaults: { width: 2.5, labels: true },
    create: (context, topic, settings) => new BoxLayer(context, topic, settings),
    Settings: BoxSettingsEditor,
})
