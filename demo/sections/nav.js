// Demo: tabs, segmented, menus, context menu, popover, tooltip, sidebar, nav rail, stepper, breadcrumbs, palette.
import { useState } from "react"
import { h } from "../../src/h.js"
import {
    Breadcrumbs,
    Button,
    Card,
    CommandPalette,
    ContextMenu,
    Label,
    Menu,
    MenuAt,
    NavRail,
    Popover,
    Segmented,
    Sidebar,
    Stepper,
    Tabs,
    Toggle,
    Tooltip,
    useCommandPalette,
} from "../../mod.js"

export function NavSection() {
    const [tab, setTab] = useState("layers")
    const [pillTab, setPillTab] = useState("live")
    const [view, setView] = useState("3d")
    const [rail, setRail] = useState("map")
    const [step, setStep] = useState(1)
    const [grid, setGrid] = useState(true)
    const [last, setLast] = useState("—")
    const palette = useCommandPalette()
    const commands = [
        {
            id: "follow",
            label: "Follow base_link",
            group: "View",
            icon: "target",
            shortcut: "F",
            run: () => setLast("Follow base_link"),
        },
        {
            id: "top",
            label: "Top-down view",
            group: "View",
            icon: "top",
            shortcut: "T",
            run: () => setLast("Top-down view"),
        },
        {
            id: "record",
            label: "Start recording",
            group: "Recording",
            icon: "record",
            shortcut: "R",
            run: () => setLast("Start recording"),
        },
        {
            id: "stop",
            label: "Stop robot",
            group: "Robot",
            icon: "stop",
            shortcut: "Space",
            run: () => setLast("Stop robot"),
        },
        {
            id: "theme",
            label: "Open Desktop appearance settings",
            group: "Desktop",
            icon: "settings",
            run: () => setLast("Appearance"),
        },
    ]
    return h(
        "div",
        { className: "demo-grid" },
        h(
            Card,
            { title: "Tabs (line + pill)" },
            h(Tabs, {
                items: [
                    { value: "layers", label: "Layers", icon: "layers" },
                    { value: "tf", label: "TF", icon: "tree", badge: 2 },
                    { value: "camera", label: "Camera", icon: "camera" },
                    { value: "settings", label: "Settings", icon: "settings", disabled: true },
                ],
                value: tab,
                onChange: setTab,
            }),
            h("p", { className: "dr-muted dr-small" }, `Showing: ${tab}`),
            h(Tabs, {
                variant: "pill",
                items: [["live", "Live"], ["replay", "Replay"], ["sim", "Sim"]],
                value: pillTab,
                onChange: setPillTab,
            }),
        ),
        h(
            Card,
            { title: "Segmented" },
            h(Segmented, {
                items: [{ value: "3d", label: "3D", icon: "cube" }, { value: "2d", label: "2D", icon: "map" }, {
                    value: "split",
                    label: "Split",
                    icon: "panels",
                }],
                value: view,
                onChange: setView,
            }),
            h("div", { style: { height: 10 } }),
            h(Segmented, {
                size: "sm",
                items: [["low", "Low"], ["balanced", "Balanced"], ["full", "Full"]],
                value: "balanced",
            }),
        ),
        h(
            Card,
            { title: "Menu + Popover + Tooltip" },
            h(
                "div",
                { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } },
                h(Menu, {
                    trigger: h(Button, { icon: "more-horizontal" }, "Scene"),
                    items: [
                        { heading: "View" },
                        {
                            label: "Follow robot",
                            icon: "target",
                            shortcut: "F",
                            onSelect: () => setLast("Follow robot"),
                        },
                        { label: "Top-down", icon: "top", shortcut: "T", onSelect: () => setLast("Top-down") },
                        {
                            label: "Show grid",
                            checked: grid,
                            keepOpen: true,
                            onSelect: () => setGrid((value) => !value),
                        },
                        "-",
                        {
                            label: "Clear accumulated clouds",
                            icon: "trash",
                            danger: true,
                            onSelect: () => setLast("Cleared"),
                        },
                        { label: "Export (soon)", icon: "export", disabled: true },
                    ],
                }),
                h(Popover, {
                    trigger: h(Button, { icon: "settings" }, "Cloud look"),
                    children: h(
                        "div",
                        { style: { display: "flex", flexDirection: "column", gap: 8, width: 220 } },
                        h("div", { className: "dr-h3" }, "/lidar"),
                        h(Toggle, { value: grid, onChange: setGrid, label: "Show grid" }),
                        h("div", { className: "dr-muted dr-small" }, "A popover holds any content."),
                    ),
                }),
                h(Tooltip, { content: "Re-center on base_link (F)" }, h(Button, { icon: "target" }, "Hover me")),
            ),
            h("p", { className: "dr-muted dr-small" }, `Last action: ${last}`),
        ),
        h(MenuAtDemo, { onAction: setLast }),
        h(
            Card,
            { title: "ContextMenu (right-click / long-press)" },
            h(
                ContextMenu,
                {
                    items: [
                        { label: "Navigate here", icon: "pin", onSelect: () => setLast("Navigate here") },
                        { label: "Copy point", icon: "copy", shortcut: "⌘C", onSelect: () => setLast("Copied point") },
                        "-",
                        { label: "Hide layer", icon: "eye", onSelect: () => setLast("Hid layer") },
                    ],
                },
                h("div", { className: "demo-target" }, "Right-click this area (like a 3D scene)"),
            ),
        ),
        h(
            Card,
            { title: "Sidebar + NavRail", className: "demo-wide" },
            h(
                "div",
                {
                    style: {
                        display: "flex",
                        height: 260,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        overflow: "hidden",
                    },
                },
                h(NavRail, {
                    items: [
                        { value: "map", icon: "map", label: "Map" },
                        { value: "camera", icon: "camera", label: "Cameras" },
                        { value: "drive", icon: "drive", label: "Drive", badge: "!" },
                        { value: "record", icon: "record", label: "Record" },
                    ],
                    value: rail,
                    onChange: setRail,
                    footer: h(NavRail, {
                        items: [{ value: "settings", icon: "settings", label: "Settings" }],
                        value: rail,
                        onChange: setRail,
                        style: { border: 0, padding: 0, height: "auto" },
                    }),
                }),
                h(Sidebar, {
                    title: rail,
                    width: 230,
                    sections: [
                        {
                            title: "Point clouds",
                            content: h("div", { className: "dr-small dr-mono" }, "/lidar · /global_map"),
                        },
                        {
                            title: "Paths",
                            content: h("div", { className: "dr-small dr-mono" }, "/path · /global_path"),
                        },
                    ],
                    footer: h("span", { className: "dr-muted dr-small" }, "6 topics"),
                }),
                h("div", {
                    style: { flex: 1, display: "grid", placeItems: "center", background: "var(--scene-bg)" },
                    className: "dr-muted",
                }, "view"),
            ),
        ),
        h(
            Card,
            { title: "Stepper", className: "demo-wide" },
            h(Stepper, {
                steps: [{ label: "Pick robot" }, { label: "Connect", description: "Wi-Fi or Ethernet" }, {
                    label: "Calibrate",
                }, { label: "Done" }],
                current: step,
                onStep: setStep,
            }),
            h(
                "div",
                { style: { display: "flex", gap: 8, marginTop: 12 } },
                h(Button, { size: "sm", onClick: () => setStep((value) => Math.max(0, value - 1)) }, "Back"),
                h(
                    Button,
                    { size: "sm", variant: "primary", onClick: () => setStep((value) => Math.min(3, value + 1)) },
                    "Next",
                ),
            ),
            h("div", { style: { height: 14 } }),
            h(Stepper, {
                vertical: true,
                steps: [{ label: "Upload map", description: "office.pcd" }, { label: "Slice" }],
                current: 1,
            }),
            h("div", { style: { height: 14 } }),
            h(Label, null, "Each step's own state (a process: a launch, an install)"),
            h(Stepper, {
                vertical: true,
                steps: [
                    { label: "Read the blueprint", state: "done" },
                    { label: "Download the recording", description: "412 MB of 1.2 GB", state: "done" },
                    { label: "Start the modules", description: "No module named 'mujoco'", state: "failed" },
                    { label: "Connect", state: "todo" },
                ],
            }),
        ),
        h(
            Card,
            { title: "Breadcrumbs + CommandPalette" },
            h(Breadcrumbs, {
                items: [{ label: "Recordings", onClick: () => setLast("Recordings") }, {
                    label: "go2_kitchen",
                    onClick: () => setLast("go2_kitchen"),
                }, { label: "/lidar" }],
            }),
            h("div", { style: { height: 12 } }),
            h(Button, { icon: "search", onClick: () => palette.setOpen(true) }, "Command palette (⌘K)"),
            h(CommandPalette, { open: palette.open, onClose: () => palette.setOpen(false), commands }),
        ),
    )
}

/** MenuAt: a menu opened by the page's own logic (here a plain click) at the pointer, with an inline header line. */
function MenuAtDemo({ onAction }) {
    const [menu, setMenu] = useState(null)
    return h(
        Card,
        { title: "MenuAt (a menu at a point)" },
        h(
            "div",
            { className: "demo-target", onClick: (event) => setMenu({ x: event.clientX, y: event.clientY }) },
            "Click anywhere here",
        ),
        menu
            ? h(
                MenuAt,
                {
                    x: menu.x,
                    y: menu.y,
                    onClose: () => setMenu(null),
                    items: [
                        { label: "Go here", icon: "pin", onSelect: () => onAction("Go here") },
                        { label: "Label this spot…", icon: "edit", onSelect: () => onAction("Label") },
                    ],
                },
                h(
                    "div",
                    { className: "dr-mono dr-small dr-muted", style: { padding: "4px 8px" } },
                    `${menu.x}, ${menu.y}`,
                ),
            )
            : null,
    )
}
