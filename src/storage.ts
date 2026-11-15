// MOSS provides a scoped localStorage shim in the sandbox. Keep every access
// guarded so a denied or unavailable storage backend cannot block boot.
export function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Settings still work for the current session when storage is denied.
    }
}
