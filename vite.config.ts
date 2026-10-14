// Library build: dist/index.js, dist/three.js and dist/graph.js (ESM) plus .d.ts; react, react-dom and three stay external (peer deps)
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"

export default defineConfig({
    plugins: [react(), dts({ tsconfigPath: "./tsconfig.build.json", entryRoot: "src", outDirs: "dist" })],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        target: "es2022",
        lib: {
            entry: { index: "src/index.ts", three: "src/three.ts", graph: "src/graph.ts" },
            formats: ["es"],
        },
        rollupOptions: {
            external: [/^react($|\/)/, /^react-dom($|\/)/, /^three($|\/)/],
            output: { chunkFileNames: "chunks/[name]-[hash].js" },
        },
    },
})
