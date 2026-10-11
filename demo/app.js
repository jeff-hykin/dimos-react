// dimos-react's demo / storybook: every component, in any Desktop skin (?skin=research, ?skin=vibeslop, …). The skin,
// the open section and the corners live in the URL (useUrlState), so each view has a link.
import { createRoot } from "react-dom/client"
import {
    Alert,
    AppProvider,
    Badge,
    BottomBar,
    Button,
    ButtonGroup,
    Card,
    Checkbox,
    Chip,
    Column,
    ConnectionStatus,
    Embed,
    EmptyState,
    Field,
    FloatingPanel,
    h,
    Heading,
    Hud,
    Icon,
    IconButton,
    ICONS,
    Kbd,
    Label,
    Link,
    memorySource,
    Modal,
    NumberInput,
    Panel,
    Progress,
    ProgressRing,
    RadioGroup,
    RangeSlider,
    Row,
    SearchInput,
    Select,
    Separator,
    Skeleton,
    SKINS,
    Slider,
    Spinner,
    SplitPane,
    StatusDot,
    Text,
    TextArea,
    TextInput,
    Toggle,
    Toolbar,
    TopBar,
    UrlStateProvider,
    useConfirm,
    usePrompt,
    useTheme,
    useToast,
    useUrlParams,
    useUrlState,
} from "../mod.js"
import { useState } from "react"
import { DataSection } from "./sections/data.js"
import { NavSection } from "./sections/nav.js"
import { InputDevicesSection } from "./sections/input_devices.js"
import { SceneSection } from "./sections/scene.js"

const source = memorySource({
    topics: ["dimos/odom/nav_msgs.Odometry", "dimos/lidar/sensor_msgs.PointCloud2", "dimos/tf/tf2_msgs.TFMessage"],
})

