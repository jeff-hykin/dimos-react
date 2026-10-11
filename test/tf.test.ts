// TF math: the transform tree (lookups, inverses, separate trees, defaults, problems) and the follow camera's spring.
import { test } from "vitest"
import { assert, assertAlmostEquals, assertEquals } from "./assert.ts"
import { Matrix4, Quaternion, Vector3 } from "three"
import { TfTree } from "../src/three/tf.ts"
import { PanGate, SmoothFollow } from "../src/three/follow.ts"

const yaw = (radians: number): [number, number, number, number] => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), radians)
    return [q.x, q.y, q.z, q.w]
}
const position = (matrix: Matrix4 | null) => {
    assert(matrix, "no transform")
    return new Vector3().setFromMatrixPosition(matrix)
}
const near = (actual: Vector3, expected: readonly number[], label: string) => {
    assertAlmostEquals(actual.x, expected[0], 1e-9, `${label} x`)
    assertAlmostEquals(actual.y, expected[1], 1e-9, `${label} y`)
    assertAlmostEquals(actual.z, expected[2], 1e-9, `${label} z`)
}

test("lookup composes a chain of transforms", () => {
    const tf = new TfTree()
    tf.set("world", "odom", [1, 0, 0], [0, 0, 0, 1])
    tf.set("odom", "base_link", [0, 2, 0], yaw(Math.PI / 2))
    tf.set("base_link", "lidar", [1, 0, 0.5], [0, 0, 0, 1])
    // base_link is turned 90°, so the lidar's +1 x lands on world +y
    near(position(tf.lookup("lidar", "world")), [1, 3, 0.5], "lidar in world")
    near(position(tf.lookup("base_link", "world")), [1, 2, 0], "base in world")
    // a point in the lidar frame
    const point = new Vector3(1, 0, 0).applyMatrix4(tf.lookup("lidar", "world")!)
    near(point, [1, 4, 0.5], "lidar point")
})

test("lookup in the inverse direction undoes it", () => {
    const tf = new TfTree()
    tf.set("world", "base_link", [3, 4, 0], yaw(Math.PI / 2))
    near(position(tf.lookup("world", "base_link")), [-4, 3, 0], "world origin in base_link")
    const roundTrip = tf.lookup("world", "base_link")!.clone().multiply(tf.lookup("base_link", "world")!)
    near(position(roundTrip), [0, 0, 0], "round trip")
    // siblings: camera relative to lidar through their shared parent
    tf.set("base_link", "lidar", [1, 0, 0], [0, 0, 0, 1])
    tf.set("base_link", "camera", [0, 1, 0], [0, 0, 0, 1])
    near(position(tf.lookup("camera", "lidar")), [-1, 1, 0], "camera in lidar")
})

test("unrelated trees and unknown frames have no path", () => {
    const tf = new TfTree()
    tf.set("map", "robot_a", [1, 0, 0], [0, 0, 0, 1])
    tf.set("other_root", "robot_b", [1, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.lookup("robot_b", "map"), null)
    assertEquals(tf.lookup("nowhere", "map"), null)
    assertEquals(tf.snapshot().problems.roots, ["map", "other_root"])
})

test("the empty frame and the fixed frame itself are identity", () => {
    const tf = new TfTree()
    near(position(tf.lookup("", "world")), [0, 0, 0], "empty")
    near(position(tf.lookup("world", "world")), [0, 0, 0], "self")
})

test("world-ish names are the same frame when no tf relates them", () => {
    const tf = new TfTree()
    assert(tf.lookup("map", "world") !== null)
    // once "world" is a known frame in a different tree, the alias no longer applies
    tf.set("world", "base_link", [0, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.lookup("map", "world"), null)
})

test("defaultFixedFrame prefers world-ish roots, else the biggest tree", () => {
    const tf = new TfTree()
    assertEquals(tf.defaultFixedFrame(), "world")
    tf.set("small_root", "a", [0, 0, 0], [0, 0, 0, 1])
    tf.set("big_root", "b", [0, 0, 0], [0, 0, 0, 1])
    tf.set("b", "c", [0, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.defaultFixedFrame(), "big_root")
    tf.set("odom", "x", [0, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.defaultFixedFrame(), "odom")
    tf.set("map", "odom", [0, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.defaultFixedFrame(), "map")
})

test("cycles and double parents are reported, never looped on", () => {
    const tf = new TfTree()
    tf.set("a", "b", [1, 0, 0], [0, 0, 0, 1])
    tf.set("b", "c", [1, 0, 0], [0, 0, 0, 1])
    tf.set("c", "a", [1, 0, 0], [0, 0, 0, 1])
    assertEquals(tf.snapshot().problems.cycle.sort(), ["a", "b", "c"])
    assertEquals(tf.lookup("a", "c"), null)
    const other = new TfTree()
    other.set("p1", "child", [0, 0, 0], [0, 0, 0, 1])
    other.set("p2", "child", [0, 0, 0], [0, 0, 0, 1])
    assertEquals(other.snapshot().problems.doubleParent, [["child", ["p1", "p2"]]])
})

test("dynamic edges go stale, static ones don't", () => {
    let now = 0
    const tf = new TfTree({ now: () => now })
    tf.set("world", "base_link", [0, 0, 0], [0, 0, 0, 1])
    tf.set("base_link", "lidar", [0, 0, 0], [0, 0, 0, 1], true)
    assertEquals(tf.snapshot().problems.stale, [])
    now = 5000
    assertEquals(tf.snapshot().problems.stale, ["base_link"])
})

test("setMessage reads a decoded TFMessage; version bumps and listeners fire", () => {
    const tf = new TfTree()
    let heard = 0
    tf.onChange(() => heard++)
    tf.setMessage({
        transforms: [
            {
                header: { frame_id: "world" },
                child_frame_id: "base_link",
                transform: { translation: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
            },
        ],
    })
    near(position(tf.lookup("base_link", "world")), [1, 2, 3], "from message")
    assertEquals(tf.version, 1)
    assertEquals(heard, 1)
    assertEquals(tf.frames(), ["base_link", "world"])
    assertEquals(tf.parentOf("base_link"), "world")
})

test("SmoothFollow snaps on a big jump and converges on a steady target", () => {
    const follow = new SmoothFollow()
    assertEquals(follow.step([0, 0, 0], 0.016), [0, 0, 0])
    // a small move glides: the first frame lags behind
    const first = follow.step([1, 0, 0], 0.016)
    assert(first[0] > 0 && first[0] < 1, `glides, got ${first[0]}`)
    let at = first
    for (let frame = 0; frame < 120; frame++) {
        at = follow.step([1, 0, 0], 0.016)
    }
    assertAlmostEquals(at[0], 1, 1e-3)
    // a teleport snaps
    assertEquals(follow.step([50, 0, 0], 0.016), [50, 0, 0])
})

test("PanGate undoes small pans and pauses following on a deliberate one", () => {
    const gate = new PanGate()
    gate.start()
    assertEquals(gate.step([0.05, 0, 0], 1).action, "undo")
    const verdict = gate.step([0.2, 0, 0], 1)
    assertEquals(verdict.action, "pause")
    assert(verdict.action === "pause")
    assertEquals(verdict.restore, [0.05, 0, 0])
})
