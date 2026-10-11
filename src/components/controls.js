// Buttons, form controls, badges and status dots. Every control takes `value` + `onChange(value)` (the value, not the
// event), plus `className`, `style` and any other DOM props for its root.
import { useEffect, useId, useRef, useState } from "react"
import { cx, h } from "../h.js"
import { Icon } from "./icon.js"

/**
 * @param {{ variant?: "default" | "primary" | "ghost" | "danger" | "ok" | "warn", size?: "sm" | "md" | "lg", icon?: string,
 *   iconRight?: string, pressed?: boolean, loading?: boolean, block?: boolean, type?: string, href?: string }
 *   & Record<string, any>} props `href` makes it a link that looks like a button (`download`, `target` pass through)
 */
export function Button({
    variant = "default",
    size = "md",
    icon,
    iconRight,
    pressed,
    loading = false,
    block = false,
    className,
    children,
    type = "button",
    disabled,
    href,
    ...rest
}) {
    const link = href !== undefined
    return h(
        link ? "a" : "button",
        {
            ...(link ? { href: disabled ? undefined : href, "aria-disabled": disabled || undefined } : { type }),
            className: cx(
                "dr-btn",
                variant !== "default" && `dr-btn--${variant}`,
                size !== "md" && `dr-btn--${size}`,
                block && "dr-btn--block",
                className,
            ),
            "aria-pressed": pressed === undefined ? undefined : !!pressed,
            "aria-busy": loading || undefined,
            disabled: link ? undefined : disabled || loading,
            ...rest,
        },
        loading ? h("span", { className: "dr-spinner dr-spinner--inline", "aria-hidden": "true" }) : null,
        !loading && icon ? h(Icon, { name: icon, size: size === "sm" ? 14 : 16 }) : null,
        children,
        iconRight ? h(Icon, { name: iconRight, size: size === "sm" ? 14 : 16 }) : null,
    )
}

/**
 * A button that acts while held (jog controls): `onHold()` on press, `onRelease()` on release, cancel or a lost
 * capture, so a missed pointerup still stops. Takes Button's props.
 * @param {Record<string, any>} props
 */
