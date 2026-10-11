// Surfaces and layout: cards, panels (collapsible / floating), split panes, bars, stacks, HUD overlays, type.
import { useRef, useState } from "react"
import { cx, h } from "../h.js"
import { useDrag, usePersistentState } from "../hooks.js"
import { Icon } from "./icon.js"

/** A bordered surface. `title`, `description`, `actions` (right side of the header); `padded` (default true). */
export function Card({ title, description, actions, padded = true, glass = false, className, children, ...rest }) {
    return h(
        "section",
        { className: cx("dr-card", padded && "dr-card--padded", glass && "dr-glass", className), ...rest },
        title || actions
            ? h(
                "header",
                { className: "dr-card-head" },
                h(
                    "div",
                    { className: "dr-card-titles" },
                    title ? h("h3", { className: "dr-card-title" }, title) : null,
                    description ? h("div", { className: "dr-card-desc" }, description) : null,
                ),
                actions ? h("div", { className: "dr-card-actions" }, actions) : null,
            )
            : null,
        children,
    )
}

/**
 * A panel with a header that can collapse its body. `collapsible`, `open`/`onOpenChange` (controlled) or
 * `defaultOpen`; `persistKey` remembers it; `glass` for panels floating over a 3D/video view; `icon`, `actions`.
 */
export function Panel({
    title,
    icon,
    actions,
    collapsible = false,
    open,
    onOpenChange,
    defaultOpen = true,
    persistKey,
    glass = false,
    className,
    bodyClassName,
    children,
    ...rest
}) {
    const [savedOpen, setSavedOpen] = usePersistentState(
        persistKey ? `dr.panel.${persistKey}` : "dr.panel.__unsaved",
        defaultOpen,
    )
    const [localOpen, setLocalOpen] = useState(defaultOpen)
    const isOpen = !collapsible || (open ?? (persistKey ? savedOpen : localOpen))
    const setOpen = (next) => {
        onOpenChange?.(next)
        if (open === undefined) {
            if (persistKey) {
                setSavedOpen(next)
            } else {
                setLocalOpen(next)
            }
        }
    }
    return h(
        "section",
        { className: cx("dr-panel", glass && "dr-glass", !isOpen && "dr-panel--closed", className), ...rest },
        title || actions
            ? h(
                "header",
                { className: "dr-panel-head" },
                collapsible
                    ? h(
                        "button",
                        {
                            type: "button",
                            className: "dr-panel-toggle",
                            "aria-expanded": isOpen,
                            onClick: () => setOpen(!isOpen),
                        },
                        h(Icon, { name: isOpen ? "chevron-down" : "chevron-right", size: 14 }),
                        icon ? h(Icon, { name: icon, size: 15 }) : null,
                        h("span", { className: "dr-panel-title" }, title),
                    )
                    : h(
                        "div",
                        { className: "dr-panel-toggle dr-panel-toggle--static" },
                        icon ? h(Icon, { name: icon, size: 15 }) : null,
                        h("span", { className: "dr-panel-title" }, title),
                    ),
                actions ? h("div", { className: "dr-panel-actions" }, actions) : null,
            )
            : null,
        isOpen ? h("div", { className: cx("dr-panel-body", bodyClassName) }, children) : null,
    )
}

/**
 * A panel that floats over the page and can be dragged by its header (position remembered with `persistKey`).
 * `defaultPosition` { x, y } (px from the top-left; negative = from the right/bottom); `onClose` adds an ✕.
 */
