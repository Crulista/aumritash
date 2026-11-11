// Sound effects for the flame scene, all made in the browser with Web Audio (no sound files).
// Nothing plays until unlock() runs inside a click or key press, since browsers block sound before that.

export function createSfx() {
    let ctx = null, out = null, noise = null, muted = false;
    let windOn = false, fireOn = false, wind = null, fire = null, popTimer = 0, lastEye = 0;

    function unlock() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ctx = new AC();
            out = ctx.createGain();
            out.gain.value = muted ? 0 : 1;
            out.connect(ctx.destination);
            // Two seconds of white noise, reused by every sound
            noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const d = noise.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            if (windOn) startWind();
            if (fireOn) startFire();
        }
        if (ctx.state === 'suspended') ctx.resume();
    }
    const live = () => ctx && ctx.state === 'running' && !muted;

    function noiseSrc(loop = false) {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        s.loop = loop;
        if (!loop) s.playbackRate.value = 0.9 + Math.random() * 0.2;
        return s;
    }
    function filter(type, freq, q = 1) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
    }
    // A gain that rises to `peak` in `attack` seconds and dies away over `release`
    function env(t, peak, attack, release) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
        return g;
    }
    function chain(...nodes) {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        return nodes[0];
    }

    // ── Wind: a low, slowly breathing hiss under the whole walk ──
    function startWind() {
        if (!ctx || wind) return;
        const src = noiseSrc(true), lp = filter('lowpass', 380, 0.7), g = ctx.createGain();
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 0.09;
        depth.gain.value = 180;
        lfo.connect(depth).connect(lp.frequency);
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(fireOn ? 0.05 : 0.12, ctx.currentTime + 3);
        chain(src, lp, g, out);
        src.start();
        lfo.start();
        wind = { g };
    }
    function setWind(on) {
        windOn = on;
        if (on) startWind();
    }

    // ── Fire: a soft roar with crackles popping on top ──
    function startFire() {
        if (!ctx || fire) return;
        const src = noiseSrc(true), lp = filter('lowpass', 520, 0.5), g = ctx.createGain();
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 1.2);
        chain(src, lp, g, out);
        src.start();
        fire = { g };
        if (wind) wind.g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
        // Pops are scheduled a little ahead so a busy frame doesn't make them stutter
        let next = ctx.currentTime;
        popTimer = setInterval(() => {
            if (!live()) { next = ctx.currentTime; return; }
            while (next < ctx.currentTime + 0.25) {
                pop(next);
                next += Math.random() < 0.15 ? 0.02 + Math.random() * 0.04 : 0.08 + Math.random() * 0.35;
            }
        }, 100);
    }
    function pop(t) {
        const s = noiseSrc(), hp = filter('bandpass', 1800 + Math.random() * 3500, 2 + Math.random() * 4);
        const g = env(t, 0.05 + Math.random() * 0.12, 0.002, 0.01 + Math.random() * 0.03);
        chain(s, hp, g, out);
        s.start(t, Math.random() * 1.5, 0.06);
    }
    function setFire(on) {
        fireOn = on;
        if (on) startFire();
    }

    // ── One-shots ──
    function step() {
        if (!live()) return;
        const t = ctx.currentTime;
        // Grit under the boot, and a soft heel thud
        const s = noiseSrc(), bp = filter('bandpass', 380 + Math.random() * 220, 0.9);
        chain(s, bp, env(t, 0.055, 0.006, 0.07), out);
        s.start(t, Math.random() * 1.5, 0.15);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
        chain(o, env(t, 0.07, 0.006, 0.09), out);
        o.start(t);
        o.stop(t + 0.15);
    }

    // Eyes opening in the dark: a breath and a low groan, from the side they appear on
    function eye(dread = 0, pan = 0) {
        if (!live()) return;
        const now = performance.now();
        if (now - lastEye < 900 - dread * 500) return;
        lastEye = now;
        const t = ctx.currentTime, vol = 0.05 + dread * 0.1;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
        p.connect(out);
        const s = noiseSrc(), bp = filter('bandpass', 420, 3);
        bp.frequency.setValueAtTime(320 + Math.random() * 120, t);
        bp.frequency.exponentialRampToValueAtTime(700 + Math.random() * 300, t + 0.7);
        chain(s, bp, env(t, vol, 0.25, 0.6), p);
        s.start(t, Math.random(), 1);
        const o = ctx.createOscillator(), lp = filter('lowpass', 300);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(58 + Math.random() * 20, t);
        o.frequency.exponentialRampToValueAtTime(40 + Math.random() * 8, t + 1);
        chain(o, lp, env(t, vol * 0.5, 0.3, 0.8), p);
        o.start(t);
        o.stop(t + 1.2);
    }

    // The flame catching: a rush of air and a deep boom
    function kindle() {
        if (!live()) return;
        const t = ctx.currentTime;
        const s = noiseSrc(), lp = filter('lowpass', 200, 1.5);
        lp.frequency.setValueAtTime(200, t);
        lp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
        lp.frequency.exponentialRampToValueAtTime(400, t + 1.4);
        chain(s, lp, env(t, 0.4, 0.3, 1.2), out);
        s.start(t, 0, 1.8);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(70, t + 0.25);
        o.frequency.exponentialRampToValueAtTime(32, t + 1.6);
        chain(o, env(t + 0.25, 0.45, 0.02, 1.4), out);
        o.start(t + 0.25);
        o.stop(t + 1.8);
    }

    // Leaving the fire: the wind rises as the screen goes dark
    function whoosh() {
        if (!live()) return;
        const t = ctx.currentTime;
        const s = noiseSrc(), bp = filter('bandpass', 300, 0.8);
        bp.frequency.setValueAtTime(250, t);
        bp.frequency.exponentialRampToValueAtTime(1400, t + 1.2);
        bp.frequency.exponentialRampToValueAtTime(300, t + 1.8);
        chain(s, bp, env(t, 0.22, 0.9, 0.9), out);
        s.start(t, 0, 2);
    }

    // The sealed tower: a dull knock on stone
    function thud() {
        if (!live()) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
        chain(o, env(t, 0.4, 0.005, 0.45), out);
        o.start(t);
        o.stop(t + 0.6);
        const s = noiseSrc(), lp = filter('lowpass', 500);
        chain(s, lp, env(t, 0.12, 0.003, 0.12), out);
        s.start(t, 0, 0.2);
    }

    // A faint tick when a path is picked
    function tick() {
        if (!live()) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 1500;
        chain(o, env(t, 0.03, 0.002, 0.05), out);
        o.start(t);
        o.stop(t + 0.08);
    }

    // Stone grinding on stone: the seal giving way
    function rumble(seconds = 2.5) {
        if (!live()) return;
        const t = ctx.currentTime;
        const s = noiseSrc(true), lp = filter('lowpass', 140, 1.2), g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.3);
        g.gain.setValueAtTime(0.5, t + seconds - 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
        chain(s, lp, g, out);
        s.start(t);
        s.stop(t + seconds + 0.1);
    }

    // The Watcher speaking: a low, torn growl that sags in pitch
    function roar(seconds = 3) {
        if (!live()) return;
        const t = ctx.currentTime;
        const lp = filter('lowpass', 420, 2), g = env(t, 0.34, 0.35, seconds);
        lp.frequency.setValueAtTime(620, t);
        lp.frequency.exponentialRampToValueAtTime(180, t + seconds);
        chain(lp, g, out);
        for (const f0 of [43, 44.5, 65, 87.5]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(f0 * 1.25, t);
            o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + seconds);
            o.connect(lp);
            o.start(t);
            o.stop(t + seconds + 0.5);
        }
        const s = noiseSrc(true), bp = filter('bandpass', 260, 1.5);
        chain(s, bp, env(t, 0.2, 0.3, seconds * 0.8), out);
        s.start(t);
        s.stop(t + seconds + 0.5);
    }

    // A drone that sits under the tower's top once things start to gather
    let drone = null;
    function setDrone(on) {
        if (!ctx) return;
        if (on && !drone) {
            const g = ctx.createGain(), lp = filter('lowpass', 110);
            g.gain.value = 0.0001;
            g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 4);
            chain(lp, g, out);
            const oscs = [36, 36.6, 54].map(f0 => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0; o.connect(lp); o.start(); return o; });
            drone = { g, oscs };
        } else if (!on && drone) {
            const d = drone;
            drone = null;
            d.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
            setTimeout(() => d.oscs.forEach(o => o.stop()), 3000);
        }
    }

    // Hidden tab: stop everything, and pick up again when the visitor comes back
    function pause(on) {
        if (!ctx) return;
        if (on) ctx.suspend(); else ctx.resume();
    }

    function setMuted(m) {
        muted = m;
        if (out) out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.1);
    }

    return { unlock, setWind, setFire, step, eye, kindle, whoosh, thud, tick, rumble, roar, setDrone, setMuted, pause, state: () => ctx && ctx.state };
}
