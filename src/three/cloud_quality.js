// Point-cloud presets: the bandwidth-vs-detail tradeoff, per cloud and per viewer, as gateway subscription options
// (zenoh-dimos-codecs' dimos_lcm_pointcloud2 thins to 1 point in round(1/quality), at most 1 in 16, and quantizes to
// int16; `encodeOptions.quality` caps what the bandwidth allocator may pick, `minQuality` floors it). Per viewer (a
// phone on cellular wants less than a desktop on the LAN): localStorage.
import { readLocal, Store, writeLocal } from "./store.js"

/**
 * @typedef {"low" | "balanced" | "full"} CloudQuality
 * @typedef {{ id: CloudQuality, label: string, about: string, maxHz: number, quality: number, minQuality?: number }} CloudPreset
 * @typedef {{ hz: number, pointsPerSecond: number, bytesPerSecond: number }} CloudRate
 */

/** @type {CloudPreset[]} */
export const CLOUD_PRESETS = [
    {
        id: "low",
        label: "Low bandwidth",
        about: "up to 5 Hz, at most 1 point in 4 (fewer when the link is short)",
        maxHz: 5,
        quality: 0.25,
    },
    {
        id: "balanced",
        label: "Balanced",
        about: "up to 20 Hz, every point unless the link is short",
        maxHz: 20,
        quality: 1,
    },
    {
        id: "full",
        label: "Full",
        about: "up to 30 Hz, every point, never thinned (drops scans instead)",
        maxHz: 30,
        quality: 1,
        minQuality: 1,
    },
]

/** @returns {CloudPreset} */
export const cloudPreset = (id) => CLOUD_PRESETS.find((preset) => preset.id === id) ?? CLOUD_PRESETS[1]

/** The gateway subscription for a cloud at a preset. */
export function cloudOptions(preset) {
    return {
        delivery: "latest",
        encoding: "dimos_lcm_pointcloud2",
        maxHz: preset.maxHz,
        encodeOptions: { quality: preset.quality },
        ...(preset.minQuality !== undefined ? { minQuality: preset.minQuality } : {}),
    }
}

/** What changes going to `to` (zenoh-gateway >= 0.5.1's Subscription.update: null removes an option). */
export function cloudChanges(to) {
    return { maxHz: to.maxHz, minQuality: to.minQuality ?? null, encodeOptions: { quality: to.quality } }
}

const QUALITY_KEY = "dimos-react.clouds.quality"

/** topic key → this viewer's preset (missing = Balanced) */
export const cloudQualities = new Store(readLocal(QUALITY_KEY, {}))

export function setCloudQuality(key, quality) {
    cloudQualities.update({ [key]: quality })
    writeLocal(QUALITY_KEY, cloudQualities.get())
}

/** @returns {CloudQuality} */
export const cloudQualityOf = (key) => cloudPreset(cloudQualities.get()[key]).id

/** topic key → live rate of each cloud being drawn (gone when it stops) */
export const cloudRates = new Store({})

export function setCloudRate(key, rate) {
    const next = { ...cloudRates.get() }
    if (rate) {
        next[key] = rate
    } else {
        delete next[key]
    }
    cloudRates.set(next)
}

/**
 * One cloud's subscription at its preset: a preset change updates it in place where the gateway can (else opens the
 * new one, then closes the old), and it counts what arrives.
 */
export class CloudStream {
    #stop
    #preset
    #closed = false
    #counted = { scans: 0, points: 0, bytes: 0, since: 0 }

    /**
     * @param {{ subscribe: Function }} source a data source
     * @param {string} key
     * @param {CloudQuality} quality
     * @param {(message: any) => void} onMessage
     */
    constructor(source, key, quality, onMessage, now = performance.now()) {
        this.source = source
        this.key = key
        this.onMessage = onMessage
        this.#preset = cloudPreset(quality)
        this.#counted.since = now
        this.#stop = this.#open()
    }

    get quality() {
        return this.#preset.id
    }

    #open() {
        return this.source.subscribe(this.key, cloudOptions(this.#preset), (message) => {
            const positions = message.decoded?.positions ?? message.value?.positions
            this.#counted.scans++
            this.#counted.points += positions ? positions.length / 3 : 0
            this.#counted.bytes += message.bytes?.byteLength ?? 0
            this.onMessage(message)
        })
    }

    async setQuality(quality) {
        const preset = cloudPreset(quality)
        if (this.#closed || preset.id === this.#preset.id) {
            return
        }
        this.#preset = preset
        const handle = this.#stop
        if (handle.update) {
            try {
                await handle.update(cloudChanges(preset))
                return
            } catch {
                // a gateway without in-place updates: resubscribe below
            }
        }
        if (this.#closed || this.#stop !== handle || this.#preset !== preset) {
            return
        }
        this.#stop = this.#open()
        handle()
    }

    /** scans, points and bytes a second since the last call @returns {CloudRate} */
    sample(now = performance.now()) {
        const seconds = Math.max(1e-3, (now - this.#counted.since) / 1000)
        const rate = {
            hz: this.#counted.scans / seconds,
            pointsPerSecond: this.#counted.points / seconds,
            bytesPerSecond: this.#counted.bytes / seconds,
        }
        this.#counted = { scans: 0, points: 0, bytes: 0, since: now }
        return rate
    }

    close() {
        this.#closed = true
        this.#stop()
    }
}

export const formatCount = (count) =>
    count >= 1e6
        ? `${(count / 1e6).toFixed(1)}M`
        : count >= 1000
        ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
        : String(Math.round(count))

export const formatBytes = (bytes) =>
    bytes >= 1e6
        ? `${(bytes / 1e6).toFixed(1)} MB`
        : bytes >= 1000
        ? `${Math.round(bytes / 1000)} kB`
        : `${Math.round(bytes)} B`
