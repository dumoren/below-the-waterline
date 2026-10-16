// The sea, synthesised: surf and wind above, a muffled pressure drone below,
// sonar pings with echoes, the occasional creak of the berg, and a chime per contact.

export class Sea {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.acc = 0;
    this.nextCreak = 6;
  }

  #noise(seconds, brown) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  #build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    // Shared echo bus for pings and chimes.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(master);
    this.echo = delay;

    // Ambience: brown noise through a lowpass that closes as you go under.
    this.amb = ctx.createBiquadFilter();
    this.amb.type = 'lowpass';
    this.amb.frequency.value = 900;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.3;
    this.#noise(4, true).connect(this.amb).connect(this.ambGain).connect(master);

    // Surf: white noise, band-passed, swelling like waves on ice.
    const surfBp = ctx.createBiquadFilter();
    surfBp.type = 'bandpass';
    surfBp.frequency.value = 700;
    surfBp.Q.value = 0.4;
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellAmt = ctx.createGain();
    swellAmt.gain.value = 0.05;
    swell.connect(swellAmt).connect(this.surfGain.gain);
    swell.start();
    this.#noise(3, false).connect(surfBp).connect(this.surfGain).connect(master);
  }

  async enable() {
    if (!this.ctx) this.#build();
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.3);
  }

  disable() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  update(under, depth, dt) {
    if (!this.on) return;
    this.acc += dt;
    if (this.acc < 0.1) return;
    const now = this.ctx.currentTime;
    this.amb.frequency.setTargetAtTime(under ? 220 - Math.min(120, depth * 0.5) : 1100, now, 0.25);
    this.ambGain.gain.setTargetAtTime(under ? 0.55 : 0.18, now, 0.3);
    this.surfGain.gain.setTargetAtTime(under ? 0 : 0.09, now, 0.3);
    if (under) {
      this.nextCreak -= this.acc;
      if (this.nextCreak < 0) {
        this.creak();
        this.nextCreak = 7 + Math.random() * 10;
      }
    }
    this.acc = 0;
  }

  ping() {
    if (!this.on) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [f, g] of [
      [1480, 0.16],
      [2960, 0.03],
    ]) {
      const o = ctx.createOscillator();
      const e = ctx.createGain();
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(f * 0.985, now + 1.2);
      e.gain.setValueAtTime(0, now);
      e.gain.linearRampToValueAtTime(g, now + 0.005);
      e.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
      o.connect(e);
      e.connect(this.master);
      e.connect(this.echo);
      o.start(now);
      o.stop(now + 1.4);
    }
  }

  chime(i) {
    if (!this.on) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][i % 6];
    [1, 1.5, 2].forEach((m, k) => {
      const o = ctx.createOscillator();
      const e = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = base * m;
      e.gain.setValueAtTime(0, now + k * 0.04);
      e.gain.linearRampToValueAtTime(0.06 / (k + 1), now + k * 0.04 + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      o.connect(e);
      e.connect(this.master);
      e.connect(this.echo);
      o.start(now);
      o.stop(now + 2);
    });
  }

  thunder(strength = 1) {
    if (!this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < samples.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.03) / 1.03;
      samples[i] = brown * 4;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 230;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.65 * strength, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 5);
    source.connect(filter).connect(gain).connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(now);
  }

  creak() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.25);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(320 + Math.random() * 200, now);
    bp.frequency.exponentialRampToValueAtTime(90, now + 1.1);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, now);
    e.gain.linearRampToValueAtTime(0.5, now + 0.15);
    e.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    src.connect(bp).connect(e).connect(this.master);
    e.connect(this.echo);
    src.start(now);
  }
}
