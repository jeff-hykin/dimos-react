// The demo / storybook: `npm run dev` serves it; `npm run build:demo` writes one self-contained dist-demo/index.html
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
    root: "demo",
    plugins: [react(), viteSingleFile()],
    build: {
        outDir: "../dist-demo",
        emptyOutDir: true,
        target: "es2022",
    },
})
