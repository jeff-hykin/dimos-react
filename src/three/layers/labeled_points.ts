// Labeled points: visualization_msgs.EntityMarkers (dimos's people/objects/places, JSON after a u32 length, no
// fingerprint) and geometry_msgs.PointStamped (a clicked point, a goal). A sphere and a text label each, colored by
// kind from the theme (--entity-person / --entity-object / --entity-location, else --danger / --ok / --info).
import * as THREE from "three"
import { LabelPool } from "../labels"
import { cssColor } from "../robot_model"
import { placeLayer, registerLayer, subscribeDecoded } from "./registry"
import { colorFor } from "./path"

const ENTITY_COLORS = {
    person: "var(--entity-person, var(--danger))",
    object: "var(--entity-object, var(--ok))",
    location: "var(--entity-location, var(--info, var(--primary)))",
}
const OTHER = "var(--muted-fg)"

/** EntityMarkers bytes (u32 big-endian length + JSON) → `{ label, color, position }[]`. */
export function entitiesOf(bytes) {
    const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0)
    const list = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)))
    return list.map((entity) => ({
        label: `${entity.id}: ${String(entity.label).slice(0, 40)}`,
        color: ENTITY_COLORS[entity.type] ?? OTHER,
        position: new THREE.Vector3(entity.x, entity.y, entity.z),
    }))
}

const sphere = new THREE.SphereGeometry(1, 16, 12)

export class LabeledPoints {
    root = new THREE.Group()
    #labels = new LabelPool()
    #spheres
    #stop = () => {}
    #frame = null
    #show
    /** props data: `[{ label, position: [x, y, z], frame, color }]`, each placed through TF every frame */
    #data = null
    #placed = ""
    context: any

    constructor(context, topic) {
        this.context = context
        this.#spheres = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial(), 256)
        this.#spheres.count = 0
        this.#spheres.frustumCulled = false
        this.root.add(this.#spheres, this.#labels.group)
        const show = (this.#show = (entities, frame, timestamp) => {
            this.#frame = frame
            this.#labels.begin()
            const matrix = new THREE.Matrix4()
            const count = Math.min(entities.length, 256)
            for (let index = 0; index < count; index++) {
                const entity = entities[index]
                this.#spheres.setMatrixAt(index, matrix.makeScale(0.12, 0.12, 0.12).setPosition(entity.position))
                this.#spheres.setColorAt(index, cssColor(entity.color, "gray"))
                this.#labels.place(entity.label, entity.position.clone().setZ(entity.position.z + 0.25), entity.color)
            }
            this.#spheres.count = count
            this.#spheres.instanceMatrix.needsUpdate = true
            if (this.#spheres.instanceColor) {
                this.#spheres.instanceColor.needsUpdate = true
            }
            this.#labels.end()
            context.setStatus({ info: `${entities.length} points` })
            if (timestamp !== undefined) {
                context.viewer.noteData(timestamp)
            }
            context.viewer.requestRender()
        })
        if (!topic) {
            return
        }
        if (topic.type === "visualization_msgs.EntityMarkers") {
            // world coordinates by definition (dimos draws them in rerun's world)
            this.#stop = context.source.subscribe(topic.key, { delivery: "latest", maxHz: 5 }, (message) => {
                try {
                    show(
                        Array.isArray(message.value)
                            ? message.value.map((entity) => ({
                                  label: `${entity.id}: ${String(entity.label).slice(0, 40)}`,
                                  color: ENTITY_COLORS[entity.type] ?? OTHER,
                                  position: new THREE.Vector3(entity.x, entity.y, entity.z),
                              }))
                            : entitiesOf(message.bytes),
                        "",
                        message.timestamp,
                    )
                } catch (error) {
                    context.setStatus({ problem: `cannot decode: ${error?.message ?? error}` })
                }
            })
        } else {
            this.#stop = subscribeDecoded(context, topic, { maxHz: 10 }, (message, timestamp) => {
                const point = message.point ?? {}
                show(
                    [
                        {
                            label: topic.name,
                            color: `#${colorFor(topic.name).getHexString()}`,
                            position: new THREE.Vector3(point.x, point.y, point.z),
                        },
                    ],
                    message.header?.frame_id ?? "",
                    timestamp,
                )
            })
        }
    }

    /** Points from props (no topic): `[{ label, position: [x, y, z], frame, color }]`. */
    setData(data) {
        this.#data = Array.isArray(data) ? data : []
        this.#placed = ""
    }

    update(frame) {
        if (this.#data) {
            // each point through its own frame; redrawn only when where they land changed
            const entities = []
            for (const item of this.#data) {
                const position = new THREE.Vector3(...(item.position ?? [0, 0, 0]))
                const matrix =
                    !item.frame || item.frame === frame.fixedFrame
                        ? null
                        : this.context.tf.lookup(item.frame, frame.fixedFrame)
                if (item.frame && item.frame !== frame.fixedFrame && !matrix) {
                    continue
                }
                if (matrix) {
                    position.applyMatrix4(matrix)
                }
                entities.push({ label: item.label ?? "", color: item.color ?? "var(--warn)", position })
            }
            const signature = entities
                .map(
                    (entity) => `${entity.label}|${entity.color}|${entity.position.toArray().map((v) => v.toFixed(3))}`,
                )
                .join("\n")
            if (signature !== this.#placed) {
                this.#placed = signature
                this.#show(entities, "", undefined)
            }
            return
        }
        if (this.#frame !== null) {
            placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)
        }
    }

    dispose() {
        this.#stop()
        this.#spheres.dispose()
        this.#labels.dispose()
    }
}

registerLayer({
    id: "labeled-points",
    label: "Labeled points",
    types: ["visualization_msgs.EntityMarkers", "geometry_msgs.PointStamped"],
    defaults: {},
    create: (context, topic) => new LabeledPoints(context, topic),
})
