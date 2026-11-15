import { getSettings, onSettingsChange } from "../settings.ts";
import { openWorker, setThreadStatus } from "./status.ts";
import type { SimConfig, SimEvent, NormalInput } from "./simulation.ts";
export interface LogicSnapshot {
    type: "snapshot";
    session: number;
    time: number;
    next: number;
    playerX: number;
    velocity: number;
    wall: number;
    events: SimEvent[];
}
let connection: ReturnType<typeof openWorker> | null = null;
let generation = 0,
    session = 0;
let lastReceipt = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;
let inputWorker: Worker | null = null;
export function connectInputWorker(worker: Worker): void {
    inputWorker = worker;
    if (!connection || !logicThread.ready) return;
    let channel: MessageChannel | undefined;
    try {
        channel = new MessageChannel();
        connection.worker.postMessage(
            { type: "input-port", port: channel.port1 },
            [channel.port1],
        );
        worker.postMessage({ type: "logic-port", port: channel.port2 }, [
            channel.port2,
        ]);
        worker.postMessage({
            type: "logic-session",
            session: logicThread.running ? session : 0,
        });
    } catch (error) {
        // Workers may be available while MessagePort transfer is restricted.
        // Keep preprocessing in its worker and forward results through main.
        channel?.port1.close();
        channel?.port2.close();
        connection.worker.postMessage({ type: "input-port", port: null });
        worker.postMessage({ type: "logic-port", port: null });
        setThreadStatus(
            "input",
            "active",
            `Direct channel unavailable; using main-thread forwarding: ${String(error)}`,
        );
    }
}
export function disconnectInputWorker(worker: Worker): void {
    if (inputWorker === worker) inputWorker = null;
}
let receive: (snapshot: LogicSnapshot) => void = () => {};
let musicStart: () => void = () => {};
export const logicThread = {
    ready: false,
    running: false,
    listen(snapshot: typeof receive, audio: typeof musicStart) {
        receive = snapshot;
        musicStart = audio;
    },
    start(
        config: SimConfig,
        time: number,
        next: number,
        playerX: number,
        active: [number, boolean][],
    ) {
        if (!connection || !this.ready) return;
        lastReceipt = performance.now();
        this.running = true;
        connection.worker.postMessage({
            type: "start",
            session: ++session,
            config,
            time,
            next,
            playerX,
            active,
            wall: performance.timeOrigin + performance.now(),
        });
        inputWorker?.postMessage({ type: "logic-session", session });
    },
    stop() {
        connection?.worker.postMessage({ type: "pause", session });
        session++;
        this.running = false;
        inputWorker?.postMessage({ type: "logic-session", session: 0 });
    },
    configure(config: Partial<SimConfig>) {
        connection?.worker.postMessage({ type: "config", session, config });
    },
};
export function sendLogicInput(input: NormalInput): boolean {
    if (!logicThread.ready || !logicThread.running || !connection) return false;
    if (input.direct && input.session === session) return true;
    connection.worker.postMessage({ type: "input", session, input });
    return true;
}
async function configure(enabled: boolean): Promise<void> {
    const token = ++generation;
    logicThread.stop();
    logicThread.ready = false;
    connection?.close();
    if (watchdog !== null) clearInterval(watchdog);
    watchdog = null;
    connection = null;
    if (!enabled) {
        setThreadStatus("logic", "off");
        return;
    }
    setThreadStatus("logic", "starting");
    try {
        const next = openWorker(
            () =>
                new Worker(new URL("./logic.worker.ts", import.meta.url), {
                    type: "module",
                }),
            (raw) => {
                const data = raw as LogicSnapshot;
                if (
                    token !== generation ||
                    data.session !== session ||
                    !logicThread.running
                )
                    return;
                if (data.type === "snapshot") {
                    lastReceipt = performance.now();
                    receive(data);
                    connection?.worker.postMessage({ type: "ack", session });
                } else if ((raw as { type: string }).type === "music-start") {
                    musicStart();
                    connection?.worker.postMessage({
                        type: "audio-start",
                        session,
                        wall: performance.timeOrigin + performance.now(),
                    });
                }
            },
            (reason) => {
                if (token !== generation) return;
                logicThread.ready = false;
                logicThread.stop();
                if (watchdog !== null) clearInterval(watchdog);
                watchdog = null;
                setThreadStatus("logic", "fallback", reason);
            },
        );
        connection = next;
        await next.ready;
        if (token !== generation) return;
        logicThread.ready = true;
        if (inputWorker) connectInputWorker(inputWorker);
        setThreadStatus("logic", "active");
        watchdog = setInterval(() => {
            if (!logicThread.running || performance.now() - lastReceipt < 5000)
                return;
            logicThread.ready = false;
            logicThread.stop();
            connection?.close();
            if (watchdog !== null) clearInterval(watchdog);
            watchdog = null;
            setThreadStatus(
                "logic",
                "fallback",
                "Logic worker response timed out",
            );
        }, 1000);
    } catch (error) {
        if (token === generation)
            setThreadStatus("logic", "fallback", String(error));
    }
}
let enabled = getSettings().multithreading;
onSettingsChange((settings) => {
    if (enabled !== settings.multithreading) {
        enabled = settings.multithreading;
        void configure(enabled);
    }
});
void configure(enabled);