function ControlsSection() {
    const [text, setText] = useState("go2-dog")
    const [search, setSearch] = useState("lidar")
    const [notes, setNotes] = useState("Waypoint 3 is behind the door.")
    const [speed, setSpeed] = useState(0.6)
    const [range, setRange] = useState([0.2, 1.4])
    const [count, setCount] = useState(12)
    const [mode, setMode] = useState("accumulate")
    const [checks, setChecks] = useState({ grid: true, labels: false })
    const [follow, setFollow] = useState(true)
    const [style, setStyle] = useState("voxel")
    const [chips, setChips] = useState({ lidar: true, odom: false, tf: true })
    return h(
        Column,
        { gap: 16 },
        h(
            Card,
            { title: "Buttons" },
            h(
                Row,
                { wrap: true },
                h(Button, null, "Default"),
                h(Button, { variant: "primary", icon: "play" }, "Start replay"),
                h(Button, { variant: "ghost", icon: "refresh" }, "Reload"),
                h(Button, { variant: "danger", icon: "trash" }, "Delete"),
                h(Button, { variant: "ok", icon: "check" }, "Stand up"),
                h(Button, { variant: "warn", icon: "warn" }, "Take over"),
                h(Button, { pressed: true, icon: "target" }, "Following"),
                h(Button, { loading: true }, "Saving"),
                h(Button, { disabled: true }, "Disabled"),
                h(Button, { size: "sm", icon: "download" }, "Small"),
                h(Button, { size: "lg", variant: "primary" }, "Large"),
            ),
            h(
                Row,
                { wrap: true },
                h(IconButton, { icon: "settings", label: "Settings" }),
                h(IconButton, { icon: "fullscreen", label: "Fullscreen", variant: "default" }),
                h(IconButton, { icon: "close", label: "Close", round: true }),
                h(
                    ButtonGroup,
                    null,
                    h(Button, { size: "sm", pressed: true }, "3D"),
                    h(Button, { size: "sm" }, "Top"),
                    h(Button, { size: "sm" }, "Map"),
                ),
                h(Kbd, { keys: ["mod", "K"] }),
                h(Kbd, null, "W"),
            ),
        ),
        h(
            Card,
            { title: "Form fields" },
            h(
                "div",
                { className: "demo-grid" },
                h(
                    Field,
                    { label: "Robot name", hint: "shown in Desktop's dock" },
                    h(TextInput, { value: text, onChange: setText }),
                ),
                h(Field, { label: "Search topics" }, h(SearchInput, { value: search, onChange: setSearch })),
                h(
                    Field,
                    { label: "Max points", error: count > 100 ? "too many" : null },
                    h(NumberInput, { value: count, onChange: setCount, min: 0, step: 1, unit: "k" }),
                ),
                h(
                    Field,
                    { label: "Keep" },
                    h(Select, {
                        value: mode,
                        onChange: setMode,
                        options: [["latest", "latest scan"], ["accumulate", "accumulate"]],
                    }),
                ),
                h(
                    Field,
                    { label: "Speed" },
                    h(Slider, {
                        value: speed,
                        onChange: setSpeed,
                        min: 0,
                        max: 1.5,
                        step: 0.05,
                        format: (value) => `${value.toFixed(2)} m/s`,
                    }),
                ),
                h(
                    Field,
                    { label: "Height band" },
                    h(RangeSlider, {
                        value: range,
                        onChange: setRange,
                        min: -1,
                        max: 3,
                        step: 0.1,
                        format: (value) => `${value.toFixed(1)} m`,
                    }),
                ),
                h(Field, { label: "Notes" }, h(TextArea, { value: notes, onChange: setNotes, rows: 2 })),
                h(Field, { label: "Frame id" }, h(TextInput, { value: "base_link", mono: true, icon: "target" })),
            ),
            h(Separator),
            h(
                Row,
                { gap: 24, wrap: true, align: "flex-start" },
                h(
                    Column,
                    null,
                    h(Checkbox, {
                        value: checks.grid,
                        onChange: (grid) => setChecks({ ...checks, grid }),
                        label: "Grid",
                    }),
                    h(Checkbox, {
                        value: checks.labels,
                        onChange: (labels) => setChecks({ ...checks, labels }),
                        label: "Frame labels",
                    }),
                    h(Checkbox, { value: false, indeterminate: true, label: "Some layers" }),
                ),
                h(
                    Column,
                    null,
                    h(Toggle, { value: follow, onChange: setFollow, label: "Follow robot" }),
                    h(Toggle, { value: false, label: "Record", size: "sm" }),
                ),
                h(RadioGroup, {
                    value: style,
                    onChange: setStyle,
                    options: [["voxel", "Cubes"], ["splat", "Glow"], ["disc", "Spheres"]],
                }),
                h(Field, { label: "Inline field", inline: true }, h(Toggle, { value: true })),
            ),
        ),
        h(
            Card,
            { title: "Badges, chips, status" },
            h(
                Row,
                { wrap: true },
                h(Badge, null, "sensor_msgs.PointCloud2"),
                h(Badge, { tone: "info" }, "10 Hz"),
                h(Badge, { tone: "ok", dot: true }, "live"),
                h(Badge, { tone: "warn" }, "stale 3 s"),
                h(Badge, { tone: "danger" }, "no TF"),
                h(Badge, { solid: true }, "NEW"),
                h(Badge, { solid: true, tone: "ok" }, "3"),
            ),
            h(
                Row,
                { wrap: true },
                Object.entries(chips).map(([name, on]) =>
                    h(
                        Chip,
                        { key: name, selected: on, onChange: (value) => setChips({ ...chips, [name]: value }) },
                        `/${name}`,
                    )
                ),
                h(Chip, { icon: "robot", onRemove: () => {} }, "go2"),
            ),
            h(
                Row,
                { wrap: true, gap: 16 },
                h(StatusDot, { tone: "ok", label: "ok" }),
                h(StatusDot, { tone: "warn", label: "warn" }),
                h(StatusDot, { tone: "danger", label: "danger" }),
                h(StatusDot, { tone: "off", label: "off" }),
                h(ConnectionStatus, { state: "connected", detail: "14 ms" }),
                h(ConnectionStatus, { state: "connecting" }),
                h(ConnectionStatus, { state: "lost", label: "robot offline" }),
            ),
        ),
    )
}

