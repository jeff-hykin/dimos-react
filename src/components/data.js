// Data display: tables, trees, key/value readouts, stats, lists, logs, code, sparklines, an attitude indicator and a
// timeline scrubber.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cx, h } from "../h.js"
import { Icon } from "./icon.js"
import { copyText } from "../hooks.js"

const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect

/** Controlled when `value` is given, else internal state seeded from `initial`. */
function useControllable(value, initial, onChange) {
    const [inner, setInner] = useState(initial)
    const controlled = value !== undefined
    const current = controlled ? value : inner
    const set = (next) => {
        if (!controlled) {
            setInner(next)
        }
        onChange?.(next)
    }
    return [current, set]
}

// ── Table ──

const compareValues = (a, b) => {
    if (a === b) {
        return 0
    }
    if (a === undefined || a === null) {
        return 1
    }
    if (b === undefined || b === null) {
        return -1
    }
    if (typeof a === "number" && typeof b === "number") {
        return a - b
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/**
 * A sortable table.
 * @param {{
 *   columns: { key: string, label?: any, render?: (row: any, index: number) => any, sort?: boolean | ((a: any, b: any) => number),
 *     align?: "left" | "right" | "center", width?: string | number, value?: (row: any) => any }[],
 *   rows: any[], rowKey?: string | ((row: any, index: number) => any),
 *   sort?: { key: string, dir: "asc" | "desc" } | null, onSortChange?: (sort: any) => void, defaultSort?: any,
 *   onRowClick?: (row: any, index: number) => void, selected?: any, empty?: any, sticky?: boolean, compact?: boolean,
 *   maxHeight?: string | number, sortRows?: boolean, className?: string, style?: object,
 * }} props
 *   `sortRows: false`: the rows arrive already sorted (by a backend); the headers still show and change `sort`
 */
export function Table({
    columns,
    rows = [],
    rowKey,
    sort,
    onSortChange,
    defaultSort = null,
    onRowClick,
    selected,
    empty = "Nothing here yet",
    sticky = true,
    compact = false,
    maxHeight,
    sortRows = true,
    className,
    style,
    ...rest
}) {
    const [currentSort, setSort] = useControllable(sort, defaultSort, onSortChange)
    const sorted = useMemo(() => {
        if (!currentSort || !sortRows) {
            return rows
        }
        const column = columns.find((item) => item.key === currentSort.key)
        if (!column) {
            return rows
        }
        const read = column.value ?? ((row) => row?.[column.key])
        const compare = typeof column.sort === "function" ? column.sort : (a, b) => compareValues(read(a), read(b))
        const out = [...rows].sort(compare)
        return currentSort.dir === "desc" ? out.reverse() : out
    }, [rows, columns, currentSort?.key, currentSort?.dir, sortRows])
    const keyOf = (row, index) =>
        typeof rowKey === "function" ? rowKey(row, index) : rowKey ? row?.[rowKey] : row?.id ?? row?.key ?? index
    const onHeader = (column) => {
        if (!column.sort) {
            return
        }
        if (currentSort?.key !== column.key) {
            setSort({ key: column.key, dir: "asc" })
        } else if (currentSort.dir === "asc") {
            setSort({ key: column.key, dir: "desc" })
        } else {
            setSort(null)
        }
    }
    return h(
        "div",
        {
            className: cx("dr-table-wrap", "dr-scroll", className),
            style: { maxHeight, ...style },
            ...rest,
        },
        h(
            "table",
            { className: cx("dr-table", compact && "dr-table--compact", sticky && "dr-table--sticky") },
            h(
                "thead",
                null,
                h(
                    "tr",
                    null,
                    columns.map((column) => {
                        const active = currentSort?.key === column.key
                        return h(
                            "th",
                            {
                                key: column.key,
                                style: { width: column.width, textAlign: column.align },
                                className: cx(column.sort && "dr-table__sortable", active && "dr-table__sorted"),
                                onClick: () => onHeader(column),
                                "aria-sort": active
                                    ? (currentSort.dir === "asc" ? "ascending" : "descending")
                                    : undefined,
                            },
                            h("span", null, column.label ?? column.key),
                            column.sort
                                ? h(Icon, {
                                    name: active ? (currentSort.dir === "asc" ? "chevron-up" : "chevron-down") : "sort",
                                    size: 12,
                                    className: "dr-table__sort-icon",
                                })
                                : null,
                        )
                    }),
                ),
            ),
            h(
                "tbody",
                null,
                sorted.length === 0
                    ? h("tr", null, h("td", { className: "dr-table__empty", colSpan: columns.length }, empty))
                    : sorted.map((row, index) => {
                        const key = keyOf(row, index)
                        return h(
                            "tr",
                            {
                                key,
                                className: cx(
                                    onRowClick && "dr-table__clickable",
                                    selected === key && "dr-table__selected",
                                ),
                                onClick: onRowClick ? () => onRowClick(row, index) : undefined,
                            },
                            columns.map((column) =>
                                h(
                                    "td",
                                    { key: column.key, style: { textAlign: column.align } },
                                    column.render ? column.render(row, index) : String(row?.[column.key] ?? ""),
                                )
                            ),
                        )
                    }),
            ),
        ),
    )
}

// ── Tree ──

/**
 * A collapsible tree (TF frames, recording summaries, URDF links).
 * @param {{
 *   nodes: { id: string, label?: any, children?: any[], icon?: string, badge?: any }[],
 *   expanded?: string[], defaultExpanded?: string[] | "all", onExpandedChange?: (ids: string[]) => void,
 *   selected?: string | null, onSelect?: (id: string, node: any) => void,
 *   renderLabel?: (node: any) => any, className?: string, style?: object,
 * }} props
 */
export function Tree({
    nodes = [],
    expanded,
    defaultExpanded = [],
    onExpandedChange,
    selected,
    onSelect,
    renderLabel,
    className,
    ...rest
}) {
    const allIds = useMemo(() => {
        const ids = []
        const walk = (list) =>
            list.forEach((node) => {
                if (node.children?.length) {
                    ids.push(node.id)
                    walk(node.children)
                }
            })
        walk(nodes)
        return ids
    }, [nodes])
    const [open, setOpen] = useControllable(
        expanded,
        defaultExpanded === "all" ? allIds : defaultExpanded,
        onExpandedChange,
    )
    const openSet = new Set(open)
    const toggle = (id) => setOpen(openSet.has(id) ? open.filter((other) => other !== id) : [...open, id])
    const renderNodes = (list, depth) =>
        list.map((node) => {
            const hasChildren = !!node.children?.length
            const isOpen = openSet.has(node.id)
            return h(
                "li",
                { key: node.id, role: "treeitem", "aria-expanded": hasChildren ? isOpen : undefined },
                h(
                    "div",
                    {
                        className: cx("dr-tree__row", selected === node.id && "dr-tree__row--selected"),
                        style: { paddingLeft: 6 + depth * 14 },
                        onClick: () => onSelect?.(node.id, node),
                    },
                    h(
                        "button",
                        {
                            type: "button",
                            className: cx("dr-tree__twisty", !hasChildren && "dr-tree__twisty--leaf"),
                            tabIndex: hasChildren ? 0 : -1,
                            "aria-label": hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined,
                            onClick: (event) => {
                                event.stopPropagation()
                                if (hasChildren) {
                                    toggle(node.id)
                                }
                            },
                        },
                        hasChildren ? h(Icon, { name: isOpen ? "chevron-down" : "chevron-right", size: 12 }) : null,
                    ),
                    node.icon ? h(Icon, { name: node.icon, size: 14, className: "dr-tree__icon" }) : null,
                    h("span", { className: "dr-tree__label" }, renderLabel ? renderLabel(node) : node.label ?? node.id),
                    node.badge !== undefined && node.badge !== null
                        ? h("span", { className: "dr-tree__badge" }, node.badge)
                        : null,
                ),
                hasChildren && isOpen ? h("ul", { role: "group" }, renderNodes(node.children, depth + 1)) : null,
            )
        })
    return h("ul", { className: cx("dr-tree", className), role: "tree", ...rest }, renderNodes(nodes, 0))
}

// ── key / value ──

/**
 * One label / value row.
 * @param {Record<string, any>} props
 */
export function KeyValueRow({ label, children, mono = true, className, ...rest }) {
    return h(
        "div",
        { className: cx("dr-kv__row", className), ...rest },
        h("span", { className: "dr-kv__key" }, label),
        h("span", { className: cx("dr-kv__value", mono && "dr-mono") }, children),
    )
}

/**
 * Label / value readout rows.
 * @param {{ items?: [any, any][], children?: any, mono?: boolean, className?: string }} props
 */
export function KeyValue({ items, children, mono = true, className, ...rest }) {
    return h(
        "div",
        { className: cx("dr-kv", className), ...rest },
        items?.map(([label, value], index) => h(KeyValueRow, { key: index, label, mono }, value)),
        children,
    )
}

/**
 * A big number: label, value, unit, a change, a tone.
 * @param {{ label: any, value: any, unit?: any, delta?: number | string, tone?: "ok" | "warn" | "danger" | "info",
 *   hint?: any, className?: string }} props
 */
export function Stat({ label, value, unit, delta, tone, hint, className, ...rest }) {
    const deltaTone = typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat"
    return h(
        "div",
        { className: cx("dr-stat", tone && `dr-stat--${tone}`, className), ...rest },
        h("div", { className: "dr-stat__label" }, label),
        h(
            "div",
            { className: "dr-stat__value" },
            value,
            unit ? h("span", { className: "dr-stat__unit" }, unit) : null,
        ),
        delta !== undefined && delta !== null
            ? h(
                "div",
                { className: cx("dr-stat__delta", `dr-stat__delta--${deltaTone}`) },
                typeof delta === "number" && delta > 0 ? `+${delta}` : String(delta),
            )
            : null,
        hint ? h("div", { className: "dr-stat__hint" }, hint) : null,
    )
}

// ── lists ──

/**
 * A vertical list of ListRows.
 * @param {Record<string, any>} props
 */
export function List({ children, className, divided = true, ...rest }) {
    return h(
        "div",
        { className: cx("dr-list", divided && "dr-list--divided", className), role: "list", ...rest },
        children,
    )
}

/**
 * A list row: icon, title, subtitle, meta on the right, actions.
 * @param {{ icon?: string | any, title: any, subtitle?: any, meta?: any, actions?: any, selected?: boolean,
 *   onClick?: (event: any) => void, handle?: boolean | object, disabled?: boolean, className?: string }} props
 *   `handle`: show a drag grip (an object = props for it, e.g. from useDrag)
 */
export function ListRow(
    { icon, title, subtitle, meta, actions, selected, onClick, handle, disabled, className, ...rest },
) {
    return h(
        "div",
        {
            className: cx(
                "dr-list-row",
                onClick && "dr-list-row--clickable",
                selected && "dr-list-row--selected",
                disabled && "dr-list-row--disabled",
                className,
            ),
            role: "listitem",
            tabIndex: onClick && !disabled ? 0 : undefined,
            "aria-selected": selected || undefined,
            onClick: disabled ? undefined : onClick,
            onKeyDown: onClick && !disabled
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onClick(event)
                    }
                }
                : undefined,
            ...rest,
        },
        handle
            ? h(
                "span",
                { className: "dr-list-row__handle", ...(typeof handle === "object" ? handle : {}) },
                h(Icon, { name: "grip", size: 14 }),
            )
            : null,
        icon
            ? h(
                "span",
                { className: "dr-list-row__icon" },
                typeof icon === "string" ? h(Icon, { name: icon, size: 16 }) : icon,
            )
            : null,
        h(
            "span",
            { className: "dr-list-row__text" },
            h("span", { className: "dr-list-row__title" }, title),
            subtitle ? h("span", { className: "dr-list-row__subtitle" }, subtitle) : null,
        ),
        meta !== undefined && meta !== null ? h("span", { className: "dr-list-row__meta" }, meta) : null,
        actions
            ? h("span", { className: "dr-list-row__actions", onClick: (event) => event.stopPropagation() }, actions)
            : null,
    )
}

