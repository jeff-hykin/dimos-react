// A tiny observable value: the 3D core (no React) writes it, components read it with useStore.
import { useSyncExternalStore } from "react"

/** @template {object} T */
export class Store {
    #value
    #listeners = new Set()
    /** @param {T} value */
    constructor(value) {
        this.#value = value
    }
    /** @returns {T} */
    get() {
        return this.#value
    }
    /** @param {T} value */
    set(value) {
        this.#value = value
        for (const listener of [...this.#listeners]) {
            listener()
        }
    }
    /** @param {Partial<T>} patch */
    update(patch) {
        this.set({ ...this.#value, ...patch })
    }
    subscribe = (listener) => {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }
}

/** The store's current value, re-rendered on every change. */
export function useStore(store) {
    return useSyncExternalStore(store.subscribe, () => store.get(), () => store.get())
}
