// URL state: the URL is the UI's state, so back/forward, reloads and shared links all reproduce the same screen, and
// the app's backend can drive the UI by changing the URL.
//
//     backend:  publishEvent({ type: "url", set: { recording: "2026-10-11_run3", t: "12.5" } })
//                 ↓ (the app's `events` frontend topic, over Desktop's zenoh-gateway)
//     page:     <UrlStateProvider>  → history.pushState(…?recording=2026-10-11_run3&t=12.5)
//                 ↓
//     UI:       const [recording] = useUrlState("recording")   // renders from the URL
//
// A url event: `{ type: "url", set?: { key: value | null }, replace?: boolean, clear?: boolean }` — `set` merges into
// the current params (null removes one), `clear` drops the others first, `replace` uses replaceState (no new history
// entry). Params live in the query string (mode "search", default) or in the hash (mode "hash": #a=1&b=2).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useDataSource } from "./data"

/** The params of `href` as a plain object of strings. */
export function parseUrlState(href, { mode = "search" } = {}) {
    const url = new URL(href, "http://localhost/")
    const raw = mode === "hash" ? url.hash.replace(/^#/, "") : url.search
    return Object.fromEntries(new URLSearchParams(raw))
}

/** `href` with `changes` applied (null / undefined / "" remove a param; `clear` drops every other param first). */
export function urlWith(href, changes, { mode = "search", clear = false } = {}) {
    const url = new URL(href, "http://localhost/")
    const params = new URLSearchParams(clear ? "" : mode === "hash" ? url.hash.replace(/^#/, "") : url.search)
    for (const [key, value] of Object.entries(changes ?? {})) {
        if (value === null || value === undefined || value === "") {
            params.delete(key)
        } else {
            params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value))
        }
    }
    params.sort()
    const text = params.toString()
    if (mode === "hash") {
        url.hash = text
    } else {
        url.search = text
    }
    return url.href
}

/**
 * What a backend event does to the URL: `{ href, replace }`, or null if it isn't a url event (or changes nothing).
 * @param {string} href the current URL
 * @param {any} event
 */
export function applyUrlEvent(href, event, { mode = "search", eventType = "url" } = {}) {
    if (!event || typeof event !== "object" || event.type !== eventType) {
        return null
    }
    const next = urlWith(href, event.set ?? event.params ?? {}, { mode, clear: !!event.clear })
    if (next === new URL(href, "http://localhost/").href) {
        return null
    }
    return { href: next, replace: !!event.replace }
}

/**
 * A window stand-in with a working location + history (pushState, replaceState, back, forward, go → popstate), for
 * tests and server rendering.
 */
export function createMemoryWindow(initialHref = "http://localhost/") {
    const entries = [{ href: new URL(initialHref).href, state: null }]
    let index = 0
    const listeners = new Map()
    const fire = (type) => {
        for (const listener of [...(listeners.get(type) ?? [])]) {
            listener({ type, state: entries[index].state })
        }
    }
    const fakeWindow = {
        location: {
            get href() {
                return entries[index].href
            },
            get search() {
                return new URL(entries[index].href).search
            },
            get hash() {
                return new URL(entries[index].href).hash
            },
            get pathname() {
                return new URL(entries[index].href).pathname
            },
        },
        history: {
            get length() {
                return entries.length
            },
            get state() {
                return entries[index].state
            },
            pushState(state, _title, href) {
                entries.splice(index + 1)
                entries.push({ href: new URL(href, entries[index].href).href, state })
                index = entries.length - 1
            },
            replaceState(state, _title, href) {
                entries[index] = { href: new URL(href, entries[index].href).href, state }
            },
            go(delta) {
                const next = Math.min(entries.length - 1, Math.max(0, index + delta))
                if (next !== index) {
                    index = next
                    fire("popstate")
                }
            },
            back() {
                this.go(-1)
            },
            forward() {
                this.go(1)
            },
        },
        addEventListener(type, listener) {
            if (!listeners.has(type)) {
                listeners.set(type, new Set())
            }
            listeners.get(type).add(listener)
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener)
        },
    }
    return fakeWindow
}

/**
 * The URL as a store: `get()` → params (the same object until the URL changes), `subscribe(listener)`,
 * `set(changes, { replace, clear })`, `applyEvent(event)`, `href()`. Follows back/forward (popstate, hashchange).
 */
