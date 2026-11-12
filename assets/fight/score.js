// The fight's music and extra sound, all made in the browser with Web Audio (no sound files), like assets/sfx.js.
//
//   start(formId)   a form has begun fighting ('watcher', 'player2', 'author'): its theme fades in, the last one fades out
//   stinger(name)   'parry' | 'stagger' | 'riposte' | 'phase' | 'death' | 'victory' | 'revive'
//   intensity(k)    0..1, how hard things are going; brings in the theme's upper layers (it also builds a little by itself)
//   stop()          the fight is over, or was left
//
// Sound effects for the forms and the visitor, all safe to call at any time (before sound is unlocked, while muted,
// hundreds of times a minute: each one has a minimum gap and there is a cap on how many play at once):
//   swing('light' | 'heavy'), clang(), flesh(), parry(), guard(), roll(), heal(), stomp(size), stab(), whirr(seconds),
//   ping(), scrape(seconds), crash(size), pageFlutter(amount), inkBeam(seconds), tileCrack(), tileFall(), wingBeat(),
//   skyEye(), titleHit(), glint(), fire(), orb()
//
// It plays through the page's sound (sfx.audio()), so the sound toggle and the hidden-tab pause apply to it as well.
// Each theme is a small sequencer: a grid of steps (sixteenth notes) scheduled a third of a second ahead, a chord
// progression, and four layers. Layer 0 always plays; layers 1-3 fade in as intensity rises.

const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const LAYER_AT = [0, 0.3, 0.55, 0.8];        // the intensity at which each layer comes in

// Sung vowels: three formant peaks (Hz) and how loud each is
const VOWEL = {
    ah: { f: [800, 1150, 2900], a: [1, 0.5, 0.22] },
    oh: { f: [450, 800, 2830], a: [1, 0.55, 0.18] },
    oo: { f: [325, 700, 2530], a: [1, 0.4, 0.12] },
};

// ── The three themes ──
// prog: one chord per bar. r is the bass note, q the chord's third above it (3 minor, 4 major), c a voicing (MIDI notes).

// THE WATCHER: D minor, 72 a minute, 4/4. Low strings, a war drum on one and three, a bell tolling every other bar.
const W_MEL = [   // the high strings' lament, per bar: [step, note, length in steps]
    [[0, 69, 16]], [[0, 70, 8], [8, 69, 8]], [[0, 67, 16]], [[0, 64, 8], [8, 73, 8]],
    [[0, 74, 16]], [[0, 70, 8], [8, 67, 8]], [[0, 70, 8], [8, 69, 8]], [[0, 73, 8], [8, 69, 8]],
];
const W_OST = [0, 12, 7, 12, 0, 12, -1, 7];   // the cellos' eighth-note figure over the bass (-1 = the chord's third)
const WATCHER = {
    bpm: 72, gain: 0.7, div: 4, spb: 16, wet: 0.5, key: 38,
    prog: [
        { r: 38, q: 3, c: [50, 53, 57] }, { r: 34, q: 4, c: [50, 53, 58] }, { r: 31, q: 3, c: [50, 55, 58] }, { r: 33, q: 4, c: [49, 52, 57] },
        { r: 38, q: 3, c: [50, 53, 57] }, { r: 39, q: 4, c: [51, 55, 58] }, { r: 31, q: 3, c: [50, 55, 58] }, { r: 33, q: 4, c: [49, 52, 57] },
    ],
    pads: [
        { l: 0, n: 5, cut: 620, vol: 0.05, det: 8, notes: ch => [ch.r, ch.r + 12, ...ch.c] },          // basses and cellos, bowed long
        { l: 3, n: 3, formant: 'oh', vol: 0.3, det: 6, vib: 6, notes: ch => ch.c.map(m => m - 12) },   // a low choir when it is enraged
    ],
    play(I, t, bar, pos, ch, on, s) {
        if (pos === 0) I.drum(0, t, 0.48, 50, 1.1);
        if (pos === 8) I.drum(0, t, 0.3, 56, 0.7);
        if (pos % 4 === 0) I.bow(0, t, ch.r + 12, s * 1.3, pos === 0 ? 0.07 : 0.045, 800, 0.006);
        if (pos === 0 && bar % 2 === 0) I.bell(0, t, 62, 0.09, 1);
        if (on[1]) {
            if (pos % 2 === 0) { const iv = W_OST[pos >> 1]; I.bow(1, t, ch.r + 12 + (iv < 0 ? ch.q + 12 : iv), s * 1.4, 0.045, 1500, 0.004); }
            if (pos === 14 || (pos === 6 && bar % 2)) I.drum(1, t, 0.26, 62, 0.4);
        }
        if (on[2]) {
            for (const [p, m, l] of W_MEL[bar % 8]) if (p === pos) I.bow(2, t, m, s * l * 0.95, 0.04, 2600, 0.4, 1);
            if (bar % 4 === 3 && pos >= 12) I.drum(2, t, 0.2 + (pos - 12) * 0.045, 95 - (pos - 12) * 9, 0.28);
        }
        if (on[3]) {
            if (pos === 0) I.brass(3, t, [ch.r + 12, ch.r + 19, ch.r + 24], s * 5, 0.04, 0.04);
            if (pos === 10) I.brass(3, t, [ch.r + 12, ch.r + 19], s * 2, 0.038, 0.02);
            if (pos === 3 || pos === 6 || pos === 11) I.drum(3, t, 0.24, 54, 0.5);
        }
    },
};

// THE PLAYER: E minor, 140 a minute, 4/4. Chugging strings, taiko on a 3+3+2 kick, a clatter of ticks, and under it all
// a square-wave arpeggio, as if an old console were being crushed. After its revival it plays faster and a step higher.
const P_MEL = [[79, 78], [76, 71], [72, 76], [74, 78], [79, 81], [83, 79], [77, 76], [75, 78]];
const P_CHUG = new Set([0, 2, 3, 4, 6, 8, 10, 11, 12, 14]);
const P_ARP = [0, 1, 2, 3, 4, 5, 4, 3];
const PLAYER = {
    bpm: 140, gain: 1, div: 4, spb: 16, wet: 0.22, key: 40,
    prog: [
        { r: 40, q: 3, c: [52, 55, 59] }, { r: 40, q: 3, c: [52, 55, 59] }, { r: 36, q: 4, c: [52, 55, 60] }, { r: 38, q: 4, c: [50, 54, 57] },
        { r: 40, q: 3, c: [52, 55, 59] }, { r: 40, q: 3, c: [52, 55, 59] }, { r: 41, q: 4, c: [53, 57, 60] }, { r: 35, q: 4, c: [51, 54, 59] },
    ],
    pads: [
        { l: 0, n: 3, cut: 480, vol: 0.04, det: 9, notes: ch => [ch.r, ch.r + 12, ch.c[1]] },
    ],
    play(I, t, bar, pos, ch, on, s) {
        if (P_CHUG.has(pos)) I.bow(0, t, ch.r + 12, s * 0.75, pos % 4 === 0 ? 0.07 : 0.045, 1000, 0.003);
        if (pos === 0 || pos === 6 || pos === 10 || (pos === 14 && bar % 2)) I.drum(0, t, pos === 0 ? 0.55 : 0.38, 56, 0.32);
        I.tick(0, t, (pos % 2 ? 0.012 : 0.022) + Math.random() * 0.014);
        if (Math.random() < 0.08) I.tick(0, t + s * 0.5, 0.018);
        if (on[1]) {
            if (pos === 4 || pos === 12) I.snare(1, t, 0.18);
            const k = P_ARP[pos % 8];
            I.chip(1, t, ch.c[k % 3] + 12 * (1 + ((k / 3) | 0)), s * 0.85, 0.018);
        }
        if (on[2]) {
            if (pos === 0 || pos === 6 || pos === 12) I.brass(2, t, [ch.r + 12, ch.r + 19, ch.r + 24], s * 1.5, 0.045, 0.01);
            if (bar % 4 === 3 && pos >= 12) I.drum(2, t, 0.26, 130 - (pos - 12) * 18, 0.2);
        }
        if (on[3]) {
            if (pos === 0 || pos === 8) I.bow(3, t, P_MEL[bar % 8][pos >> 3], s * 7.6, 0.035, 3200, 0.05, 2);
            if (pos === 4 || pos === 8 || pos === 12) I.drum(3, t, 0.3, 60, 0.25);
            if (pos % 2) I.tick(3, t, 0.018);
        }
    },
};