export function HoldButton({ onHold, onRelease, disabled, className, ...rest }) {
    return h(Button, {
        className: cx("dr-btn--hold", className),
        disabled,
        style: { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", ...rest.style },
        onPointerDown: (event) => {
            if (disabled || event.button !== 0) {
                return
            }
            event.currentTarget.setPointerCapture?.(event.pointerId)
            onHold?.()
        },
        onPointerUp: () => onRelease?.(),
        onPointerCancel: () => onRelease?.(),
        onLostPointerCapture: () => onRelease?.(),
        onContextMenu: (event) => event.preventDefault(),
        ...rest,
    })
}

/**
 * A square icon-only button; `label` is its accessible name and tooltip.
 * @param {Record<string, any>} props
 */
export function IconButton({ icon, label, size = "md", variant = "ghost", round = false, className, ...rest }) {
    return h(Button, {
        variant,
        size,
        className: cx("dr-btn--icon", round && "dr-btn--round", className),
        "aria-label": label,
        title: label,
        ...rest,
    }, h(Icon, { name: icon, size: size === "sm" ? 14 : size === "lg" ? 20 : 17 }))
}

/**
 * Buttons side by side, joined into one control.
 * @param {Record<string, any>} props
 */
export function ButtonGroup({ className, children, ...rest }) {
    return h("div", { className: cx("dr-btn-group", className), role: "group", ...rest }, children)
}

/**
 * A label + control + hint/error, stacked (or `inline`: label left, control right).
 * @param {Record<string, any>} props
 */
export function Field({ label, hint, error, inline = false, htmlFor, className, children, ...rest }) {
    return h(
        "div",
        { className: cx("dr-field", inline && "dr-field--inline", error && "dr-field--error", className), ...rest },
        label ? h("label", { className: "dr-field-label", htmlFor }, label) : null,
        h("div", { className: "dr-field-control" }, children),
        error
            ? h("div", { className: "dr-field-error", role: "alert" }, error)
            : hint
            ? h("div", { className: "dr-field-hint" }, hint)
            : null,
    )
}

/**
 * Single-line text. `onChange(text)` on every keystroke; `onEnter(text)` on Enter. Or `onCommit(text)` alone: the box
 * keeps what's typed and reports it once, on Enter or blur, when it differs from `value` (renames, labels); Escape
 * puts `value` back.
 * @param {Record<string, any>} props
 */
export function TextInput(
    {
        value,
        onChange,
        onEnter,
        onCommit,
        onKeyDown,
        onBlur,
        size = "md",
        mono = false,
        icon,
        className,
        invalid,
        ...rest
    },
) {
    const [draft, setDraft] = useState(null)
    const committing = !!onCommit && !onChange
    const commit = (text) => {
        setDraft(null)
        if (text !== (value ?? "")) {
            onCommit?.(text)
        }
    }
    const input = h("input", {
        type: "text",
        className: cx("dr-input", size === "sm" && "dr-input--sm", mono && "dr-mono", icon && "dr-input--with-icon"),
        value: committing ? draft ?? value ?? "" : value ?? "",
        "aria-invalid": invalid || undefined,
        onChange: (event) => (committing ? setDraft(event.target.value) : onChange?.(event.target.value)),
        onKeyDown: (event) => {
            if (event.key === "Enter") {
                onEnter?.(event.currentTarget.value)
                if (committing) {
                    commit(event.currentTarget.value)
                }
            } else if (event.key === "Escape" && committing && draft !== null) {
                event.stopPropagation()
                setDraft(null)
            }
            onKeyDown?.(event)
        },
        onBlur: (event) => {
            if (committing && draft !== null) {
                commit(event.currentTarget.value)
            }
            onBlur?.(event)
        },
        ...rest,
    })
    if (!icon) {
        return h("span", { className: cx("dr-input-wrap", className) }, input)
    }
    return h(
        "span",
        { className: cx("dr-input-wrap", className) },
        h("span", { className: "dr-input-icon" }, h(Icon, { name: icon, size: 15 })),
        input,
    )
}

/**
 * A search box: a magnifier, and a clear button once there is text.
 * @param {Record<string, any>} props
 */
export function SearchInput({ value, onChange, placeholder = "Search…", className, ...rest }) {
    return h(
        "span",
        { className: cx("dr-input-wrap dr-search", className) },
        h("span", { className: "dr-input-icon" }, h(Icon, { name: "search", size: 15 })),
        h("input", {
            type: "search",
            className: "dr-input dr-input--with-icon",
            value: value ?? "",
            placeholder,
            onChange: (event) => onChange?.(event.target.value),
            onKeyDown: (event) => {
                if (event.key === "Escape" && value) {
                    event.stopPropagation()
                    onChange?.("")
                }
            },
            ...rest,
        }),
        value
            ? h("button", {
                type: "button",
                className: "dr-input-clear",
                "aria-label": "Clear",
                onClick: () => onChange?.(""),
            }, h(Icon, { name: "close", size: 13 }))
            : null,
    )
}

/**
 * Multi-line text.
 * @param {Record<string, any>} props
 */
export function TextArea({ value, onChange, mono = false, rows = 4, className, ...rest }) {
    return h("textarea", {
        className: cx("dr-input dr-textarea", mono && "dr-mono", className),
        rows,
        value: value ?? "",
        onChange: (event) => onChange?.(event.target.value),
        ...rest,
    })
}

const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value))

/**
 * A number box that only reports finite numbers: typing keeps the text, Enter/blur commits; ↑/↓ step (shift: ×10).
 * `unit` shows after the number. `nullable`: clearing the box reports null (e.g. "auto"; pair with a placeholder).
 * @param {Record<string, any>} props
 */
