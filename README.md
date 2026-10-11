# dimos-react

React UI toolkit for [dimOS Desktop](https://github.com/dimensionalOS/dimos-desktop) apps: themed components that follow
Desktop's skin live, URL state the backend can drive, zenoh data hooks, and a generic three.js 3D view (TF, point
clouds, paths, poses, robot models).

Plain JavaScript + JSDoc, **no build step**: React's `createElement` is exported as `h`, and React / three come from
your page's import map, so the library and your app share one copy.

## Quick start

```html
<script type="importmap">
    {
        "imports": {
            "react": "https://esm.sh/react@19.2.0",
            "react/": "https://esm.sh/react@19.2.0/",
            "react-dom": "https://esm.sh/react-dom@19.2.0",
            "react-dom/": "https://esm.sh/react-dom@19.2.0/",
            "three": "https://esm.sh/three@0.180.0",
            "three/": "https://esm.sh/three@0.180.0/",
            "dimos-react": "https://esm.sh/gh/jeff-hykin/dimos-react@v0.1.0/mod.js?external=react,react-dom,three",
            "dimos-react/three": "https://esm.sh/gh/jeff-hykin/dimos-react@v0.1.0/three.js?external=react,react-dom,three"
        }
    }
</script>
<div id="root"></div>
<script type="module" src="./main.js"></script>
```

```js
// main.js
import { createRoot } from "react-dom/client"
import { AppProvider, Button, Card, h, Toggle, TopBar, useToast, useUrlState } from "dimos-react"

function App() {
    const toast = useToast()
    const [tab, setTab] = useUrlState("tab", "overview")
    const [follow, setFollow] = useUrlState("follow", true, { codec: "boolean" })
    return h(
        "div",
        null,
        h(TopBar, { title: "My app", icon: "robot" }),
        h(
            Card,
            { title: tab },
            h(Toggle, { value: follow, onChange: setFollow, label: "Follow robot" }),
            h(Button, {
                variant: "primary",
                onClick: () => {
                    setTab("map")
                    toast.ok("Switched")
                },
            }, "Show map"),
        ),
    )
}

createRoot(document.getElementById("root")).render(h(AppProvider, null, h(App)))
```

`AppProvider` = `DimThemeProvider` (Desktop's skin, live) + the data source (Desktop's zenoh-gateway) +
`UrlStateProvider` (backend url events) + toasts + confirm/prompt dialogs. Each also works on its own.

The demo / storybook renders every component: `deno task demo`, then open http://localhost:8777/demo/ (`?skin=research`,
`?skin=vibeslop`, … picks a skin; `?section=scene` one section).

## Theme

Desktop serves every skin's tokens at `/theme.css` and saves the user's choice in localStorage (`portal.theme`,
`portal.corners`). `<DimThemeProvider>` links that stylesheet when the page is a Desktop app (`/apps/<name>/`), sets
`html[data-skin]` / `html[data-corners]`, and follows every change live (Settings → Appearance in Desktop reaches every
open app through the `storage` event). Off Desktop it uses a bundled copy of the tokens (`src/theme/tokens.js`,
regenerated with `deno task sync-tokens`).

```js
h(DimThemeProvider, null, h(App)) // Desktop's skin, followed live
h(DimThemeProvider, { skin: "research" }, h(App)) // pinned (screenshots, demos)
const { skin, dark, corners, colors } = useTheme() // colors: --primary, --scene-bg, … for canvases / 3D
```

Every component is styled only with Desktop's tokens (`var(--primary)`, `var(--radius)`, `color-mix()` of tokens: no
color literals, checked by `test/theme_test.js`), with light rules plus `:root[data-dr-dark]` rules for dark skins, so
an app looks like Desktop in every skin. Your own CSS can use the same tokens. `--dim-inset-bottom` etc. say how much of
the page Desktop's dock covers.

## Components

All take `className`, `style` and DOM props; controls take `value` + `onChange(value)` (the value, not the event).

