// Color ramps for point clouds and other scalar coloring (data colormaps, not UI colors), as 256×1 textures the
// shaders sample. Ported from dim-controller core/render/gradients.ts.
import * as THREE from "three"

export { DEFAULT_GRADIENT, GRADIENTS, RAMPS, sampleGradient } from "../colormaps"
import { DEFAULT_GRADIENT, DEFAULT_PALETTE, isPalette, PALETTES, RAMPS, sampleGradient } from "../colormaps"

const textures = new Map()

/** @returns {THREE.DataTexture} */
export function gradientTexture(name) {
    let texture = textures.get(name)
    if (!texture) {
        const data = new Uint8Array(256 * 4)
        // a palette's texels sit at their centers in one wrapping cycle; a ramp's run end to end
        const cyclic = isPalette(name)
        for (let index = 0; index < 256; index++) {
            const [r, g, b] = sampleGradient(name, cyclic ? (index + 0.5) / 256 : index / 255)
            data.set([r, g, b, 255], index * 4)
        }
        texture = new THREE.DataTexture(data, 256, 1)
        if (cyclic) {
            texture.wrapS = THREE.RepeatWrapping
        }
        // sampled as the sRGB it is: the point shader writes it out unconverted
        texture.colorSpace = THREE.NoColorSpace
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearFilter
        texture.needsUpdate = true
        textures.set(name, texture)
    }
    return texture
}

/** CSS linear-gradient for a ramp or a palette (settings swatches). */
export function gradientCss(name) {
    if (isPalette(name)) {
        const colors = (PALETTES[name] ?? PALETTES[DEFAULT_PALETTE]).colors
        return `linear-gradient(90deg, ${[...colors, ...colors.slice(0, -1).reverse()].join(", ")})`
    }
    const stops = RAMPS[name] ?? RAMPS[DEFAULT_GRADIENT]
    return `linear-gradient(90deg, ${stops.map(([position, hex]) => `${hex} ${position * 100}%`).join(", ")})`
}
