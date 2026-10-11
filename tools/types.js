#!/usr/bin/env -S deno run --allow-all
// Writes mod.d.ts and three.d.ts: every export by name, so TypeScript apps (Vite + tsc) import the library with its
// real export list (a misspelled import fails to type-check) and loose prop types. `deno task types`; the test
// test/types_test.js fails when they drift from the exports.
import { declarations } from "./types_lib.js"

for (const entry of ["mod", "three"]) {
    const module = await import(`../${entry}.js`)
    await Deno.writeTextFile(new URL(`../${entry}.d.ts`, import.meta.url), declarations(entry, module))
}
