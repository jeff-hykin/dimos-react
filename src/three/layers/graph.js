// nav_msgs.LineSegments3D: a node/edge graph (pose graphs, roadmaps). dimos sends it as a Path whose poses come in
// pairs (one edge each) with the edge weight in the first pose's orientation.w. Edges are colored by weight on a log
// scale, nodes (each distinct endpoint) drawn as points.
import * as THREE from "three"
import { h } from "../../h.js"
import { useStore } from "../store.js"
import { FatLines } from "../lines.js"
import { sampleGradient } from "../gradients.js"
import { applyLook, makePointMaterial } from "../point_material.js"
import { themeColors } from "../../theme/theme.js"
import { cssColor } from "../robot_model.js"
import { placeLayer, registerLayer, subscribeDecoded } from "./registry.js"
import { Field, Select, Slider, Toggle } from "../../components/controls.js"

/** @typedef {{ width: number, nodes: boolean, nodeSize: number, gradient: string }} GraphSettings */

export class GraphLayer {
    root = new THREE.Group()
    #edges
    #nodes
    #nodeMaterial
    #stop
    #unsubscribe
    #frame = null

    constructor(context, topic, settings) {
        this.context = context
        this.settings = settings
        this.#edges = new FatLines(context.viewer.resolution, { width: settings.get().width, vertexColors: true })
        this.#nodeMaterial = makePointMaterial(context.viewer.pixelsPerMeter)
        this.#nodes = new THREE.Points(new THREE.BufferGeometry(), this.#nodeMaterial)
        this.#nodes.frustumCulled = false
        this.root.add(this.#edges.object, this.#nodes)
        this.#unsubscribe = settings.subscribe(() => this.#restyle())
        this.#restyle()
        this.#stop = subscribeDecoded(
            context,
            topic,
            { maxHz: 5, decodeAs: "nav_msgs.Path" },
            (path, timestamp) => this.#onGraph(path, timestamp),
        )
    }

    #restyle() {
        const settings = this.settings.get()
        this.#edges.material.linewidth = settings.width
        this.#nodes.visible = settings.nodes
        const solid = `#${cssColor(themeColors().fg, "white").getHexString()}`
        applyLook(this.#nodeMaterial, {
            style: "disc",
            size: settings.nodeSize,
            colorMode: "solid",
            gradient: settings.gradient,
            axis: 2,
            rangeMin: 0,
            rangeMax: 1,
            solid,
            opacity: 1,
        }, [0, 1])
        this.context.viewer.requestRender()
    }

    #onGraph(path, timestamp) {
        this.#frame = path.header?.frame_id ?? ""
        const poses = path.poses ?? []
        const edgeCount = Math.floor(poses.length / 2)
        const logs = []
        for (let index = 0; index < edgeCount; index++) {
            const weight = poses[index * 2]?.pose?.orientation?.w ?? 1
            logs.push(Math.log10(Math.max(1e-6, Math.abs(weight))))
        }
        const low = Math.min(...logs, 0), high = Math.max(...logs, low + 1e-6)
        const gradient = this.settings.get().gradient
        this.#edges.clear()
        const nodes = new Map()
        const color = new THREE.Color()
        for (let index = 0; index < edgeCount; index++) {
            const a = poses[index * 2].pose.position, b = poses[index * 2 + 1].pose.position
            const [r, g, bl] = sampleGradient(gradient, (logs[index] - low) / (high - low))
            color.setRGB(r / 255, g / 255, bl / 255, THREE.SRGBColorSpace)
            this.#edges.push(a.x, a.y, a.z, b.x, b.y, b.z, color)
            for (const point of [a, b]) {
                nodes.set(`${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`, [
                    point.x,
                    point.y,
                    point.z,
                ])
            }
        }
        this.#edges.commit()
        const positions = new Float32Array(nodes.size * 3)
        let at = 0
        for (const [x, y, z] of nodes.values()) {
            positions[at++] = x
            positions[at++] = y
            positions[at++] = z
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute("aTime", new THREE.BufferAttribute(new Float32Array(nodes.size), 1))
        geometry.setAttribute("aIntensity", new THREE.BufferAttribute(new Float32Array(nodes.size), 1))
        this.#nodes.geometry.dispose()
        this.#nodes.geometry = geometry
        this.context.setStatus({ info: `${nodes.size} nodes · ${edgeCount} edges · ${this.#frame || "no frame"}` })
        this.context.viewer.noteData(timestamp)
    }

    update(frame) {
        if (this.#frame !== null) {
            placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)
        }
    }

    dispose() {
        this.#stop()
        this.#unsubscribe()
        this.#edges.dispose()
        this.#nodes.geometry.dispose()
        this.#nodeMaterial.dispose()
    }
}

export function GraphSettingsEditor({ settings }) {
    const value = useStore(settings)
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            { label: "Edge width" },
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
            { label: "Nodes" },
            h(Toggle, { value: value.nodes, onChange: (nodes) => settings.update({ nodes }) }),
        ),
        h(
            Field,
            { label: "Node size" },
            h(Slider, {
                min: 0.02,
                max: 0.5,
                step: 0.01,
                value: value.nodeSize,
                format: (size) => `${Math.round(size * 100)} cm`,
                onChange: (nodeSize) => settings.update({ nodeSize }),
            }),
        ),
        h(
            Field,
            { label: "Weights" },
            h(Select, {
                value: value.gradient,
                options: ["viridis", "turbo", "plasma", "magma"],
                onChange: (gradient) => settings.update({ gradient }),
            }),
        ),
    )
}

registerLayer({
    id: "graph",
    label: "Graph (nodes + edges)",
    types: ["nav_msgs.LineSegments3D"],
    defaults: { width: 2, nodes: true, nodeSize: 0.08, gradient: "viridis" },
    create: (context, topic, settings) => new GraphLayer(context, topic, settings),
    Settings: GraphSettingsEditor,
})
