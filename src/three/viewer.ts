// The three.js view (ported from dim-controller core/render/viewer.ts): one renderer, a ROS-convention (Z up) scene in
// the fixed frame, orbit/pan/zoom controls (mouse: left orbit, right / shift-left pan, wheel zoom; touch: one finger
// orbit, two fingers pan + pinch zoom), a smoothed follow camera, a 2D label overlay, and a render loop that only
// draws when something changed. It keeps fps / frame time / latency numbers in `stats`.
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js"
import { Store } from "./store"
import { focusDistance, splatBackground } from "./point_material"
import { CATCH_UP_SECONDS, PanGate, SmoothFollow } from "./follow"
import { themeColors } from "../theme/theme"
import { cssColor } from "./robot_model"
import { FRAME_BUDGET_MS, splatFallback } from "./rendering"

/**
 * @typedef {{ fps: number, frameMs: number, latencyP50: number | null, latencyP95: number | null,
 *   arrivalToFrameMs: number | null, drawCalls: number, points: number }} RenderStats
 * @typedef {{ now: number, dataNow: number, fixedFrame: string, camera: THREE.PerspectiveCamera }} FrameInfo
 *   `now`: performance.now() of the frame; `dataNow`: the data clock (a replay's playhead, else performance.now())
 */

/** The canvas renders at the screen's resolution, up to 2× (beyond that the extra pixels cost more than they show). */
const pixelRatio = () => Math.min(2, globalThis.devicePixelRatio || 1)

export class Viewer {
    /** @type {THREE.WebGLRenderer} */
    renderer
    /** @type {CSS2DRenderer} */
    labels
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(60, 1, 0.05, 10000)
    /** @type {OrbitControls} */
    controls
    /** @type {Store<RenderStats>} */
    stats = new Store({
        fps: 0,
        frameMs: 0,
        latencyP50: null,
        latencyP95: null,
        arrivalToFrameMs: null,
        drawCalls: 0,
        points: 0,
    })
    /** world units → pixels at 1 m depth; point shaders size by it */
    pixelsPerMeter = { value: 1 }
    /** view size in CSS pixels; thick-line materials share it */
    resolution = new THREE.Vector2(1, 1)
    fixedFrame = "world"
    /** where the camera follows (a point in the fixed frame); the React layer sets it each frame from followFrame */
    /** @type {THREE.Vector3 | null} */
    followTarget = null
    /** a hidden view (display: none, a collapsed pane) draws nothing; what changed meanwhile is drawn once unpaused */
    paused = false
    /** following stopped because the user panned away; `resumeFollow()` ends it */
    followPaused = new Store({ paused: false })
    /**
     * The clock things age by (ms): point-cloud windows, marker lifetimes, rates. performance.now() live; a replay's
     * playhead (Scene3D sets it from a replay source), so a paused replay doesn't age.
     */
    dataClock = () => performance.now()

    #host
    #dirty = true
    #listeners = new Set()
    #grid = null
    #gridVisible = true
    #gridSize = 200
    #gridDivisions = 200
    #frameTimes = []
    #cpuTimes = []
    #pendingData = []
    #latencies = []
    #arrivals = []
    #lastStats = 0
    #lastDeclutter = 0
    #clock
    #follow = new SmoothFollow()
    #lastFollow = new THREE.Vector3()
    #following = false
    #followDelta = new THREE.Vector3()
    #catchingUp = false
    #panGate = new PanGate()
    #beforeControls = new THREE.Vector3()
    #pan = new THREE.Vector3()
    #reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null
    #lastFrame = 0
    #frameRequest = 0
    #resizeObserver
    #disposed = false
    #resetListeners = new Set()
    #slowSeconds = 0

