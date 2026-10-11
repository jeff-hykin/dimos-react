// Driving input for phones and HUDs: a thumb stick whose whole zone takes the thumb (the stick centers where it lands,
// so it never needs aiming), with a dead zone, an expo curve and easing toward the thumb while held; and a KeyPad that
// shows keyboard keys lit while held. Safety: anything that could mean "the thumb is gone" (a lift, a cancel, a lost
// capture, another app or tab, the page hiding, a rotation, releaseAllThumbSticks()) zeroes the stick at once, never
// eased.
import { useEffect, useRef, useState } from "react"
import type { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { cx } from "../cx.ts"

/** below this share of the radius a resting thumb sends nothing */
export const STICK_DEAD_ZONE = 0.12
/** >1 flattens the middle: small moves are finer, the edge is still full speed */
export const STICK_EXPO = 1.6
/** how quickly a held stick's output follows the thumb (time constant, ms) */
export const STICK_SMOOTH_MS = 70

const clean = (value: number) => Math.round(value * 1000) / 1000 || 0

function shapeAxis(value: number) {
    const size = Math.min(1, Math.abs(value))
    if (size <= STICK_DEAD_ZONE) {
        return 0
    }
    return clean(Math.sign(value) * Math.pow((size - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE), STICK_EXPO))
}

/**
 * The thumb's offset from the stick's center (px, screen y down) → `{ x, y }` in -1..1 (up = +y). `axes` "xy" uses a
 * radial dead zone (no snapping to an axis); "x" / "y" look at that axis alone.
 */
export function shapeStick(dx: number, dy: number, radius: number, axes: StickAxes = "xy"): StickValue {
    if (!(radius > 0)) {
        return { x: 0, y: 0 }
    }
    let x = dx / radius
    let y = -dy / radius
    if (axes === "x") {
        return { x: shapeAxis(x), y: 0 }
    }
    if (axes === "y") {
        return { x: 0, y: shapeAxis(y) }
    }
    const length = Math.hypot(x, y)
    if (length <= STICK_DEAD_ZONE) {
        return { x: 0, y: 0 }
    }
    const scaled = Math.pow((Math.min(1, length) - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE), STICK_EXPO)
    x = (x / length) * scaled
    y = (y / length) * scaled
    return { x: clean(x), y: clean(y) }
}

/**
 * One easing step: `current` toward `target` over `dtMs` (exponential, time constant `tauMs`). Snaps when close; a
 * target of exactly zero is returned as zero (releasing is never eased).
 */
export function smoothToward(current: number, target: number, dtMs: number, tauMs: number = STICK_SMOOTH_MS): number {
    if (target === 0) {
        return 0
    }
    const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs))
    return Math.abs(next - target) < 0.005 ? target : clean(next)
}

export type StickAxes = "xy" | "x" | "y"
export interface StickValue {
    x: number
    y: number
}

const releases = new EventTarget()
/** A STOP button (or anything that must override a held thumb) calls this: every ThumbStick lets go until lifted. */
export function releaseAllThumbSticks() {
    releases.dispatchEvent(new Event("release"))
}

export interface ThumbStickProps extends HTMLAttributes<HTMLDivElement> {
    /** shaped -1..1 values (y up), eased while held, zero at once on release */
    onMove: (x: number, y: number) => void
    axes?: StickAxes
    label?: string
    className?: string
    style?: CSSProperties
    /** replaces the built-in dead zone + expo */
    shape?: (dx: number, dy: number, radius: number, axes: StickAxes) => StickValue
    /** replaces the built-in easing */
    smooth?: (current: number, target: number, dtMs: number) => number
}

