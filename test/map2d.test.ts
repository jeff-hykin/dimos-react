// The 2D map's view transform (north-up: +x right, +y up), zoom about a point, pan, and fitting.
import { test } from "vitest"
import { assertAlmostEquals, assertEquals } from "./assert"
import { fitView, pan, screenToWorld, worldToScreen, zoomAt } from "../src/map2d/math"

const view = { centerX: 2, centerY: -1, metersPerPixel: 0.05 }

test("world ↔ screen round trip, +y up on screen", () => {
    assertEquals(worldToScreen(view, 400, 300, 2, -1), [200, 150])
    const [sx, sy] = worldToScreen(view, 400, 300, 3, 0)
    assertEquals([sx, sy], [220, 130])
    const [x, y] = screenToWorld(view, 400, 300, sx, sy)
    assertAlmostEquals(x, 3)
    assertAlmostEquals(y, 0)
})

test("zoom keeps the world point under the cursor; pan follows the drag", () => {
    const zoomed = zoomAt(view, 400, 300, 50, 60, 2)
    assertAlmostEquals(zoomed.metersPerPixel, 0.025)
    const before = screenToWorld(view, 400, 300, 50, 60)
    const after = screenToWorld(zoomed, 400, 300, 50, 60)
    assertAlmostEquals(after[0], before[0])
    assertAlmostEquals(after[1], before[1])
    const moved = pan(view, 20, 10)
    assertEquals(worldToScreen(moved, 400, 300, 2, -1).map(Math.round), [220, 160])
})

test("fitView shows the whole box", () => {
    const fitted = fitView([0, 0, 10, 4], 400, 300)
    const [left, top] = worldToScreen(fitted, 400, 300, 0, 4)
    const [right, bottom] = worldToScreen(fitted, 400, 300, 10, 0)
    assertEquals(left >= 0 && top >= 0 && right <= 400 && bottom <= 300, true)
})