// ── LogView ──

const formatTs = (ts) => {
    if (ts === undefined || ts === null) {
        return ""
    }
    const date = typeof ts === "number" || typeof ts === "string" ? new Date(ts) : ts
    return Number.isNaN(date.getTime?.()) ? String(ts) : date.toTimeString().slice(0, 8)
}

/**
 * A console: follows the tail (auto scroll) until you scroll up, then offers "jump to end".
 * @param {{ lines: (string | { text: string, level?: "debug" | "info" | "warn" | "error", ts?: any })[],
 *   filter?: string, maxLines?: number, follow?: boolean, height?: string | number, showTime?: boolean,
 *   wrap?: boolean, className?: string, style?: object }} props
 */
export function LogView({
    lines = [],
    filter = "",
    maxLines = 5000,
    follow = true,
    height = 260,
    showTime = true,
    wrap = false,
    className,
    style,
    ...rest
}) {
    const box = useRef(null)
    const [atEnd, setAtEnd] = useState(true)
    const shown = useMemo(() => {
        const needle = filter.trim().toLowerCase()
        const normalized = lines.map((line) => (typeof line === "string" ? { text: line } : line))
        const filtered = needle ? normalized.filter((line) => line.text.toLowerCase().includes(needle)) : normalized
        return filtered.length > maxLines ? filtered.slice(filtered.length - maxLines) : filtered
    }, [lines, filter, maxLines])
    useIsoLayoutEffect(() => {
        if (follow && atEnd && box.current) {
            box.current.scrollTop = box.current.scrollHeight
        }
    }, [shown, follow, atEnd])
    const onScroll = () => {
        const element = box.current
        if (element) {
            setAtEnd(element.scrollHeight - element.scrollTop - element.clientHeight < 24)
        }
    }
    const jump = () => {
        setAtEnd(true)
        if (box.current) {
            box.current.scrollTop = box.current.scrollHeight
        }
    }
    return h(
        "div",
        { className: cx("dr-log", className), style: { height, ...style }, ...rest },
        h(
            "div",
            { className: cx("dr-log__lines", "dr-scroll", wrap && "dr-log__lines--wrap"), ref: box, onScroll },
            shown.length === 0
                ? h("div", { className: "dr-log__empty" }, filter ? "No lines match" : "No output yet")
                : shown.map((line, index) =>
                    h(
                        "div",
                        { key: index, className: cx("dr-log__line", line.level && `dr-log__line--${line.level}`) },
                        showTime && line.ts !== undefined
                            ? h("span", { className: "dr-log__ts" }, formatTs(line.ts))
                            : null,
                        h("span", { className: "dr-log__text" }, line.text),
                    )
                ),
        ),
        !atEnd && follow
            ? h(
                "button",
                { type: "button", className: "dr-log__jump", onClick: jump },
                h(Icon, { name: "arrow-down", size: 12 }),
                "Jump to end",
            )
            : null,
    )
}