export function FloatingPanel(
    {
        title,
        icon,
        actions,
        onClose,
        defaultPosition = { x: 16, y: 16 },
        persistKey,
        width = 300,
        className,
        style,
        children,
        ...rest
    },
) {
    const [saved, setSaved] = usePersistentState(
        persistKey ? `dr.float.${persistKey}` : "dr.float.__unsaved",
        defaultPosition,
    )
    const [local, setLocal] = useState(defaultPosition)
    const position = persistKey ? saved : local
    const setPosition = persistKey ? setSaved : setLocal
    const start = useRef(position)
    const panel = useRef(null)
    const drag = useDrag({
        onStart: () => {
            const rect = panel.current.getBoundingClientRect()
            start.current = { x: rect.left, y: rect.top }
        },
        onMove: ({ dx, dy }) => {
            const rect = panel.current.getBoundingClientRect()
            const x = Math.min(Math.max(0, start.current.x + dx), innerWidth - rect.width)
            const y = Math.min(Math.max(0, start.current.y + dy), innerHeight - 40)
            setPosition({ x, y })
        },
    })
    const placement = {
        left: position.x >= 0 ? position.x : undefined,
        right: position.x < 0 ? -position.x : undefined,
        top: position.y >= 0 ? position.y : undefined,
        bottom: position.y < 0 ? -position.y : undefined,
    }
    return h(
        "section",
        {
            ref: panel,
            className: cx("dr-panel dr-glass dr-floating", className),
            style: { width, ...placement, ...style },
            ...rest,
        },
        h(
            "header",
            { className: "dr-panel-head dr-floating-head", ...drag },
            h(
                "div",
                { className: "dr-panel-toggle dr-panel-toggle--static" },
                h(Icon, { name: "grip", size: 14 }),
                icon ? h(Icon, { name: icon, size: 15 }) : null,
                h("span", { className: "dr-panel-title" }, title),
            ),
            h(
                "div",
                { className: "dr-panel-actions", onPointerDown: (event) => event.stopPropagation() },
                actions,
                onClose
                    ? h("button", {
                        type: "button",
                        className: "dr-panel-close",
                        "aria-label": "Close",
                        onClick: onClose,
                    }, h(Icon, { name: "close", size: 14 }))
                    : null,
            ),
        ),
        h("div", { className: "dr-panel-body" }, children),
    )
}

/**
 * Two panes with a draggable divider. `direction` "row" (side by side) | "column"; `size` of the first pane (px or
 * %, controlled with onSizeChange) or `defaultSize`; `min` / `max` px; `persistKey`.
 */
export function SplitPane(
    {
        direction = "row",
        size,
        onSizeChange,
        defaultSize = "50%",
        min = 120,
        max,
        persistKey,
        className,
        children,
        ...rest
    },
) {
    const [saved, setSaved] = usePersistentState(
        persistKey ? `dr.split.${persistKey}` : "dr.split.__unsaved",
        defaultSize,
    )
    const [local, setLocal] = useState(defaultSize)
    const current = size ?? (persistKey ? saved : local)
    const container = useRef(null)
    const first = useRef(null)
    const start = useRef(0)
    const set = (next) => {
        onSizeChange?.(next)
        if (size === undefined) {
            ;(persistKey ? setSaved : setLocal)(next)
        }
    }
    const row = direction === "row"
    const drag = useDrag({
        onStart: () => {
            start.current = row ? first.current.offsetWidth : first.current.offsetHeight
        },
        onMove: ({ dx, dy }) => {
            const total = row ? container.current.offsetWidth : container.current.offsetHeight
            const next = Math.min(max ?? total - min, Math.max(min, start.current + (row ? dx : dy)))
            set(next)
        },
    })
    const [a, b] = Array.isArray(children) ? children : [children, null]
    return h(
        "div",
        { ref: container, className: cx("dr-split", `dr-split--${direction}`, className), ...rest },
        h("div", {
            ref: first,
            className: "dr-split-pane",
            style: { flexBasis: typeof current === "number" ? `${current}px` : current },
        }, a),
        h("div", {
            className: "dr-split-divider",
            role: "separator",
            "aria-orientation": row ? "vertical" : "horizontal",
            tabIndex: 0,
            onKeyDown: (event) => {
                const step = event.shiftKey ? 40 : 10
                const now = row ? first.current.offsetWidth : first.current.offsetHeight
                if ((row && event.key === "ArrowLeft") || (!row && event.key === "ArrowUp")) {
                    set(Math.max(min, now - step))
                } else if ((row && event.key === "ArrowRight") || (!row && event.key === "ArrowDown")) {
                    set(now + step)
                }
            },
            ...drag,
        }),
        h("div", { className: "dr-split-pane dr-split-pane--rest" }, b),
    )
}