function FeedbackSection() {
    const toast = useToast()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const [open, setOpen] = useState(false)
    const [answer, setAnswer] = useState("")
    return h(
        Column,
        { gap: 16 },
        h(
            Card,
            { title: "Alerts" },
            h(Alert, { tone: "info", title: "Replay loaded" }, "2026-10-11_run3 · 4 min 12 s · 18 topics"),
            h(Alert, { tone: "ok" }, "Map saved to ~/maps/office.pcd"),
            h(
                Alert,
                { tone: "warn", title: "TF problem", actions: h(Button, { size: "sm" }, "Open TF tree") },
                "lidar_link has two parents: base_link, body",
            ),
            h(
                Alert,
                { tone: "danger", title: "Robot unreachable", onClose: () => {} },
                "No heartbeat from 192.168.12.1 for 8 s",
            ),
        ),
        h(
            Card,
            { title: "Toasts, modals, confirm, prompt" },
            h(
                Row,
                { wrap: true },
                h(Button, { onClick: () => toast("Recording started") }, "Toast"),
                h(Button, { onClick: () => toast.ok("Uploaded 3 files") }, "OK toast"),
                h(
                    Button,
                    { onClick: () => toast.error("Upload failed: disk full", { title: "Upload" }) },
                    "Error toast",
                ),
                h(Button, {
                    onClick: () => toast({ message: "Layer hidden", action: { label: "Undo", onClick: () => {} } }),
                }, "Toast with action"),
                h(Button, { onClick: () => setOpen(true) }, "Modal"),
                h(Button, {
                    variant: "danger",
                    onClick: async () =>
                        setAnswer(
                            String(
                                await confirm({
                                    title: "Delete recording?",
                                    message: "2026-10-11_run3 will be gone for good.",
                                    danger: true,
                                    confirmLabel: "Delete",
                                }),
                            ),
                        ),
                }, "Confirm"),
                h(Button, {
                    onClick: async () => setAnswer(String(await prompt({ title: "Rename", defaultValue: "run3" }))),
                }, "Prompt"),
                answer ? h(Text, { muted: true, mono: true }, `→ ${answer}`) : null,
            ),
            h(
                Modal,
                {
                    open,
                    onClose: () => setOpen(false),
                    title: "Export map",
                    footer: [
                        h(Button, { key: "c", onClick: () => setOpen(false) }, "Cancel"),
                        h(Button, { key: "e", variant: "primary", onClick: () => setOpen(false) }, "Export"),
                    ],
                },
                h(Field, { label: "File name" }, h(TextInput, { value: "office.pcd", mono: true })),
                h(Field, { label: "Format" }, h(Select, { value: "pcd", options: ["pcd", "ply", "las"] })),
            ),
        ),
        h(
            Card,
            { title: "Progress" },
            h(
                Row,
                { gap: 16 },
                h(Spinner),
                h(ProgressRing, { value: 0.68 }),
                h(ProgressRing, { value: 1, tone: "ok", size: 36 }),
                h(
                    Column,
                    { grow: true },
                    h(Progress, { value: 0.42 }),
                    h(Progress, { value: 0.9, tone: "warn" }),
                    h(Progress),
                ),
            ),
            h(Column, { gap: 6 }, h(Skeleton, { width: "60%" }), h(Skeleton, { width: "85%" })),
        ),
        h(
            Card,
            { title: "Empty state", padded: false },
            h(EmptyState, {
                icon: "robot",
                title: "No robot connected",
                message: "Start a blueprint in Desktop, or open a recording.",
                actions: [
                    h(Button, { key: "a", variant: "primary" }, "Open recording"),
                    h(Button, { key: "b" }, "Docs"),
                ],
            }),
        ),
    )
}

