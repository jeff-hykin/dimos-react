// createElement as `h`, so the library is plain JS that runs with no build step
import { createElement, Fragment } from "react"

export const h = createElement
export { Fragment }

/** Joins the truthy class names */
export function cx(...names) {
    return names.filter(Boolean).join(" ")
}