// THE AUTHOR: B minor, a slow 6/8 (46 dotted crotchets a minute). A choir of formant-filtered saws and high strings,
// a harp-like arpeggio for the pulse, soft timpani; at full force brass, war drums and a soaring line on top.
const A_CELLO = [[50, 49], [47, 50], [45, 54], [52, 49], [47, 50], [55, 54], [52, 55], [54, 49]];
const A_MEL = [[78, 74], [79, 78], [81, 78], [76, 73], [74, 78], [83, 81], [79, 76], [78, 73]];
const timpNote = r => 40 + (((r - 40) % 12) + 12) % 12;
const AUTHOR = {
    bpm: 46, gain: 0.7, div: 6, spb: 12, wet: 0.62, key: 35,
    prog: [
        { r: 35, c: [54, 59, 62, 66] }, { r: 43, c: [55, 59, 62, 67] }, { r: 38, c: [54, 57, 62, 66] }, { r: 45, c: [52, 57, 61, 64] },
        { r: 35, c: [54, 59, 62, 66] }, { r: 43, c: [55, 59, 62, 67] }, { r: 40, c: [55, 59, 64, 67] }, { r: 42, c: [54, 58, 61, 66] },
    ],
    pads: [
        { l: 0, n: 4, formant: 'ah', vol: 0.2, det: 7, vib: 7, notes: ch => ch.c },                      // the choir
        { l: 0, n: 2, cut: 4000, vol: 0.016, det: 6, vib: 9, notes: ch => [ch.c[3] + 12, ch.c[2] + 12] },  // high strings
        { l: 1, n: 2, cut: 500, vol: 0.04, det: 8, notes: ch => [ch.r, ch.r + 12] },                       // basses
        { l: 2, n: 2, cut: 5000, vol: 0.014, det: 5, vib: 10, notes: ch => [ch.c[3] + 24, ch.c[1] + 24] }, // the highest strings
    ],
    play(I, t, bar, pos, ch, on, s) {
        const c = ch.c;
        if (pos % 2 === 0) { const i = pos >> 1; I.pluck(0, t, [ch.r + 24, c[1] + 12, c[2] + 12, c[3] + 12, c[2] + 12, c[1] + 12][i], i === 0 ? 0.06 : 0.042); }
        if (pos === 0) I.timp(0, t, timpNote(ch.r), 0.22);
        if (on[1] && (pos === 0 || pos === 6)) I.bow(1, t, A_CELLO[bar % 8][pos / 6], s * 5.8, 0.045, 1300, 0.45, 1);
        if (on[2]) {
            if (pos === 6) I.timp(2, t, timpNote(ch.r), 0.18);
            if (bar % 4 === 3 && pos >= 8) I.timp(2, t, timpNote(ch.r), 0.07 + (pos - 8) * 0.045);
            if (pos === 3 || pos === 9) I.glint(2, t, c[3] + 24, 0.026);
        }
        if (on[3]) {
            if (pos === 0) I.brass(3, t, [ch.r + 12, c[1], c[2]], s * 11, 0.03, 0.7);
            if (pos === 0 || pos === 6) { I.bow(3, t, A_MEL[bar % 8][pos / 6], s * 5.8, 0.04, 3600, 0.3, 1); I.drum(3, t, 0.3, 48, 1.0); }
            if (pos === 10 || pos === 11) I.drum(3, t, 0.22, 70, 0.3);
        }
    },
};

const THEMES = { watcher: WATCHER, player2: PLAYER, author: AUTHOR };

// Two seconds of white noise, for a context that does not have one yet (offline renders)
function makeNoise(ac) {
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
}

