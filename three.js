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
} from "./src/three/react.js"
export { LayersPanel, TfFootnote, TfPanel, useLayerManager } from "./src/three/panels.js"
export {
    CubeShadePicker,
    PointLookEditor,
    RangeInput,
    RenderingSettings,
    StylePicker,
} from "./src/three/look_editor.js"
export { LayerManager } from "./src/three/layers/manager.js"
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
} from "./src/three/layers/registry.js"
export { CloudLayer, CloudQualitySelect, CloudSettingsEditor, isMapTopic } from "./src/three/layers/pointcloud.js"
export { ColorSetting, PoseLayer } from "./src/three/layers/pose.js"
export { PathLayer, pathPoints } from "./src/three/layers/path.js"
export { PoseArrayLayer } from "./src/three/layers/pose_array.js"
export { GraphLayer } from "./src/three/layers/graph.js"
export { MARKER_TYPE, MarkerLayer } from "./src/three/layers/marker.js"
export { boxesOf, BoxLayer } from "./src/three/layers/boxes.js"
export { entitiesOf, LabeledPoints } from "./src/three/layers/labeled_points.js"
export { GridLayer } from "./src/three/layers/occupancy.js"
export { TfFramesLayer } from "./src/three/layers/tf_frames.js"
export { Camera3dLayer } from "./src/three/layers/camera3d.js"
export { checkTf, confirmedIssues, TF_STALE_MS } from "./src/three/tf_check.js"
export { FrameHighlighter } from "./src/three/frame_highlight.js"
export { FRAME_BUDGET_MS, rendering, resolveLook, resolveStyle, splatFallback } from "./src/three/rendering.js"
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
} from "./src/three/cloud_quality.js"
export { Viewer } from "./src/three/viewer.js"
export { STALE_MS, TfTree, WORLD_NAMES } from "./src/three/tf.js"
export { CATCH_UP_SECONDS, PanGate, SmoothFollow } from "./src/three/follow.js"
export {
    DEFAULT_GRADIENT,
    gradientCss,
    GRADIENTS,
    gradientTexture,
    RAMPS,
    sampleGradient,
} from "./src/three/gradients.js"
export {
    applyLook,
    CUBE_SHADES,
    DEFAULT_LOOK,
    focusDistance,
    makePointMaterial,
    POINT_STYLES,
    setClipBox,
    splatBackground,
} from "./src/three/point_material.js"
export { FatLines, pushBox } from "./src/three/lines.js"
export { LabelPool } from "./src/three/labels.js"
export { cssColor, disposeTree, ROBOT_KINDS, robotModel } from "./src/three/robot_model.js"
export { localStore, readLocal, Store, useStore, writeLocal } from "./src/three/store.js"
export * from "./src/camera/depth.js"
export { DEFAULT_DEPTH_LOOK } from "./src/three/layers/camera3d.js"