    /**
     * @param {HTMLElement} host the element the canvas fills (give it a size; it is watched for resizes)
     * @param {{ clock?: () => number, grid?: boolean, antialias?: boolean, near?: number, far?: number, fov?: number,
     *   gridSize?: number, gridDivisions?: number, freeOrbit?: boolean }} [options] `clock`: the clock message
     *   timestamps are in (ms, for latency; default Date.now). `near` / `far` / `fov`: the camera (defaults 0.05 m,
     *   10 km, 60°; a small model like a URDF wants near ≈ 0.001). `gridSize` (m) / `gridDivisions`: the ground grid
     *   (default 200 m in 1 m cells). `freeOrbit`: the camera may orbit below the ground (default: it stays above).
     */
    constructor(
        host,
        {
            clock = () => Date.now(),
            grid = true,
            antialias = false,
            near = 0.05,
            far = 10000,
            fov = 60,
            gridSize = 200,
            gridDivisions = 200,
            freeOrbit = false,
        } = {},
    ) {
        this.#host = host
        this.#clock = clock
        this.#gridVisible = grid
        this.#gridSize = gridSize
        this.#gridDivisions = gridDivisions
        this.camera.near = near
        this.camera.far = far
        this.camera.fov = fov
        this.camera.updateProjectionMatrix()
        this.renderer = new THREE.WebGLRenderer({ antialias, alpha: true, powerPreference: "high-performance" })
        this.renderer.setPixelRatio(pixelRatio())
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.domElement.className = "dr-scene-canvas"
        host.appendChild(this.renderer.domElement)
        this.labels = new CSS2DRenderer()
        this.labels.domElement.className = "dr-scene-labels"
        host.appendChild(this.labels.domElement)

        this.camera.up.set(0, 0, 1)
        this.camera.position.set(-6, -6, 5)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.18
        this.controls.screenSpacePanning = false
        this.controls.maxPolarAngle = freeOrbit ? Math.PI : Math.PI * 0.495
        this.controls.addEventListener("change", () => this.requestRender())
        this.controls.addEventListener("start", () => this.#panGate.start())

        this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x202830, 1.6))
        const sun = new THREE.DirectionalLight(0xffffff, 1.2)
        sun.position.set(5, 3, 10)
        this.scene.add(sun)
        this.setTheme()