/** The app's top bar: `title` (and `icon`), `left` / center `children` / `right` slots. */
export function TopBar({ title, icon, left, right, className, children, ...rest }) {
    return h(
        "header",
        { className: cx("dr-topbar", className), ...rest },
        h(
            "div",
            { className: "dr-topbar-left" },
            icon ? h(Icon, { name: icon, size: 18 }) : null,
            title ? h("span", { className: "dr-title" }, title) : null,
            left,
        ),
        h("div", { className: "dr-topbar-center" }, children),
        h("div", { className: "dr-topbar-right" }, right),
    )
}

/** A row of controls (buttons, selects, separators). `floating` gives it a glass background (over a view). */
export function Toolbar({ floating = false, vertical = false, className, children, ...rest }) {
    return h("div", {
        className: cx(
            "dr-toolbar",
            floating && "dr-toolbar--floating dr-glass",
            vertical && "dr-toolbar--vertical",
            className,
        ),
        role: "toolbar",
        ...rest,
    }, children)
}

/** A bar pinned to the bottom of its container, above Desktop's dock (status lines, playback controls). */
export function BottomBar({ className, children, ...rest }) {
    return h("footer", { className: cx("dr-bottombar", className), ...rest }, children)
}

/** A thin divider; `vertical` inside rows/toolbars. */
export function Separator({ vertical = false, className, ...rest }) {
    return h("span", { className: cx("dr-sep", vertical && "dr-sep--vertical", className), role: "separator", ...rest })
}

/** Flex helpers: `gap` (px), `align`, `justify`, `wrap`, `grow`. */
export function Row(
    { gap = 8, align = "center", justify, wrap = false, grow = false, className, style, children, ...rest },
) {
    return h("div", {
        className: cx("dr-row", className),
        style: {
            gap,
            alignItems: align,
            justifyContent: justify,
            flexWrap: wrap ? "wrap" : undefined,
            flex: grow ? 1 : undefined,
            ...style,
        },
        ...rest,
    }, children)
}
export function Column({ gap = 8, align, justify, grow = false, className, style, children, ...rest }) {
    return h("div", {
        className: cx("dr-col", className),
        style: { gap, alignItems: align, justifyContent: justify, flex: grow ? 1 : undefined, ...style },
        ...rest,
    }, children)
}
/** Takes the free space in a Row/Column. */
export function Spacer() {
    return h("span", { className: "dr-spacer" })
}

/**
 * A HUD overlay pinned to a corner of a positioned parent (a 3D view, a video): `position` "top-left" | "top-right" |
 * "bottom-left" | "bottom-right" | "top" | "bottom" | "center".
 */
export function Hud({ position = "top-left", className, children, ...rest }) {
    return h("div", { className: cx("dr-hud", `dr-hud--${position}`, className), ...rest }, children)
}

/** Headings and text in the theme's type: level 1 (page title), 2 (section head), 3 (micro-label). */
export function Heading({ level = 2, className, children, ...rest }) {
    return h(`h${level}`, { className: cx(`dr-h${level}`, className), ...rest }, children)
}
export function Label({ className, children, ...rest }) {
    return h("span", { className: cx("dr-label", className), ...rest }, children)
}
/** Text: `muted`, `mono`, `small`, `tone` ("ok" | "warn" | "danger"). */
export function Text({ as = "span", muted, mono, small, tone, className, children, ...rest }) {
    return h(as, {
        className: cx(
            "dr-text",
            muted && "dr-muted",
            mono && "dr-mono",
            small && "dr-small",
            tone && `dr-${tone}`,
            className,
        ),
        ...rest,
    }, children)
}
export function Link({ className, children, ...rest }) {
    return h("a", { className: cx("dr-link", className), ...rest }, children)
}

/** Full-page app frame: top bar, optional side, main area (fills the viewport, above Desktop's dock). */
export function AppShell({ topBar, sidebar, bottomBar, className, children, ...rest }) {
    return h(
        "div",
        { className: cx("dr-shell", className), ...rest },
        topBar,
        h("div", { className: "dr-shell-main" }, sidebar, h("main", { className: "dr-shell-content" }, children)),
        bottomBar,
    )
}
