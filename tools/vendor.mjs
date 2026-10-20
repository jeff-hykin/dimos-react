#!/usr/bin/env node
import fs from "node:fs"
import { execFileSync } from "node:child_process"
// Copies dim-app's zenoh client (and its gateway client) and the Controller's LCM schemas into src/vendor.
const dimApp = process.env.DIM_APP ?? `${process.env.HOME}/repos/dim-app`
const tag = process.argv[2] ?? "v0.22.3"
// dim-app's Desktop helpers ride along (apps import them as dimos-react/dim-app/<file>), with their types
const files = [
    "source/zenoh.js",
    "source/topic.js",
    "source/desktop.js",
    "source/desktop.d.ts",
    "source/notify.js",
    "source/notify.d.ts",
    "source/events.js",
    "source/events.d.ts",
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
// the gateway client's types: declarations emitted from its TypeScript source at the vendored commit (zenoh-gateway's
// client/zenoh_gateway.ts), so apps type-check against the same client they run
const gateway = process.env.ZENOH_GATEWAY ?? `${process.env.HOME}/repos/zenoh-web`
const upstream = fs.readFileSync("src/vendor/dim-app/vendor/zenoh-gateway/UPSTREAM", "utf8").trim().split(/\s+/).pop()
const scratch = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/dimos-react-gateway-`)
fs.mkdirSync(`${scratch}/vendor`)
for (const file of ["zenoh_gateway.ts", "vendor/fzstd.ts"]) {
    fs.writeFileSync(`${scratch}/${file}`, execFileSync("git", ["-C", gateway, "show", `${upstream}:client/${file}`]))
}
// run in the scratch dir: TypeScript 6 refuses files on the command line next to a tsconfig.json (TS5112)
execFileSync(
    `${process.cwd()}/node_modules/.bin/tsc`,
    [
        "--declaration",
        "--emitDeclarationOnly",
        "--target",
        "es2022",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--allowImportingTsExtensions",
        "--lib",
        "es2022,dom,dom.iterable",
        "--skipLibCheck",
        "--outDir",
        `${scratch}/out`,
        `${scratch}/zenoh_gateway.ts`,
    ],
    { cwd: scratch },
)
const declarations = fs
    .readFileSync(`${scratch}/out/zenoh_gateway.d.ts`, "utf8")
    .replace(/^\/\/\/ <reference no-default-lib="true"\/>\n/m, "")
fs.writeFileSync("src/vendor/dim-app/vendor/zenoh-gateway/zenoh_gateway.d.ts", declarations)
fs.rmSync(scratch, { recursive: true })
const controller = process.env.CONTROLLER ?? `${process.env.HOME}/repos/dim-live-viewer`
const schemas = fs.readFileSync(`${controller}/frontend/src/core/lcm/schemas.json`, "utf8")
fs.writeFileSync(
    "src/vendor/lcm_schemas.js",
    `// dimos LCM message schemas (from dim-controller's tools/gen_lcm_schemas.ts output)\nexport default ${schemas.trim()}\n`,
)
// Deno and jsr read a .js file's types only through @ts-self-types (tsc finds the sibling .d.ts on its own)
for (const declaration of fs.globSync("src/vendor/**/*.d.ts")) {
    const script = declaration.replace(/\.d\.ts$/, ".js")
    const text = fs.existsSync(script) ? fs.readFileSync(script, "utf8") : null
    if (text !== null && !text.startsWith("// @ts-self-types=")) {
        fs.writeFileSync(script, `// @ts-self-types="./${declaration.split("/").pop()}"\n${text}`)
    }
}
console.log("vendored dim-app", tag)