function LayoutSection() {
    const [floating, setFloating] = useState(false)
    return h(
        Column,
        { gap: 16 },
        h(
            Card,
            { title: "Top bar, toolbar, bottom bar", padded: false },
            h(TopBar, {
                title: "Recordings",
                icon: "record",
                right: [
                    h(ConnectionStatus, { key: "c", state: "connected", detail: "9 ms" }),
                    h(IconButton, { key: "s", icon: "settings", label: "Settings" }),
                ],
            }, h(SearchInput, { value: "", onChange: () => {}, placeholder: "Search recordings…" })),
            h(
                "div",
                { style: { position: "relative", height: 150, background: "var(--scene-bg)" } },
                h(
                    Hud,
                    { position: "top-left" },
                    h(
                        Toolbar,
                        { floating: true },
                        h(IconButton, { icon: "layers", label: "Layers", size: "sm" }),
                        h(IconButton, { icon: "camera", label: "Cameras", size: "sm" }),
                        h(Separator, { vertical: true }),
                        h(IconButton, { icon: "target", label: "Follow", size: "sm" }),
                    ),
                ),
                h(Hud, { position: "bottom-right" }, h(Badge, { tone: "info" }, "60 fps · 14 ms")),
                h(Hud, { position: "center" }, h(Text, { muted: true }, "a HUD over a view")),
            ),
            h(
                BottomBar,
                null,
                h(StatusDot, { tone: "ok" }),
                "go2 · 3 topics · 2.1 MB/s",
                h("span", { className: "dr-spacer" }),
                h(Text, { mono: true, small: true }, "00:42 / 04:12"),
            ),
        ),
        h(
            Card,
            { title: "Embed (another page in this one)", padded: false },
            h(
                "div",
                { style: { position: "relative", height: 90 } },
                h(Embed, {
                    title: "embedded page",
                    srcDoc: "<p style='font:13px sans-serif;padding:8px'>an embedded page (iframe)</p>",
                }),
            ),
        ),
        h(
            Row,
            { gap: 16, align: "stretch", wrap: true },
            h(
                Panel,
                {
                    title: "Layers",
                    icon: "layers",
                    collapsible: true,
                    style: { flex: 1, minWidth: 240 },
                    actions: h(IconButton, { icon: "plus", label: "Add", size: "sm" }),
                },
                h(Toggle, { value: true, label: "/lidar" }),
                h(Toggle, { value: false, label: "/global_map" }),
            ),
            h(
                Panel,
                { title: "Glass panel", glass: true, style: { flex: 1, minWidth: 240 } },
                h(Text, { muted: true }, "for panels floating over a 3D or video view"),
            ),
            h(Card, {
                title: "Card",
                description: "with a description",
                actions: h(Button, { size: "sm" }, "Action"),
                style: { flex: 1, minWidth: 240 },
            }, h(Text, null, "Body text")),
        ),
        h(
            Card,
            { title: "Split pane", padded: false },
            h(
                "div",
                { style: { height: 140 } },
                h(
                    SplitPane,
                    { defaultSize: 220 },
                    h(
                        "div",
                        { style: { padding: 12 } },
                        h(Label, null, "Left"),
                        h(Text, { as: "p", muted: true }, "Drag the divider."),
                    ),
                    h("div", { style: { padding: 12 } }, h(Label, null, "Right")),
                ),
            ),
        ),
        h(
            Card,
            { title: "Type, links, icons" },
            h(Heading, { level: 1 }, "Heading 1"),
            h(Heading, { level: 2 }, "Heading 2 · section"),
            h(Heading, { level: 3 }, "Heading 3 · micro label"),
            h(
                Text,
                null,
                "Body text, ",
                h(Text, { muted: true }, "muted, "),
                h(Text, { mono: true }, "mono /odom, "),
                h(Text, { tone: "ok" }, "ok, "),
                h(Text, { tone: "warn" }, "warn, "),
                h(Text, { tone: "danger" }, "danger, "),
                h(Link, { href: "#" }, "a link"),
            ),
            h(
                Row,
                { wrap: true, gap: 10, className: "demo-icons" },
                Object.keys(ICONS).map((name) => h("span", { key: name, title: name }, h(Icon, { name }))),
            ),
            h(
                Button,
                { onClick: () => setFloating(!floating) },
                floating ? "Hide floating panel" : "Show floating panel",
            ),
            floating
                ? h(FloatingPanel, {
                    title: "Floating",
                    icon: "panels",
                    onClose: () => setFloating(false),
                    defaultPosition: { x: -24, y: 80 },
                }, h(Text, { muted: true }, "Drag me by the header."))
                : null,
        ),
    )
}

