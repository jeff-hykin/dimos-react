// Surfaces and layout: cards, panels (collapsible / floating), split panes, bars, stacks, HUD overlays, type.
import { useRef, useState } from "react"
import { cx } from "../cx"
import { useDrag, usePersistentState } from "../hooks"
import { Icon } from "./icon"

/**
 * A bordered surface. `title`, `description`, `actions` (right side of the header); `padded` (default true).
 * @param {Record<string, any>} props
 */
export function Card({
    title,
    description,
    actions,
    padded = true,
    glass = false,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <section className={cx("dr-card", padded && "dr-card--padded", glass && "dr-glass", className)} {...rest}>
            {title || actions ? (
                <header className="dr-card-head">
                    <div className="dr-card-titles">
                        {title ? <h3 className="dr-card-title">{title}</h3> : null}
                        {description ? <div className="dr-card-desc">{description}</div> : null}
                    </div>
                    {actions ? <div className="dr-card-actions">{actions}</div> : null}
                </header>
            ) : null}
            {children}
        </section>
    )
}

/**
 * A panel with a header that can collapse its body. `collapsible`, `open`/`onOpenChange` (controlled) or
 * `defaultOpen`; `persistKey` remembers it; `glass` for panels floating over a 3D/video view; `icon`, `actions`.
 * @param {Record<string, any>} props
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
}: Record<string, any>) {
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
    return (
        <section className={cx("dr-panel", glass && "dr-glass", !isOpen && "dr-panel--closed", className)} {...rest}>
            {title || actions ? (
                <header className="dr-panel-head">
                    {collapsible ? (
                        <button
                            type="button"
                            className="dr-panel-toggle"
                            aria-expanded={isOpen}
                            onClick={() => setOpen(!isOpen)}
                        >
                            <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={14} />
                            {icon ? <Icon name={icon} size={15} /> : null}
                            <span className="dr-panel-title">{title}</span>
                        </button>
                    ) : (
                        <div className="dr-panel-toggle dr-panel-toggle--static">
                            {icon ? <Icon name={icon} size={15} /> : null}
                            <span className="dr-panel-title">{title}</span>
                        </div>
                    )}
                    {actions ? <div className="dr-panel-actions">{actions}</div> : null}
                </header>
            ) : null}
            {isOpen ? <div className={cx("dr-panel-body", bodyClassName)}>{children}</div> : null}
        </section>
    )
}

/**
 * A panel that floats over the page and can be dragged by its header (position remembered with `persistKey`).
 * `defaultPosition` { x, y } (px from the top-left; negative = from the right/bottom); `onClose` adds an ✕.
 * @param {Record<string, any>} props
 */
export function FloatingPanel({
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
}: Record<string, any>) {
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
    return (
        <section
            ref={panel}
            className={cx("dr-panel dr-glass dr-floating", className)}
            style={{ width, ...placement, ...style }}
            {...rest}
        >
            <header className="dr-panel-head dr-floating-head" {...drag}>
                <div className="dr-panel-toggle dr-panel-toggle--static">
                    <Icon name="grip" size={14} />
                    {icon ? <Icon name={icon} size={15} /> : null}
                    <span className="dr-panel-title">{title}</span>
                </div>
                <div className="dr-panel-actions" onPointerDown={(event) => event.stopPropagation()}>
                    {actions}
                    {onClose ? (
                        <button type="button" className="dr-panel-close" aria-label="Close" onClick={onClose}>
                            <Icon name="close" size={14} />
                        </button>
                    ) : null}
                </div>
            </header>
            <div className="dr-panel-body">{children}</div>
        </section>
    )
}

/**
 * Two panes with a draggable divider. `direction` "row" (side by side) | "column"; `size` of the first pane (px or
 * %, controlled with onSizeChange) or `defaultSize`; `min` / `max` px; `persistKey`.
 * @param {Record<string, any>} props
 */
export function SplitPane({
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
}: Record<string, any>) {
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
    return (
        <div ref={container} className={cx("dr-split", `dr-split--${direction}`, className)} {...rest}>
            <div
                ref={first}
                className="dr-split-pane"
                style={{ flexBasis: typeof current === "number" ? `${current}px` : current }}
            >
                {a}
            </div>
            <div
                className="dr-split-divider"
                role="separator"
                aria-orientation={row ? "vertical" : "horizontal"}
                tabIndex={0}
                onKeyDown={(event) => {
                    const step = event.shiftKey ? 40 : 10
                    const now = row ? first.current.offsetWidth : first.current.offsetHeight
                    if ((row && event.key === "ArrowLeft") || (!row && event.key === "ArrowUp")) {
                        set(Math.max(min, now - step))
                    } else if ((row && event.key === "ArrowRight") || (!row && event.key === "ArrowDown")) {
                        set(now + step)
                    }
                }}
                {...drag}
            />
            <div className="dr-split-pane dr-split-pane--rest">{b}</div>
        </div>
    )
}