export function createUrlStore({ window: win = globalThis.window, mode = "search" } = {}) {
    const listeners = new Set()
    let lastHref = null
    let lastParams = {}
    const notify = () => listeners.forEach((listener) => listener())
    const store = {
        mode,
        href: () => win?.location?.href ?? "http://localhost/",
        get() {
            const href = store.href()
            if (href !== lastHref) {
                lastHref = href
                lastParams = parseUrlState(href, { mode })
            }
            return lastParams
        },
        subscribe(listener) {
            listeners.add(listener)
            if (listeners.size === 1 && win) {
                win.addEventListener("popstate", notify)
                win.addEventListener("hashchange", notify)
            }
            return () => {
                listeners.delete(listener)
                if (listeners.size === 0 && win) {
                    win.removeEventListener("popstate", notify)
                    win.removeEventListener("hashchange", notify)
                }
            }
        },
        set(changes, { replace = false, clear = false } = {}) {
            const href = store.href()
            const next = urlWith(href, changes, { mode, clear })
            if (next === new URL(href, "http://localhost/").href) {
                return false
            }
            win?.history?.[replace ? "replaceState" : "pushState"](win.history.state ?? null, "", next)
            notify()
            return true
        },
        /** Applies a backend url event; true if the URL changed. */
        applyEvent(event, { eventType = "url" } = {}) {
            const change = applyUrlEvent(store.href(), event, { mode, eventType })
            if (!change) {
                return false
            }
            win?.history?.[change.replace ? "replaceState" : "pushState"](win.history.state ?? null, "", change.href)
            notify()
            return true
        },
    }
    return store
}

/**
 * Wires a data source's backend events to a URL store (non-React pages): every url event on the frontend topic
 * `topic` changes the URL. Returns unsubscribe.
 */
export function bindUrlEvents(source, store, { topic = "events", eventType = "url" } = {}) {
    return source.subscribeFrontend(topic, (event) => store.applyEvent(event, { eventType }))
}

const UrlStateContext = createContext(null)
let defaultStore = null
const getDefaultStore = () => (defaultStore ??= createUrlStore())

/**
 * Provides the URL store below it and (unless `events={false}`) lets the app's backend change the URL with url events
 * on its `events` frontend topic (`events` may name another topic). `window` (tests: createMemoryWindow()) and
 * `mode` ("search" | "hash") pick where the params live; `store` passes a ready-made one.
 * @param {Record<string, any>} props
 */
export function UrlStateProvider({
    mode = "search",
    window: win,
    store: givenStore,
    events = "events",
    eventType = "url",
    children,
}) {
    const store = useMemo(
        () => givenStore ?? createUrlStore({ window: win ?? globalThis.window, mode }),
        [givenStore, win, mode],
    )
    const source = useDataSource()
    useEffect(() => {
        if (!events) {
            return
        }
        return bindUrlEvents(source, store, { topic: typeof events === "string" ? events : "events", eventType })
    }, [source, store, events, eventType])
    return <UrlStateContext.Provider value={store}>{children}</UrlStateContext.Provider>
}

/** The URL store in effect (the provider's, else one over the real window). */
export function useUrlStore() {
    return useContext(UrlStateContext) ?? getDefaultStore()
}

/** `[params, setParams(changes, { replace, clear })]`: every URL param, re-rendered on any URL change. */
export function useUrlParams() {
    const store = useUrlStore()
    const params = useSyncExternalStore(store.subscribe, store.get, store.get)
    const set = useCallback((changes, options) => store.set(changes, options), [store])
    return [params, set]
}

const CODECS = {
    string: { parse: (text) => text, format: (value) => value },
    number: {
        parse: (text) => {
            const number = Number(text)
            return Number.isFinite(number) ? number : undefined
        },
        format: (value) => (Number.isFinite(value) ? String(value) : null),
    },
    boolean: { parse: (text) => text === "1" || text === "true", format: (value) => (value ? "1" : null) },
    json: {
        parse: (text) => {
            try {
                return JSON.parse(text)
            } catch {
                return undefined
            }
        },
        format: (value) => (value === undefined ? null : JSON.stringify(value)),
    },
}

/**
 * One URL param as state: `const [tab, setTab] = useUrlState("tab", "map")`. The default isn't written to the URL
 * (setting it back removes the param). `codec`: "string" (default) | "number" | "boolean" | "json" | { parse, format };
 * `replace: true` for values that change often (a scrubber, a camera pose) so they don't flood history.
 */
export function useUrlState(key, defaultValue, { codec = "string", replace = false } = {}) {
    const store = useUrlStore()
    const { parse, format } = typeof codec === "string" ? CODECS[codec] : codec
    const raw = useSyncExternalStore(
        store.subscribe,
        () => store.get()[key],
        () => store.get()[key],
    )
    const value = raw === undefined ? defaultValue : (parse(raw) ?? defaultValue)
    const latest = useRef(value)
    latest.current = value
    const set = useCallback(
        (next, options = {}) => {
            const resolved = typeof next === "function" ? next(latest.current) : next
            const same = JSON.stringify(resolved) === JSON.stringify(defaultValue)
            store.set({ [key]: same ? null : format(resolved) }, { replace, ...options })
        },
        [store, key, replace, format, JSON.stringify(defaultValue)],
    )
    return [value, set]
}
