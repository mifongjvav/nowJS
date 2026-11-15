export function describeWorkerError(error) {
    if (
        error &&
        typeof error === "object" &&
        typeof error.message === "string" &&
        error.message
    ) {
        const name = typeof error.name === "string" ? error.name : "";
        return name && name !== "Error"
            ? `${name}: ${error.message}`
            : error.message;
    }
    return error == null ? "Unknown worker error" : String(error);
}

// Install the message receiver BEFORE loading the rendering dependency graph.
// Retain transferred objects, not cloned/reposted MessageEvents. Some sandbox
// loaders hide dependency errors from the parent's ErrorEvent.
export function startWorkerRuntime(load, send) {
    let handler = null,
        failed = false;
    const queued = [];
    const fail = (error, phase = "runtime") => {
        if (failed) return;
        failed = true;
        queued.length = 0;
        send({ type: "error", phase, message: describeWorkerError(error) });
    };
    const dispatch = (event) => {
        if (failed) return;
        if (!handler) {
            queued.push(event.data);
            return;
        }
        Promise.resolve()
            .then(() => handler(event))
            .catch((error) =>
                fail(
                    error,
                    event.data?.type === "init" ? "initialize" : "message",
                ),
            );
    };
    const ready = Promise.resolve()
        .then(() => (failed ? null : load(fail)))
        .then((receive) => {
            if (failed) return;
            handler = receive;
            for (const data of queued.splice(0)) dispatch({ data });
        })
        .catch((error) => fail(error, "load"));
    return { receive: dispatch, fail, ready };
}

// Pixi's own shared/system tickers also call the GLOBAL rAF API. A local
// render-loop fallback alone is insufficient in bootstrap-owned workers.
export function installWorkerFrameClock(scope) {
    const nativeRequest =
        typeof scope.requestAnimationFrame === "function"
            ? scope.requestAnimationFrame.bind(scope)
            : null;
    const nativeCancel =
        typeof scope.cancelAnimationFrame === "function"
            ? scope.cancelAnimationFrame.bind(scope)
            : null;
    const pending = new Map();
    let useNative = Boolean(nativeRequest),
        sequence = 0;
    scope.requestAnimationFrame = (callback) => {
        const token = ++sequence;
        const deliver = (timestamp) => {
            if (!pending.has(token)) return;
            pending.delete(token);
            callback(timestamp);
        };
        pending.set(token, { kind: "pending", id: 0 });
        if (useNative) {
            try {
                const id = nativeRequest(deliver);
                if (pending.has(token))
                    pending.set(token, { kind: "native", id });
                return token;
            } catch {
                useNative = false;
            }
        }
        const id = scope.setTimeout(
            () => deliver(scope.performance.now()),
            1000 / 60,
        );
        if (pending.has(token)) pending.set(token, { kind: "timer", id });
        return token;
    };
    scope.cancelAnimationFrame = (token) => {
        const entry = pending.get(token);
        if (!entry) return;
        pending.delete(token);
        if (entry.kind === "native") nativeCancel?.(entry.id);
        else if (entry.kind === "timer") scope.clearTimeout(entry.id);
    };
}

// A module worker launched via a sandbox/bootstrap (or an older browser) may
// lack an associated Window and throw NotSupportedError from worker rAF.
export function createWorkerFrameScheduler(scope) {
    let useAnimationFrame = typeof scope.requestAnimationFrame === "function";
    return (callback) => {
        if (useAnimationFrame) {
            try {
                return scope.requestAnimationFrame(callback);
            } catch {
                useAnimationFrame = false;
            }
        }
        return scope.setTimeout(callback, 1000 / 60);
    };
}