export function NumberInput(
    { value, onChange, min, max, step = 1, unit, size = "md", precision, nullable = false, className, ...rest },
) {
    const shown = (number) =>
        number === null || number === undefined || !Number.isFinite(number)
            ? ""
            : precision === undefined
            ? String(number)
            : number.toFixed(precision)
    const [text, setText] = useState(shown(value))
    const focused = useRef(false)
    useEffect(() => {
        if (!focused.current) {
            setText(shown(value))
        }
    }, [value, precision])
    const commit = (raw) => {
        const number = Number(raw)
        if (raw.trim() === "" && nullable) {
            setText("")
            if (value !== null) {
                onChange?.(null)
            }
            return
        }
        if (raw.trim() === "" || !Number.isFinite(number)) {
            setText(shown(value))
            return
        }
        const next = clamp(number, min, max)
        setText(shown(next))
        if (next !== value) {
            onChange?.(next)
        }
    }
    return h(
        "span",
        { className: cx("dr-input-wrap dr-number", className) },
        h("input", {
            type: "text",
            inputMode: "decimal",
            className: cx("dr-input dr-mono", size === "sm" && "dr-input--sm", unit && "dr-input--with-unit"),
            value: text,
            onFocus: () => (focused.current = true),
            onBlur: (event) => {
                focused.current = false
                commit(event.target.value)
            },
            onChange: (event) => setText(event.target.value),
            onKeyDown: (event) => {
                if (event.key === "Enter") {
                    commit(event.currentTarget.value)
                } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault()
                    const base = Number.isFinite(Number(text)) ? Number(text) : value ?? 0
                    const delta = (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
                    const next = clamp(Math.round((base + delta) / step) * step, min, max)
                    const rounded = Number(next.toFixed(10))
                    setText(shown(rounded))
                    onChange?.(rounded)
                }
            },
            ...rest,
        }),
        unit ? h("span", { className: "dr-input-unit" }, unit) : null,
    )
}

/** Normalizes options: ["a", "b"], [["a", "Label A"]], or [{ value, label, disabled }]. */
export function normalizeOptions(options = []) {
    return options.map((option) =>
        Array.isArray(option)
            ? { value: option[0], label: option[1] ?? String(option[0]) }
            : typeof option === "object" && option !== null
            ? { label: String(option.value), ...option }
            : { value: option, label: String(option) }
    )
}

/**
 * A native select (keyboard, mobile pickers and screen readers for free), themed. `options`: strings,
 * [value, label] pairs or { value, label, disabled, group }. `onChange` gets the option's value (its original type).
 * @param {Record<string, any>} props
 */
export function Select({ value, onChange, options, placeholder, size = "md", className, ...rest }) {
    const items = normalizeOptions(options)
    const index = items.findIndex((item) => item.value === value)
    const groups = []
    for (const [position, item] of items.entries()) {
        const name = item.group ?? ""
        let group = groups.find((other) => other.name === name)
        if (!group) {
            group = { name, items: [] }
            groups.push(group)
        }
        group.items.push([position, item])
    }
    const option = ([position, item]) =>
        h("option", { key: position, value: String(position), disabled: item.disabled }, item.label)
    return h(
        "select",
        {
            className: cx("dr-select", size === "sm" && "dr-select--sm", className),
            value: index >= 0 ? String(index) : "",
            onChange: (event) => {
                const item = items[Number(event.target.value)]
                if (item) {
                    onChange?.(item.value)
                }
            },
            ...rest,
        },
        index < 0 ? h("option", { value: "", disabled: true }, placeholder ?? "Choose…") : null,
        groups.map((group) =>
            group.name
                ? h("optgroup", { key: group.name, label: group.name }, group.items.map(option))
                : group.items.map(option)
        ),
    )
}

/**
 * A checkbox with its label. `indeterminate` shows a dash.
 * @param {Record<string, any>} props
 */
