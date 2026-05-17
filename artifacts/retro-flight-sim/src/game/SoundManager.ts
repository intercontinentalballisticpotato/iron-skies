// IRON SKIES — Procedural Audio Engine
// Engine design: NO swept filters (that's Pac-Man). Tearing = pure distortion mass.

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private engineOscs:      OscillatorNode[]        = [];
  private engineGains:     GainNode[]              = [];
  private engineNoises:    AudioBufferSourceNode[] = [];
  private engineNoiseGains: GainNode[]             = [];
  private engineLFOs:      OscillatorNode[]        = [];
  private engineStarted = false;

  // ── AIM-9 Sidewinder seeker tone nodes ──────────────────────────────────
  private swOsc:    OscillatorNode | null = null;
  private swLFO:    OscillatorNode | null = null;
  private swLFOG:   GainNode | null = null;
  private swGain:   GainNode | null = null;
  private swNoise:  AudioBufferSourceNode | null = null;
  private swNoiseG: GainNode | null = null;
  private swOscNode: OscillatorNode | null = null;
  private swStarted = false;
  private rwrLastPlay = 0;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value      = 5;
      comp.ratio.value     = 5;
      comp.attack.value    = 0.001;
      comp.release.value   = 0.1;
      comp.connect(this.ctx.destination);
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.55;
      this.masterGain.connect(comp);
    }
    return this.ctx;
  }

  private get master(): GainNode { this.getCtx(); return this.masterGain!; }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  private makePink(secs: number): AudioBuffer {
    const ctx = this.getCtx();
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
    }
    return buf;
  }

  private makeWhite(secs: number): AudioBuffer {
    const ctx = this.getCtx();
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Soft overdrive
  private soft(amount: number): Float32Array {
    const c = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i * 2) / 512 - 1;
      c[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return c;
  }

  // Hard clip — adds edge and grit
  private hard(thr = 0.5): Float32Array {
    const c = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i * 2) / 512 - 1;
      c[i] = Math.max(-thr, Math.min(thr, x * 3)) / thr;
    }
    return c;
  }

  // ============================================================
  //  JET ENGINE — built from NOISE + DISTORTION, no swept filters
  //
  //  A — Sub sine 33 Hz (body shake)
  //  B — Growl: 3-way detuned sawtooth chord (55/68/73 Hz)
  //      distorted twice, filtered to sub-1500 Hz
  //  C — Roar: pink noise, +24 dB low-shelf, hard clipped
  //      runs through TWO parallel paths with different LP cuts
  //      so the spectrum has density without any sweeping
  //  D — Texture: white noise through gentle mid bandpass (no LFO!)
  //      pure static distortion, not swept
  //  E — Whine: 3150/3185 Hz fan BPF tones (barely at idle,
  //      growing to a scream at high throttle)
  //  F — Scream: white noise HP 3800 Hz (emerges only at high throttle)
  // ============================================================
  startEngine() {
    if (this.engineStarted) return;
    this.engineStarted = true;
    const ctx = this.getCtx();

    // ── A: Sub bass ───────────────────────────────────────────────────
    const sub = ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 33;
    const subG = ctx.createGain(); subG.gain.value = 0.40;
    sub.connect(subG); subG.connect(this.master); sub.start();
    this.engineOscs.push(sub);   // [0]
    this.engineGains.push(subG); // [0]

    // ── B: Growl chord — 3 detuned saws, double-distorted ─────────────
    [55, 68, 73].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;

      const d1 = ctx.createWaveShaper(); d1.curve = this.soft(800);
      const d2 = ctx.createWaveShaper(); d2.curve = this.hard(0.48);
      const lp  = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.5;

      const g = ctx.createGain(); g.gain.value = 0.40;
      osc.connect(d1); d1.connect(d2); d2.connect(lp); lp.connect(g);
      g.connect(this.master); osc.start();
      this.engineOscs.push(osc);   // [1],[2],[3]
      this.engineGains.push(g);    // [1],[2],[3]
    });

    // ── C: Roar — pink noise through TWO parallel distortion paths ─────
    // Path 1: heavy low-mid crunch (peaks ~300 Hz)
    const roarSrc1 = ctx.createBufferSource();
    roarSrc1.buffer = this.makePink(14); roarSrc1.loop = true;

    const r1shelf = ctx.createBiquadFilter();
    r1shelf.type = 'lowshelf'; r1shelf.frequency.value = 300; r1shelf.gain.value = 24;
    const r1d1 = ctx.createWaveShaper(); r1d1.curve = this.soft(700);
    const r1d2 = ctx.createWaveShaper(); r1d2.curve = this.hard(0.45);
    const r1lp = ctx.createBiquadFilter();
    r1lp.type = 'lowpass'; r1lp.frequency.value = 700; r1lp.Q.value = 0.6;
    const r1g = ctx.createGain(); r1g.gain.value = 0.80;

    roarSrc1.connect(r1shelf); r1shelf.connect(r1d1); r1d1.connect(r1d2);
    r1d2.connect(r1lp); r1lp.connect(r1g); r1g.connect(this.master); roarSrc1.start();
    this.engineNoises.push(roarSrc1);    // [0]
    this.engineNoiseGains.push(r1g);     // [0]

    // Path 2: upper-mid grit (peaks ~900 Hz) — adds density without sweeping
    const roarSrc2 = ctx.createBufferSource();
    roarSrc2.buffer = this.makePink(11); roarSrc2.loop = true;

    const r2bp = ctx.createBiquadFilter();
    r2bp.type = 'bandpass'; r2bp.frequency.value = 900; r2bp.Q.value = 0.5;
    const r2d = ctx.createWaveShaper(); r2d.curve = this.soft(500);
    const r2lp = ctx.createBiquadFilter();
    r2lp.type = 'lowpass'; r2lp.frequency.value = 1800; r2lp.Q.value = 0.5;
    const r2g = ctx.createGain(); r2g.gain.value = 0.45;

    roarSrc2.connect(r2bp); r2bp.connect(r2d); r2d.connect(r2lp); r2lp.connect(r2g);
    r2g.connect(this.master); roarSrc2.start();
    this.engineNoises.push(roarSrc2);    // [1]
    this.engineNoiseGains.push(r2g);     // [1]

    // ── D: Texture — static mid noise (no LFO, no sweeping) ───────────
    const texSrc = ctx.createBufferSource();
    texSrc.buffer = this.makeWhite(9); texSrc.loop = true;

    const texBP = ctx.createBiquadFilter();
    texBP.type = 'bandpass'; texBP.frequency.value = 1600; texBP.Q.value = 1.2;
    const texD = ctx.createWaveShaper(); texD.curve = this.hard(0.4);
    const texG = ctx.createGain(); texG.gain.value = 0.22;

    texSrc.connect(texBP); texBP.connect(texD); texD.connect(texG);
    texG.connect(this.master); texSrc.start();
    this.engineNoises.push(texSrc);      // [2]
    this.engineNoiseGains.push(texG);    // [2]

    // ── E: Turbine whine — real fan BPF at 3150/3185 Hz ───────────────
    [3150, 3185].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 10;
      const g = ctx.createGain(); g.gain.value = 0.04; // barely there at idle
      osc.connect(bp); bp.connect(g); g.connect(this.master); osc.start();
      this.engineOscs.push(osc);   // [4],[5]
      this.engineGains.push(g);    // [4],[5]
    });

    // ── F: Scream — highpass noise, emerges only at high throttle ──────
    const screechSrc = ctx.createBufferSource();
    screechSrc.buffer = this.makeWhite(8); screechSrc.loop = true;

    const screechHP = ctx.createBiquadFilter();
    screechHP.type = 'highpass'; screechHP.frequency.value = 3800;
    const screechG = ctx.createGain(); screechG.gain.value = 0.0; // silent at idle

    screechSrc.connect(screechHP); screechHP.connect(screechG);
    screechG.connect(this.master); screechSrc.start();
    this.engineNoises.push(screechSrc);  // [3]
    this.engineNoiseGains.push(screechG);// [3]

    // ── Very slight whine pitch flutter (subtle, ~10 Hz, small depth) ──
    // This does NOT sound like Pac-Man because: (a) it's only on a sine,
    // (b) the modulation depth is tiny (±18 Hz on a 3150 Hz carrier), and
    // (c) a sine modulator on a tonal carrier sounds like vibrato, not waka
    const whineLFO = ctx.createOscillator();
    whineLFO.type = 'sine'; whineLFO.frequency.value = 10;
    const whineLFOG = ctx.createGain(); whineLFOG.gain.value = 18; // ±18 Hz only
    whineLFO.connect(whineLFOG);
    whineLFOG.connect(this.engineOscs[4].frequency);
    whineLFOG.connect(this.engineOscs[5].frequency);
    whineLFO.start();
    this.engineLFOs.push(whineLFO); // [0]
  }

  setEngineThrottle(t: number) {
    if (!this.ctx || !this.engineStarted) return;
    const now = this.ctx.currentTime;
    const tau = 0.22;

    // A: Sub — swells with power
    this.engineOscs[0].frequency.setTargetAtTime(33 * (1 + t * 0.3), now, tau);
    this.engineGains[0].gain.setTargetAtTime(0.25 + t * 0.35, now, tau);

    // B: Growl chord — pitches up, gets louder
    const gFreqs = [55, 68, 73];
    [1, 2, 3].forEach((i, j) => {
      this.engineOscs[i].frequency.setTargetAtTime(gFreqs[j] * (1 + t * 0.55), now, tau);
      this.engineGains[i].gain.setTargetAtTime(0.22 + t * 0.45, now, tau);
    });

    // C: Roar paths — massively louder at high throttle
    this.engineNoiseGains[0].gain.setTargetAtTime(0.42 + t * 0.85, now, tau);
    this.engineNoiseGains[1].gain.setTargetAtTime(0.22 + t * 0.50, now, tau);

    // D: Texture — grows with throttle
    this.engineNoiseGains[2].gain.setTargetAtTime(0.10 + t * 0.30, now, tau);

    // E: Whine — emerges dramatically with throttle
    // Fan RPM shifts: idle ~2700 Hz, military ~3800 Hz
    const wFreqs = [3150, 3185];
    [4, 5].forEach((i, j) => {
      this.engineOscs[i].frequency.setTargetAtTime(wFreqs[j] * (0.86 + t * 0.34), now, tau);
      this.engineGains[i].gain.setTargetAtTime(0.04 + t * t * 0.30, now, tau); // quadratic onset
    });

    // F: Scream — only at very high throttle
    this.engineNoiseGains[3].gain.setTargetAtTime(Math.pow(Math.max(0, t - 0.5) / 0.5, 2) * 0.28, now, tau);

    // Whine LFO rate (vibrato, not Pac-Man)
    this.engineLFOs[0].frequency.setTargetAtTime(8 + t * 6, now, tau);
  }

  stopEngine() {
    this.engineOscs.forEach(o  => { try { o.stop(); } catch {} });
    this.engineNoises.forEach(n => { try { n.stop(); } catch {} });
    this.engineLFOs.forEach(l  => { try { l.stop(); } catch {} });
    this.engineOscs = []; this.engineGains = [];
    this.engineNoises = []; this.engineNoiseGains = [];
    this.engineLFOs = [];
    this.engineStarted = false;
  }

  // ── CANNON (M61A1 Vulcan — BRRRT) ────────────────────────────────────────
  // 6000 rpm = 100 Hz fundamental tone. Each call = one short burst of that buzz.
  playCannonFire() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Sharp crack — high-frequency transient on each round
    const crack = ctx.createBufferSource(); crack.buffer = this.makeWhite(0.025);
    const crHP = ctx.createBiquadFilter(); crHP.type = 'highpass'; crHP.frequency.value = 5500;
    const crG = ctx.createGain();
    crG.gain.setValueAtTime(1.6, now); crG.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    crack.connect(crHP); crHP.connect(crG); crG.connect(this.master);
    crack.start(now); crack.stop(now + 0.028);

    // 100 Hz buzz — the Vulcan firing rate signature
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth';
    buzz.frequency.value = 100;
    const buzzD = ctx.createWaveShaper(); buzzD.curve = this.hard(0.32);
    const buzzG = ctx.createGain();
    buzzG.gain.setValueAtTime(1.2, now); buzzG.gain.exponentialRampToValueAtTime(0.001, now + 0.034);
    buzz.connect(buzzD); buzzD.connect(buzzG); buzzG.connect(this.master);
    buzz.start(now); buzz.stop(now + 0.038);

    // Body resonance — airframe coupling at ~380 Hz
    const body = ctx.createBufferSource(); body.buffer = this.makeWhite(0.042);
    const bodyBP = ctx.createBiquadFilter(); bodyBP.type = 'bandpass'; bodyBP.frequency.value = 380; bodyBP.Q.value = 1.6;
    const bodyG = ctx.createGain();
    bodyG.gain.setValueAtTime(0.85, now); bodyG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    body.connect(bodyBP); bodyBP.connect(bodyG); bodyG.connect(this.master);
    body.start(now); body.stop(now + 0.045);
  }

  // ── MISSILE ───────────────────────────────────────────────────────────────
  playMissileLaunch() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const bang = ctx.createBufferSource(); bang.buffer = this.makePink(0.12);
    const bangLP = ctx.createBiquadFilter(); bangLP.type='lowpass'; bangLP.frequency.value=500;
    const bangG = ctx.createGain();
    bangG.gain.setValueAtTime(1.2, now); bangG.gain.exponentialRampToValueAtTime(0.001, now+0.11);
    bang.connect(bangLP); bangLP.connect(bangG); bangG.connect(this.master);
    bang.start(now); bang.stop(now+0.14);

    const thud = ctx.createOscillator(); thud.type='sine';
    thud.frequency.setValueAtTime(65, now); thud.frequency.exponentialRampToValueAtTime(16, now+0.14);
    const thudG = ctx.createGain();
    thudG.gain.setValueAtTime(0.75, now); thudG.gain.exponentialRampToValueAtTime(0.001, now+0.14);
    thud.connect(thudG); thudG.connect(this.master); thud.start(now); thud.stop(now+0.16);

    const whoosh = ctx.createBufferSource(); whoosh.buffer = this.makeWhite(0.8);
    const wBP = ctx.createBiquadFilter(); wBP.type='bandpass'; wBP.Q.value=2.5;
    wBP.frequency.setValueAtTime(300, now+0.07);
    wBP.frequency.exponentialRampToValueAtTime(6000, now+0.75);
    const wG = ctx.createGain();
    wG.gain.setValueAtTime(0, now); wG.gain.linearRampToValueAtTime(0.85, now+0.09);
    wG.gain.exponentialRampToValueAtTime(0.001, now+0.8);
    whoosh.connect(wBP); wBP.connect(wG); wG.connect(this.master);
    whoosh.start(now+0.07); whoosh.stop(now+0.85);
  }

  // ── EXPLOSION ─────────────────────────────────────────────────────────────
  playExplosion(large = false) {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const dur = large ? 2.0 : 0.65;

    const crack = ctx.createBufferSource(); crack.buffer = this.makeWhite(0.07);
    const crackHP = ctx.createBiquadFilter(); crackHP.type='highpass'; crackHP.frequency.value=large?200:800;
    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(large?1.3:0.8, now); crackG.gain.exponentialRampToValueAtTime(0.001, now+0.07);
    crack.connect(crackHP); crackHP.connect(crackG); crackG.connect(this.master);
    crack.start(now); crack.stop(now+0.09);

    const rumble = ctx.createBufferSource(); rumble.buffer = this.makePink(dur+0.1);
    const rumbleLP = ctx.createBiquadFilter(); rumbleLP.type='lowpass';
    rumbleLP.frequency.setValueAtTime(large?1600:900, now);
    rumbleLP.frequency.exponentialRampToValueAtTime(40, now+dur*0.9);
    const rumbleG = ctx.createGain();
    rumbleG.gain.setValueAtTime(large?1.1:0.6, now+0.01); rumbleG.gain.exponentialRampToValueAtTime(0.001, now+dur);
    rumble.connect(rumbleLP); rumbleLP.connect(rumbleG); rumbleG.connect(this.master);
    rumble.start(now); rumble.stop(now+dur+0.2);

    const sub = ctx.createOscillator(); sub.type='sine';
    sub.frequency.setValueAtTime(large?48:80, now); sub.frequency.exponentialRampToValueAtTime(14, now+dur*0.5);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(large?0.9:0.4, now); subG.gain.exponentialRampToValueAtTime(0.001, now+dur*0.5);
    sub.connect(subG); subG.connect(this.master); sub.start(now); sub.stop(now+dur*0.6);
  }

  // ── HIT ───────────────────────────────────────────────────────────────────
  playHit() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const metal = ctx.createBufferSource(); metal.buffer = this.makeWhite(0.2);
    const mBP = ctx.createBiquadFilter(); mBP.type='bandpass'; mBP.frequency.value=4200; mBP.Q.value=3;
    const mG = ctx.createGain();
    mG.gain.setValueAtTime(0.85, now); mG.gain.exponentialRampToValueAtTime(0.001, now+0.2);
    metal.connect(mBP); mBP.connect(mG); mG.connect(this.master); metal.start(now); metal.stop(now+0.22);

    const thud = ctx.createOscillator(); thud.type='triangle';
    thud.frequency.setValueAtTime(220, now); thud.frequency.exponentialRampToValueAtTime(38, now+0.11);
    const tG = ctx.createGain();
    tG.gain.setValueAtTime(0.65, now); tG.gain.exponentialRampToValueAtTime(0.001, now+0.12);
    thud.connect(tG); tG.connect(this.master); thud.start(now); thud.stop(now+0.14);

    [0, 0.08, 0.16].forEach((delay, i) => {
      const beep = ctx.createOscillator(); beep.type='square';
      beep.frequency.value = i%2===0 ? 1200 : 700;
      const bG = ctx.createGain();
      bG.gain.setValueAtTime(0, now+delay); bG.gain.linearRampToValueAtTime(0.28, now+delay+0.005);
      bG.gain.exponentialRampToValueAtTime(0.001, now+delay+0.07);
      beep.connect(bG); bG.connect(this.master); beep.start(now+delay); beep.stop(now+delay+0.08);
    });
  }

  // ── MISSION COMPLETE ──────────────────────────────────────────────────────
  playMissionComplete() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    [[523,0],[659,0.18],[784,0.36],[1047,0.54],[784,0.54],[523,0.54]].forEach(([freq,t])=>{
      const osc=ctx.createOscillator(); osc.type='square'; osc.frequency.value=freq;
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,now+t); g.gain.linearRampToValueAtTime(0.2,now+t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,now+t+0.45);
      osc.connect(g); g.connect(this.master); osc.start(now+t); osc.stop(now+t+0.5);
    });
    const cym=ctx.createBufferSource(); cym.buffer=this.makeWhite(0.6);
    const cHP=ctx.createBiquadFilter(); cHP.type='highpass'; cHP.frequency.value=7000;
    const cG=ctx.createGain();
    cG.gain.setValueAtTime(0,now+0.52); cG.gain.linearRampToValueAtTime(0.22,now+0.54);
    cG.gain.exponentialRampToValueAtTime(0.001,now+1.1);
    cym.connect(cHP); cHP.connect(cG); cG.connect(this.master); cym.start(now+0.52); cym.stop(now+1.2);
  }

  // ── GAME OVER ─────────────────────────────────────────────────────────────
  playGameOver() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    [[440,0],[349,0.28],[294,0.56],[220,0.84]].forEach(([freq,t])=>{
      const osc=ctx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=freq;
      const d=ctx.createWaveShaper(); d.curve=this.soft(30);
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,now+t); g.gain.linearRampToValueAtTime(0.22,now+t+0.03);
      g.gain.exponentialRampToValueAtTime(0.001,now+t+0.5);
      osc.connect(d); d.connect(g); g.connect(this.master); osc.start(now+t); osc.stop(now+t+0.55);
    });
    this.playExplosion(false);
  }

  playRadarPing() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const osc=ctx.createOscillator(); osc.type='sine'; osc.frequency.value=1400;
    osc.frequency.exponentialRampToValueAtTime(700, now+0.25);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.15,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.28);
    osc.connect(g); g.connect(this.master); osc.start(now); osc.stop(now+0.3);
  }

  // ── WEAPON MODE SWITCH BEEP ──────────────────────────────────────────────
  // Quick descending two-tone acknowledgement when cycling IR ↔ BVR.
  playModeSwitchBeep() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    [900, 660].forEach((freq, i) => {
      const t = now + i * 0.10;
      const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + 0.08);
    });
  }

  // ── RADAR-GUIDED MISSILE LAUNCH (AIM-120 AMRAAM analog) ──────────────────
  // More clinical, faster, harder than AIM-9: electronic chirp then rocket.
  playRadarMissileLaunch() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Lock-and-fire chirp
    const chirp = ctx.createOscillator(); chirp.type = 'sine';
    chirp.frequency.setValueAtTime(2400, now); chirp.frequency.exponentialRampToValueAtTime(1500, now + 0.055);
    const chirpG = ctx.createGain();
    chirpG.gain.setValueAtTime(0.22, now); chirpG.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    chirp.connect(chirpG); chirpG.connect(this.master); chirp.start(now); chirp.stop(now + 0.07);

    // High-energy rocket motor (faster burn than IR)
    const noise = ctx.createBufferSource(); noise.buffer = this.makeWhite(0.30);
    const noiseLP = ctx.createBiquadFilter(); noiseLP.type = 'lowpass'; noiseLP.frequency.value = 4000;
    const noiseG = ctx.createGain();
    noiseG.gain.setValueAtTime(0, now + 0.02); noiseG.gain.linearRampToValueAtTime(2.0, now + 0.06);
    noiseG.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    noise.connect(noiseLP); noiseLP.connect(noiseG); noiseG.connect(this.master);
    noise.start(now + 0.02); noise.stop(now + 0.32);

    // Motor fundamental
    const motor = ctx.createOscillator(); motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(60, now + 0.03); motor.frequency.exponentialRampToValueAtTime(28, now + 0.28);
    const motorD = ctx.createWaveShaper(); motorD.curve = this.hard(0.5);
    const motorG = ctx.createGain();
    motorG.gain.setValueAtTime(0, now + 0.03); motorG.gain.linearRampToValueAtTime(1.0, now + 0.07);
    motorG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    motor.connect(motorD); motorD.connect(motorG); motorG.connect(this.master);
    motor.start(now + 0.03); motor.stop(now + 0.30);
  }

  // ── RWR DEEDLE-DEEDLE ─────────────────────────────────────────────────────
  // AN/ALR-56M two-tone warning: alternating 1050 / 660 Hz fast pairs.
  playRWRDeedle() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    if (now - this.rwrLastPlay < 0.70) return; // rate-limit
    this.rwrLastPlay = now;
    const toneDur = 0.068;
    for (let i = 0; i < 4; i++) {
      const t0 = now + i * (toneDur * 2 + 0.018);
      [1050, 660].forEach((freq, j) => {
        const t = t0 + j * toneDur;
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.34, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, t + toneDur);
        osc.connect(g); g.connect(this.master);
        osc.start(t); osc.stop(t + toneDur + 0.01);
      });
    }
  }

  // ── AIM-9 SIDEWINDER SEEKER TONE ─────────────────────────────────────────
  // Amplitude-modulated low oscillator — growls like the real seeker head.
  // Searching = soft 22 Hz rattling.  Locked = aggressive 38 Hz, louder.
  startSidewinderTone() {
    if (this.swStarted) return;
    this.swStarted = true;
    const ctx = this.getCtx();

    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 65;
    const hp  = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 22;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0;
    const swG = ctx.createGain(); swG.gain.value = 0;

    const noise = ctx.createBufferSource(); noise.buffer = this.makeWhite(8); noise.loop = true;
    const noiseHP = ctx.createBiquadFilter(); noiseHP.type = 'highpass'; noiseHP.frequency.value = 600;
    const noiseG = ctx.createGain(); noiseG.gain.value = 0;

    osc.connect(hp); hp.connect(swG);
    lfo.connect(lfoG); lfoG.connect(swG.gain);
    noise.connect(noiseHP); noiseHP.connect(swG);
    swG.connect(this.master);

    osc.start(); lfo.start(); noise.start();
    this.swOsc = osc; this.swOscNode = lfo; this.swLFO = lfo; this.swLFOG = lfoG;
    this.swGain = swG; this.swNoise = noise; this.swNoiseG = noiseG;
  }

  setSidewinderLock(locked: boolean, hasMissiles: boolean) {
    if (!this.swStarted || !this.ctx || !this.swGain || !this.swLFO || !this.swLFOG || !this.swOsc) return;
    const now = this.ctx.currentTime;
    const tau = 0.14;
    if (!hasMissiles) {
      this.swGain.gain.setTargetAtTime(0, now, tau);
      this.swLFOG.gain.setTargetAtTime(0, now, tau);
      return;
    }
    if (locked) {
      this.swOsc.frequency.setTargetAtTime(82, now, tau);
      this.swLFO.frequency.setTargetAtTime(38, now, tau);
      this.swGain.gain.setTargetAtTime(0.26, now, tau);
      this.swLFOG.gain.setTargetAtTime(0.28, now, tau);
    } else {
      this.swOsc.frequency.setTargetAtTime(65, now, tau);
      this.swLFO.frequency.setTargetAtTime(22, now, tau);
      this.swGain.gain.setTargetAtTime(0.09, now, tau);
      this.swLFOG.gain.setTargetAtTime(0.11, now, tau);
    }
  }

  stopSidewinderTone() {
    if (!this.swStarted) return;
    this.swStarted = false;
    try { this.swOsc?.stop(); }    catch {}
    try { this.swLFO?.stop(); }    catch {}
    try { this.swNoise?.stop(); }  catch {}
    this.swOsc = null; this.swLFO = null; this.swLFOG = null;
    this.swGain = null; this.swNoise = null; this.swNoiseG = null; this.swOscNode = null;
  }

  // ── AFTERBURNER IGNITION THUMP ────────────────────────────────────────────
  // Low body-felt thump when AB lights at full throttle.
  playAfterburnerLight() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const thump = ctx.createOscillator(); thump.type = 'sine';
    thump.frequency.setValueAtTime(42, now); thump.frequency.exponentialRampToValueAtTime(16, now + 0.35);
    const thG = ctx.createGain();
    thG.gain.setValueAtTime(1.0, now); thG.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    thump.connect(thG); thG.connect(this.master); thump.start(now); thump.stop(now + 0.40);

    const crack = ctx.createBufferSource(); crack.buffer = this.makeWhite(0.06);
    const crHP = ctx.createBiquadFilter(); crHP.type = 'highpass'; crHP.frequency.value = 700;
    const crG = ctx.createGain();
    crG.gain.setValueAtTime(0.9, now); crG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    crack.connect(crHP); crHP.connect(crG); crG.connect(this.master); crack.start(now); crack.stop(now + 0.09);

    const rumble = ctx.createBufferSource(); rumble.buffer = this.makePink(0.55);
    const rLP = ctx.createBiquadFilter(); rLP.type = 'lowpass'; rLP.frequency.value = 180;
    const rG = ctx.createGain();
    rG.gain.setValueAtTime(0, now); rG.gain.linearRampToValueAtTime(0.7, now + 0.05);
    rG.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    rumble.connect(rLP); rLP.connect(rG); rG.connect(this.master); rumble.start(now); rumble.stop(now + 0.58);
  }

  // ── FLARE POP ─────────────────────────────────────────────────────────────
  // Sharp crack of a flare cartridge ejecting from the aircraft.
  playFlarePop() {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const crack = ctx.createBufferSource(); crack.buffer = this.makeWhite(0.04);
    const crHP = ctx.createBiquadFilter(); crHP.type = 'highpass'; crHP.frequency.value = 3500;
    const crG = ctx.createGain();
    crG.gain.setValueAtTime(1.1, now); crG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    crack.connect(crHP); crHP.connect(crG); crG.connect(this.master); crack.start(now); crack.stop(now + 0.05);

    const pop = ctx.createBufferSource(); pop.buffer = this.makeWhite(0.10);
    const popBP = ctx.createBiquadFilter(); popBP.type = 'bandpass'; popBP.frequency.value = 900; popBP.Q.value = 1.5;
    const popG = ctx.createGain();
    popG.gain.setValueAtTime(0.8, now); popG.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    pop.connect(popBP); popBP.connect(popG); popG.connect(this.master); pop.start(now); pop.stop(now + 0.12);

    const whistle = ctx.createOscillator(); whistle.type = 'sine';
    whistle.frequency.setValueAtTime(3200, now + 0.01); whistle.frequency.exponentialRampToValueAtTime(1800, now + 0.20);
    const wG = ctx.createGain();
    wG.gain.setValueAtTime(0, now + 0.01); wG.gain.linearRampToValueAtTime(0.12, now + 0.025);
    wG.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    whistle.connect(wG); wG.connect(this.master); whistle.start(now + 0.01); whistle.stop(now + 0.22);
  }

  // ==========================================================================
  //  MENU AMBIENT MUSIC  — "Blackroom" style
  //  Deep drone + slow evolving pad chords (Am→F→C→G) + sparse melody
  //  Feedback delay network creates spaciousness without convolution reverb
  // ==========================================================================
  private menuNodes:     (OscillatorNode | AudioBufferSourceNode)[] = [];
  private menuGainNodes: GainNode[]   = [];
  private menuMasterG:   GainNode | null = null;
  private menuScheduler: ReturnType<typeof setInterval> | null = null;
  private menuStarted = false;

  playMenuMusic() {
    if (this.menuStarted) return;
    this.menuStarted = true;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Separate gain for menu music so it fades independently of SFX
    const menuMaster = ctx.createGain();
    menuMaster.gain.setValueAtTime(0, now);
    menuMaster.gain.linearRampToValueAtTime(0.55, now + 5); // slow 5s fade-in
    menuMaster.connect(this.master);
    this.menuMasterG = menuMaster;

    // ── Feedback delay — 2 nodes cross-patched for a lush space ──────────
    const dly1 = ctx.createDelay(1.0); dly1.delayTime.value = 0.40;
    const dly2 = ctx.createDelay(1.0); dly2.delayTime.value = 0.55;
    const fbGain = ctx.createGain(); fbGain.gain.value = 0.42;
    const wetGain = ctx.createGain(); wetGain.gain.value = 0.38;
    dly1.connect(dly2); dly2.connect(fbGain);
    fbGain.connect(dly1); fbGain.connect(wetGain);
    wetGain.connect(menuMaster);
    // (dry signal also connects to menuMaster directly below)

    // ── Drone — detuned A1/A2 sine pairs, continuous ──────────────────────
    [55, 55.4, 110, 110.6].forEach((freq, i) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.30 : 0.14;
      osc.connect(g); g.connect(menuMaster); osc.start();
      this.menuNodes.push(osc); this.menuGainNodes.push(g);
    });

    // ── Chord progression: Am → F → C → G  (8 s each = 32 s loop) ────────
    // Each chord: [root, 3rd, 5th, octave] in Hz
    const CHORDS = [
      [110.0, 130.8, 164.8, 220.0],   // Am  A2 C3 E3 A3
      [ 87.3, 110.0, 130.8, 174.6],   // F   F2 A2 C3 F3
      [130.8, 164.8, 196.0, 261.6],   // C   C3 E3 G3 C4
      [ 98.0, 123.5, 146.8, 196.0],   // G   G2 B2 D3 G3
    ];
    const CHORD_DUR = 8.0;

    // A minor pentatonic melody notes (A4–A5 octave range)
    const MELODY = [440, 523.3, 587.3, 659.3, 783.9, 659.3, 523.3, 587.3, 440, 523.3];

    // Create 4 pad oscillators (triangle, stays alive, gets retuned each chord)
    const padOscs: OscillatorNode[] = [];
    const padGains: GainNode[] = [];
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator(); osc.type = 'triangle';
      osc.frequency.value = CHORDS[0][i];
      const g = ctx.createGain(); g.gain.value = 0;
      osc.connect(g);
      g.connect(menuMaster);   // dry
      g.connect(dly1);         // wet reverb send
      osc.start();
      padOscs.push(osc); padGains.push(g);
      this.menuNodes.push(osc); this.menuGainNodes.push(g);
    }

    // Scheduling state (shared via closure, updated each scheduler tick)
    let scheduleUntil = now;
    let chordIdx = 0;
    let melodyIdx = 0;

    const scheduleChord = (t: number, chord: number[]) => {
      const ATK = 2.0; const REL = 2.2;
      chord.forEach((freq, i) => {
        padOscs[i].frequency.setValueAtTime(freq, t);
        padGains[i].gain.cancelScheduledValues(t);
        padGains[i].gain.setValueAtTime(0, t);
        padGains[i].gain.linearRampToValueAtTime(0.10, t + ATK);
        padGains[i].gain.setValueAtTime(0.10, t + CHORD_DUR - REL);
        padGains[i].gain.linearRampToValueAtTime(0, t + CHORD_DUR);
      });
    };

    const scheduleMelodyNote = (t: number, freq: number) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.4);
      g.gain.linearRampToValueAtTime(0, t + 3.2);
      osc.connect(g);
      g.connect(menuMaster);
      g.connect(dly1);
      osc.start(t); osc.stop(t + 3.6);
    };

    // ── DRUMS — 60 BPM, kick + snare only (no hats cluttering the grid) ──
    // Buffers pre-baked once so scheduling has zero allocation overhead.
    const kickClickBuf = this.makeWhite(0.025);
    const snareBuf     = this.makeWhite(0.20);

    // 1 beat = 1s (60 BPM). 4-step bar = 4s. 2 bars = 8s = CHORD_DUR exactly.
    // K . S .  K . S .
    const BEAT = 1.0;
    const DRUM_PATTERN = [
      { kick:1, snare:0 },  // beat 1
      { kick:0, snare:1 },  // beat 2
      { kick:1, snare:0 },  // beat 3
      { kick:0, snare:1 },  // beat 4
    ];

    let nextDrumBeat = now + 0.05; // tiny offset so first hit is never missed
    let drumStep = 0;

    const scheduleKick = (t: number) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(26, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g); g.connect(menuMaster); osc.start(t); osc.stop(t + 0.4);
      const click = ctx.createBufferSource(); click.buffer = kickClickBuf;
      const clickHP = ctx.createBiquadFilter(); clickHP.type='highpass'; clickHP.frequency.value=1800;
      const clickG = ctx.createGain();
      clickG.gain.setValueAtTime(0.5, t); clickG.gain.exponentialRampToValueAtTime(0.001, t+0.02);
      click.connect(clickHP); clickHP.connect(clickG); clickG.connect(menuMaster);
      click.start(t); click.stop(t+0.026);
    };

    const scheduleSnare = (t: number) => {
      const noise = ctx.createBufferSource(); noise.buffer = snareBuf;
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=220; bp.Q.value=0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.001, t+0.16);
      noise.connect(bp); bp.connect(ng); ng.connect(menuMaster);
      noise.start(t); noise.stop(t+0.2);
      const osc = ctx.createOscillator(); osc.type='triangle'; osc.frequency.value=180;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t+0.1);
      osc.connect(og); og.connect(menuMaster); osc.start(t); osc.stop(t+0.12);
    };

    const LOOKAHEAD = 5.0;

    const tick = () => {
      if (!this.menuStarted) return;
      const ct = ctx.currentTime;

      // Schedule chords/melody
      while (scheduleUntil < ct + LOOKAHEAD) {
        scheduleChord(scheduleUntil, CHORDS[chordIdx % CHORDS.length]);
        scheduleMelodyNote(scheduleUntil + 1.2, MELODY[melodyIdx % MELODY.length]);
        scheduleMelodyNote(scheduleUntil + 4.8, MELODY[(melodyIdx + 3) % MELODY.length]);
        melodyIdx += 2;
        chordIdx++;
        scheduleUntil += CHORD_DUR;
      }

      // Schedule drums (independent cursor at beat level)
      while (nextDrumBeat < ct + LOOKAHEAD) {
        const step = DRUM_PATTERN[drumStep % DRUM_PATTERN.length];
        if (step.kick)  scheduleKick(nextDrumBeat);
        if (step.snare) scheduleSnare(nextDrumBeat);
        drumStep++;
        nextDrumBeat += BEAT;
      }
    };

    tick(); // prime immediately
    this.menuScheduler = setInterval(tick, 1000);
  }

  stopMenuMusic() {
    if (!this.menuStarted) return;
    this.menuStarted = false;
    if (this.menuScheduler !== null) { clearInterval(this.menuScheduler); this.menuScheduler = null; }

    // Fade out over 2.5 s then kill nodes
    if (this.menuMasterG && this.ctx) {
      const now = this.ctx.currentTime;
      this.menuMasterG.gain.cancelScheduledValues(now);
      this.menuMasterG.gain.setValueAtTime(this.menuMasterG.gain.value, now);
      this.menuMasterG.gain.linearRampToValueAtTime(0, now + 2.5);
    }
    const nodes = this.menuNodes.slice();
    this.menuNodes = []; this.menuGainNodes = []; this.menuMasterG = null;
    setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch {} }), 3000);
  }

  destroy() { this.stopEngine(); this.stopSidewinderTone(); this.stopMenuMusic(); this.ctx?.close(); this.ctx=null; this.masterGain=null; }
}

export const soundManager = new SoundManager();
