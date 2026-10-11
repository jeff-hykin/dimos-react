// Where live data comes from. Every hook and 3D layer reads through a *data source*, so the same components show a
// live robot (Desktop's zenoh-gateway), a replay (a recording app pushing its own messages) or test data.
//
//     h(ZenohProvider, null, h(App))                         // live: the page's zenoh-gateway connection
//     const source = memorySource(); h(DataSourceProvider, { source }, h(App)); source.publish(key, bytes)
//     const { value } = useTopic("dimos/odom/nav_msgs.Odometry")   // decoded LCM, re-rendered per message
//     const topics = useTopicList()                                 // [{ key, name, type }]
//     useBackendEvents((event) => ...)                              // the app backend's `events` frontend topic
//
// A source is `{ subscribe, subscribeFrontend, listTopics, state, onState, now }`; see zenohSource / memorySource.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { getZenoh } from "./vendor/dim-app/zenoh.js"
import { decode as decodeLcm } from "./lcm.js"

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/** `dimos/<name>/<type>` → `{ key, name: "/<name>", type }`; anything else → null. */
export function parseKey(key) {
    const parts = String(key).split("/")
    if (parts.length < 3 || parts[0] !== "dimos" || key.includes("*")) {
        return null
    }
    const type = parts[parts.length - 1]
    if (!/^\w+\.\w+$/.test(type)) {
        return null
    }
    return { key, name: "/" + parts.slice(1, -1).join("/"), type }
}

/** The zenoh key dimos uses for a topic of a type: dimosKey("/odom", "nav_msgs.Odometry"). */
export const dimosKey = (topic, type) => `dimos/${String(topic).replace(/^\/+/, "")}/${type}`

/** zenoh key-expression matching (`*` = one chunk, `**` = any number of chunks). */
export function keyMatches(pattern, key) {
    const want = pattern.split("/")
    const have = key.split("/")
    const match = (i, j) => {
        if (i === want.length) {
            return j === have.length
        }
        if (want[i] === "**") {
            for (let k = j; k <= have.length; k++) {
                if (match(i + 1, k)) {
                    return true
                }
            }
            return false
        }
        return j < have.length && (want[i] === "*" || want[i] === have[j]) && match(i + 1, j + 1)
    }
    return match(0, 0)
}

/**
 * Turns a message into a value: "lcm" (dimos LCM, the type from the key or `type`), "json", "text", "bytes", or a
 * function `(message) => value`. A message the gateway already decoded (an encoding like dimos_lcm_pointcloud2)
 * keeps `message.decoded`.
 */
export function decodeMessage(message, how = "auto", type) {
    if (typeof how === "function") {
        return how(message)
    }
    if (message.decoded !== undefined && (how === "auto" || how === "decoded")) {
        return message.decoded
    }
    if (message.value !== undefined && how === "auto") {
        return message.value
    }
    const kind = how === "auto" ? (type || parseKey(message.key)?.type ? "lcm" : "json") : how
    if (kind === "bytes") {
        return message.bytes
    }
    if (kind === "text") {
        return decoder.decode(message.bytes)
    }
    if (kind === "json") {
        return JSON.parse(decoder.decode(message.bytes))
    }
    return decodeLcm(type ?? parseKey(message.key).type, message.bytes)
}

/**
 * The live source: the page's one zenoh-gateway connection (dim-app's getZenoh(), shared with everything else on the
 * page). `options` go to getZenoh on first use (app, connectOptions, …).
 */
export function zenohSource(options = {}) {
    let zenoh = null
    const get = () => (zenoh ??= getZenoh(options))
    return {
        kind: "zenoh",
        get zenoh() {
            return get()
        },
        subscribe: (key, subscribeOptions, onMessage) => get().subscribe(key, subscribeOptions ?? {}, onMessage),
        subscribeFrontend: (topic, callback, frontendOptions) =>
            get().subscribeFrontend(topic, callback, frontendOptions),
        listTopics: async (filter = "dimos/**", { probeMs = 800 } = {}) => {
            const client = (await get().ready).client
            return await client.listTopics(filter, { probeMs })
        },
        get state() {
            return get().state
        },
        onState: (listener) => get().onState(listener),
        onReconnect: (listener) => get().onReconnect(listener),
        now: () => {
            const client = get().client
            return client?.now ? client.now() + (client.clockOffsetMs ?? 0) : Date.now()
        },
    }
}

/**
 * An in-page source: whatever calls `publish` is the data (tests, demos, a replay app feeding recorded messages).
 * `publish(key, payload)` takes bytes (LCM etc.), or any value (delivered as `message.value`, decoded as itself).
 */
