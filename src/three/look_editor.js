// Editors for how points look: the point-style picker (a card per style) and the full look editor (style, size, color
// mode, gradient, range, opacity) every point layer's settings use. Settings → Rendering pages use StylePicker and
// CubeShadePicker for the page-wide defaults (the `rendering` store).
import { cx, h } from "../h.js"
import { useStore } from "./store.js"
import { gradientCss, GRADIENTS } from "./gradients.js"
import { CUBE_SHADES, POINT_STYLES } from "./point_material.js"
import { rendering, splatFallback } from "./rendering.js"
import { ColorSwatch } from "../components/input_devices.js"
import { Button, Field, NumberInput, Select, Slider } from "../components/controls.js"

/**
 * A card per point style with a one-line description; `withDefault` adds a "default · <style>" card that follows
 * the page-wide default (Settings → Rendering).
 * @param {{ value: string, onChange: (style: string) => void, withDefault?: string, className?: string }} props
 */
export function StylePicker({ value, onChange, withDefault, className }) {
    const options = [
        ...(withDefault ? [["default", `default · ${withDefault}`, "follow the page's default style"]] : []),
        ...Object.entries(POINT_STYLES).map(([style, info]) => [style, info.label, info.about]),
    ]
    return h(
        "span",
        { className: cx("dr-style-picker", className), role: "radiogroup" },
        options.map(([style, label, about]) =>
            h(
                "button",
                {
                    type: "button",
                    role: "radio",
                    "aria-checked": value === style,
                    key: style,
                    className: cx("dr-style-card", value === style && "dr-style-card--on"),
                    onClick: () => onChange(style),
                    title: about,
                },
                h("span", { className: `dr-style-swatch dr-style-swatch--${style}` }),
                h("span", { className: "dr-style-name" }, label),
                h("span", { className: "dr-style-about" }, about),
            )
        ),
    )
}

/** The page-wide cube shading (the `rendering` store), as a Select. */
export function CubeShadePicker(props) {
    const { cubeShade } = useStore(rendering)
    return h(Select, {
        value: cubeShade,
        options: Object.entries(CUBE_SHADES).map(([id, shade]) => ({ value: id, label: shade.label })),
        onChange: (next) => rendering.update({ cubeShade: next }),
        ...props,
    })
}

/**
 * Settings → Rendering for the 3D view: the default point style and cube shading, and the splat fallback's notice
 * (with a retry).
 */
export function RenderingSettings() {
    const value = useStore(rendering)
    const fallback = useStore(splatFallback)
    return h(
        "div",
        { className: "dr-layer-settings-grid" },
        h(
            Field,
            {
                label: "Point style",
                hint: fallback.active
                    ? `glow couldn't keep up (${fallback.frameMs.toFixed(0)} ms a frame): drawn as cubes`
                    : "every point layer that keeps its style on default",
            },
            h(StylePicker, { value: value.pointStyle, onChange: (pointStyle) => rendering.update({ pointStyle }) }),
        ),
        fallback.active
            ? h(
                Button,
                { size: "sm", onClick: () => splatFallback.set({ active: false, frameMs: 0 }) },
                "Try glow again",
            )
            : null,
        h(Field, { label: "Cube shading" }, h(CubeShadePicker)),
    )
}

/**
 * Edits a point look (style, size, color mode, gradient, axis, range, opacity). Used by every layer that draws points.
 * @param {{ look: object, onChange: (look: object) => void }} props
 */
export function PointLookEditor({ look, onChange }) {
    const set = (patch) => onChange({ ...look, ...patch })
    const global = useStore(rendering)
    const shown = look.style === "default" ? global.pointStyle : look.style
    return h(
        "div",
        { className: "dr-look-editor" },
        h(
            Field,
            { label: "Style" },
            h(StylePicker, {
                value: look.style,
                onChange: (style) => set({ style }),
                withDefault: POINT_STYLES[global.pointStyle]?.label,
            }),
        ),
        h(
            Field,
            { label: shown === "voxel" ? "Voxel" : "Size" },
            h(Slider, {
                min: 0.01,
                max: 0.5,
                step: 0.01,
                value: look.size,
                format: (size) => `${Math.round(size * 100)} cm`,
                onChange: (size) => set({ size }),
            }),
        ),
        h(
            Field,
            { label: "Color" },
            h(Select, {
                value: look.colorMode,
                options: [["height", "by height"], ["intensity", "by intensity"], ["range", "by distance"], [
                    "solid",
                    "solid",
                ]],
                onChange: (colorMode) => set({ colorMode }),
            }),
        ),
        look.colorMode === "solid"
            ? h(Field, { label: "Solid" }, h(ColorSwatch, { value: look.solid, onChange: (solid) => set({ solid }) }))
            : [
                h(
                    "div",
                    { className: "dr-gradients", key: "gradients", role: "radiogroup", "aria-label": "Gradient" },
                    GRADIENTS.map((name) =>
                        h("button", {
                            type: "button",
                            key: name,
                            title: name,
                            role: "radio",
                            "aria-checked": look.gradient === name,
                            className: cx("dr-gradient-swatch", look.gradient === name && "dr-gradient-swatch--on"),
                            style: { background: gradientCss(name) },
                            onClick: () => set({ gradient: name }),
                        })
                    ),
                ),
                look.colorMode === "height"
                    ? h(
                        Field,
                        { label: "Axis", key: "axis" },
                        h(Select, {
                            value: look.axis,
                            options: [[2, "z (height)"], [0, "x"], [1, "y"]],
                            onChange: (axis) => set({ axis }),
                        }),
                    )
                    : null,
                h(
                    Field,
                    { label: "Range", hint: "empty = automatic (5th–95th percentile)", key: "range" },
                    h(
                        "span",
                        { className: "dr-range-inputs" },
                        h(RangeInput, { value: look.rangeMin, onChange: (rangeMin) => set({ rangeMin }) }),
                        h(RangeInput, { value: look.rangeMax, onChange: (rangeMax) => set({ rangeMax }) }),
                    ),
                ),
            ],
        h(
            Field,
            { label: "Opacity" },
            h(Slider, {
                min: 0.1,
                max: 1,
                step: 0.05,
                value: look.opacity ?? 1,
                format: (opacity) => `${Math.round(opacity * 100)}%`,
                onChange: (opacity) => set({ opacity }),
            }),
        ),
    )
}

/** A number or nothing (null = automatic): empty input clears it. */
export function RangeInput({ value, onChange, placeholder = "auto", ...rest }) {
    return h(NumberInput, {
        value,
        step: 0.1,
        placeholder,
        size: "sm",
        allowEmpty: true,
        onChange,
        ...rest,
    })
}
