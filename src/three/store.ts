// A tiny observable value: the 3D core (no React) writes it, components read it with useStore.
import { useSyncExternalStore } from "react"

/** @template {object} T */
export class Store {
    #value
    #listeners = new Set()
    /** @param {T} value */
    constructor(value: T) {
        this.#value = value
    }
    /** @returns {T} */
    get(): T {
        return this.#value
    }
    /** @param {T} value */
    set(value: T) {
        this.#value = value
        for (const listener of [...this.#listeners]) {
            listener()
        }
    }
    /** @param {Partial<T>} patch */
    update(patch: Partial<T>) {
        this.set({ ...this.#value, ...patch })
    }
    /** @param {() => void} listener @returns {() => boolean} */
    subscribe = (listener: () => void): (() => boolean) => {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }
}

/**
 * The store's current value, re-rendered on every change.
 * @template {object} T
 * @param {Store<T>} store
 * @returns {T}
 */
export function useStore<T>(store: Store<T>): T {
    return useSyncExternalStore(
        store.subscribe,
        () => store.get(),
        () => store.get(),
    )
}

/** localStorage JSON, or the fallback (private windows and blocked storage throw or return nothing). */
export function readLocal(key, fallback) {
    try {
        const raw = globalThis.localStorage?.getItem(key)
        return raw ? JSON.parse(raw) : fallback
    } catch {
        return fallback
    }
}

/** Saves JSON to localStorage; without storage the value lasts for this page only. */
export function writeLocal(key, value) {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
        // storage unavailable
    }
}

/**
 * A Store saved in localStorage under `key` (fields missing from what's saved come from `defaults`). Apps that keep
 * settings elsewhere (a backend) pass their own `persist(key, defaults)` to the components that take one.
 * @template {object} T
 * @param {string} key
 * @param {T} defaults
 * @returns {Store<T>}
 */
export function localStore<T>(key: string, defaults: T): Store<T> {
    const saved = readLocal(key, null)
    const store = new Store(
        saved && typeof saved === "object" && !Array.isArray(saved) ? { ...defaults, ...saved } : defaults,
    )
    store.subscribe(() => writeLocal(key, store.get()))
    return store
}
