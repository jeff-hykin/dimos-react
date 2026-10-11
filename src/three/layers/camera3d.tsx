// sensor_msgs.Image / CompressedImage in 3D: the camera's frustum, with the picture on its far plane, placed at the
// camera's TF frame. Intrinsics come from the matching CameraInfo topic (or a 70° guess without one). The picture is
// the shared camera stream (CameraStreams): a live H.264 track as a video texture, a replay's frames (an ImageBitmap /
// ImageData) drawn into a canvas texture, depth as a GPU heat map.
import * as THREE from "three"
import { h } from "../../h.js"
import { useStore } from "../store.js"
import { headerFrameId } from "../../lcm.js"
import { themeColors } from "../../theme/theme.js"
import { cameraInfoFor, isDepthTopic } from "../../components/camera.js"
import { DEPTH_COLORMAPS } from "../../components/media.js"
import { FatLines } from "../lines.js"
import { cssColor } from "../robot_model.js"
import { DepthMaterial } from "../../camera/depth.js"
import { placeLayer, registerLayer, subscribeDecoded } from "./registry.js"
import { RangeInput } from "../look_editor.js"
import { Field, Select, Slider, Toggle } from "../../components/controls.js"

/**
 * @typedef {{ distance: number, opacity: number, image: boolean, frustum: boolean,
 *   convention: "auto" | "optical" | "body", depth: { colormap: string, near: number | null, far: number | null } }} Camera3dSettings
 *   `distance`: meters from the camera to the picture; `convention` "optical": z forward, x right, y down (ROS
 *   *_optical_frame), "body": x forward, y left, z up
 */

export const DEFAULT_DEPTH_LOOK = { colormap: "turbo", near: null, far: null }

// optical (x right, y down, z forward) → body (x forward, y left, z up)
const OPTICAL_TO_BODY = new THREE.Matrix4().set(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1)

function guess(width, height) {
    const fx = width / 2 / Math.tan(THREE.MathUtils.degToRad(70) / 2)
    return { width, height, fx, fy: fx, cx: width / 2, cy: height / 2 }
}

export class Camera3dLayer {
    root = new THREE.Group()
    #content = new THREE.Group()
    #plane
    #picture = null
    #depth = null
    #depthSize = [0, 0]
    #frustum
    #texture = null
    #textureOf = null
    #canvas = null
    #frame = null
    #intrinsics = null
    #infoKey = ""
    #stopInfo = null
    #stopFrame = null
    #stops = []
    #camera
    #element = null
    #videoCallback = 0
    #lastShape = ""
    #checkedInfoAt = 0

