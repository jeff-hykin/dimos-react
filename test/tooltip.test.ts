// The tooltip mounts in a portal a render after it opens; it must still move from its off-screen start to its anchor.
import { test } from "vitest"
import { testGlobals } from "./fake_globals.ts"
import { assert } from "./assert.ts"
import { Window } from "happy-dom"

test("Tooltip places itself next to its anchor once its portal has mounted", async () => {
    const dom = new Window({ url: "http://localhost/" })
    testGlobals.window = dom
    testGlobals.document = dom.document
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true
    const { act, createElement: h } = await import("react")
    const { createRoot } = await import("react-dom/client")
    const { Tooltip } = await import("../src/index.ts")
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () =>
        root.render(h(Tooltip, { content: "tip", delay: 0, children: h("button", { id: "anchor" }, "a") })),
    )
    await act(async () => {
        document.getElementById("anchor")!.focus()
        await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const tip = document.querySelector<HTMLElement>('[role="tooltip"]')
    assert(tip, "no tooltip")
    assert(tip.style.left !== "-9999px" && tip.style.top !== "-9999px", tip.outerHTML)
    await act(async () => root.unmount())
})
