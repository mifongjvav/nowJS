import mixerSource from "./mixer.js?raw";
import processorSource from "./audio.worklet.js?raw";
import { setThreadStatus } from "./status.ts";
export class ThreadAudio {
    constructor() {
        this.node = null;
        this.ready = false;
        this.generation = 0;
        this.ids = new WeakMap();
        this.nextId = 0;
        this.musicId = 0;
        this.complete = null;
        this.onFailure = () => {};
        this.moduleContext = null;
        this.modulePromise = null;
    }
    async configure(enabled, context, destination) {
        const token = ++this.generation;
        this.close();
        if (!enabled) {
            setThreadStatus("audio", "off");
            return;
        }
        setThreadStatus("audio", "starting");
        try {
            if (
                !context?.audioWorklet ||
                typeof AudioWorkletNode !== "function"
            )
                throw new Error(
                    "AudioWorklet unavailable (requires a supported secure context)",
                );
            if (this.moduleContext !== context) {
                this.moduleContext = context;
                this.modulePromise = null;
            }
            if (!this.modulePromise) {
                const url = URL.createObjectURL(
                    new Blob(
                        [
                            mixerSource.replace(
                                "export class Mixer",
                                "class Mixer",
                            ),
                            "\n",
                            processorSource,
                        ],
                        { type: "text/javascript" },
                    ),
                );
                this.modulePromise = context.audioWorklet
                    .addModule(url)
                    .finally(() => URL.revokeObjectURL(url));
                this.modulePromise.catch(() => {
                    this.modulePromise = null;
                });
            }
            await this.modulePromise;
            if (token !== this.generation) return;
            const node = new AudioWorkletNode(context, "nowjs-thread-mixer", {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });
            this.node = node;
            node.port.onmessage = ({ data }) => {
                if (token !== this.generation) return;
                if (data.type === "ready") {
                    this.ready = true;
                    setThreadStatus("audio", "active");
                }
                if (data.type === "ended" && data.id === this.musicId) {
                    const complete = this.complete;
                    this.complete = null;
                    complete?.();
                }
            };
            node.onprocessorerror = () => {
                if (token === this.generation)
                    this.fail("AudioWorklet processor failed");
            };
            node.connect(destination);
        } catch (error) {
            if (token === this.generation) this.fail(String(error));
        }
    }
    fail(reason) {
        this.close();
        setThreadStatus("audio", "fallback", reason);
        this.onFailure();
    }
    close() {
        this.ready = false;
        if (this.node) {
            this.node.port.onmessage = null;
            this.node.port.close();
            this.node.disconnect();
            this.node = null;
        }
        this.ids = new WeakMap();
        this.musicId = 0;
        this.complete = null;
    }
    bufferId(buffer) {
        let id = this.ids.get(buffer);
        if (id) return id;
        id = ++this.nextId;
        this.ids.set(buffer, id);
        const channels = Array.from(
            { length: buffer.numberOfChannels },
            (_, index) => buffer.getChannelData(index).slice(),
        );
        this.node.port.postMessage(
            { type: "buffer", id, rate: buffer.sampleRate, channels },
            channels.map((channel) => channel.buffer),
        );
        return id;
    }
    play(buffer, gain, pan = 0, music = false, start = 0, complete = null) {
        if (!this.ready || !this.node || !buffer) return false;
        if (buffer.numberOfChannels > 2) {
            this.fail("Multichannel audio requires the native audio fallback");
            return false;
        }
        const id = this.bufferId(buffer);
        if (music) {
            if (this.musicId && this.musicId !== id)
                this.node.port.postMessage({ type: "drop", id: this.musicId });
            this.musicId = id;
            this.complete = complete;
        }
        this.node.port.postMessage({
            type: "play",
            id,
            gain,
            pan,
            music,
            start,
        });
        return true;
    }
    command(type) {
        this.node?.port.postMessage({ type });
        if (type === "stopMusic") this.complete = null;
    }
    clear() {
        this.command("clear");
        this.ids = new WeakMap();
        this.musicId = 0;
        this.complete = null;
    }
}
