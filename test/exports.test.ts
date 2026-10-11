// The public API: each entry exports exactly the names in exports.json (v0.1's list, minus h and Fragment), so a
// rename or a dropped export fails here instead of in an app.
import { test } from "vitest"
import { assertEquals } from "./assert"
import expected from "./exports.json"

test("index exports the v0.1 API", async () => {
    assertEquals(Object.keys(await import("../src/index")).sort(), expected.index)
})

test("three exports the v0.1 API", async () => {
    assertEquals(Object.keys(await import("../src/three")).sort(), expected.three)
})