export function Checkbox({ value, onChange, label, indeterminate = false, disabled, className, children, ...rest }) {
    const ref = useRef(null)
    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate
        }
    }, [indeterminate])
    return h(
        "label",
        { className: cx("dr-check", disabled && "dr-check--disabled", className) },
        h("input", {
            ref,
            type: "checkbox",
            checked: !!value,
            disabled,
            onChange: (event) => onChange?.(event.target.checked),
            ...rest,
        }),
        h("span", { className: "dr-check-box", "aria-hidden": "true" }),
        label ?? children ? h("span", { className: "dr-check-label" }, label ?? children) : null,
    )
}

/**
 * An on/off switch (role="switch").
 * @param {Record<string, any>} props
 */
export function Toggle({ value, onChange, label, size = "md", disabled, className, ...rest }) {
    return h(
        "label",
        { className: cx("dr-toggle", size === "sm" && "dr-toggle--sm", disabled && "dr-check--disabled", className) },
        h("input", {
            type: "checkbox",
            role: "switch",
            checked: !!value,
            "aria-checked": !!value,
            disabled,
            onChange: (event) => onChange?.(event.target.checked),
            ...rest,
        }),
        h("span", { className: "dr-toggle-track", "aria-hidden": "true" }, h("span", { className: "dr-toggle-knob" })),
        label ? h("span", { className: "dr-check-label" }, label) : null,
    )
}
export const Switch = Toggle

/**
 * One radio button (use RadioGroup for a set).
 * @param {Record<string, any>} props
 */
export function Radio({ checked, onChange, label, name, value, disabled, className, ...rest }) {
    return h(
        "label",
        { className: cx("dr-check dr-radio", disabled && "dr-check--disabled", className) },
        h("input", {
            type: "radio",
            name,
            value: String(value),
            checked: !!checked,
            disabled,
            onChange: () => onChange?.(value),
            ...rest,
        }),
        h("span", { className: "dr-check-box", "aria-hidden": "true" }),
        label ? h("span", { className: "dr-check-label" }, label) : null,
    )
}

/**
 * A set of radios: `options` as for Select; `direction` "column" | "row".
 * @param {Record<string, any>} props
 */
export function RadioGroup({ value, onChange, options, name, direction = "column", className, ...rest }) {
    const autoName = useId()
    return h(
        "div",
        { role: "radiogroup", className: cx("dr-radio-group", `dr-radio-group--${direction}`, className), ...rest },
        normalizeOptions(options).map((item) =>
            h(Radio, {
                key: String(item.value),
                name: name ?? autoName,
                value: item.value,
                label: item.label,
                disabled: item.disabled,
                checked: item.value === value,
                onChange,
            })
        ),
    )
}

/**
 * A range slider with its value shown. `format(value)` for the readout; `onCommit(value)` once the drag ends.
 * @param {Record<string, any>} props
 */
export function Slider(
    {
        value,
        onChange,
        onCommit,
        min = 0,
        max = 1,
        step = 0.01,
        format,
        showValue = true,
        className,
        disabled,
        ...rest
    },
) {
    const fraction = (clamp(value ?? min, min, max) - min) / (max - min || 1)
    return h(
        "div",
        {
            className: cx("dr-slider", disabled && "dr-slider--disabled", className),
            style: { "--dr-fill": `${fraction * 100}%` },
        },
        h("input", {
            type: "range",
            min,
            max,
            step,
            value: value ?? min,
            disabled,
            onChange: (event) => onChange?.(Number(event.target.value)),
            onPointerUp: (event) => onCommit?.(Number(event.currentTarget.value)),
            onKeyUp: (event) => onCommit?.(Number(event.currentTarget.value)),
            ...rest,
        }),
        showValue ? h("output", { className: "dr-slider-value" }, format ? format(value) : String(value)) : null,
    )
}

/**
 * Two thumbs on one track: `value` = [low, high].
 * @param {Record<string, any>} props
 */
