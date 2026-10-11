// Buttons, form controls, badges and status dots. Every control takes `value` + `onChange(value)` (the value, not the
// event), plus `className`, `style` and any other DOM props for its root.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { cx } from "../cx"
import { Icon } from "./icon"

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
}: {
    variant?: "default" | "primary" | "ghost" | "danger" | "ok" | "warn"
    size?: "sm" | "md" | "lg"
    icon?: string
    iconRight?: string
    pressed?: boolean
    loading?: boolean
    block?: boolean
    type?: string
    href?: string
} & Record<string, any>) {
    const link = href !== undefined
    const Tag = link ? "a" : "button"
    return (
        <Tag
            {...(link ? { href: disabled ? undefined : href, "aria-disabled": disabled || undefined } : { type })}
            className={cx(
                "dr-btn",
                variant !== "default" && `dr-btn--${variant}`,
                size !== "md" && `dr-btn--${size}`,
                block && "dr-btn--block",
                className,
            )}
            aria-pressed={pressed === undefined ? undefined : !!pressed}
            aria-busy={loading || undefined}
            disabled={link ? undefined : disabled || loading}
            {...rest}
        >
            {loading ? <span className="dr-spinner dr-spinner--inline" aria-hidden="true" /> : null}
            {!loading && icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
            {children}
            {iconRight ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
        </Tag>
    )
}

/**
 * A button that acts while held (jog controls): `onHold()` on press, `onRelease()` on release, cancel or a lost
 * capture, so a missed pointerup still stops. Takes Button's props.
 * @param {Record<string, any>} props
 */
export function HoldButton({ onHold, onRelease, disabled, className, ...rest }: Record<string, any>) {
    return (
        <Button
            className={cx("dr-btn--hold", className)}
            disabled={disabled}
            style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", ...rest.style }}
            onPointerDown={(event) => {
                if (disabled || event.button !== 0) {
                    return
                }
                event.currentTarget.setPointerCapture?.(event.pointerId)
                onHold?.()
            }}
            onPointerUp={() => onRelease?.()}
            onPointerCancel={() => onRelease?.()}
            onLostPointerCapture={() => onRelease?.()}
            onContextMenu={(event) => event.preventDefault()}
            {...rest}
        />
    )
}

/**
 * A square icon-only button; `label` is its accessible name and tooltip.
 * @param {Record<string, any>} props
 */
export function IconButton({
    icon,
    label,
    size = "md",
    variant = "ghost",
    round = false,
    className,
    ...rest
}: Record<string, any>) {
    return (
        <Button
            variant={variant}
            size={size}
            className={cx("dr-btn--icon", round && "dr-btn--round", className)}
            aria-label={label}
            title={label}
            {...rest}
        >
            <Icon name={icon} size={size === "sm" ? 14 : size === "lg" ? 20 : 17} />
        </Button>
    )
}

/**
 * Buttons side by side, joined into one control.
 * @param {Record<string, any>} props
 */
export function ButtonGroup({ className, children, ...rest }: Record<string, any>) {
    return (
        <div className={cx("dr-btn-group", className)} role="group" {...rest}>
            {children}
        </div>
    )
}

/**
 * A label + control + hint/error, stacked (or `inline`: label left, control right).
 * @param {Record<string, any>} props
 */
export function Field({
    label,
    hint,
    error,
    inline = false,
    htmlFor,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div className={cx("dr-field", inline && "dr-field--inline", error && "dr-field--error", className)} {...rest}>
            {label ? (
                <label className="dr-field-label" htmlFor={htmlFor}>
                    {label}
                </label>
            ) : null}
            <div className="dr-field-control">{children}</div>
            {error ? (
                <div className="dr-field-error" role="alert">
                    {error}
                </div>
            ) : hint ? (
                <div className="dr-field-hint">{hint}</div>
            ) : null}
        </div>
    )
}

/**
 * Single-line text. `onChange(text)` on every keystroke; `onEnter(text)` on Enter. Or `onCommit(text)` alone: the box
 * keeps what's typed and reports it once, on Enter or blur, when it differs from `value` (renames, labels); Escape
 * puts `value` back.
 * @param {Record<string, any>} props
 */
export function TextInput({
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
    style,
    invalid,
    ...rest
}: Record<string, any>) {
    const [draft, setDraft] = useState(null)
    const committing = !!onCommit && !onChange
    const commit = (text) => {
        setDraft(null)
        if (text !== (value ?? "")) {
            onCommit?.(text)
        }
    }
    const input = (
        <input
            type="text"
            className={cx(
                "dr-input",
                size === "sm" && "dr-input--sm",
                mono && "dr-mono",
                icon && "dr-input--with-icon",
            )}
            value={committing ? (draft ?? value ?? "") : (value ?? "")}
            aria-invalid={invalid || undefined}
            onChange={(event) => (committing ? setDraft(event.target.value) : onChange?.(event.target.value))}
            onKeyDown={(event) => {
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
            }}
            onBlur={(event) => {
                if (committing && draft !== null) {
                    commit(event.currentTarget.value)
                }
                onBlur?.(event)
            }}
            {...rest}
        />
    )
    if (!icon) {
        return (
            <span className={cx("dr-input-wrap", className)} style={style}>
                {input}
            </span>
        )
    }
    return (
        <span className={cx("dr-input-wrap", className)} style={style}>
            <span className="dr-input-icon">
                <Icon name={icon} size={15} />
            </span>
            {input}
        </span>
    )
}

/**
 * A search box: a magnifier, and a clear button once there is text.
 * @param {Record<string, any>} props
 */
export function SearchInput({
    value,
    onChange,
    placeholder = "Search…",
    className,
    style,
    ...rest
}: Record<string, any>) {
    return (
        <span className={cx("dr-input-wrap dr-search", className)} style={style}>
            <span className="dr-input-icon">
                <Icon name="search" size={15} />
            </span>
            <input
                type="search"
                className="dr-input dr-input--with-icon"
                value={value ?? ""}
                placeholder={placeholder}
                onChange={(event) => onChange?.(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && value) {
                        event.stopPropagation()
                        onChange?.("")
                    }
                }}
                {...rest}
            />
            {value ? (
                <button type="button" className="dr-input-clear" aria-label="Clear" onClick={() => onChange?.("")}>
                    <Icon name="close" size={13} />
                </button>
            ) : null}
        </span>
    )
}

/**
 * Multi-line text.
 * @param {Record<string, any>} props
 */
export function TextArea({ value, onChange, mono = false, rows = 4, className, ...rest }: Record<string, any>) {
    return (
        <textarea
            className={cx("dr-input dr-textarea", mono && "dr-mono", className)}
            rows={rows}
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
            {...rest}
        />
    )
}

const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value))

