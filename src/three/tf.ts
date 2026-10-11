// The transform tree from tf / tf_static (ported from dim-controller core/tf.ts). Everything drawn is placed by
// looking its header's frame_id up here, relative to the fixed frame the view is in; a frame with no path to it is
// reported, never drawn at the origin. Pure: no DOM, only three's math.
import { Matrix4, Quaternion, Vector3 } from "three"

/** A dynamic edge older than this is "stale" (tf_static is exempt: it publishes rarely). */
export const STALE_MS = 2000
/** Frames commonly used as the world, in preference order, when picking a default fixed frame. */
export const WORLD_NAMES = ["world", "map", "odom"]

const scratchVector = new Vector3()
const scratchQuaternion = new Quaternion()
const unitScale = new Vector3(1, 1, 1)
const clock = () => globalThis.performance?.now() ?? Date.now()

/**
 * @typedef {{ doubleParent: [string, string[]][], roots: string[], cycle: string[], stale: string[] }} TfProblems
 * @typedef {{ frames: string[], edges: { parent: string, child: string, isStatic: boolean, ageMs: number }[], problems: TfProblems }} TfSnapshot
 */

export class TfTree {
    /** @type {Map<string, { parent: string, matrix: Matrix4, isStatic: boolean, receivedAt: number }>} */
    #edges: Map<string, { parent: string; matrix: Matrix4; isStatic: boolean; receivedAt: number }> = new Map()
    #parentsSeen = new Map()
    #cache = new Map()
    #cacheFixed = ""
    #listeners = new Set()
    /** bumped on every change, so layers know when to re-place what they drew */
    version = 0
    now: () => any
    /** @param {{ now?: () => number }} [options] `now`: the clock (ms) for staleness; tests pass a fake one */
    constructor({ now = clock }: { now?: () => number } = {}) {
        this.now = now
    }

    /**
     * Sets T_parent_child.
     * @param {string} parent
     * @param {string} child
     * @param {[number, number, number]} translation
     * @param {[number, number, number, number]} rotation quaternion x, y, z, w
     * @param {boolean} [isStatic]
     */
    set(
        parent: string,
        child: string,
        translation: [number, number, number],
        rotation: [number, number, number, number],
        isStatic: boolean = false,
    ) {
        if (!parent || !child || parent === child) {
            return
        }
        let edge = this.#edges.get(child)
        if (!edge) {
            edge = { parent, matrix: new Matrix4(), isStatic, receivedAt: 0 }
            this.#edges.set(child, edge)
        }
        edge.parent = parent
        edge.isStatic = isStatic || edge.isStatic
        edge.receivedAt = this.now()
        const quaternion = scratchQuaternion.set(...rotation)
        if (quaternion.lengthSq() < 1e-12) {
            quaternion.set(0, 0, 0, 1)
        }
        edge.matrix.compose(scratchVector.set(...translation), quaternion.normalize(), unitScale)
        let parents = this.#parentsSeen.get(child)
        if (!parents) {
            parents = new Set()
            this.#parentsSeen.set(child, parents)
        }
        parents.add(parent)
        this.#changed()
    }

    /**
     * Feeds a decoded tf2_msgs.TFMessage (or an array of geometry_msgs.TransformStamped).
     * @param {any} message
     * @param {boolean} [isStatic]
     */
    setMessage(message: any, isStatic: boolean = false) {
        const transforms = Array.isArray(message) ? message : (message?.transforms ?? [])
        for (const stamped of transforms) {
            const { translation, rotation } = stamped?.transform ?? {}
            if (!translation || !rotation) {
                continue
            }
            this.set(
                stamped.header?.frame_id ?? "",
                stamped.child_frame_id ?? "",
                [translation.x ?? 0, translation.y ?? 0, translation.z ?? 0],
                [rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0, rotation.w ?? 1],
                isStatic,
            )
        }
    }

    /** Forgets every edge. */
    clear() {
        this.#edges.clear()
        this.#parentsSeen.clear()
        this.#changed()
    }

    #changed() {
        this.#cache.clear()
        this.version++
        for (const listener of [...this.#listeners]) {
            listener(this.version)
        }
    }