/**
 * A corner grip for resizing a panel: `onResize({ dx, dy, done })` while dragging (px from where it started) and once
 * more with `done: true` on release. `corner` "bottom-right" | "bottom-left" (the one facing into the screen).
 * @param {{ onResize: (drag: { dx: number, dy: number, done: boolean }) => void, onStart?: () => void,
 *   corner?: "bottom-right" | "bottom-left", label?: string, className?: string } & Record<string, any>} props
 */
export function ResizeHandle({
    onResize,
    onStart,
    corner = "bottom-right",
    label = "Resize",
    className,
    ...rest
}: {
    onResize: (drag: { dx: number; dy: number; done: boolean }) => void
    onStart?: () => void
    corner?: "bottom-right" | "bottom-left"
    label?: string
    className?: string
} & Record<string, any>) {
    const start = useRef(null)
    const report = (event, done) =>
        start.current && onResize({ dx: event.clientX - start.current.x, dy: event.clientY - start.current.y, done })
    return (
        <div
            className={cx("dr-resize-handle", `dr-resize-handle--${corner}`, className)}
            role="separator"
            aria-label={label}
            title={label}
            onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.setPointerCapture?.(event.pointerId)
                start.current = { x: event.clientX, y: event.clientY }
                onStart?.()
            }}
            onPointerMove={(event) => report(event, false)}
            onPointerUp={(event) => {
                report(event, true)
                start.current = null
            }}
            onPointerCancel={(event) => {
                report(event, true)
                start.current = null
            }}
            {...rest}
        />
    )
}

/**
 * The app's top bar: `title` (and `icon`), `left` / center `children` / `right` slots.
 * @param {Record<string, any>} props
 */
export function TopBar({ title, icon, left, right, className, children, ...rest }: Record<string, any>) {
    return (
        <header className={cx("dr-topbar", className)} {...rest}>
            <div className="dr-topbar-left">
                {icon ? <Icon name={icon} size={18} /> : null}
                {title ? <span className="dr-title">{title}</span> : null}
                {left}
            </div>
            <div className="dr-topbar-center">{children}</div>
            <div className="dr-topbar-right">{right}</div>
        </header>
    )
}

/**
 * A row of controls (buttons, selects, separators). `floating` gives it a glass background (over a view).
 * @param {Record<string, any>} props
 */
export function Toolbar({ floating = false, vertical = false, className, children, ...rest }: Record<string, any>) {
    return (
        <div
            className={cx(
                "dr-toolbar",
                floating && "dr-toolbar--floating dr-glass",
                vertical && "dr-toolbar--vertical",
                className,
            )}
            role="toolbar"
            {...rest}
        >
            {children}
        </div>
    )
}

/**
 * A bar pinned to the bottom of its container, above Desktop's dock (status lines, playback controls).
 * @param {Record<string, any>} props
 */
export function BottomBar({ className, children, ...rest }: Record<string, any>) {
    return (
        <footer className={cx("dr-bottombar", className)} {...rest}>
            {children}
        </footer>
    )
}

/**
 * A thin divider; `vertical` inside rows/toolbars.
 * @param {Record<string, any>} props
 */
export function Separator({ vertical = false, className, ...rest }: Record<string, any>) {
    return <span className={cx("dr-sep", vertical && "dr-sep--vertical", className)} role="separator" {...rest} />
}

/**
 * Flex helpers: `gap` (px), `align`, `justify`, `wrap`, `grow`.
 * @param {Record<string, any>} props
 */
export function Row({
    gap = 8,
    align = "center",
    justify,
    wrap = false,
    grow = false,
    className,
    style,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div
            className={cx("dr-row", className)}
            style={{
                gap,
                alignItems: align,
                justifyContent: justify,
                flexWrap: wrap ? "wrap" : undefined,
                flex: grow ? 1 : undefined,
                ...style,
            }}
            {...rest}
        >
            {children}
        </div>
    )
}
/** @param {Record<string, any>} props */
export function Column({
    gap = 8,
    align,
    justify,
    grow = false,
    className,
    style,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div
            className={cx("dr-col", className)}
            style={{ gap, alignItems: align, justifyContent: justify, flex: grow ? 1 : undefined, ...style }}
            {...rest}
        >
            {children}
        </div>
    )
}
/** Takes the free space in a Row/Column. */
export function Spacer() {
    return <span className="dr-spacer" />
}

/**
 * A HUD overlay pinned to a corner of a positioned parent (a 3D view, a video): `position` "top-left" | "top-right" |
 * "bottom-left" | "bottom-right" | "top" | "bottom" | "center".
 * @param {Record<string, any>} props
 */