/**
 * A number box that only reports finite numbers: typing keeps the text, Enter/blur commits; ↑/↓ step (shift: ×10).
 * `unit` shows after the number. `nullable`: clearing the box reports null (e.g. "auto"; pair with a placeholder).
 * @param {Record<string, any>} props
 */
export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    unit,
    size = "md",
    precision,
    nullable = false,
    className,
    style,
    ...rest
}: Record<string, any>) {
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
    return (
        <span className={cx("dr-input-wrap dr-number", className)} style={style}>
            <input
                type="text"
                inputMode="decimal"
                className={cx("dr-input dr-mono", size === "sm" && "dr-input--sm", unit && "dr-input--with-unit")}
                value={text}
                onFocus={() => (focused.current = true)}
                onBlur={(event) => {
                    focused.current = false
                    commit(event.target.value)
                }}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        commit(event.currentTarget.value)
                    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault()
                        const base = Number.isFinite(Number(text)) ? Number(text) : (value ?? 0)
                        const delta = (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
                        const next = clamp(Math.round((base + delta) / step) * step, min, max)
                        const rounded = Number(next.toFixed(10))
                        setText(shown(rounded))
                        onChange?.(rounded)
                    }
                }}
                {...rest}
            />
            {unit ? <span className="dr-input-unit">{unit}</span> : null}
        </span>
    )
}

/** Normalizes options: ["a", "b"], [["a", "Label A"]], or [{ value, label, disabled }]. */
export function normalizeOptions(options = []) {
    return options.map((option) =>
        Array.isArray(option)
            ? { value: option[0], label: option[1] ?? String(option[0]) }
            : typeof option === "object" && option !== null
              ? { label: String(option.value), ...option }
              : { value: option, label: String(option) },
    )
}

/**
 * A native select (keyboard, mobile pickers and screen readers for free), themed. `options`: strings,
 * [value, label] pairs or { value, label, disabled, group }. `onChange` gets the option's value (its original type).
 * @param {Record<string, any>} props
 */
