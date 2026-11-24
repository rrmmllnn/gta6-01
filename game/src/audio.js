// Synthesised sound for Solmar Bay: no audio files, everything is built
// with the Web Audio API. Engine hum, sirens, gunfire, pickups and a small
// bass-driven music loop. The context is created lazily on the first user
// gesture (or the first explicit unlock call); in screenshot mode, where no
// gesture ever happens, every method simply does nothing.
export function makeAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx || typeof window === 'undefined' || !window.AudioContext) return false;
    try {
      ctx = new window.AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 110;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.4;
      engineOsc.connect(engFilter);
      engineOsc2.connect(osc2Gain);
      osc2Gain.connect(engFilter);
      engFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, duration, type, volume, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // A minor-key bass line that steps on its own clock: Am, F, C, G.
  const bassLine = [110, 110, 130.81, 110, 87.31, 87.31, 98, 87.31, 130.81, 130.81, 146.83, 130.81, 98, 98, 110, 98];

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    setEngine(speed01, on) {
      if (!ctx || muted) return;
      const target = on ? 0.05 + speed01 * 0.11 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 52 + speed01 * 105;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 2.01, ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!ctx || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    updateSiren(dt) {
      if (!ctx || !sirenOsc) return;
      sirenPhase += dt;
      const f = 700 + 260 * Math.sin(sirenPhase * 4.4);
      sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    },
    shot() {
      noiseBurst(0.14, 0.5, 2400);
      tone(160, 0.1, 'sine', 0.35);
    },
    enemyShot() {
      noiseBurst(0.1, 0.18, 1800);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.3);
      tone(990, 0.18, 'sine', 0.3, 0.09);
    },
    token() {
      tone(880, 0.12, 'triangle', 0.3);
      tone(1174, 0.14, 'triangle', 0.3, 0.08);
      tone(1568, 0.22, 'triangle', 0.28, 0.16);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, i * 0.11));
    },
    busted() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.2, i * 0.16));
    },
    click() {
      tone(1200, 0.05, 'square', 0.15);
    },
    crash() {
      noiseBurst(0.25, 0.4, 900);
    },
    updateMusic(dt, playing) {
      if (!ctx || muted || !playing) return;
      musicTimer += dt;
      const stepLen = 60 / 112 / 2;
      while (musicTimer >= stepLen) {
        musicTimer -= stepLen;
        const note = bassLine[musicStep % bassLine.length];
        tone(note, stepLen * 1.8, 'triangle', 0.16);
        if (musicStep % 4 === 2) noiseBurst(0.03, 0.05, 6000);
        musicStep++;
      }
    },
    get ready() {
      return started;
    },
  };
}
