// Every component's CSS, in one string the theme provider puts in the page. Each part is written against Desktop's
// theme tokens only (var(--…)): no color literals, so every skin restyles it.
import { BASE_CSS } from "../styles/base"
import { CONTROLS_CSS } from "../styles/controls"
import { FEEDBACK_CSS } from "../styles/feedback"
import { LAYOUT_CSS } from "../styles/layout"
import { DATA_CSS } from "../styles/data"
import { NAV_CSS } from "../styles/nav"
import { INPUT_DEVICES_CSS } from "../styles/input_devices"
import { SCENE_CSS } from "../styles/scene"
import { TEXT_CSS } from "../styles/text"
import { MEDIA_CSS } from "../styles/media"
import { VIEW_PANEL_CSS } from "../styles/view_panel"

export const COMPONENT_CSS = [
    BASE_CSS,
    CONTROLS_CSS,
    FEEDBACK_CSS,
    LAYOUT_CSS,
    DATA_CSS,
    NAV_CSS,
    INPUT_DEVICES_CSS,
    SCENE_CSS,
    TEXT_CSS,
    MEDIA_CSS,
    VIEW_PANEL_CSS,
].join("\n")