export function Select({
    value,
    onChange,
    options,
    placeholder,
    size = "md",
    className,
    ...rest
}: Record<string, any>) {
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
    const option = ([position, item]) => (
        <option key={position} value={String(position)} disabled={item.disabled}>
            {item.label}
        </option>
    )
    return (
        <select
            className={cx("dr-select", size === "sm" && "dr-select--sm", className)}
            // the whole choice on hover, for a select narrower than its text
            title={index >= 0 ? String(items[index].label) : undefined}
            value={index >= 0 ? String(index) : ""}
            onChange={(event) => {
                const item = items[Number(event.target.value)]
                if (item) {
                    onChange?.(item.value)
                }
            }}
            {...rest}
        >
            {index < 0 ? (
                <option value="" disabled={true}>
                    {placeholder ?? "Choose…"}
                </option>
            ) : null}
            {groups.map((group) =>
                group.name ? (
                    <optgroup key={group.name} label={group.name}>
                        {group.items.map(option)}
                    </optgroup>
                ) : (
                    group.items.map(option)
                ),
            )}
        </select>
    )
}

/**
 * A checkbox with its label. `indeterminate` shows a dash.
 * @param {Record<string, any>} props
 */
export function Checkbox({
    value,
    onChange,
    label,
    indeterminate = false,
    disabled,
    className,
    children,
    ...rest
}: Record<string, any>) {
    const ref = useRef(null)
    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate
        }
    }, [indeterminate])
    return (
        <label className={cx("dr-check", disabled && "dr-check--disabled", className)}>
            <input
                ref={ref}
                type="checkbox"
                checked={!!value}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.checked)}
                {...rest}
            />
            <span className="dr-check-box" aria-hidden="true" />
            {(label ?? children) ? <span className="dr-check-label">{label ?? children}</span> : null}
        </label>
    )
}

/**
 * An on/off switch (role="switch").
 * @param {Record<string, any>} props
 */
export function Toggle({ value, onChange, label, size = "md", disabled, className, ...rest }: Record<string, any>) {
    return (
        <label
            className={cx("dr-toggle", size === "sm" && "dr-toggle--sm", disabled && "dr-check--disabled", className)}
        >
            <input
                type="checkbox"
                role="switch"
                checked={!!value}
                aria-checked={!!value}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.checked)}
                {...rest}
            />
            <span className="dr-toggle-track" aria-hidden="true">
                <span className="dr-toggle-knob" />
            </span>
            {label ? <span className="dr-check-label">{label}</span> : null}
        </label>
    )
}
export const Switch = Toggle

/**
 * One radio button (use RadioGroup for a set).
 * @param {Record<string, any>} props
 */
export function Radio({ checked, onChange, label, name, value, disabled, className, ...rest }: Record<string, any>) {
    return (
        <label className={cx("dr-check dr-radio", disabled && "dr-check--disabled", className)}>
            <input
                type="radio"
                name={name}
                value={String(value)}
                checked={!!checked}
                disabled={disabled}
                onChange={() => onChange?.(value)}
                {...rest}
            />
            <span className="dr-check-box" aria-hidden="true" />
            {label ? <span className="dr-check-label">{label}</span> : null}
        </label>
    )
}

/**
 * A set of radios: `options` as for Select; `direction` "column" | "row".
 * @param {Record<string, any>} props
 */
export function RadioGroup({
    value,
    onChange,
    options,
    name,
    direction = "column",
    className,
    ...rest
}: Record<string, any>) {
    const autoName = useId()
    return (
        <div role="radiogroup" className={cx("dr-radio-group", `dr-radio-group--${direction}`, className)} {...rest}>
            {normalizeOptions(options).map((item) => (
                <Radio
                    key={String(item.value)}
                    name={name ?? autoName}
                    value={item.value}
                    label={item.label}
                    disabled={item.disabled}
                    checked={item.value === value}
                    onChange={onChange}
                />
            ))}
        </div>
    )
}

/**
 * A range slider with its value shown. `format(value)` for the readout; `onCommit(value)` once the drag ends.
 * @param {Record<string, any>} props
 */
export function Slider({
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
}: Record<string, any>) {
    const fraction = (clamp(value ?? min, min, max) - min) / (max - min || 1)
    return (
        <div
            className={cx("dr-slider", disabled && "dr-slider--disabled", className)}
            style={{ "--dr-fill": `${fraction * 100}%` }}
        >
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value ?? min}
                disabled={disabled}
                onChange={(event) => onChange?.(Number(event.target.value))}
                onPointerUp={(event) => onCommit?.(Number(event.currentTarget.value))}
                onKeyUp={(event) => onCommit?.(Number(event.currentTarget.value))}
                {...rest}
            />
            {showValue ? <output className="dr-slider-value">{format ? format(value) : String(value)}</output> : null}
        </div>
    )
}

/**
 * Two thumbs on one track: `value` = [low, high].
 * @param {Record<string, any>} props
 */
