// Editors for how points look: the point-style picker (a card per style) and the full look editor (style, size, color
// mode, gradient, range, opacity) every point layer's settings use. Settings → Rendering pages use StylePicker and
// CubeShadePicker for the page-wide defaults (the `rendering` store).
import { cx } from "../cx"
import { useStore } from "./store"
import { GradientPicker } from "./gradient_picker"
import { CUBE_SHADES, POINT_STYLES } from "./point_material"
import { rendering, splatFallback } from "./rendering"
import { ColorSwatch } from "../components/input_devices"
import { Button, Field, NumberInput, Select, Slider } from "../components/controls"

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
    return (
        <span className={cx("dr-style-picker", className)} role="radiogroup">
            {options.map(([style, label, about]) => (
                <button
                    type="button"
                    role="radio"
                    aria-checked={value === style}
                    key={style}
                    className={cx("dr-style-card", value === style && "dr-style-card--on")}
                    onClick={() => onChange(style)}
                    title={about}
                >
                    <span className={`dr-style-swatch dr-style-swatch--${style}`} />
                    <span className="dr-style-name">{label}</span>
                    <span className="dr-style-about">{about}</span>
                </button>
            ))}
        </span>
    )
}

/** The page-wide cube shading (the `rendering` store), as a Select. */
export function CubeShadePicker(props) {
    const { cubeShade } = useStore(rendering)
    return (
        <Select
            value={cubeShade}
            options={Object.entries(CUBE_SHADES).map(([id, shade]) => ({ value: id, label: shade.label }))}
            onChange={(next) => rendering.update({ cubeShade: next })}
            {...props}
        />
    )
}

/**
 * Settings → Rendering for the 3D view: the default point style and cube shading, and the splat fallback's notice
 * (with a retry).
 */
export function RenderingSettings() {
    const value = useStore(rendering)
    const fallback = useStore(splatFallback)
    return (
        <div className="dr-layer-settings-grid">
            <Field
                label="Point style"
                hint={
                    fallback.active
                        ? `glow couldn't keep up (${fallback.frameMs.toFixed(0)} ms a frame): drawn as cubes`
                        : "every point layer that keeps its style on default"
                }
            >
                <StylePicker value={value.pointStyle} onChange={(pointStyle) => rendering.update({ pointStyle })} />
            </Field>
            {fallback.active ? (
                <Button size="sm" onClick={() => splatFallback.set({ active: false, frameMs: 0 })}>
                    Try glow again
                </Button>
            ) : null}
            <Field label="Cube shading">
                <CubeShadePicker />
            </Field>
        </div>
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
    return (
        <div className="dr-look-editor">
            <Field label="Style">
                <StylePicker
                    value={look.style}
                    onChange={(style) => set({ style })}
                    withDefault={POINT_STYLES[global.pointStyle]?.label}
                />
            </Field>
            <Field label={shown === "voxel" ? "Voxel" : "Size"}>
                <Slider
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={look.size}
                    format={(size) => `${Math.round(size * 100)} cm`}
                    onChange={(size) => set({ size })}
                />
            </Field>
            <Field label="Color">
                <Select
                    value={look.colorMode}
                    options={[
                        ["height", "by height"],
                        ["intensity", "by intensity"],
                        ["range", "by distance"],
                        ["solid", "solid"],
                    ]}
                    onChange={(colorMode) => set({ colorMode })}
                />
            </Field>
            {look.colorMode === "solid" ? (
                <Field label="Solid">
                    <ColorSwatch value={look.solid} onChange={(solid) => set({ solid })} />
                </Field>
            ) : (
                [
                    <GradientPicker key="gradients" value={look.gradient} onChange={(gradient) => set({ gradient })} />,
                    look.colorMode === "height" ? (
                        <Field label="Axis" key="axis">
                            <Select
                                value={look.axis}
                                options={[
                                    [2, "z (height)"],
                                    [0, "x"],
                                    [1, "y"],
                                ]}
                                onChange={(axis) => set({ axis })}
                            />
                        </Field>
                    ) : null,
                    <Field label="Range" hint="empty = automatic (5th–95th percentile)" key="range">
                        <span className="dr-range-inputs">
                            <RangeInput value={look.rangeMin} onChange={(rangeMin) => set({ rangeMin })} />
                            <RangeInput value={look.rangeMax} onChange={(rangeMax) => set({ rangeMax })} />
                        </span>
                    </Field>,
                ]
            )}
            <Field label="Opacity">
                <Slider
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={look.opacity ?? 1}
                    format={(opacity) => `${Math.round(opacity * 100)}%`}
                    onChange={(opacity) => set({ opacity })}
                />
            </Field>
        </div>
    )
}

/** A number or nothing (null = automatic): empty input clears it. */
export function RangeInput({ value, onChange, placeholder = "auto", ...rest }) {
    return (
        <NumberInput
            value={value}
            step={0.1}
            placeholder={placeholder}
            size="sm"
            nullable={true}
            onChange={onChange}
            {...rest}
        />
    )
}
