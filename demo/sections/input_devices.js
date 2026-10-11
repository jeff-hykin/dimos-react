// Demo: joystick, thumb stick, stick readout, hold button, D-pad, file drop, color swatch, key hints.
import { useState } from "react"
import { h } from "../../src/h.js"
import {
    Button,
    Card,
    ColorSwatch,
    DPad,
    FileDrop,
    HoldButton,
    Joystick,
    KeyCap,
    KeyHints,
    releaseAllThumbSticks,
    ResizeHandle,
    StickIndicator,
    ThumbStick,
} from "../../mod.js"

export function InputDevicesSection() {
    const [stick, setStick] = useState({ x: 0, y: 0 })
    const [pad, setPad] = useState("—")
    const [files, setFiles] = useState([])
    const [color, setColor] = useState("#7fd4ff")
    const [thumb, setThumb] = useState({ x: 0, y: 0 })
    const [held, setHeld] = useState(false)
    const [box, setBox] = useState({ width: 220, height: 90 })
    const [dragBox, setDragBox] = useState(null)
    return h(
        "div",
        { className: "demo-grid" },
        h(
            Card,
            { title: "ThumbStick · StickIndicator" },
            h(ThumbStick, {
                label: "touch anywhere",
                onMove: (x, y) => setThumb({ x, y }),
                style: { height: 180, border: "1px dashed var(--border)", borderRadius: "var(--radius)" },
            }),
            h(
                "div",
                { style: { display: "flex", gap: 10, alignItems: "center", marginTop: 8 } },
                h(StickIndicator, { value: thumb, size: 28, label: "thumb" }),
                h("span", { className: "dr-mono dr-small" }, `${thumb.x.toFixed(2)}, ${thumb.y.toFixed(2)}`),
                h(Button, { size: "sm", onClick: releaseAllThumbSticks }, "release all"),
            ),
        ),
        h(
            Card,
            { title: "ResizeHandle" },
            h(
                "div",
                {
                    style: {
                        position: "relative",
                        width: (dragBox ?? box).width,
                        height: (dragBox ?? box).height,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                    },
                },
                h(
                    "span",
                    { className: "dr-mono dr-small", style: { padding: 6, display: "block" } },
                    `${(dragBox ?? box).width} × ${(dragBox ?? box).height}`,
                ),
                h(ResizeHandle, {
                    onResize: ({ dx, dy, done }) => {
                        const next = { width: Math.max(120, box.width + dx), height: Math.max(60, box.height + dy) }
                        done ? (setBox(next), setDragBox(null)) : setDragBox(next)
                    },
                }),
            ),
        ),
        h(
            Card,
            { title: "HoldButton" },
            h(
                "div",
                { style: { display: "flex", gap: 10, alignItems: "center" } },
                h(
                    HoldButton,
                    { onHold: () => setHeld(true), onRelease: () => setHeld(false), pressed: held },
                    "Hold to jog",
                ),
                h(KeyCap, { label: "W", down: held }),
                h(KeyCap, { label: "S" }),
            ),
        ),
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
