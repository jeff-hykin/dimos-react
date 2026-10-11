#!/usr/bin/env node
import fs from "node:fs"
import { execFileSync } from "node:child_process"
// Copies dim-app's zenoh client (and its gateway client) and the Controller's LCM schemas into src/vendor.
const dimApp = process.env.DIM_APP ?? `${process.env.HOME}/repos/dim-app`
const tag = process.argv[2] ?? "v0.21.0"
const files = [
    "source/zenoh.js",
    "source/topic.js",
    "source/vendor/zenoh-gateway/LICENSE",
    "source/vendor/zenoh-gateway/UPSTREAM",
    "source/vendor/zenoh-gateway/zenoh_gateway.js",
    "source/vendor/zenoh-gateway/vendor/fzstd.js",
    "source/vendor/zenoh-gateway/vendor/fzstd.LICENSE",
]
for (const file of files) {
    const out = execFileSync("git", ["-C", dimApp, "show", `${tag}:${file}`])
    const target = `src/vendor/dim-app/${file.replace(/^source\//, "")}`
    fs.mkdirSync(target.replace(/\/[^/]+$/, ""), { recursive: true })
    fs.writeFileSync(target, out)
}
fs.writeFileSync("src/vendor/dim-app/VERSION", `jeff-hykin/dim-app ${tag}\n`)
const controller = process.env.CONTROLLER ?? `${process.env.HOME}/repos/dim-live-viewer`
const schemas = fs.readFileSync(`${controller}/frontend/src/core/lcm/schemas.json`, "utf8")
fs.writeFileSync(
    "src/vendor/lcm_schemas.js",
    `// dimos LCM message schemas (from dim-controller's tools/gen_lcm_schemas.ts output)\nexport default ${schemas.trim()}\n`,
)
console.log("vendored dim-app", tag)