// ═════════════ The engine: everything that makes sound, built on one context ═════════════
// `offline` is for the tests below, which render into an OfflineAudioContext with their own clock.
function engine(ac, dest, noise, offline = false) {
    let clock = null;
    const now = () => (clock !== null ? clock : ac.currentTime);
    const sr = ac.sampleRate, nyq = sr * 0.45;
    const stats = { voices: 0, nodes: 0, log: null };
    let muted = false;
    const ready = () => !muted && (offline || ac.state === 'running');

    // ── Output: a soft ceiling, so however much plays at once the score never goes past about -3 dB ──
    // Clean up to 0.45, then it bends smoothly toward 0.7. (The waveshaper reads -1..1, so the signal is halved going in.)
    const pre = ac.createGain(), ceil = ac.createWaveShaper();
    pre.gain.value = 0.5;
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 4 - 2, a = Math.abs(x);
        curve[i] = Math.sign(x) * (a < 0.45 ? a : 0.45 + 0.25 * Math.tanh((a - 0.45) / 0.25));
    }
    ceil.curve = curve;
    if (offline === 'raw') pre.gain.value = 1, pre.connect(dest);      // tests only: no ceiling
    else pre.connect(ceil).connect(dest);
    const music = ac.createGain(), fxBus = ac.createGain();
    music.gain.value = 0.75;
    music.connect(pre); fxBus.connect(pre);

    // One shared hall: a dark, decaying burst of noise as the impulse, normalised to unit energy
    const verbIn = ac.createGain(), verb = ac.createConvolver(), verbOut = ac.createGain();
    {
        const n = Math.floor(sr * 2.6), b = ac.createBuffer(2, n, sr);
        for (let c = 0; c < 2; c++) {
            const d = b.getChannelData(c);
            let lp = 0, e2 = 0;
            for (let i = 0; i < n; i++) {
                lp += (Math.random() * 2 - 1 - lp) * 0.35;
                d[i] = i < sr * 0.012 ? 0 : lp * Math.pow(1 - i / n, 3);
                e2 += d[i] * d[i];
            }
            const k = 1 / Math.sqrt(e2);
            for (let i = 0; i < n; i++) d[i] *= k;
        }
        verb.normalize = false;
        verb.buffer = b;
    }
    verbOut.gain.value = 0.55;
    verbIn.connect(verb).connect(verbOut).connect(pre);

    // ── Voices: every sound is a voice, a gain that its parts feed. When its last source stops, the voice lets go of
    // its whole chain (disconnects), so nothing piles up. stats counts what is alive. ──
    function voice(bus, wet = 0) {
        const g = ac.createGain();
        g.connect(bus);
        const v = { g, n: 1, live: 0, end: 0, t0: now() };
        if (wet > 0) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); v.n++; }
        stats.voices++; stats.nodes += v.n;
        if (stats.log) stats.log.push(v);
        return v;
    }
    const own = (v, node) => { v.n++; stats.nodes++; return node; };
    function gn(v, val = 1) { const g = own(v, ac.createGain()); g.gain.value = val; return g; }
    function bq(v, type, f, q = 0.7) { const b = own(v, ac.createBiquadFilter()); b.type = type; b.frequency.value = Math.min(f, nyq); b.Q.value = q; return b; }
    function osc(v, type, f) { const o = own(v, ac.createOscillator()); o.type = type; o.frequency.value = Math.min(f, nyq); return o; }
    function nz(v) { const s = own(v, ac.createBufferSource()); s.buffer = noise; s.loop = true; return s; }
    // Start a source at t and stop it at end; the voice is released after its last one stops
    function play(v, s, t, end) {
        v.live++;
        if (end > v.end) v.end = end;
        s.onended = () => { if (--v.live === 0) { v.g.disconnect(); stats.voices--; stats.nodes -= v.n; } };
        if (s.buffer) s.start(t, Math.random() * 1.5); else s.start(t);
        s.stop(end);
    }
    // Shapes for a gain: a strike that dies away, or a held note that is let go
    function strike(p, t, peak, a, d) {
        p.setValueAtTime(0.0001, t);
        p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
        p.exponentialRampToValueAtTime(0.0001, t + a + d);
        return t + a + d + 0.02;
    }
    function held(p, t, peak, a, len, r) {
        const off = t + Math.max(a, len);
        p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(peak, t + a);
        p.setValueAtTime(peak, off);
        p.setTargetAtTime(0, off, r / 4);
        return off + r * 1.3;
    }
    // Stop an automation where it is now, so a new ramp can start from there
    function hold(p, t) {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
        else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
    }
    function sweep(p, t, a, b, dur) { p.setValueAtTime(Math.min(a, nyq), t); p.exponentialRampToValueAtTime(Math.min(b, nyq), t + dur); }

    // ═════════════ Instruments (each makes one note into `dest`) ═════════════

    // Bowed strings: two detuned saws through a lowpass. mode 1 adds vibrato, mode 2 a fast tremolo.
    // Short notes are over before a second detuned saw would be heard, so they get one saw at a bit more volume.
    function bow(dest, t, m, len, vol, cut, att, mode = 0) {
        const pair = len >= 0.25 ? [-7, 7] : [0];
        const v = voice(dest), f = mf(m), lp = bq(v, 'lowpass', cut, 0.5);
        const end = held(v.g.gain, t, pair.length === 1 ? vol * 1.6 : vol, att, len, Math.min(0.35, Math.max(0.05, len * 0.4)));
        if (mode === 2) {
            const tg = gn(v, 0.55), lfo = osc(v, 'square', 12), d = gn(v, 0.45);
            lfo.connect(d).connect(tg.gain);
            lp.connect(tg).connect(v.g);
            play(v, lfo, t, end);
        } else lp.connect(v.g);
        let vib = null;
        if (mode === 1) { const lfo = osc(v, 'sine', 5.1); vib = gn(v, 11); lfo.connect(vib); play(v, lfo, t, end); }
        for (const dt of pair) {
            const o = osc(v, 'sawtooth', f);
            o.detune.value = dt;
            if (vib) vib.connect(o.detune);
            o.connect(lp);
            play(v, o, t, end);
        }
    }
    // A big drum: a sine that falls in pitch, and a thump of noise
    function drum(dest, t, vol, f0, decay) {
        const v = voice(dest), o = osc(v, 'sine', f0), og = gn(v, 0), s = nz(v), lp = bq(v, 'lowpass', 700), sg = gn(v, 0);
        o.frequency.setValueAtTime(f0 * 2.2, t);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.04);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + decay);
        const end = strike(og.gain, t, vol, 0.004, decay);
        strike(sg.gain, t, vol * 0.45, 0.002, 0.12);
        o.connect(og).connect(v.g);
        s.connect(lp).connect(sg).connect(v.g);
        play(v, o, t, end);
        play(v, s, t, t + 0.16);
    }
    // Timpani: a tuned drum with a few overtones that ring
    function timp(dest, t, m, vol) {
        const v = voice(dest), f = mf(m);
        let end = t;
        [[1, 1, 1.7], [1.5, 0.35, 1.1], [2, 0.22, 0.8]].forEach(([r, a, d]) => {
            const o = osc(v, 'sine', f * r), g = gn(v, 0);
            o.frequency.setValueAtTime(f * r * 1.03, t);
            o.frequency.exponentialRampToValueAtTime(f * r, t + 0.06);
            end = Math.max(end, strike(g.gain, t, vol * a, 0.004, d));
            o.connect(g).connect(v.g);
            play(v, o, t, t + d + 0.03);
        });
        const s = nz(v), lp = bq(v, 'lowpass', 400), g = gn(v, 0);
        strike(g.gain, t, vol * 0.5, 0.002, 0.07);
        s.connect(lp).connect(g).connect(v.g);
        play(v, s, t, t + 0.1);
    }
    function snare(dest, t, vol) {
        const v = voice(dest), s = nz(v), bp = bq(v, 'bandpass', 1900, 0.8), sg = gn(v, 0), o = osc(v, 'triangle', 185), og = gn(v, 0);
        strike(sg.gain, t, vol, 0.002, 0.16);
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        strike(og.gain, t, vol * 0.6, 0.002, 0.08);
        s.connect(bp).connect(sg).connect(v.g);
        o.connect(og).connect(v.g);
        play(v, s, t, t + 0.2);
        play(v, o, t, t + 0.12);
    }
    // A dry metallic tick: the clatter
    function tick(dest, t, vol) {
        const v = voice(dest), s = nz(v), bp = bq(v, 'bandpass', 7000 + Math.random() * 2500, 1.4);
        strike(v.g.gain, t, vol, 0.001, 0.03);
        s.connect(bp).connect(v.g);
        play(v, s, t, t + 0.05);
    }
    // A tolling bell: inharmonic partials (hum, prime, minor tierce, quint, nominal...) that each fade at their own rate
    const BELL = [[0.5, 0.5, 6], [1, 1, 4.5], [1.19, 0.6, 3], [1.5, 0.35, 2.5], [2, 0.55, 2.2], [2.74, 0.25, 1.4], [3.76, 0.15, 0.9]];
    function bell(dest, t, m, vol, dk = 1) {
        const v = voice(dest), f = mf(m);
        for (const [r, a, d] of BELL) {
            if (f * r > nyq) continue;
            const o = osc(v, 'sine', f * r), g = gn(v, 0);
            strike(g.gain, t, vol * a, 0.003, d * dk);
            o.connect(g).connect(v.g);
            play(v, o, t, t + d * dk + 0.05);
        }
    }
    // Brass: saws through a lowpass that opens as the note swells
    function brass(dest, t, ms, len, vol, att) {
        const v = voice(dest), lp = bq(v, 'lowpass', 250, 1.2);
        const end = held(v.g.gain, t, vol, att, len, 0.18);
        lp.frequency.setValueAtTime(250, t);
        lp.frequency.exponentialRampToValueAtTime(2400, t + att + 0.08);
        lp.frequency.setTargetAtTime(1300, t + att + 0.08, 0.3);
        lp.connect(v.g);
        for (const m of ms) for (const dt of [-5, 5]) {
            const o = osc(v, 'sawtooth', mf(m));
            o.detune.value = dt;
            o.connect(lp);
            play(v, o, t, end);
        }
    }
    function chip(dest, t, m, len, vol) {
        const v = voice(dest), o = osc(v, 'square', mf(m));
        const end = strike(v.g.gain, t, vol, 0.002, len);
        o.connect(v.g);
        play(v, o, t, end);
    }
    // A harp-like pluck
    function pluck(dest, t, m, vol) {
        const v = voice(dest), f = mf(m), lp = bq(v, 'lowpass', 2600), a = osc(v, 'triangle', f), b = osc(v, 'sine', f * 2), bg = gn(v, 0.3);
        const end = strike(v.g.gain, t, vol, 0.003, 1.4);
        a.connect(lp); b.connect(bg).connect(lp); lp.connect(v.g);
        play(v, a, t, end); play(v, b, t, end);
    }
    // A celesta glint
    function glint(dest, t, m, vol) {
        const v = voice(dest), f = mf(m), a = osc(v, 'sine', f), b = osc(v, 'sine', f * 4.2), bg = gn(v, 0.2);
        const end = strike(v.g.gain, t, vol, 0.002, 1.2);
        a.connect(v.g); b.connect(bg).connect(v.g);
        play(v, a, t, end); play(v, b, t, t + 0.4);
    }

    // A pad that holds for a whole theme: n voices of two saws, through a lowpass or a bank of vowel formants.
    // It belongs to the theme's voice `tv`, so it is released with the theme.
    function pad(tv, dest, P, t) {
        const g = gn(tv, 0);
        g.connect(dest);
        let into, bank = null;
        if (P.formant) {
            into = gn(tv, 1);
            const V = VOWEL[P.formant];
            bank = V.f.map((f, i) => {
                const b = bq(tv, 'bandpass', f, f / 90), bg = gn(tv, V.a[i]);
                into.connect(b).connect(bg).connect(g);
                return { b, bg };
            });
        } else { into = bq(tv, 'lowpass', P.cut, 0.5); into.connect(g); }
        let vib = null;
        const oscs = [], srcs = [];
        if (P.vib) { const lfo = osc(tv, 'sine', 4.7); vib = gn(tv, P.vib); lfo.connect(vib); play(tv, lfo, t, t + 3600); srcs.push(lfo); }
        for (let i = 0; i < P.n; i++) for (const d of [-P.det, P.det]) {
            const o = osc(tv, 'sawtooth', 110);
            o.detune.value = d;
            if (vib) vib.connect(o.detune);
            o.connect(into);
            play(tv, o, t, t + 3600);
            oscs.push(o); srcs.push(o);
        }
        return {
            P, oscs,
            chord(ms, t, first) {
                for (let i = 0; i < oscs.length; i++) {
                    const f = Math.min(mf(ms[(i >> 1) % ms.length]), nyq);
                    if (first) oscs[i].frequency.setValueAtTime(f, t); else oscs[i].frequency.setTargetAtTime(f, t, 0.06);
                }
            },
            // Each bar the pad swells in and eases back, like a long bow stroke
            swell(t, bar) {
                g.gain.setTargetAtTime(P.vol, t, bar * 0.12);
                g.gain.setTargetAtTime(P.vol * 0.6, t + bar * 0.55, bar * 0.2);
            },
            vowel(name, t) {
                if (!bank) return;
                const V = VOWEL[name];
                bank.forEach(({ b, bg }, i) => { b.frequency.setTargetAtTime(V.f[i], t, 0.4); b.Q.setTargetAtTime(V.f[i] / 90, t, 0.4); bg.gain.setTargetAtTime(V.a[i], t, 0.4); });
            },
            bend(cents, t, tc) { for (const o of oscs) o.detune.setTargetAtTime(o.detune.value + cents, t, tc); },
            unbend(t) { for (let i = 0; i < oscs.length; i++) { hold(oscs[i].detune, t); oscs[i].detune.setTargetAtTime(i % 2 ? P.det : -P.det, t, 0.04); } },
            stop(t) { for (const o of srcs) o.stop(t); },
        };
    }

    // ═════════════ Themes ═════════════
    let cur = null;               // the theme playing now
    let lastKey = 38;             // its key, for stingers when nothing is playing

    function theme(id, fadeIn) {
        const D = THEMES[id], t = now() + 0.05;
        const v = voice(music, D.wet);
        v.g.gain.setValueAtTime(0, t);
        v.g.gain.setTargetAtTime(D.gain, t, fadeIn / 3);
        const th = { id, D, v, L: [], lv: [1, 0, 0, 0], step: 0, next: t + 0.05, k: 0, t0: t, tempo: 1, trans: 0, boost: 0, gone: false };
        for (let i = 0; i < 4; i++) { const g = gn(v, i === 0 ? 1 : 0); g.connect(v.g); th.L.push(g); }
        th.pads = D.pads.map(P => pad(v, th.L[P.l], P, t));
        const T = m => m + th.trans, L = l => th.L[l];
        th.I = {
            bow: (l, t, m, len, vol, cut, att, mode) => bow(L(l), t, T(m), len, vol, cut, att, mode),
            drum: (l, t, vol, f0, d) => drum(L(l), t, vol, f0, d),
            timp: (l, t, m, vol) => timp(L(l), t, T(m), vol),
            snare: (l, t, vol) => snare(L(l), t, vol),
            tick: (l, t, vol) => tick(L(l), t, vol),
            bell: (l, t, m, vol, dk) => bell(L(l), t, T(m), vol, dk),
            brass: (l, t, ms, len, vol, att) => brass(L(l), t, ms.map(T), len, vol, att),
            chip: (l, t, m, len, vol) => chip(L(l), t, T(m), len, vol),
            pluck: (l, t, m, vol) => pluck(L(l), t, T(m), vol),
            glint: (l, t, m, vol) => glint(L(l), t, T(m), vol),
        };
        lastKey = D.key;
        return th;
    }
    const stepLen = th => 60 / (th.D.bpm * th.tempo) / th.D.div;
    const key = () => (cur ? cur.D.key + cur.trans : lastKey);

    // One step of the grid: new chord on the bar, then whatever the theme plays on this step
    function step(th, t) {
        const D = th.D, s = stepLen(th), pos = th.step % D.spb, bar = Math.floor(th.step / D.spb);
        const ch = D.prog[bar % D.prog.length];
        if (pos === 0) {
            for (const p of th.pads) {
                p.chord(p.P.notes(ch).map(m => m + th.trans), t, th.step === 0 && !th.started);
                p.swell(t, s * D.spb);
                if (p.P.formant) p.vowel(bar % 2 ? 'oh' : p.P.formant, t);
            }
            th.started = true;
        }
        if (!muted) D.play(th.I, t, bar, pos, ch, th.lv.map(x => x > 0.01), s);
    }
    // How hard the theme plays: what the fight asked for, or a slow build of its own, whichever is more
    function level(th, instant) {
        const t = now(), e = clamp01(Math.max(th.k, Math.min(0.5, (t - th.t0) / 120)) + th.boost);
        for (let i = 1; i < 4; i++) {
            const want = smooth(LAYER_AT[i] - 0.1, LAYER_AT[i] + 0.05, e);
            if (Math.abs(want - th.lv[i]) < 0.01) continue;
            th.lv[i] = want;
            if (instant) th.L[i].gain.setValueAtTime(want, t);
            else th.L[i].gain.setTargetAtTime(want, t, 1.2);
        }
    }
    function retire(th, sec) {
        if (!th || th.gone) return;
        th.gone = true;
        const t = now(), g = th.v.g.gain;
        hold(g, t);
        g.setTargetAtTime(0, t, sec / 5);
        for (const p of th.pads) p.stop(t + sec + 0.1);
        th.v.end = t + sec + 0.1;
        if (cur === th) cur = null;
    }
    // Schedule everything due before `horizon`
    function tick_(horizon) {
        const th = cur;
        if (!th) return;
        level(th);
        const t = now();
        if (th.next < t - 0.25) { th.next = t + 0.02; }     // fell behind (a long stall): pick up from now
        let guard = 0;
        while (th.next < horizon && guard++ < 64) {
            step(th, th.next);
            th.next += stepLen(th);
            th.step++;
        }
    }
    function start(id, fadeIn = 2.2) {
        if (!THEMES[id]) return;
        if (cur && cur.id === id) return;
        retire(cur, 2.5);
        cur = theme(id, fadeIn);
    }
    function stop(sec = 2.5) { retire(cur, sec); }
    function intensity(k, instant) {
        if (!cur) return;
        cur.k = clamp01(+k || 0);
        level(cur, instant);
    }

    // ═════════════ Stingers ═════════════
    function stinger(name) {
        const t = now() + 0.01, k = key();
        // What a stinger does to the theme happens even while muted or hidden; only its sound is skipped
        if (!ready()) {
            if (name === 'phase' || name === 'victory') retire(cur, 1);
            else if (name === 'death' && cur) { cur.next = t + 3.9; cur.step = 0; }
            else if (name === 'revive' && cur) { cur.tempo *= 1.12; cur.trans += 1; cur.boost = Math.min(0.4, cur.boost + 0.25); }
            return;
        }
        if (name === 'parry') {
            if (!gate('st-parry', 0.12)) return;
            bell(music, t, k + 36, 0.07, 0.3);
            glint(music, t + 0.01, k + 43, 0.05);
        } else if (name === 'stagger') {
            if (!gate('st-stagger', 0.5)) return;
            drum(music, t, 0.8, 42, 1.3);
            // a rising swell: noise and a chord that climb and open, then let go
            const v = voice(music, 0.3), s = nz(v), bp = bq(v, 'bandpass', 300, 1.2), lp = bq(v, 'lowpass', 300, 0.7);
            sweep(bp.frequency, t, 300, 3500, 1.3);
            sweep(lp.frequency, t, 300, 3000, 1.3);
            v.g.gain.setValueAtTime(0.0001, t);
            v.g.gain.exponentialRampToValueAtTime(0.16, t + 1.3);
            v.g.gain.setTargetAtTime(0, t + 1.3, 0.05);
            s.connect(bp).connect(v.g);
            lp.connect(v.g);
            for (const m of [k + 12, k + 19, k + 24]) {
                const o = osc(v, 'sawtooth', mf(m)), og = gn(v, 0.22);
                o.detune.setValueAtTime(0, t);
                o.detune.linearRampToValueAtTime(200, t + 1.3);
                o.connect(og).connect(lp);
                play(v, o, t, t + 1.6);
            }
            play(v, s, t, t + 1.6);
        } else if (name === 'riposte') {
            if (!gate('st-riposte', 0.4)) return;
            brass(music, t, [k + 12, k + 19, k + 24, k + 27], 0.45, 0.08, 0.01);
            bow(music, t, k + 24, 0.3, 0.06, 3000, 0.005);
            drum(music, t, 0.8, 46, 1.0);
            snare(music, t, 0.3);
            bell(music, t + 0.02, k + 36, 0.05, 0.6);
        } else if (name === 'phase') {
            // brass that swells for two and a half seconds and is cut off into silence; the hall rings on
            if (!gate('st-phase', 1.5)) return;
            retire(cur, 2.2);
            brass(music, t, [k + 12, k + 19, k + 24, k + 27, k + 31], 2.4, 0.07, 2.3);
            const v = voice(music, 0.4), o = osc(v, 'sine', mf(k));
            held(v.g.gain, t, 0.22, 2.3, 2.4, 0.08);
            o.connect(v.g);
            play(v, o, t, t + 2.6);
        } else if (name === 'death') {
            // everything drops away to one low note; the theme comes back as the visitor gets up (core waits 3.8 s)
            if (!gate('st-death', 2)) return;
            if (cur) {
                const g = cur.v.g.gain;
                hold(g, t);
                g.setTargetAtTime(0, t, 0.05);
                g.setTargetAtTime(cur.D.gain, t + 3.9, 0.8);
                cur.next = t + 3.9;
                cur.step = 0;
            }
            bow(music, t + 0.05, k + 12, 3.2, 0.11, 600, 0.25, 1);
            drum(music, t + 0.05, 0.35, 40, 1.6);
        } else if (name === 'victory') {
            // the minor key resolves to major, quietly
            if (!gate('st-victory', 3)) return;
            retire(cur, 1.5);
            const m = k + 12 + (k + 12 < 47 ? 12 : 0);
            [m, m + 7, m + 12, m + 16, m + 19].forEach((n, i) => bow(music, t + 0.4 + i * 0.12, n, 5.5, 0.03, 2600, 2.2, 1));
            bell(music, t + 0.4, m + 24, 0.05, 1.2);
            pluck(music, t + 0.4, m + 12, 0.05);
        } else if (name === 'revive') {
            // the music stumbles (pitch sags, a console powering down, two drum hits out of time), then comes back
            // faster and a step higher
            if (!gate('st-revive', 2)) return;
            const whine = voice(music, 0.2), o = osc(whine, 'square', 880), lp = bq(whine, 'lowpass', 2400);
            sweep(o.frequency, t, 880, 40, 1.0);
            strike(whine.g.gain, t, 0.05, 0.01, 1.0);
            o.connect(lp).connect(whine.g);
            play(whine, o, t, t + 1.1);
            drum(music, t + 0.28, 0.5, 52, 0.4);
            drum(music, t + 0.71, 0.38, 48, 0.6);
            if (cur) {
                const th = cur, g = th.v.g.gain;
                hold(g, t);
                g.setTargetAtTime(0, t + 0.1, 0.25);
                for (const p of th.pads) p.bend(-1200, t, 0.35);
                const back = t + 1.7;
                g.setTargetAtTime(th.D.gain, back, 0.04);
                for (const p of th.pads) p.unbend(back);
                th.next = back; th.step = 0;
                th.tempo *= 1.12; th.trans += 1; th.boost = Math.min(0.4, th.boost + 0.25);
                brass(music, back, [k + 13, k + 20, k + 25], 0.4, 0.07, 0.01);
                drum(music, back, 0.75, 50, 0.8);
            }
        }
    }

    // ═════════════ Sound effects ═════════════
    // Each has a minimum gap between plays, and at most CAP effects sound at once (counted by when they end).
    const CAP = 28, lastT = {}, ends = [];
    function gate(name, gap) {
        if (!ready()) return false;
        const t = now();
        if (t - (lastT[name] ?? -1e9) < gap) return false;
        for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= t) ends.splice(i, 1);
        if (ends.length >= CAP && !name.startsWith('st-')) return false;      // stingers are never dropped
        lastT[name] = t;
        return true;
    }
    const fxv = (wet, len) => { ends.push(now() + len); return voice(fxBus, wet); };
    const R = (a, b) => a + Math.random() * (b - a);

    const fx = {
        // The visitor's sword cutting air: light is quick and bright, heavy slower with a low push
        swing(kind = 'light') {
            const heavy = kind === 'heavy';
            if (!gate('swing', heavy ? 0.12 : 0.06)) return;
            const t = now(), dur = heavy ? 0.34 : 0.19, vol = heavy ? 0.24 : 0.16;
            const v = fxv(0.08, dur), s = nz(v), bp = bq(v, 'bandpass', 500, heavy ? 1.4 : 2);
            bp.frequency.setValueAtTime(heavy ? 250 : 500, t);
            bp.frequency.exponentialRampToValueAtTime((heavy ? 1500 : 3000) * R(0.9, 1.1), t + dur * 0.55);
            bp.frequency.exponentialRampToValueAtTime(heavy ? 400 : 900, t + dur);
            v.g.gain.setValueAtTime(0.0001, t);
            v.g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
            v.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            s.connect(bp).connect(v.g);
            if (heavy) {
                const o = osc(v, 'sine', 140), og = gn(v, 0.6);
                sweep(o.frequency, t, 140, 55, dur);
                o.connect(og).connect(v.g);
                play(v, o, t, t + dur + 0.02);
            }
            play(v, s, t, t + dur + 0.02);
        },
        // Sword on the beast's shell: a short, damped metal clang
        clang() {
            if (!gate('clang', 0.05)) return;
            const t = now(), v = fxv(0.18, 0.4), f0 = 420 * R(0.92, 1.08);
            [[1, 0.5, 0.35], [2.41, 0.32, 0.22], [3.93, 0.22, 0.15], [5.6, 0.12, 0.08]].forEach(([r, a, d]) => {
                const o = osc(v, 'sine', f0 * r), g = gn(v, 0);
                strike(g.gain, t, a * 0.3, 0.001, d);
                o.connect(g).connect(v.g);
                play(v, o, t, t + d + 0.03);
            });
            const s = nz(v), hp = bq(v, 'highpass', 2500), g = gn(v, 0);
            strike(g.gain, t, 0.22, 0.001, 0.03);
            s.connect(hp).connect(g).connect(v.g);
            play(v, s, t, t + 0.05);
        },
        // Sword into flesh or dark: a thud and a hiss
        flesh() {
            if (!gate('flesh', 0.05)) return;
            const t = now(), v = fxv(0.05, 0.3), o = osc(v, 'sine', 120), og = gn(v, 0), s = nz(v), bp = bq(v, 'bandpass', 2200, 0.9), sg = gn(v, 0);
            sweep(o.frequency, t, 120, 45, 0.14);
            strike(og.gain, t, 0.32, 0.003, 0.16);
            sweep(bp.frequency, t, 2200, 700, 0.25);
            strike(sg.gain, t, 0.13, 0.004, 0.26);
            o.connect(og).connect(v.g);
            s.connect(bp).connect(sg).connect(v.g);
            play(v, o, t, t + 0.2);
            play(v, s, t, t + 0.3);
        },
        // Steel meeting steel on a parry: a bright ring
        parry() {
            if (!gate('parry', 0.08)) return;
            const t = now(), v = fxv(0.35, 1.2), f0 = 1180 * R(0.97, 1.03);
            [[1, 0.4, 1.2], [2, 0.2, 0.8], [2.76, 0.25, 0.6], [4.07, 0.12, 0.35], [5.4, 0.08, 0.2]].forEach(([r, a, d]) => {
                const o = osc(v, 'sine', f0 * r), g = gn(v, 0);
                strike(g.gain, t, a * 0.3, 0.001, d);
                o.connect(g).connect(v.g);
                play(v, o, t, t + d + 0.03);
            });
            const s = nz(v), hp = bq(v, 'highpass', 3000), g = gn(v, 0);
            strike(g.gain, t, 0.28, 0.001, 0.02);
            s.connect(hp).connect(g).connect(v.g);
            play(v, s, t, t + 0.04);
        },
        // A blow taken on the guard: a dull knock
        guard() {
            if (!gate('guard', 0.06)) return;
            const t = now(), v = fxv(0.06, 0.15), o = osc(v, 'sine', 170), og = gn(v, 0), s = nz(v), lp = bq(v, 'lowpass', 1100), sg = gn(v, 0);
            sweep(o.frequency, t, 170, 95, 0.08);
            strike(og.gain, t, 0.3, 0.002, 0.12);
            strike(sg.gain, t, 0.12, 0.002, 0.07);
            o.connect(og).connect(v.g);
            s.connect(lp).connect(sg).connect(v.g);
            play(v, o, t, t + 0.15);
            play(v, s, t, t + 0.1);
        },
        // A roll: a rush of cloth, then a scuff on the stone
        roll() {
            if (!gate('roll', 0.15)) return;
            const t = now(), v = fxv(0, 0.45), a = nz(v), bp = bq(v, 'bandpass', 900, 0.6), ag = gn(v, 0), b = nz(v), lp = bq(v, 'lowpass', 500), bg = gn(v, 0);
            strike(ag.gain, t, 0.07, 0.08, 0.3);
            strike(bg.gain, t + 0.28, 0.08, 0.005, 0.12);
            a.connect(bp).connect(ag).connect(v.g);
            b.connect(lp).connect(bg).connect(v.g);
            play(v, a, t, t + 0.4);
            play(v, b, t + 0.28, t + 0.43);
        },
        // Drinking an ember: a warm major chord that swells up and fades, with a little shimmer
        heal() {
            if (!gate('heal', 0.5)) return;
            const t = now(), v = fxv(0.4, 1.8);
            for (const m of [62, 69, 74, 78]) {
                const o = osc(v, 'triangle', mf(m)), g = gn(v, 0);
                o.detune.setValueAtTime(-30, t);
                o.detune.linearRampToValueAtTime(0, t + 0.4);
                held(g.gain, t, 0.035, 0.35, 0.5, 0.9);
                o.connect(g).connect(v.g);
                play(v, o, t, t + 1.7);
            }
            const s = nz(v), hp = bq(v, 'highpass', 5000), g = gn(v, 0);
            held(g.gain, t, 0.02, 0.3, 0.4, 0.6);
            s.connect(hp).connect(g).connect(v.g);
            play(v, s, t, t + 1.3);
        },
        // A boss's heavy footfall (size 0.3..1.5)
        stomp(size = 1) {
            if (!gate('stomp', 0.07)) return;
            const k = Math.max(0.2, Math.min(1.5, +size || 1));
            const t = now(), v = fxv(0.12, 0.5), o = osc(v, 'sine', 58), og = gn(v, 0), s = nz(v), lp = bq(v, 'lowpass', 220), sg = gn(v, 0), bp = bq(v, 'bandpass', 900, 1), gg = gn(v, 0);
            sweep(o.frequency, t, 58, 30, 0.35);
            strike(og.gain, t, 0.45 * k, 0.004, 0.45);
            strike(sg.gain, t, 0.22 * k, 0.003, 0.25);
            strike(gg.gain, t, 0.05 * k, 0.002, 0.1);
            o.connect(og).connect(v.g);
            s.connect(lp).connect(sg).connect(v.g);
            s.connect(bp).connect(gg).connect(v.g);
            play(v, o, t, t + 0.5);
            play(v, s, t, t + 0.3);
        },
        // A leg point driven into stone: a crack, a body thump, and crumbling
        stab() {
            if (!gate('stab', 0.06)) return;
            const t = now(), v = fxv(0.15, 0.4), s = nz(v), hp = bq(v, 'highpass', 1800), hg = gn(v, 0), o = osc(v, 'sine', 95), og = gn(v, 0), bp = bq(v, 'bandpass', 650, 1), cg = gn(v, 0);
            strike(hg.gain, t, 0.28, 0.001, 0.05);
            sweep(o.frequency, t, 95, 40, 0.2);
            strike(og.gain, t, 0.34, 0.002, 0.2);
            strike(cg.gain, t, 0.12, 0.02, 0.35);
            s.connect(hp).connect(hg).connect(v.g);
            s.connect(bp).connect(cg).connect(v.g);
            o.connect(og).connect(v.g);
            play(v, s, t, t + 0.4);
            play(v, o, t, t + 0.25);
        },
        // A spinning disc in flight: a fluttering whirr for `seconds`
        whirr(seconds = 1.2) {
            if (!gate('whirr', 0.08)) return;
            const d = Math.max(0.2, Math.min(4, +seconds || 1.2));
            const t = now(), v = fxv(0.05, d + 0.15), o = osc(v, 'triangle', 190), s = nz(v), bp = bq(v, 'bandpass', 2200, 3), am = gn(v, 0.5), lfo = osc(v, 'square', 34), dp = gn(v, 0.5);
            sweep(o.frequency, t, 190, 150, d);
            sweep(lfo.frequency, t, 34, 22, d);
            const end = held(v.g.gain, t, 0.07, 0.05, d, 0.1);
            lfo.connect(dp).connect(am.gain);
            o.connect(am); s.connect(bp).connect(am); am.connect(v.g);
            play(v, o, t, end); play(v, s, t, end); play(v, lfo, t, end);
        },
        // A disc glancing off the wall
        ping() {
            if (!gate('ping', 0.04)) return;
            const t = now(), v = fxv(0.2, 0.25), a = osc(v, 'triangle', 2600), ag = gn(v, 0), b = osc(v, 'sine', 3900), bg = gn(v, 0);
            sweep(a.frequency, t, 2600 * R(0.95, 1.05), 1900, 0.12);
            strike(ag.gain, t, 0.12, 0.001, 0.22);
            strike(bg.gain, t, 0.04, 0.001, 0.1);
            a.connect(ag).connect(v.g); b.connect(bg).connect(v.g);
            play(v, a, t, t + 0.25); play(v, b, t, t + 0.12);
        },
        // Something huge dragged over stone (the beast's charge) for `seconds`
        scrape(seconds = 1.4) {
            if (!gate('scrape', 0.3)) return;
            const d = Math.max(0.3, Math.min(5, +seconds || 1.4));
            const t = now(), v = fxv(0.1, d + 0.3), s = nz(v), bp = bq(v, 'bandpass', 1100, 2.5), lfo = osc(v, 'sine', 11), dp = gn(v, 450), lp = bq(v, 'lowpass', 280), lg = gn(v, 1.6);
            lfo.connect(dp).connect(bp.frequency);
            const end = held(v.g.gain, t, 0.15, 0.1, d, 0.2);
            s.connect(bp).connect(v.g);
            s.connect(lp).connect(lg).connect(v.g);
            play(v, s, t, end); play(v, lfo, t, end);
        },
        // A heavy landing (size 0.3..1.5): a sub boom, a burst of rubble, debris pattering down
        crash(size = 1) {
            if (!gate('crash', 0.15)) return;
            const k = Math.max(0.2, Math.min(1.5, +size || 1));
            const t = now(), v = fxv(0.25, 1.05), o = osc(v, 'sine', 70), og = gn(v, 0), s = nz(v), lp = bq(v, 'lowpass', 900), sg = gn(v, 0);
            sweep(o.frequency, t, 70, 24, 0.9);
            strike(og.gain, t, 0.5 * k, 0.005, 1.0);
            sweep(lp.frequency, t, 900, 120, 0.6);
            strike(sg.gain, t, 0.32 * k, 0.004, 0.7);
            o.connect(og).connect(v.g);
            s.connect(lp).connect(sg).connect(v.g);
            const d = nz(v), bp = bq(v, 'bandpass', 2500, 1.5), dg = gn(v, 0);
            dg.gain.setValueAtTime(0, t);
            for (let i = 0; i < 6; i++) { const at = t + R(0.1, 0.6); dg.gain.setValueAtTime(0.06 * k, at); dg.gain.setTargetAtTime(0, at + 0.004, 0.01); }
            d.connect(bp).connect(dg).connect(v.g);
            play(v, o, t, t + 1.05); play(v, s, t, t + 0.75); play(v, d, t, t + 0.75);
        },
        // Loose pages fluttering (amount 1 = a few, 3 = a gust)
        pageFlutter(amount = 1) {
            if (!gate('page', 0.05)) return;
            const n = Math.max(2, Math.min(9, Math.round((3 + Math.random() * 2) * (+amount || 1))));
            const t = now(), len = n * 0.045 + 0.06, v = fxv(0.15, len), s = nz(v), bp = bq(v, 'bandpass', R(2600, 4200), 1.3);
            v.g.gain.setValueAtTime(0, t);
            for (let i = 0; i < n; i++) { const at = t + i * 0.045 + R(0, 0.02); v.g.gain.setValueAtTime(R(0.02, 0.045), at); v.g.gain.setTargetAtTime(0, at + 0.005, 0.008); }
            s.connect(bp).connect(v.g);
            play(v, s, t, t + len);
        },
        // The Author's ink beam: a low, tearing hum for `seconds`
        inkBeam(seconds = 1.6) {
            if (!gate('ink', 0.2)) return;
            const d = Math.max(0.2, Math.min(6, +seconds || 1.6));
            const t = now(), v = fxv(0.2, d + 0.35), lp = bq(v, 'lowpass', 400, 6), lfo = osc(v, 'sine', 7), dp = gn(v, 300);
            sweep(lp.frequency, t, 400, 1400, Math.min(0.5, d));
            lfo.connect(dp).connect(lp.frequency);
            const end = held(v.g.gain, t, 0.12, 0.08, d, 0.25);
            for (const f of [55, 55.6, 110]) { const o = osc(v, 'sawtooth', f); o.connect(lp); play(v, o, t, end); }
            const s = nz(v), bp = bq(v, 'bandpass', 1600, 0.8), tg = gn(v, 0.5), sq = osc(v, 'square', 23), sd = gn(v, 0.5), ng = gn(v, 0.5);
            sq.connect(sd).connect(tg.gain);
            s.connect(bp).connect(tg).connect(ng).connect(v.g);
            lp.connect(v.g);
            play(v, s, t, end); play(v, sq, t, end); play(v, lfo, t, end);
        },
        // A roof tile cracking
        tileCrack() {
            if (!gate('crack', 0.05)) return;
            const t = now(), v = fxv(0.12, 0.2), s = nz(v), hp = bq(v, 'highpass', 2000), hg = gn(v, 0), bp = bq(v, 'bandpass', 500, 1.2), cg = gn(v, 0);
            hg.gain.setValueAtTime(0, t);
            for (const dt of [0, 0.03, 0.07]) { hg.gain.setValueAtTime(R(0.15, 0.25), t + dt); hg.gain.setTargetAtTime(0, t + dt + 0.003, 0.006); }
            strike(cg.gain, t, 0.15, 0.003, 0.14);
            s.connect(hp).connect(hg).connect(v.g);
            s.connect(bp).connect(cg).connect(v.g);
            play(v, s, t, t + 0.2);
        },
        // Tiles falling away into the dark: a rumble that drops and recedes, two knocks on the way down
        tileFall() {
            if (!gate('fall', 0.15)) return;
            const t = now(), v = fxv(0.2, 1.5), s = nz(v), lp = bq(v, 'lowpass', 400), sg = gn(v, 0);
            sweep(lp.frequency, t, 400, 110, 1.3);
            held(sg.gain, t, 0.14, 0.05, 0.5, 0.8);
            s.connect(lp).connect(sg).connect(v.g);
            play(v, s, t, t + 1.5);
            [[0.4, 0.12], [0.75, 0.06]].forEach(([dt, a]) => {
                const o = osc(v, 'sine', 120), g = gn(v, 0);
                sweep(o.frequency, t + dt, 120, 60, 0.12);
                strike(g.gain, t + dt, a, 0.003, 0.15);
                o.connect(g).connect(v.g);
                play(v, o, t + dt, t + dt + 0.2);
            });
        },
        // One beat of great paper wings: a low push of air with paper at the edge
        wingBeat() {
            if (!gate('wing', 0.15)) return;
            const t = now(), v = fxv(0.15, 0.5), s = nz(v), lp = bq(v, 'lowpass', 380), lg = gn(v, 0), o = osc(v, 'sine', 70), og = gn(v, 0), bp = bq(v, 'bandpass', 3000, 1.2), bg = gn(v, 0);
            sweep(lp.frequency, t, 380, 700, 0.15);
            held(lg.gain, t, 0.2, 0.1, 0.1, 0.3);
            sweep(o.frequency, t, 70, 45, 0.15);
            strike(og.gain, t, 0.15, 0.03, 0.15);
            strike(bg.gain, t + 0.05, 0.03, 0.03, 0.2);
            s.connect(lp).connect(lg).connect(v.g);
            s.connect(bp).connect(bg).connect(v.g);
            o.connect(og).connect(v.g);
            play(v, s, t, t + 0.5); play(v, o, t, t + 0.25);
        },
        // The eye in the sky opening: a huge swell that rises for almost four seconds and is cut off
        skyEye() {
            if (!gate('sky', 3)) return;
            const t = now(), len = 3.6, v = fxv(0.5, len + 0.3), lp = bq(v, 'lowpass', 150, 1);
            sweep(lp.frequency, t, 150, 5000, len);
            v.g.gain.setValueAtTime(0.0001, t);
            v.g.gain.exponentialRampToValueAtTime(0.3, t + len);
            v.g.gain.setTargetAtTime(0, t + len, 0.03);
            const s = nz(v), sg = gn(v, 0.7);
            s.connect(sg).connect(lp);
            play(v, s, t, t + len + 0.2);
            for (const m of [26, 33, 38, 45, 50]) { const o = osc(v, 'sawtooth', mf(m)), og = gn(v, 0.25); o.connect(og).connect(lp); play(v, o, t, t + len + 0.2); }
            const sub = osc(v, 'sine', 32), subg = gn(v, 0.6);
            sweep(sub.frequency, t, 32, 48, len);
            sub.connect(subg).connect(v.g);
            play(v, sub, t, t + len + 0.2);
            lp.connect(v.g);
        },
        // A title card landing: a sub drop and an impact into the hall
        titleHit() {
            if (!gate('title', 0.5)) return;
            const t = now(), v = fxv(0.45, 1.65), o = osc(v, 'sine', 110), og = gn(v, 0), s = nz(v), lp = bq(v, 'lowpass', 1800), sg = gn(v, 0);
            sweep(o.frequency, t, 110, 26, 1.4);
            strike(og.gain, t, 0.55, 0.003, 1.6);
            sweep(lp.frequency, t, 1800, 200, 0.5);
            strike(sg.gain, t, 0.35, 0.002, 0.5);
            o.connect(og).connect(v.g);
            s.connect(lp).connect(sg).connect(v.g);
            play(v, o, t, t + 1.65); play(v, s, t, t + 0.55);
        },
        // A small bright glint (a charged heavy is ready, a parry window, an ember catching)
        glint() {
            if (!gate('glint', 0.1)) return;
            const t = now(), v = fxv(0.3, 0.45), a = osc(v, 'sine', 2637), b = osc(v, 'sine', 3951), bg = gn(v, 0.4);
            strike(v.g.gain, t, 0.05, 0.001, 0.4);
            a.connect(v.g); b.connect(bg).connect(v.g);
            play(v, a, t, t + 0.45); play(v, b, t, t + 0.2);
        },
        // The ember art: a roaring arc of fire with crackles
        fire() {
            if (!gate('fire', 0.3)) return;
            const t = now(), v = fxv(0.2, 0.8), s = nz(v), bp = bq(v, 'bandpass', 400, 0.7), bg = gn(v, 0), o = osc(v, 'sine', 90), og = gn(v, 0), hp = bq(v, 'highpass', 3000), cg = gn(v, 0);
            sweep(bp.frequency, t, 400, 2400, 0.25);
            held(bg.gain, t, 0.22, 0.08, 0.2, 0.4);
            sweep(o.frequency, t, 90, 60, 0.4);
            strike(og.gain, t, 0.2, 0.01, 0.4);
            cg.gain.setValueAtTime(0, t);
            for (let i = 0; i < 7; i++) { const at = t + R(0.05, 0.6); cg.gain.setValueAtTime(R(0.04, 0.09), at); cg.gain.setTargetAtTime(0, at + 0.003, 0.006); }
            s.connect(bp).connect(bg).connect(v.g);
            s.connect(hp).connect(cg).connect(v.g);
            o.connect(og).connect(v.g);
            play(v, s, t, t + 0.8); play(v, o, t, t + 0.45);
        },
        // An eye (or any orb) loosed: a short falling blip
        orb() {
            if (!gate('orb', 0.03)) return;
            const t = now(), v = fxv(0.15, 0.2), o = osc(v, 'sine', 900), og = gn(v, 0), s = nz(v), bp = bq(v, 'bandpass', 1500, 2), sg = gn(v, 0);
            sweep(o.frequency, t, 900 * R(0.9, 1.1), 420, 0.15);
            strike(og.gain, t, 0.08, 0.002, 0.18);
            strike(sg.gain, t, 0.04, 0.002, 0.05);
            o.connect(og).connect(v.g);
            s.connect(bp).connect(sg).connect(v.g);
            play(v, o, t, t + 0.2); play(v, s, t, t + 0.08);
        },
    };

    return {
        fx, start, stop, stinger, intensity, stats,
        tick: tick_,
        at(t) { clock = t; },
        // tests only: silence the layers not in `keep` (an array of layer numbers)
        solo(keep) { if (cur) cur.L.forEach((g, i) => { if (!keep.includes(i)) g.gain.setValueAtTime(0, now()); }); },
        set muted(m) { muted = !!m; },
        get theme() { return cur && { id: cur.id, step: cur.step, tempo: cur.tempo, trans: cur.trans, layers: cur.lv.slice() }; },
    };
}

