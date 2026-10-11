// Alerts, toasts, modals (+ confirm / prompt), spinners, progress, empty states and an error boundary.
import {
    Component,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { cx } from "../cx"
import { useEscape } from "../hooks"
import { Icon } from "./icon"
import { Button, IconButton, TextInput } from "./controls"

const TONE_ICONS = { info: "info", ok: "check-circle", warn: "warn", danger: "x-circle" }

/**
 * An inline notice. `tone`: "info" | "ok" | "warn" | "danger"; `title`; `actions` (buttons); `onClose` adds an ✕.
 * @param {Record<string, any>} props
 */
export function Alert({
    tone = "info",
    title,
    icon,
    actions,
    onClose,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div
            className={cx("dr-alert", `dr-alert--${tone}`, className)}
            role={tone === "danger" || tone === "warn" ? "alert" : "status"}
            {...rest}
        >
            <span className="dr-alert-icon">
                <Icon name={icon ?? TONE_ICONS[tone] ?? "info"} size={16} />
            </span>
            <div className="dr-alert-body">
                {title ? <div className="dr-alert-title">{title}</div> : null}
                {children ? <div className="dr-alert-text">{children}</div> : null}
                {actions ? <div className="dr-alert-actions">{actions}</div> : null}
            </div>
            {onClose ? <IconButton icon="close" label="Dismiss" size="sm" onClick={onClose} /> : null}
        </div>
    )
}

// ── toasts: a module-level queue, so toast() works from anywhere (event handlers, non-React code) ──

let toasts = []
let toastId = 0
const toastListeners = new Set()
const emitToasts = () => toastListeners.forEach((listener) => listener())

/**
 * Shows a toast; returns its id. `toast("Saved")`, `toast({ title, message, tone, durationMs, action: { label, onClick } })`.
 * `durationMs: 0` keeps it until dismissed. Shown by the nearest <ToastViewport> (AppProvider/ToastProvider add one).
 */
export function toast(input) {
    const options = typeof input === "string" ? { message: input } : input
    const id = options.id ?? ++toastId
    const entry = { tone: "info", durationMs: options.tone === "danger" ? 8000 : 4000, ...options, id }
    toasts = [...toasts.filter((other) => other.id !== id), entry].slice(-6)
    emitToasts()
    return id
}
toast.ok = (message, options) => toast({ ...options, message, tone: "ok" })
toast.warn = (message, options) => toast({ ...options, message, tone: "warn" })
toast.error = (message, options) => toast({ ...options, message, tone: "danger" })
toast.info = (message, options) => toast({ ...options, message, tone: "info" })

/** Removes a toast (all of them without an id). */
export function dismissToast(id) {
    toasts = id === undefined ? [] : toasts.filter((entry) => entry.id !== id)
    emitToasts()
}

function useToasts() {
    return useSyncExternalStore(
        (listener) => {
            toastListeners.add(listener)
            return () => toastListeners.delete(listener)
        },
        () => toasts,
        () => toasts,
    )
}

function ToastItem({ entry }) {
    useEffect(() => {
        if (!entry.durationMs) {
            return
        }
        const timer = setTimeout(() => dismissToast(entry.id), entry.durationMs)
        return () => clearTimeout(timer)
    }, [entry.id, entry.durationMs])
    return (
        <div className={cx("dr-toast", `dr-toast--${entry.tone}`)} role={entry.tone === "danger" ? "alert" : "status"}>
            <span className="dr-toast-icon">
                <Icon name={TONE_ICONS[entry.tone] ?? "info"} size={16} />
            </span>
            <div className="dr-toast-body">
                {entry.title ? <div className="dr-toast-title">{entry.title}</div> : null}
                {entry.message ? <div className="dr-toast-text">{entry.message}</div> : null}
            </div>
            {entry.action ? (
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                        entry.action.onClick?.()
                        dismissToast(entry.id)
                    }}
                >
                    {entry.action.label}
                </Button>
            ) : null}
            <IconButton icon="close" label="Dismiss" size="sm" onClick={() => dismissToast(entry.id)} />
        </div>
    )
}

/**
 * Where toasts appear (bottom-right, above Desktop's dock). `position`: "bottom-right" | "bottom" | "top-right" | "top".
 * @param {Record<string, any>} props
 */
export function ToastViewport({ position = "bottom-right" }: Record<string, any>) {
    const list = useToasts()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    if (!mounted) {
        return null
    }
    return createPortal(
        <div className={cx("dr-toasts", `dr-toasts--${position}`)} aria-live="polite">
            {list.map((entry) => (
                <ToastItem key={entry.id} entry={entry} />
            ))}
        </div>,
        document.body,
    )
}

