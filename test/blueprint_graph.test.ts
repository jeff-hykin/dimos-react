// BlueprintGraph: a blueprint's modules and topics become nodes and edges, and the fullscreen button falls back to a
// full-window overlay (Esc leaves it) where the Fullscreen API can't be used.
import { test } from "vitest"
import { testGlobals } from "./fake_globals.ts"
import { assert, assertEquals } from "./assert.ts"
import { Window } from "happy-dom"

const { createElement: h } = await import("react")
const { renderToStaticMarkup } = await import("react-dom/server")
const { BlueprintGraph, buildBlueprintGraph, topicOf } = await import("../src/graph.ts")

const MODULES = [
    {
        name: "camera",
        class: "dimos.hardware.Camera",
        streams: [{ name: "image", type: "sensor_msgs.Image", direction: "out" }],
    },
    {
        name: "detector",
        class: "dimos.perception.Detector",
        streams: [
            { name: "image", type: "sensor_msgs.Image", direction: "in" },
            { name: "boxes", type: "vision_msgs.Detection2DArray", direction: "out", wire: "detections" },
        ],
    },
]
const width = (text: string) => text.length * 7

test("topicOf: a pinned topic, else the wired name, else the stream's own name, with no leading slash", () => {
    assertEquals(topicOf({ name: "a", type: "t", direction: "out" }), "a")
    assertEquals(topicOf({ name: "a", type: "t", direction: "out", wire: "b" }), "b")
    assertEquals(topicOf({ name: "a", type: "t", direction: "out", wire: "b", topic: "/c" }), "c")
})

test("buildBlueprintGraph: a node per module and topic, writer → topic → reader, one-sided topics loose", () => {
    const { nodes, edges } = buildBlueprintGraph(MODULES, [{ topic: "odom", type: "nav_msgs.Odometry" }], width)
    assertEquals(
        nodes.map((node) => node.id),
        ["m:camera", "m:detector", "t:image", "t:detections", "t:odom"],
    )
    assertEquals(
        edges.map((edge) => `${edge.from}>${edge.to}`),
        ["m:camera>t:image", "t:image>m:detector", "m:detector>t:detections"],
    )
    const topic = (id: string) => nodes.find((node) => node.id === id)!
    const loose = (id: string) => {
        const node = topic(id)
        return node.kind === "topic" && node.loose
    }
    assert(!loose("t:image") && loose("t:detections") && loose("t:odom"))
    const odom = topic("t:odom")
    assert(odom.kind === "topic" && odom.extra)
    const detector = topic("m:detector")
    assert(detector.kind === "module" && detector.label === "Detector")
})

test("BlueprintGraph draws module and topic nodes and a Fullscreen button; no modules shows its empty text", () => {
    const html = renderToStaticMarkup(h(BlueprintGraph, { modules: MODULES }))
    assert(html.startsWith(`<div class="dr-bpgraph"`), html)
    assertEquals([...html.matchAll(/class="node module"/g)].length, 2)
    assertEquals([...html.matchAll(/class="node topic(?: loose)?"/g)].length, 2)
    assertEquals([...html.matchAll(/class="edge"/g)].length, 3)
    assert(html.includes("dr-bpgraph__fullscreen") && html.includes(">Fullscreen<"), html)
    assert(html.includes("dr-graph__zoom"), html)
    const bare = renderToStaticMarkup(h(BlueprintGraph, { modules: [], empty: "nothing here", fullscreen: false }))
    assert(bare.includes("nothing here") && !bare.includes("dr-bpgraph__fullscreen"), bare)
})

test("Fullscreen with no Fullscreen API fills the window, and Esc leaves it", async () => {
    const dom = new Window({ url: "http://localhost/" })
    testGlobals.window = dom
    testGlobals.document = dom.document
    testGlobals.getComputedStyle = dom.getComputedStyle.bind(dom)
    testGlobals.addEventListener = dom.addEventListener.bind(dom)
    testGlobals.removeEventListener = dom.removeEventListener.bind(dom)
    testGlobals.ResizeObserver ??= class {
        observe() {}
        disconnect() {}
    }
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(dom.document, "fullscreenEnabled", { value: false })
    const { act } = await import("react")
    const { createRoot } = await import("react-dom/client")
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(h(BlueprintGraph, { modules: MODULES })))
    const box = () => host.querySelector<HTMLElement>(".dr-bpgraph")!
    const button = () => host.querySelector<HTMLButtonElement>(".dr-bpgraph__fullscreen")!
    assert(!box().classList.contains("dr-bpgraph--overlay"))
    await act(async () => button().click())
    assert(box().classList.contains("dr-bpgraph--overlay"), box().className)
    assertEquals(box().dataset.fullscreen, "overlay")
    assert(button().textContent!.includes("Exit fullscreen"), button().textContent!)
    await act(async () => {
        document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event)
    })
    assert(!box().classList.contains("dr-bpgraph--overlay"), box().className)
    await act(async () => root.unmount())
})
