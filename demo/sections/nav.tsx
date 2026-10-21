// Demo: tabs, segmented, menus, context menu, popover, tooltip, sidebar, nav rail, stepper, breadcrumbs, palette.
import { useState } from "react"
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
} from "../../src/index.ts"

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
    return (
        <div className="demo-grid">
            <Card title="Tabs (line + pill)">
                <Tabs
                    items={[
                        { value: "layers", label: "Layers", icon: "layers" },
                        { value: "tf", label: "TF", icon: "tree", badge: 2 },
                        { value: "camera", label: "Camera", icon: "camera" },
                        { value: "settings", label: "Settings", icon: "settings", disabled: true },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                <p className="dr-muted dr-small">{`Showing: ${tab}`}</p>
                <Tabs
                    variant="pill"
                    items={[
                        ["live", "Live"],
                        ["replay", "Replay"],
                        ["sim", "Sim"],
                    ]}
                    value={pillTab}
                    onChange={setPillTab}
                />
            </Card>
            <Card title="Segmented">
                <Segmented
                    items={[
                        { value: "3d", label: "3D", icon: "cube" },
                        { value: "2d", label: "2D", icon: "map" },
                        {
                            value: "split",
                            label: "Split",
                            icon: "panels",
                        },
                    ]}
                    value={view}
                    onChange={setView}
                />
                <div style={{ height: 10 }} />
                <Segmented
                    size="sm"
                    items={[
                        ["low", "Low"],
                        ["balanced", "Balanced"],
                        ["full", "Full"],
                    ]}
                    value="balanced"
                />
            </Card>
            <Card title="Menu + Popover + Tooltip">
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <Menu
                        trigger={<Button icon="more-horizontal">Scene</Button>}
                        items={[
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
                        ]}
                    />
                    <Popover
                        trigger={<Button icon="settings">Cloud look</Button>}
                        children={
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 220 }}>
                                <div className="dr-h3">/lidar</div>
                                <Toggle value={grid} onChange={setGrid} label="Show grid" />
                                <div className="dr-muted dr-small">A popover holds any content.</div>
                            </div>
                        }
                    />
                    <Tooltip content="Re-center on base_link (F)">
                        <Button icon="target">Hover me</Button>
                    </Tooltip>
                </div>
                <p className="dr-muted dr-small">{`Last action: ${last}`}</p>
            </Card>
            <MenuAtDemo onAction={setLast} />
            <Card title="ContextMenu (right-click / long-press)">
                <ContextMenu
                    items={[
                        { label: "Navigate here", icon: "pin", onSelect: () => setLast("Navigate here") },
                        { label: "Copy point", icon: "copy", shortcut: "⌘C", onSelect: () => setLast("Copied point") },
                        "-",
                        { label: "Hide layer", icon: "eye", onSelect: () => setLast("Hid layer") },
                    ]}
                >
                    <div className="demo-target">Right-click this area (like a 3D scene)</div>
                </ContextMenu>
            </Card>
            <Card title="Sidebar + NavRail" className="demo-wide">
                <div
                    style={{
                        display: "flex",
                        height: 260,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        overflow: "hidden",
                    }}
                >
                    <NavRail
                        items={[
                            { value: "map", icon: "map", label: "Map" },
                            { value: "camera", icon: "camera", label: "Cameras" },
                            { value: "drive", icon: "drive", label: "Drive", badge: "!" },
                            { value: "record", icon: "record", label: "Record" },
                        ]}
                        value={rail}
                        onChange={setRail}
                        footer={
                            <NavRail
                                items={[{ value: "settings", icon: "settings", label: "Settings" }]}
                                value={rail}
                                onChange={setRail}
                                style={{ border: 0, padding: 0, height: "auto" }}
                            />
                        }
                    />
                    <Sidebar
                        title={rail}
                        width={230}
                        sections={[
                            {
                                title: "Point clouds",
                                content: <div className="dr-small dr-mono">/lidar · /global_map</div>,
                            },
                            {
                                title: "Paths",
                                content: <div className="dr-small dr-mono">/path · /global_path</div>,
                            },
                        ]}
                        footer={<span className="dr-muted dr-small">6 topics</span>}
                    />
                    <div
                        style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--scene-bg)" }}
                        className="dr-muted"
                    >
                        view
                    </div>
                </div>
            </Card>
            <Card title="Stepper" className="demo-wide">
                <Stepper
                    steps={[
                        { label: "Pick robot" },
                        { label: "Connect", description: "Wi-Fi or Ethernet" },
                        {
                            label: "Calibrate",
                        },
                        { label: "Done" },
                    ]}
                    current={step}
                    onStep={setStep}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Button size="sm" onClick={() => setStep((value) => Math.max(0, value - 1))}>
                        Back
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setStep((value) => Math.min(3, value + 1))}>
                        Next
                    </Button>
                </div>
                <div style={{ height: 14 }} />
                <Stepper
                    vertical={true}
                    steps={[{ label: "Upload map", description: "office.pcd" }, { label: "Slice" }]}
                    current={1}
                />
                <div style={{ height: 14 }} />
                <Label>Each step's own state (a process: a launch, an install)</Label>
                <Stepper
                    vertical={true}
                    steps={[
                        { label: "Read the blueprint", state: "done" },
                        { label: "Download the recording", description: "412 MB of 1.2 GB", state: "done" },
                        { label: "Start the modules", description: "No module named 'mujoco'", state: "failed" },
                        { label: "Connect", state: "todo" },
                    ]}
                />
            </Card>
            <Card title="Breadcrumbs + CommandPalette">
                <Breadcrumbs
                    items={[
                        { label: "Recordings", onClick: () => setLast("Recordings") },
                        {
                            label: "go2_kitchen",
                            onClick: () => setLast("go2_kitchen"),
                        },
                        { label: "/lidar" },
                    ]}
                />
                <div style={{ height: 12 }} />
                <Button icon="search" onClick={() => palette.setOpen(true)}>
                    Command palette (⌘K)
                </Button>
                <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
            </Card>
        </div>
    )
}

/** MenuAt: a menu opened by the page's own logic (here a plain click) at the pointer, with an inline header line. */
function MenuAtDemo({ onAction }: { onAction: (action: string) => void }) {
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
    return (
        <Card title="MenuAt (a menu at a point)">
            <div className="demo-target" onClick={(event) => setMenu({ x: event.clientX, y: event.clientY })}>
                Click anywhere here
            </div>
            {menu
                ? (
                    <MenuAt
                        x={menu.x}
                        y={menu.y}
                        onClose={() => setMenu(null)}
                        items={[
                            { label: "Go here", icon: "pin", onSelect: () => onAction("Go here") },
                            { label: "Label this spot…", icon: "edit", onSelect: () => onAction("Label") },
                        ]}
                    >
                        <div
                            className="dr-mono dr-small dr-muted"
                            style={{ padding: "4px 8px" }}
                        >
                            {`${menu.x}, ${menu.y}`}
                        </div>
                    </MenuAt>
                )
                : null}
        </Card>
    )
}