export function RangeSlider({
    value = [0, 1],
    onChange,
    min = 0,
    max = 1,
    step = 0.01,
    format,
    showValue = true,
    className,
    disabled,
}: Record<string, any>) {
    const [low, high] = value
    const at = (number) => `${((clamp(number, min, max) - min) / (max - min || 1)) * 100}%`
    const show = (number) => (format ? format(number) : String(number))
    return (
        <div
            className={cx("dr-slider dr-range", disabled && "dr-slider--disabled", className)}
            style={{ "--dr-from": at(low), "--dr-to": at(high) }}
        >
            <div className="dr-range-inputs">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={low}
                    disabled={disabled}
                    aria-label="minimum"
                    onChange={(event) => onChange?.([Math.min(Number(event.target.value), high), high])}
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={high}
                    disabled={disabled}
                    aria-label="maximum"
                    onChange={(event) => onChange?.([low, Math.max(Number(event.target.value), low)])}
                />
            </div>
            {showValue ? <output className="dr-slider-value">{`${show(low)} – ${show(high)}`}</output> : null}
        </div>
    )
}

/**
 * A small status label. `tone`: "default" | "info" | "ok" | "warn" | "danger"; `solid` fills it; `dot` adds a dot.
 * @param {Record<string, any>} props
 */
export function Badge({
    tone = "default",
    solid = false,
    dot = false,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <span
            className={cx("dr-badge", tone !== "default" && `dr-badge--${tone}`, solid && "dr-badge--solid", className)}
            {...rest}
        >
            {dot ? <span className="dr-badge-dot" /> : null}
            {children}
        </span>
    )
}

/**
 * A toggleable chip (filters, multi-select). `selected` + `onChange(selected)`; `onRemove` adds an ✕.
 * @param {Record<string, any>} props
 */
export function Chip({ selected, onChange, onRemove, icon, tone, className, children, ...rest }: Record<string, any>) {
    return (
        <span
            className={cx("dr-chip", tone && `dr-badge--${tone}`, className)}
            role={onChange ? "button" : undefined}
            tabIndex={onChange ? 0 : undefined}
            aria-pressed={onChange ? !!selected : undefined}
            onClick={onChange ? () => onChange(!selected) : undefined}
            onKeyDown={
                onChange
                    ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              onChange(!selected)
                          }
                      }
                    : undefined
            }
            {...rest}
        >
            {icon ? <Icon name={icon} size={13} /> : null}
            {children}
            {onRemove ? (
                <button
                    type="button"
                    className="dr-chip-remove"
                    aria-label="Remove"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemove()
                    }}
                >
                    <Icon name="close" size={11} />
                </button>
            ) : null}
        </span>
    )
}

/**
 * A row of read-only tags (a blueprint's modules, a message's topics). `items`: strings or { label, tone, title, key }.
 * `oneLine` keeps them on one line: as many as fit, then a "+N" tag whose title lists the rest. `extra` goes after them
 * (always shown).
 * @param {{ items: (string | { label: any, tone?: string, title?: string, key?: any })[], oneLine?: boolean,
 *   extra?: any, className?: string }} props
 */
export function TagList({
    items = [],
    oneLine = false,
    extra,
    className,
    ...rest
}: {
    items: (string | { label: any; tone?: string; title?: string; key?: any })[]
    oneLine?: boolean
    extra?: any
    className?: string
}) {
    const tags = items.map((item) => (typeof item === "object" && item !== null ? item : { label: item }))
    const box = useRef(null)
    const [fits, setFits] = useState(tags.length)
    const signature = tags.map((tag) => String(tag.key ?? tag.label)).join("\u0000")
    useLayoutEffect(() => {
        const element = box.current
        if (!oneLine || !element) {
            return
        }
        // every tag laid out, then keep those that fit beside a "+N"
        const measure = () => {
            const shown = [...element.querySelectorAll(":scope > .dr-tag-item")]
            const room = element.clientWidth - 44
            const count = shown.findIndex((tag) => tag.offsetLeft - element.offsetLeft + tag.offsetWidth > room)
            setFits(count < 0 ? tags.length : Math.max(1, count))
        }
        let frame = 0
        const again = () => {
            setFits(tags.length)
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(measure)
        }
        again()
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again)
        observer?.observe(element)
        return () => {
            cancelAnimationFrame(frame)
            observer?.disconnect()
        }
    }, [signature, oneLine])
    const shown = oneLine ? tags.slice(0, fits) : tags
    const hidden = oneLine ? tags.slice(fits) : []
    return (
        <span ref={box} className={cx("dr-tags", oneLine && "dr-tags--one-line", className)} {...rest}>
            {shown.map((tag, index) => (
                <Badge
                    key={tag.key ?? `${index}:${tag.label}`}
                    tone={tag.tone ?? "default"}
                    title={tag.title}
                    className="dr-tag-item"
                >
                    {tag.label}
                </Badge>
            ))}
            {hidden.length ? (
                <Badge
                    className="dr-tag-more"
                    title={hidden.map((tag) => (typeof tag.label === "string" ? tag.label : "")).join(", ")}
                >{`+${hidden.length}`}</Badge>
            ) : null}
            {extra}
        </span>
    )
}