    constructor(context, topic, settings) {
        this.context = context
        this.topic = topic
        this.settings = settings
        this.#content.matrixAutoUpdate = false
        // a floating camera picture is not a place: picks go through it
        this.#content.userData.noPick = true
        this.root.add(this.#content)
        this.#frustum = new FatLines(context.viewer.resolution, {
            width: 1.5,
            color: cssColor(themeColors().warn, "yellow"),
        })
        this.#camera = context.video.acquire(topic)
        if (isDepthTopic(topic)) {
            this.#depth = new DepthMaterial()
            this.#plane = new THREE.Mesh(new THREE.BufferGeometry(), this.#depth.material)
            this.#stops.push(this.#camera.depth.subscribe(() => {
                const image = this.#camera.depth.get().image
                if (image && this.#depth) {
                    this.#depthSize = [image.width, image.height]
                    this.#depth.update(image, this.settings.get().depth ?? DEFAULT_DEPTH_LOOK)
                    this.#reshape(false)
                    context.viewer.requestRender()
                }
            }))
        } else {
            this.#picture = new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                toneMapped: false,
            })
            this.#plane = new THREE.Mesh(new THREE.BufferGeometry(), this.#picture)
            this.#stops.push(this.#camera.video.subscribe(() => this.#onVideo()))
            this.#onVideo()
        }
        this.#content.add(this.#plane, this.#frustum.object)
        this.#stops.push(settings.subscribe(() => this.#reshape(true)))
        this.#findInfo()
    }

    /** a live stream → a video texture (each decoded frame asks for a redraw); a replay canvas → a canvas texture */
    #onVideo() {
        const state = this.#camera.video.get()
        if (state.stream) {
            if (this.#textureOf !== state.stream) {
                this.#textureOf = state.stream
                this.#texture?.dispose()
                const element = this.context.video.element(this.#camera)
                this.#element = element
                this.#texture = new THREE.VideoTexture(element)
                this.#texture.colorSpace = THREE.SRGBColorSpace
                this.#picture.map = this.#texture
                this.#picture.needsUpdate = true
                const onVideoFrame = () => {
                    this.context.viewer.requestRender()
                    this.#videoCallback = element.requestVideoFrameCallback(onVideoFrame)
                }
                this.#videoCallback = element.requestVideoFrameCallback?.(onVideoFrame) ?? 0
            }
        } else if (state.image) {
            // a replay's frame: drawn into this layer's canvas, re-uploaded per frame
            const image = state.image
            this.#canvas ??= document.createElement("canvas")
            const canvas = this.#canvas
            const shape = `${image.width}x${image.height}`
            if (canvas.width !== image.width || canvas.height !== image.height) {
                canvas.width = image.width
                canvas.height = image.height
            }
            const context2d = canvas.getContext("2d")
            if (image instanceof ImageData) {
                context2d.putImageData(image, 0, 0)
            } else {
                context2d.drawImage(image, 0, 0)
            }
            if (this.#textureOf !== shape) {
                // a new size needs a new GPU texture
                this.#textureOf = shape
                this.#texture?.dispose()
                this.#texture = new THREE.CanvasTexture(canvas)
                this.#texture.colorSpace = THREE.SRGBColorSpace
                this.#picture.map = this.#texture
                this.#picture.needsUpdate = true
            }
            this.#texture.needsUpdate = true
        } else {
            return
        }
        this.#reshape(false)
        this.context.viewer.requestRender()
    }

    /**
     * The image's own frame comes from one raw image; intrinsics from the CameraInfo whose frame_id is that frame.
     * Several cameras can share one CameraInfo topic (Spot publishes all five on one port), so every info topic is
     * read and only messages for this camera's frame are used; the name-matched topic is the fallback when either
     * side has no frame_id.
     */
    #findInfo() {
        this.#checkedInfoAt = performance.now()
        if (this.#frame === null && !this.#stopFrame) {
            this.#stopFrame = this.context.source.subscribe(
                this.topic.key,
                { delivery: "latest", maxHz: 1 },
                (message) => {
                    let frame = null
                    const value = message.value ?? message.decoded
                    if (value) {
                        frame = value.frame ?? value.header?.frame_id ?? null
                    } else {
                        try {
                            frame = headerFrameId(this.topic.type, message.bytes)
                        } catch {
                            frame = null
                        }
                    }
                    if (frame === null) {
                        return
                    }
                    this.#frame = frame
                    this.#stopFrame?.()
                    this.#stopFrame = null
                    this.#reshape(false)
                },
            )
        }
        const infos = this.context.topics().filter((topic) => topic.type === "sensor_msgs.CameraInfo")
        const key = infos.map((topic) => topic.key).join(",")
        if (key === this.#infoKey || this.#intrinsics) {
            return
        }
        this.#stopInfo?.()
        this.#infoKey = key
        const named = cameraInfoFor(this.topic, infos, this.context.options?.cameraInfo ?? {})
        const stops = infos.map((info) =>
            subscribeDecoded(this.context, info, { maxHz: 30, reliable: true }, (message) => {
                const K = message.K ?? message.k ?? []
                const infoFrame = message.header?.frame_id ?? ""
                // an image without a frame_id (the go2 sim's) is matched by name and placed at its info's frame
                const mine = infoFrame && this.#frame ? infoFrame === this.#frame : info.key === named?.key
                if (!mine || !message.width || !K[0]) {
                    return
                }
                if (!this.#frame) {
                    this.#frame = infoFrame
                }
                this.#intrinsics = {
                    width: message.width,
                    height: message.height,
                    fx: K[0],
                    fy: K[4],
                    cx: K[2],
                    cy: K[5],
                }
                // intrinsics don't change: stop listening (a shared port is busy)
                this.#stopInfo?.()
                this.#stopInfo = null
                this.#reshape(false)
            })
        )
        this.#stopInfo = () => stops.forEach((stop) => stop())
    }

    #reshape(force) {
        const settings = this.settings.get()
        const video = this.#camera.video.get()
        const [width, height] = this.#depth ? this.#depthSize : [video.width, video.height]
        const intrinsics = this.#intrinsics ?? (width ? guess(width, height) : null)
        if (!intrinsics) {
            return
        }
        const shape = `${JSON.stringify(intrinsics)}/${settings.distance}/${settings.convention}/${this.#frame}`
        if (shape === this.#lastShape && !force) {
            return
        }
        this.#lastShape = shape
        const d = settings.distance
        const corner = (u, v) =>
            new THREE.Vector3(((u - intrinsics.cx) / intrinsics.fx) * d, ((v - intrinsics.cy) / intrinsics.fy) * d, d)
        const corners = [
            corner(0, 0),
            corner(intrinsics.width, 0),
            corner(intrinsics.width, intrinsics.height),
            corner(0, intrinsics.height),
        ]
        const [topLeft, topRight, bottomRight, bottomLeft] = corners
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(corners.flatMap((point) => point.toArray()), 3),
        )
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
        geometry.setIndex([0, 1, 2, 0, 2, 3])
        this.#plane.geometry.dispose()
        this.#plane.geometry = geometry
        if (this.#picture) {
            this.#picture.opacity = settings.opacity
        } else if (this.#depth) {
            this.#depth.material.uniforms.opacity.value = settings.opacity
        }
        this.#plane.visible = settings.image
        this.#frustum.clear()
        for (const point of corners) {
            this.#frustum.push(0, 0, 0, point.x, point.y, point.z)
        }
        for (
            const [a, b] of [[topLeft, topRight], [topRight, bottomRight], [bottomRight, bottomLeft], [
                bottomLeft,
                topLeft,
            ]]
        ) {
            this.#frustum.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
        this.#frustum.commit()
        this.#frustum.object.visible = settings.frustum
        const optical = settings.convention === "optical" ||
            (settings.convention === "auto" && /optical/i.test(this.#frame ?? ""))
        this.#content.matrix.copy(optical ? new THREE.Matrix4() : OPTICAL_TO_BODY)
        this.#content.matrixWorldNeedsUpdate = true
        this.context.setStatus({
            info: `${intrinsics.width}×${intrinsics.height}${this.#intrinsics ? "" : " (no CameraInfo: 70° guess)"} · ${
                optical ? "optical" : "body"
            } frame ${this.#frame || "?"}`,
        })
        this.context.viewer.requestRender()
    }

    update(frame) {
        if (!this.#intrinsics && frame.now - this.#checkedInfoAt > 2000) {
            this.#findInfo()
        }
        if (this.#frame === "" && !this.#intrinsics) {
            // an image with no frame_id is placed by its CameraInfo's frame: it waits for one rather than sit at the origin
            if (this.root.visible) {
                this.root.visible = false
                this.context.viewer.requestRender()
            }
            this.context.setStatus({ problem: "waiting for a CameraInfo (the image has no frame_id)" })
        } else if (this.#frame !== null) {
            if (placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)) {
                this.#reshape(false)
            }
        }
    }

    dispose() {
        this.#element?.cancelVideoFrameCallback?.(this.#videoCallback)
        this.#stops.forEach((stop) => stop())
        this.#depth?.dispose()
        this.#stopInfo?.()
        this.#stopFrame?.()
        this.context.video.release(this.topic)
        this.#texture?.dispose()
        this.#plane.geometry.dispose()
        this.#picture?.dispose()
        this.#frustum.dispose()
    }
}

