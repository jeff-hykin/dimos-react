// <Map2D>: the top-down 2D map as a React component, filling its positioned parent. It reads topics through the data
// source and places everything through a TfTree (pass `tf`, e.g. the one a Scene3D and its TfFeed share).
//
//     h(Map2D, { tf, topic: globalMap, overlay: costmap, path: "dimos/path/nav_msgs.Path", followFrame: "base_link",
//         onPick: ({ x, y, frame }) => sendGoal(x, y, frame), onMap: (map) => (mapRef.current = map) })
//
// `onMap(renderer)` hands over the renderer for buttons outside it: `renderer.recenter()` (follow again), `renderer.fit()`
// (show everything). The renderer lives while the component is mounted; nothing is subscribed once it unmounts.
import { useEffect, useMemo, useRef } from "react"
import { cx } from "../cx"
import { useDataSource } from "../data"
import { Map2DRenderer } from "./renderer"
import { DEFAULT_FOLLOW_FRAME } from "./math"

/** each data source's last map data per topic, so a remounted map shows it at once */
const retainedBySource = new WeakMap()

/**
 * @param {{ tf: import("../three/tf").TfTree, topic?: { key: string, name: string, type: string } | null,
 *   overlay?: { key: string, name: string, type: string } | null, path?: string | null, followFrame?: string,
 *   robotFrame?: string, fixedFrame?: string, view?: { centerX: number, centerY: number, metersPerPixel: number } | null,
 *   onView?: (view: object) => void, onFollow?: (follow: { following: boolean, waiting: boolean }) => void,
 *   onStatus?: (status: { info: string, problem: string }) => void,
 *   onPick?: (pick: { x: number, y: number, frame: string, event: PointerEvent }) => void,
 *   onMap?: (renderer: Map2DRenderer | null) => void, className?: string, style?: object, children?: any }} props
 *   `topic`: the base map (OccupancyGrid, or a PointCloud2 drawn as a height heatmap); `overlay`: a costmap over it;
 *   `path`: a nav_msgs.Path topic key; `followFrame`: the TF frame it follows (a pan stops following);
 *   `robotFrame`: where the robot arrow and trail go (default `followFrame`); `fixedFrame` (default: the TF tree's
 *   world-ish root); `view`: where to start (a remembered `onView`)
 */
export function Map2D({
    tf,
    topic = null,
    overlay = null,
    path = null,
    followFrame = DEFAULT_FOLLOW_FRAME,
    robotFrame,
    fixedFrame,
    view = null,
    onView,
    onFollow,
    onStatus,
    onPick,
    onMap,
    className,
    style,
    children,
}) {
    const source = useDataSource()
    const canvas = useRef(null)
    const renderer = useRef(null)
    const props = useRef({})
    props.current = { onView, onFollow, onStatus, onPick, onMap, fixedFrame, robotFrame, followFrame }
    const map = useMemo(() => {
        let retained = retainedBySource.get(source)
        if (!retained) {
            retainedBySource.set(source, (retained = new Map()))
        }
        return {
            source,
            tf,
            retained,
            fixedFrame: () => props.current.fixedFrame || tf.defaultFixedFrame(),
            robotFrame: () => props.current.robotFrame || props.current.followFrame,
        }
    }, [source, tf])
    useEffect(() => {
        const created = new Map2DRenderer(map, canvas.current, view, followFrame, {
            onView: (next) => props.current.onView?.(next),
            onFollow: (next) => props.current.onFollow?.(next),
            onStatus: (next) => props.current.onStatus?.(next),
            onPick: (pick) => props.current.onPick?.(pick),
        })
        renderer.current = created
        props.current.onMap?.(created)
        return () => {
            props.current.onMap?.(null)
            created.dispose()
            renderer.current = null
        }
    }, [map])
    useEffect(() => renderer.current?.setFollowFrame(followFrame), [map, followFrame])
    useEffect(() => renderer.current?.setTopics(topic, overlay), [map, topic?.key, overlay?.key])
    useEffect(() => renderer.current?.setPath(path), [map, path])
    return (
        <div className={cx("dr-map2d", className)} style={style}>
            <canvas ref={canvas} className="dr-map2d-canvas" aria-label="Top-down map" />
            {children}
        </div>
    )
}
