// Camera streams and views. A color image topic arrives as zenoh-gateway's H.264 video track (sized and paced by a
// latency ↔ quality preset: gateway subscription options), a depth topic losslessly as fields (16UC1 mm / 32FC1 m)
// drawn as a colormap; a panel and a 3D projection of the same topic share one subscription. 2D detections can be drawn
// over any camera. Ported from dim-controller core/video.ts, core/videoQuality.ts, core/cameraChoice.ts.
//
//     h(CameraView, { topic: { key, name, type }, overlay: detectionsTopic, onInfo: (info) => … })
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { cx, h } from "../h.js"
import { useDataSource } from "../data.js"
import { decode as decodeLcm } from "../lcm.js"
import { Store, useStore } from "../three/store.js"
import { drawDetections2D, IMAGE_OVERLAY_TYPES, ImageView, normalizeFrame, rawToImageData } from "./media.js"

// ── latency ↔ quality presets (zenoh-gateway's video policy) ──

/**
 * No preset sets maxHz: zenoh-gateway >= 0.5.1 encodes at min(maxHz, the source's rate), and each wants the camera's
 * own rate. playoutDelay is the browser side: how long the receiver may hold frames to play them out evenly.
 */
export const VIDEO_PRESETS = [
    {
        id: "latency",
        label: "Low latency",
        about:
            "fits 640×360 at the gateway's default bits per pixel; small frames arrive and decode soonest, the rate kept when the link is squeezed",
        options: { maxResolution: [640, 360], qualityToHzTradeoff: 1 },
    },
    {
        id: "balanced",
        label: "Balanced",
        about: "the gateway picks size and bitrate for the bandwidth, at the camera's rate",
        options: {},
    },
    {
        id: "quality",
        label: "High quality",
        about:
            "full size, never shrunk, up to 6 Mbit/s (at least 30% of it); drops frames before detail when the link is squeezed, and the browser buffers 100-400 ms to play frames out evenly",
        options: {
            minResolutionScale: 1,
            maxBitrate: 6_000_000,
            minQuality: 0.3,
            qualityToHzTradeoff: 0,
            playoutDelay: [100, 400],
        },
    },
]

const RENAMED = { auto: "balanced", smooth: "latency", sharp: "quality" }
/** A preset by id (old names map to the nearest one; unknown → Balanced). */
export const videoPreset = (id) =>
    VIDEO_PRESETS.find((preset) => preset.id === (RENAMED[id ?? ""] ?? id)) ?? VIDEO_PRESETS[1]

/** What `Subscription.update` needs to go from one preset to another: the new values, null for what only `from` set. */
export function videoPresetChanges(from, to) {
    const changes = {}
    for (const name of Object.keys(from.options)) {
        changes[name] = null
    }
    return { ...changes, ...to.options }
}

/** Whether options keep the browser in low-latency rendering (playoutDelay min 0, max <= 500 ms; default [0, 0]). */
export function lowLatencyRendering(options) {
    const [min, max] = options.playoutDelay ?? [0, 0]
    return min === 0 && max <= 500
}

/**
 * Whether a change can't be made in place: back to low-latency rendering from a buffered playout. Firefox freezes a
 * receiver for good once its render time drops back to 0, so that takes a fresh subscription (a new receiver).
 */
export const needsNewReceiver = (from, to) => !lowLatencyRendering(from) && lowLatencyRendering(to)

// ── which topics are cameras ──

export const isImageTopic = (topic) =>
    topic.type === "sensor_msgs.Image" || topic.type === "sensor_msgs.CompressedImage"
export const isDepthTopic = (topic) => /depth/i.test(topic.name)

/** The camera to show first: `preferred` topic names in order, else the first color image, else any image. */
export function pickCamera(preferred, topics, exclude = new Set()) {
    const images = topics.filter((topic) => isImageTopic(topic) && !exclude.has(topic.key))
    for (const name of preferred ?? []) {
        const found = images.find((topic) => topic.name === name)
        if (found) {
            return found
        }
    }
    return images.find((topic) => !isDepthTopic(topic)) ?? images[0] ?? null
}

/**
 * Panels (`{ key, picked? }`) pointed at what the bus has: a panel's picked topic when it's back, else a panel whose
 * topic isn't on the bus moves to a default camera no other panel shows. Null when nothing changes.
 */