/**
 * A status dot: tone "ok" | "warn" | "danger" | "info" | "off"; `pulse` animates it.
 * @param {Record<string, any>} props
 */
export function StatusDot({ tone = "ok", pulse = false, label, className, ...rest }: Record<string, any>) {
    return (
        <span
            className={cx("dr-dot", `dr-dot--${tone}`, pulse && "dr-dot--pulse", className)}
            role={label ? "img" : undefined}
            aria-label={label}
            title={label}
            {...rest}
        />
    )
}

const CONNECTION_TONES = { connected: "ok", connecting: "warn", degraded: "warn", lost: "danger", offline: "off" }

/**
 * A link indicator: dot + state (+ an optional detail like "12 ms"). `state` is a data source state ("connecting" |
 * "connected" | "degraded" | "lost"); see useConnectionState().
 * @param {Record<string, any>} props
 */
export function ConnectionStatus({ state = "connecting", label, detail, className, ...rest }: Record<string, any>) {
    const tone = CONNECTION_TONES[state] ?? "off"
    return (
        <span className={cx("dr-conn", `dr-conn--${tone}`, className)} role="status" {...rest}>
            <StatusDot tone={tone} pulse={state === "connecting"} />
            <span className="dr-conn-label">{label ?? state}</span>
            {detail ? <span className="dr-conn-detail">{detail}</span> : null}
        </span>
    )
}

/**
 * A keyboard key: <Kbd>W</Kbd>, or `keys={["mod", "K"]}`.
 * @param {Record<string, any>} props
 */
export function Kbd({ keys, className, children, ...rest }: Record<string, any>) {
    const mac = /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? "")
    const label = (key) =>
        key === "mod" ? (mac ? "⌘" : "Ctrl") : key === "shift" ? "⇧" : key === "alt" ? (mac ? "⌥" : "Alt") : key
    if (keys) {
        return (
            <span className={cx("dr-kbd-group", className)} {...rest}>
                {keys.map((key, index) => (
                    <kbd key={index} className="dr-kbd">
                        {label(key)}
                    </kbd>
                ))}
            </span>
        )
    }
    return (
        <kbd className={cx("dr-kbd", className)} {...rest}>
            {children}
        </kbd>
    )
}

/**
 * A round floating action button over a view (the main actions of a canvas app). `tone` colors its ring ("primary" |
 * "info" | "ok" | "warn" | "danger"); `active` fills it (its panel is open); `attention` draws the eye: "pulse" (the
 * next step), "glow" (recommended), "spin" (working). `label` is its tooltip and accessible name.
 */
export function Fab({
    icon,
    label,
    tone = "primary",
    active = false,
    attention,
    size = 52,
    className,
    style,
    ...rest
}) {
    return (
        <button
            type="button"
            className={cx(
                "dr-fab",
                `dr-fab--${tone}`,
                active && "dr-fab--active",
                attention && `dr-fab--${attention}`,
                className,
            )}
            aria-label={label}
            aria-pressed={active}
            title={label}
            style={{ "--dr-fab-size": `${size}px`, ...style }}
            {...rest}
        >
            <Icon name={icon} size={Math.round(size * 0.4)} />
        </button>
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
    return (
        <div
            className={cx("dr-dial", `dr-dial--${tone}`, disabled && "dr-dial--disabled", className)}
            role="slider"
            aria-valuenow={Math.round((value * 180) / Math.PI)}
            aria-valuemin={-180}
            aria-valuemax={180}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={start}
            onKeyDown={(event) => {
                const step = ((event.shiftKey ? 10 : 1) * Math.PI) / 180
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault()
                    onChange?.(value + step)
                } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault()
                    onChange?.(value - step)
                }
            }}
            style={{ width: size, height: size, ...style }}
            {...rest}
        >
            <span className="dr-dial-hand" style={{ transform: `rotate(${(-value * 180) / Math.PI}deg)` }} />
        </div>
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
    return (
        <Button
            size={size}
            icon={copied ? "check" : "copy"}
            title={label}
            onClick={() =>
                globalThis.navigator?.clipboard?.writeText(text).then(
                    () => setCopied(true),
                    () => {},
                )
            }
            {...rest}
        >
            {copied ? "Copied" : (children ?? "Copy")}
        </Button>
    )
}