// ── CodeBlock ──

const KEYWORDS = {
    js: "const let var function return if else for while of in new class extends import export from await async true false null undefined this throw try catch",
    py: "def return if elif else for while in import from as class with try except finally raise lambda True False None and or not is pass yield async await self",
    sh: "if then else fi for do done case esac function export local echo cd sudo",
    json: "true false null",
}
KEYWORDS.ts = KEYWORDS.js
KEYWORDS.python = KEYWORDS.py
KEYWORDS.bash = KEYWORDS.sh
KEYWORDS.javascript = KEYWORDS.js

/** Splits one line of code into [kind, text] tokens (kw, str, num, com, func, plain). */
export function tokenizeLine(line, language = "js") {
    const keywords = new Set((KEYWORDS[language] ?? KEYWORDS.js).split(" "))
    const comment = language === "py" || language === "python" || language === "sh" || language === "bash"
        ? "#[^\\n]*"
        : language === "json"
        ? "(?!)"
        : "\\/\\/[^\\n]*"
    const pattern = new RegExp(
        `(${comment})|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)(?=\\s*\\()|([A-Za-z_$][\\w$]*)`,
        "g",
    )
    const tokens = []
    let last = 0
    for (const match of line.matchAll(pattern)) {
        if (match.index > last) {
            tokens.push(["plain", line.slice(last, match.index)])
        }
        if (match[1]) {
            tokens.push(["com", match[1]])
        } else if (match[2]) {
            tokens.push(["str", match[2]])
        } else if (match[3]) {
            tokens.push(["num", match[3]])
        } else if (match[4]) {
            tokens.push([keywords.has(match[4]) ? "kw" : "func", match[4]])
        } else {
            tokens.push([keywords.has(match[5]) ? "kw" : "plain", match[5]])
        }
        last = match.index + match[0].length
    }
    if (last < line.length) {
        tokens.push(["plain", line.slice(last)])
    }
    return tokens
}

