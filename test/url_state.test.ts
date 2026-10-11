// URL state: pure helpers, and the round trip backend event → URL → rendered UI (with back/forward and deep links).
import { assert, assertEquals } from "@std/assert"
import { Window } from "happy-dom"
import { applyUrlEvent, createMemoryWindow, createUrlStore, parseUrlState, urlWith } from "../src/url_state.js"

Deno.test("parseUrlState / urlWith round trip (search and hash)", () => {
    const href = urlWith("http://localhost/apps/rec/?a=1", { tab: "map", t: 12.5, gone: null })
    assertEquals(href, "http://localhost/apps/rec/?a=1&t=12.5&tab=map")
    assertEquals(parseUrlState(href), { a: "1", t: "12.5", tab: "map" })
    const hashed = urlWith("http://localhost/x#a=1", { b: "two words" }, { mode: "hash" })
    assertEquals(parseUrlState(hashed, { mode: "hash" }), { a: "1", b: "two words" })
    assertEquals(parseUrlState(urlWith(href, { tab: "" })), { a: "1", t: "12.5" })
    assertEquals(parseUrlState(urlWith(href, { only: "this" }, { clear: true })), { only: "this" })
})

Deno.test("applyUrlEvent ignores other events and no-op changes", () => {
    assertEquals(applyUrlEvent("http://localhost/", { type: "status", set: { a: 1 } }), null)
    assertEquals(applyUrlEvent("http://localhost/?a=1", { type: "url", set: { a: 1 } }), null)
    assertEquals(applyUrlEvent("http://localhost/", { type: "url", set: { a: 1 }, replace: true }), {
        href: "http://localhost/?a=1",
        replace: true,
    })
})

Deno.test("memory window history: push, back, forward, popstate", () => {
    const win = createMemoryWindow("http://localhost/?a=1")
    const store = createUrlStore({ window: win })
    let changes = 0
    const off = store.subscribe(() => changes++)
    store.set({ a: 2 })
    store.set({ b: "x" }, { replace: true })
    assertEquals(store.get(), { a: "2", b: "x" })
    assertEquals(win.history.length, 2)
    win.history.back()
    assertEquals(store.get(), { a: "1" })
    win.history.forward()
    assertEquals(store.get(), { a: "2", b: "x" })
    assertEquals(changes, 4)
    off()
})

Deno.test("backend event → URL → rendered UI, back/forward and deep link reproduce it", async () => {
    const dom = new Window({ url: "http://localhost/apps/demo/" })
    globalThis.window = dom
    globalThis.document = dom.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const React = await import("react")
    const { createRoot } = await import("react-dom/client")
    const { act, createElement: h } = React
    const { UrlStateProvider, useUrlState } = await import("../src/url_state.js")
    const { DataSourceProvider, memorySource } = await import("../src/data.js")

    function Screen() {
        const [tab, setTab] = useUrlState("tab", "overview")
        const [count] = useUrlState("count", 0, { codec: "number" })
        return h(
            "div",
            null,
            h("span", { id: "tab" }, `tab:${tab}`),
            h("span", { id: "count" }, `count:${count}`),
            h("button", { id: "go-logs", onClick: () => setTab("logs") }, "logs"),
        )
    }
    const mount = async (win, source) => {
        const host = document.createElement("div")
        document.body.append(host)
        const root = createRoot(host)
        await act(async () => {
            root.render(h(DataSourceProvider, { source }, h(UrlStateProvider, { window: win }, h(Screen))))
        })
        return { host, root, text: () => host.textContent }
    }

    // the backend publishes a url event on the app's `events` frontend topic
    const source = memorySource()
    const win = createMemoryWindow("http://localhost/apps/demo/")
    const view = await mount(win, source)
    assertEquals(view.text(), "tab:overviewcount:0logs")
    await act(async () => source.publishFrontend("events", { type: "url", set: { tab: "map", count: 3 } }))
    assertEquals(win.location.href, "http://localhost/apps/demo/?count=3&tab=map")
    assertEquals(view.text(), "tab:mapcount:3logs")
    // events that aren't url events leave the URL alone
    await act(async () => source.publishFrontend("events", { type: "progress", value: 0.5 }))
    assertEquals(win.location.href, "http://localhost/apps/demo/?count=3&tab=map")

    // back / forward reproduce each screen
    await act(async () => win.history.back())
    assertEquals(view.text(), "tab:overviewcount:0logs")
    await act(async () => win.history.forward())
    assertEquals(view.text(), "tab:mapcount:3logs")

    // the UI writes the URL too; setting the default back removes the param
    await act(async () => view.host.querySelector("#go-logs").click())
    assertEquals(win.location.href, "http://localhost/apps/demo/?count=3&tab=logs")
    assertEquals(view.text(), "tab:logscount:3logs")

    // a deep link (a fresh page at that URL) renders the same screen with no event at all
    const deep = await mount(createMemoryWindow(win.location.href), memorySource())
    assertEquals(deep.text(), view.text())

    // replace: true events don't add history entries
    const before = win.history.length
    await act(async () => source.publishFrontend("events", { type: "url", set: { count: 4 }, replace: true }))
    assertEquals(win.history.length, before)
    assert(view.text().includes("count:4"))

    await act(async () => {
        view.root.unmount()
        deep.root.unmount()
    })
    await dom.happyDOM.close()
})
