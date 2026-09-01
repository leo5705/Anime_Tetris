/* WebAudio engine: chiptune J-pop loop (royal-road progression F–G–Em–Am) + SFX */

const BPM = 152;
const SPB = 60 / BPM / 4; // duration of one 16th note

// melody: [16th-step, midi, length in 16ths]
const MELODY: Array<[number, number, number]> = [
  [0, 69, 2], [2, 72, 2], [4, 69, 2], [6, 67, 2], [8, 65, 2], [10, 67, 2], [12, 69, 4],
  [16, 71, 2], [18, 74, 2], [20, 71, 2], [22, 69, 2], [24, 67, 2], [26, 69, 2], [28, 71, 4],
  [32, 76, 2], [34, 74, 2], [36, 71, 2], [38, 67, 2], [40, 69, 2], [42, 71, 2], [44, 67, 4],
  [48, 69, 2], [50, 72, 2], [52, 76, 4], [56, 74, 2], [58, 72, 2], [60, 71, 2], [62, 69, 2],
];
const BASS_ROOTS = [41, 43, 40, 45]; // F G E A
const CHORDS = [
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 55, 59], // Em
  [57, 60, 64], // Am
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private leadBus!: GainNode;
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  muted = false;
  /** false, когда играет внешнее радио (YouTube) — чиптюн не стартует */
  musicEnabled = true;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.4;
    this.musicBus.connect(this.master);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.6;
    this.sfxBus.connect(this.master);

    this.leadBus = c.createGain();
    this.leadBus.gain.value = 0.5;
    this.leadBus.connect(this.musicBus);

    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.296;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(this.musicBus);

    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
    }
  }

  /* ---------------- synth helpers ---------------- */
  private tone(o: {
    f: number;
    f2?: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    at?: number;
    attack?: number;
    bus?: GainNode;
    echo?: boolean;
  }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = o.at ?? c.currentTime;
    const osc = c.createOscillator();
    osc.type = o.type ?? "square";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    const g = c.createGain();
    const peak = o.gain ?? 0.15;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(o.bus ?? this.sfxBus);
    if (o.echo) {
      g.connect(this.delay);
      g.connect(this.leadBus);
    }
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noise(o: {
    dur: number;
    gain?: number;
    at?: number;
    hp?: number;
    lp?: number;
    bp?: number;
    bp2?: number;
    bus?: GainNode;
  }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = o.at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    let node: AudioNode = src;
    if (o.hp) {
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = o.hp;
      node.connect(f);
      node = f;
    }
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    if (o.bp) {
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(o.bp, t);
      if (o.bp2) f.frequency.exponentialRampToValueAtTime(o.bp2, t + o.dur);
      f.Q.value = 1.4;
      node.connect(f);
      node = f;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    g.connect(o.bus ?? this.sfxBus);
    src.start(t);
    src.stop(t + o.dur + 0.05);
  }

  private arp(midis: number[], gap: number, type: OscillatorType, gain: number, dur: number, base = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    midis.forEach((m, i) =>
      this.tone({ f: mtof(m + base), dur, type, gain, at: t0 + i * gap, bus: this.sfxBus })
    );
  }

  /* ---------------- music sequencer ---------------- */
  startMusic() {
    this.ensure();
    if (!this.ctx || this.timer || !this.musicEnabled) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule() {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step % 64, this.nextTime);
      this.step++;
      this.nextTime += SPB;
    }
  }

  private playStep(s: number, t: number) {
    // lead
    const mel = MELODY.find((m) => m[0] === s);
    if (mel) {
      this.tone({
        f: mtof(mel[1]),
        dur: mel[2] * SPB * 0.92,
        type: "square",
        gain: 0.14,
        at: t,
        echo: true,
      });
    }
    // bass on 8ths
    if (s % 2 === 0) {
      const bar = Math.floor(s / 16);
      const root = BASS_ROOTS[bar];
      const up = s % 8 === 6;
      this.tone({
        f: mtof(root + (up ? 12 : 0)),
        dur: 0.16,
        type: "triangle",
        gain: 0.3,
        at: t,
        bus: this.musicBus,
      });
    }
    // drums
    if (s % 4 === 0) {
      this.tone({ f: 150, f2: 44, dur: 0.11, type: "sine", gain: 0.5, at: t, bus: this.musicBus });
    }
    if (s % 16 === 4 || s % 16 === 12) {
      this.noise({ dur: 0.09, gain: 0.14, hp: 1700, at: t, bus: this.musicBus });
    }
    if (s % 2 === 0) {
      this.noise({ dur: s % 4 === 2 ? 0.05 : 0.028, gain: s % 4 === 2 ? 0.055 : 0.035, hp: 7500, at: t, bus: this.musicBus });
    }
    if (s % 16 === 14) {
      this.noise({ dur: 0.16, gain: 0.05, hp: 6500, at: t, bus: this.musicBus });
    }
    // pad chord
    if (s % 16 === 0) {
      const bar = Math.floor(s / 16);
      CHORDS[bar].forEach((m) =>
        this.tone({
          f: mtof(m),
          dur: 16 * SPB * 0.95,
          type: "triangle",
          gain: 0.035,
          at: t,
          attack: 0.25,
          bus: this.musicBus,
        })
      );
    }
  }

  /* ---------------- SFX ---------------- */
  move() {
    this.tone({ f: 760, dur: 0.03, gain: 0.07 });
  }
  rotate() {
    this.tone({ f: 520, f2: 860, dur: 0.06, type: "square", gain: 0.09 });
  }
  soft() {
    this.tone({ f: 240, dur: 0.025, gain: 0.05 });
  }
  hard() {
    this.noise({ dur: 0.1, gain: 0.3, lp: 520 });
    this.tone({ f: 140, f2: 52, dur: 0.13, type: "sine", gain: 0.35 });
  }
  lock() {
    this.tone({ f: 330, f2: 190, dur: 0.055, type: "triangle", gain: 0.12 });
  }
  hold() {
    this.noise({ dur: 0.13, gain: 0.14, bp: 700, bp2: 2600 });
  }
  clear(n: number, combo: number) {
    const base = Math.min(Math.max(combo, 0), 7);
    const notes = n >= 4 ? [72, 76, 79, 84, 88, 91] : [72, 76, 79, 84];
    this.arp(notes, n >= 4 ? 0.055 : 0.045, "triangle", 0.16, 0.14, base);
    if (n >= 4) {
      this.noise({ dur: 0.5, gain: 0.1, hp: 5200 });
      this.tone({ f: mtof(96), dur: 0.5, type: "sawtooth", gain: 0.06, attack: 0.02 });
    }
  }
  levelup() {
    this.arp([67, 72, 76, 79, 84], 0.06, "square", 0.12, 0.12);
    this.noise({ dur: 0.3, gain: 0.07, hp: 6000 });
  }
  start() {
    this.arp([60, 64, 67, 72, 76], 0.07, "square", 0.12, 0.14);
  }
  pause() {
    this.tone({ f: 520, f2: 330, dur: 0.14, type: "sine", gain: 0.12 });
  }
  gameover() {
    const t0 = this.ctx ? this.ctx.currentTime : 0;
    [69, 65, 60, 57, 53].forEach((m, i) =>
      this.tone({ f: mtof(m), dur: 0.3, type: "sawtooth", gain: 0.09, at: t0 + i * 0.18 })
    );
    this.tone({ f: mtof(41), f2: mtof(36), dur: 0.9, type: "sawtooth", gain: 0.08, at: t0 + 0.95 });
  }

  /* ---------------- снайпер-тян ---------------- */
  sniperWarn() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 0.18, 0.36].forEach((d, i) =>
      this.tone({ f: 1180 + i * 160, dur: 0.07, type: "square", gain: 0.09, at: t0 + d })
    );
    this.tone({ f: 2300, f2: 320, dur: 0.5, type: "sawtooth", gain: 0.03, at: t0 + 0.4 });
  }
  sniperShot() {
    this.noise({ dur: 0.14, gain: 0.36, lp: 1500 });
    this.noise({ dur: 0.3, gain: 0.15, lp: 420 });
    this.tone({ f: 130, f2: 40, dur: 0.22, type: "sine", gain: 0.38 });
  }
  sniperHit() {
    this.tone({ f: 240, f2: 70, dur: 0.14, type: "square", gain: 0.15 });
    this.noise({ dur: 0.1, gain: 0.18, bp: 900, bp2: 300 });
  }
  sniperMiss() {
    this.noise({ dur: 0.22, gain: 0.07, bp: 3400, bp2: 700 });
  }
}

export const audio = new AudioEngine();
