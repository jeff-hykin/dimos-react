// One TF frame picked out in the 3D view (e.g. a TF panel's hovered row): big axes drawn over everything, with a halo
// behind them and the frame's name, following the frame as it moves. Works whether or not a TF layer is on.
import * as THREE from "three"
import { themeColors } from "../theme/theme.js"
import { FatLines } from "./lines.js"
import { LabelPool } from "./labels.js"
import { cssColor } from "./robot_model.js"

/** axes length (m) and line widths (CSS px) of the highlight */
const AXES_METERS = 1.2
const AXES_PX = 7
const HALO_PX = 22

export class FrameHighlighter {
    root = new THREE.Group()
    frame = null
    placed = false
    #axes
    #halo
    #label = new LabelPool("dr-scene-label dr-highlight")

    /** @param {(placed: boolean) => void} [onPlaced] */
    constructor(viewer, tf, onPlaced) {
        this.viewer = viewer
        this.tf = tf
        this.onPlaced = onPlaced
        this.#halo = new FatLines(viewer.resolution, { width: HALO_PX, vertexColors: true, opacity: 0.3, capacity: 3 })
        this.#axes = new FatLines(viewer.resolution, { width: AXES_PX, vertexColors: true, capacity: 3 })
        for (const lines of [this.#halo, this.#axes]) {
            // drawn last and through everything, so it's never hidden inside a point cloud
            lines.material.depthTest = false
            lines.material.depthWrite = false
            lines.material.transparent = true
            lines.object.renderOrder = 1000
        }
        this.#halo.object.renderOrder = 999
        this.root.add(this.#halo.object, this.#axes.object, this.#label.group)
        this.root.userData.noPick = true
    }

    set(frame) {
        if (frame !== this.frame) {
            this.frame = frame
            this.placed = false
            this.viewer.requestRender()
        }
    }

    update(frameInfo) {
        const frame = this.frame
        const matrix = frame ? this.tf.lookup(frame, frameInfo.fixedFrame) : null
        this.#axes.clear()
        this.#halo.clear()
        this.#label.begin()
        if (frame && matrix) {
            const theme = themeColors()
            const colors = [cssColor(theme.axisX, "red"), cssColor(theme.axisY, "green"), cssColor(theme.axisZ, "blue")]
            const origin = new THREE.Vector3().setFromMatrixPosition(matrix)
            const tip = new THREE.Vector3()
            const units = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
            units.forEach((axis, index) => {
                tip.copy(axis).multiplyScalar(AXES_METERS).applyMatrix4(matrix)
                this.#axes.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, colors[index])
                this.#halo.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, colors[index])
            })
            this.#label.place(frame, origin)
        }
        this.#axes.commit()
        this.#halo.commit()
        this.#label.end()
        if (frame && this.placed !== !!matrix) {
            this.placed = !!matrix
            this.onPlaced?.(this.placed)
        }
        // moving frames move the highlight: keep drawing while one is shown
        if (frame) {
            this.viewer.requestRender()
        }
    }

    dispose() {
        this.#axes.dispose()
        this.#halo.dispose()
        this.#label.dispose()
    }
}
