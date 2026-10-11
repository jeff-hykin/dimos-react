// geometry_msgs.PoseArray (candidate poses, particle clouds, waypoints): an arrow per pose along its +x.
import * as THREE from "three"
import { h } from "../../h.js"
import { useStore } from "../store.js"
import { FatLines } from "../lines.js"
import { cssColor } from "../robot_model.js"
import { placeLayer, registerLayer, subscribeDecoded } from "./registry.js"
import { ColorSetting, poseMatrix } from "./pose.js"
import { colorFor } from "./path.js"
import { Field, Slider } from "../../components/controls.js"

/** @typedef {{ length: number, color: string, width?: number }} ArrowSettings */

export class PoseArrayLayer {
    root = new THREE.Group()
    #lines
    #stop = () => {}
    #unsubscribe
    #frame = null
    #poses = null

    constructor(context, topic, settings) {
        this.context = context
        this.settings = settings
        this.#lines = new FatLines(context.viewer.resolution, { width: settings.get().width ?? 2.5, color: 0xffffff })
        this.root.add(this.#lines.object)
        this.#unsubscribe = settings.subscribe(() => this.#draw())
        if (topic) {
            this.#stop = subscribeDecoded(context, topic, { maxHz: 10 }, (message, timestamp) => {
                this.#set(message.poses ?? message, message.header?.frame_id ?? "", timestamp)
            })
        }
        this.#draw()
    }

    /** Props data: `{ poses, frame? }`. */
    setData(data) {
        this.#set(data?.poses ?? data, data?.frame ?? "", data?.timestamp ?? Date.now())
    }

    #set(poses, frame, timestamp) {
        this.#frame = frame
        this.#poses = poses
        this.#draw()
        this.context.setStatus({ info: `${poses?.length ?? 0} poses · ${frame || "no frame"}`, frame })
        this.context.viewer.noteData(timestamp)
    }

    #draw() {
        const { length, color, width } = this.settings.get()
        this.#lines.material.color.copy(cssColor(color, "white"))
        this.#lines.material.linewidth = width ?? 2.5
        this.#lines.clear()
        const matrix = new THREE.Matrix4()
        const points = [
            new THREE.Vector3(),
            new THREE.Vector3(length, 0, 0),
            new THREE.Vector3(length * 0.7, length * 0.2, 0),
            new THREE.Vector3(length * 0.7, -length * 0.2, 0),
        ]
        const placed = points.map(() => new THREE.Vector3())
        for (const pose of this.#poses ?? []) {
            poseMatrix(pose?.pose ?? pose, matrix)
            points.forEach((point, index) => placed[index].copy(point).applyMatrix4(matrix))
            const [tail, tip, left, right] = placed
            this.#lines.push(tail.x, tail.y, tail.z, tip.x, tip.y, tip.z)
            this.#lines.push(tip.x, tip.y, tip.z, left.x, left.y, left.z)
            this.#lines.push(tip.x, tip.y, tip.z, right.x, right.y, right.z)
        }
        this.#lines.commit()
        this.context.viewer.requestRender()
    }

    update(frame) {
        if (this.#frame !== null) {
            placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)
        }
    }

    dispose() {
        this.#stop()
        this.#unsubscribe()
        this.#lines.dispose()
    }
}

export function ArrowSettingsEditor({ settings }) {
    const value = useStore(settings)
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            { label: "Length" },
            h(Slider, {
                min: 0.05,
                max: 2,
                step: 0.05,
                value: value.length,
                format: (length) => `${length} m`,
                onChange: (length) => settings.update({ length }),
            }),
        ),
        h(
            Field,
            { label: "Color" },
            h(ColorSetting, { value: value.color, onChange: (color) => settings.update({ color }) }),
        ),
    )
}

registerLayer({
    id: "posearray",
    label: "Pose array",
    types: ["geometry_msgs.PoseArray"],
    defaults: (topic) => ({ length: 0.4, color: `#${colorFor(topic?.name ?? "").getHexString()}` }),
    create: (context, topic, settings) => new PoseArrayLayer(context, topic, settings),
    Settings: ArrowSettingsEditor,
})