/**
 * Code with light highlighting (the theme's --code-* colors), line numbers and a copy button.
 * @param {{ code: string, language?: string, lineNumbers?: boolean, copy?: boolean, title?: any,
 *   maxHeight?: string | number, className?: string, style?: object }} props
 */
export function CodeBlock(
    { code = "", language = "js", lineNumbers = false, copy = true, title, maxHeight, className, style, ...rest },
) {
    const [copied, setCopied] = useState(false)
    const lines = String(code).replace(/\n$/, "").split("\n")
    const onCopy = async () => {
        if (await copyText(code)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        }
    }
    return h(
        "div",
        { className: cx("dr-code", className), style, ...rest },
        title || language || copy
            ? h(
                "div",
                { className: "dr-code__head" },
                h("span", { className: "dr-code__lang" }, title ?? language),
                copy
                    ? h(
                        "button",
                        { type: "button", className: "dr-code__copy", onClick: onCopy, "aria-label": "Copy code" },
                        h(Icon, { name: copied ? "check" : "copy", size: 13 }),
                        copied ? "Copied" : "Copy",
                    )
                    : null,
            )
            : null,
        h(
            "pre",
            { className: "dr-code__pre dr-scroll", style: { maxHeight } },
            h(
                "code",
                null,
                lines.map((line, index) =>
                    h(
                        "div",
                        { key: index, className: "dr-code__line" },
                        lineNumbers ? h("span", { className: "dr-code__num" }, index + 1) : null,
                        h(
                            "span",
                            null,
                            tokenizeLine(line, language).map(([kind, text], tokenIndex) =>
                                kind === "plain"
                                    ? text
                                    : h("span", { key: tokenIndex, className: `dr-tok-${kind}` }, text)
                            ),
                            line === "" ? "​" : null,
                        ),
                    )
                ),
            ),
        ),
    )
}