const ToastContext = createContext(toast)
/**
 * Adds a ToastViewport; `useToast()` below it returns toast().
 * @param {Record<string, any>} props
 */
export function ToastProvider({ position, children }: Record<string, any>) {
    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastViewport position={position} />
        </ToastContext.Provider>
    )
}
/** The toast() function (toast.ok / .warn / .error / .info). */
export function useToast() {
    return useContext(ToastContext)
}

// ── modals ──

/**
 * A modal dialog over a scrim. `open` + `onClose`; `title`, `footer` (buttons); `size` "sm" | "md" | "lg";
 * `dismissable` (default true): Escape and a scrim click close it.
 * @param {Record<string, any>} props
 */
export function Modal({
    open,
    onClose,
    title,
    footer,
    size = "md",
    dismissable = true,
    className,
    children,
    ...rest
}: Record<string, any>) {
    const titleId = useId()
    const panel = useRef(null)
    useEscape(() => dismissable && onClose?.(), !!open)
    useEffect(() => {
        if (!open) {
            return
        }
        const previous = document.activeElement
        const first = panel.current?.querySelector("[autofocus], input, select, textarea, button:not(.dr-modal-close)")
        ;(first ?? panel.current)?.focus?.()
        return () => previous?.focus?.()
    }, [open])
    if (!open || typeof document === "undefined") {
        return null
    }
    return createPortal(
        <div
            className="dr-scrim"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && dismissable) {
                    onClose?.()
                }
            }}
        >
            <div
                ref={panel}
                className={cx("dr-modal", `dr-modal--${size}`, className)}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
                {...rest}
            >
                {title || dismissable ? (
                    <header className="dr-modal-head">
                        <div id={titleId} className="dr-modal-title">
                            {title}
                        </div>
                        {dismissable ? (
                            <IconButton
                                icon="close"
                                label="Close"
                                size="sm"
                                className="dr-modal-close"
                                onClick={onClose}
                            />
                        ) : null}
                    </header>
                ) : null}
                <div className="dr-modal-body">{children}</div>
                {footer ? <footer className="dr-modal-foot">{footer}</footer> : null}
            </div>
        </div>,
        document.body,
    )
}

// ── confirm / prompt: promise-returning dialogs ──

const DialogContext = createContext(null)

/**
 * Hosts useConfirm / usePrompt dialogs (AppProvider includes it).
 * @param {Record<string, any>} props
 */
export function DialogProvider({ children }: Record<string, any>) {
    const [dialog, setDialog] = useState(null)
    const [text, setText] = useState("")
    const open = useCallback(
        (kind, options) =>
            new Promise((resolve) => {
                setText(options.defaultValue ?? "")
                setDialog({ kind, options, resolve })
            }),
        [],
    )
    const close = (result) => {
        dialog?.resolve(result)
        setDialog(null)
    }
    const options = dialog?.options ?? {}
    const isPrompt = dialog?.kind === "prompt"
    const submit = () => close(isPrompt ? text : true)
    return (
        <DialogContext.Provider value={open}>
            {children}
            <Modal
                open={!!dialog}
                size="sm"
                title={options.title ?? (isPrompt ? "Enter a value" : "Are you sure?")}
                onClose={() => close(isPrompt ? null : false)}
                footer={[
                    <Button key="cancel" onClick={() => close(isPrompt ? null : false)}>
                        {options.cancelLabel ?? "Cancel"}
                    </Button>,
                    <Button
                        key="ok"
                        variant={options.danger ? "danger" : "primary"}
                        onClick={submit}
                        disabled={isPrompt && options.required !== false && !text.trim()}
                    >
                        {options.confirmLabel ?? (isPrompt ? "OK" : "Confirm")}
                    </Button>,
                ]}
            >
                {options.message ? <p className="dr-modal-message">{options.message}</p> : null}
                {isPrompt ? (
                    <TextInput
                        value={text}
                        onChange={setText}
                        onEnter={submit}
                        placeholder={options.placeholder}
                        autoFocus={true}
                    />
                ) : null}
            </Modal>
        </DialogContext.Provider>
    )
}

function useDialog() {
    const open = useContext(DialogContext)
    if (!open) {
        throw new Error("dimos-react: useConfirm/usePrompt need a <DialogProvider> (or <AppProvider>) above them")
    }
    return open
}

/** `const confirm = useConfirm(); if (await confirm({ title, message, danger, confirmLabel })) …` → true/false. */
export function useConfirm() {
    const open = useDialog()
    return useCallback(
        (options = {}) => open("confirm", typeof options === "string" ? { message: options } : options),
        [open],
    )
}

