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