// ── Sparkline ──

/**
 * An attitude indicator (artificial horizon): the horizon rolls and shifts with the body's roll and pitch, yaw is
 * printed below. Angles in radians; null shows a level, dimmed horizon.
 * @param {{ roll?: number | null, pitch?: number | null, yaw?: number | null, height?: number,
 *   pitchScale?: number, className?: string }} props `pitchScale`: px of shift per degree of pitch (default 1.4)
 */
export function AttitudeIndicator(
    { roll = null, pitch = null, yaw = null, height = 84, pitchScale = 1.4, className, ...rest },
) {
    const deg = (radians) => radians * 180 / Math.PI
    const known = roll !== null && pitch !== null
    const shift = known ? Math.max(-height / 2, Math.min(height / 2, deg(pitch) * pitchScale)) : 0
    return h(
        "div",
        {
            className: cx("dr-attitude", !known && "dr-attitude--unknown", className),
            style: { height },
            role: "img",
            "aria-label": known ? `roll ${deg(roll).toFixed(1)}°, pitch ${deg(pitch).toFixed(1)}°` : "attitude unknown",
            ...rest,
        },
        h("div", {
            className: "dr-attitude__sky",
            style: known
                ? { transform: `rotate(${(-deg(roll)).toFixed(1)}deg) translateY(${shift.toFixed(0)}px)` }
                : undefined,
        }),
        h("div", { className: "dr-attitude__cross" }),
        h("div", { className: "dr-attitude__yaw" }, `yaw ${yaw === null ? "—" : deg(yaw).toFixed(0)}°`),
    )
}

