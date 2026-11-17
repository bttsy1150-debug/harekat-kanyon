import { WeaponId } from './types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

      // Pre-generate 2 seconds of white noise
      const sr = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sr * 2, sr);
      const ch = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = Math.random() * 2 - 1;
      }
    } catch {
      // Audio unavailable
    }
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public playShot(weapon: WeaponId, distanceAtten = 1) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const atten = Math.max(0.05, Math.min(1, distanceAtten));

    const duration = weapon === 'sniper' ? 0.45 : weapon === 'shotgun' ? 0.34 : weapon === 'rifle' ? 0.2 : 0.16;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      weapon === 'sniper' ? 950 : weapon === 'shotgun' ? 850 : weapon === 'rifle' ? 1650 : 2100,
      t
    );
    filter.frequency.exponentialRampToValueAtTime(weapon === 'sniper' ? 280 : 420, t + duration);
    filter.Q.value = weapon === 'sniper' ? 0.7 : 1.1;

    const gain = this.ctx.createGain();
    const peak = (weapon === 'sniper' ? 0.85 : weapon === 'shotgun' ? 0.75 : weapon === 'rifle' ? 0.52 : 0.44) * atten;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    src.stop(t + duration);

    // Sub-bass punch
    const osc = this.ctx.createOscillator();
    osc.type = weapon === 'sniper' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(weapon === 'sniper' ? 185 : weapon === 'shotgun' ? 150 : 130, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.14);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime((weapon === 'sniper' ? 0.65 : 0.38) * atten, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);

    // Mechanical bolt/pump follow-up
    if (weapon === 'shotgun' && atten > 0.6) {
      this.scheduleClick(t + 0.24, 620, 0.05, 0.12);
      this.scheduleClick(t + 0.34, 780, 0.04, 0.12);
    } else if (weapon === 'sniper' && atten > 0.6) {
      this.scheduleClick(t + 0.45, 920, 0.04, 0.11);
      this.scheduleClick(t + 0.62, 740, 0.05, 0.11);
    }
  }

  private scheduleClick(time: number, freq: number, dur: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  public playHit(headshot: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    if (headshot) {
      // Crisp metallic helmet dink
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1950, t);
      osc.frequency.exponentialRampToValueAtTime(1180, t + 0.11);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.13);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(780, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  public playKill(headshot: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const notes = headshot ? [920, 1380] : [680, 940];
    notes.forEach((f, i) => {
      this.scheduleClick(t + i * 0.055, f, 0.09, 0.14);
    });
  }

  public playReload(weapon: WeaponId) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    this.scheduleClick(t + 0.04, 340, 0.06, 0.15);
    this.scheduleClick(t + (weapon === 'sniper' ? 0.9 : 0.65), 520, 0.07, 0.18);
    this.scheduleClick(t + (weapon === 'sniper' ? 1.45 : 0.95), 760, 0.06, 0.16);
  }

  public playDryFire() {
    if (!this.ctx || !this.masterGain) return;
    this.scheduleClick(this.ctx.currentTime, 1200, 0.03, 0.15);
  }

  public playFootstep(sprinting: boolean, crouching: boolean) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprinting ? 650 : crouching ? 320 : 480;

    const g = this.ctx.createGain();
    const vol = sprinting ? 0.16 : crouching ? 0.05 : 0.1;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t, Math.random() * 0.5, 0.09);
  }

  public playShellClink() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const f = 3200 + Math.random() * 900;
    this.scheduleClick(t, f, 0.025, 0.04);
  }

  public playHurt(armorHit: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = armorHit ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(armorHit ? 310 : 190, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  public playExplosion(distanceAtten = 1) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const atten = Math.max(0.1, Math.min(1, distanceAtten));

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 1.1);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.95 * atten, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t);
    src.stop(t + 1.25);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 0.65);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.85 * atten, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.72);
  }

  public playPickup() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    this.scheduleClick(t, 520, 0.08, 0.16);
    this.scheduleClick(t + 0.07, 780, 0.12, 0.16);
  }

  public playWaveStart() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const master = this.masterGain;
    const t = ctx.currentTime;
    [220, 277.18, 329.63].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t + idx * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.11 + 0.45);
      osc.connect(g);
      g.connect(master);
      osc.start(t + idx * 0.11);
      osc.stop(t + idx * 0.11 + 0.46);
    });
  }

  public playFlashlightClick() {
    if (!this.ctx || !this.masterGain) return;
    this.scheduleClick(this.ctx.currentTime, 1600, 0.025, 0.14);
  }

  public playMeleeSwing() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(980, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t);
    src.stop(t + 0.15);
  }

  public playMeleeHit() {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(175, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }
}
