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

test("settings: kinds from a JSON schema and from Python annotations, and typed text parsed by kind", () => {
    const root = { $defs: { Mode: { enum: ["a", "b"] } } }
    assertEquals(lib.schemaKind(lib.resolveSchema({ $ref: "#/$defs/Mode" }, root)), "enum")
    const optional = { anyOf: [{ type: "integer" }, { type: "null" }] }
    assertEquals(lib.schemaKind(lib.resolveSchema(optional)), "integer")
    assert(lib.schemaNullable(optional))
    assertEquals(lib.schemaKind({ type: "string", format: "path" }), "path")
    assertEquals(lib.pythonTypeKind("float | None"), { kind: "number", nullable: true })
    assertEquals(lib.pythonTypeKind("Optional[Path]"), { kind: "path", nullable: true })
    assertEquals(lib.pythonTypeKind("Foo").kind, "json")
    const integer = { kind: "integer", nullable: true } as const
    assertEquals(lib.parseSettingText(integer, "3"), { value: 3 })
    assertEquals(lib.parseSettingText(integer, "3.5"), { error: "a whole number" })
    assertEquals(lib.parseSettingText(integer, " "), { value: null })
    assertEquals(lib.parseSettingText({ kind: "json" }, "[1"), { error: "JSON" })
    assertEquals([lib.settingText(null), lib.settingText({ a: 1 }), lib.settingLabel("")], ["", `{"a":1}`, `""`])
    assert(lib.sameValue({ a: 1 }, { a: 1 }) && lib.sameValue(null, undefined))
})

test("SettingInput takes its kind's control; SettingRow marks a saved value and offers its reset", () => {
    const toggle = renderToStaticMarkup(
        h(lib.SettingInput, { field: { name: "on", kind: "bool" }, value: true, onChange: () => {} }),
    )
    assert(toggle.includes(`role="switch"`) || toggle.includes("dr-toggle"), toggle)
    const choice = renderToStaticMarkup(
        h(lib.SettingInput, {
            field: { name: "mode", kind: "enum", nullable: true, options: ["a", ""] },
            value: "a",
            onChange: () => {},
        }),
    )
    assert(choice.includes(">(none)</option>") && choice.includes(">(empty)</option>"), choice)
    const secret = renderToStaticMarkup(
        h(lib.SettingInput, { field: { name: "key", kind: "string", secret: true }, value: "•••", onChange: () => {} }),
    )
    assert(secret.includes(`type="password"`) && secret.includes(">show</button>"), secret)
    const row = renderToStaticMarkup(
        h(lib.SettingRow, {
            label: "fps",
            saved: true,
            resetTo: 5,
            onReset: () => {},
            docs: "https://d",
            children: "x",
        }),
    )
    assert(row.includes(">saved</span>") && row.includes(`title="back to 5"`) && row.includes("How do I find this?"))
    const choices = renderToStaticMarkup(
        h(lib.SettingChoice, { labels: ["a", "b", "c", "d", "e"], value: 1, onChange: () => {}, label: "pick" }),
    )
    assert(choices.startsWith("<select"), choices)
})

test("message types: colored by type, then package, else a stable pick; rates and bandwidth formatted", () => {
    assertEquals(lib.messageTypeColor("sensor_msgs.Image"), "var(--warn)")
    assertEquals(lib.messageTypeColor("geometry_msgs/Wrench"), "var(--info)")
    assertEquals(lib.messageTypeColor("x.Odd"), lib.messageTypeColor("x.Odd"))
    assertEquals(lib.messageTypeName("sensor_msgs.Image"), "Image")
    assertEquals([lib.formatRate(9.94), lib.formatRate(120.4)], ["9.9 Hz", "120 Hz"])
    assertEquals([lib.formatBandwidth(850), lib.formatBandwidth(1234567)], ["850 B/s", "1.2 MB/s"])
    assertEquals(lib.heatStyle(0, 10), undefined)
    const html = renderToStaticMarkup(
        h(lib.TopicRates, {
            rows: [
                { topic: "/odom", type: "nav_msgs/Odometry", hz: 10, bps: 2000 },
                { topic: "/quiet", hz: 0 },
            ],
        }),
    )
    assert(html.includes("/odom") && html.includes("10.0 Hz") && html.includes("2.0 KB/s"), html)
    assert(html.includes(`class="dr-rates--quiet"`), html)
    assert(renderToStaticMarkup(h(lib.TopicRates, { rows: [] })).includes("no topics on the bus"))
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

test("GraphView focus lights a node, its neighbours and the edges between them", () => {
    const html = renderToStaticMarkup(
        h(GraphView, {
            nodes: [
                { id: "a", w: 40, h: 20 },
                { id: "b", w: 40, h: 20 },
                { id: "c", w: 40, h: 20 },
            ],
            edges: [
                { from: "a", to: "b" },
                { from: "b", to: "c" },
            ],
            focus: "a",
            renderNode: () => null,
        }),
    )
    assert(html.includes(`class="dr-graph dr-graph--focus"`), html)
    assertEquals([...html.matchAll(/class="node lit"/g)].length, 2)
    assertEquals([...html.matchAll(/class="edge lit"/g)].length, 1)
})

test("off Desktop: not framed, no editor to ask, and the page draws its own top bar", () => {
    assert(!lib.framedByDesktop())
    assertEquals(renderToStaticMarkup(h(lib.EditorNote, { status: null })), "")
    assert(renderToStaticMarkup(h(lib.EditorNote, { status: { ok: false, text: "no" } })).includes("--failed"))
})
