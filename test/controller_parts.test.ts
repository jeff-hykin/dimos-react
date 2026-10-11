// The pure parts behind ViewPanel, ThumbStick and the camera views.
import { test } from "vitest"
import { assertEquals } from "./assert.ts"
import { clampPanelBox, shapeStick, smoothToward, swapTiles } from "../src/index.ts"
import { cameraTabs, pickCamera, retargetCameras, videoPreset, videoPresetChanges } from "../src/index.ts"

test("shapeStick: dead zone, one-axis sticks, full deflection", () => {
    assertEquals(shapeStick(5, 5, 100), { x: 0, y: 0 })
    assertEquals(shapeStick(0, -100, 100), { x: 0, y: 1 })
    assertEquals(shapeStick(80, -100, 100, "y").x, 0)
    assertEquals(shapeStick(-100, 0, 100, "x"), { x: -1, y: 0 })
})

test("smoothToward eases, and a release is zero at once", () => {
    const next = smoothToward(0, 1, 16)
    assertEquals(next > 0 && next < 1, true)
    assertEquals(smoothToward(0.8, 0, 16), 0)
})

test("clampPanelBox keeps a remembered box on this window", () => {
    const box = clampPanelBox(
        { x: 5000, y: -0.5, width: 9000, height: 50 },
        { x: -1, y: -1, width: 300, height: 200 },
        {
            width: 1000,
            height: 700,
        },
        { width: 220, height: 150 },
    )
    assertEquals(box, { x: -1, y: -1, width: 984, height: 150 })
    const placed = clampPanelBox(
        { x: 5000, y: 10, width: 300, height: 200 },
        { x: -1, y: -1, width: 300, height: 200 },
        {
            width: 1000,
            height: 700,
        },
        { width: 220, height: 150 },
    )
    assertEquals(placed, { x: 920, y: 48, width: 300, height: 200 })
})

test("swapTiles swaps two regions", () => {
    assertEquals(swapTiles(["a", "b", "c"], "a", "c"), ["c", "b", "a"])
    assertEquals(swapTiles(["a", "b"], "a", "x"), ["a", "b"])
})

const topic = (name: string, type = "sensor_msgs.Image") => ({ key: `dimos${name}/${type}`, name, type })

test("cameraTabs labels cameras by what tells them apart, color first", () => {
    const tabs = cameraTabs([topic("/spot/left/image"), topic("/spot/depth/image"), topic("/spot/right/image")])
    assertEquals(
        tabs.map((tab) => tab.label),
        ["left", "right", "depth"],
    )
})

test("pickCamera / retargetCameras follow what the bus has", () => {
    const color = topic("/color_image")
    const depth = topic("/depth_image")
    assertEquals(pickCamera([], [depth, color]), color)
    assertEquals(pickCamera(["/depth_image"], [depth, color]), depth)
    assertEquals(retargetCameras([{ key: "gone", id: 1 }], [color], []), [{ key: color.key, id: 1 }])
    assertEquals(retargetCameras([{ key: color.key, id: 1 }], [color], []), null)
})

test("video presets: a switch nulls what only the old one set", () => {
    const changes = videoPresetChanges(videoPreset("quality"), videoPreset("latency"))
    assertEquals(changes.playoutDelay, null)
    assertEquals(changes.maxResolution, [640, 360])
    assertEquals(videoPreset("sharp").id, "quality")
})