const SECTIONS = [
    ["controls", "Controls", ControlsSection],
    ["feedback", "Feedback", FeedbackSection],
    ["layout", "Layout", LayoutSection],
    ["data", "Data", DataSection],
    ["nav", "Navigation", NavSection],
    ["devices", "Input devices", InputDevicesSection],
    ["scene", "3D view", SceneSection],
]

function Demo() {
    const [only] = useUrlState("section", "all")
    const [params, setParams] = useUrlParams()
    const theme = useTheme()
    const shown = only === "all" ? SECTIONS : SECTIONS.filter(([id]) => id === only)
    return h(
        "div",
        { className: "demo" },
        h(
            TopBar,
            {
                title: "dimos-react",
                icon: "robot",
                right: [
                    h(Select, {
                        key: "s",
                        size: "sm",
                        value: theme.skin,
                        options: SKINS,
                        onChange: (skin) => setParams({ skin: skin === "portal" ? null : skin }),
                    }),
                    h(Select, {
                        key: "c",
                        size: "sm",
                        value: theme.corners,
                        options: [["theme", "skin corners"], ["sharp", "sharp"], ["rounded", "rounded"]],
                        onChange: (corners) => setParams({ corners: corners === "theme" ? null : corners }),
                    }),
                    h(Select, {
                        key: "o",
                        size: "sm",
                        value: only,
                        options: [["all", "all sections"], ...SECTIONS.map(([id, label]) => [id, label])],
                        onChange: (section) => setParams({ section: section === "all" ? null : section }),
                    }),
                ],
            },
            h(
                Text,
                { muted: true, small: true },
                `skin ${theme.skin} · ${theme.dark ? "dark" : "light"} · ${params.section ?? "all"}`,
            ),
        ),
        h(
            "main",
            { className: "demo-main" },
            shown.map(([id, label, Section]) =>
                h("section", { key: id, id, className: "demo-section" }, h(Heading, { level: 2 }, label), h(Section))
            ),
        ),
    )
}

function Root() {
    // the skin comes from the URL (a link per skin); with no ?skin= it follows Desktop's saved choice, live
    const [skin] = useUrlState("skin")
    const [corners] = useUrlState("corners")
    return h(AppProvider, { source, url: false, theme: { skin, corners } }, h(Demo))
}

const style = document.createElement("style")
style.textContent = `
.demo-main { max-width: 1180px; margin: 0 auto; padding: 20px 16px 80px; display: flex; flex-direction: column; gap: 28px; }
.demo-section { display: flex; flex-direction: column; gap: 12px; }
.demo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; align-items: start; }
.demo-icons { color: var(--muted-fg); }
.demo-wide { grid-column: 1 / -1; }
.demo-target { display: flex; align-items: center; justify-content: center; height: 120px; border: 1px dashed var(--border-strong); border-radius: var(--radius); color: var(--muted-fg); background: var(--scene-bg); }
`
document.head.append(style)
createRoot(document.getElementById("root")).render(h(UrlStateProvider, { events: false }, h(Root)))
