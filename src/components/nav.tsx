// Navigation and overlays: tabs, segmented controls, menus, context menus, popovers, tooltips, sidebars, a nav
// rail, a stepper, breadcrumbs and a command palette.
import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cx } from "../cx"
import { Icon } from "./icon"
import { useEscape, useHotkeys } from "../hooks"

const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect

function useControllable(value, initial, onChange) {
    const [inner, setInner] = useState(initial)
    const controlled = value !== undefined
    const set = useCallback(
        (next) => {
            if (!controlled) {
                setInner(next)
            }
            onChange?.(next)
        },
        [controlled, onChange],
    )
    return [controlled ? value : inner, set]
}

/** [[value, label]] or [{ value, label, … }] → [{ value, label, … }] */
const normalizeItems = (items = []) =>
    items.map((item) =>
        Array.isArray(item)
            ? { value: item[0], label: item[1] }
            : typeof item === "string"
              ? { value: item, label: item }
              : item,
    )

/** Renders into document.body (nothing during server rendering). */
function Portal({ children }) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    return mounted && typeof document !== "undefined" ? createPortal(children, document.body) : null
}

// ── Tabs / Segmented ──

function choiceGroup(
    baseClass,
    { items, value, onChange, variant, size, vertical = false, className, label, ...rest },
) {
    const list = normalizeItems(items)
    const onKeyDown = (event) => {
        const index = list.findIndex((item) => item.value === value)
        const [next, back] = vertical ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"]
        const delta = event.key === next ? 1 : event.key === back ? -1 : 0
        if (!delta) {
            return
        }
        event.preventDefault()
        for (let step = 1; step <= list.length; step++) {
            const next = list[(index + delta * step + list.length * step) % list.length]
            if (!next.disabled) {
                onChange?.(next.value)
                const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(String(next.value)) : String(next.value)
                event.currentTarget.querySelector(`[data-value="${escaped}"]`)?.focus()
                break
            }
        }
    }
    return (
        <div
            className={cx(
                baseClass,
                variant && `${baseClass}--${variant}`,
                size === "sm" && `${baseClass}--sm`,
                vertical && `${baseClass}--vertical`,
                className,
            )}
            role="tablist"
            aria-label={label}
            aria-orientation={vertical ? "vertical" : undefined}
            onKeyDown={onKeyDown}
            {...rest}
        >
            {list.map((item) => {
                const active = item.value === value
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        data-value={item.value}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        disabled={item.disabled}
                        title={item.title}
                        className={cx(`${baseClass}__item`, active && `${baseClass}__item--active`)}
                        onClick={() => onChange?.(item.value)}
                        {...item.props}
                    >
                        {item.icon ? <Icon name={item.icon} size={15} /> : null}
                        {item.label !== undefined ? <span>{item.label}</span> : null}
                        {item.badge !== undefined && item.badge !== null ? (
                            <span className={`${baseClass}__badge`}>{item.badge}</span>
                        ) : null}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Tabs: `items` as [{ value, label, icon, badge, disabled, title, props }] or [[value, label]] (`props`: more
 * attributes for that item's button, e.g. data-*). `vertical` stacks them (↑/↓ move).
 * @param {{ items: any[], value: any, onChange?: (value: any) => void, variant?: "line" | "pill", size?: "sm" | "md",
 *   vertical?: boolean, className?: string, label?: string }} props
 */
export function Tabs({
    variant = "line",
    ...props
}: {
    items: any[]
    value: any
    onChange?: (value: any) => void
    variant?: "line" | "pill"
    size?: "sm" | "md"
    vertical?: boolean
    className?: string
    label?: string
}) {
    return choiceGroup("dr-tabs", { variant, ...props })
}

/** A compact segmented control (same API as Tabs). */
export function Segmented(props) {
    return choiceGroup("dr-segmented", props)
}

// ── Popover ──

/** Where to put a `floating` box of size (w, h) next to an anchor rect, kept on screen. */
export function placeFloating(anchor, size, placement = "bottom-start", gap = 6) {
    const [side, align = "center"] = placement.split("-")
    let x = 0
    let y = 0
    const vw = globalThis.innerWidth ?? 1024
    const vh = globalThis.innerHeight ?? 768
    const along = (start, length, own) =>
        align === "start" ? start : align === "end" ? start + length - own : start + (length - own) / 2
    let actualSide = side
    if (side === "bottom" && anchor.bottom + gap + size.height > vh && anchor.top - gap - size.height > 0) {
        actualSide = "top"
    } else if (side === "top" && anchor.top - gap - size.height < 0) {
        actualSide = "bottom"
    } else if (side === "right" && anchor.right + gap + size.width > vw) {
        actualSide = "left"
    } else if (side === "left" && anchor.left - gap - size.width < 0) {
        actualSide = "right"
    }
    if (actualSide === "bottom" || actualSide === "top") {
        x = along(anchor.left, anchor.width, size.width)
        y = actualSide === "bottom" ? anchor.bottom + gap : anchor.top - gap - size.height
    } else {
        y = along(anchor.top, anchor.height, size.height)
        x = actualSide === "right" ? anchor.right + gap : anchor.left - gap - size.width
    }
    return {
        x: Math.max(4, Math.min(x, vw - size.width - 4)),
        y: Math.max(4, Math.min(y, vh - size.height - 4)),
        side: actualSide,
    }
}

/** A floating box positioned at an anchor element or a point, in a portal; closes on outside click / Escape. */
function Floating({ anchor, point, placement, onClose, className, children, role = "dialog", style, ...rest }) {
    const box = useRef(null)
    const [position, setPosition] = useState({ x: -9999, y: -9999 })
    const place = useRef(() => {})
    place.current = () => {
        const element = box.current
        if (!element) {
            return
        }
        const size = { width: element.offsetWidth, height: element.offsetHeight }
        const rect = point
            ? { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 }
            : anchor?.getBoundingClientRect()
        if (rect) {
            setPosition(placeFloating(rect, size, point ? "bottom-start" : placement, point ? 2 : 6))
        }
    }
    // the box mounts a render later (Portal), so it places itself once it exists
    const setBox = useCallback((element) => {
        box.current = element
        if (element) {
            place.current()
        }
    }, [])
    useIsoLayoutEffect(() => {
        const update = () => place.current()
        update()
        addEventListener("resize", update)
        addEventListener("scroll", update, true)
        return () => {
            removeEventListener("resize", update)
            removeEventListener("scroll", update, true)
        }
    }, [anchor, point?.x, point?.y, placement])
    useEffect(() => {
        const onDown = (event) => {
            if (box.current?.contains(event.target) || anchor?.contains?.(event.target)) {
                return
            }
            onClose?.()
        }
        const timer = setTimeout(() => document.addEventListener("pointerdown", onDown, true))
        return () => {
            clearTimeout(timer)
            document.removeEventListener("pointerdown", onDown, true)
        }
    }, [anchor, onClose])
    useEscape(() => onClose?.(), true)
    return (
        <Portal>
            <div
                ref={setBox}
                role={role}
                className={cx("dr-floating", className)}
                style={{ left: position.x, top: position.y, ...style }}
                {...rest}
            >
                {children}
            </div>
        </Portal>
    )
}

/**
 * A popover anchored to its trigger.
 * @param {{ trigger: any, children: any, open?: boolean, onOpenChange?: (open: boolean) => void, defaultOpen?: boolean,
 *   placement?: string, className?: string, style?: object }} props
 *   `trigger`: an element (gets onClick + ref) or `(props) => element`
 */
export function Popover({
    trigger,
    children,
    open,
    onOpenChange,
    defaultOpen = false,
    placement = "bottom-start",
    className,
    style,
}: {
    trigger: any
    children: any
    open?: boolean
    onOpenChange?: (open: boolean) => void
    defaultOpen?: boolean
    placement?: string
    className?: string
    style?: object
}) {
    const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange)
    const [anchor, setAnchor] = useState(null)
    const triggerProps = {
        ref: setAnchor,
        onClick: () => setOpen(!isOpen),
        "aria-expanded": isOpen,
        "aria-haspopup": "dialog",
    }
    const triggerElement =
        typeof trigger === "function" ? (
            trigger({ ...triggerProps, open: isOpen })
        ) : isValidElement(trigger) ? (
            cloneElement(trigger, triggerProps)
        ) : (
            <span {...triggerProps}>{trigger}</span>
        )
    return (
        <span className="dr-popover-anchor">
            {triggerElement}
            {isOpen && anchor ? (
                <Floating
                    anchor={anchor}
                    placement={placement}
                    onClose={() => setOpen(false)}
                    className={cx("dr-popover", className)}
                    style={style}
                >
                    {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
                </Floating>
            ) : null}
        </span>
    )
}

// ── Menu ──

/** A menu item's own DOM attributes: its `data-*` (a test id) and `aria-*` keys, and `id`. */
function domProps(item) {
    return Object.fromEntries(
        Object.entries(item).filter(([key]) => key === "id" || key.startsWith("data-") || key.startsWith("aria-")),
    )
}

/**
 * A menu's items in place (inside a Popover, a panel): what Menu and MenuAt show. `items` as for Menu; `onClose` after
 * a pick (unless the item `keepOpen`s).
 * @param {{ items: any[], onClose?: () => void, autoFocus?: boolean }} props
 */
export function MenuList({
    items,
    onClose,
    autoFocus = true,
}: {
    items: any[]
    onClose?: () => void
    autoFocus?: boolean
}) {
    const list = useRef(null)
    const focusable = () => [...(list.current?.querySelectorAll(".dr-menu__item:not([disabled])") ?? [])]
    useEffect(() => {
        if (autoFocus) {
            focusable()[0]?.focus()
        }
    }, [])
    const onKeyDown = (event) => {
        const elements = focusable()
        const index = elements.indexOf(document.activeElement)
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            const delta = event.key === "ArrowDown" ? 1 : -1
            elements[(index + delta + elements.length) % elements.length]?.focus()
        } else if (event.key === "Home") {
            elements[0]?.focus()
        } else if (event.key === "End") {
            elements.at(-1)?.focus()
        } else if (event.key === "Tab") {
            onClose?.()
        }
    }
    return (
        <div className="dr-menu" role="menu" ref={list} onKeyDown={onKeyDown}>
            {items.map((item, index) => {
                if (item === "-" || item?.separator) {
                    return <div key={index} className="dr-menu__sep" role="separator" />
                }
                if (item.heading) {
                    return (
                        <div key={index} className="dr-menu__heading">
                            {item.heading}
                        </div>
                    )
                }
                return (
                    <button
                        key={item.key ?? index}
                        type="button"
                        role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                        aria-checked={item.checked}
                        disabled={item.disabled}
                        title={item.title}
                        className={cx("dr-menu__item", item.danger && "dr-menu__item--danger")}
                        {...domProps(item)}
                        onClick={() => {
                            item.onSelect?.()
                            if (!item.keepOpen) {
                                onClose?.()
                            }
                        }}
                    >
                        <span className="dr-menu__icon">
                            {item.checked !== undefined ? (
                                item.checked ? (
                                    <Icon name="check" size={14} />
                                ) : null
                            ) : item.icon ? (
                                <Icon name={item.icon} size={14} />
                            ) : null}
                        </span>
                        <span className="dr-menu__label">{item.label}</span>
                        {item.shortcut ? <span className="dr-menu__shortcut">{item.shortcut}</span> : null}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * A dropdown menu. An item's `data-*` / `aria-*` keys (and `id`) go on its button, like other components' DOM props.
 * @param {{ items: ({ label: any, icon?: string, onSelect?: () => void, danger?: boolean, disabled?: boolean,
 *   checked?: boolean, shortcut?: string, title?: string, keepOpen?: boolean, [dataOrAria: string]: any } | "-" |
 *   { heading: any })[],
 *   trigger: any, placement?: string, open?: boolean, onOpenChange?: (open: boolean) => void, className?: string }} props
 */
export function Menu({
    items,
    trigger,
    placement = "bottom-start",
    open,
    onOpenChange,
    className,
}: {
    items: (
        | {
              label: any
              icon?: string
              onSelect?: () => void
              danger?: boolean
              disabled?: boolean
              checked?: boolean
              shortcut?: string
              title?: string
              keepOpen?: boolean
              [dataOrAria: string]: any
          }
        | "-"
        | { heading: any }
    )[]
    trigger: any
    placement?: string
    open?: boolean
    onOpenChange?: (open: boolean) => void
    className?: string
}) {
    const [isOpen, setOpen] = useControllable(open, false, onOpenChange)
    const [anchor, setAnchor] = useState(null)
    const triggerProps = {
        ref: setAnchor,
        onClick: () => setOpen(!isOpen),
        "aria-expanded": isOpen,
        "aria-haspopup": "menu",
        onKeyDown: (event) => {
            if (event.key === "ArrowDown" && !isOpen) {
                event.preventDefault()
                setOpen(true)
            }
        },
    }
    const triggerElement =
        typeof trigger === "function" ? (
            trigger({ ...triggerProps, open: isOpen })
        ) : isValidElement(trigger) ? (
            cloneElement(trigger, triggerProps)
        ) : (
            <button type="button" className="dr-menu-trigger" {...triggerProps}>
                {trigger ?? <Icon name="more-horizontal" />}
            </button>
        )
    const close = () => {
        setOpen(false)
        anchor?.focus?.()
    }
    return (
        <span className="dr-popover-anchor">
            {triggerElement}
            {isOpen && anchor ? (
                <Floating
                    anchor={anchor}
                    placement={placement}
                    onClose={close}
                    role="presentation"
                    className={className}
                >
                    <MenuList items={items} onClose={close} />
                </Floating>
            ) : null}
        </span>
    )
}

/**
 * Right-click (or long-press on touch) opens a menu at the pointer.
 * @param {{ items: any[] | ((event: any) => any[]), children: any, disabled?: boolean, className?: string }} props
 */
export function ContextMenu({
    items,
    children,
    disabled,
    className,
    ...rest
}: {
    items: any[] | ((event: any) => any[])
    children: any
    disabled?: boolean
    className?: string
}) {
    const [menu, setMenu] = useState(null)
    const press = useRef(null)
    const openAt = (event, x, y) => {
        const list = typeof items === "function" ? items(event) : items
        if (list?.length) {
            setMenu({ x, y, items: list })
        }
    }
    return (
        <div
            className={cx("dr-context-menu", className)}
            onContextMenu={
                disabled
                    ? undefined
                    : (event) => {
                          event.preventDefault()
                          openAt(event, event.clientX, event.clientY)
                      }
            }
            onPointerDown={
                disabled
                    ? undefined
                    : (event) => {
                          if (event.pointerType !== "touch") {
                              return
                          }
                          const { clientX, clientY } = event
                          press.current = setTimeout(() => openAt(event, clientX, clientY), 550)
                      }
            }
            onPointerUp={() => clearTimeout(press.current)}
            onPointerMove={() => clearTimeout(press.current)}
            onPointerCancel={() => clearTimeout(press.current)}
            {...rest}
        >
            {children}
            {menu ? (
                <Floating point={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} role="presentation">
                    <MenuList items={menu.items} onClose={() => setMenu(null)} />
                </Floating>
            ) : null}
        </div>
    )
}

/**
 * A menu open at a screen point, for triggers ContextMenu can't tell apart (a 3D view's right click that isn't a
 * right-drag pan, say). `children` go above the items (a heading line, or an inline form instead of `items`).
 * @param {{ x: number, y: number, items?: any[], onClose: () => void, children?: any, className?: string } & Record<string, any>} props
 */
export function MenuAt({
    x,
    y,
    items = [],
    onClose,
    children,
    className,
    ...rest
}: { x: number; y: number; items?: any[]; onClose: () => void; children?: any; className?: string } & Record<
    string,
    any
>) {
    return (
        <Floating point={{ x, y }} onClose={onClose} role="presentation" className={className} {...rest}>
            {children}
            {items.length ? <MenuList items={items} onClose={onClose} autoFocus={!children} /> : null}
        </Floating>
    )
}

// ── Tooltip ──

/**
 * A hover / focus tooltip.
 * @param {{ content: any, children: any, delay?: number, placement?: string, disabled?: boolean }} props
 */
export function Tooltip({
    content,
    children,
    delay = 350,
    placement = "top",
    disabled,
}: {
    content: any
    children: any
    delay?: number
    placement?: string
    disabled?: boolean
}) {
    const [anchor, setAnchor] = useState(null)
    const [open, setOpen] = useState(false)
    const timer = useRef(null)
    useEffect(() => () => clearTimeout(timer.current), [])
    const show = () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setOpen(true), delay)
    }
    const hide = () => {
        clearTimeout(timer.current)
        setOpen(false)
    }
    const handlers = { onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide }
    const child = isValidElement(children) ? (
        cloneElement(children, { ref: setAnchor, ...handlers })
    ) : (
        <span ref={setAnchor} {...handlers}>
            {children}
        </span>
    )
    return (
        <span className="dr-popover-anchor">
            {child}
            {open && anchor && !disabled && content ? (
                <TooltipBox anchor={anchor} placement={placement}>
                    {content}
                </TooltipBox>
            ) : null}
        </span>
    )
}

function TooltipBox({ anchor, placement, children }) {
    const box = useRef(null)
    const [position, setPosition] = useState({ x: -9999, y: -9999 })
    useIsoLayoutEffect(() => {
        if (box.current) {
            setPosition(
                placeFloating(
                    anchor.getBoundingClientRect(),
                    { width: box.current.offsetWidth, height: box.current.offsetHeight },
                    placement,
                    6,
                ),
            )
        }
    }, [anchor, placement])
    return (
        <Portal>
            <div ref={box} role="tooltip" className="dr-tooltip" style={{ left: position.x, top: position.y }}>
                {children}
            </div>
        </Portal>
    )
}

// ── Sidebar / NavRail ──

/**
 * A collapsible side panel with titled sections.
 * @param {{ title?: any, sections?: { title?: any, content: any, key?: string }[], children?: any, collapsed?: boolean,
 *   onCollapsedChange?: (collapsed: boolean) => void, side?: "left" | "right", width?: number | string,
 *   footer?: any, className?: string, style?: object }} props
 */
export function Sidebar({
    title,
    sections,
    children,
    collapsed,
    onCollapsedChange,
    side = "left",
    width = 260,
    footer,
    className,
    style,
    ...rest
}: {
    title?: any
    sections?: { title?: any; content: any; key?: string }[]
    children?: any
    collapsed?: boolean
    onCollapsedChange?: (collapsed: boolean) => void
    side?: "left" | "right"
    width?: number | string
    footer?: any
    className?: string
    style?: object
}) {
    const [isCollapsed, setCollapsed] = useControllable(collapsed, false, onCollapsedChange)
    return (
        <aside
            className={cx("dr-sidebar", `dr-sidebar--${side}`, isCollapsed && "dr-sidebar--collapsed", className)}
            style={{ width: isCollapsed ? undefined : width, ...style }}
            {...rest}
        >
            <div className="dr-sidebar__head">
                {!isCollapsed && title ? <div className="dr-sidebar__title dr-h3">{title}</div> : null}
                <button
                    type="button"
                    className="dr-sidebar__toggle"
                    onClick={() => setCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-expanded={!isCollapsed}
                >
                    <Icon name={(side === "left") === isCollapsed ? "chevron-right" : "chevron-left"} size={14} />
                </button>
            </div>
            {isCollapsed ? null : (
                <div className="dr-sidebar__body dr-scroll">
                    {sections?.map((section, index) => (
                        <section key={section.key ?? index} className="dr-sidebar__section">
                            {section.title ? (
                                <div className="dr-sidebar__section-title dr-label">{section.title}</div>
                            ) : null}
                            {section.content}
                        </section>
                    ))}
                    {children}
                </div>
            )}
            {!isCollapsed && footer ? <div className="dr-sidebar__foot">{footer}</div> : null}
        </aside>
    )
}

/**
 * A vertical icon rail (Desktop's left rail, the Controller's panel switcher).
 * @param {{ items: { value: any, icon: string, label: string, badge?: any, disabled?: boolean }[], value: any,
 *   onChange?: (value: any) => void, showLabels?: boolean, footer?: any, className?: string }} props
 */
export function NavRail({
    items = [],
    value,
    onChange,
    showLabels = false,
    footer,
    className,
    ...rest
}: {
    items: { value: any; icon: string; label: string; badge?: any; disabled?: boolean }[]
    value: any
    onChange?: (value: any) => void
    showLabels?: boolean
    footer?: any
    className?: string
}) {
    return (
        <nav className={cx("dr-navrail", showLabels && "dr-navrail--labels", className)} {...rest}>
            <div className="dr-navrail__items">
                {items.map((item) => {
                    const active = item.value === value
                    return (
                        <button
                            key={item.value}
                            type="button"
                            title={item.label}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                            disabled={item.disabled}
                            className={cx("dr-navrail__item", active && "dr-navrail__item--active")}
                            onClick={() => onChange?.(item.value)}
                        >
                            <Icon name={item.icon} size={20} />
                            {showLabels ? <span className="dr-navrail__label">{item.label}</span> : null}
                            {item.badge !== undefined && item.badge !== null ? (
                                <span className="dr-navrail__badge">{item.badge}</span>
                            ) : null}
                        </button>
                    )
                })}
            </div>
            {footer ? <div className="dr-navrail__foot">{footer}</div> : null}
        </nav>
    )
}

// ── Stepper ──

/**
 * Wizard steps, or a process's progress (a launch, an install).
 * @param {{ steps: { label: any, description?: any, state?: "done" | "current" | "todo" | "failed", key?: any }[],
 *   current?: number, onStep?: (index: number) => void, vertical?: boolean, className?: string }} props
 *   `onStep`: lets the user go back to a finished step. A step's own `state` wins over `current` (a process that
 *   reports each step, one of which may have failed).
 */
export function Stepper({
    steps = [],
    current = 0,
    onStep,
    vertical = false,
    className,
    ...rest
}: {
    steps: { label: any; description?: any; state?: "done" | "current" | "todo" | "failed"; key?: any }[]
    current?: number
    onStep?: (index: number) => void
    vertical?: boolean
    className?: string
}) {
    return (
        <ol className={cx("dr-stepper", vertical && "dr-stepper--vertical", className)} {...rest}>
            {steps.map((step, index) => {
                const state = step.state ?? (index < current ? "done" : index === current ? "current" : "todo")
                const clickable = onStep && index < current
                const Mark = clickable ? "button" : "span"
                return (
                    <li
                        key={step.key ?? index}
                        className={cx("dr-stepper__step", `dr-stepper__step--${state}`)}
                        data-state={state}
                        aria-current={state === "current" ? "step" : undefined}
                    >
                        {
                            <Mark
                                className="dr-stepper__mark"
                                type={clickable ? "button" : undefined}
                                onClick={clickable ? () => onStep(index) : undefined}
                            >
                                {state === "done" ? (
                                    <Icon name="check" size={12} />
                                ) : state === "failed" ? (
                                    "!"
                                ) : (
                                    index + 1
                                )}
                            </Mark>
                        }
                        <span className="dr-stepper__text">
                            <span className="dr-stepper__label">{step.label}</span>
                            {step.description ? <span className="dr-stepper__desc">{step.description}</span> : null}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

// ── Breadcrumbs ──

/**
 * @param {{ items: { label: any, onClick?: () => void, href?: string }[], className?: string }} props
 */
export function Breadcrumbs({
    items = [],
    className,
    ...rest
}: {
    items: { label: any; onClick?: () => void; href?: string }[]
    className?: string
}) {
    return (
        <nav className={cx("dr-breadcrumbs", className)} aria-label="Breadcrumb" {...rest}>
            {items.map((item, index) => {
                const last = index === items.length - 1
                const label = last ? (
                    <span className="dr-breadcrumbs__current" aria-current="page">
                        {item.label}
                    </span>
                ) : item.href || item.onClick ? (
                    <a
                        className="dr-breadcrumbs__link"
                        href={item.href ?? "#"}
                        onClick={
                            item.onClick
                                ? (event) => {
                                      event.preventDefault()
                                      item.onClick()
                                  }
                                : undefined
                        }
                    >
                        {item.label}
                    </a>
                ) : (
                    <span>{item.label}</span>
                )
                return (
                    <span key={index} className="dr-breadcrumbs__item">
                        {label}
                        {last ? null : <Icon name="chevron-right" size={12} className="dr-breadcrumbs__sep" />}
                    </span>
                )
            })}
        </nav>
    )
}

// ── CommandPalette ──

/** Fuzzy score of `query` in `text` (higher = better; -1 = no match). */
export function fuzzyScore(query, text) {
    const needle = query.toLowerCase().trim()
    const hay = String(text).toLowerCase()
    if (!needle) {
        return 0
    }
    const direct = hay.indexOf(needle)
    if (direct >= 0) {
        return 1000 - direct
    }
    let score = 0
    let at = 0
    let streak = 0
    for (const char of needle) {
        const found = hay.indexOf(char, at)
        if (found < 0) {
            return -1
        }
        streak = found === at ? streak + 1 : 0
        score += 1 + streak * 2 - Math.min(found - at, 5) * 0.2
        at = found + 1
    }
    return score
}

/**
 * ⌘K-style command list.
 * @param {{ open: boolean, onClose: () => void, commands: { id: string, label: string, group?: string, shortcut?: string,
 *   icon?: string, keywords?: string, run: () => void }[], placeholder?: string }} props
 */
export function CommandPalette({
    open,
    onClose,
    commands = [],
    placeholder = "Type a command…",
}: {
    open: boolean
    onClose: () => void
    commands: {
        id: string
        label: string
        group?: string
        shortcut?: string
        icon?: string
        keywords?: string
        run: () => void
    }[]
    placeholder?: string
}) {
    const [query, setQuery] = useState("")
    const [active, setActive] = useState(0)
    const input = useRef(null)
    useEffect(() => {
        if (open) {
            setQuery("")
            setActive(0)
            setTimeout(() => input.current?.focus())
        }
    }, [open])
    useEscape(() => onClose?.(), !!open)
    const matches = useMemo(
        () =>
            commands
                .map((command) => ({
                    command,
                    score: fuzzyScore(query, `${command.label} ${command.group ?? ""} ${command.keywords ?? ""}`),
                }))
                .filter((item) => item.score >= 0)
                .sort((a, b) => (query ? b.score - a.score : 0))
                .map((item) => item.command),
        [commands, query],
    )
    if (!open) {
        return null
    }
    const run = (command) => {
        onClose?.()
        command?.run?.()
    }
    const onKeyDown = (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive((index) => Math.min(matches.length - 1, index + 1))
        } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive((index) => Math.max(0, index - 1))
        } else if (event.key === "Enter") {
            event.preventDefault()
            run(matches[active])
        }
    }
    let lastGroup = null
    return (
        <Portal>
            <div
                className="dr-palette-scrim"
                onPointerDown={(event) => event.target === event.currentTarget && onClose?.()}
            >
                <div className="dr-palette" role="dialog" aria-label="Command palette">
                    <div className="dr-palette__search">
                        <Icon name="search" size={16} />
                        <input
                            ref={input}
                            className="dr-palette__input"
                            value={query}
                            placeholder={placeholder}
                            onChange={(event) => {
                                setQuery(event.target.value)
                                setActive(0)
                            }}
                            onKeyDown={onKeyDown}
                            aria-activedescendant={matches[active] ? `dr-cmd-${matches[active].id}` : undefined}
                        />
                    </div>
                    <div className="dr-palette__list dr-scroll" role="listbox">
                        {matches.length === 0 ? <div className="dr-palette__empty">No matching commands</div> : null}
                        {matches.map((command, index) => {
                            const heading =
                                !query && command.group && command.group !== lastGroup ? (
                                    <div key={`g-${command.group}`} className="dr-palette__group">
                                        {command.group}
                                    </div>
                                ) : null
                            lastGroup = command.group
                            return [
                                heading,
                                <div
                                    key={command.id}
                                    id={`dr-cmd-${command.id}`}
                                    role="option"
                                    aria-selected={index === active}
                                    className={cx("dr-palette__item", index === active && "dr-palette__item--active")}
                                    onPointerMove={() => setActive(index)}
                                    onClick={() => run(command)}
                                >
                                    {command.icon ? (
                                        <Icon name={command.icon} size={15} />
                                    ) : (
                                        <span className="dr-palette__noicon" />
                                    )}
                                    <span className="dr-palette__label">{command.label}</span>
                                    {command.shortcut ? (
                                        <span className="dr-palette__shortcut">{command.shortcut}</span>
                                    ) : null}
                                </div>,
                            ]
                        })}
                    </div>
                </div>
            </div>
        </Portal>
    )
}

/**
 * `const palette = useCommandPalette()` → `{ open, setOpen, toggle }`, opened with mod+k (⌘K / Ctrl+K).
 * Render `h(CommandPalette, { open: palette.open, onClose: () => palette.setOpen(false), commands })`.
 */
export function useCommandPalette(hotkey = "mod+k") {
    const [open, setOpen] = useState(false)
    useHotkeys({ [hotkey]: () => setOpen((value) => !value) })
    return { open, setOpen, toggle: () => setOpen((value) => !value) }
}
