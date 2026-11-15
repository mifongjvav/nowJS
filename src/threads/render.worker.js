import {
    startWorkerRuntime,
    installWorkerFrameClock,
} from "./workerRuntime.js";

const runtime = startWorkerRuntime(
    (reportFailure) =>
        import("./renderRuntime.js").then((module) =>
            module.installRenderWorker(reportFailure),
        ),
    (message) => postMessage(message),
);
self.onmessage = runtime.receive;
self.addEventListener("error", (event) => {
    event.preventDefault();
    runtime.fail(
        event.error || event.message || "Render worker execution failed",
        "runtime",
    );
});
self.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    runtime.fail(event.reason, "runtime");
});
try {
    installWorkerFrameClock(self);
} catch (error) {
    runtime.fail(error, "scheduling");
}
