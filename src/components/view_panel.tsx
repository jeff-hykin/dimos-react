// A view's panel chrome (a camera, a map, a 3D view, a dashboard tile): a header with its title and buttons, a body,
// and how it's placed:
//  - "float": floats over the page, moved by its header and resized from a bottom corner (optionally keeping the
//    body's aspect, so a picture never gets bars)
//  - "dock": a layout places it at `dock.rect`; a maximize button in its header fills the page with it, and in a tiled
//    layout dragging its header onto another tile swaps the two
//  - "main": fills its positioned parent behind everything (a fullscreen camera or map)
// The caller owns where it is: `onMove(x, y)` / `onResize(box)` report the user's drag, the caller keeps the box.
import { useRef } from "react"
import { cx, h } from "../h.js"
import { IconButton } from "./controls.js"

/** every panel's header height (px): a panel is this plus its body */
export const VIEW_PANEL_HEAD_PX = 33
/** how much of a floating panel always stays on screen (its header's left part) */
const KEEP_VISIBLE_X = 80
const KEEP_VISIBLE_Y = 40

const topLimit = (top) => (typeof top === "number" ? top : 0)

/**
 * Drags `element` with the pointer from `event` (a header's pointerdown), kept on screen and below `top` px;
 * `onDone(x, y)` gets where it was dropped (only if it moved).
 */
export function startPanelDrag(event, element, onDone, { top = 0 } = {}) {
    const box = element.getBoundingClientRect()
    const offsetX = event.clientX - box.left
    const offsetY = event.clientY - box.top
    let moved = false
    const move = (pointer) => {
        moved = true
        const x = Math.max(0, Math.min(innerWidth - KEEP_VISIBLE_X, pointer.clientX - offsetX))
        const y = Math.max(topLimit(top), Math.min(innerHeight - KEEP_VISIBLE_Y, pointer.clientY - offsetY))
        Object.assign(element.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" })
    }
    const up = () => {
        removeEventListener("pointermove", move)
        removeEventListener("pointerup", up)
        if (!moved) {
            return
        }
        // the far edges back to React (it never set them, so it would never clear them)
        element.style.right = ""
        element.style.bottom = ""
        const after = element.getBoundingClientRect()
        onDone(after.left, after.top)
    }
    addEventListener("pointermove", move)
    addEventListener("pointerup", up)
}

/**
 * Resizes `element` from a bottom corner: "left" grows it leftward (its right edge stays), "right" rightward. With
 * `aspect` (body height / width) the height follows the width. It stays in the window; `onDone(box)` gets the final
 * `{ x, y, width, height }`.
 */
export function startPanelResize(event, element, { corner, minimum, aspect, onDone, headPx = VIEW_PANEL_HEAD_PX }) {
    event.preventDefault()
    event.stopPropagation()
    const box = element.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const handle = event.currentTarget
    handle.setPointerCapture?.(event.pointerId)
    let width = box.width
    let height = box.height
    let left = box.left
    Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, right: "auto", bottom: "auto" })
    const maxWidth = corner === "left" ? box.right - 8 : innerWidth - box.left - 8
    const maxHeight = innerHeight - box.top - 8
    const move = (moved) => {
        const grown = corner === "left" ? startX - moved.clientX : moved.clientX - startX
        const widest = aspect ? Math.min(maxWidth, (maxHeight - headPx) / aspect) : maxWidth
        width = Math.round(Math.max(Math.min(minimum.width, widest), Math.min(widest, box.width + grown)))
        height = aspect
            ? Math.round(width * aspect) + headPx
            : Math.round(Math.max(minimum.height, Math.min(maxHeight, box.height + moved.clientY - startY)))
        left = corner === "left" ? box.right - width : box.left
        Object.assign(element.style, { width: `${width}px`, height: `${height}px`, left: `${left}px` })
    }
    const up = () => {
        handle.removeEventListener("pointermove", move)
        handle.removeEventListener("pointerup", up)
        handle.removeEventListener("pointercancel", up)
        element.style.right = ""
        element.style.bottom = ""
        onDone({ x: Math.round(left), y: Math.round(box.top), width, height })
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
}

/**
 * A remembered panel box made safe for this window: a size that fits (at least `minimum`), a position that keeps the
 * header reachable (on screen, below `top`); anything not a finite number takes its default. x/y < 0 = "the default
 * corner" (returned as -1, -1).
 */
export function clampPanelBox(box, defaults, viewport, minimum, { top = 48 } = {}) {
    const finite = (value, fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
    const viewWidth = viewport.width > 0 ? viewport.width : 1280
    const viewHeight = viewport.height > 0 ? viewport.height : 800
    const width = Math.round(
        Math.max(minimum.width, Math.min(Math.max(minimum.width, viewWidth - 16), finite(box.width, defaults.width))),
    )
    const height = Math.round(
        Math.max(
            minimum.height,
            Math.min(Math.max(minimum.height, viewHeight - top - 8), finite(box.height, defaults.height)),
        ),
    )
    const x = finite(box.x, defaults.x)
    const y = finite(box.y, defaults.y)
    if (x < 0 || y < 0) {
        return { x: -1, y: -1, width, height }
    }
    return {
        x: Math.round(Math.max(0, Math.min(viewWidth - KEEP_VISIBLE_X, x))),
        y: Math.round(Math.max(top, Math.min(viewHeight - KEEP_VISIBLE_Y, y))),
        width,
        height,
    }
}

/** The order with `a` and `b` swapped (a tiled layout's drop). */
export function swapTiles(order, a, b) {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia < 0 || ib < 0 || ia === ib) {
        return order
    }
    const next = order.slice()
    next[ia] = b
    next[ib] = a
    return next
}

