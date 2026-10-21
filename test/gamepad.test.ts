// The shared gamepad driver (src/input/gamepad.ts) against fake pads and fake targets, configured the way each app
// drives with it: dim-controller (axes by robot format, halted / reconnect / confirm, RB boost) and Go2 Ctrl (B stops,
// hold B sits down, LT's analog boost, the pad in use among several). Nothing here reaches a robot.
import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"
import {
    activePad,
    boostOf,
    GamepadDriver,
    joySample,
    type PadAxes,
    padAxes,
    type PadAxesOptions,
    type PadLike,
    readPad,
    SIT_HOLD_MS,
} from "../src/input/gamepad.ts"

const ZERO: PadAxes = { forward: 0, strafe: 0, turn: 0, vertical: 0 }

interface PadState {
    lx?: number
    ly?: number
    rx?: number
    ry?: number
    a?: boolean
    b?: boolean
    rb?: boolean
    lt?: number
    rt?: number
}

function pad(state: PadState = {}, extra: Partial<PadLike> = {}): PadLike {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    buttons[0] = { pressed: !!state.a, value: state.a ? 1 : 0 }
    buttons[1] = { pressed: !!state.b, value: state.b ? 1 : 0 }
    buttons[5] = { pressed: !!state.rb, value: state.rb ? 1 : 0 }
    buttons[6] = { pressed: (state.lt ?? 0) > 0.5, value: state.lt ?? 0 }
    buttons[7] = { pressed: (state.rt ?? 0) > 0.5, value: state.rt ?? 0 }
    return {
        index: 0,
        id: "Xbox Wireless Controller (STANDARD GAMEPAD)",
        mapping: "standard",
        connected: true,
        axes: [state.lx ?? 0, state.ly ?? 0, state.rx ?? 0, state.ry ?? 0],
        buttons,
        ...extra,
    }
}

// ── dim-controller's way: axes by the robot's format, the link watch, A confirms ──

const FORMATS: Record<string, PadAxesOptions & { drives?: boolean }> = {
    dog: { strafe: true },
    wheeled: { strafe: true },
    drone: { strafe: true, vertical: true },
    arm: { drives: false },
}

function controllerRig(format = "dog", settings: { deadZone?: number; invertY?: boolean } = {}) {
    const log = { axes: [] as PadAxes[], stops: 0, reconnects: 0, confirms: 0, boost: [] as boolean[] }
    let halted = false
    const { drives = true, ...axes } = FORMATS[format]
    const driver = new GamepadDriver({
        axes: () => ({ ...axes, ...settings }),
        drives: () => drives,
        setAxes: (value) => log.axes.push(value),
        setBoost: (boost) => log.boost.push(boost > 0),
        stop: () => log.stops++,
        halted: () => halted,
        reconnect: () => log.reconnects++,
        confirm: () => log.confirms++,
    })
    const last = () => log.axes.at(-1) ?? ZERO
    const moving = () => Object.values(last()).some((value) => value !== 0)
    return { driver, log, last, moving, setHalted: (value: boolean) => (halted = value) }
}

test("controller: left stick forward / strafe, right stick turns (and lifts a drone); dead zone and expo", () => {
    const full = padAxes({ lx: -1, ly: -1, rx: -1, ry: 0 }, FORMATS.dog)
    assert(full.forward > 0.6 && full.strafe > 0.6 && full.turn === 1)
    assertEquals(padAxes({ lx: -1, ly: 0, rx: 0, ry: 0 }, FORMATS.wheeled), {
        forward: 0,
        strafe: 1,
        turn: 0,
        vertical: 0,
    })
    assertEquals(padAxes({ lx: 0.1, ly: -0.1, rx: 0.12, ry: 0 }, FORMATS.dog), ZERO)
    assert(padAxes({ lx: 0, ly: -0.5, rx: 0, ry: 0 }, FORMATS.dog).forward < 0.4)
    assertEquals(padAxes({ lx: 0, ly: -1, rx: 0, ry: 0 }, { ...FORMATS.dog, invertY: true }).forward, -1)
    assertEquals(padAxes({ lx: 0, ly: -0.25, rx: 0, ry: 0 }, { ...FORMATS.dog, deadZone: 0.3 }).forward, 0)
    assertEquals(padAxes({ lx: 0, ly: 0, rx: 0, ry: -1 }, FORMATS.drone).vertical, 1)
    // without strafe the left stick's x does nothing
    assertEquals(padAxes({ lx: -1, ly: 0, rx: 0, ry: 0 }, {}).strafe, 0)
})