export function retargetCameras(panels, topics, preferred) {
    const onBus = new Set(topics.filter(isImageTopic).map((topic) => topic.key))
    const used = new Set(panels.filter((panel) => onBus.has(panel.key)).map((panel) => panel.key))
    let changed = false
    const next = panels.map((panel) => {
        if (panel.picked && panel.picked !== panel.key && onBus.has(panel.picked)) {
            changed = true
            used.add(panel.picked)
            return { ...panel, key: panel.picked }
        }
        if (onBus.has(panel.key)) {
            return panel
        }
        const fallback = pickCamera(preferred, topics, used)
        if (!fallback) {
            return panel
        }
        changed = true
        used.add(fallback.key)
        return { ...panel, key: fallback.key }
    })
    return changed ? next : null
}

/** Every image topic as a tab (`{ topic, label, depth }`), color first then depth, labeled by what tells them apart. */
export function cameraTabs(topics) {
    const images = topics.filter(isImageTopic).sort((a, b) =>
        Number(isDepthTopic(a)) - Number(isDepthTopic(b)) || a.name.localeCompare(b.name) ||
        a.type.localeCompare(b.type)
    )
    const split = images.map((topic) => topic.name.split("/").filter(Boolean))
    let shared = 0
    if (split.length > 1) {
        while (split.every((parts) => shared < parts.length - 1 && parts[shared] === split[0][shared])) {
            shared++
        }
    }
    let tail = 0
    if (split.length > 1) {
        const at = (parts) => parts[parts.length - 1 - tail]
        while (split.every((parts) => parts.length - shared - tail > 1 && at(parts) === at(split[0]))) {
            tail++
        }
    }
    const labels = split.map((parts) => parts.slice(shared, parts.length - tail).join("/"))
    return images.map((topic, index) => {
        const twin = labels.some((label, other) => other !== index && label === labels[index])
        return {
            topic,
            label: twin ? `${labels[index]} (${topic.type.split(".").pop()})` : labels[index],
            depth: isDepthTopic(topic),
        }
    })
}

/** The CameraInfo topic for an image topic: `overrides[name]`, else the one sharing the longest leading part of the name. */
export function cameraInfoFor(image, topics, overrides = {}) {
    const infos = topics.filter((topic) => topic.type === "sensor_msgs.CameraInfo")
    const wanted = overrides[image.name]
    if (wanted) {
        return infos.find((topic) => topic.name === wanted) ?? null
    }
    const parts = image.name.split("/")
    let best = null
    let bestScore = -1
    for (const info of infos) {
        const other = info.name.split("/")
        let shared = 0
        while (shared < Math.min(parts.length, other.length) - 1 && parts[shared] === other[shared]) {
            shared++
        }
        const score = shared * 10 + (/color|rgb/i.test(image.name) === /color|rgb/i.test(info.name) ? 1 : 0)
        if (score > bestScore) {
            best = info
            bestScore = score
        }
    }
    return best
}

// ── shared streams ──

const readLocal = (key, fallback) => {
    try {
        const raw = globalThis.localStorage?.getItem(key)
        return raw ? JSON.parse(raw) : fallback
    } catch {
        return fallback
    }
}
const writeLocal = (key, value) => {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
        // storage unavailable: lasts for this page
    }
}

/**
 * The page's camera subscriptions over a data source, shared and counted: `acquire(topic)` → `{ video, depth, quality }`
 * stores (video: `{ stream, width, height, fps }`, depth: `{ image }`), `release(topic)`, `setQuality(topic, id)`
 * (this viewer's preset per topic, in localStorage under `storageKey`), `element(handle)` (a playing <video> for
 * textures). A source that delivers images itself (a replay) sends `{ width, height, encoding, data }` (depth),
 * `{ bitmap | image, width, height }` (color), a frame (`{ kind, width, height, encoding, data }`, jpeg/png/webp or raw
 * pixels), a decoded sensor_msgs.Image / CompressedImage, or the LCM bytes of one: frames are decoded here (newest wins)
 * into `video.image` (an ImageBitmap or ImageData).
 */
export class CameraStreams {
    #sources = new Map()
    constructor(source, { storageKey = "dr.video.quality" } = {}) {
        this.source = source
        this.storageKey = storageKey
    }

    qualityOf(key) {
        return videoPreset(readLocal(this.storageKey, {})[key]).id
    }

