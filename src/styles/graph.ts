// The graph view (dimos-react/graph): a dotted grid that pans and zooms with the drawing, edges in the muted ink
// (or --dr-graph-edge, set per edge), a focused node's neighbourhood lit and the rest dimmed, and its controls.
export const GRAPH_CSS = /* css */ `
.dr-graph {
    position: relative;
    overflow: hidden;
    background-color: var(--bg);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--muted-fg) 35%, transparent) 1.1px, transparent 1.4px);
}
.dr-graph > svg.graph { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; user-select: none; }
.dr-graph > svg.graph.panning { cursor: grabbing; }
.dr-graph .edge {
    fill: none;
    stroke: color-mix(in srgb, var(--muted-fg) 88%, var(--fg));
    stroke-width: 1.6;
    opacity: 0.8;
}
.dr-graph .edge.lit, .dr-graph .edge.flow {
    opacity: 1;
    stroke: color-mix(in srgb, var(--dr-graph-edge, var(--muted-fg)) 70%, var(--muted-fg));
}
.dr-graph .edge.lit { stroke-width: 2.2; }
/* an edge with data moving along it */
.dr-graph .edge.flow { stroke-width: 2.6; stroke-dasharray: 7 5; animation: dr-graph-flow 0.8s linear infinite; }
@keyframes dr-graph-flow { to { stroke-dashoffset: -12; } }
.dr-graph .node:focus-visible { outline: none; }
.dr-graph--focus .node:not(.lit), .dr-graph--focus .edge:not(.lit) { opacity: 0.5; }
.dr-graph__zoom, .dr-graph__layouts { position: absolute; bottom: 12px; }
.dr-graph__zoom { left: 12px; }
.dr-graph__layouts { right: 12px; flex-wrap: wrap; max-width: calc(100% - 160px); }
`