/** Tiles: a header dragged onto another tile swaps the two (the tile under the pointer lights up on the way). */
function startTileSwap(event, region, tiles) {
    const startX = event.clientX
    const startY = event.clientY
    let target = null
    const tileAt = (x, y) =>
        document.elementsFromPoint(x, y)
            .map((node) => node.closest?.("[data-region].dr-view-panel--tile"))
            .find((tile) => tile && tile.dataset.region !== region) ?? null
    const move = (moved) => {
        if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < 6) {
            return
        }
        document.body.classList.add("dr-tile-dragging")
        const next = tileAt(moved.clientX, moved.clientY)
        if (next !== target) {
            target?.classList.remove("dr-view-panel--drop")
            next?.classList.add("dr-view-panel--drop")
            target = next
        }
    }
    const up = () => {
        removeEventListener("pointermove", move)
        removeEventListener("pointerup", up)
        removeEventListener("pointercancel", up)
        document.body.classList.remove("dr-tile-dragging")
        target?.classList.remove("dr-view-panel--drop")
        const other = target?.dataset.region
        if (other) {
            tiles.onOrder(swapTiles(tiles.order, region, other))
        }
    }
    addEventListener("pointermove", move)
    addEventListener("pointerup", up)
    addEventListener("pointercancel", up)
}

/**
 * A view's panel (see the top of this file).
 * @param {{ placement: "float" | "dock" | "main", dock?: { region: string, rect: { x: number, y: number, width: number,
 *   height: number } | null, maximized: boolean, onMaximize: () => void, tiles?: { order: string[],
 *   onOrder: (order: string[]) => void } } | null, head: any, children?: any, className?: string, style?: object,
 *   bodyClassName?: string, bodyOnClick?: () => void, onHeadDoubleClick?: () => void,
 *   onMove?: (x: number, y: number) => void, top?: number,
 *   resize?: { corner: "left" | "right", minimum: { width: number, height: number }, aspect?: number,
 *   onDone: (box: object) => void } | null, panelRef?: any, title?: string, wrapHead?: boolean } & Record<string, any>} props
 *   `head`: the header's content (title, buttons); `top`: a float panel's header never goes above this (a top bar);
 *   `wrapHead`: a header with several selects wraps onto more lines, each select as wide as its text, instead of
 *   squeezing them
 */
export function ViewPanel({
    placement,
    dock,
    head,
    children,
    className,
    style,
    bodyClassName,
    bodyOnClick,
    onHeadDoubleClick,
    onMove,
    top = 0,
    resize,
    panelRef,
    title,
    wrapHead = false,
    ...rest
}) {
    const element = useRef(null)
    const setRef = (node) => {
        element.current = node
        if (typeof panelRef === "function") {
            panelRef(node)
        } else if (panelRef) {
            panelRef.current = node
        }
    }
    const fromControl = (event) => !!event.target.closest("button, select, input, label, textarea, [role=tab]")
    const startHeadDrag = (event) => {
        if (fromControl(event) || event.button !== 0) {
            return
        }
        if (placement === "float" && onMove) {
            startPanelDrag(event, element.current, onMove, { top })
        } else if (placement === "dock" && dock?.tiles && !dock.maximized) {
            startTileSwap(event, dock.region, dock.tiles)
        }
    }
    const docked = placement === "dock"
    const hidden = docked && !dock?.rect
    const placed = docked
        ? dock?.rect ? { left: dock.rect.x, top: dock.rect.y, width: dock.rect.width, height: dock.rect.height } : {}
        : style ?? {}
    return h(
        "div",
        {
            ref: setRef,
            className: cx(
                "dr-view-panel",
                `dr-view-panel--${placement}`,
                hidden && "dr-view-panel--hidden",
                dock?.maximized && "dr-view-panel--maximized",
                dock?.tiles && "dr-view-panel--tile",
                className,
            ),
            style: placed,
            "data-region": dock?.region,
            "aria-hidden": hidden || undefined,
            ...rest,
        },
        h(
            "div",
            {
                className: cx("dr-view-panel-head", wrapHead && "dr-view-panel-head--wrap"),
                title,
                onPointerDown: startHeadDrag,
                onDoubleClick: (event) => {
                    if (fromControl(event)) {
                        return
                    }
                    if (docked) {
                        dock?.onMaximize()
                    } else {
                        onHeadDoubleClick?.()
                    }
                },
            },
            head,
            docked && dock
                ? h(IconButton, {
                    size: "sm",
                    className: "dr-view-panel-maximize",
                    icon: dock.maximized ? "fullscreen-exit" : "fullscreen",
                    label: dock.maximized ? "Back to the layout" : "Maximize (fill the page)",
                    pressed: dock.maximized,
                    onClick: dock.onMaximize,
                })
                : null,
        ),
        h("div", { className: cx("dr-view-panel-body", bodyClassName), onClick: bodyOnClick }, children),
        placement === "float" && resize
            ? h("div", {
                className: cx("dr-view-panel-resize", `dr-view-panel-resize--${resize.corner}`),
                title: "Drag to resize",
                "aria-label": "Resize",
                onPointerDown: (event) => startPanelResize(event, element.current, resize),
            })
            : null,
    )
}

/** A short live readout in a panel header ("640×480 · 30 fps"): muted, mono, truncated. */
export function PanelInfo({ className, children, ...rest }) {
    return h("span", { className: cx("dr-view-panel-info", className), ...rest }, children)
}
