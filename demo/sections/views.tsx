// Demo: view panels (float / dock with maximize and tile swap), thumb sticks and a key pad, a camera view.
import { useEffect, useMemo, useState } from "react"
import {
    Badge,
    Button,
    Card,
    IconButton,
    KeyPad,
    PanelInfo,
    releaseAllThumbSticks,
    ThumbStick,
    ViewPanel,
} from "../../mod"
import { DataSourceProvider, memorySource, Select } from "../../mod"
import { Map2D, TfTree } from "../../three"

export function ViewsSection() {
    const [order, setOrder] = useState(["camera", "scene", "map"])
    const [maximized, setMaximized] = useState(null)
    const [box, setBox] = useState({ x: 24, y: 24 })
    const [stick, setStick] = useState({ left: [0, 0], right: [0, 0] })
    const tileRect = (region) => {
        if (maximized) {
            return region === maximized ? { x: 0, y: 0, width: 600, height: 220 } : null
        }
        const index = order.indexOf(region)
        return { x: index * 204, y: 0, width: 196, height: 220 }
    }
    const tile = (region, title) => (
        <ViewPanel
            key={region}
            placement="dock"
            dock={{
                region,
                rect: tileRect(region),
                maximized: maximized === region,
                onMaximize: () => setMaximized(maximized === region ? null : region),
                tiles: { order, onOrder: setOrder },
            }}
            head={[
                <span key="t" className="dr-view-panel-title">
                    {title}
                </span>,
                <PanelInfo key="i">drag me onto another</PanelInfo>,
            ]}
        >
            <div className="dr-camera-empty">{region}</div>
        </ViewPanel>
    )
    return (
        <div className="demo-grid">
            <Card title="ViewPanel · dock (tiles)" style={{ gridColumn: "1 / -1" }}>
                <div style={{ position: "relative", height: 220 }}>
                    {tile("camera", "Camera")}
                    {tile("scene", "3D")}
                    {tile("map", "Map")}
                </div>
            </Card>
            <DemoMap />
            <Card title="ViewPanel · float">
                <div style={{ position: "relative", height: 260, overflow: "hidden" }}>
                    <ViewPanel
                        placement="float"
                        wrapHead={true}
                        style={{ left: box.x, top: box.y, width: box.width ?? 240, height: box.height ?? 170 }}
                        onMove={(x, y) => setBox({ ...box, x: x - 0, y: y - 0 })}
                        resize={{
                            corner: "right",
                            minimum: { width: 180, height: 120 },
                            onDone: (next) => setBox({ ...box, width: next.width, height: next.height }),
                        }}
                        head={[
                            <span key="t" className="dr-view-panel-title">
                                Camera
                            </span>,
                            <Select
                                key="s1"
                                size="sm"
                                value="auto"
                                options={[
                                    ["auto", "auto (/global_map (heatmap))"],
                                    ["lidar", "/lidar (heatmap)"],
                                ]}
                            />,
                            <Select
                                key="s2"
                                size="sm"
                                value="base_link"
                                options={[
                                    ["base_link", "follow base_link"],
                                    ["odom", "follow odom"],
                                ]}
                            />,
                            <PanelInfo key="i">640×480 · 30 fps</PanelInfo>,
                            <IconButton key="c" size="sm" icon="close" label="Close" />,
                        ]}
                    >
                        <div className="dr-camera-empty">drag the header, resize from the corner</div>
                    </ViewPanel>
                </div>
            </Card>
            <Card title="ThumbStick · KeyPad">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: 200 }}>
                    <ThumbStick
                        label="move"
                        axes="xy"
                        onMove={(x, y) => setStick((old) => ({ ...old, left: [x, y] }))}
                    />
                    <ThumbStick
                        label="turn"
                        axes="x"
                        onMove={(x, y) => setStick((old) => ({ ...old, right: [x, y] }))}
                    />
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <KeyPad
                        rows={[
                            [{ label: "Q" }, { label: "W", down: stick.left[1] > 0 }, { label: "E" }],
                            [
                                { label: "A", down: stick.right[0] < 0 },
                                { label: "S", down: stick.left[1] < 0 },
                                { label: "D", down: stick.right[0] > 0 },
                            ],
                        ]}
                    />
                    <Badge>{`${stick.left.map((v) => v.toFixed(2)).join(", ")} · ${stick.right[0].toFixed(2)}`}</Badge>
                    <Button variant="danger" onClick={releaseAllThumbSticks}>
                        STOP
                    </Button>
                </div>
            </Card>
        </div>
    )
}

/** A synthetic room (an OccupancyGrid with walls and a cost ring) and a robot driving a circle in it. */
function DemoMap() {
    const source = useMemo(() => memorySource(), [])
    const tf = useMemo(() => new TfTree(), [])
    const [pick, setPick] = useState(null)
    useEffect(() => {
        const width = 160,
            height = 120
        const data = new Int8Array(width * height)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const wall = x < 2 || y < 2 || x >= width - 2 || y >= height - 2 || (x === 80 && y < 70)
                const ring = Math.hypot(x - 40, y - 80) < 9
                data[y * width + x] = wall ? 100 : ring ? 60 : 0
            }
        }
        const grid = {
            header: { frame_id: "world" },
            info: {
                width,
                height,
                resolution: 0.05,
                origin: { position: { x: -4, y: -3, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
            },
            data,
        }
        const path = {
            header: { frame_id: "world" },
            poses: Array.from({ length: 40 }, (_, i) => ({
                pose: { position: { x: -2 + i * 0.1, y: Math.sin(i / 6) } },
            })),
        }
        let angle = 0
        const timer = setInterval(() => {
            source.publish("dimos/map/nav_msgs.OccupancyGrid", grid)
            source.publish("dimos/path/nav_msgs.Path", path)
            angle += 0.05
            tf.set(
                "world",
                "base_link",
                [Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0],
                [0, 0, Math.sin((angle + Math.PI / 2) / 2), Math.cos((angle + Math.PI / 2) / 2)],
            )
        }, 100)
        return () => clearInterval(timer)
    }, [source, tf])
    return (
        <Card title="Map2D" style={{ gridColumn: "1 / -1" }}>
            <DataSourceProvider source={source}>
                <div style={{ position: "relative", height: 280 }}>
                    <Map2D
                        tf={tf}
                        fixedFrame="world"
                        topic={{
                            key: "dimos/map/nav_msgs.OccupancyGrid",
                            name: "/map",
                            type: "nav_msgs.OccupancyGrid",
                        }}
                        path="dimos/path/nav_msgs.Path"
                        onPick={({ x, y }) => setPick(`${x.toFixed(2)}, ${y.toFixed(2)}`)}
                    />
                </div>
            </DataSourceProvider>
            <Badge>{pick ? `clicked ${pick} (world)` : "click the map: onPick gets the spot in the fixed frame"}</Badge>
        </Card>
    )
}