// ═════════════ The score the fight uses ═════════════
export function createScore(sfx) {
    let E = null, want = null, timer = 0;
    const io = () => (sfx && sfx.audio ? sfx.audio() : null);
    // The engine, built the first time sound is available; null before then
    function live() {
        const a = io();
        if (!a || !a.ctx) return null;
        if (!E) E = engine(a.ctx, a.out, a.noise || makeNoise(a.ctx));
        E.muted = a.muted;
        E.ctx = a.ctx;
        return E;
    }
    // Every 50 ms: start or stop the theme the fight wants, and schedule what is due in the next third of a second.
    // (While the tab is hidden the context is suspended and its clock stands still, so nothing piles up.)
    function pump() {
        const e = live();
        if (!e) return;
        const cur = e.theme;
        if (want && (!cur || cur.id !== want)) e.start(want);
        else if (!want && cur) e.stop();
        if (e.ctx.state === 'running') e.tick(e.ctx.currentTime + 0.35);
    }
    const wake = () => { if (!timer) timer = setInterval(pump, 50); };
    const safe = fn => (...a) => { try { const e = live(); if (e) fn(e, ...a); } catch (err) { console.warn('[score]', err); } };

    const api = {
        start(formId) { want = THEMES[formId] ? formId : null; wake(); try { pump(); } catch (err) { console.warn('[score]', err); } },
        stop() { want = null; try { pump(); } catch (err) { console.warn('[score]', err); } },
        intensity: safe((e, k) => e.intensity(k)),
        stinger(name) {
            if (name === 'phase' || name === 'victory') want = null;   // the theme ends here, even before sound is unlocked
            try { const e = live(); if (e) e.stinger(name); } catch (err) { console.warn('[score]', err); }
        },
    };
    for (const name of ['swing', 'clang', 'flesh', 'parry', 'guard', 'roll', 'heal', 'stomp', 'stab', 'whirr', 'ping', 'scrape', 'crash',
        'pageFlutter', 'inkBeam', 'tileCrack', 'tileFall', 'wingBeat', 'skyEye', 'titleHit', 'glint', 'fire', 'orb']) {
        api[name] = safe((e, ...a) => e.fx[name](...a));
    }

    // ── Tests by construction (nothing in the fight calls these) ──
    api.debug = {
        stats: () => E && { voices: E.stats.voices, nodes: E.stats.nodes, theme: E.theme },
        effects: () => Object.keys(api).filter(k => !['start', 'stop', 'intensity', 'stinger', 'debug'].includes(k)),
        // Render a theme at a fixed intensity into an OfflineAudioContext; report peak and RMS in dBFS.
        // raw = true leaves out the soft ceiling, to see how hot the mix itself is.
        async render(formId = 'watcher', seconds = 30, k = 1, raw = false, keep = null) {
            const sr = 44100, oac = new OfflineAudioContext(2, sr * seconds, sr);
            const e = engine(oac, oac.destination, makeNoise(oac), raw ? 'raw' : true);
            e.at(0);
            e.start(formId, 0.01);
            e.intensity(k, true);
            if (keep) e.solo(keep);
            for (let c = 0; c < seconds; c += 0.25) { e.at(c); e.tick(Math.min(seconds, c + 0.35)); }
            return measure(await oac.startRendering());
        },
        // A two-minute fight's worth of calls (three themes, every stinger, ~600 effects a minute) rendered offline:
        // reports the most nodes alive at once, how many are alive at the end, and the levels
        async simulate(seconds = 120) {
            const sr = 22050, oac = new OfflineAudioContext(2, sr * seconds, sr);
            const e = engine(oac, oac.destination, makeNoise(oac), true);
            e.stats.log = [];
            const names = ['swing', 'swing', 'clang', 'flesh', 'parry', 'guard', 'roll', 'stomp', 'stab', 'whirr', 'ping', 'scrape', 'crash',
                'pageFlutter', 'pageFlutter', 'inkBeam', 'tileCrack', 'tileFall', 'wingBeat', 'glint', 'fire', 'orb', 'orb'];
            const plan = [[0, 'start', 'watcher'], [8, 'stinger', 'parry'], [15, 'stinger', 'stagger'], [16, 'stinger', 'riposte'],
                [25, 'stinger', 'death'], [38, 'stinger', 'phase'], [39, 'fx', 'titleHit'], [42, 'start', 'player2'], [55, 'stinger', 'parry'],
                [62, 'stinger', 'revive'], [78, 'stinger', 'phase'], [80, 'fx', 'skyEye'], [84, 'start', 'author'], [100, 'stinger', 'stagger'],
                [101, 'stinger', 'riposte'], [112, 'stinger', 'victory'], [116, 'stop']];
            let calls = 0, pi = 0;
            for (let c = 0; c < seconds; c += 0.05) {
                e.at(c);
                while (pi < plan.length && plan[pi][0] <= c) {
                    const [, what, arg] = plan[pi++];
                    if (what === 'start') e.start(arg); else if (what === 'stop') e.stop(); else if (what === 'stinger') e.stinger(arg); else e.fx[arg]();
                    calls++;
                }
                e.intensity((c % 40) / 40);
                for (let j = 0; j < 4; j++) if (Math.random() < 0.125) { e.fx[names[(Math.random() * names.length) | 0]](); calls++; }   // ~10 calls a second
                e.tick(c + 0.35);
            }
            // The most nodes alive at once, worked out from when each voice starts and ends
            const ev = [];
            for (const v of e.stats.log) { ev.push([v.t0, v.n, 1]); ev.push([Math.max(v.t0, v.end), -v.n, -1]); }
            ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
            let n = 0, nv = 0, maxN = 0, maxV = 0;
            const perTen = [];
            for (const [t, d, dv] of ev) { n += d; nv += dv; if (n > maxN) maxN = n; if (nv > maxV) maxV = nv; const b = Math.floor(t / 10); perTen[b] = Math.max(perTen[b] || 0, n); }
            const lv = measure(await oac.startRendering());
            await new Promise(r => setTimeout(r, 300));
            return { calls, voicesMade: e.stats.log.length, maxLiveNodes: maxN, maxLiveVoices: maxV, peakNodesPer10s: perTen.map(x => x || 0), liveNodesAfter: e.stats.nodes, liveVoicesAfter: e.stats.voices, ...lv };
        },
    };
    function measure(buf) {
        let peak = 0, sum = 0, n = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > peak) peak = x; sum += x * x; }
            n += d.length;
        }
        const db = x => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
        return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)) };
    }
    return api;
}
