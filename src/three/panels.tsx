// The 3D view's side panels, outside the scene: the layer list (every drawable topic, a switch each, live info or
// the problem, the layer's own settings), the TF tree (fixed frame, issues, an indented frame list whose hover picks a
// frame out in the view) and the one-line TF footnote over the view. They share state with the scene through a
// LayerManager and a TfTree passed to both.
//
//     const layers = useLayerManager()                  // watches the source's topics
//     const tf = useMemo(() => new TfTree(), [])
//     h(Scene3D, { tf }, h(TfFeed), h(TopicLayers, { manager: layers }), h(FrameHighlight, { frame: hovered }))
//     h(LayersPanel, { manager: layers })
//     h(TfPanel, { tf, fixedFrame, onFixedFrame, issues, onHover: setHovered })
import { useEffect, useMemo, useRef, useState } from "react"
import { cx, h } from "../h.js"
import { useDataSource } from "../data.js"
import { useStore } from "./store.js"
import { LayerManager } from "./layers/manager.js"
import { Badge, Field, Select, Toggle } from "../components/controls.js"
import { Icon } from "../components/icon.js"
import { Alert, EmptyState } from "../components/feedback.js"

/**
 * A LayerManager for the data source in effect, watching its topics while mounted.
 * @param {{ persist?: (key: string, defaults: object) => any, storagePrefix?: string, filter?: string,
 *   intervalMs?: number }} [options]
 * @returns {LayerManager}
 */
export function useLayerManager({ persist, storagePrefix, filter, intervalMs } = {}) {
    const source = useDataSource()
    const manager = useMemo(() => new LayerManager({ source, persist, storagePrefix }), [source, storagePrefix])
    useEffect(() => manager.watch({ filter, intervalMs }), [manager, filter, intervalMs])
    return manager
}

function LayerRow({ manager, entry }) {
    const [open, setOpen] = useState(false)
    const Settings = entry.type.Settings
    const status = entry.status
    return h(
        "div",
        {
            className: cx(
                "dr-layer-row",
                entry.enabled && "dr-layer-row--on",
                status.problem && "dr-layer-row--problem",
            ),
            "data-key": entry.topic.key,
        },
        h(
            "div",
            { className: "dr-layer-line" },
            h(Toggle, {
                value: entry.enabled,
                size: "sm",
                "aria-label": `Show ${entry.topic.name}`,
                onChange: (enabled) => manager.setEnabled(entry.topic.key, enabled),
            }),
            h(
                "button",
                {
                    type: "button",
                    className: "dr-layer-name",
                    onClick: () => setOpen(!open),
                    disabled: !Settings,
                    title: entry.topic.key,
                    "aria-expanded": Settings ? open : undefined,
                },
                h("span", { className: "dr-layer-topic" }, entry.topic.name),
                h("span", { className: "dr-layer-type" }, entry.topic.type.split(".")[1]),
                Settings
                    ? h(
                        "span",
                        { className: cx("dr-layer-chevron", open && "dr-layer-chevron--open") },
                        h(Icon, { name: "chevron-right", size: 14 }),
                    )
                    : null,
            ),
        ),
        entry.enabled && (status.problem || status.info)
            ? h(
                "div",
                { className: cx("dr-layer-status", status.problem && "dr-layer-status--problem") },
                status.problem ?? status.info,
            )
            : null,
        open && Settings
            ? h(
                "div",
                { className: "dr-layer-settings" },
                h(Settings, { settings: entry.settings, topic: entry.topic }),
            )
            : null,
    )
}

/**
 * Every drawable topic, grouped by layer type: a switch (on = subscribed), live info or the problem, and the layer's
 * settings behind a disclosure; then the topics nothing draws.
 * @param {{ manager: LayerManager, emptyText?: string, className?: string }} props
 */
export function LayersPanel({ manager, emptyText, className }) {
    const { list } = useStore(manager.entries)
    const { list: topics } = useStore(manager.topics)
    const groups = new Map()
    for (const entry of list) {
        groups.set(entry.type.label, [...(groups.get(entry.type.label) ?? []), entry])
    }
    const drawn = new Set(list.map((entry) => entry.topic.key))
    const other = topics.filter((topic) => !drawn.has(topic.key))
    return h(
        "div",
        { className: cx("dr-layers", className) },
        !list.length
            ? h(EmptyState, {
                icon: "layers",
                title: "Waiting for topics…",
                message: emptyText ?? "Start a blueprint (or a replay) and they appear here.",
            })
            : null,
        [...groups].map(([label, entries]) =>
            h(
                "section",
                { key: label, className: "dr-layer-group" },
                h("h3", { className: "dr-layer-group-title" }, label),
                entries.map((entry) => h(LayerRow, { key: entry.topic.key, manager, entry })),
            )
        ),
        other.length
            ? h(
                "details",
                { className: "dr-layer-group dr-layer-other" },
                h("summary", null, `${other.length} other topics (not drawn)`),
                other.map((topic) =>
                    h(
                        "div",
                        { key: topic.key, className: "dr-layer-other-topic" },
                        h("span", null, topic.name),
                        h("span", { className: "dr-layer-type" }, topic.type),
                    )
                ),
            )
            : null,
    )
}

