// Demo: joystick, D-pad, file drop, color swatch, key hints.
import { useState } from "react"
import { h } from "../../src/h.js"
import { Card, ColorSwatch, DPad, FileDrop, Joystick, KeyHints } from "../../mod.js"

export function InputDevicesSection() {
    const [stick, setStick] = useState({ x: 0, y: 0 })
    const [pad, setPad] = useState("—")
    const [files, setFiles] = useState([])
    const [color, setColor] = useState("#7fd4ff")
    return h(
        "div",
        { className: "demo-grid" },
        h(
            Card,
            { title: "Joystick" },
            h(
                "div",
                { style: { display: "flex", gap: 24, alignItems: "center", paddingBottom: 18 } },
                h(Joystick, { onChange: setStick, label: "Drive" }),
                h(
                    "div",
                    { className: "dr-mono dr-small" },
                    `linear ${stick.y.toFixed(2)}`,
                    h("br"),
                    `angular ${(-stick.x).toFixed(2)}`,
                ),
            ),
        ),
        h(
            Card,
            { title: "DPad" },
            h(
                "div",
                { style: { display: "flex", gap: 24, alignItems: "center" } },
                h(DPad, {
                    center: "STOP",
                    onPress: (dir) => setPad(`${dir} down`),
                    onRelease: (dir) => setPad(`${dir} up`),
                }),
                h("div", { className: "dr-mono dr-small" }, pad),
            ),
        ),
        h(
            Card,
            { title: "FileDrop" },
            h(FileDrop, {
                accept: ".mcap,.urdf,.pcd",
                multiple: true,
                title: "Drop a recording, URDF or map",
                hint: ".mcap · .urdf · .pcd",
                onFiles: setFiles,
            }),
            files.length
                ? h(
                    "div",
                    { className: "dr-small dr-mono", style: { marginTop: 8 } },
                    files.map((file) => file.name).join(", "),
                )
                : null,
        ),
        h(
            Card,
            { title: "ColorSwatch" },
            h(ColorSwatch, {
                value: color,
                onChange: setColor,
                presets: ["#7fd4ff", "#8fd4a8", "#e8bf6a", "#f0707f", "#b89cf0"],
                label: "Path color",
            }),
            h("div", { className: "dr-small dr-mono", style: { marginTop: 8 } }, color),
        ),
        h(
            Card,
            { title: "KeyHints (HUD)" },
            h(KeyHints, {
                hints: [[["W", "A", "S", "D"], "drive"], [["Q", "E"], "turn"], [["Space"], "stop"], [
                    ["Shift"],
                    "fast",
                ]],
            }),
            h("div", { style: { height: 10 } }),
            h(KeyHints, { vertical: true, hints: [["↑ ↓", "arm up / down"], ["[ ]", "gripper"]] }),
        ),
    )
}
