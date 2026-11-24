// Sound, all synthesised with WebAudio: no audio files, no network. Engine hum,
// sirens, gunshots, pickups and a low-key bassline that starts after the first
// key or click, since browsers only allow audio after a gesture.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;

  /** Bassline notes (Hz) for the cruising loop; one step every 0.22 s. */
  const BASS = [55, 0, 55, 65.41, 0, 55, 49, 55, 0, 82.41, 0, 73.42, 65.41, 0, 49, 0];

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration + 0.02);
    } catch { /* audio is decoration; never break the game */ }
  }

  function noiseBurst(duration, volume, cutoff) {
    if (!ensure() || muted) return;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch { /* audio is decoration */ }
  }

  return {
    unlock() { ensure(); if (context && context.state === 'suspended') context.resume().catch(() => {}); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    shot() { noiseBurst(0.14, 0.5, 1800); },
    enemyShot() { noiseBurst(0.1, 0.22, 1200); },
    crash() { noiseBurst(0.25, 0.5, 500); },
    pickup() { blip(660, 0.12, 'sine', 0.35, 990); blip(990, 0.18, 'sine', 0.25, 1320); },
    coin() { blip(880, 0.1, 'sine', 0.3, 1174); },
    missionStart() { blip(523, 0.14, 'triangle', 0.3); blip(659, 0.14, 'triangle', 0.3); blip(784, 0.26, 'triangle', 0.3); },
    missionDone() {
      blip(523, 0.12, 'triangle', 0.32); blip(659, 0.12, 'triangle', 0.32);
      blip(784, 0.12, 'triangle', 0.32); blip(1046, 0.3, 'triangle', 0.32);
    },
    missionFail() { blip(392, 0.22, 'sawtooth', 0.25, 262); blip(262, 0.4, 'sawtooth', 0.25, 196); },
    busted() { blip(220, 0.3, 'square', 0.2, 110); },
    /** Called every frame: engine pitch follows speed, siren wails when wanted. */
    update(dt, speedRatio, wanted) {
      if (!context) return;
      sirenTimer += dt;
      musicTimer += dt;
      if (engineGain) {
        engineGain.gain.value = muted ? 0 : 0.02 + 0.05 * speedRatio;
        engineOsc.frequency.value = 55 + 130 * speedRatio;
      }
      if (sirenGain) {
        if (wanted > 0 && !muted) {
          sirenGain.gain.value = 0.045;
          sirenOsc.frequency.value = Math.floor(sirenTimer * 2.4) % 2 === 0 ? 715 : 950;
        } else {
          sirenGain.gain.value = 0;
        }
      }
      if (musicTimer >= 0.22) {
        musicTimer = 0;
        const note = BASS[musicStep % BASS.length];
        musicStep += 1;
        if (note > 0) blip(note, 0.2, 'triangle', 0.12);
        if (musicStep % 4 === 2) noiseBurst(0.03, 0.05, 6000);
      }
    },
  };
}