export function RangeSlider(
    { value = [0, 1], onChange, min = 0, max = 1, step = 0.01, format, showValue = true, className, disabled },
) {
    const [low, high] = value
    const at = (number) => `${((clamp(number, min, max) - min) / (max - min || 1)) * 100}%`
    const show = (number) => (format ? format(number) : String(number))
    return h(
        "div",
        {
            className: cx("dr-slider dr-range", disabled && "dr-slider--disabled", className),
            style: { "--dr-from": at(low), "--dr-to": at(high) },
        },
        h(
            "div",
            { className: "dr-range-inputs" },
            h("input", {
                type: "range",
                min,
                max,
                step,
                value: low,
                disabled,
                "aria-label": "minimum",
                onChange: (event) => onChange?.([Math.min(Number(event.target.value), high), high]),
            }),
            h("input", {
                type: "range",
                min,
                max,
                step,
                value: high,
                disabled,
                "aria-label": "maximum",
                onChange: (event) => onChange?.([low, Math.max(Number(event.target.value), low)]),
            }),
        ),
        showValue ? h("output", { className: "dr-slider-value" }, `${show(low)} – ${show(high)}`) : null,
    )
}

/**
 * A small status label. `tone`: "default" | "info" | "ok" | "warn" | "danger"; `solid` fills it; `dot` adds a dot.
 * @param {Record<string, any>} props
 */
export function Badge({ tone = "default", solid = false, dot = false, className, children, ...rest }) {
    return h(
        "span",
        {
            className: cx("dr-badge", tone !== "default" && `dr-badge--${tone}`, solid && "dr-badge--solid", className),
            ...rest,
        },
        dot ? h("span", { className: "dr-badge-dot" }) : null,
        children,
    )
}

/**
 * A toggleable chip (filters, multi-select). `selected` + `onChange(selected)`; `onRemove` adds an ✕.
 * @param {Record<string, any>} props
 */
export function Chip({ selected, onChange, onRemove, icon, tone, className, children, ...rest }) {
    return h(
        "span",
        {
            className: cx("dr-chip", tone && `dr-badge--${tone}`, className),
            role: onChange ? "button" : undefined,
            tabIndex: onChange ? 0 : undefined,
            "aria-pressed": onChange ? !!selected : undefined,
            onClick: onChange ? () => onChange(!selected) : undefined,
            onKeyDown: onChange
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onChange(!selected)
                    }
                }
                : undefined,
            ...rest,
        },
        icon ? h(Icon, { name: icon, size: 13 }) : null,
        children,
        onRemove
            ? h("button", {
                type: "button",
                className: "dr-chip-remove",
                "aria-label": "Remove",
                onClick: (event) => {
                    event.stopPropagation()
                    onRemove()
                },
            }, h(Icon, { name: "close", size: 11 }))
            : null,
    )
}

/**
 * A status dot: tone "ok" | "warn" | "danger" | "info" | "off"; `pulse` animates it.
 * @param {Record<string, any>} props
 */
export function StatusDot({ tone = "ok", pulse = false, label, className, ...rest }) {
    return h("span", {
        className: cx("dr-dot", `dr-dot--${tone}`, pulse && "dr-dot--pulse", className),
        role: label ? "img" : undefined,
        "aria-label": label,
        title: label,
        ...rest,
    })
}

const CONNECTION_TONES = { connected: "ok", connecting: "warn", degraded: "warn", lost: "danger", offline: "off" }

/**
 * A link indicator: dot + state (+ an optional detail like "12 ms"). `state` is a data source state ("connecting" |
 * "connected" | "degraded" | "lost"); see useConnectionState().
 * @param {Record<string, any>} props
 */
export function ConnectionStatus({ state = "connecting", label, detail, className, ...rest }) {
    const tone = CONNECTION_TONES[state] ?? "off"
    return h(
        "span",
        { className: cx("dr-conn", `dr-conn--${tone}`, className), role: "status", ...rest },
        h(StatusDot, { tone, pulse: state === "connecting" }),
        h("span", { className: "dr-conn-label" }, label ?? state),
        detail ? h("span", { className: "dr-conn-detail" }, detail) : null,
    )
}

/**
 * A keyboard key: <Kbd>W</Kbd>, or `keys={["mod", "K"]}`.
 * @param {Record<string, any>} props
 */
