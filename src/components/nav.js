// Navigation and overlays: tabs, segmented controls, menus, context menus, popovers, tooltips, sidebars, a nav
// rail, a stepper, breadcrumbs and a command palette.
import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cx, h } from "../h.js"
import { Icon } from "./icon.js"
import { useEscape, useHotkeys } from "../hooks.js"

const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect

function useControllable(value, initial, onChange) {
    const [inner, setInner] = useState(initial)
    const controlled = value !== undefined
    const set = useCallback((next) => {
        if (!controlled) {
            setInner(next)
        }
        onChange?.(next)
    }, [controlled, onChange])
    return [controlled ? value : inner, set]
}

/** [[value, label]] or [{ value, label, … }] → [{ value, label, … }] */
const normalizeItems = (items = []) =>
    items.map((
        item,
    ) => (Array.isArray(item)
        ? { value: item[0], label: item[1] }
        : typeof item === "string"
        ? { value: item, label: item }
        : item)
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
    return h(
        "div",
        {
            className: cx(
                baseClass,
                variant && `${baseClass}--${variant}`,
                size === "sm" && `${baseClass}--sm`,
                vertical && `${baseClass}--vertical`,
                className,
            ),
            role: "tablist",
            "aria-label": label,
            "aria-orientation": vertical ? "vertical" : undefined,
            onKeyDown,
            ...rest,
        },
        list.map((item) => {
            const active = item.value === value
            return h(
                "button",
                {
                    key: item.value,
                    type: "button",
                    role: "tab",
                    "data-value": item.value,
                    "aria-selected": active,
                    tabIndex: active ? 0 : -1,
                    disabled: item.disabled,
                    title: item.title,
                    className: cx(`${baseClass}__item`, active && `${baseClass}__item--active`),
                    onClick: () => onChange?.(item.value),
                    ...item.props,
                },
                item.icon ? h(Icon, { name: item.icon, size: 15 }) : null,
                item.label !== undefined ? h("span", null, item.label) : null,
                item.badge !== undefined && item.badge !== null
                    ? h("span", { className: `${baseClass}__badge` }, item.badge)
                    : null,
            )
        }),
    )
}

/**
 * Tabs: `items` as [{ value, label, icon, badge, disabled, title, props }] or [[value, label]] (`props`: more
 * attributes for that item's button, e.g. data-*). `vertical` stacks them (↑/↓ move).
 * @param {{ items: any[], value: any, onChange?: (value: any) => void, variant?: "line" | "pill", size?: "sm" | "md",
 *   vertical?: boolean, className?: string, label?: string }} props
 */