/**
 * A tiny line chart (rates, latency, battery).
 * @param {{ values: number[], width?: number, height?: number, color?: string, fill?: boolean, min?: number,
 *   max?: number, strokeWidth?: number, className?: string, title?: string }} props
 *   `color`: a CSS color, default var(--primary)
 */
export function Sparkline({
    values = [],
    width = 120,
    height = 28,
    color = "var(--primary)",
    fill = true,
    min,
    max,
    strokeWidth = 1.5,
    className,
    title,
    ...rest
}) {
    const finite = values.filter(Number.isFinite)
    const low = min ?? Math.min(...finite, 0)
    const high = max ?? Math.max(...finite, low + 1e-9)
    const span = high - low || 1
    const step = values.length > 1 ? width / (values.length - 1) : width
    const points = values.map((value, index) => [
        index * step,
        height - 1 - ((Number.isFinite(value) ? value : low) - low) / span * (height - 2),
    ])
    const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("")
    return h(
        "svg",
        {
            className: cx("dr-sparkline", className),
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            role: title ? "img" : undefined,
            "aria-hidden": title ? undefined : "true",
            style: { color },
            ...rest,
        },
        title ? h("title", null, title) : null,
        points.length > 1 && fill
            ? h("path", { d: `${line}L${width},${height}L0,${height}Z`, className: "dr-sparkline__fill" })
            : null,
        points.length > 1
            ? h("path", { d: line, fill: "none", stroke: "currentColor", strokeWidth, strokeLinejoin: "round" })
            : null,
        points.length ? h("circle", { cx: points.at(-1)[0], cy: points.at(-1)[1], r: 2, fill: "currentColor" }) : null,
    )
}

// ── Timeline ──

