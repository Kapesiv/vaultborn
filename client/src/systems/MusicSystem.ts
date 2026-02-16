/**
 * Procedural ambient music using Web Audio API
 * - Hub: peaceful fantasy town vibe
 * - Dungeon: dark tense atmosphere
 */
export class MusicSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentTrack: 'hub' | 'dungeon' | 'none' = 'none';
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private intervalIds: ReturnType<typeof setInterval>[] = [];
  private volume = 0.3;
  private _muted = false;
  private savedVolume = 0.3;

  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx!.currentTime, 0.1);
    }
  }

  mute() {
    if (this._muted) return;
    this._muted = true;
    this.savedVolume = this.volume;
    this.setVolume(0);
  }

  unmute() {
    if (!this._muted) return;
    this._muted = false;
    this.setVolume(this.savedVolume);
  }

  isMuted(): boolean {
    return this._muted;
  }

  playHub() {
    if (this.currentTrack === 'hub') return;
    this.stop();
    this.start();
    this.currentTrack = 'hub';
    this.hubMusic();
  }

  playDungeon() {
    if (this.currentTrack === 'dungeon') return;
    this.stop();
    this.start();
    this.currentTrack = 'dungeon';
    this.dungeonMusic();
  }

  stop() {
    this.oscillators.forEach(o => { try { o.stop(); } catch {} });
    this.oscillators = [];
    this.gains = [];
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];
    this.currentTrack = 'none';
  }

  private hubMusic() {
    if (!this.ctx || !this.masterGain) return;

    // Warm pad chord: C major 7 (C3, E3, G3, B3)
    const padNotes = [130.81, 164.81, 196.00, 246.94];
    for (const freq of padNotes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.oscillators.push(osc);
      this.gains.push(gain);

      // Gentle vibrato
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.3 + Math.random() * 0.4;
      lfoGain.gain.value = 1.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      this.oscillators.push(lfo);
    }

    // Melody: pentatonic notes played gently
    const melodyNotes = [
      523.25, 587.33, 659.25, 783.99, 880.00, // C5, D5, E5, G5, A5
      783.99, 659.25, 587.33, 523.25, 440.00,  // descending
    ];
    let noteIdx = 0;

    const playMelodyNote = () => {
      if (!this.ctx || !this.masterGain || this.currentTrack !== 'hub') return;

      const freq = melodyNotes[noteIdx % melodyNotes.length];
      noteIdx++;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 2.0);
    };

    // Play a melody note every 1.5-3 seconds
    const melodyLoop = () => {
      playMelodyNote();
      const nextDelay = 1500 + Math.random() * 1500;
      const id = setTimeout(() => {
        if (this.currentTrack === 'hub') melodyLoop();
      }, nextDelay);
      this.intervalIds.push(id as any);
    };
    melodyLoop();

    // Gentle chime every 4-8 seconds
    const chimeLoop = () => {
      if (!this.ctx || !this.masterGain || this.currentTrack !== 'hub') return;
      const now = this.ctx.currentTime;
      const chimeFreqs = [1046.50, 1318.51, 1567.98]; // C6, E6, G6

      for (let i = 0; i < chimeFreqs.length; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = chimeFreqs[i];
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.04, now + i * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 1.5);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 1.5);
      }

      const nextDelay = 4000 + Math.random() * 4000;
      const id = setTimeout(() => {
        if (this.currentTrack === 'hub') chimeLoop();
      }, nextDelay);
      this.intervalIds.push(id as any);
    };
    setTimeout(() => chimeLoop(), 2000);
  }

  private dungeonMusic() {
    if (!this.ctx || !this.masterGain) return;

    // Dark drone: D minor (D2, A2)
    const droneNotes = [73.42, 110.00];
    for (const freq of droneNotes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0.03;

      // Low-pass filter for dark sound
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 2;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.oscillators.push(osc);
      this.gains.push(gain);

      // Slow pitch wobble
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.1;
      lfoGain.gain.value = 2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      this.oscillators.push(lfo);
    }

    // Tension stings: random dissonant hits
    const stingLoop = () => {
      if (!this.ctx || !this.masterGain || this.currentTrack !== 'dungeon') return;
      const now = this.ctx.currentTime;

      // Minor second interval for tension
      const baseFreq = 200 + Math.random() * 300;
      const notes = [baseFreq, baseFreq * 1.06]; // minor second

      for (const freq of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 1.5);
      }

      const nextDelay = 3000 + Math.random() * 5000;
      const id = setTimeout(() => {
        if (this.currentTrack === 'dungeon') stingLoop();
      }, nextDelay);
      this.intervalIds.push(id as any);
    };
    stingLoop();

    // Heartbeat-like pulse
    const pulseLoop = () => {
      if (!this.ctx || !this.masterGain || this.currentTrack !== 'dungeon') return;
      const now = this.ctx.currentTime;

      for (let i = 0; i < 2; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 50;
        const t = now + i * 0.3;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(i === 0 ? 0.1 : 0.06, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(t);
        osc.stop(t + 0.4);
      }

      const id = setTimeout(() => {
        if (this.currentTrack === 'dungeon') pulseLoop();
      }, 2000);
      this.intervalIds.push(id as any);
    };
    setTimeout(() => pulseLoop(), 1000);
  }
}