/** A thumb stick zone (size it with CSS: it fills its box; the ring's size is `--dr-stick`). */
export function ThumbStick({
    onMove,
    axes = "xy",
    label,
    shape = shapeStick,
    smooth = smoothToward,
    className,
    style,
    ...rest
}: ThumbStickProps) {
    const zone = useRef<HTMLDivElement>(null)
    const base = useRef<HTMLDivElement>(null)
    const onMoveRef = useRef(onMove)
    onMoveRef.current = onMove
    const latest = useRef({ shape, smooth })
    latest.current = { shape, smooth }
    const [view, setView] = useState<{ active: boolean; origin: StickValue | null; knob: StickValue }>({
        active: false,
        origin: null,
        knob: { x: 0, y: 0 },
    })
    const live = useRef<{
        pointer: number | null
        origin: StickValue
        radius: number
        target: StickValue
        current: StickValue
        frame: number
        last: number
    }>({
        pointer: null,
        origin: { x: 0, y: 0 },
        radius: 1,
        target: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        frame: 0,
        last: 0,
    })
    const emit = (x: number, y: number) => {
        const state = live.current
        if (x !== state.current.x || y !== state.current.y) {
            state.current = { x, y }
            onMoveRef.current(x, y)
        }
    }
    const release = () => {
        const state = live.current
        cancelAnimationFrame(state.frame)
        state.frame = 0
        const wasActive = state.pointer !== null
        state.pointer = null
        state.target = { x: 0, y: 0 }
        if (wasActive || state.current.x !== 0 || state.current.y !== 0) {
            state.current = { x: 0, y: 0 }
            onMoveRef.current(0, 0)
        }
        setView({ active: false, origin: null, knob: { x: 0, y: 0 } })
    }
    const releaseRef = useRef(release)
    releaseRef.current = release
    const step = (now: number) => {
        const state = live.current
        if (state.pointer === null) {
            return
        }
        const dt = state.last ? now - state.last : 16
        state.last = now
        emit(
            latest.current.smooth(state.current.x, state.target.x, dt),
            latest.current.smooth(state.current.y, state.target.y, dt),
        )
        state.frame = requestAnimationFrame(step)
    }
    const track = (clientX: number, clientY: number) => {
        const state = live.current
        let dx = clientX - state.origin.x
        let dy = clientY - state.origin.y
        const length = Math.hypot(dx, dy)
        if (length > state.radius) {
            dx *= state.radius / length
            dy *= state.radius / length
        }
        if (axes === "x") {
            dy = 0
        } else if (axes === "y") {
            dx = 0
        }
        state.target = latest.current.shape(dx, dy, state.radius, axes)
        if (state.target.x === 0 && state.target.y === 0) {
            emit(0, 0)
        }
        setView((old) => ({ ...old, knob: { x: dx, y: dy } }))
    }
    const down = (event: ReactPointerEvent<HTMLDivElement>) => {
        const state = live.current
        if (state.pointer !== null || (event.pointerType === "mouse" && event.button !== 0)) {
            return
        }
        event.preventDefault()
        const box = zone.current!.getBoundingClientRect()
        const ring = base.current!.offsetWidth / 2 || 60
        state.radius = ring
        const x = Math.max(box.left + ring, Math.min(box.right - ring, event.clientX))
        const y = Math.max(box.top + ring, Math.min(box.bottom - ring, event.clientY))
        state.origin = { x, y }
        state.pointer = event.pointerId
        state.last = 0
        zone.current!.setPointerCapture?.(event.pointerId)
        setView({ active: true, origin: { x: x - box.left, y: y - box.top }, knob: { x: 0, y: 0 } })
        track(event.clientX, event.clientY)
        state.frame = requestAnimationFrame(step)
    }
    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerId === live.current.pointer) {
            event.preventDefault()
            track(event.clientX, event.clientY)
        }
    }
    const up = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerId === live.current.pointer) {
            release()
        }
    }
    useEffect(() => {
        const element = zone.current!
        const letGo = () => releaseRef.current()
        const touchEnd = (event: TouchEvent) => {
            if (event.targetTouches.length === 0) {
                letGo()
            }
        }
        const hidden = () => {
            if (document.visibilityState !== "visible") {
                letGo()
            }
        }
        element.addEventListener("touchend", touchEnd)
        element.addEventListener("touchcancel", letGo)
        addEventListener("blur", letGo)
        addEventListener("pagehide", letGo)
        addEventListener("orientationchange", letGo)
        document.addEventListener("visibilitychange", hidden)
        releases.addEventListener("release", letGo)
        return () => {
            element.removeEventListener("touchend", touchEnd)
            element.removeEventListener("touchcancel", letGo)
            removeEventListener("blur", letGo)
            removeEventListener("pagehide", letGo)
            removeEventListener("orientationchange", letGo)
            document.removeEventListener("visibilitychange", hidden)
            releases.removeEventListener("release", letGo)
            letGo()
        }
    }, [])
    const { active, origin, knob } = view
    return (
        <div
            ref={zone}
            className={cx("dr-thumbstick", active && "dr-thumbstick--active", className)}
            style={style}
            aria-label={label}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            onContextMenu={(event) => event.preventDefault()}
            {...rest}
        >
            <div
                ref={base}
                className="dr-thumbstick-base"
                style={origin ? { left: origin.x, top: origin.y } : undefined}
            >
                {label ? <span className="dr-thumbstick-label">{label}</span> : null}
                <span className={cx("dr-thumbstick-guide", `dr-thumbstick-guide--${axes}`)} />
                <div className="dr-thumbstick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
            </div>
        </div>
    )
}

export interface KeyPadKey {
    label: ReactNode
    down?: boolean
    wide?: boolean
    title?: string
}

export interface KeyPadProps extends HTMLAttributes<HTMLDivElement> {
    /** null is a gap */
    rows?: (KeyPadKey | null)[][]
    className?: string
}

/** Keyboard keys in rows, lit while held: `rows` = [[{ label: "Q", down: false }, null (a gap), …], …]. */
export function KeyPad({ rows = [], className, ...rest }: KeyPadProps) {
    return (
        <div className={cx("dr-keypad", className)} {...rest}>
            {rows.map((row, index) => (
                <div key={index} className="dr-keypad-row">
                    {row.map((key, column) => (
                        <KeyCap {...(key ? { key: column, ...key } : { key: column, label: "", empty: true })} />
                    ))}
                </div>
            ))}
        </div>
    )
}

export interface KeyCapProps extends HTMLAttributes<HTMLSpanElement> {
    label: ReactNode
    down?: boolean
    empty?: boolean
    wide?: boolean
    title?: string
    className?: string
}

/** One key: `label`, `down` lights it; `empty` keeps its place invisible. */
export function KeyCap({ label, down = false, empty = false, title, className, ...rest }: KeyCapProps) {
    return (
        <span
            className={cx("dr-keycap", down && "dr-keycap--down", empty && "dr-keycap--empty", className)}
            title={title}
            aria-pressed={empty ? undefined : down}
            {...rest}
        >
            {label}
        </span>
    )
}
