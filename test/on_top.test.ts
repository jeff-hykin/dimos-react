// deno-lint-ignore-file no-explicit-any -- stand-in viewers and layers for the test
// "Draw on top", every layer's common setting: OnTopPass's two passes, followOnTop flipping a running layer in place
// (same instance, same objects, data kept), and the components' `onTop` prop (default off) reaching their Layer.
import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"
import { testGlobals } from "./fake_globals.ts"
import * as THREE from "three"

// the pose layer listens for theme changes on the window
testGlobals.addEventListener ??= () => {}
testGlobals.removeEventListener ??= () => {}
const { createElement: h } = await import("react")
const { renderToStaticMarkup } = await import("react-dom/server")
const { ON_TOP_CHANNEL, OnTopPass } = await import("../src/three/on_top.ts")
const { PathLayer } = await import("../src/three/layers/path.tsx")
const { followOnTop } = await import("../src/three/layers/registry.ts")
const { Store } = await import("../src/three/store.ts")
const { Path, PointCloud, Pose, PoseArray, TfFrames } = await import("../src/three/react.tsx")
const { TfTree } = await import("../src/three/tf.ts")

const channels = (root: THREE.Object3D) => {
    const out = new Set<number>()
    root.traverse((child) => out.add(child.layers.mask))
    return [...out]
}

/** a WebGLRenderer stand-in: records each pass's camera channels and depth clears */
const fakeRenderer = () => {
    const passes: string[] = []
    return {
        passes,
        autoClear: true,
        render: (_scene: THREE.Object3D, camera: THREE.Camera) => passes.push(`render ${camera.layers.mask}`),
        clearDepth: () => passes.push("clearDepth"),
    }
}

test("OnTopPass: nothing on top is one pass; on top adds a depth-cleared pass of its channel, restored after", () => {
    const pass = new OnTopPass()
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const root = new THREE.Group().add(new THREE.Mesh())
    scene.add(root)
    const renderer = fakeRenderer()
    pass.render(renderer, scene, camera)
    assertEquals(renderer.passes, ["render 1"])

    pass.set(root, true)
    assertEquals(channels(root), [1 << ON_TOP_CHANNEL])
    // a child added later joins the pass at the next render
    root.add(new THREE.Mesh())
    renderer.passes.length = 0
    pass.render(renderer, scene, camera)
    assertEquals(renderer.passes, ["render 1", "clearDepth", `render ${1 << ON_TOP_CHANNEL}`])
    assertEquals(channels(root), [1 << ON_TOP_CHANNEL])
    assertEquals([camera.layers.mask, renderer.autoClear], [1, true])

    pass.set(root, false)
    assertEquals(channels(root), [1])
    assert(!pass.has(root), "off")
})

test("followOnTop flips a running layer in place: same instance and objects, data kept", () => {
    const pass = new OnTopPass()
    const viewer = {
        resolution: new THREE.Vector2(800, 600),
        requestRender: () => {},
        noteData: () => {},
        dataClock: () => 0,
        fixedFrame: "world",
        setOnTop: (object: THREE.Object3D, on: boolean) => pass.set(object, on),
    }
    const context = { viewer, tf: new TfTree(), source: {}, setStatus: () => {} } as any
    const settings = new Store<any>({ color: "#ff00ff", width: 4, lift: 0 })
    const layer = new PathLayer(context, null, settings)
    layer.setData([
        [0, 0, 0],
        [1, 0, 0],
        [2, 1, 0],
    ])
    const objects = [...layer.root.children]
    const materials = objects.map((object) => (object as THREE.Mesh).material)
    const segments = (objects[0] as any).geometry.instanceCount
    const stop = followOnTop(viewer as any, layer.root, settings)
    assert(!pass.has(layer.root), "off by default")
    settings.update({ onTop: true })
    assert(pass.has(layer.root), "on")
    assertEquals(channels(layer.root), [1 << ON_TOP_CHANNEL])
    settings.update({ onTop: false })
    assertEquals(channels(layer.root), [1])
    settings.update({ onTop: true })
    assertEquals(layer.root.children, objects)
    assertEquals(
        objects.map((object) => (object as THREE.Mesh).material),
        materials,
    )
    assertEquals((objects[0] as any).geometry.instanceCount, segments)
    assertEquals(segments, 2)
    // the layer stopping puts its objects back in the scene
    stop()
    assert(!pass.has(layer.root), "stopped")
    layer.dispose()
})

test("<Path> <Pose> <PointCloud> <PoseArray> <TfFrames> pass onTop to their Layer, off by default", () => {
    const settingsOf = (element: any) => {
        let captured: any = null
        renderToStaticMarkup(
            h(() => {
                captured = element.type(element.props)
                return null
            }),
        )
        return captured.props.settings
    }
    for (const component of [Path, Pose, PointCloud, PoseArray, TfFrames] as any[]) {
        assertEquals(settingsOf(h(component, { topic: "a" })).onTop, false, component.name)
        assertEquals(settingsOf(h(component, { topic: "a", onTop: true })).onTop, true, component.name)
    }
})
