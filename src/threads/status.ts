import { describeWorkerError } from "./workerRuntime.js";
export type ThreadName = "logic" | "render" | "audio" | "input";
export type ThreadState = "off" | "starting" | "active" | "fallback";
export interface ThreadStatus {
    state: ThreadState;
    detail: string;
}
const statuses: Record<ThreadName, ThreadStatus> = {
    logic: { state: "off", detail: "" },
    render: { state: "off", detail: "" },
    audio: { state: "off", detail: "" },
    input: { state: "off", detail: "" },
};
const listeners = new Set<() => void>();
export function setThreadStatus(
    name: ThreadName,
    state: ThreadState,
    detail = "",
): void {
    statuses[name] = { state, detail };
    for (const listener of listeners) listener();
}
export function getThreadStatuses(): Readonly<typeof statuses> {
    return statuses;
}
export function onThreadStatus(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// All callers pass a literal Vite Worker constructor. Startup is acknowledged
// by the worker itself, not inferred from successful construction.
export function openWorker(
    create: () => Worker,
    onMessage: (data: unknown) => void,
    onFailure: (reason: string) => void,
    initialize?: (worker: Worker) => void,
): { worker: Worker; ready: Promise<void>; close: () => void } {
    const worker = create();
    let settled = false;
    let closed = false;
    let rejectReady: (reason: Error) => void;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (reason: string) => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        worker.terminate();
        if (!settled) {
            settled = true;
            rejectReady(new Error(reason));
        }
        onFailure(reason);
    };
    const ready = new Promise<void>((resolve, reject) => {
        rejectReady = reject;
        timer = setTimeout(() => fail("Worker startup timed out"), 10000);
        worker.addEventListener("message", (event) => {
            if (closed) return;
            if (event.data?.type === "ready") {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve();
                }
            } else if (event.data?.type === "error")
                fail(
                    `${event.data.phase ? `${event.data.phase}: ` : ""}${String(event.data.message)}`,
                );
            else onMessage(event.data);
        });
        worker.addEventListener("error", (event) => {
            event.preventDefault();
            const message =
                event.message ||
                (event.error
                    ? describeWorkerError(event.error)
                    : "Worker script could not load or execute; check the worker asset, CSP and browser support");
            const location = event.filename
                ? ` (${event.filename}${event.lineno ? `:${event.lineno}:${event.colno || 0}` : ""})`
                : "";
            fail(message + location);
        });
        worker.addEventListener("messageerror", () =>
            fail("Worker message could not be decoded"),
        );
    });
    try {
        initialize?.(worker);
    } catch (error) {
        fail(String(error));
    }
    return {
        worker,
        ready,
        close: () => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            worker.terminate();
            if (!settled) {
                settled = true;
                rejectReady(new Error("Worker startup cancelled"));
            }
        },
    };
}
