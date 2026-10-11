// Demo: view panels (float / dock with maximize and tile swap), thumb sticks and a key pad, a camera view.
import { useEffect, useMemo, useState } from "react"
import { h } from "../../src/h.js"
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
} from "../../mod.js"
import { DataSourceProvider, memorySource } from "../../mod.js"
import { Map2D, TfTree } from "../../three.js"

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
    const tile = (region, title) =>
        h(ViewPanel, {
            key: region,
            placement: "dock",
            dock: {
                region,
                rect: tileRect(region),
                maximized: maximized === region,
                onMaximize: () => setMaximized(maximized === region ? null : region),
                tiles: { order, onOrder: setOrder },
            },
            head: [
                h("span", { key: "t", className: "dr-view-panel-title" }, title),
                h(PanelInfo, { key: "i" }, "drag me onto another"),
            ],
        }, h("div", { className: "dr-camera-empty" }, region))
    return h(
        "div",
        { className: "demo-grid" },
        h(
            Card,
            { title: "ViewPanel · dock (tiles)", style: { gridColumn: "1 / -1" } },
            h(
                "div",
                { style: { position: "relative", height: 220 } },
                tile("camera", "Camera"),
                tile("scene", "3D"),
                tile("map", "Map"),
            ),
        ),
        h(DemoMap),
        h(
            Card,
            { title: "ViewPanel · float" },
            h(
                "div",
                { style: { position: "relative", height: 260, overflow: "hidden" } },
                h(ViewPanel, {
                    placement: "float",
                    style: { left: box.x, top: box.y, width: box.width ?? 240, height: box.height ?? 170 },
                    onMove: (x, y) => setBox({ ...box, x: x - 0, y: y - 0 }),
                    resize: {
                        corner: "right",
                        minimum: { width: 180, height: 120 },
                        onDone: (next) => setBox({ ...box, width: next.width, height: next.height }),
                    },
                    head: [
                        h("span", { key: "t", className: "dr-view-panel-title" }, "Camera"),
                        h(PanelInfo, { key: "i" }, "640×480 · 30 fps"),
                        h(IconButton, { key: "c", size: "sm", icon: "close", label: "Close" }),
                    ],
                }, h("div", { className: "dr-camera-empty" }, "drag the header, resize from the corner")),
            ),
        ),
        h(
            Card,
            { title: "ThumbStick · KeyPad" },
            h(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1fr 1fr", height: 200 } },
                h(ThumbStick, {
                    label: "move",
                    axes: "xy",
                    onMove: (x, y) => setStick((old) => ({ ...old, left: [x, y] })),
                }),
                h(ThumbStick, {
                    label: "turn",
                    axes: "x",
                    onMove: (x, y) => setStick((old) => ({ ...old, right: [x, y] })),
                }),
            ),
            h(
                "div",
                { style: { display: "flex", gap: 16, alignItems: "center" } },
                h(KeyPad, {
                    rows: [
                        [{ label: "Q" }, { label: "W", down: stick.left[1] > 0 }, { label: "E" }],
                        [
                            { label: "A", down: stick.right[0] < 0 },
                            { label: "S", down: stick.left[1] < 0 },
                            { label: "D", down: stick.right[0] > 0 },
                        ],
                    ],
                }),
                h(Badge, null, `${stick.left.map((v) => v.toFixed(2)).join(", ")} · ${stick.right[0].toFixed(2)}`),
                h(Button, { variant: "danger", onClick: releaseAllThumbSticks }, "STOP"),
            ),
        ),
    )
}

/** A synthetic room (an OccupancyGrid with walls and a cost ring) and a robot driving a circle in it. */
function DemoMap() {
    const source = useMemo(() => memorySource(), [])
    const tf = useMemo(() => new TfTree(), [])
    const [pick, setPick] = useState(null)
    useEffect(() => {
        const width = 160, height = 120
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
            poses: Array.from(
                { length: 40 },
                (_, i) => ({ pose: { position: { x: -2 + i * 0.1, y: Math.sin(i / 6) } } }),
            ),
        }
        let angle = 0
        const timer = setInterval(() => {
            source.publish("dimos/map/nav_msgs.OccupancyGrid", grid)
            source.publish("dimos/path/nav_msgs.Path", path)
            angle += 0.05
            tf.set("world", "base_link", [Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0], [
                0,
                0,
                Math.sin((angle + Math.PI / 2) / 2),
                Math.cos((angle + Math.PI / 2) / 2),
            ])
        }, 100)
        return () => clearInterval(timer)
    }, [source, tf])
    return h(
        Card,
        { title: "Map2D", style: { gridColumn: "1 / -1" } },
        h(
            DataSourceProvider,
            { source },
            h(
                "div",
                { style: { position: "relative", height: 280 } },
                h(Map2D, {
                    tf,
                    fixedFrame: "world",
                    topic: { key: "dimos/map/nav_msgs.OccupancyGrid", name: "/map", type: "nav_msgs.OccupancyGrid" },
                    path: "dimos/path/nav_msgs.Path",
                    onPick: ({ x, y }) => setPick(`${x.toFixed(2)}, ${y.toFixed(2)}`),
                }),
            ),
        ),
        h(Badge, null, pick ? `clicked ${pick} (world)` : "click the map: onPick gets the spot in the fixed frame"),
    )
}