export function Tabs({ variant = "line", ...props }) {
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
    const along = (
        start,
        length,
        own,
    ) => (align === "start" ? start : align === "end" ? start + length - own : start + (length - own) / 2)
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
    useIsoLayoutEffect(() => {
        const update = () => {
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
    return h(
        Portal,
        null,
        h("div", {
            ref: box,
            role,
            className: cx("dr-floating", className),
            style: { left: position.x, top: position.y, ...style },
            ...rest,
        }, children),
    )
}

/**
 * A popover anchored to its trigger.
 * @param {{ trigger: any, children: any, open?: boolean, onOpenChange?: (open: boolean) => void, defaultOpen?: boolean,
 *   placement?: string, className?: string, style?: object }} props
 *   `trigger`: an element (gets onClick + ref) or `(props) => element`
 */
export function Popover(
    { trigger, children, open, onOpenChange, defaultOpen = false, placement = "bottom-start", className, style },
) {
    const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange)
    const [anchor, setAnchor] = useState(null)
    const triggerProps = {
        ref: setAnchor,
        onClick: () => setOpen(!isOpen),
        "aria-expanded": isOpen,
        "aria-haspopup": "dialog",
    }
    const triggerElement = typeof trigger === "function"
        ? trigger({ ...triggerProps, open: isOpen })
        : isValidElement(trigger)
        ? cloneElement(trigger, triggerProps)
        : h("span", triggerProps, trigger)
    return h(
        "span",
        { className: "dr-popover-anchor" },
        triggerElement,
        isOpen && anchor
            ? h(
                Floating,
                { anchor, placement, onClose: () => setOpen(false), className: cx("dr-popover", className), style },
                typeof children === "function" ? children({ close: () => setOpen(false) }) : children,
            )
            : null,
    )
}

// ── Menu ──

function MenuList({ items, onClose, autoFocus = true }) {
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
    return h(
        "div",
        { className: "dr-menu", role: "menu", ref: list, onKeyDown },
        items.map((item, index) => {
            if (item === "-" || item?.separator) {
                return h("div", { key: index, className: "dr-menu__sep", role: "separator" })
            }
            if (item.heading) {
                return h("div", { key: index, className: "dr-menu__heading" }, item.heading)
            }
            return h(
                "button",
                {
                    key: item.key ?? index,
                    type: "button",
                    role: item.checked !== undefined ? "menuitemcheckbox" : "menuitem",
                    "aria-checked": item.checked,
                    disabled: item.disabled,
                    title: item.title,
                    className: cx("dr-menu__item", item.danger && "dr-menu__item--danger"),
                    onClick: () => {
                        item.onSelect?.()
                        if (!item.keepOpen) {
                            onClose?.()
                        }
                    },
                },
                h(
                    "span",
                    { className: "dr-menu__icon" },
                    item.checked !== undefined
                        ? (item.checked ? h(Icon, { name: "check", size: 14 }) : null)
                        : item.icon
                        ? h(Icon, { name: item.icon, size: 14 })
                        : null,
                ),
                h("span", { className: "dr-menu__label" }, item.label),
                item.shortcut ? h("span", { className: "dr-menu__shortcut" }, item.shortcut) : null,
            )
        }),
    )
}

/**
 * A dropdown menu.
 * @param {{ items: ({ label: any, icon?: string, onSelect?: () => void, danger?: boolean, disabled?: boolean,
 *   checked?: boolean, shortcut?: string, title?: string, keepOpen?: boolean } | "-" | { heading: any })[],
 *   trigger: any, placement?: string, open?: boolean, onOpenChange?: (open: boolean) => void, className?: string }} props
 */
export function Menu({ items, trigger, placement = "bottom-start", open, onOpenChange, className }) {
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
    const triggerElement = typeof trigger === "function"
        ? trigger({ ...triggerProps, open: isOpen })
        : isValidElement(trigger)
        ? cloneElement(trigger, triggerProps)
        : h(
            "button",
            { type: "button", className: "dr-menu-trigger", ...triggerProps },
            trigger ?? h(Icon, { name: "more-horizontal" }),
        )
    const close = () => {
        setOpen(false)
        anchor?.focus?.()
    }
    return h(
        "span",
        { className: "dr-popover-anchor" },
        triggerElement,
        isOpen && anchor
            ? h(
                Floating,
                { anchor, placement, onClose: close, role: "presentation", className },
                h(MenuList, { items, onClose: close }),
            )
            : null,
    )
}

/**
 * Right-click (or long-press on touch) opens a menu at the pointer.
 * @param {{ items: any[] | ((event: any) => any[]), children: any, disabled?: boolean, className?: string }} props
 */
export function ContextMenu({ items, children, disabled, className, ...rest }) {
    const [menu, setMenu] = useState(null)
    const press = useRef(null)
    const openAt = (event, x, y) => {
        const list = typeof items === "function" ? items(event) : items
        if (list?.length) {
            setMenu({ x, y, items: list })
        }
    }
    return h(
        "div",
        {
            className: cx("dr-context-menu", className),
            onContextMenu: disabled ? undefined : (event) => {
                event.preventDefault()
                openAt(event, event.clientX, event.clientY)
            },
            onPointerDown: disabled ? undefined : (event) => {
                if (event.pointerType !== "touch") {
                    return
                }
                const { clientX, clientY } = event
                press.current = setTimeout(() => openAt(event, clientX, clientY), 550)
            },
            onPointerUp: () => clearTimeout(press.current),
            onPointerMove: () => clearTimeout(press.current),
            onPointerCancel: () => clearTimeout(press.current),
            ...rest,
        },
        children,
        menu
            ? h(
                Floating,
                { point: { x: menu.x, y: menu.y }, onClose: () => setMenu(null), role: "presentation" },
                h(MenuList, { items: menu.items, onClose: () => setMenu(null) }),
            )
            : null,
    )
}

// ── Tooltip ──

/**
 * A hover / focus tooltip.
 * @param {{ content: any, children: any, delay?: number, placement?: string, disabled?: boolean }} props
 */
export function Tooltip({ content, children, delay = 350, placement = "top", disabled }) {
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
    const child = isValidElement(children)
        ? cloneElement(children, { ref: setAnchor, ...handlers })
        : h("span", { ref: setAnchor, ...handlers }, children)
    return h(
        "span",
        { className: "dr-popover-anchor" },
        child,
        open && anchor && !disabled && content ? h(TooltipBox, { anchor, placement }, content) : null,
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
    return h(
        Portal,
        null,
        h(
            "div",
            { ref: box, role: "tooltip", className: "dr-tooltip", style: { left: position.x, top: position.y } },
            children,
        ),
    )
}

// ── Sidebar / NavRail ──

/**
 * A collapsible side panel with titled sections.
 * @param {{ title?: any, sections?: { title?: any, content: any, key?: string }[], children?: any, collapsed?: boolean,
 *   onCollapsedChange?: (collapsed: boolean) => void, side?: "left" | "right", width?: number | string,
 *   footer?: any, className?: string, style?: object }} props
 */
export function Sidebar(
    {
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
    },
) {
    const [isCollapsed, setCollapsed] = useControllable(collapsed, false, onCollapsedChange)
    return h(
        "aside",
        {
            className: cx("dr-sidebar", `dr-sidebar--${side}`, isCollapsed && "dr-sidebar--collapsed", className),
            style: { width: isCollapsed ? undefined : width, ...style },
            ...rest,
        },
        h(
            "div",
            { className: "dr-sidebar__head" },
            !isCollapsed && title ? h("div", { className: "dr-sidebar__title dr-h3" }, title) : null,
            h(
                "button",
                {
                    type: "button",
                    className: "dr-sidebar__toggle",
                    onClick: () => setCollapsed(!isCollapsed),
                    "aria-label": isCollapsed ? "Expand sidebar" : "Collapse sidebar",
                    "aria-expanded": !isCollapsed,
                },
                h(Icon, { name: (side === "left") === isCollapsed ? "chevron-right" : "chevron-left", size: 14 }),
            ),
        ),
        isCollapsed ? null : h(
            "div",
            { className: "dr-sidebar__body dr-scroll" },
            sections?.map((section, index) =>
                h(
                    "section",
                    { key: section.key ?? index, className: "dr-sidebar__section" },
                    section.title ? h("div", { className: "dr-sidebar__section-title dr-label" }, section.title) : null,
                    section.content,
                )
            ),
            children,
        ),
        !isCollapsed && footer ? h("div", { className: "dr-sidebar__foot" }, footer) : null,
    )
}

/**
 * A vertical icon rail (Desktop's left rail, the Controller's panel switcher).
 * @param {{ items: { value: any, icon: string, label: string, badge?: any, disabled?: boolean }[], value: any,
 *   onChange?: (value: any) => void, showLabels?: boolean, footer?: any, className?: string }} props
 */
export function NavRail({ items = [], value, onChange, showLabels = false, footer, className, ...rest }) {
    return h(
        "nav",
        { className: cx("dr-navrail", showLabels && "dr-navrail--labels", className), ...rest },
        h(
            "div",
            { className: "dr-navrail__items" },
            items.map((item) => {
                const active = item.value === value
                return h(
                    "button",
                    {
                        key: item.value,
                        type: "button",
                        title: item.label,
                        "aria-label": item.label,
                        "aria-current": active ? "page" : undefined,
                        disabled: item.disabled,
                        className: cx("dr-navrail__item", active && "dr-navrail__item--active"),
                        onClick: () => onChange?.(item.value),
                    },
                    h(Icon, { name: item.icon, size: 20 }),
                    showLabels ? h("span", { className: "dr-navrail__label" }, item.label) : null,
                    item.badge !== undefined && item.badge !== null
                        ? h("span", { className: "dr-navrail__badge" }, item.badge)
                        : null,
                )
            }),
        ),
        footer ? h("div", { className: "dr-navrail__foot" }, footer) : null,
    )
}

// ── Stepper ──

/**
 * Wizard steps.
 * @param {{ steps: { label: any, description?: any }[], current: number, onStep?: (index: number) => void,
 *   vertical?: boolean, className?: string }} props
 *   `onStep`: lets the user go back to a finished step
 */
export function Stepper({ steps = [], current = 0, onStep, vertical = false, className, ...rest }) {
    return h(
        "ol",
        { className: cx("dr-stepper", vertical && "dr-stepper--vertical", className), ...rest },
        steps.map((step, index) => {
            const state = index < current ? "done" : index === current ? "current" : "todo"
            const clickable = onStep && index < current
            return h(
                "li",
                {
                    key: index,
                    className: cx("dr-stepper__step", `dr-stepper__step--${state}`),
                    "aria-current": state === "current" ? "step" : undefined,
                },
                h(
                    clickable ? "button" : "span",
                    {
                        className: "dr-stepper__mark",
                        type: clickable ? "button" : undefined,
                        onClick: clickable ? () => onStep(index) : undefined,
                    },
                    state === "done" ? h(Icon, { name: "check", size: 12 }) : index + 1,
                ),
                h(
                    "span",
                    { className: "dr-stepper__text" },
                    h("span", { className: "dr-stepper__label" }, step.label),
                    step.description ? h("span", { className: "dr-stepper__desc" }, step.description) : null,
                ),
            )
        }),
    )
}

// ── Breadcrumbs ──

/**
 * @param {{ items: { label: any, onClick?: () => void, href?: string }[], className?: string }} props
 */
export function Breadcrumbs({ items = [], className, ...rest }) {
    return h(
        "nav",
        { className: cx("dr-breadcrumbs", className), "aria-label": "Breadcrumb", ...rest },
        items.map((item, index) => {
            const last = index === items.length - 1
            const label = last
                ? h("span", { className: "dr-breadcrumbs__current", "aria-current": "page" }, item.label)
                : item.href || item.onClick
                ? h("a", {
                    className: "dr-breadcrumbs__link",
                    href: item.href ?? "#",
                    onClick: item.onClick
                        ? (event) => {
                            event.preventDefault()
                            item.onClick()
                        }
                        : undefined,
                }, item.label)
                : h("span", null, item.label)
            return h(
                "span",
                { key: index, className: "dr-breadcrumbs__item" },
                label,
                last ? null : h(Icon, { name: "chevron-right", size: 12, className: "dr-breadcrumbs__sep" }),
            )
        }),
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
export function CommandPalette({ open, onClose, commands = [], placeholder = "Type a command…" }) {
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
    const matches = useMemo(() =>
        commands
            .map((command) => ({
                command,
                score: fuzzyScore(query, `${command.label} ${command.group ?? ""} ${command.keywords ?? ""}`),
            }))
            .filter((item) => item.score >= 0)
            .sort((a, b) => (query ? b.score - a.score : 0))
            .map((item) => item.command), [commands, query])
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
    return h(
        Portal,
        null,
        h(
            "div",
            {
                className: "dr-palette-scrim",
                onPointerDown: (event) => event.target === event.currentTarget && onClose?.(),
            },
            h(
                "div",
                { className: "dr-palette", role: "dialog", "aria-label": "Command palette" },
                h(
                    "div",
                    { className: "dr-palette__search" },
                    h(Icon, { name: "search", size: 16 }),
                    h("input", {
                        ref: input,
                        className: "dr-palette__input",
                        value: query,
                        placeholder,
                        onChange: (event) => {
                            setQuery(event.target.value)
                            setActive(0)
                        },
                        onKeyDown,
                        "aria-activedescendant": matches[active] ? `dr-cmd-${matches[active].id}` : undefined,
                    }),
                ),
                h(
                    "div",
                    { className: "dr-palette__list dr-scroll", role: "listbox" },
                    matches.length === 0 ? h("div", { className: "dr-palette__empty" }, "No matching commands") : null,
                    matches.map((command, index) => {
                        const heading = !query && command.group && command.group !== lastGroup
                            ? h("div", { key: `g-${command.group}`, className: "dr-palette__group" }, command.group)
                            : null
                        lastGroup = command.group
                        return [
                            heading,
                            h(
                                "div",
                                {
                                    key: command.id,
                                    id: `dr-cmd-${command.id}`,
                                    role: "option",
                                    "aria-selected": index === active,
                                    className: cx("dr-palette__item", index === active && "dr-palette__item--active"),
                                    onPointerMove: () => setActive(index),
                                    onClick: () => run(command),
                                },
                                command.icon
                                    ? h(Icon, { name: command.icon, size: 15 })
                                    : h("span", { className: "dr-palette__noicon" }),
                                h("span", { className: "dr-palette__label" }, command.label),
                                command.shortcut
                                    ? h("span", { className: "dr-palette__shortcut" }, command.shortcut)
                                    : null,
                            ),
                        ]
                    }),
                ),
            ),
        ),
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
