// The 3D view: its box, the label overlay, scene labels pinned to 3D points, camera buttons and the stats pill.
export const SCENE_CSS = /* css */ `
.dr-scene {
    position: relative;
    overflow: hidden;
    min-height: 120px;
    background: var(--scene-bg, var(--bg));
    border-radius: inherit;
    isolation: isolate;
}
.dr-scene-host {
    position: absolute;
    inset: 0;
}
.dr-scene-canvas {
    display: block;
    touch-action: none;
    outline: none;
}
.dr-scene-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
}
.dr-scene-label {
    font: 600 11px/1.2 var(--sans);
    color: var(--fg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    background: color-mix(in srgb, var(--raised) 80%, transparent);
    border-left: 3px solid var(--label-color, var(--primary));
    transform: translateY(-14px);
    transition: opacity 0.15s;
}
.dr-scene-label.dr-frame-label {
    font-weight: 500;
    font-size: 10px;
    opacity: 0.8;
    border-left-color: var(--label-color, var(--muted-fg));
}
.dr-scene-label.dr-highlight {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--primary-fg);
    background: var(--primary);
    border-left-color: var(--fg);
    z-index: 2;
}
.dr-scene-label.dr-covered {
    opacity: 0;
}
.dr-scene-overlay {
    position: absolute;
    z-index: 2;
    pointer-events: auto;
}
.dr-scene-controls {
    position: absolute;
    z-index: 2;
    right: 10px;
    bottom: calc(10px + var(--dim-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.dr-scene-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    cursor: pointer;
    color: var(--fg);
    background: var(--glass, var(--surface));
    backdrop-filter: var(--blur);
    -webkit-backdrop-filter: var(--blur);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: background 0.15s ease, border-color 0.15s ease;
}
.dr-scene-btn:hover {
    background: var(--hover);
    border-color: var(--border-strong);
}
.dr-scene-btn:focus-visible {
    outline: none;
    border-color: var(--ring);
    box-shadow: var(--dr-focus);
}
.dr-scene-stats {
    position: absolute;
    z-index: 2;
    left: 10px;
    bottom: calc(10px + var(--dim-inset-bottom, 0px));
    font: 11px/1.4 var(--mono);
    color: var(--muted-fg);
    padding: 3px 8px;
    background: var(--glass, var(--surface));
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    pointer-events: none;
}
`
