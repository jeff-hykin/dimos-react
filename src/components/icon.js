// <Icon name="close" />: the shared dimOS line icons (24-unit grid, stroke = currentColor).
import { cx, h } from "../h.js"
import { ICONS } from "../icons_data.js"

export { ICONS }

/**
 * @param {{ name: string, size?: number, strokeWidth?: number, className?: string, title?: string, path?: string }} props
 *   `path`: your own SVG path data instead of a named icon
 */
export function Icon({ name, size = 18, strokeWidth = 1.8, className, title, path, ...rest }) {
    return h(
        "svg",
        {
            className: cx("dr-icon", className),
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": title ? undefined : "true",
            role: title ? "img" : undefined,
            ...rest,
        },
        title ? h("title", null, title) : null,
        h("path", { d: path ?? ICONS[name] ?? "" }),
    )
}