    acquire(topic) {
        let handle = this.#sources.get(topic.key)
        if (handle) {
            handle.users++
            return handle
        }
        handle = {
            users: 1,
            stop: () => {},
            video: new Store({ stream: null, image: null, width: 0, height: 0, fps: 0 }),
            depth: new Store({ image: null }),
            quality: new Store({ quality: isDepthTopic(topic) ? "balanced" : this.qualityOf(topic.key) }),
            element: null,
            ticket: 0,
            newest: 0,
        }
        this.#open(topic, handle)
        this.#sources.set(topic.key, handle)
        return handle
    }

    #open(topic, handle) {
        const { video, depth } = handle
        const prefix = topic.type === "sensor_msgs.CompressedImage" ? "dimos_lcm_compressed_" : "dimos_lcm_"
        let frames = 0
        let since = performance.now()
        const fpsNow = (state) => {
            frames++
            const now = performance.now()
            if (now - since > 1000) {
                const fps = Math.round((frames * 1000) / (now - since))
                frames = 0
                since = now
                return fps
            }
            return state.fps
        }
        if (isDepthTopic(topic)) {
            handle.stop = this.source.subscribe(
                topic.key,
                { delivery: "latest", maxHz: 15, encoding: `${prefix}depth` },
                (message) => {
                    const image = message.decoded ?? message.value ?? lcmValue(message, topic.type)
                    if (image?.data) {
                        depth.set({ image })
                    }
                },
            )
            return
        }
        handle.stop = this.source.subscribe(
            topic.key,
            { delivery: "latest", ...videoPreset(handle.quality.get().quality).options, encoding: `${prefix}image` },
            async (message) => {
                let decoded = message.decoded ?? message.value ??
                    (message.mediaStream ? null : lcmValue(message, topic.type))
                if (!message.mediaStream && decoded && !decoded.bitmap && !decoded.image) {
                    // a replay's frame: decoded here, and a slower older one must not replace a newer one
                    const mine = ++handle.ticket
                    const picture = await framePicture(decoded)
                    if (!picture || mine < handle.newest) {
                        return
                    }
                    handle.newest = mine
                    decoded = { image: picture, width: picture.width, height: picture.height }
                }
                const state = video.get()
                const picture = decoded?.bitmap ?? decoded?.image ?? null
                const width = message.video?.width ?? decoded?.width ?? state.width
                const height = message.video?.height ?? decoded?.height ?? state.height
                const fps = fpsNow(state)
                const stream = message.mediaStream ?? state.stream
                if (
                    stream !== state.stream || picture !== state.image || width !== state.width ||
                    height !== state.height || fps !== state.fps
                ) {
                    video.set({ stream, image: picture, width, height, fps })
                }
            },
        )
    }

    /**
     * Another preset for a color topic: saved for this viewer, and the running subscription takes it in place; a
     * gateway that refuses, or a change back to low-latency rendering, gets a fresh subscription instead.
     */
    setQuality(topic, quality) {
        writeLocal(this.storageKey, { ...readLocal(this.storageKey, {}), [topic.key]: quality })
        const handle = this.#sources.get(topic.key)
        const previous = handle?.quality.get().quality
        if (!handle || isDepthTopic(topic) || previous === quality) {
            return
        }
        handle.quality.set({ quality })
        const subscription = handle.stop
        const reopen = () => {
            if (handle.stop === subscription && handle.quality.get().quality === quality) {
                subscription()
                this.#open(topic, handle)
            }
        }
        const from = videoPreset(previous)
        const to = videoPreset(quality)
        if (!subscription.update || needsNewReceiver(from.options, to.options)) {
            return reopen()
        }
        subscription.update(videoPresetChanges(from, to)).catch((error) => {
            console.warn(
                `[dimos-react] ${topic.name}: the gateway refused a preset update (${error?.message ?? error})`,
            )
            reopen()
        })
    }

    /** A muted, playing <video> of the stream (not in the document), e.g. for a three.js VideoTexture. */
    element(handle) {
        if (!handle.element) {
            const element = document.createElement("video")
            element.muted = true
            element.playsInline = true
            element.autoplay = true
            element.setAttribute("disablepictureinpicture", "")
            element.setAttribute("disableremoteplayback", "")
            const attach = () => {
                const stream = handle.video.get().stream
                if (stream && element.srcObject !== stream) {
                    element.srcObject = stream
                    element.play().catch(() => {})
                }
            }
            handle.video.subscribe(attach)
            attach()
            handle.element = element
        }
        return handle.element
    }

    release(topic) {
        const handle = this.#sources.get(topic.key)
        if (!handle || --handle.users > 0) {
            return
        }
        handle.stop()
        handle.element?.pause()
        if (handle.element) {
            handle.element.srcObject = null
        }
        this.#sources.delete(topic.key)
    }
}

