// Color ramps for point clouds and other scalar coloring (data colormaps, not UI colors), as 256×1 textures the
// shaders sample. Ported from dim-controller core/render/gradients.ts.
import * as THREE from "three"

export { DEFAULT_GRADIENT, GRADIENTS, RAMPS, sampleGradient } from "../colormaps.js"
import { DEFAULT_GRADIENT, RAMPS, sampleGradient } from "../colormaps.js"

const textures = new Map()

/** @returns {THREE.DataTexture} */
export function gradientTexture(name) {
    let texture = textures.get(name)
    if (!texture) {
        const data = new Uint8Array(256 * 4)
        for (let index = 0; index < 256; index++) {
            const [r, g, b] = sampleGradient(name, index / 255)
            data.set([r, g, b, 255], index * 4)
        }
        texture = new THREE.DataTexture(data, 256, 1)
        // sampled as the sRGB it is: the point shader writes it out unconverted
        texture.colorSpace = THREE.NoColorSpace
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearFilter
        texture.needsUpdate = true
        textures.set(name, texture)
    }
    return texture
}

/** CSS linear-gradient for a ramp (settings swatches). */
export function gradientCss(name) {
    const stops = RAMPS[name] ?? RAMPS[DEFAULT_GRADIENT]
    return `linear-gradient(90deg, ${stops.map(([position, hex]) => `${hex} ${position * 100}%`).join(", ")})`
}