test("controller: a raw (non-standard) pad is read with the common layout", () => {
    const deck = pad({ ly: -1, lt: 1, rt: 1, a: true }, {
        id: "28de-1205-Valve Software Steam Deck Controller",
        mapping: "",
    })
    const read = readPad(deck)
    assertEquals([read.ly, read.lt, read.rt, read.a], [-1, true, true, true])
    assertEquals(readPad({ ...deck, axes: [NaN] }).lx, 0)
})

test("controller: a pad connected with a stick held (or a trigger) sends nothing until it rests", () => {
    const { driver, log, moving } = controllerRig()
    driver.poll([pad({ ly: -1 })])
    driver.poll([pad({ ly: -1 })])
    assertEquals([driver.status.connected, driver.status.ready], [true, false])
    assertEquals(log.axes.filter((axes) => axes.forward !== 0), [])
    driver.poll([pad({ lt: 1 })])
    assertEquals(driver.status.ready, false)
    driver.poll([pad()])
    assertEquals(driver.status.ready, true)
    driver.poll([pad({ ly: -1 })])
    assert(moving())
})

test("controller: LT + RT stops and holds; A drives again from rest; A with nothing to resume confirms", () => {
    const { driver, log, moving } = controllerRig()
    driver.poll([pad()])
    driver.poll([pad({ ly: -1 })])
    assert(moving())
    driver.poll([pad({ ly: -1, lt: 1, rt: 1 })])
    assertEquals(log.stops, 1)
    assert(!moving())
    assertEquals(driver.status.stopped, true)
    driver.poll([pad({ ly: -1, lt: 1, rt: 1 })])
    driver.poll([pad({ ly: -1, lt: 1 })])
    driver.poll([pad({ ly: -1 })])
    assertEquals(log.stops, 1)
    assert(!moving())
    driver.poll([pad({ rt: 1 })])
    assertEquals(log.stops, 1)
    driver.poll([pad({ ly: -1, a: true })])
    assertEquals(driver.status.stopped, false)
    driver.poll([pad({ ly: -1 })])
    assert(!moving())
    driver.poll([pad()])
    driver.poll([pad({ ly: -1 })])
    assert(moving())
    assertEquals(log.confirms, 0)
    driver.poll([pad({ a: true })])
    assertEquals(log.confirms, 1)
})

test("controller: halted ignores the pad, A reconnects, and after it only from rest", () => {
    const { driver, log, moving, setHalted } = controllerRig()
    driver.poll([pad()])
    driver.poll([pad({ rx: -1 })])
    assert(moving())
    setHalted(true)
    driver.poll([pad({ rx: -1 })])
    assert(!moving())
    driver.poll([pad({ rx: -1, a: true })])
    assertEquals(log.reconnects, 1)
    setHalted(false)
    driver.poll([pad({ rx: -1 })])
    assert(!moving())
    driver.poll([pad()])
    driver.poll([pad({ rx: -1 })])
    assert(moving())
})

test("controller: a disconnect or a blur zeroes it (boost too) and waits for rest", () => {
    const { driver, moving, log } = controllerRig()
    driver.poll([pad()])
    driver.poll([pad({ ly: -1, rb: true })])
    assert(moving())
    assertEquals(log.boost, [true])
    driver.release()
    assert(!moving())
    assertEquals(log.boost, [true, false])
    driver.poll([pad({ ly: -1 })])
    assert(!moving())
    driver.poll([pad()])
    driver.poll([pad({ ly: -1 })])
    assert(moving())
    driver.poll([null])
    assert(!moving())
    assertEquals(driver.status.connected, false)
    driver.poll([pad({ ly: -1 })])
    assert(!moving())
})

test("controller: an arm isn't driven by the sticks, but LT + RT still stops it", () => {
    const { driver, log, moving } = controllerRig("arm")
    driver.poll([pad()])
    driver.poll([pad({ ly: -1, rx: 1 })])
    assert(!moving())
    driver.poll([pad({ lt: 1, rt: 1 })])
    assertEquals(log.stops, 1)
})

// ── Go2 Ctrl's way: B stops and, held, sits down; LT boosts by its pull ──