/** A message's LCM payload decoded as `type` (null when it isn't one). */
function lcmValue(message, type) {
    if (!message.bytes || !type) {
        return null
    }
    try {
        return decodeLcm(type, message.bytes)
    } catch {
        return null
    }
}

/** A frame → ImageBitmap (jpeg/png/webp) or ImageData (raw pixels), or null. */
async function framePicture(value) {
    const frame = normalizeFrame(value)
    if (!frame || frame.kind === "depth") {
        return null
    }
    if (frame.kind === "encoded") {
        try {
            return await createImageBitmap(new Blob([frame.data], { type: `image/${frame.format}` }))
        } catch {
            return null
        }
    }
    return rawToImageData(frame)
}

const StreamsContext = createContext(null)
const sharedStreams = new WeakMap()

/** The shared CameraStreams of a data source (what useCameraStreams gives without a provider; the 3D view's too). */
export function cameraStreamsFor(source) {
    let streams = sharedStreams.get(source)
    if (!streams) {
        streams = new CameraStreams(source)
        sharedStreams.set(source, streams)
    }
    return streams
}

/** Makes `streams` (a CameraStreams, e.g. with the app's own storageKey) the one every CameraView below uses. */
export function CameraStreamsProvider({ streams, children }) {
    return h(StreamsContext.Provider, { value: streams }, children)
}

/** The page's CameraStreams for the current data source (the nearest CameraStreamsProvider's, else one per source). */
export function useCameraStreams() {
    const given = useContext(StreamsContext)
    const source = useDataSource()
    return useMemo(() => {
        return given ?? cameraStreamsFor(source)
    }, [given, source])
}

/** A topic's stream handle while mounted (null topic: none). */
export function useCameraStream(topic) {
    const streams = useCameraStreams()
    const [handle, setHandle] = useState(null)
    useEffect(() => {
        if (!topic) {
            setHandle(null)
            return
        }
        const acquired = streams.acquire(topic)
        setHandle(acquired)
        return () => streams.release(topic)
    }, [streams, topic?.key])
    return handle
}

const idleStore = new Store({ quality: "balanced" })
/** A color topic's preset as the shared stream has it, and a setter (saved for this viewer). */
export function useVideoQuality(topic) {
    const streams = useCameraStreams()
    const handle = useCameraStream(topic && !isDepthTopic(topic) ? topic : null)
    const { quality } = useStore(handle?.quality ?? idleStore)
    return [quality, (next) => topic && streams.setQuality(topic, next)]
}

// ── views ──

/**
 * A camera topic's live picture filling its positioned parent. On Desktop's zenoh-gateway a color topic is the
 * gateway's video track (this viewer's latency ↔ quality preset, `useVideoQuality`); a depth topic, or any topic from
 * another source (a replay delivering frames), is drawn by ImageView (depth through a colormap). `overlay`: a 2D
 * detection topic drawn over it; `fill` crops to cover instead of letterboxing; `depthLook` `{ colormap, near, far }`
 * (null near/far = automatic); `onInfo({ width, height, fps, range })`.
 * @param {{ topic: { key: string, name: string, type: string } | null, overlay?: { key: string, type: string } | null,
 *   fill?: boolean, depthLook?: object, onInfo?: (info: object) => void, className?: string, children?: any }} props
 */
export function CameraView({ topic, overlay, fill = false, depthLook = {}, onInfo, className, children }) {
    const source = useDataSource()
    const depth = topic ? isDepthTopic(topic) : false
    const video = source.kind === "zenoh" && topic && !depth
    if (!topic) {
        return h(
            "div",
            { className: cx("dr-camera", className) },
            h("div", { className: "dr-camera-empty" }, "no camera"),
            children,
        )
    }
    if (!video) {
        const prefix = topic.type === "sensor_msgs.CompressedImage" ? "dimos_lcm_compressed_" : "dimos_lcm_"
        return h(ImageView, {
            key: topic.key,
            topic: topic.key,
            encoding: source.kind === "zenoh" ? `${prefix}depth` : undefined,
            maxHz: depth ? 15 : 30,
            depth: depth || undefined,
            colormap: depthLook.colormap ?? "turbo",
            near: depthLook.near ?? null,
            far: depthLook.far ?? null,
            fit: fill ? "cover" : "contain",
            overlayTopic: overlay && IMAGE_OVERLAY_TYPES.includes(overlay.type) ? overlay.key : null,
            onInfo: onInfo
                ? (info) => onInfo({ width: info.width, height: info.height, fps: info.fps, range: info.range })
                : undefined,
            className: cx("dr-camera", className),
        }, children)
    }
    return h(VideoView, { topic, overlay, fill, onInfo, className }, children)
}