function TreeRows({ snapshot, frame, depth, seen, hovered, flagged, onHover, rows }) {
    if (seen.has(frame) || depth > 64) {
        return
    }
    seen.add(frame)
    const edge = snapshot.edges.find((other) => other.child === frame)
    const stale = snapshot.problems.stale.includes(frame)
    rows.push(
        h(
            "div",
            {
                key: frame,
                className: cx(
                    "dr-tf-frame",
                    stale && "dr-tf-frame--stale",
                    flagged.has(frame) && "dr-tf-frame--flagged",
                    hovered === frame && "dr-tf-frame--highlighted",
                ),
                style: { paddingLeft: depth * 14 + 4 },
                "data-frame": frame,
                title: onHover ? "Hover to find it in the 3D view" : undefined,
                onPointerEnter: () => onHover?.(frame),
                onPointerLeave: () => onHover?.(null),
            },
            h("span", null, frame),
            edge
                ? h("span", { className: "dr-tf-age" }, edge.isStatic ? "static" : `${Math.round(edge.ageMs)} ms`)
                : null,
        ),
    )
    const children = snapshot.edges.filter((other) => other.parent === frame).map((other) => other.child).sort()
    for (const child of children) {
        TreeRows({ snapshot, frame: child, depth: depth + 1, seen, hovered, flagged, onHover, rows })
    }
}

/**
 * The TF tree as an indented list (age per edge, stale and flagged frames marked), what's wrong with it, and which
 * frame the view is fixed to (`fixedFrame` = the choice, "" = auto; `activeFixedFrame` = the one in use).
 * @param {{ tf: import("./tf.js").TfTree, fixedFrame?: string, activeFixedFrame?: string,
 *   onFixedFrame?: (frame: string) => void, issues?: import("./tf_check.js").TfIssue[], robotFrame?: string,
 *   robotFound?: boolean, hovered?: string | null, hoveredPlaced?: boolean, onHover?: (frame: string | null) => void,
 *   className?: string }} props
 */
export function TfPanel({
    tf,
    fixedFrame = "",
    activeFixedFrame,
    onFixedFrame,
    issues = [],
    robotFrame,
    robotFound,
    hovered = null,
    hoveredPlaced = true,
    onHover,
    className,
}) {
    const [snapshot, setSnapshot] = useState(() => tf.snapshot())
    useEffect(() => {
        const timer = setInterval(() => setSnapshot(tf.snapshot()), 1000)
        return () => clearInterval(timer)
    }, [tf])
    // the highlight goes with the panel
    useEffect(() => () => onHover?.(null), [])
    const flagged = new Set(issues.flatMap((issue) => issue.frames))
    const tree = useRef(null)
    const scrolled = useRef(false)
    useEffect(() => {
        const first = tree.current?.querySelector(".dr-tf-frame--flagged")
        if (first && !scrolled.current) {
            scrolled.current = true
            first.scrollIntoView({ block: "nearest" })
        }
    })
    const active = activeFixedFrame ?? (fixedFrame || tf.defaultFixedFrame())
    const rows = []
    for (const root of snapshot.problems.roots) {
        TreeRows({ snapshot, frame: root, depth: 0, seen: new Set(), hovered, flagged, onHover, rows })
    }
    return h(
        "div",
        { className: cx("dr-tf-panel", className) },
        onFixedFrame
            ? h(
                Field,
                { label: "Fixed frame", hint: "everything is drawn relative to this frame" },
                h(Select, {
                    value: fixedFrame,
                    options: [["", `auto (${active})`], ...snapshot.frames.map((frame) => [frame, frame])],
                    onChange: onFixedFrame,
                }),
            )
            : null,
        robotFrame
            ? h(
                "p",
                { className: "dr-hint" },
                `Robot frame: ${robotFrame} `,
                h(Badge, { tone: robotFound ? "ok" : "warn" }, robotFound ? "in TF" : "not in TF yet"),
            )
            : null,
        issues.map((issue) =>
            h(
                Alert,
                {
                    key: issue.kind + issue.summary,
                    tone: "warn",
                    title: issue.summary,
                    "data-frames": issue.frames.join(","),
                },
                issue.detail,
            )
        ),
        !snapshot.frames.length ? h(EmptyState, { icon: "info", title: "no tf yet" }) : null,
        h("div", { className: "dr-tf-tree", ref: tree, onPointerLeave: () => onHover?.(null) }, rows),
        hovered && !hoveredPlaced
            ? h("p", { className: "dr-hint" }, `${hovered} isn't connected to ${active}: it can't be shown in the view`)
            : null,
    )
}

/**
 * A quiet one-line note over the view's corner when the TF tree is broken; nothing when it's fine. `onOpen`: e.g.
 * open the TF panel, where the frames involved are marked.
 * @param {{ issues: import("./tf_check.js").TfIssue[], onOpen?: () => void, className?: string }} props
 */
export function TfFootnote({ issues, onOpen, className }) {
    if (!issues?.length) {
        return null
    }
    const more = issues.length > 1 ? ` · +${issues.length - 1} more` : ""
    return h(
        "button",
        {
            type: "button",
            className: cx("dr-tf-footnote", className),
            "data-testid": "tf-footnote",
            title: issues.map((issue) => `${issue.summary}: ${issue.detail}`).join("\n"),
            onClick: onOpen,
        },
        h(Icon, { name: "warn", size: 13 }),
        h("span", null, `TF: ${issues[0].summary}${more}`),
    )
}
