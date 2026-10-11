// mod.d.ts / three.d.ts list exactly what mod.js / three.js export (regenerate with `deno task types`).
import { assertEquals } from "@std/assert"
import { declarations } from "../tools/types_lib.js"

for (const entry of ["mod", "three"]) {
    Deno.test(`${entry}.d.ts matches ${entry}.js's exports`, async () => {
        const module = await import(`../${entry}.js`)
        const written = await Deno.readTextFile(new URL(`../${entry}.d.ts`, import.meta.url))
        assertEquals(written, declarations(entry, module), "stale: run `deno task types`")
    })
}