export function Kbd({ keys, className, children, ...rest }) {
    const mac = /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? "")
    const label = (
        key,
    ) => (key === "mod" ? (mac ? "⌘" : "Ctrl") : key === "shift" ? "⇧" : key === "alt" ? (mac ? "⌥" : "Alt") : key)
    if (keys) {
        return h(
            "span",
            { className: cx("dr-kbd-group", className), ...rest },
            keys.map((key, index) => h("kbd", { key: index, className: "dr-kbd" }, label(key))),
        )
    }
    return h("kbd", { className: cx("dr-kbd", className), ...rest }, children)
}

/**
 * A round floating action button over a view (the main actions of a canvas app). `tone` colors its ring ("primary" |
 * "info" | "ok" | "warn" | "danger"); `active` fills it (its panel is open); `attention` draws the eye: "pulse" (the
 * next step), "glow" (recommended), "spin" (working). `label` is its tooltip and accessible name.
 */
export function Fab(
    { icon, label, tone = "primary", active = false, attention, size = 52, className, style, ...rest },
) {
    return h(
        "button",
        {
            type: "button",
            className: cx(
                "dr-fab",
                `dr-fab--${tone}`,
                active && "dr-fab--active",
                attention && `dr-fab--${attention}`,
                className,
            ),
            "aria-label": label,
            "aria-pressed": active,
            title: label,
            style: { "--dr-fab-size": `${size}px`, ...style },
            ...rest,
        },
        h(Icon, { name: icon, size: Math.round(size * 0.4) }),
    )
}

/**
 * An angle dial: drag around it to turn. `value` in radians, counter-clockwise positive (a map's yaw); the hand is
 * drawn for a screen whose y points down. `onChange(radians)` wraps to -π..π; arrow keys step 1° (shift: 10°).
 */
export function AngleDial({ value = 0, onChange, size = 46, tone = "primary", disabled, className, style, ...rest }) {
    const start = (event) => {
        if (disabled) {
            return
        }
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        const center = [rect.left + rect.width / 2, rect.top + rect.height / 2]
        const angleAt = (e) => Math.atan2(e.clientY - center[1], e.clientX - center[0])
        const first = angleAt(event)
        const from = value
        const move = (e) => {
            const turned = from - (angleAt(e) - first)
            onChange?.(Math.atan2(Math.sin(turned), Math.cos(turned)))
        }
        const up = () => {
            removeEventListener("pointermove", move)
            removeEventListener("pointerup", up)
        }
        addEventListener("pointermove", move)
        addEventListener("pointerup", up)
    }
    return h(
        "div",
        {
            className: cx("dr-dial", `dr-dial--${tone}`, disabled && "dr-dial--disabled", className),
            role: "slider",
            "aria-valuenow": Math.round((value * 180) / Math.PI),
            "aria-valuemin": -180,
            "aria-valuemax": 180,
            tabIndex: disabled ? -1 : 0,
            onPointerDown: start,
            onKeyDown: (event) => {
                const step = ((event.shiftKey ? 10 : 1) * Math.PI) / 180
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault()
                    onChange?.(value + step)
                } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault()
                    onChange?.(value - step)
                }
            },
            style: { width: size, height: size, ...style },
            ...rest,
        },
        h("span", { className: "dr-dial-hand", style: { transform: `rotate(${(-value * 180) / Math.PI}deg)` } }),
    )
}

/** Copies `text` to the clipboard, then says "Copied" for a moment. `label` is its tooltip; children replace "Copy". */
export function CopyButton({ text, label = "Copy", size = "sm", children, ...rest }) {
    const [copied, setCopied] = useState(false)
    useEffect(() => {
        if (!copied) {
            return
        }
        const timer = setTimeout(() => setCopied(false), 1500)
        return () => clearTimeout(timer)
    }, [copied])
    return h(Button, {
        size,
        icon: copied ? "check" : "copy",
        title: label,
        onClick: () => globalThis.navigator?.clipboard?.writeText(text).then(() => setCopied(true), () => {}),
        ...rest,
    }, copied ? "Copied" : children ?? "Copy")
}