function go2Rig() {
    const log: string[] = []
    let axes = ZERO
    const driver = new GamepadDriver(
        {
            axes: () => ({ strafe: true }),
            setAxes: (value) => (axes = value),
            setBoost: (boost) => log.push(`boost ${boost}`),
            stop: () => log.push("stop"),
            sitDown: () => log.push("sit"),
        },
        { analogBoost: true },
    )
    return { driver, log, axes: () => axes }
}

test("go2: a stick held at connect drives nothing until it rests", () => {
    const { driver, axes } = go2Rig()
    driver.poll([pad({ ly: -1 })], 0)
    assertEquals(axes(), ZERO)
    driver.poll([pad()], 30)
    driver.poll([pad({ ly: -1 })], 60)
    assertEquals(axes().forward, 1)
})

test("go2: LT + RT stops and latches until A, then needs rest again", () => {
    const { driver, log, axes } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ ly: -1, lt: 1, rt: 1 })], 30)
    assertEquals(log.filter((line) => line === "stop"), ["stop"])
    assertEquals(axes().forward, 0)
    driver.poll([pad({ ly: -1, a: true })], 60)
    driver.poll([pad({ ly: -1 })], 90)
    assertEquals(axes().forward, 0)
    driver.poll([pad()], 120)
    driver.poll([pad({ ly: -1 })], 150)
    assertEquals(axes().forward, 1)
})

test("go2: hold B: stop at once, sit down after a second, once", () => {
    const { driver, log } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ b: true })], 10)
    assertEquals(log, ["stop"])
    driver.poll([pad({ b: true })], 10 + SIT_HOLD_MS / 2)
    assertEquals(log, ["stop"])
    assert(driver.status.sitHold > 0.4 && driver.status.sitHold < 0.6)
    driver.poll([pad({ b: true })], 20 + SIT_HOLD_MS)
    driver.poll([pad({ b: true })], 40 + SIT_HOLD_MS)
    assertEquals(log, ["stop", "sit"])
})

test("go2: disconnect zeroes", () => {
    const { driver, axes } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ lx: 0.5 })], 30)
    assert(axes().strafe < 0)
    driver.poll([null], 60)
    assertEquals(axes(), ZERO)
})

test("go2: Joy samples are the raw axes, then the triggers' analog travel, and 0/1 buttons", () => {
    const sample = joySample(pad({ lx: 0.12345, ly: -1, ry: 0.5, rt: 1, lt: 0.4567 }))
    assertEquals(sample.axes, [0.1235, -1, 0, 0.5, 0.4567, 1])
    assertEquals(sample.buttons[7], 1)
    assertEquals(sample.buttons.length, 17)
})

test("go2: LT boosts while held, lets go, and both triggers still stop", () => {
    const { driver, log, axes } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ ly: -1, lt: 1 })], 30)
    assertEquals(log, ["boost 1"])
    assertEquals(axes().forward, 1)
    driver.poll([pad({ ly: -1 })], 60)
    assertEquals(log, ["boost 1", "boost 0"])
    driver.poll([pad({ ly: -1, lt: 1 })], 90)
    driver.poll([pad({ ly: -1, lt: 1, rt: 1 })], 120)
    assertEquals(log, ["boost 1", "boost 0", "boost 1", "stop", "boost 0"])
    assertEquals(axes().forward, 0)
    assertEquals(driver.status.stopped, true)
})

test("go2: a blur clears LT's boost, and it waits for rest", () => {
    const { driver, log } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ lt: 1 })], 30)
    driver.release()
    assertEquals(log, ["boost 1", "boost 0"])
    driver.poll([pad({ lt: 1 })], 60)
    assertEquals(driver.status.ready, false)
    assertEquals(log, ["boost 1", "boost 0"])
})

test("go2: LT boost follows how far it's pulled", () => {
    assertEquals([boostOf(0), boostOf(0.04), boostOf(0.5), boostOf(1)], [0, 0, 0.45, 1])
    const { driver, log } = go2Rig()
    driver.poll([pad()], 0)
    driver.poll([pad({ lt: 0.3 })], 30)
    driver.poll([pad({ lt: 0.3 })], 60)
    assertEquals(log, ["boost 0.25"])
})

test("a standard-mapped pad wins over a raw one, even if the raw one moved last", () => {
    const raw = pad({}, { id: "1a86-e310 Legion Go S", mapping: "", timestamp: 99 })
    const steam = pad({}, { id: "Steam Virtual Gamepad", timestamp: 5 })
    assertEquals(activePad([raw, steam])?.id, steam.id)
    assertEquals(activePad([raw])?.id, raw.id)
})
