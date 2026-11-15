// MDUI's <mdui-icon src="..."> helper uses XMLHttpRequest to fetch remote SVGs.
// MOSS does not expose XHR or arbitrary network access, and this work only uses
// slotted/@mdui/icons SVGs. This stub keeps the unsupported API out of the ZIP.
export function ajax() {
    return Promise.reject(
        new Error("Remote icon loading is not available in this work."),
    );
}
