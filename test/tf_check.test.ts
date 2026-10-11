// The TF check (what's wrong with a tree) and the layer list: which topics become layers, what's on by default,
// switching and persisting, the replay clock and seek.
import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"
import { TfTree } from "../src/three/tf.ts"
import { checkTf, confirmedIssues, TF_STALE_MS } from "../src/three/tf_check.ts"
import type { TfIssue } from "../src/three/tf_check.ts"
import { LayerManager } from "../src/three/layers/manager.ts"
import { layerTypeFor } from "../src/three/layers/registry.ts"
import { Store } from "../src/three/store.ts"
import { memorySource } from "../src/data.ts"
import { cloudChanges, cloudOptions, cloudPreset } from "../src/three/cloud_quality.ts"
import { cameraInfoFor } from "../src/components/camera.tsx"
import "../src/three/layers/index.ts"

const identity: [number, number, number, number] = [0, 0, 0, 1]
const check = (tf: TfTree, fixedFrame: string, layers: { name: string; frame: string }[] = []) =>
    checkTf({
        snapshot: tf.snapshot(),
        fixedFrame,
        layers,
        placed: (frame: string) => tf.lookup(frame, fixedFrame) !== null,
    })

test("a healthy tree has no issues", () => {
    const tf = new TfTree()
    tf.set("world", "odom", [0, 0, 0], identity)
    tf.set("odom", "base_link", [1, 0, 0], identity)
    assertEquals(check(tf, "world", [{ name: "/lidar", frame: "base_link" }]), [])
})

test("separate trees, an unplaced layer frame and a missing fixed frame are reported", () => {
    const tf = new TfTree()
    tf.set("world", "base_link", [0, 0, 0], identity)
    tf.set("go2_odom", "camera", [0, 0, 0], identity)
    const issues = check(tf, "world", [
        { name: "/image", frame: "camera" },
        { name: "/ghost", frame: "nowhere" },
    ])
    const kinds = issues.map((issue) => issue.kind)
    assertEquals(kinds, ["separateTrees", "unplaced", "unplaced"])
    assert(issues[0].summary.startsWith("2 separate trees (world"))
    assert(issues[0].frames.includes("camera"))
    assert(issues.some((issue) => issue.summary.includes(`"nowhere" isn't in the tree`)))
    const lost = check(tf, "elsewhere")
    assert(lost.some((issue) => issue.kind === "fixedFrame"))
})

test("a stopped transform is stale only while others keep updating", () => {
    let now = 0
    const tf = new TfTree({ now: () => now })
    tf.set("world", "odom", [0, 0, 0], identity)
    tf.set("odom", "base_link", [0, 0, 0], identity)
    now = TF_STALE_MS + 1000
    // everything paused: nothing in particular broke
    assertEquals(
        check(tf, "world").filter((issue) => issue.kind === "stale"),
        [],
    )
    tf.set("odom", "base_link", [1, 0, 0], identity)
    const stale = check(tf, "world").filter((issue) => issue.kind === "stale")
    assertEquals(stale.length, 1)
    assertEquals(stale[0].frames, ["odom"])
})

test("an issue shows once two checks in a row see it", () => {
    const issue: TfIssue = { kind: "unplaced", summary: "x", detail: "", frames: ["camera"] }
    assertEquals(confirmedIssues([], [issue]), [])
    assertEquals(confirmedIssues([issue], [issue]), [issue])
})

test("the layer manager makes an entry per drawable topic, with type defaults, switches and persistence", () => {
    const saved = new Map<string, unknown>()
    const persist = <T>(key: string, defaults: T): Store<T> => {
        const store = new Store((saved.get(key) as T | undefined) ?? defaults)
        store.subscribe(() => saved.set(key, store.get()))
        return store
    }
    const source = memorySource()
    const manager = new LayerManager({ source, persist })
    manager.setTopics([
        { key: "dimos/lidar/sensor_msgs.PointCloud2" },
        { key: "dimos/global_map/sensor_msgs.PointCloud2" },
        { key: "dimos/tf/tf2_msgs.TFMessage" },
        { key: "dimos/tf_static/tf2_msgs.TFMessage" },
        { key: "dimos/color_image/sensor_msgs.Image" },
        { key: "dimos/battery/sensor_msgs.BatteryState" },
    ])
    const entries = Object.fromEntries(manager.entries.get().list.map((entry) => [entry.topic.name, entry]))
    assertEquals(Object.keys(entries).sort(), ["/color_image", "/global_map", "/lidar", "/tf", "/tf_static"])
    assertEquals(entries["/lidar"].type.id, "pointcloud")
    // a map's points are bigger; one tf topic is drawn; images aren't projected unless asked
    assertEquals(entries["/global_map"].settings.get().look.size, 0.1)
    assertEquals(entries["/lidar"].settings.get().look.size, 0.04)
    assertEquals(
        [entries["/tf"].enabled, entries["/tf_static"].enabled, entries["/color_image"].enabled],
        [true, false, false],
    )
    assertEquals(manager.topics.get().list.length, 6)
    manager.setEnabled("dimos/lidar/sensor_msgs.PointCloud2", false)
    manager.setStatus("dimos/global_map/sensor_msgs.PointCloud2", { info: "1 pts", frame: "map" })
    assertEquals(manager.layerFrames(), [{ name: "/global_map", frame: "map" }])
    // a second manager on the same storage remembers the switch
    const again = new LayerManager({ source, persist })
    again.setTopics([{ key: "dimos/lidar/sensor_msgs.PointCloud2" }])
    assertEquals(again.entries.get().list[0].enabled, false)
    assertEquals(layerTypeFor("visualization_msgs.MarkerArray")?.id, "marker")
    assertEquals(layerTypeFor("nav_msgs.OccupancyGrid")?.id, "occupancy")
})

test("a replay source: its clock is the playhead and seek tells listeners", () => {
    let playhead = 5000
    const source = memorySource({ clock: () => playhead })
    assert(source.replay)
    assertEquals(source.now(), 5000)
    let seeks = 0
    const off = source.onSeek(() => seeks++)
    playhead = 1000
    source.seek()
    off()
    source.seek()
    assertEquals(seeks, 1)
    const got: (number | undefined)[] = []
    source.subscribe("dimos/odom/nav_msgs.Odometry", {}, (message) => got.push(message.timestamp))
    source.publish("dimos/odom/nav_msgs.Odometry", { pose: {} })
    assertEquals(got, [1000])
})

test("cloud presets turn into gateway options and in-place updates; a camera finds its CameraInfo", () => {
    assertEquals(cloudOptions(cloudPreset("full")).minQuality, 1)
    assertEquals(cloudChanges(cloudPreset("low")), { maxHz: 5, minQuality: null, encodeOptions: { quality: 0.25 } })
    assertEquals(cloudPreset("nonsense").id, "balanced")
    const infos = [
        { key: "a", name: "/camera/color_info", type: "sensor_msgs.CameraInfo" },
        { key: "b", name: "/camera/depth_info", type: "sensor_msgs.CameraInfo" },
    ]
    assertEquals(cameraInfoFor({ name: "/camera/color_image" }, infos)?.key, "a")
})
