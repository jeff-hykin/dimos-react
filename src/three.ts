// dimos-react's 3D view (three.js): import from ".../three.js" so apps without a 3D view never load three.
export {
    colorFor,
    FrameHighlight,
    FramePicker,
    KeyboardFly,
    Layer,
    Path,
    placeInFixedFrame,
    PointCloud,
    pointCloud2ToPositions,
    Pose,
    PoseArray,
    poseMatrix,
    poseOf,
    RobotModel,
    Scene3D,
    SceneControls,
    SceneStats,
    TfFeed,
    TfFrames,
    TfProvider,
    TopicLayers,
    useFixedFrame,
    useLayer,
    useScene,
    useSceneActions,
    useSceneFrame,
    useTf,
    useTfFrames,
    useTfIssues,
    useViewer,
} from "./three/react"
export { LayersPanel, TfFootnote, TfPanel, useLayerManager } from "./three/panels"
export { CubeShadePicker, PointLookEditor, RangeInput, RenderingSettings, StylePicker } from "./three/look_editor"
export { LayerManager } from "./three/layers/manager"
export {
    allLayerTypes,
    allOverlayTypes,
    defaultSettings,
    layerTypeById,
    layerTypeFor,
    overlayTypeFor,
    placeLayer,
    registerLayer,
    registerOverlay,
    rgba,
    RobotPose,
    subscribeDecoded,
} from "./three/layers/registry"
export { CloudLayer, CloudQualitySelect, CloudSettingsEditor, isMapTopic } from "./three/layers/pointcloud"
export { ColorSetting, PoseLayer } from "./three/layers/pose"
export { PathLayer, pathPoints } from "./three/layers/path"
export { PoseArrayLayer } from "./three/layers/pose_array"
export { GraphLayer } from "./three/layers/graph"
export { MARKER_TYPE, MarkerLayer } from "./three/layers/marker"
export { boxesOf, BoxLayer } from "./three/layers/boxes"
export { entitiesOf, LabeledPoints } from "./three/layers/labeled_points"
export { GridLayer } from "./three/layers/occupancy"
export { TfFramesLayer } from "./three/layers/tf_frames"
export { Camera3dLayer } from "./three/layers/camera3d"
export { checkTf, confirmedIssues, TF_STALE_MS } from "./three/tf_check"
export { FrameHighlighter } from "./three/frame_highlight"
export { FRAME_BUDGET_MS, rendering, resolveLook, resolveStyle, splatFallback } from "./three/rendering"
export {
    CLOUD_PRESETS,
    cloudChanges,
    cloudOptions,
    cloudPreset,
    cloudQualities,
    cloudQualityOf,
    cloudRates,
    CloudStream,
    formatBytes,
    formatCount,
    setCloudQuality,
    setCloudRate,
} from "./three/cloud_quality"
export { GradientPicker } from "./three/gradient_picker"
export { Viewer } from "./three/viewer"
export { STALE_MS, TfTree, WORLD_NAMES } from "./three/tf"
export { CATCH_UP_SECONDS, PanGate, SmoothFollow } from "./three/follow"
export { DEFAULT_GRADIENT, gradientCss, GRADIENTS, gradientTexture, RAMPS, sampleGradient } from "./three/gradients"
export {
    applyLook,
    CUBE_SHADES,
    DEFAULT_LOOK,
    focusDistance,
    makePointMaterial,
    POINT_STYLES,
    setClipBox,
    splatBackground,
} from "./three/point_material"
export { FatLines, pushBox } from "./three/lines"
export { LabelPool } from "./three/labels"
export { cssColor, disposeTree, ROBOT_KINDS, robotModel } from "./three/robot_model"
export { localStore, readLocal, Store, useStore, writeLocal } from "./three/store"
export * from "./camera/depth"
export { DEFAULT_DEPTH_LOOK } from "./three/layers/camera3d"
export { Map2D } from "./map2d/react"
export { Map2DRenderer } from "./map2d/renderer"
export {
    chooseMapTopic,
    chooseOverlay,
    fitView as fitMapView,
    followFrameOptions,
    isGridTopic,
    mapCandidates,
    overlayCandidates,
    screenToWorld as mapScreenToWorld,
    worldToScreen as mapWorldToScreen,
    zoomAt as mapZoomAt,
} from "./map2d/math"