export function Camera3dSettingsEditor({ settings, topic }) {
    const value = useStore(settings)
    const depth = value.depth ?? DEFAULT_DEPTH_LOOK
    const slider = (label, key, min, max, step, format) =>
        h(
            Field,
            { label },
            h(Slider, {
                min,
                max,
                step,
                value: value[key],
                format,
                onChange: (next) => settings.update({ [key]: next }),
            }),
        )
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            { label: "Picture" },
            h(Toggle, { value: value.image, onChange: (image) => settings.update({ image }) }),
        ),
        h(
            Field,
            { label: "Frustum" },
            h(Toggle, { value: value.frustum, onChange: (frustum) => settings.update({ frustum }) }),
        ),
        slider("Distance", "distance", 0.2, 10, 0.1, (distance) => `${distance.toFixed(1)} m`),
        slider("Opacity", "opacity", 0.1, 1, 0.05, (opacity) => `${Math.round(opacity * 100)}%`),
        topic && isDepthTopic(topic)
            ? [
                h(
                    Field,
                    { label: "Colormap", key: "colormap" },
                    h(Select, {
                        value: depth.colormap,
                        options: DEPTH_COLORMAPS,
                        onChange: (colormap) => settings.update({ depth: { ...depth, colormap } }),
                    }),
                ),
                h(
                    Field,
                    { label: "Range", hint: "meters; empty = automatic (2nd–98th percentile)", key: "range" },
                    h(
                        "span",
                        { className: "dr-range-inputs" },
                        h(RangeInput, {
                            value: depth.near,
                            onChange: (near) => settings.update({ depth: { ...depth, near } }),
                        }),
                        h(RangeInput, {
                            value: depth.far,
                            onChange: (far) => settings.update({ depth: { ...depth, far } }),
                        }),
                    ),
                ),
            ]
            : null,
        h(
            Field,
            { label: "Frame" },
            h(Select, {
                value: value.convention,
                options: [["auto", "auto (by name)"], ["optical", "optical (z forward)"], ["body", "body (x forward)"]],
                onChange: (convention) => settings.update({ convention }),
            }),
        ),
    )
}

registerLayer({
    id: "camera3d",
    label: "Camera in 3D",
    types: ["sensor_msgs.Image", "sensor_msgs.CompressedImage"],
    defaults: {
        distance: 1.5,
        opacity: 0.95,
        image: true,
        frustum: true,
        convention: "auto",
        depth: DEFAULT_DEPTH_LOOK,
    },
    // camera panels show images; projecting one into the scene is opt-in
    enabledByDefault: () => false,
    create: (context, topic, settings) => new Camera3dLayer(context, topic, settings),
    Settings: Camera3dSettingsEditor,
})
