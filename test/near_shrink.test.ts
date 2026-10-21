// Near shrink: a layer's own distance wins, then the viewer's Settings → Rendering choice, then the app's default.
import { test } from "vitest"
import { assertEquals } from "./assert.ts"
import { appRendering, rendering, resolveLook, setRenderingDefaults } from "../src/three/rendering.ts"
import { applyLook, makePointMaterial } from "../src/three/point_material.ts"

const look = { style: "voxel", size: 0.05, gradient: "memworld", solid: "#ffffff" }

test("near shrink: layer, then viewer, then app default", () => {
    rendering.update({ nearShrink: null })
    setRenderingDefaults({ nearShrink: 1.5 })
    assertEquals(resolveLook(look).nearShrink, 1.5)
    rendering.update({ nearShrink: 0 })
    assertEquals(resolveLook(look).nearShrink, 0)
    assertEquals(resolveLook({ ...look, nearShrink: 2 }).nearShrink, 2)
    rendering.update({ nearShrink: null })
    appRendering.set({ nearShrink: 0 })
})

test("near shrink reaches the shader", () => {
    const material = makePointMaterial({ value: 800 })
    applyLook(material, { nearShrink: 1.25 }, [0, 1])
    assertEquals(material.uniforms.uNearShrink.value, 1.25)
    applyLook(material, {}, [0, 1])
    assertEquals(material.uniforms.uNearShrink.value, 0)
})
