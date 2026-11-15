// Shared by the AudioWorklet and deterministic Node tests. No browser globals.
export class Mixer {
    constructor(rate, ended = () => {}) {
        this.rate = rate;
        this.ended = ended;
        this.buffers = new Map();
        this.voices = [];
        this.musicPaused = false;
    }
    command(message) {
        if (message.type === "buffer") this.buffers.set(message.id, message);
        if (message.type === "drop") this.buffers.delete(message.id);
        if (message.type === "clear") {
            this.voices.length = 0;
            this.buffers.clear();
        }
        if (message.type === "stopMusic")
            this.voices = this.voices.filter((v) => !v.music);
        if (message.type === "stopFx")
            this.voices = this.voices.filter((v) => v.music);
        if (message.type === "pauseMusic") this.musicPaused = true;
        if (message.type === "resumeMusic") this.musicPaused = false;
        if (message.type === "play") {
            const buffer = this.buffers.get(message.id);
            if (!buffer?.channels.length) return;
            if (message.music) {
                this.command({ type: "stopMusic" });
                this.musicPaused = false;
            }
            if (this.voices.length >= 128) {
                const index = this.voices.findIndex((v) => !v.music);
                if (index !== -1) this.voices.splice(index, 1);
                else return;
            }
            this.voices.push({
                id: message.id,
                music: Boolean(message.music),
                position: Math.max(0, message.start || 0) * buffer.rate,
                gain: message.gain ?? 1,
                pan: Math.max(-1, Math.min(1, message.pan || 0)),
                buffer,
            });
        }
    }
    process(output) {
        for (const channel of output) channel.fill(0);
        if (!output.length) return;
        for (let v = this.voices.length - 1; v >= 0; v--) {
            const voice = this.voices[v];
            if (voice.music && this.musicPaused) continue;
            const channels = voice.buffer.channels,
                length = channels[0].length;
            const step = voice.buffer.rate / this.rate;
            const mono = channels.length === 1;
            const equalPower = mono && !voice.music;
            const leftGain =
                voice.gain *
                (equalPower
                    ? Math.cos(((voice.pan + 1) * Math.PI) / 4)
                    : Math.min(1, 1 - voice.pan));
            const rightGain =
                voice.gain *
                (equalPower
                    ? Math.sin(((voice.pan + 1) * Math.PI) / 4)
                    : Math.min(1, 1 + voice.pan));
            for (
                let frame = 0;
                frame < output[0].length && voice.position < length;
                frame++
            ) {
                const index = Math.floor(voice.position),
                    next = Math.min(length - 1, index + 1),
                    mix = voice.position - index;
                const left =
                    channels[0][index] * (1 - mix) + channels[0][next] * mix;
                const rightData = channels[1] || channels[0];
                const right =
                    rightData[index] * (1 - mix) + rightData[next] * mix;
                output[0][frame] += left * leftGain;
                if (output[1]) output[1][frame] += right * rightGain;
                voice.position += step;
            }
            if (voice.position >= length) {
                this.voices.splice(v, 1);
                if (voice.music) this.ended(voice.id);
            }
        }
    }
}
