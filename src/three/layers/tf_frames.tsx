// The TF tree drawn: an axes gizmo per frame (theme --axis-x/y/z), its name, and a line to its parent. A big tree (an
// arm, a humanoid) names only the robot's frame, the fixed frame and `named` past `maxNames`. Reading tf into the tree
// is TfFeed's job (whether or not this layer is on).
import * as THREE from "three"
import { h } from "../../h.js"
import { useStore } from "../store.js"
import { themeColors } from "../../theme/theme.js"
import { FatLines } from "../lines.js"
import { LabelPool } from "../labels.js"
import { cssColor } from "../robot_model.js"
import { registerLayer } from "./registry.js"
import { Field, Slider, Toggle } from "../../components/controls.js"

/**
 * @typedef {{ axesSize: number, names: boolean, links: boolean, maxNames?: number, named?: string[],
 *   maxFrames?: number }} TfSettings
 */

export const TF_DEFAULTS = { axesSize: 0.25, names: true, links: true, maxNames: 16, named: [], maxFrames: 512 }

export class TfFramesLayer {
    root = new THREE.Group()
    #axes
    #links
    #labels = new LabelPool("dr-scene-label dr-frame-label")
    #version = -1
    #fixedFrame = ""
    #colors = null
    #unsubscribe

    constructor(context, settings) {
        this.context = context
        this.settings = settings
        const maxFrames = settings.get().maxFrames ?? 512
        this.#axes = new FatLines(context.viewer.resolution, {
            width: 2.5,
            vertexColors: true,
            capacity: maxFrames * 3,
        })
        this.#links = new FatLines(context.viewer.resolution, { width: 1, color: 0xffffff, opacity: 0.6 })
        this.root.add(this.#axes.object, this.#links.object, this.#labels.group)
        this.#unsubscribe = settings.subscribe(() => {
            this.#version = -1
            context.viewer.requestRender()
        })
        addEventListener("dimos-react-theme", this.#restyle)
        this.#restyle()
    }

    #restyle = () => {
        const theme = themeColors()
        this.#colors = [cssColor(theme.axisX, "red"), cssColor(theme.axisY, "green"), cssColor(theme.axisZ, "blue")]
        this.#links.material.color.copy(cssColor(theme.mutedFg, "gray"))
        this.#version = -1
    }

    update(frame) {
        const tf = this.context.tf
        if (tf.version === this.#version && frame.fixedFrame === this.#fixedFrame) {
            return
        }
        this.#version = tf.version
        this.#fixedFrame = frame.fixedFrame
        const settings = { ...TF_DEFAULTS, ...this.settings.get() }
        const snapshot = tf.snapshot()
        const unit = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
        this.#axes.clear()
        this.#links.clear()
        this.#labels.begin()
        const origin = new THREE.Vector3(), tip = new THREE.Vector3(), parent = new THREE.Vector3()
        const baseFrame = this.context.options?.baseFrame
        let unplaced = 0
        for (const name of snapshot.frames.slice(0, settings.maxFrames)) {
            const matrix = tf.lookup(name, frame.fixedFrame)
            if (!matrix) {
                unplaced++
                continue
            }
            origin.setFromMatrixPosition(matrix)
            for (let axis = 0; axis < 3; axis++) {
                tip.copy(unit[axis]).multiplyScalar(settings.axesSize).applyMatrix4(matrix)
                this.#axes.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, this.#colors[axis])
            }
            const nameIt = snapshot.frames.length <= settings.maxNames || name === frame.fixedFrame ||
                name === baseFrame || settings.named.includes(name)
            if (settings.names && nameIt) {
                this.#labels.place(name, origin)
            }
            const parentName = tf.parentOf(name)
            const parentMatrix = parentName && tf.lookup(parentName, frame.fixedFrame)
            if (settings.links && parentMatrix) {
                parent.setFromMatrixPosition(parentMatrix)
                this.#links.push(origin.x, origin.y, origin.z, parent.x, parent.y, parent.z)
            }
        }
        this.#axes.commit()
        this.#links.commit()
        this.#labels.end()
        this.context.setStatus({
            info: `${snapshot.frames.length} frames`,
            problem: unplaced ? `${unplaced} frames not connected to "${frame.fixedFrame}"` : null,
        })
        this.context.viewer.requestRender()
    }

    dispose() {
        this.#unsubscribe()
        removeEventListener("dimos-react-theme", this.#restyle)
        this.#axes.dispose()
        this.#links.dispose()
        this.#labels.dispose()
    }
}

export function TfSettingsEditor({ settings }) {
    const value = useStore(settings)
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            { label: "Axes" },
            h(Slider, {
                min: 0.05,
                max: 1,
                step: 0.05,
                value: value.axesSize,
                format: (size) => `${size} m`,
                onChange: (axesSize) => settings.update({ axesSize }),
            }),
        ),
        h(
            Field,
            { label: "Names" },
            h(Toggle, { value: value.names, onChange: (names) => settings.update({ names }) }),
        ),
        h(
            Field,
            { label: "Links" },
            h(Toggle, { value: value.links, onChange: (links) => settings.update({ links }) }),
        ),
    )
}

registerLayer({
    id: "tf",
    label: "TF frames",
    types: ["tf2_msgs.TFMessage"],
    defaults: { axesSize: 0.25, names: true, links: true },
    // one tf topic drawing is enough: the others are the same tree
    enabledByDefault: (topic) => topic.name === "/tf",
    create: (context, _topic, settings) => new TfFramesLayer(context, settings),
    Settings: TfSettingsEditor,
})