/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = String(total % 60).padStart(2, "0")
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`
}

/**
 * A recording player's scrubber: play/pause, the position, markers.
 * @param {{ start?: number, end: number, value: number, onChange?: (t: number) => void, playing?: boolean,
 *   onPlayPause?: (playing: boolean) => void, markers?: { t: number, label?: string, tone?: "ok" | "warn" | "danger" | "info" }[],
 *   format?: (t: number) => string, step?: number, disabled?: boolean, className?: string, style?: object }} props
 *   times in seconds (any unit works with your own `format`)
 */
export function Timeline({
    start = 0,
    end,
    value,
    onChange,
    playing,
    onPlayPause,
    markers = [],
    format,
    step,
    disabled,
    className,
    style,
    ...rest
}) {
    const track = useRef(null)
    const show = format ?? ((t) => formatDuration(t - start))
    const span = Math.max(1e-9, end - start)
    const fraction = Math.min(1, Math.max(0, (value - start) / span))
    const timeAt = (clientX) => {
        const rect = track.current.getBoundingClientRect()
        const t = start + Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))) * span
        return step ? Math.round(t / step) * step : t
    }
    const onPointerDown = (event) => {
        if (disabled || !onChange) {
            return
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onChange(timeAt(event.clientX))
    }
    const onPointerMove = (event) => {
        if (!disabled && onChange && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            onChange(timeAt(event.clientX))
        }
    }
    const onKeyDown = (event) => {
        if (disabled || !onChange) {
            return
        }
        const nudge = step ?? span / 100
        if (event.key === "ArrowRight") {
            onChange(Math.min(end, value + nudge))
        } else if (event.key === "ArrowLeft") {
            onChange(Math.max(start, value - nudge))
        } else if (event.key === "Home") {
            onChange(start)
        } else if (event.key === "End") {
            onChange(end)
        } else if (event.key === " " && onPlayPause) {
            onPlayPause(!playing)
        } else {
            return
        }
        event.preventDefault()
    }
    return h(
        "div",
        { className: cx("dr-timeline", disabled && "dr-timeline--disabled", className), style, ...rest },
        onPlayPause
            ? h(
                "button",
                {
                    type: "button",
                    className: "dr-timeline__play",
                    onClick: () => onPlayPause(!playing),
                    disabled,
                    "aria-label": playing ? "Pause" : "Play",
                },
                h(Icon, { name: playing ? "pause" : "play", size: 16 }),
            )
            : null,
        h("span", { className: "dr-timeline__time" }, show(value)),
        h(
            "div",
            {
                className: "dr-timeline__track",
                ref: track,
                role: "slider",
                tabIndex: disabled ? -1 : 0,
                "aria-valuemin": start,
                "aria-valuemax": end,
                "aria-valuenow": value,
                "aria-valuetext": show(value),
                onPointerDown,
                onPointerMove,
                onKeyDown,
                style: { touchAction: "none" },
            },
            h("div", { className: "dr-timeline__rail" }),
            h("div", { className: "dr-timeline__done", style: { width: `${fraction * 100}%` } }),
            markers.map((marker, index) =>
                h("span", {
                    key: index,
                    className: cx("dr-timeline__marker", marker.tone && `dr-timeline__marker--${marker.tone}`),
                    style: { left: `${Math.min(1, Math.max(0, (marker.t - start) / span)) * 100}%` },
                    title: marker.label,
                })
            ),
            h("div", { className: "dr-timeline__thumb", style: { left: `${fraction * 100}%` } }),
        ),
        h("span", { className: "dr-timeline__time dr-timeline__time--end" }, show(end)),
    )
}

/**
 * A video stream or an image in a themed frame. `stream` (a MediaStream, e.g. a zenoh-gateway camera track) plays in a
 * muted inline <video>; without `stream`, `src` shows as an image. `placeholder` covers it until there is something to
 * show. `ref` reaches the <video>/<img> (for captureFrame).
 * @param {{ stream?: MediaStream | null, src?: string | null, alt?: string, fit?: "contain" | "cover",
 *   height?: string | number, placeholder?: any, ref?: any, className?: string, style?: object }} props
 */
export function MediaFrame(
    { stream, src, alt = "", fit = "contain", height = 360, placeholder = "No video", ref, className, style, ...rest },
) {
    const element = useRef(null)
    const [playing, setPlaying] = useState(false)
    const isVideo = stream !== undefined
    useEffect(() => {
        const video = element.current
        if (isVideo && video && video.srcObject !== (stream ?? null)) {
            video.srcObject = stream ?? null
            setPlaying(false)
        }
    }, [isVideo, stream])
    const setRef = (node) => {
        element.current = node
        if (typeof ref === "function") {
            ref(node)
        } else if (ref) {
            ref.current = node
        }
    }
    const shown = isVideo ? stream && playing : Boolean(src)
    return h(
        "div",
        {
            className: cx("dr-media", className),
            style: { maxHeight: height, aspectRatio: "16 / 9", ...style },
            ...rest,
        },
        isVideo
            ? h("video", {
                ref: setRef,
                className: "dr-media__el",
                style: { objectFit: fit },
                autoPlay: true,
                muted: true,
                playsInline: true,
                onPlaying: () => setPlaying(true),
                onEmptied: () => setPlaying(false),
            })
            : src
            ? h("img", { ref: setRef, className: "dr-media__el", style: { objectFit: fit }, src, alt })
            : null,
        !shown && placeholder ? h("div", { className: "dr-media__placeholder" }, placeholder) : null,
    )
}

/** The frame a <video> is showing, as a data URL (null before its first frame). */
export function captureFrame(video, type = "image/png") {
    if (!video?.videoWidth) {
        return null
    }
    const canvas = Object.assign(document.createElement("canvas"), {
        width: video.videoWidth,
        height: video.videoHeight,
    })
    canvas.getContext("2d").drawImage(video, 0, 0)
    return canvas.toDataURL(type)
}
