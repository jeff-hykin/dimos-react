// <AppProvider>: everything an app needs once, at its root: Desktop's theme (live), the data source (zenoh-gateway
// unless `source` is given), URL state driven by the backend's url events, toasts and confirm/prompt dialogs.
//
//     createRoot(document.getElementById("root")).render(h(AppProvider, null, h(App)))
import { DimThemeProvider } from "./theme/provider"
import { DataSourceProvider } from "./data"
import { UrlStateProvider } from "./url_state"
import { DialogProvider, ToastProvider } from "./components/feedback"

/**
 * @param {{ theme?: object, source?: any, url?: object | false, toastPosition?: string, children?: any }} props
 *   `theme`: DimThemeProvider props (skin, corners, themeUrl…); `source`: a data source (memorySource(), …; default:
 *   the page's zenoh-gateway connection); `url`: UrlStateProvider props, or false for none
 */
export function AppProvider({
    theme = {},
    source,
    url = {},
    toastPosition,
    children,
}: {
    theme?: object
    source?: any
    url?: object | false
    toastPosition?: string
    children?: any
}) {
    let tree = (
        <DialogProvider>
            <ToastProvider position={toastPosition}>{children}</ToastProvider>
        </DialogProvider>
    )
    if (url !== false) {
        tree = <UrlStateProvider {...url}>{tree}</UrlStateProvider>
    }
    if (source) {
        tree = <DataSourceProvider source={source}>{tree}</DataSourceProvider>
    }
    return <DimThemeProvider {...theme}>{tree}</DimThemeProvider>
}
