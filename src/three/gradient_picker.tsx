// A picker for the point-cloud color gradients: a swatch per gradient (GRADIENTS), the chosen one outlined.
import { cx } from "../cx"
import { gradientCss, GRADIENTS } from "./gradients"

/**
 * @param {{ value: string, onChange?: (name: string) => void, gradients?: string[], disabled?: boolean,
 *   className?: string } & Record<string, any>} props
 */
export function GradientPicker({ value, onChange, gradients = GRADIENTS, disabled, className, ...rest }) {
    return (
        <div className={cx("dr-gradient-picker", className)} role="radiogroup" aria-label="Gradient" {...rest}>
            {gradients.map((name) => (
                <button
                    key={name}
                    type="button"
                    role="radio"
                    title={name}
                    aria-label={name}
                    aria-checked={name === value}
                    disabled={disabled}
                    className="dr-gradient-picker__swatch"
                    style={{ background: gradientCss(name) }}
                    onClick={() => onChange?.(name)}
                />
            ))}
        </div>
    )
}