function VideoView({ topic, overlay, fill, onInfo, className, children }) {
    const source = useDataSource()
    const handle = useCameraStream(topic)
    const video = useRef(null)
    const overlayCanvas = useRef(null)
    const info = useRef({ width: 0, height: 0, fps: 0, range: null })
    const report = useRef(onInfo)
    report.current = onInfo
    useEffect(() => {
        if (!handle) {
            return
        }
        const apply = () => {
            const state = handle.video.get()
            if (video.current && state.stream && video.current.srcObject !== state.stream) {
                video.current.srcObject = state.stream
                video.current.play().catch(() => {})
            }
            const old = info.current
            if (state.width !== old.width || state.height !== old.height || state.fps !== old.fps) {
                info.current = { width: state.width, height: state.height, fps: state.fps, range: null }
                report.current?.(info.current)
            }
        }
        apply()
        return handle.video.subscribe(apply)
    }, [handle])
    useEffect(() => {
        const canvas = overlayCanvas.current
        const clear = () => canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
        if (!overlay || !canvas || !IMAGE_OVERLAY_TYPES.includes(overlay.type)) {
            clear()
            return
        }
        const off = source.subscribe(overlay.key, { delivery: "latest", maxHz: 30 }, (message) => {
            const width = info.current.width || canvas.width
            const height = info.current.height || canvas.height
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width
                canvas.height = height
            }
            clear()
            try {
                drawDetections2D(canvas.getContext("2d"), message.value ?? decodeLcm(overlay.type, message.bytes))
            } catch {
                // a message it can't read: blank
            }
        })
        return () => {
            off()
            clear()
        }
    }, [source, overlay?.key])
    return h(
        "div",
        { className: cx("dr-camera", fill && "dr-camera--fill", className) },
        h("video", {
            ref: video,
            className: "dr-camera-media",
            muted: true,
            playsInline: true,
            autoPlay: true,
            disablePictureInPicture: true,
            disableRemotePlayback: true,
        }),
        h("canvas", { ref: overlayCanvas, className: "dr-camera-overlay" }),
        children,
    )
}

/**
 * Tabs for the image topics on the bus (a panel header's camera picker). `value`: the shown topic key; `gone`: a
 * label for a picked topic that isn't on the bus.
 * @param {{ topics: any[], value: string, onChange: (topic: any) => void, gone?: string | null, className?: string }} props
 */
export function CameraTabs({ topics, value, onChange, gone, className }) {
    const tabs = cameraTabs(topics)
    const row = useRef(null)
    useEffect(() => {
        const tab = row.current?.querySelector("[aria-selected=true]")
        const element = row.current
        if (
            tab && element &&
            (tab.offsetLeft < element.scrollLeft ||
                tab.offsetLeft + tab.offsetWidth > element.scrollLeft + element.clientWidth)
        ) {
            element.scrollLeft = tab.offsetLeft - 6
        }
    }, [value, topics.length])
    return h(
        "div",
        {
            ref: row,
            className: cx("dr-camera-tabs", className),
            role: "tablist",
            "aria-label": "Cameras",
            onWheel: (event) => (event.currentTarget.scrollLeft += event.deltaY),
        },
        gone ? h("span", { className: "dr-camera-tab dr-camera-tab--gone", title: gone }, gone) : null,
        tabs.map((tab) =>
            h("button", {
                key: tab.topic.key,
                type: "button",
                role: "tab",
                "aria-selected": tab.topic.key === value,
                className: cx("dr-camera-tab", tab.depth && "dr-camera-tab--depth"),
                title: `${tab.topic.name} (${tab.topic.type})`,
                onClick: () => onChange(tab.topic),
            }, tab.label)
        ),
        !tabs.length && !gone
            ? h("span", { className: "dr-camera-tab dr-camera-tab--gone" }, "no camera on the bus")
            : null,
    )
}
