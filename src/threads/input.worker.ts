import { normalizeInput } from "./normalizeInput.ts";
let logicPort: MessagePort | null = null;
let session = 0;
self.onmessage = ({ data }) => {
    if (data.type === "logic-port") {
        logicPort?.close();
        logicPort = data.port;
        return;
    }
    if (data.type === "logic-session") {
        session = data.session;
        return;
    }
    const input = normalizeInput(data.raw);
    if (input && logicPort && session) {
        input.direct = true;
        input.session = session;
        logicPort.postMessage({ type: "input", session, input });
    }
    postMessage({
        id: data.id,
        epoch: data.epoch,
        input,
    });
};
postMessage({ type: "ready" });
