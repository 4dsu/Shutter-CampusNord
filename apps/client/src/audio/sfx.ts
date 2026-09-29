interface ShotSound {
  cutoff: number;
  decay: number;
  gain: number;
  thumpFrom: number;
  thumpTo: number;
  thumpGain: number;
  thumpDecay: number;
}

/** Paràmetres del so de cada arma (mateix ordre que WEAPONS). */
const SHOTS: ShotSound[] = [
  { cutoff: 3600, decay: 0.12, gain: 0.55, thumpFrom: 190, thumpTo: 60, thumpGain: 0.45, thumpDecay: 0.1 },
  { cutoff: 2900, decay: 0.14, gain: 0.6, thumpFrom: 150, thumpTo: 50, thumpGain: 0.55, thumpDecay: 0.12 },
  { cutoff: 1700, decay: 0.34, gain: 0.85, thumpFrom: 110, thumpTo: 34, thumpGain: 0.85, thumpDecay: 0.24 },
];

/**
 * Efectes de so sintetitzats amb WebAudio: no cal descarregar cap fitxer.
 * El context d'àudio només es pot crear després d'un gest de l'usuari (clic per jugar).
 */
export class Sfx {
  volume = 0.6;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Esclat de soroll filtrat amb caiguda exponencial. */
  private burst(type: BiquadFilterType, freq: number, gain: number, decay: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, decay + 0.05);
  }

  private tone(fromHz: number, toHz: number, gain: number, decay: number, type: OscillatorType = "sine", delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(toHz, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  shot(weapon: number): void {
    if (!this.ready) return;
    const s = SHOTS[weapon] ?? SHOTS[0];
    this.burst("lowpass", s.cutoff * (0.9 + Math.random() * 0.2), s.gain, s.decay);
    this.burst("highpass", 5000, s.gain * 0.35, 0.03);
    this.tone(s.thumpFrom, s.thumpTo, s.thumpGain, s.thumpDecay);
  }

  dry(): void {
    if (this.ready) this.burst("highpass", 3000, 0.25, 0.03);
  }

  reload(): void {
    if (!this.ready) return;
    this.burst("bandpass", 1800, 0.35, 0.05);
    this.burst("bandpass", 2400, 0.3, 0.05, 0.35);
  }

  hit(head: boolean): void {
    if (!this.ready) return;
    this.tone(head ? 2100 : 1400, head ? 2300 : 1300, 0.18, 0.06, "triangle");
  }

  kill(): void {
    if (!this.ready) return;
    this.tone(900, 900, 0.18, 0.08, "triangle");
    this.tone(1350, 1350, 0.18, 0.12, "triangle", 0.07);
  }

  step(): void {
    if (this.ready) this.burst("lowpass", 450 + Math.random() * 300, 0.22, 0.08);
  }

  land(speed: number): void {
    if (this.ready) this.burst("lowpass", 320, Math.min(0.6, speed * 0.06), 0.14);
  }
}
