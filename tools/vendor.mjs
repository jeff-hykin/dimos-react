#!/usr/bin/env -S deno run --allow-all
// Copies dim-app's zenoh client (and its gateway client) and the Controller's LCM schemas into src/vendor.
const dimApp = Deno.env.get("DIM_APP") ?? `${Deno.env.get("HOME")}/repos/dim-app`
const tag = Deno.args[0] ?? "v0.21.0"
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
    const out = new Deno.Command("git", { args: ["-C", dimApp, "show", `${tag}:${file}`], stdout: "piped" })
        .outputSync()
    if (!out.success) {
        throw new Error(`git show ${tag}:${file} failed`)
    }
    const target = `src/vendor/dim-app/${file.replace(/^source\//, "")}`
    Deno.mkdirSync(target.replace(/\/[^/]+$/, ""), { recursive: true })
    Deno.writeFileSync(target, out.stdout)
}
Deno.writeTextFileSync("src/vendor/dim-app/VERSION", `jeff-hykin/dim-app ${tag}\n`)
const controller = Deno.env.get("CONTROLLER") ?? `${Deno.env.get("HOME")}/repos/dim-live-viewer`
const schemas = Deno.readTextFileSync(`${controller}/frontend/src/core/lcm/schemas.json`)
Deno.writeTextFileSync(
    "src/vendor/lcm_schemas.js",
    `// dimos LCM message schemas (from dim-controller's tools/gen_lcm_schemas.ts output)\nexport default ${schemas.trim()}\n`,
)
console.log("vendored dim-app", tag)
