// A picker for the point-cloud color gradients: a swatch per gradient (GRADIENTS), the chosen one outlined.
import { cx, h } from "../h.js"
import { gradientCss, GRADIENTS } from "./gradients.js"

/**
 * @param {{ value: string, onChange?: (name: string) => void, gradients?: string[], disabled?: boolean,
 *   className?: string } & Record<string, any>} props
 */
export function GradientPicker({ value, onChange, gradients = GRADIENTS, disabled, className, ...rest }) {
    return h(
        "div",
        { className: cx("dr-gradient-picker", className), role: "radiogroup", "aria-label": "Gradient", ...rest },
        gradients.map((name) =>
            h("button", {
                key: name,
                type: "button",
                role: "radio",
                title: name,
                "aria-label": name,
                "aria-checked": name === value,
                disabled,
                className: "dr-gradient-picker__swatch",
                style: { background: gradientCss(name) },
                onClick: () => onChange?.(name),
            })
        ),
    )
}
