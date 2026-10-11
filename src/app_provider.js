// <AppProvider>: everything an app needs once, at its root: Desktop's theme (live), the data source (zenoh-gateway
// unless `source` is given), URL state driven by the backend's url events, toasts and confirm/prompt dialogs.
//
//     createRoot(document.getElementById("root")).render(h(AppProvider, null, h(App)))
import { h } from "./h.js"
import { DimThemeProvider } from "./theme/provider.js"
import { DataSourceProvider } from "./data.js"
import { UrlStateProvider } from "./url_state.js"
import { DialogProvider, ToastProvider } from "./components/feedback.js"

/**
 * @param {{ theme?: object, source?: any, url?: object | false, toastPosition?: string, children?: any }} props
 *   `theme`: DimThemeProvider props (skin, corners, themeUrl…); `source`: a data source (memorySource(), …; default:
 *   the page's zenoh-gateway connection); `url`: UrlStateProvider props, or false for none
 */
export function AppProvider({ theme = {}, source, url = {}, toastPosition, children }) {
    let tree = h(DialogProvider, null, h(ToastProvider, { position: toastPosition }, children))
    if (url !== false) {
        tree = h(UrlStateProvider, url, tree)
    }
    if (source) {
        tree = h(DataSourceProvider, { source }, tree)
    }
    return h(DimThemeProvider, theme, tree)
}