export function Hud({ position = "top-left", className, children, ...rest }: Record<string, any>) {
    return (
        <div className={cx("dr-hud", `dr-hud--${position}`, className)} {...rest}>
            {children}
        </div>
    )
}

/**
 * Headings and text in the theme's type: level 1 (page title), 2 (section head), 3 (micro-label).
 * @param {Record<string, any>} props
 */
export function Heading({ level = 2, className, children, ...rest }: Record<string, any>) {
    const Tag = `h${level}`
    return (
        <Tag className={cx(`dr-h${level}`, className)} {...rest}>
            {children}
        </Tag>
    )
}
/** @param {Record<string, any>} props */
export function Label({ className, children, ...rest }: Record<string, any>) {
    return (
        <span className={cx("dr-label", className)} {...rest}>
            {children}
        </span>
    )
}
/**
 * Text: `muted`, `mono`, `small`, `tone` ("ok" | "warn" | "danger").
 * @param {Record<string, any>} props
 */
export function Text({ as = "span", muted, mono, small, tone, className, children, ...rest }: Record<string, any>) {
    const Tag = as
    return (
        <Tag
            className={cx(
                "dr-text",
                muted && "dr-muted",
                mono && "dr-mono",
                small && "dr-small",
                tone && `dr-${tone}`,
                className,
            )}
            {...rest}
        >
            {children}
        </Tag>
    )
}
/** @param {Record<string, any>} props */
export function Link({ className, children, ...rest }: Record<string, any>) {
    return (
        <a className={cx("dr-link", className)} {...rest}>
            {children}
        </a>
    )
}

/**
 * Full-page app frame: top bar, optional side, main area (fills the viewport). `insetBottom` ends the main area above
 * Desktop's dock (without a bottomBar; a BottomBar already does).
 * @param {Record<string, any>} props
 */
export function AppShell({
    topBar,
    sidebar,
    bottomBar,
    insetBottom = false,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div className={cx("dr-shell", insetBottom && "dr-shell--inset", className)} {...rest}>
            {topBar}
            <div className="dr-shell-main">
                {sidebar}
                <main className="dr-shell-content">{children}</main>
            </div>
            {bottomBar}
        </div>
    )
}

/**
 * Another page embedded in this one (an iframe that fills its positioned parent, no border, on the page background).
 * `title` names it for screen readers; other props go to the iframe (`src`, `allow`, `sandbox`, …).
 */
export function Embed({ title, className, ...rest }) {
    return <iframe title={title} className={cx("dr-embed", className)} {...rest} />
}

/**
 * A big selectable card (a picker's choice: a robot, a template, a recording). A button: `onClick`, `selected`,
 * `disabled`. `media` (an image, an icon element) or `icon` (an Icon name) on top, then `title` and `subtitle`, then
 * `children`. `align` "center" (a picker's icons) | "start" (text cards: a featured item with its description). With
 * `loading` it is a placeholder (no click).
 * @param {{ title?: any, subtitle?: any, media?: any, icon?: string, selected?: boolean, loading?: boolean,
 *   align?: "center" | "start", onClick?: (event: any) => void, disabled?: boolean, className?: string }} props
 */
export function Tile({
    title,
    subtitle,
    media,
    icon,
    selected,
    loading = false,
    align = "center",
    className,
    children,
    ...rest
}: {
    title?: any
    subtitle?: any
    media?: any
    icon?: string
    selected?: boolean
    loading?: boolean
    align?: "center" | "start"
    onClick?: (event: any) => void
    disabled?: boolean
    className?: string
}) {
    if (loading) {
        return (
            <div className={cx("dr-tile", "dr-tile--loading", className)} aria-hidden={true}>
                <span className="dr-tile__media dr-skeleton" />
                <span className="dr-tile__bar dr-skeleton" />
                <span className="dr-tile__bar dr-tile__bar--short dr-skeleton" />
            </div>
        )
    }
    return (
        <button
            type="button"
            className={cx("dr-tile", align === "start" && "dr-tile--start", selected && "dr-tile--selected", className)}
            aria-pressed={selected === undefined ? undefined : !!selected}
            {...rest}
        >
            {media || icon ? <span className="dr-tile__media">{media ?? <Icon name={icon} size={40} />}</span> : null}
            {title ? <span className="dr-tile__title">{title}</span> : null}
            {subtitle ? <span className="dr-tile__subtitle">{subtitle}</span> : null}
            {children}
        </button>
    )
}

/** Tiles in a responsive grid: as many columns of at least `min` px as fit. */
export function TileGrid({ min = 150, className, style, children, ...rest }) {
    return (
        <div
            role="list"
            className={cx("dr-tile-grid", className)}
            style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${typeof min === "number" ? `${min}px` : min}, 1fr))`,
                ...style,
            }}
            {...rest}
        >
            {children}
        </div>
    )
}
