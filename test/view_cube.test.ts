// The view cube's geometry: which of the 26 regions a click lands on, what each is called, where it looks from, and
// the orbit limit a below-the-horizon view stops at.
import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"
import * as THREE from "three"

const { cubeRegion, regionBox, regionDirection, regionLabel } = await import("../src/three/view_cube.ts")
const { limitPolar } = await import("../src/three/viewer.ts")

const close = (a: number[], b: number[], eps = 1e-6) => a.every((value, index) => Math.abs(value - b[index]) < eps)

test("cubeRegion: the middle of a face is the face, its rim an edge, its corner a corner", () => {
    assertEquals(cubeRegion({ x: 0.1, y: -0.2, z: 1 }), [0, 0, 1])
    assertEquals(cubeRegion({ x: 0.1, y: -1, z: 0.3 }), [0, -1, 0])
    assertEquals(cubeRegion({ x: 0.9, y: -1, z: 0.2 }), [1, -1, 0])
    assertEquals(cubeRegion({ x: -0.95, y: 0.9, z: 1 }), [-1, 1, 1])
})

test("regionLabel: Z up, Front is -y, Right is +x", () => {
    assertEquals(regionLabel([0, 0, 1]), "Top")
    assertEquals(regionLabel([0, -1, 0]), "Front")
    assertEquals(regionLabel([1, 0, 0]), "Right")
    assertEquals(regionLabel([1, -1, 0]), "Front Right")
    assertEquals(regionLabel([-1, 1, 1]), "Top Back Left")
})

test("regionDirection: unit, and Top is a hair south of straight down so the screen's up is +y", () => {
    const top = regionDirection([0, 0, 1])
    assert(top.z > 0.999 && top.y < 0 && top.y > -0.01, `top ${top.toArray()}`)
    assert(close(regionDirection([1, -1, 1]).toArray(), new THREE.Vector3(1, -1, 1).normalize().toArray()))
    assertEquals(regionDirection([0, -1, 0]).toArray(), [0, -1, 0])
})

test("regionBox: a face's highlight covers its middle, an edge's runs along it, a corner's sits in it", () => {
    const face = regionBox([0, 0, 1])
    assert(close(face.size.toArray(), [1.4, 1.4, 0.34]) && face.center.z > 0.85)
    const edge = regionBox([1, -1, 0])
    assert(close(edge.size.toArray(), [0.34, 0.34, 1.4]) && edge.center.x > 0.85 && edge.center.y < -0.85)
    const corner = regionBox([-1, 1, 1])
    assert(close(corner.size.toArray(), [0.34, 0.34, 0.34]))
})

test("limitPolar: above the limit untouched; below it keeps its heading on the limit; straight down from the front", () => {
    const limit = Math.PI * 0.495
    assert(
        close(
            limitPolar(new THREE.Vector3(1, 0, 1), limit)!.toArray(),
            new THREE.Vector3(1, 0, 1).normalize().toArray(),
        ),
    )
    const below = limitPolar(new THREE.Vector3(1, 0, -1), limit)!
    assert(Math.abs(Math.acos(below.z) - limit) < 1e-9 && below.x > 0.99 && Math.abs(below.y) < 1e-9)
    const down = limitPolar(new THREE.Vector3(0, 0, -1), limit)!
    assert(down.y < -0.99, `down ${down.toArray()}`)
    assertEquals(limitPolar(new THREE.Vector3(0, 0, 0), limit), null)
})
