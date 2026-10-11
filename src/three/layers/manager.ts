// One entry per discovered topic that some layer type draws (the Controller's layer list): an enabled entry gets a
// live instance inside <TopicLayers> (subscribed), a disabled one has none (unsubscribed, so it costs no bandwidth).
// Which topics are on and each topic's settings persist through `persist(key, defaults)` (localStorage by default;
// an app that keeps settings in its backend passes its own).
import { parseKey } from "../../data.js"
import { localStore, Store } from "../store.js"
import { defaultSettings, layerTypeFor } from "./registry.js"

/**
 * @typedef {{ topic: import("./registry.js").Topic, type: import("./registry.js").LayerType, enabled: boolean,
 *   status: import("./registry.js").LayerStatus, settings: Store<any> }} LayerEntry
 */

export class LayerManager {
    /** @type {Store<{ list: LayerEntry[] }>} */
    entries = new Store({ list: [] })
    /** every topic seen (drawn or not), sorted by name */
    topics = new Store({ list: [] })
    /** the 3D view is off: no layer runs (nothing subscribed); the switches keep what to start again */
    paused = new Store({ paused: false })
    #enabled
    #persist
    #prefix
    #lastSeen = new Map()

    /**
     * @param {{ source: any, persist?: (key: string, defaults: object) => Store<any>, storagePrefix?: string,
     *   forgetMs?: number }} options
     */
    constructor({ source, persist = localStore, storagePrefix = "dimos-react.layers", forgetMs = 20000 }) {
        this.source = source
        this.#persist = persist
        this.#prefix = storagePrefix
        this.forgetMs = forgetMs
        this.#enabled = persist(`${storagePrefix}.enabled`, {})
        // turned on or off elsewhere (another tab, an agent writing the setting)
        this.#enabled.subscribe(() => {
            for (const entry of this.entries.get().list) {
                const wanted = this.#enabled.get()[entry.topic.key]
                if (wanted !== undefined && wanted !== entry.enabled) {
                    this.#patch(entry.topic.key, { enabled: wanted })
                }
            }
        })
    }

    /** Lists the source's topics now and every `intervalMs` (and on the source's topic events). Returns stop. */
    watch({ filter = "dimos/**", intervalMs = 2000 } = {}) {
        let live = true
        let timer = null
        const round = async () => {
            try {
                this.setTopics(await this.source.listTopics(filter))
            } catch {
                // reconnecting: next round
            }
            if (live) {
                timer = setTimeout(round, intervalMs)
            }
        }
        round()
        const offTopics = this.source.onTopics?.(() => {
            clearTimeout(timer)
            round()
        })
        return () => {
            live = false
            clearTimeout(timer)
            offTopics?.()
        }
    }

    /** Topics found (`[{ key }]` or `[{ key, name, type }]`): new drawable ones become entries; gone ones are kept for `forgetMs`. */
    setTopics(found) {
        const now = Date.now()
        for (const item of found) {
            const topic = item.name && item.type ? item : parseKey(item.key)
            if (topic) {
                this.#lastSeen.set(topic.key, { topic, at: now })
            }
        }
        for (const [key, seen] of this.#lastSeen) {
            if (now - seen.at > this.forgetMs) {
                this.#lastSeen.delete(key)
            }
        }
        const all = [...this.#lastSeen.values()].map((seen) => seen.topic)
            .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type))
        const old = this.topics.get().list
        if (old.length !== all.length || old.some((topic, index) => topic.key !== all[index].key)) {
            this.topics.set({ list: all })
        }
        this.#sync(all)
    }

    #sync(topics) {
        const list = this.entries.get().list
        const known = new Set(list.map((entry) => entry.topic.key))
        const added = []
        for (const topic of topics) {
            const type = layerTypeFor(topic.type)
            if (!type || known.has(topic.key)) {
                continue
            }
            const saved = this.#enabled.get()[topic.key]
            const enabled = saved ?? (type.enabledByDefault?.(topic) ?? true)
            const settings = this.#persist(`${this.#prefix}.${type.id}.${topic.key}`, defaultSettings(type, topic))
            added.push({ topic, type, enabled, status: {}, settings })
        }
        if (added.length) {
            this.entries.set({ list: [...list, ...added].sort((a, b) => a.topic.name.localeCompare(b.topic.name)) })
        }
    }

    /** Switches a topic's layer on (subscribes) or off (unsubscribes); remembered. */
    setEnabled(key, enabled) {
        this.#enabled.update({ [key]: enabled })
        this.#patch(key, { enabled })
    }

    /** Off: every layer stops; on: the enabled ones start again. */
    setPaused(paused) {
        if (paused !== this.paused.get().paused) {
            this.paused.set({ paused })
        }
    }

    /** Topics of these types being drawn (e.g. to pick a robot pose source). */
    enabledOfType(...types) {
        return this.entries.get().list.filter((entry) => entry.enabled && types.includes(entry.topic.type))
            .map((entry) => entry.topic)
    }

    /** The drawn layers' data frames (for the TF check). */
    layerFrames() {
        return this.entries.get().list.filter((entry) => entry.enabled && entry.status.frame)
            .map((entry) => ({ name: entry.topic.name, frame: entry.status.frame }))
    }

    /** A layer reports info / a problem / its frame (only real changes re-render). */
    setStatus(key, status) {
        const current = this.entries.get().list.find((entry) => entry.topic.key === key)?.status
        if (!current || Object.keys(status).some((field) => current[field] !== status[field])) {
            this.#patch(key, { status: { ...current, ...status } })
        }
    }

    /** A layer stopped: its info and problem go with it. */
    clearStatus(key) {
        this.#patch(key, { status: {} })
    }

    #patch(key, patch) {
        const list = this.entries.get().list
        if (list.some((entry) => entry.topic.key === key)) {
            this.entries.set({ list: list.map((entry) => (entry.topic.key === key ? { ...entry, ...patch } : entry)) })
        }
    }
}
