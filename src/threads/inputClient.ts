import { getSettings, onSettingsChange } from "../settings.ts";
import { openWorker, setThreadStatus } from "./status.ts";
import { normalizeInput } from "./normalizeInput.ts";
import type { RawInput } from "./normalizeInput.ts";
import type { NormalInput } from "./simulation.ts";
import { connectInputWorker, disconnectInputWorker } from "./logicClient.ts";
let connection: ReturnType<typeof openWorker> | null = null;
let active = false,
    epoch = 0,
    id = 0,
    generation = 0;
const pending = new Map<
    number,
    { raw: RawInput; receive: (input: NormalInput) => void }
>();
let responseTimer: ReturnType<typeof setTimeout> | null = null;
export function resetThreadInput(): void {
    if (responseTimer !== null) clearTimeout(responseTimer);
    responseTimer = null;
    epoch++;
    pending.clear();
}
export function routeInput(
    raw: RawInput,
    receive: (input: NormalInput) => void,
): void {
    if (!active || !connection) {
        const input = normalizeInput(raw);
        if (input) receive(input);
        return;
    }
    // Bound the bridge queue. Fall back to local preprocessing if the worker
    // cannot keep up; never silently discard key releases.
    if (pending.size >= 256) {
        fail("Input worker queue overflow");
        routeInput(raw, receive);
        return;
    }
    pending.set(++id, { raw, receive });
    if (responseTimer === null)
        responseTimer = setTimeout(
            () => fail("Input worker response timed out"),
            5000,
        );
    connection.worker.postMessage({ id, epoch, raw });
}
function fail(reason: string): void {
    if (responseTimer !== null) clearTimeout(responseTimer);
    responseTimer = null;
    active = false;
    if (connection) disconnectInputWorker(connection.worker);
    connection?.close();
    connection = null;
    for (const { raw, receive } of pending.values()) {
        const input = normalizeInput(raw);
        if (input) receive(input);
    }
    pending.clear();
    setThreadStatus("input", "fallback", reason);
}
async function configure(enabled: boolean): Promise<void> {
    const token = ++generation;
    resetThreadInput();
    active = false;
    if (connection) disconnectInputWorker(connection.worker);
    connection?.close();
    connection = null;
    if (!enabled) {
        setThreadStatus("input", "off");
        return;
    }
    setThreadStatus("input", "starting");
    try {
        const next = openWorker(
            () =>
                new Worker(new URL("./input.worker.ts", import.meta.url), {
                    type: "module",
                }),
            (raw) => {
                const data = raw as {
                    id: number;
                    epoch: number;
                    input: NormalInput | null;
                };
                if (token !== generation || data.epoch !== epoch) return;
                const entry = pending.get(data.id);
                pending.delete(data.id);
                if (!pending.size && responseTimer !== null) {
                    clearTimeout(responseTimer);
                    responseTimer = null;
                }
                if (entry && data.input) entry.receive(data.input);
            },
            (reason) => {
                if (token === generation) fail(reason);
            },
        );
        connection = next;
        await next.ready;
        if (token !== generation) return;
        active = true;
        setThreadStatus("input", "active");
        connectInputWorker(next.worker);
    } catch (error) {
        if (token === generation) fail(String(error));
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
