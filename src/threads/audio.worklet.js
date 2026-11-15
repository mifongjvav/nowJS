/* global AudioWorkletProcessor, registerProcessor, sampleRate, Mixer */
// Mixer is prepended to this self-contained Blob module at build/runtime.
class NowAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.mixer = new Mixer(sampleRate, (id) =>
            this.port.postMessage({ type: "ended", id }),
        );
        this.port.onmessage = ({ data }) => this.mixer.command(data);
        this.port.postMessage({ type: "ready" });
    }
    process(_inputs, outputs) {
        this.mixer.process(outputs[0]);
        return true;
    }
}
registerProcessor("nowjs-thread-mixer", NowAudioProcessor);
