// Demo: joystick, thumb stick, stick readout, hold button, D-pad, file drop, color swatch, key hints.
import { useState } from "react"
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
} from "../../src/index"

export function InputDevicesSection() {
    const [stick, setStick] = useState({ x: 0, y: 0 })
    const [pad, setPad] = useState("—")
    const [files, setFiles] = useState([])
    const [color, setColor] = useState("#7fd4ff")
    const [thumb, setThumb] = useState({ x: 0, y: 0 })
    const [held, setHeld] = useState(false)
    const [box, setBox] = useState({ width: 220, height: 90 })
    const [dragBox, setDragBox] = useState(null)
    return (
        <div className="demo-grid">
            <Card title="ThumbStick · StickIndicator">
                <ThumbStick
                    label="touch anywhere"
                    onMove={(x, y) => setThumb({ x, y })}
                    style={{ height: 180, border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}
                />
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <StickIndicator value={thumb} size={28} label="thumb" />
                    <span className="dr-mono dr-small">{`${thumb.x.toFixed(2)}, ${thumb.y.toFixed(2)}`}</span>
                    <Button size="sm" onClick={releaseAllThumbSticks}>
                        release all
                    </Button>
                </div>
            </Card>
            <Card title="ResizeHandle">
                <div
                    style={{
                        position: "relative",
                        width: (dragBox ?? box).width,
                        height: (dragBox ?? box).height,
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                    }}
                >
                    <span
                        className="dr-mono dr-small"
                        style={{ padding: 6, display: "block" }}
                    >{`${(dragBox ?? box).width} × ${(dragBox ?? box).height}`}</span>
                    <ResizeHandle
                        onResize={({ dx, dy, done }) => {
                            const next = { width: Math.max(120, box.width + dx), height: Math.max(60, box.height + dy) }
                            done ? (setBox(next), setDragBox(null)) : setDragBox(next)
                        }}
                    />
                </div>
            </Card>
            <Card title="HoldButton">
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <HoldButton onHold={() => setHeld(true)} onRelease={() => setHeld(false)} pressed={held}>
                        Hold to jog
                    </HoldButton>
                    <KeyCap label="W" down={held} />
                    <KeyCap label="S" />
                </div>
            </Card>
            <Card title="Joystick">
                <div style={{ display: "flex", gap: 24, alignItems: "center", paddingBottom: 18 }}>
                    <Joystick onChange={setStick} label="Drive" />
                    <div className="dr-mono dr-small">
                        {`linear ${stick.y.toFixed(2)}`}
                        <br />
                        {`angular ${(-stick.x).toFixed(2)}`}
                    </div>
                </div>
            </Card>
            <Card title="DPad">
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <DPad
                        center="STOP"
                        onPress={(dir) => setPad(`${dir} down`)}
                        onRelease={(dir) => setPad(`${dir} up`)}
                    />
                    <div className="dr-mono dr-small">{pad}</div>
                </div>
            </Card>
            <Card title="FileDrop">
                <FileDrop
                    accept=".mcap,.urdf,.pcd"
                    multiple={true}
                    title="Drop a recording, URDF or map"
                    hint=".mcap · .urdf · .pcd"
                    onFiles={setFiles}
                />
                {files.length ? (
                    <div className="dr-small dr-mono" style={{ marginTop: 8 }}>
                        {files.map((file) => file.name).join(", ")}
                    </div>
                ) : null}
            </Card>
            <Card title="ColorSwatch">
                <ColorSwatch
                    value={color}
                    onChange={setColor}
                    presets={["#7fd4ff", "#8fd4a8", "#e8bf6a", "#f0707f", "#b89cf0"]}
                    label="Path color"
                />
                <div className="dr-small dr-mono" style={{ marginTop: 8 }}>
                    {color}
                </div>
            </Card>
            <Card title="KeyHints (HUD)">
                <KeyHints
                    hints={[
                        [["W", "A", "S", "D"], "drive"],
                        [["Q", "E"], "turn"],
                        [["Space"], "stop"],
                        [["Shift"], "fast"],
                    ]}
                />
                <div style={{ height: 10 }} />
                <KeyHints
                    vertical={true}
                    hints={[
                        ["↑ ↓", "arm up / down"],
                        ["[ ]", "gripper"],
                    ]}
                />
            </Card>
        </div>
    )
}
