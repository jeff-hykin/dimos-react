// Demo: an image view (a moving color frame, a depth frame through a colormap) and a recording's playback bar.
import { useEffect, useMemo, useState } from "react"
import { Card, DEPTH_COLORMAPS, ImageView, PlaybackBar, Select, Toggle } from "../../mod"

function colorFrame(phase) {
    const [width, height] = [160, 100]
    const data = new Uint8Array(width * height * 3)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 3
            data[o] = (x * 255) / width
            data[o + 1] = (128 + 127 * Math.sin(phase + y / 12)) | 0
            data[o + 2] = (y * 255) / height
        }
    }
    return { kind: "image", width, height, encoding: "rgb8", data }
}

function depthFrame() {
    const [width, height] = [160, 100]
    const values = new Uint16Array(width * height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const r = Math.hypot(x - 80, y - 50)
            values[y * width + x] = r < 6 ? 0 : 600 + r * 40
        }
    }
    return { kind: "depth", width, height, encoding: "16UC1", data: new Uint8Array(values.buffer) }
}

function ticks(rate, gaps = []) {
    const times = []
    for (let t = 0; t <= 184; t += 1 / rate) {
        if (!gaps.some(([a, b]) => t >= a && t <= b)) {
            times.push(t)
        }
    }
    return times
}

export function MediaSection() {
    const [phase, setPhase] = useState(0)
    const [colormap, setColormap] = useState("turbo")
    const [t, setT] = useState(42)
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [loop, setLoop] = useState(false)
    const [expanded, setExpanded] = useState(true)
    const [shown, setShown] = useState({ lidar: true, odom: true, tf: false })
    useEffect(() => {
        const timer = setInterval(() => setPhase((p) => p + 0.3), 120)
        return () => clearInterval(timer)
    }, [])
    useEffect(() => {
        if (!playing) {
            return
        }
        const timer = setInterval(
            () => setT((now) => (now + 0.1 * speed > 184 ? (loop ? 0 : 184) : now + 0.1 * speed)),
            100,
        )
        return () => clearInterval(timer)
    }, [playing, speed, loop])
    const color = useMemo(() => colorFrame(phase), [phase])
    const depth = useMemo(() => depthFrame(), [])
    const lanes = useMemo(
        () =>
            [
                ["lidar", "point cloud", 10, [[60, 75]]],
                ["odom", "pose", 4, []],
                ["tf", "tf", 2, [[120, 184]]],
            ].map(([id, meta, rate, gaps]) => ({ id, meta, rate, times: ticks(rate, gaps) })),
        [],
    )
    return (
        <div className="demo-grid">
            <Card title="ImageView (raw rgb8 frames)">
                <ImageView frame={color} style={{ height: 160 }} />
            </Card>
            <Card
                title="ImageView (16UC1 depth)"
                actions={<Select size="sm" value={colormap} options={DEPTH_COLORMAPS} onChange={setColormap} />}
            >
                <ImageView frame={depth} colormap={colormap} style={{ height: 160 }} />
            </Card>
            <Card title="PlaybackBar (recording player)" className="demo-wide" padded={false}>
                <PlaybackBar
                    start={0}
                    end={184}
                    value={t}
                    playing={playing}
                    onPlayPause={setPlaying}
                    onSeek={setT}
                    speed={speed}
                    onSpeedChange={setSpeed}
                    loop={loop}
                    onLoopChange={setLoop}
                    expanded={expanded}
                    onExpandedChange={setExpanded}
                    lanes={lanes.map((lane) => ({
                        id: lane.id,
                        label: `/${lane.id}`,
                        meta: lane.meta,
                        count: lane.times.length.toLocaleString(),
                        active: shown[lane.id],
                        ticks: { times: lane.times },
                        leading: (
                            <Toggle
                                size="sm"
                                value={shown[lane.id]}
                                label={null}
                                aria-label={`draw /${lane.id}`}
                                onChange={(on) => setShown((old) => ({ ...old, [lane.id]: on }))}
                            />
                        ),
                        menu: [
                            { heading: `/${lane.id}` },
                            { label: "Rename…", onSelect: () => {} },
                            "-",
                            {
                                label: "Delete…",
                                danger: true,
                                onSelect: () => {},
                            },
                        ],
                    }))}
                />
            </Card>
        </div>
    )
}