    /** `listener(version)` after every change. Returns unsubscribe. */
    onChange(listener) {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    /** Whether the tree knows `frame` (as a child or a parent). */
    has(frame) {
        return this.#edges.has(frame) || [...this.#edges.values()].some((edge) => edge.parent === frame)
    }

    /** The parent of `frame`, or null for a root / unknown frame. */
    parentOf(frame) {
        return this.#edges.get(frame)?.parent ?? null
    }

    /** The root above `frame` and T_root_frame, or null on a cycle. */
    #toRoot(frame) {
        const matrix = new Matrix4()
        let current = frame
        for (let guard = 0; guard < 128; guard++) {
            const edge = this.#edges.get(current)
            if (!edge) {
                return { root: current, matrix }
            }
            matrix.premultiply(edge.matrix)
            current = edge.parent
        }
        return null
    }

    /**
     * T_fixed_frame: places data in `frame` into the fixed frame. An empty frame or the fixed frame itself is identity;
     * null when there is no path (different trees, unknown frame, a cycle). The result is cached: don't mutate it.
     * @param {string} frame
     * @param {string} fixed
     * @returns {Matrix4 | null}
     */
    lookup(frame: string, fixed: string): Matrix4 | null {
        if (fixed !== this.#cacheFixed) {
            this.#cache.clear()
            this.#cacheFixed = fixed
        }
        const cached = this.#cache.get(frame)
        if (cached !== undefined) {
            return cached
        }
        let result = null
        if (frame === fixed || frame === "") {
            result = new Matrix4()
        } else {
            const from = this.#toRoot(frame)
            const to = this.#toRoot(fixed)
            if (from && to && from.root === to.root) {
                result = to.matrix.clone().invert().multiply(from.matrix)
            } else if (
                from &&
                !this.has(fixed) &&
                from.root === frame &&
                WORLD_NAMES.includes(frame) &&
                WORLD_NAMES.includes(fixed)
            ) {
                // no tf for either world-ish name (a map in "world" while nothing publishes tf): the same frame
                result = new Matrix4()
            }
        }
        this.#cache.set(frame, result)
        return result
    }

    /** The fixed frame to default to: a world-ish root if there is one, else the root of the biggest tree. */
    defaultFixedFrame() {
        const roots = this.#roots()
        for (const name of WORLD_NAMES) {
            if (roots.includes(name)) {
                return name
            }
        }
        for (const name of WORLD_NAMES) {
            if (this.has(name)) {
                return name
            }
        }
        let best = roots[0] ?? "world"
        let bestSize = -1
        for (const root of roots) {
            const size = [...this.#edges.keys()].filter((child) => this.#toRoot(child)?.root === root).length
            if (size > bestSize) {
                best = root
                bestSize = size
            }
        }
        return best
    }

    #roots() {
        const roots = new Set()
        for (const edge of this.#edges.values()) {
            if (!this.#edges.has(edge.parent)) {
                roots.add(edge.parent)
            }
        }
        return [...roots].sort()
    }

    /** Every frame name, sorted. @returns {string[]} */
    frames(): string[] {
        /** @type {Set<string>} */
        const frames: Set<string> = new Set()
        for (const [child, edge] of this.#edges) {
            frames.add(child)
            frames.add(edge.parent)
        }
        return [...frames].sort()
    }

    /** @returns {TfSnapshot} */
    snapshot(): TfSnapshot {
        const now = this.now()
        const edges = []
        for (const [child, edge] of this.#edges) {
            edges.push({ parent: edge.parent, child, isStatic: edge.isStatic, ageMs: now - edge.receivedAt })
        }
        return {
            frames: this.frames(),
            edges,
            problems: {
                doubleParent: [...this.#parentsSeen]
                    .filter(([, parents]) => parents.size > 1)
                    .map(([child, parents]) => [child, [...parents]]),
                roots: this.#roots(),
                cycle: [...this.#edges.keys()].filter((child) => this.#toRoot(child) === null),
                stale: edges.filter((edge) => !edge.isStatic && edge.ageMs > STALE_MS).map((edge) => edge.child),
            },
        }
    }
}