        this.#resizeObserver = new ResizeObserver(() => this.#resize())
        this.#resizeObserver.observe(host)
        this.#watchPixelRatio()
        this.#resize()
        this.#frameRequest = requestAnimationFrame(this.#loop)
    }

    #makeGrid(dark) {
        const colors = themeColors()
        const grid = new THREE.GridHelper(
            this.#gridSize,
            this.#gridDivisions,
            cssColor(colors.sceneGridMajor || colors.border, "gray"),
            cssColor(colors.sceneGrid || colors.surface, "gray"),
        )
        grid.rotation.x = Math.PI / 2
        grid.userData.noPick = true
        grid.material.transparent = true
        grid.material.opacity = dark ? 0.7 : 0.55
        grid.visible = this.#gridVisible
        return grid
    }

    /** Re-reads the theme: grid, fog and splat background (the background itself is CSS behind the canvas). */
    setTheme() {
        const dark =
            typeof document === "undefined" || getComputedStyle(document.documentElement).colorScheme.trim() !== "light"
        if (this.#grid) {
            this.scene.remove(this.#grid)
            this.#grid.geometry.dispose()
            this.#grid.material.dispose()
        }
        this.#grid = this.#makeGrid(dark)
        this.scene.add(this.#grid)
        const background = cssColor(themeColors().sceneBg || themeColors().bg, "black")
        this.scene.fog = dark ? null : new THREE.Fog(background, 40, 110)
        splatBackground.copy(background)
        this.requestRender()
    }

    /** Shows or hides the ground grid. */
    setGrid(visible) {
        this.#gridVisible = visible
        if (this.#grid) {
            this.#grid.visible = visible
        }
        this.requestRender()
    }

    /** Hides scene labels that overlap a more important one (frame names give way to data labels). */
    #declutter() {
        const elements = [...this.labels.domElement.querySelectorAll(".dr-scene-label")].filter(
            (element) => element.style.display !== "none",
        )
        const placed = []
        const ranked = elements
            .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
                minor: element.classList.contains("dr-frame-label"),
            }))
            .sort((a, b) => Number(a.minor) - Number(b.minor))
        for (const { element, rect } of ranked) {
            const hit = placed.some(
                (other) =>
                    rect.left < other.right &&
                    rect.right > other.left &&
                    rect.top < other.bottom &&
                    rect.bottom > other.top,
            )
            element.classList.toggle("dr-covered", hit)
            if (!hit) {
                placed.push(rect)
            }
        }
    }

    /**
     * The view as an image, now: runs the frame listeners, renders and reads the canvas in the same task (no
     * preserveDrawingBuffer needed). Returns a data URL (`type` default image/png).
     */
    capture(type = "image/png") {
        const info = { now: performance.now(), fixedFrame: this.fixedFrame, camera: this.camera }
        for (const listener of this.#listeners) {
            listener(info)
        }
        this.renderer.render(this.scene, this.camera)
        return this.renderer.domElement.toDataURL(type)
    }

    /** Draw on the next frame. */
    requestRender() {
        this.#dirty = true
    }

    /** Layers call this when a message changed what's drawn; the next frame draws it and times it. */
    noteData(timestampMs) {
        if (Number.isFinite(timestampMs)) {
            this.#pendingData.push({ ts: timestampMs, arrival: performance.now() })
        }
        this.#dirty = true
    }

    /** `listener()` when the data jumped (a replay's seek): layers drop what they gathered over time. */
    onReset(listener) {
        this.#resetListeners.add(listener)
        return () => this.#resetListeners.delete(listener)
    }

    /** Tells every layer the data jumped (Scene3D calls it on the source's seek). */
    reset() {
        for (const listener of [...this.#resetListeners]) {
            try {
                listener()
            } catch (error) {
                console.error("[dimos-react] scene reset listener threw", error)
            }
        }
        this.requestRender()
    }

    /**
     * `listener(frame)` every animation frame, before rendering. Returns unsubscribe.
     * @param {(frame: FrameInfo) => void} listener
     */
    onFrame(listener) {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    /**
     * The point in the scene (the fixed frame) under a screen point (client px): the nearest drawn cloud point within
     * a few pixels of the ray or the nearest mesh hit, else where the ray meets the ground (z = 0). Null on a miss.
     * @returns {{ point: THREE.Vector3, on: "points" | "mesh" | "ground", object?: THREE.Object3D } | null}
     */
    pick(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect()
        const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        )
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(ndc, this.camera)
        const { origin, direction } = raycaster.ray
        const PICK_PX = 6
        const slope = (PICK_PX * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 2) / Math.max(1, rect.height)
        let best = null
        const meshes = []
        const point = new THREE.Vector3()
        const offset = new THREE.Vector3()
        const visit = (object) => {
            if (!object.visible || object.userData.noPick) {
                return
            }
            if (object.isPoints) {
                const geometry = object.geometry
                const position = geometry.getAttribute("position")
                if (position) {
                    const end = Math.min(position.count, geometry.drawRange.start + geometry.drawRange.count)
                    const array = position.array
                    const world = object.matrixWorld
                    for (let index = geometry.drawRange.start; index < end; index++) {
                        point.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]).applyMatrix4(world)
                        offset.subVectors(point, origin)
                        const along = offset.dot(direction)
                        if (along <= this.camera.near || (best && along >= best.distance)) {
                            continue
                        }
                        const away = offset.addScaledVector(direction, -along).length()
                        if (away <= along * slope) {
                            best = { distance: along, point: point.clone(), on: "points", object }
                        }
                    }
                }
            } else if (object.isMesh && !object.isLineSegments2) {
                meshes.push(object)
            }
            for (const child of object.children) {
                visit(child)
            }
        }
        this.scene.updateMatrixWorld()
        visit(this.scene)
        const hit = raycaster.intersectObjects(meshes, false)[0]
        if (hit && (!best || hit.distance < best.distance)) {
            best = { distance: hit.distance, point: hit.point.clone(), on: "mesh", object: hit.object }
        }
        if (best) {
            return { point: best.point, on: best.on, object: best.object }
        }
        const ground = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())
        return ground ? { point: ground, on: "ground" } : null
    }

    /** Looks at `target` from the current direction, `distance` away (from straight above: the default 3/4 view). */
    frame(target, distance) {
        const direction = this.camera.position.clone().sub(this.controls.target).normalize()
        if (!Number.isFinite(direction.x) || direction.lengthSq() === 0 || direction.z > 0.97) {
            direction.set(-1, -1, 0.9).normalize()
        }
        this.#place(target, target.clone().addScaledVector(direction, distance))
    }

    /** Frames everything drawn (dataBounds); false when nothing is drawn. */
    frameAll() {
        const box = this.dataBounds()
        if (!box) {
            return false
        }
        const size = box.getSize(new THREE.Vector3()).length()
        this.frame(box.getCenter(new THREE.Vector3()), Math.max(2, size * 0.9))
        return true
    }

    /**
     * Straight down on the area around `center` (the drawn data within 15 m of it, 12-30 m across), or without one on
     * everything drawn (or the origin).
     */
    topDownAround(center) {
        const bounds = this.dataBounds()
        if (center) {
            let extent = 20
            if (bounds) {
                const near = bounds
                    .clone()
                    .intersect(new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(30, 30, 1e6)))
                if (!near.isEmpty()) {
                    const size = near.getSize(new THREE.Vector3())
                    extent = THREE.MathUtils.clamp(Math.max(size.x, size.y), 12, 30)
                }
            }
            this.topDown(center.clone(), extent)
        } else if (bounds) {
            const size = bounds.getSize(new THREE.Vector3())
            const middle = bounds.getCenter(new THREE.Vector3())
            this.topDown(middle.setZ(bounds.min.z), THREE.MathUtils.clamp(Math.max(size.x, size.y), 6, 400))
        } else {
            this.topDown(new THREE.Vector3(), 20)
        }
    }

    /** Straight down onto `target` from high enough that `extent` meters fit the shorter side of the view. */
    topDown(target, extent) {
        const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2
        const fit = Math.min(1, this.camera.aspect)
        const height = (extent / 2 / Math.tan(halfFov) / fit) * 1.1
        // a hair south of overhead, so "up" on screen is +y
        this.#place(target, new THREE.Vector3(target.x, target.y - height * 0.002, target.z + height))
    }

    /** Puts the camera at `position` looking at `target` now (no leftover damping, no follow glide). */
    #place(target, position) {
        const controls = this.controls
        controls._sphericalDelta?.set(0, 0, 0)
        controls._panOffset?.set(0, 0, 0)
        if (controls._scale !== undefined) {
            controls._scale = 1
        }
        this.controls.target.copy(target)
        this.camera.position.copy(position)
        this.camera.lookAt(target)
        this.controls.update()
        this.#following = false
        this.#follow.reset()
        this.requestRender()
    }

    /** Stops following until `resumeFollow()`: the camera stays where it is. */
    pauseFollow() {
        if (!this.followPaused.get().paused) {
            this.followPaused.set({ paused: true })
        }
    }

    /** Follows again: the followed point glides back to the middle, angle and zoom kept. */
    resumeFollow() {
        this.#catchingUp = true
        this.#following = false
        this.#follow.reset()
        if (this.followPaused.get().paused) {
            this.followPaused.set({ paused: false })
        }
        this.requestRender()
    }

    /**
     * Where the drawn data is (point clouds and meshes, not the grid or helpers): the 2nd-98th percentile box of a
     * sample of their points. Null when nothing is drawn.
     * @returns {THREE.Box3 | null}
     */
    dataBounds() {
        const xs = [],
            ys = [],
            zs = []
        const point = new THREE.Vector3()
        this.scene.updateMatrixWorld()
        this.scene.traverseVisible((object) => {
            const drawn = object.isPoints || (object.isMesh && !object.isLineSegments2)
            if (!drawn || object.userData.noPick) {
                return
            }
            const geometry = object.geometry
            const position = geometry?.getAttribute("position")
            if (!position) {
                return
            }
            const start = geometry.drawRange.start
            const end = Math.min(position.count, start + geometry.drawRange.count)
            const stride = Math.max(1, Math.floor((end - start) / 20000))
            for (let index = start; index < end; index += stride) {
                point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld)
                if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
                    xs.push(point.x)
                    ys.push(point.y)
                    zs.push(point.z)
                }
            }
        })
        if (!xs.length) {
            return null
        }
        const range = (values) => {
            values.sort((a, b) => a - b)
            return [
                values[Math.floor(values.length * 0.02)],
                values[Math.min(values.length - 1, Math.floor(values.length * 0.98))],
            ]
        }
        const [x, y, z] = [range(xs), range(ys), range(zs)]
        return new THREE.Box3(new THREE.Vector3(x[0], y[0], z[0]), new THREE.Vector3(x[1], y[1], z[1]))
    }

    /** devicePixelRatio changes when the window moves between displays or the page is zoomed. */
    #watchPixelRatio() {
        const query = globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio}dppx)`)
        query?.addEventListener(
            "change",
            () => {
                if (this.#disposed) {
                    return
                }
                this.renderer.setPixelRatio(pixelRatio())
                this.#resize()
                this.#watchPixelRatio()
            },
            { once: true },
        )
    }

    #resize() {
        const width = Math.max(1, this.#host.clientWidth)
        const height = Math.max(1, this.#host.clientHeight)
        this.renderer.setSize(width, height)
        this.labels.setSize(width, height)
        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
        this.resolution.set(width, height)
        this.pixelsPerMeter.value =
            (height * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))
        this.requestRender()
    }

    #loop = (now) => {
        if (this.#disposed) {
            return
        }
        this.#frameRequest = requestAnimationFrame(this.#loop)
        const dt = this.#lastFrame ? (now - this.#lastFrame) / 1000 : 0
        this.#lastFrame = now
        const reduced = !!this.#reducedMotion?.matches
        const following = !!this.followTarget && !this.followPaused.get().paused
        if (following) {
            const target = this.followTarget
            if (reduced) {
                this.#follow.reset()
            }
            const [x, y, z] = this.#follow.step([target.x, target.y, target.z], dt)
            if (this.#catchingUp) {
                const gap = this.#followDelta.set(x, y, z).sub(this.controls.target)
                if (!reduced && gap.length() > 1e-3) {
                    gap.multiplyScalar(1 - Math.exp(-dt / CATCH_UP_SECONDS))
                } else {
                    this.#catchingUp = false
                }
                this.camera.position.add(gap)
                this.controls.target.add(gap)
                this.#dirty = true
            } else if (this.#following) {
                const delta = this.#followDelta.set(x, y, z).sub(this.#lastFollow)
                if (delta.lengthSq() > 1e-10) {
                    this.camera.position.add(delta)
                    this.controls.target.add(delta)
                    this.#dirty = true
                }
            } else {
                // starting to follow: bring the target onto the followed point
                this.#catchingUp = true
            }
            this.#lastFollow.set(x, y, z)
            this.#following = true
        } else {
            this.#following = false
            this.#follow.reset()
        }
        focusDistance.value = this.camera.position.distanceTo(this.controls.target)
        this.#beforeControls.copy(this.controls.target)
        if (this.controls.update()) {
            this.#dirty = true
        }
        // orbit and zoom keep following; a pan (right-drag, shift-drag, two fingers) stops it
        const pan = this.#pan.copy(this.controls.target).sub(this.#beforeControls)
        if (following && pan.lengthSq() > 0) {
            const verdict = this.#panGate.step([pan.x, pan.y, pan.z], focusDistance.value)
            if (verdict.action === "pause") {
                const [x, y, z] = verdict.restore
                this.controls.target.add(this.#followDelta.set(x, y, z))
                this.camera.position.add(this.#followDelta)
                this.#catchingUp = false
                this.pauseFollow()
            } else {
                this.controls.target.sub(pan)
                this.camera.position.sub(pan)
            }
        }
        const started = performance.now()
        const info = { now, dataNow: this.dataClock(), fixedFrame: this.fixedFrame, camera: this.camera }
        for (const listener of this.#listeners) {
            try {
                listener(info)
            } catch (error) {
                console.error("[dimos-react] scene frame listener threw", error)
            }
        }
        if (this.#dirty && !this.paused) {
            this.#dirty = false
            this.renderer.render(this.scene, this.camera)
            this.labels.render(this.scene, this.camera)
            if (now - this.#lastDeclutter > 150) {
                this.#lastDeclutter = now
                this.#declutter()
            }
            const drawn = performance.now()
            if (this.#pendingData.length) {
                const clockNow = this.#clock()
                for (const data of this.#pendingData) {
                    this.#latencies.push(clockNow - data.ts)
                    this.#arrivals.push(drawn - data.arrival)
                }
                this.#pendingData.length = 0
            }
            this.#cpuTimes.push(drawn - started)
        }
        this.#frameTimes.push(now)
        if (now - this.#lastStats > 1000) {
            this.#publishStats(now)
        }
    }

    #publishStats(now) {
        const percentile = (values, p) => {
            if (!values.length) {
                return null
            }
            const sorted = [...values].sort((a, b) => a - b)
            return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
        }
        const span = (now - this.#lastStats) / 1000
        let points = 0
        let splats = false
        this.scene.traverseVisible((object) => {
            if (object.isPoints) {
                splats ||= "SPLAT" in (object.material.defines ?? {})
                const geometry = object.geometry
                points += Math.min(geometry.drawRange.count, geometry.getAttribute("position")?.count ?? 0)
            }
        })
        this.stats.set({
            fps: Math.round(this.#frameTimes.length / span),
            frameMs: this.#cpuTimes.length ? this.#cpuTimes.reduce((a, b) => a + b, 0) / this.#cpuTimes.length : 0,
            latencyP50: percentile(this.#latencies, 0.5),
            latencyP95: percentile(this.#latencies, 0.95),
            arrivalToFrameMs: percentile(this.#arrivals, 0.5),
            drawCalls: this.renderer.info.render.calls,
            points,
        })
        // splats that can't keep up for 3 s in a row are drawn as cubes instead (splatFallback; clear it to retry)
        const times = this.#frameTimes
        const frameMs = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 0
        this.#slowSeconds = splats && frameMs > FRAME_BUDGET_MS * 1.25 ? this.#slowSeconds + 1 : 0
        if (this.#slowSeconds >= 3 && !splatFallback.get().active) {
            splatFallback.set({ active: true, frameMs })
        }
        this.#frameTimes.length = 0
        this.#cpuTimes.length = 0
        this.#latencies.length = 0
        this.#arrivals.length = 0
        this.#lastStats = now
    }

    /** Stops the loop and frees the GPU context and DOM. */
    dispose() {
        this.#disposed = true
        cancelAnimationFrame(this.#frameRequest)
        this.#resizeObserver.disconnect()
        this.controls.dispose()
        this.#grid?.geometry.dispose()
        this.#grid?.material.dispose()
        this.renderer.dispose()
        this.renderer.forceContextLoss?.()
        this.renderer.domElement.remove()
        this.labels.domElement.remove()
        this.#listeners.clear()
        this.#resetListeners.clear()
    }
}
