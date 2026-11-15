import { FixedStepClock } from "../fixedStepClock.ts";
import { Simulation } from "./simulation.ts";
import { CATCH_WINDOW_MS } from "../judgement.ts";
const clock = new FixedStepClock();
let simulation: Simulation | null = null;
let session = 0,
    running = false,
    awaitingAudio = false,
    awaitingAck = false,
    lastSent = 0;
const now = () => performance.timeOrigin + performance.now();
let inputPort: MessagePort | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
function startTimer() {
    if (timer === null) timer = setInterval(tick, clock.stepMs);
}
function stopTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
function publish(force = false) {
    if (!simulation || (awaitingAck && !force)) return;
    awaitingAck = true;
    lastSent = now();
    postMessage({
        type: "snapshot",
        session,
        time: simulation.time,
        next: simulation.next,
        playerX: simulation.playerX,
        velocity: simulation.velocity,
        events: simulation.events.splice(0),
        wall: lastSent,
    });
}
const handleMessage = ({ data }: MessageEvent) => {
    if (data.type === "input-port") {
        inputPort?.close();
        inputPort = data.port;
        if (inputPort) inputPort.onmessage = handleMessage;
        return;
    }
    if (data.type === "start") {
        session = data.session;
        simulation = new Simulation(data.config);
        simulation.reset(data.time, data.next, data.playerX, data.active);
        clock.reset(data.wall);
        running = true;
        awaitingAudio = false;
        awaitingAck = false;
        publish(true);
        startTimer();
    } else if (data.session === session) {
        if (data.type === "ack") awaitingAck = false;
        if (data.type === "pause") {
            running = false;
            stopTimer();
            publish(true);
        }
        if (data.type === "resume") {
            clock.reset(data.wall);
            running = true;
            startTimer();
        }
        if (data.type === "audio-start") {
            awaitingAudio = false;
            clock.reset(data.wall);
            startTimer();
        }
        if (data.type === "config" && simulation) {
            if (
                data.config.auto !== undefined &&
                data.config.auto !== simulation.config.auto
            )
                simulation.velocity = 0;
            Object.assign(simulation.config, data.config);
        }
        if (data.type === "input" && simulation && running && !awaitingAudio) {
            const inputTime =
                simulation.time +
                Math.max(
                    -CATCH_WINDOW_MS,
                    Math.min(0, data.input.stamp - now()),
                );
            simulation.input(data.input, inputTime);
            publish();
        }
    }
};
self.onmessage = handleMessage;
function tick() {
    if (!simulation || !running || awaitingAudio) return;
    const wall = now();
    clock.advance(wall, (delta) => {
        if (!simulation) return false;
        if (simulation.time < 0 && simulation.time + delta >= 0) {
            simulation.time = 0;
            awaitingAudio = true;
            stopTimer();
            postMessage({ type: "music-start", session });
            publish(true);
            return false;
        }
        simulation.step(delta);
    });
    if (wall - lastSent >= 1000 / 120) publish();
}
postMessage({ type: "ready" });