export function memorySource({ topics = [], state = "connected" } = {}) {
    const subscribers = new Set()
    const frontend = new Set()
    const stateListeners = new Set()
    const topicListeners = new Set()
    let known = new Map(topics.map((key) => [key, { key }]))
    const source = {
        kind: "memory",
        state,
        subscribe(key, _options, onMessage) {
            const entry = { key, onMessage }
            subscribers.add(entry)
            const off = () => subscribers.delete(entry)
            off.unsubscribe = off
            off.update = async () => {}
            return off
        },
        subscribeFrontend(topic, callback) {
            const entry = { topic, callback }
            frontend.add(entry)
            return () => frontend.delete(entry)
        },
        listTopics: (filter = "**") =>
            Promise.resolve([...known.values()].filter((topic) => keyMatches(filter, topic.key))),
        onState(listener) {
            stateListeners.add(listener)
            return () => stateListeners.delete(listener)
        },
        onReconnect: () => () => {},
        onTopics(listener) {
            topicListeners.add(listener)
            return () => topicListeners.delete(listener)
        },
        now: () => Date.now(),
        /** Delivers a message to every subscriber whose key expression matches `key`. */
        publish(key, payload, { timestamp = Date.now() } = {}) {
            if (!known.has(key)) {
                known.set(key, { key })
                topicListeners.forEach((listener) => listener())
            }
            const message = payload instanceof Uint8Array
                ? { key, bytes: payload, timestamp }
                : { key, value: payload, bytes: encoder.encode(JSON.stringify(payload ?? null)), timestamp }
            for (const entry of [...subscribers]) {
                if (keyMatches(entry.key, key)) {
                    entry.onMessage(message)
                }
            }
        },
        /** What the app backend's publishFrontend(topic, payload) does: JSON to `subscribeFrontend(topic)` listeners. */
        publishFrontend(topic, payload) {
            for (const entry of [...frontend]) {
                if (keyMatches(entry.topic, topic)) {
                    entry.callback(payload, { key: topic, timestamp: Date.now() })
                }
            }
        },
        setTopics(keys) {
            known = new Map(keys.map((key) => [key, { key }]))
            topicListeners.forEach((listener) => listener())
        },
        setState(next) {
            source.state = next
            stateListeners.forEach((listener) => listener(next))
        },
    }
    return source
}

const DataSourceContext = createContext(null)
let defaultSource = null

/**
 * Makes `source` the data source of everything below.
 * @param {Record<string, any>} props
 */
export function DataSourceProvider({ source, children }) {
    return createElement(DataSourceContext.Provider, { value: source }, children)
}

/**
 * DataSourceProvider with the live zenoh-gateway source (props go to getZenoh on first use).
 * @param {Record<string, any>} props
 */
export function ZenohProvider({ children, ...options }) {
    const source = useMemo(() => zenohSource(options), [])
    return createElement(DataSourceContext.Provider, { value: source }, children)
}

/** The data source in effect: the nearest provider's, else the page's zenoh-gateway connection. */
export function useDataSource() {
    const source = useContext(DataSourceContext)
    return source ?? (defaultSource ??= zenohSource())
}

/** The zenoh connection behind the source (dim-app's AppZenoh), or null for a non-zenoh source. */
export function useZenoh() {
    const source = useDataSource()
    return source.kind === "zenoh" ? source.zenoh : null
}

/**
 * Calls `onMessage(value, message)` for every message on `key` (null key: nothing). The callback may change freely.
 * @param {string | null} key a zenoh key expression
 * @param {(value: any, message: any) => void} onMessage
 * @param {{ decode?: string | Function, type?: string, delivery?: "latest" | "reliable", maxHz?: number,
 *   encoding?: string, encodeOptions?: object, minQuality?: number }} [options]
 */
export function useSubscription(key, onMessage, options = {}) {
    const source = useDataSource()
    const callback = useRef(onMessage)
    callback.current = onMessage
    const { decode = "auto", type, ...subscribeOptions } = options
    const optionsKey = JSON.stringify(subscribeOptions)
    useEffect(() => {
        if (!key) {
            return
        }
        const off = source.subscribe(key, { delivery: "latest", ...JSON.parse(optionsKey) }, (message) => {
            let value
            try {
                value = decodeMessage(message, decode, type)
            } catch (error) {
                console.debug(`[dimos-react] ${message.key}: cannot decode (${error?.message ?? error})`)
                return
            }
            callback.current(value, message)
        })
        return () => off()
    }, [source, key, optionsKey, typeof decode === "string" ? decode : "fn", type])
}

/**
 * The latest message on a topic, re-rendered per message (throttle with `maxHz`).
 * @returns {{ value: any, message: any, timestamp: number | null, count: number }}
 */
export function useTopic(key, options = {}) {
    const [latest, setLatest] = useState({ value: options.initial, message: null, timestamp: null, count: 0 })
    useEffect(() => setLatest({ value: options.initial, message: null, timestamp: null, count: 0 }), [key])
    useSubscription(key, (value, message) => {
        setLatest((old) => ({ value, message, timestamp: message.timestamp ?? Date.now(), count: old.count + 1 }))
    }, options)
    return latest
}

