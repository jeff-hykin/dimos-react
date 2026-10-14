import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"
import { type Box, layout, LAYOUTS, type Link, overlaps, placeInOrder } from "../src/graph/layout.ts"

function crowded(modules: number, extras: number): { nodes: Box[]; edges: Link[] } {
    const nodes: Box[] = []
    const edges: Link[] = []
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let m = 0; m < modules; m++) {
        nodes.push({ id: `m:${m}`, w: 90 + Math.floor(random() * 120), h: 34 })
    }
    const topics = modules * 2
    for (let t = 0; t < topics; t++) {
        nodes.push({ id: `t:${t}`, w: 80 + Math.floor(random() * 140), h: 36 })
        edges.push({ from: `m:${t % modules}`, to: `t:${t}` })
    }
    for (let m = 0; m < modules; m++) {
        for (let k = 0; k < 3; k++) {
            edges.push({ from: `t:${Math.floor(random() * topics)}`, to: `m:${m}` })
        }
    }
    nodes.push({ id: "t:in", w: 100, h: 36 }, { id: "m:alone", w: 160, h: 34 })
    edges.push({ from: "t:in", to: "m:0" })
    for (let e = 0; e < extras; e++) {
        nodes.push({ id: `t:extra${e}`, w: 70 + Math.floor(random() * 150), h: 36 })
    }
    return { nodes, edges }
}

test("no layout overlaps nodes, even crowded, with cycles and loose nodes", () => {
    for (const [modules, extras] of [
        [4, 0],
        [4, 20],
        [24, 0],
        [24, 20],
        [60, 20],
    ]) {
        const { nodes, edges } = crowded(modules, extras)
        for (const { id } of LAYOUTS) {
            const { positions, vertical } = layout(id, nodes, edges)
            assertEquals(positions.size, nodes.length)
            assertEquals(!!vertical, id === "vertical")
            assert(!overlaps(nodes, positions), `${id} overlaps with ${modules} modules and ${extras} extras`)
        }
    }
})

test("the layered layout runs edges left to right and routes long ones through their layers", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => ({ id, w: 40, h: 20 }))
    const { positions, routes } = layout("hierarchy", nodes, [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "a", to: "d" },
    ])
    const x = (id: string) => positions.get(id)!.x
    assert(x("a") < x("b") && x("b") < x("c") && x("c") < x("d"))
    assertEquals(routes.get(3)!.length, 2)
})

test("placeInOrder keeps order and spacing, as close to the wish as it can", () => {
    assertEquals(placeInOrder(["a", "b"], [0, 0], [10, 10]), [-16, 16])
    assertEquals(placeInOrder(["a", "b"], [0, 100], [10, 10]), [0, 100])
})
