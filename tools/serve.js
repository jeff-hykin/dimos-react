#!/usr/bin/env -S deno run --allow-net --allow-read
// Serves the repo (no build) for the demo: http://localhost:8777/demo/
import { serveDir } from "@std/http/file-server"
const port = Number(Deno.env.get("PORT") ?? 8777)
Deno.serve({ port }, (request) => serveDir(request, { fsRoot: new URL("..", import.meta.url).pathname, quiet: true }))
console.log(`demo: http://localhost:${port}/demo/`)