/**
 * The dimos topics on the bus (`[{ key, name, type }]`, sorted), re-listed every `intervalMs`. A topic stays listed
 * `forgetMs` after it was last seen (slow publishers miss a probe now and then).
 */
export function useTopicList({ filter = "dimos/**", intervalMs = 2000, forgetMs = 20000, types } = {}) {
    const source = useDataSource()
    const [topics, setTopics] = useState([])
    const typesKey = types ? types.join(",") : ""
    useEffect(() => {
        let live = true
        let timer = null
        const lastSeen = new Map()
        const round = async () => {
            try {
                const found = await source.listTopics(filter)
                const now = Date.now()
                for (const item of found) {
                    const topic = parseKey(item.key)
                    if (topic && (!typesKey || typesKey.split(",").includes(topic.type))) {
                        lastSeen.set(topic.key, { topic, at: now })
                    }
                }
                for (const [key, seen] of lastSeen) {
                    if (now - seen.at > forgetMs) {
                        lastSeen.delete(key)
                    }
                }
                const next = [...lastSeen.values()].map((seen) => seen.topic)
                    .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type))
                if (live) {
                    setTopics((old) =>
                        old.length === next.length && old.every((topic, index) => topic.key === next[index].key)
                            ? old
                            : next
                    )
                }
            } catch {
                // reconnecting: next round
            }
            if (live) {
                timer = setTimeout(round, intervalMs)
            }
        }
        round()
        const offTopics = source.onTopics?.(() => {
            clearTimeout(timer)
            round()
        })
        return () => {
            live = false
            clearTimeout(timer)
            offTopics?.()
        }
    }, [source, filter, intervalMs, forgetMs, typesKey])
    return topics
}

/** The source's connection state: "connecting" | "connected" | "degraded" | "lost". */
export function useConnectionState() {
    const source = useDataSource()
    const [state, setState] = useState(() => source.state ?? "connecting")
    useEffect(() => {
        setState(source.state ?? "connecting")
        return source.onState((next) => setState(next))
    }, [source])
    return state
}

/**
 * The app backend's events (dim-app's publishEvent / publishFrontend("events", …)): `onEvent(event)` per event.
 * `onReconnect` runs when the link comes back (events sent while it was down are gone: re-GET what you show).
 */
export function useBackendEvents(onEvent, { topic = "events", onReconnect } = {}) {
    const source = useDataSource()
    const handler = useRef(onEvent)
    handler.current = onEvent
    const reconnect = useRef(onReconnect)
    reconnect.current = onReconnect
    useEffect(() => {
        const off = source.subscribeFrontend(topic, (event) => handler.current(event))
        const offReconnect = source.onReconnect?.(() => reconnect.current?.())
        return () => {
            off()
            offReconnect?.()
        }
    }, [source, topic])
}

/**
 * Snapshot + live backend state (dim-app's convention): GET `api/state/<key>` (or `url`), then re-GET whenever the
 * backend's stateChanged(key) announces a change on the frontend topic `state/<key>`, and after a reconnect.
 * @returns {[any, { loading: boolean, error: Error | null, refresh: () => Promise<void> }]}
 */
export function useBackendState(key, { url, topic, initial, debounceMs = 100, fetch: fetchImpl } = {}) {
    const source = useDataSource()
    const [snapshot, setSnapshot] = useState({ data: initial, loading: true, error: null })
    const href = url ?? `api/state/${key}` // dimos-yaml-check: ignore (an app that calls useBackendState lists it)
    const generation = useRef(0)
    const refresh = useCallback(async () => {
        const mine = ++generation.current
        try {
            const response = await (fetchImpl ?? globalThis.fetch)(new URL(href, globalThis.location?.href).href)
            if (!response.ok) {
                throw new Error(`GET ${href}: HTTP ${response.status}`)
            }
            const data = await response.json()
            if (mine === generation.current) {
                setSnapshot({ data, loading: false, error: null })
            }
        } catch (error) {
            if (mine === generation.current) {
                setSnapshot((old) => ({ ...old, loading: false, error }))
            }
        }
    }, [href, fetchImpl])
    useEffect(() => {
        if (!key && !url) {
            return
        }
        refresh()
        let timer = null
        const later = () => {
            clearTimeout(timer)
            timer = setTimeout(refresh, debounceMs)
        }
        const off = source.subscribeFrontend(topic ?? `state/${key}`, later)
        const offReconnect = source.onReconnect?.(later)
        return () => {
            clearTimeout(timer)
            off()
            offReconnect?.()
        }
    }, [source, key, href, topic, debounceMs, refresh])
    return [snapshot.data, { loading: snapshot.loading, error: snapshot.error, refresh }]
}