<<<<<<< HEAD
| Group         | Components                                                                                                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons       | `Button` (variant default/primary/ghost/danger, size, icon, pressed, loading), `IconButton`, `ButtonGroup`                                                                                                                                                                                                            |
| Forms         | `Field`, `TextInput`, `NumberInput`, `TextArea`, `SearchInput`, `Select`, `Checkbox`, `Toggle` (`Switch`), `Radio`, `RadioGroup`, `Slider`, `RangeSlider`, `ColorSwatch`, `FileDrop`                                                                                                                                  |
| Status        | `Badge`, `Chip`, `StatusDot`, `ConnectionStatus`, `Kbd`, `KeyHints`, `Spinner`, `Progress`, `ProgressRing`, `Skeleton`                                                                                                                                                                                                |
| Feedback      | `Alert`, `toast()` / `useToast()` / `ToastProvider`, `Modal`, `useConfirm()`, `usePrompt()` (`DialogProvider`), `EmptyState`, `ErrorBoundary`                                                                                                                                                                         |
| Layout        | `AppShell` (`insetBottom`: end above Desktop's dock), `TopBar`, `Toolbar`, `BottomBar`, `Card`, `Panel` (collapsible, glass), `FloatingPanel` (draggable), `SplitPane`, `Hud`, `Embed` (an iframe filling its parent), `Row`, `Column`, `Spacer`, `Separator`, `Heading`, `Label`, `Text`, `Link`, `Icon` (+ `ICONS`) |
| Navigation    | `Tabs`, `Segmented`, `Menu`, `ContextMenu`, `Popover`, `Tooltip`, `Sidebar`, `NavRail`, `Stepper`, `Breadcrumbs`, `CommandPalette` (`useCommandPalette`)                                                                                                                                                              |
| Data          | `Table` (sortable; `sortRows: false` when a backend sorts), `Tree`, `List`, `ListRow`, `KeyValue`, `KeyValueRow`, `Stat`, `LogView`, `CodeBlock`, `Sparkline`, `Timeline` (scrubber)                                                                                                                                  |
| Input devices | `Joystick`, `DPad`                                                                                                                                                                                                                                                                                                    |
| Hooks         | `usePersistentState`, `useHotkeys`, `useHeldKeys`, `useEscape`, `useMobile`, `useMediaQuery`, `useDrag`, `useNow`, `useGamepad`                                                                                                                                                                                       |
=======
| Group         | Components                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons       | `Button` (variant default/primary/ghost/danger, size, icon, pressed, loading), `IconButton`, `ButtonGroup`                                                                                                                          |
| Forms         | `Field`, `TextInput`, `NumberInput`, `TextArea`, `SearchInput`, `Select`, `Checkbox`, `Toggle` (`Switch`), `Radio`, `RadioGroup`, `Slider`, `RangeSlider`, `ColorSwatch`, `FileDrop`                                                |
| Status        | `Badge`, `Chip`, `StatusDot`, `ConnectionStatus`, `Kbd`, `KeyHints`, `Spinner`, `Progress`, `ProgressRing`, `Skeleton`                                                                                                              |
| Feedback      | `Alert`, `toast()` / `useToast()` / `ToastProvider`, `Modal`, `useConfirm()`, `usePrompt()` (`DialogProvider`), `EmptyState`, `ErrorBoundary`                                                                                       |
| Layout        | `AppShell`, `TopBar`, `Toolbar`, `BottomBar`, `Card`, `Panel` (collapsible, glass), `FloatingPanel` (draggable), `SplitPane`, `Hud`, `Row`, `Column`, `Spacer`, `Separator`, `Heading`, `Label`, `Text`, `Link`, `Icon` (+ `ICONS`) |
| Navigation    | `Tabs`, `Segmented`, `Menu`, `ContextMenu`, `Popover`, `Tooltip`, `Sidebar`, `NavRail`, `Stepper`, `Breadcrumbs`, `CommandPalette` (`useCommandPalette`)                                                                            |
| Data          | `Table` (sortable; `sortRows: false` when a backend sorts), `Tree`, `List`, `ListRow`, `KeyValue`, `KeyValueRow`, `Stat`, `LogView`, `CodeBlock`, `Sparkline`, `Timeline` (scrubber), `MediaFrame` (+ `captureFrame`)               |
| Input devices | `Joystick`, `DPad`                                                                                                                                                                                                                  |
| Hooks         | `usePersistentState`, `useHotkeys`, `useHeldKeys`, `useEscape`, `useMobile`, `useMediaQuery`, `useDrag`, `useNow`, `useGamepad`                                                                                                     |
>>>>>>> 1a2cfa9 (MediaFrame: a video stream (a zenoh-gateway camera track) or an image in a themed frame; captureFrame() grabs a <video>'s frame; demo entry)

## Live data (zenoh)

Hooks and 3D layers read through a _data source_. By default it is the page's one zenoh-gateway connection (dim-app's
`getZenoh()`); `DataSourceProvider` swaps in another (`memorySource()` for tests, demos and replays).

```js
const { value: odom } = useTopic("dimos/odom/nav_msgs.Odometry", { maxHz: 10 })   // decoded LCM
const topics = useTopicList()                         // [{ key, name: "/odom", type: "nav_msgs.Odometry" }]
const state = useConnectionState()                    // connecting | connected | degraded | lost
useBackendEvents((event) => { ... })                  // the app backend's `events` frontend topic
const [recordings, { loading, refresh }] = useBackendState("recordings")   // GET api/state/recordings, live
```

## URL state

The URL is the UI's state: back/forward, reloads and shared links reproduce the same screen, and **the backend drives
the UI by changing the URL**. The backend publishes a url event on its `events` frontend topic (dim-app's
`publishEvent`); `UrlStateProvider` (in `AppProvider`) applies it with `history.pushState`; components render from the
URL with `useUrlState`.

```js
// backend (dim-app): publishEvent({ type: "url", set: { recording: "run3", t: 12.5 } })
//   set: params to merge (null removes one) · replace: true → replaceState · clear: true → drop the other params

const [recording, setRecording] = useUrlState("recording") // string | undefined
const [t, setT] = useUrlState("t", 0, { codec: "number", replace: true }) // codec: string|number|boolean|json
const [params, setParams] = useUrlParams() // all of them
```

`test/url_state_test.js` proves the round trip: a backend event → the URL → the rendered UI, then back/forward and a
fresh deep link reproduce the same UI. Without React: `createUrlStore()`, `bindUrlEvents(source, store)`. `mode: "hash"`
keeps params in `#a=1&b=2` instead of the query string.

## 3D view (three.js)

The 3D view is its own entry, `three.js`, so apps without one never load three. It is the Controller's view made
generic: a Z-up (ROS) scene in a fixed frame, orbit/pan/zoom (mouse: left-drag orbit, right- or shift-drag pan, wheel
zoom; touch: one finger orbit, two fingers pan and pinch zoom), a smoothed follow camera, TF streaming, and layers for
point clouds, paths, poses and stand-in robot models. Layers take data **from a topic** (through the data source: live
zenoh-gateway by default, or a replay / test source via `DataSourceProvider`) **or from props**.

```js
import {
    DimThemeProvider,
    h,
    ZenohProvider,
} from "https://esm.sh/gh/jeff-hykin/dimos-react@v0.1.0/mod.js?external=react,react-dom,three"
import {
    Path,
    PointCloud,
    Pose,
    RobotModel,
    Scene3D,
    SceneControls,
    SceneStats,
    TfFeed,
    TfFrames,
} from "https://esm.sh/gh/jeff-hykin/dimos-react@v0.1.0/three.js?external=react,react-dom,three"

// live, from topics: dimos/<topic>/<msg type> keys on Desktop's zenoh-gateway
h(
    Scene3D,
    { followFrame: "base_link", style: { height: "100vh" } },
    h(TfFeed), // every tf2_msgs.TFMessage topic → the TF tree
    h(TfFrames, { axesSize: 0.25 }), // axes + names + parent links
    h(PointCloud, { topic: "dimos/lidar/sensor_msgs.PointCloud2", style: "voxel", size: 0.05 }),
    h(PointCloud, { topic: "dimos/global_map/sensor_msgs.PointCloud2", mode: "accumulate", size: 0.1 }),
    h(Path, { topic: "dimos/path/nav_msgs.Path" }),
    h(Pose, { topic: "dimos/odom/nav_msgs.Odometry", trail: true }),
    h(RobotModel, { kind: "dog", frame: "base_link" }), // dog | humanoid | wheeled | drone | arrow
    h(SceneControls), // frame-all, top-down, resume-follow buttons
    h(SceneStats),
) // fps · points · frame ms · latency
```

From props (a replay, a file, computed data): the same layers, no topic.

```js
h(
    Scene3D,
    { fixedFrame: "world", style: { height: 480 } },
    h(TfFeed, {
        transforms: [{ parent: "world", child: "base_link", translation: [1, 2, 0], rotation: [0, 0, 0, 1] }],
    }),
    h(PointCloud, { points: float32xyz, intensity: uint8, frame: "world", colorMode: "intensity", gradient: "turbo" }),
    h(Path, { poses: [[0, 0, 0], [1, 0, 0], [2, 1, 0]], frame: "world", color: "var(--ok)" }),
    h(Pose, { pose: { x: 1, y: 2, yaw: 0.5 }, frame: "world" }),
    h(PoseArray, { poses: waypoints, frame: "world" }),
    h(RobotModel, { kind: "wheeled", pose: { x: 1, y: 2, yaw: 0.5 }, poseFrame: "world" }),
)
```

A replay app can also keep the topic props and feed its own source: `memorySource()` + `DataSourceProvider`, then
`source.publish(key, lcmBytes)` (or `publish(key, { positions, intensity, frame })` for clouds).

**Scene3D props**: `fixedFrame` (default: the TF tree's world/map/odom root), `followFrame` (a TF frame the camera
follows; orbit and zoom keep following, a pan pauses it until `viewer.resumeFollow()`), `grid`,
`onPick({ point, on,
event })` (click → nearest cloud point / mesh / ground point), `cameraPosition`, `cameraTarget`,
`tf` (bring your own `TfTree`, e.g. to share it with a `FramePicker` outside the scene), `onViewer(viewer)`. DOM
children are laid over the canvas (use `className: "dr-scene-overlay"` and position them).

**Layer props**: `PointCloud` — `topic` | `points` (+ `intensity`, `frame`), `mode` latest|accumulate, `windowSeconds`,
`maxPoints`, look: `style` voxel|disc|square|splat, `size` (m), `colorMode` height|intensity|range| solid, `gradient`
(memworld, turbo, viridis, magma, plasma, ice, sunset, grayscale), `axis`, `rangeMin/Max`, `color`, `opacity`. `Path` —
`topic` | `poses` (+ `frame`), `color`, `width` (px), `lift`, `onTop`. `Pose` — `topic` (Odometry / PoseStamped /
PoseWithCovarianceStamped) | `pose` (+ `frame`), `axesSize`, `trail`, `trailLength`, `jumpMeters`,
`onPose(matrixInFixedFrame)`. Colors accept any CSS color or a theme token (`"var(--primary)"`); axes use the theme's
`--axis-x/y/z`. Every layer takes `onStatus({ info, problem, frame })` (e.g. "no TF path from lidar to world").

**Hooks**: `useViewer()`, `useTf()`, `useFixedFrame()`, `useScene()`, `useSceneFrame(fn)` (per animation frame),
`useTfFrames()` (frame names, throttled), and `FramePicker` (a Select of TF frames).

**Custom layers** with `useLayer(create, deps)`: `create({ viewer, tf })` returns
`{ root, update?(frame), dispose?() }`; `root` is added to the scene, `update` runs every frame
(`frame = { now, fixedFrame, camera }`). Push new data into the returned ref from your own effects rather than
re-creating the layer.

```js
function Marker({ frame, color = "var(--warn)" }) {
    useLayer(({ viewer, tf }) => {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.2),
            new THREE.MeshLambertMaterial({ color: cssColor(color) }),
        )
        mesh.matrixAutoUpdate = false
        return {
            root: mesh,
            update: ({ fixedFrame }) => placeInFixedFrame(viewer, tf, mesh, frame, fixedFrame),
            dispose: () => disposeTree(mesh),
        }
    }, [frame, color])
    return null
}
```

**Viewer API** (`useViewer()`, or `new Viewer(element)` without React): `scene`, `camera`, `controls` (OrbitControls),
`renderer`, `fixedFrame`, `requestRender()`, `noteData(timestampMs)`, `onFrame(fn)`, `pick(clientX, clientY)`,
`frame(target, distance)`, `frameAll()`, `topDown(target, extent)`, `dataBounds()`, `pauseFollow()` / `resumeFollow()`,
`followPaused` and `stats` (stores: `{ fps, frameMs, latencyP50, latencyP95, drawCalls, points }`), `setTheme()`,
`setGrid(visible)`, `dispose()`. `TfTree` (pure, no DOM): `set(parent, child, xyz, quat, isStatic)`,
`setMessage(tfMessage)`, `lookup(frame, fixed)` → `Matrix4 | null`, `defaultFixedFrame()`, `frames()`, `snapshot()`
(with problems: double parents, several roots, cycles, stale edges), `onChange(fn)`.

## Tests

```sh
deno task test     # theme tokens, URL-state round trip (happy-dom), TF math
```

## Layout

`mod.js` (everything but 3D) · `three.js` (3D) · `src/theme` (provider, tokens, CSS assembly) · `src/styles` (component
CSS, tokens only) · `src/components` · `src/three` · `src/data.js` · `src/url_state.js` · `src/vendor` (dim-app's zenoh
client, the dimos LCM schemas; `deno task vendor`) · `demo/`.

The 3D code is ported from dim-controller's view; the icons are the shared dimOS set.
