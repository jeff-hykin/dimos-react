// The panels a dimOS developer view is made of: tracebacks, the structured log, the settings form, topic rates,
// code with a marked line, the graph's focus and the Desktop frame helpers off Desktop.
import { test } from "vitest"
import { assert, assertEquals } from "./assert.ts"

const { createElement: h } = await import("react")
const { renderToStaticMarkup } = await import("react-dom/server")
const lib = await import("../src/index.ts")
const { GraphView } = await import("../src/graph.ts")

const PLAIN = `Traceback (most recent call last):
  File "/home/me/dimos/dimos/core/module.py", line 12, in start
    self.boot()
    ^^^^^^^^^^^
  File "/home/me/.venv/lib/python3.12/site-packages/lib.py", line 3, in boot
    raise ValueError("no")
ValueError: no
`

test("parseTraceback splits frames, code, markers and the exception, and tells library frames apart", () => {
    const items = lib.parseTraceback(PLAIN)
    assertEquals(
        items.map((item) => item.kind),
        ["head", "frame", "frame", "exception"],
    )
    const [, own, library] = items
    assert(own.kind === "frame" && own.line === 12 && own.func === "start" && !own.library)
    assertEquals(
        own.code.map((code) => code.marker),
        [false, true],
    )
    assert(library.kind === "frame" && library.library)
    assertEquals(lib.exceptionsOf(items), [{ depth: 0, text: "ValueError: no" }])
    assert(lib.isTraceback(PLAIN) && !lib.isTraceback("just text"))
})

test("Traceback: own frames open through onOpenFile (as formatPath shows them), library frames fold", () => {
    const html = renderToStaticMarkup(
        h(lib.Traceback, {
            text: PLAIN,
            onOpenFile: () => {},
            formatPath: (file: string) => file.replace("/home/me/", ""),
        }),
    )
    assert(html.includes(`<button type="button" class="dr-tb__file"`), html)
    assert(html.includes(">dimos/dimos/core/module.py:12</button>"), html)
    assert(html.includes("1 library frame<"), html)
    assert(html.includes("dr-tb__raised-one--leaf"), html)
    const plain = renderToStaticMarkup(h(lib.Traceback, { text: PLAIN }))
    assert(!plain.includes("<button"), plain)
})

test("StructuredLog: chips for short fields, multi-line ones below, a traceback drawn, filters only when handled", () => {
    const records = [
        { timestamp: "2026-10-13T12:00:01Z", level: "info", logger: "core", event: "up", extra: { port: 5 } },
        {
            timestamp: "2026-10-13T12:00:02Z",
            level: "error",
            logger: "core",
            event: "boom",
            extra: { exception: PLAIN, lineno: 3, note: "a\nb" },
        },
    ]
    const split = lib.splitRecord(records[1])
    assertEquals(split.where, "line 3")
    assertEquals(
        split.fields.map(([key]) => key),
        ["note"],
    )
    const html = renderToStaticMarkup(h(lib.StructuredLog, { records }))
    assert(html.includes("12:00:01") && html.includes(`<span class="dr-slog__key">port</span>5`), html)
    assert(html.includes("dr-slog__rec--error") && html.includes("dr-tb"), html)
    assert(html.includes("<pre>a\nb</pre>"), html)
    assert(!html.includes("dr-slog__tools"), html)
    const filtered = renderToStaticMarkup(
        h(lib.StructuredLog, { records: [], note: "loading…", onLevelChange: () => {}, onFollowChange: () => {} }),
    )
    assert(filtered.includes("debug and up") && filtered.includes("follow") && !filtered.includes("dr-search"))
    assert(filtered.includes("loading…"), filtered)
})

test("CodeBlock marks highlightLine; header={false} drops the header", () => {
    const html = renderToStaticMarkup(
        h(lib.CodeBlock, { code: "a = 1\nb = 2\n", language: "py", highlightLine: 2, header: false, fill: true }),
    )
    assertEquals([...html.matchAll(/dr-code__line--at/g)].length, 1)
    assert(html.includes("dr-code--fill") && !html.includes("dr-code__head"), html)
    assert(/dr-code__line dr-code__line--at"><span>b/.test(html), html)
})

test("Disclosure: a label summary with its count", () => {
    const html = renderToStaticMarkup(h(lib.Disclosure, { title: "Modules", count: 9 }, "body"))
    assert(html.startsWith(`<details class="dr-disclosure" open=""`), html)
    assert(html.includes("dr-label") && html.includes("· 9"), html)
})

test("off Desktop: not framed, no editor to ask, and the page draws its own top bar", () => {
    assert(!lib.framedByDesktop())
    assertEquals(renderToStaticMarkup(h(lib.EditorNote, { status: null })), "")
    assert(renderToStaticMarkup(h(lib.EditorNote, { status: { ok: false, text: "no" } })).includes("--failed"))
})