/** `const prompt = usePrompt(); const name = await prompt({ title, defaultValue, placeholder })` → string or null. */
export function usePrompt() {
    const open = useDialog()
    return useCallback(
        (options = {}) => open("prompt", typeof options === "string" ? { title: options } : options),
        [open],
    )
}

// ── progress ──

/**
 * A spinning ring; `label` for screen readers.
 * @param {Record<string, any>} props
 */
export function Spinner({ size = 18, label = "Loading", className, ...rest }: Record<string, any>) {
    return (
        <span
            className={cx("dr-spinner", className)}
            style={{ width: size, height: size }}
            role="status"
            aria-label={label}
            {...rest}
        />
    )
}

/**
 * A bar: `value` 0..1, or none for an indeterminate one. `tone` colors it.
 * @param {Record<string, any>} props
 */
export function Progress({ value, tone = "primary", label, className, ...rest }: Record<string, any>) {
    const known = typeof value === "number" && Number.isFinite(value)
    return (
        <div
            className={cx(
                "dr-progress",
                !known && "dr-progress--indeterminate",
                tone !== "primary" && `dr-progress--${tone}`,
                className,
            )}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={known ? Math.round(value * 100) : undefined}
            aria-label={label}
            {...rest}
        >
            <div
                className="dr-progress-fill"
                style={known ? { width: `${Math.min(1, Math.max(0, value)) * 100}%` } : undefined}
            />
        </div>
    )
}

/**
 * A ring: `value` 0..1 (uploads, downloads); shows the percent inside unless `children` replace it.
 * @param {Record<string, any>} props
 */
export function ProgressRing({
    value = 0,
    size = 44,
    stroke = 4,
    tone = "primary",
    className,
    children,
    ...rest
}: Record<string, any>) {
    const radius = (size - stroke) / 2
    const length = 2 * Math.PI * radius
    const clamped = Math.min(1, Math.max(0, value))
    return (
        <div
            className={cx("dr-ring", tone !== "primary" && `dr-ring--${tone}`, className)}
            style={{ width: size, height: size }}
            role="progressbar"
            aria-valuenow={Math.round(clamped * 100)}
            {...rest}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    className="dr-ring-track"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={stroke}
                    fill="none"
                />
                <circle
                    className="dr-ring-fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={length}
                    strokeDashoffset={length * (1 - clamped)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <span className="dr-ring-label">{children ?? `${Math.round(clamped * 100)}%`}</span>
        </div>
    )
}

/**
 * A loading placeholder block.
 * @param {Record<string, any>} props
 */
export function Skeleton({ width = "100%", height = 14, className, style, ...rest }: Record<string, any>) {
    return <span className={cx("dr-skeleton", className)} style={{ width, height, ...style }} {...rest} />
}

/**
 * A first-run / empty / error message with next steps. `layer` centers it over a whole view (a canvas, a 3D scene).
 * @param {Record<string, any>} props
 */
export function EmptyState({
    icon = "info",
    title,
    message,
    actions,
    tone,
    layer = false,
    className,
    children,
    ...rest
}: Record<string, any>) {
    return (
        <div className={cx("dr-empty", layer && "dr-empty--layer", tone && `dr-empty--${tone}`, className)} {...rest}>
            <div className="dr-empty-inner">
                {icon ? (
                    <span className="dr-empty-icon">
                        <Icon name={icon} size={28} strokeWidth={1.5} />
                    </span>
                ) : null}
                {title ? <div className="dr-empty-title">{title}</div> : null}
                {message ? <div className="dr-empty-text">{message}</div> : null}
                {children}
                {actions ? <div className="dr-empty-actions">{actions}</div> : null}
            </div>
        </div>
    )
}

/**
 * Catches render errors below it and shows `fallback` (an element, or `({ error, reset }) => element`); reports via
 * `onError(error, info)`.
 */
export class ErrorBoundary extends Component {
    reset: () => void
    constructor(props) {
        super(props)
        this.state = { error: null }
        this.reset = () => this.setState({ error: null })
    }
    static getDerivedStateFromError(error) {
        return { error }
    }
    componentDidCatch(error, info) {
        this.props.onError?.(error, info)
    }
    render() {
        const { error } = this.state
        if (!error) {
            return this.props.children
        }
        const { fallback } = this.props
        if (typeof fallback === "function") {
            return fallback({ error, reset: this.reset })
        }
        return (
            fallback ?? (
                <EmptyState
                    icon="warn"
                    tone="danger"
                    title="Something went wrong"
                    message={String(error?.message ?? error)}
                    actions={
                        <Button size="sm" onClick={this.reset}>
                            Try again
                        </Button>
                    }
                />
            )
        )
    }
}
