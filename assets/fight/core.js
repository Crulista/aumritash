// The tower fight's core: the fight clock and its modes, the shared things that can hurt the visitor, effects, the
// cut-scene runner, and the sequence of forms the boss goes through. Each form lives in its own file under ./forms/
// and is loaded only when it is needed; the visitor lives in ./player.js. Read FIGHT-SPEC (section 5) for the contract
// every form is written against: it is the `ctx` object built below.
//
// The page calls:
//   fight = createFight(env)    once, after its cast has loaded
//   fight.start(n = 0)          begin a fight at form n (0 = the first)
//   fight.frame(dt)             every frame, before the animation mixers
//   fight.pose(dt)              every frame, after the mixers (while fight.on)
//   fight.done, fight.on        over (won or left) / running
//   fight.warp                  how fast time runs (below 1 for slow motion); the page multiplies its frame time by it
//   fight.skip()                skip the cut-scene that is playing; false if none is (the page then calls abort)
//   fight.abort()               leave the fight (rank '—')
//   fight.result()              fill in the result screen
//   fight.reset()               tidy everything away for another run
//   fight.view = [camX, camY, camZ, lookX, lookY, lookZ]   pin the camera (arena coordinates), for debugging
//   fight.bot(on, skill, parry) a stand-in visitor that fights by itself (testing)
//
// env (what the page hands over):
//   THREE                 three.js
//   arena                 the roof's THREE.Group. Arena coordinates are its local ones: it may only be moved, not
//                         turned or scaled, so toArena / toWorld are just its position taken off / added on
//   camera                the PerspectiveCamera
//   camTo, look           Vector3s (world): where the page eases the camera to, and what it looks at, every frame
//   snap()                makes the page jump the camera to camTo / look this frame instead of easing
//   baseFov()             the lens the page wants when nothing overrides it
//   fade(on)              the page's fade to black
//   sfx                   sound one-shots (assets/sfx.js)
//   hero, heroCls, heroName, heroSteps, loadCharacter   the visitor's character, its class, their typed name (upper
//                         case), a function to call once a frame while they run (footsteps), and the character loader
//   $                     id → element. The fight uses: say, boss, bossName, bossFill, me, meHp, meSt, meHeals, phase,
//                         phaseTitle, phaseHint, pad, stick, knob, btnAtk, btnRoll, btnHeal, btnGuard, fell, hurt,
//                         fade, rank, endTitle, endLine
//   store, track, touch   localStorage wrapper, the visit logger, and whether this is a touch screen
//   parts                 things the page built before the fight, by form id (parts.watcher: see forms/watcher.js)
//   forms                 loaders, one per form in order: [() => import('…/forms/watcher.js'), …]. A form that is
//                         missing or throws while loading is skipped, so the fight still ends.
//
// Additions to the contract (things forms and the player may also use): ctx.mode ('off' | 'intro' | 'ready' | 'play' |
// 'dead' | 'won' | 'next'), ctx.parts, ctx.push(dx, dz) to shove the visitor, ctx.jolt (this frame's camera shake
// offset), ctx.haz.near(x, z) (is something about to land here; for the test bot), the optional third argument of
// ctx.mark.trace (half the picture's width), and a form's `hp`, which the boss bar shows.
import * as kit from './kit.js';
import { createPlayer } from './player.js';

const NONE = Object.freeze({ dealt: 0, staggered: false, dead: false });
const QUIET = { start() {}, stinger() {}, intensity() {}, stop() {} };

export function createFight(env) {
    const { THREE, arena, camera, sfx, $ } = env;
    const { mix, clamp01, toward, angDiff, nearSeg } = kit;
    const off = arena.position;
    const ARENA = 11.4;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

    // ── The fight's own state ──
    let mode = 'off', modeT = 0, T = 0, clk = 0;
    let warp = 1, warpRate = 4, shakeK = 0;
    let run = 0;                        // bumped on every start / abort / reset, so steps left over from an old run stop
    let form = null, formIndex = -1, lastName = 'THE WATCHER', beaten = 0;
    let done = false, rank = null, deaths = 0, hits = 0, parries = 0, time = 0;
    let carded = false, cardT = 0, shown = 100, droneOff = false;
    let score = QUIET;
    const jolt = { x: 0, y: 0 };
    const loaders = env.forms || [];
    const mods = [], pending = [];      // per form: the module once loaded, or null if it is missing

    import('./score.js').then(m => {
        score = m.createScore(sfx) || QUIET;
        // The visitor's module asks for a few sounds by other names than the score gave them
        for (const [want, have] of [['hurt', 'flesh'], ['charged', 'glint'], ['art', 'fire']]) if (!score[want] && score[have]) score[want] = score[have];
    }).catch(e => console.warn('[fight] no score:', e && e.message));

    const ctx = {
        THREE, kit, arena, camera, sfx,
        hero: env.hero, heroName: env.heroName, heroCls: env.heroCls, loadCharacter: env.loadCharacter,
        parts: env.parts || {},
        ARENA,
        get score() { return score; },
        get P() { return player.state; },
        get form() { return form; },
        get mode() { return mode; },
        time: () => T,
        rand: Math.random,
        toArena: v => v.sub(off),
        toWorld: v => v.add(off),
        jolt,
        push(dx, dz) { player.state.x += dx; player.state.z += dz; },
        // ── effects ──
        shake(k) { shakeK = Math.max(shakeK, k); },
        slow(scale, seconds = 0.2) { warp = scale; warpRate = (1 - scale) / Math.max(0.01, seconds); },
        flash, spark, dust, line,
        setBoss(name, sub) { lastName = name; $('bossName').textContent = name; $('boss').dataset.sub = sub || ''; },
        hitPlayer,
        haz: null, mark: null, cine: null
    };

    // ── Words in the middle of the screen ──
    let lineTimer = 0;
    function line(text, seconds = 2.2) {
        const el = $('say');
        el.textContent = text;
        clearTimeout(lineTimer);
        lineTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, seconds * 1000);
    }

    // ── Flat things on the ground, and the glow sprites, all in the arena ──
    const flat = m => { m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; arena.add(m); return m; };
    const sprite = (color, sx, sy = sx) => { const s = kit.glowSprite(color, 0); s.scale.set(sx, sy, 1); s.visible = false; arena.add(s); return s; };

    // A short additive burst
    const sparks = Array.from({ length: 6 }, () => sprite('#ffe6b8', 2.2));
    let sparkNext = 0;
    function spark(x, y, z, size = 2.2, color = '#ffe6b8') {
        const s = sparks[sparkNext++ % sparks.length];
        s.position.set(x, y, z);
        s.scale.set(size, size, 1);
        s.material.color.set(color);
        s.material.opacity = 1;
        s.visible = true;
    }

    // Ground puffs: one cloud of points, each slot reused
    const DUST = 48, dustPos = new Float32Array(DUST * 3), dustCol = new Float32Array(DUST * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
    const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    dustPts.frustumCulled = false;
    arena.add(dustPts);
    const motes = Array.from({ length: DUST }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < DUST; i++) dustPos[i * 3 + 1] = -50;
    let dustNext = 0, dustLive = 0;
    const _col = new THREE.Color();
    function dust(x, z, count = 8, color = '#8a7d72') {
        _col.set(color);
        for (let k = 0; k < count; k++) {
            const i = dustNext++ % DUST, m = motes[i], a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 1.5;
            m.max = m.life = 0.6 + Math.random() * 0.4;
            m.vx = Math.cos(a) * v; m.vz = Math.sin(a) * v; m.vy = 0.6 + Math.random() * 0.8;
            m.r = _col.r; m.g = _col.g; m.b = _col.b;
            dustPos[i * 3] = x + Math.cos(a) * 0.3; dustPos[i * 3 + 1] = 0.1; dustPos[i * 3 + 2] = z + Math.sin(a) * 0.3;
        }
        dustLive = 1.1;
    }

    // A full-screen flash
    const flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:fixed;inset:0;z-index:7;pointer-events:none;opacity:0;';
    document.body.appendChild(flashEl);
    let flashA = 0, flashRate = 1;
    function flash(color = '#ffffff', seconds = 0.3) { flashEl.style.background = color; flashA = 1; flashRate = 1 / Math.max(0.01, seconds); flashEl.style.opacity = 1; }

    function effects(dt, raw) {
        for (const s of sparks) if (s.visible) { s.material.opacity = Math.max(0, s.material.opacity - dt * 6); if (s.material.opacity <= 0) s.visible = false; }
        if (dustLive > 0) {
            dustLive -= dt;
            for (let i = 0; i < DUST; i++) {
                const m = motes[i];
                if (m.life <= 0) continue;
                m.life -= dt;
                if (m.life <= 0) { dustPos[i * 3 + 1] = -50; continue; }
                m.vy -= 3 * dt;
                dustPos[i * 3] += m.vx * dt; dustPos[i * 3 + 1] = Math.max(0.03, dustPos[i * 3 + 1] + m.vy * dt); dustPos[i * 3 + 2] += m.vz * dt;
                m.vx *= 1 - Math.min(1, dt * 3); m.vz *= 1 - Math.min(1, dt * 3);
                const k = m.life / m.max;
                dustCol[i * 3] = m.r * k; dustCol[i * 3 + 1] = m.g * k; dustCol[i * 3 + 2] = m.b * k;
            }
            dustGeo.attributes.position.needsUpdate = true;
            dustGeo.attributes.color.needsUpdate = true;
        }
        if (flashA > 0) { flashA = Math.max(0, flashA - raw * flashRate); flashEl.style.opacity = flashA; }
    }

    // ═════════════ Things that can hurt the visitor ═════════════
    // A blow reaching the visitor. The player module decides what their guard and roll make of it; this keeps count,
    // tells the form when its blow was parried, and handles a fall.
    function hitPlayer(dmg, fromX, fromZ, opts) {
        if (typeof opts === 'string') opts = { kind: opts };
        opts = opts || {};
        if (mode !== 'play' || C.active) return null;
        const kind = opts.kind || 'blade';
        const r = player.receive(dmg, fromX, fromZ, opts);
        if (r === 'hit') {
            hits++;
            if (player.state.hp <= 0) died();
        } else if (r === 'parried') {
            parries++;
            if (opts.parryable ?? kind === 'blade') {
                line('PARRIED', 0.9);
                score.stinger('parry');
                const f = form;
                if (f && f.parried) safely(f, () => f.parried({ x: fromX, z: fromZ, kind }));
            }
        }
        return r;
    }

    const WAVES = Array.from({ length: 4 }, () => ({ live: false, mesh: flat(new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), kit.redMaterial())), x: 0, z: 0, r: 0, speed: 0, max: 0, dmg: 0, thick: 0, hit: false }));
    const ORBS = Array.from({ length: 16 }, () => ({ live: false, sp: sprite('#ff2a1a', 1.1), p: V(), v: V(), age: 0, homing: 0, dmg: 0, life: 0 }));
    const BEAMS = Array.from({ length: 8 }, () => {
        const mark = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 18), kit.redMaterial()));
        const pillar = sprite('#ff3a2a', 3.4, 22);
        return { mark, pillar, t: -1, x: 0, z: 0, radius: 2, delay: 0.85, dmg: 22, hit: false };
    });
    const zoneGeos = new Map();
    function zoneGeo(shape, inner, arc) {
        const key = shape + ':' + inner.toFixed(3) + ':' + arc.toFixed(3);
        let g = zoneGeos.get(key);
        if (!g) {
            // Every shape is drawn at unit size and scaled. Seen from above, a zone faces +z when its yaw is 0
            if (shape === 'rect') g = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);          // runs from its origin forwards
            else if (shape === 'sector') g = new THREE.RingGeometry(inner, 1, 24, 1, -Math.PI / 2 - arc / 2, arc);
            else g = inner > 0 ? new THREE.RingGeometry(inner, 1, 40) : new THREE.CircleGeometry(1, 40);
            zoneGeos.set(key, g);
        }
        return g;
    }
    const ZONES = Array.from({ length: 12 }, () => ({
        live: false, area: flat(new THREE.Mesh(undefined, kit.redMaterial())), fill: flat(new THREE.Mesh(undefined, kit.redMaterial())),
        shape: 'circle', x: 0, z: 0, yaw: 0, r: 1, r0: 0, arc: 1, w: 1, l: 1, delay: 0.8, dmg: 0, t: 0, landed: false, unblockable: true, onLand: null
    }));
    function inZone(o, x, z, pad = 0) {
        const dx = x - o.x, dz = z - o.z;
        if (o.shape === 'rect') {
            const f = dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw), s = dx * Math.cos(o.yaw) - dz * Math.sin(o.yaw);
            return f >= -pad && f <= o.l + pad && Math.abs(s) <= o.w / 2 + pad;
        }
        const d = Math.hypot(dx, dz);
        if (d < o.r0 - pad || d > o.r + pad) return false;
        return o.shape !== 'sector' || Math.abs(angDiff(Math.atan2(dx, dz), o.yaw)) <= o.arc / 2 + (d > 0 ? pad / d : 0);
    }
    const used = [];                    // melee swings that have already met the visitor (once each)
    const swept = new Map();            // where each live swing's weapon was last frame
    const _sa = { x: 0, z: 0 }, _sb = { x: 0, z: 0 };
    // Whether a weapon lying from a to b passes within `radius` of the visitor. Seen from above, like the marks on
    // the ground, but only the part of it low enough to reach someone standing counts: a blade held overhead,
    // or a shaft passing above them, does not.
    function bladeTouches(P, ax, ay, az, bx, by, bz, radius) {
        const top = 1.7 + radius;
        if (ay > top && by > top) return false;
        if (ay > top) { const k = (ay - top) / (ay - by); ax = mix(ax, bx, k); az = mix(az, bz, k); }
        else if (by > top) { const k = (by - top) / (by - ay); bx = mix(bx, ax, k); bz = mix(bz, az, k); }
        _sa.x = ax; _sa.z = az; _sb.x = bx; _sb.z = bz;
        return nearSeg(P.x, P.z, _sa, _sb) < radius;
    }
    const MARKS = [];                   // every ground mark traced so far (see ctx.mark)

    const haz = ctx.haz = {
        // A ring spreading over the ground; it hurts where its edge passes the visitor. dmg 0 makes a harmless one.
        wave({ x, z, r0 = 1, speed = 9.5, max = 9, dmg = 16, thick = 0.55 }) {
            const w = WAVES.find(q => !q.live) || WAVES.reduce((a, b) => (a.r / a.max > b.r / b.max ? a : b));
            Object.assign(w, { live: true, x, z, r: r0, speed, max, dmg, thick, hit: dmg <= 0 });
            return w;
        },
        // A projectile flying at (tx, ty, tz); for `homing` seconds it bends towards the visitor
        orb({ x, y, z, tx, ty = 1.2, tz, speed = 11.5, homing = 0.9, dmg = 11, life = 3, color = '#ff2a1a', size = 1.1 }) {
            const o = ORBS.find(q => !q.live);
            if (!o) return null;
            const P = player.state;
            o.live = true; o.age = 0; o.homing = homing; o.dmg = dmg; o.life = life;
            o.p.set(x, y, z);
            o.v.set((tx ?? P.x) - x, ty - y, (tz ?? P.z) - z).normalize().multiplyScalar(speed);
            o.sp.material.color.set(color);
            o.sp.material.opacity = 1;
            o.sp.scale.set(size, size, 1);
            return o;
        },
        // A marked circle that erupts after `delay`; it cannot be guarded, only rolled through or left
        beam({ x, z, radius = 2, delay = 0.85, dmg = 22, color = '#ff3a2a' }) {
            const b = BEAMS.find(q => q.t < 0);
            if (!b) return null;
            Object.assign(b, { x, z, radius, delay, dmg, t: 0, hit: false });
            b.mark.scale.setScalar(radius);
            b.mark.material.color.set(color);
            b.pillar.material.color.set(color);
            b.pillar.scale.set(3.4 * radius / 2, 22, 1);
            return b;
        },
        // Any telegraphed ground area. It fills in over `delay`, lands once (hurting the visitor if they are inside
        // and not rolling), then fades.
        //   circle: centre (x, z), radius r, optional hole r0
        //   sector: a slice from (x, z) facing yaw, radius r (hole r0), `arc` radians wide in all
        //   rect:   starts at (x, z) and runs `l` forwards along yaw, `w` wide
        // Not blockable unless you pass blockable: true. onLand(zone) is called when it lands.
        zone({ shape = 'circle', x, z, yaw = 0, r = 2, r0 = 0, arc = Math.PI / 2, w = 2, l = 4, delay = 0.8, dmg = 24, color = '#ff2a1a', blockable = false, onLand = null }) {
            const o = ZONES.find(q => !q.live);
            if (!o) return null;
            Object.assign(o, { live: true, shape, x, z, yaw, r, r0, arc, w, l, delay: Math.max(0.01, delay), dmg, t: 0, landed: false, unblockable: !blockable, onLand });
            const g = zoneGeo(shape, shape === 'rect' ? 0 : r0 / r, shape === 'sector' ? arc : 0);
            for (const m of [o.area, o.fill]) {
                m.geometry = g;
                m.position.set(x, m === o.area ? 0.043 : 0.044, z);
                m.rotation.z = yaw;
                m.material.color.set(color);
                m.material.opacity = 0;
                m.visible = true;
            }
            if (shape === 'rect') o.area.scale.set(w, l, 1); else o.area.scale.setScalar(r);
            return o;
        },
        // Call every frame a melee weapon is live: tests the segment a→b (arena coordinates, seen from above) against
        // the visitor, once per swing `id`. The first frame it touches them uses the swing up, whatever came of it.
        blade(id, a, b, radius, dmg, opts = {}) {
            if (used.includes(id)) return null;
            const P = player.state;
            const was = swept.get(id);
            let touch = bladeTouches(P, a.x, a.y || 0, a.z, b.x, b.y || 0, b.z, radius);
            // Where it was between the last frame and this one
            if (!touch && was && clk - was.t < 0.12) for (const k of [1 / 3, 2 / 3]) {
                if (bladeTouches(P, mix(was.ax, a.x, k), mix(was.ay, a.y || 0, k), mix(was.az, a.z, k), mix(was.bx, b.x, k), mix(was.by, b.y || 0, k), mix(was.bz, b.z, k), radius)) { touch = true; break; }
            }
            if (!was && swept.size > 24) swept.clear();
            swept.set(id, { ax: a.x, ay: a.y || 0, az: a.z, bx: b.x, by: b.y || 0, bz: b.z, t: clk });
            if (!touch) return null;
            swept.delete(id);
            used.push(id);
            if (used.length > 16) used.shift();
            return hitPlayer(dmg, opts.fromX ?? (form ? form.x : a.x), opts.fromZ ?? (form ? form.z : a.z), opts.kind ? opts : Object.assign({ kind: 'blade' }, opts));
        },
        // Remove everything (cut-scenes, falls)
        clear() {
            for (const w of WAVES) { w.live = false; w.mesh.visible = false; }
            for (const o of ORBS) { o.live = false; o.sp.visible = false; }
            for (const b of BEAMS) { b.t = -1; b.mark.visible = b.pillar.visible = false; }
            for (const o of ZONES) { o.live = false; o.area.visible = o.fill.visible = false; }
            for (const m of MARKS) m.mesh.visible = false;
            used.length = 0;
            swept.clear();
        },
        // Whether something is about to land at this point (for the test bot)
        near(x, z) {
            for (const w of WAVES) if (w.live && !w.hit && Math.abs(Math.hypot(x - w.x, z - w.z) - w.r) < 1.6) return true;
            for (const o of ORBS) if (o.live && Math.hypot(o.p.x - x, o.p.z - z) < 2.2) return true;
            for (const b of BEAMS) if (b.t > b.delay - 0.3 && b.t < b.delay && Math.hypot(x - b.x, z - b.z) < b.radius + 0.3) return true;
            for (const o of ZONES) if (o.live && !o.landed && o.t > o.delay - 0.35 && inZone(o, x, z, 0.3)) return true;
            return false;
        }
    };
    const _h = V();
    function hazards(dt) {
        const P = player.state;
        for (const w of WAVES) {
            if (!w.live) continue;
            w.r += w.speed * dt;
            w.mesh.visible = true;
            w.mesh.position.set(w.x, 0.05, w.z);
            w.mesh.scale.setScalar(w.r);
            w.mesh.material.opacity = 0.75 * (1 - w.r / (w.max + 1));
            if (!w.hit && Math.abs(Math.hypot(P.x - w.x, P.z - w.z) - w.r) < w.thick) w.hit = hitPlayer(w.dmg, w.x, w.z, { kind: 'wave' }) !== null;
            if (w.r > w.max) { w.live = false; w.mesh.visible = false; }
        }
        for (const o of ORBS) {
            o.sp.visible = o.live;
            if (!o.live) continue;
            o.age += dt;
            // They bend towards the visitor for a moment, then fly straight
            if (o.age < o.homing) {
                _h.set(P.x - o.p.x, 1.2 - o.p.y, P.z - o.p.z).normalize().multiplyScalar(o.v.length());
                o.v.lerp(_h, Math.min(1, dt * 2.2));
            }
            o.p.addScaledVector(o.v, dt);
            o.sp.position.copy(o.p);
            if (Math.hypot(o.p.x - P.x, o.p.z - P.z) < 0.85 && o.p.y < 2.6) {
                const r = hitPlayer(o.dmg, o.p.x, o.p.z, { kind: 'orb' });
                if ((r && r !== 'dodged') || !P.inv) o.live = false;
            }
            if (o.age > o.life || o.p.y < 0.1) o.live = false;
        }
        for (const b of BEAMS) {
            if (b.t < 0) { b.mark.visible = b.pillar.visible = false; continue; }
            b.t += dt;
            b.mark.visible = true;
            b.mark.position.set(b.x, 0.045, b.z);
            b.pillar.position.set(b.x, 10, b.z);
            if (b.t < b.delay) { b.mark.material.opacity = 0.1 + 0.3 * b.t / b.delay; b.pillar.visible = false; }
            else {
                b.pillar.visible = true;
                const k = 1 - (b.t - b.delay) / 0.4;
                b.pillar.material.opacity = Math.max(0, k);
                b.mark.material.opacity = Math.max(0, k) * 0.8;
                if (!b.hit) { b.hit = true; sfx.thud(); if (Math.hypot(P.x - b.x, P.z - b.z) < b.radius * 1.05) hitPlayer(b.dmg, b.x, b.z, { kind: 'beam', unblockable: true }); }
                if (k <= 0) b.t = -1;
            }
        }
        for (const o of ZONES) {
            if (!o.live) continue;
            o.t += dt;
            if (!o.landed) {
                const k = clamp01(o.t / o.delay);
                o.area.material.opacity = 0.1 + 0.15 * k;
                o.fill.material.opacity = 0.18 + 0.3 * k;
                if (o.shape === 'rect') o.fill.scale.set(o.w, o.l * Math.max(0.001, k), 1); else o.fill.scale.setScalar(o.r * Math.max(0.001, k));
                if (o.t >= o.delay) {
                    o.landed = true;
                    o.t = o.delay;
                    o.fill.material.opacity = 0.9;
                    if (o.dmg > 0 && inZone(o, P.x, P.z)) hitPlayer(o.dmg, o.x, o.z, { kind: 'zone', unblockable: o.unblockable });
                    if (o.onLand) o.onLand(o); else sfx.thud();
                }
            } else {
                const k = 1 - (o.t - o.delay) / 0.35;
                o.area.material.opacity = Math.max(0, k) * 0.5;
                o.fill.material.opacity = Math.max(0, k) * 0.9;
                if (k <= 0) { o.live = false; o.area.visible = o.fill.visible = false; }
            }
        }
    }

    // ── Ground marks: faint red pictures of where a blow will pass ──
    ctx.mark = {
        // samples: segments [ax, az, bx, bz] in the attacker's own frame (it at the origin, facing +z), in whatever
        // units you will later scale by; radius: how wide the danger is either side of each, in the same units;
        // extent: half the picture's width (worked out from the samples if left out). Builds the picture once.
        trace(samples, radius, extent) {
            if (!extent) { extent = radius; for (const s of samples) for (const v of s) extent = Math.max(extent, Math.abs(v) + radius); }
            const N = 128, c = document.createElement('canvas');
            c.width = c.height = N;
            const g = c.getContext('2d');
            g.fillStyle = '#000';
            g.fillRect(0, 0, N, N);
            g.strokeStyle = '#fff';
            g.lineCap = g.lineJoin = 'round';
            g.lineWidth = radius / (2 * extent) * N * 2;
            const px = v => (v / (2 * extent) + 0.5) * N;
            for (const [ax, az, bx, bz] of samples) { g.beginPath(); g.moveTo(px(ax), px(az)); g.lineTo(px(bx), px(bz)); g.stroke(); }
            const m = kit.redMaterial();
            m.alphaMap = new THREE.CanvasTexture(c);
            const h = { mesh: flat(new THREE.Mesh(new THREE.PlaneGeometry(2 * extent, 2 * extent), m)), extent };
            MARKS.push(h);
            return h;
        },
        // Lay it at (x, z) turned to yaw, scaled; strength 0..1 is how close the blow is
        show(h, x, z, yaw, scale = 1, strength = 1) {
            h.mesh.visible = true;
            h.mesh.position.set(x, 0.042, z);
            h.mesh.rotation.z = yaw;
            h.mesh.scale.setScalar(scale);
            h.mesh.material.opacity = 0.08 + 0.3 * strength;
        },
        hide(h) { h.mesh.visible = false; }
    };

    // ═════════════ Cut-scenes ═════════════
    // While one runs, play is frozen (the visitor's input is ignored, the fight clock stops, nothing can hurt), the
    // black bars are up, and the script owns the camera. Skipping makes every pending wait resolve at once.
    const C = { active: false, skipped: false, t: 0, id: 0, each: [], waits: [], done: Promise.resolve(), pos: V(), look: V(), tween: null, cardUntil: -1, faded: false };
    const setV = (out, v) => (Array.isArray(v) ? out.fromArray(v) : out.set(v.x, v.y, v.z));
    const setFov = f => { camera.fov = f; camera.updateProjectionMatrix(); };
    function hideCard() { if (C.cardUntil >= 0) { $('phase').hidden = true; C.cardUntil = -1; } }
    function flush() { const w = C.waits; C.waits = []; for (const x of w) x.r(); }
    function skipCine() {
        if (!C.active || C.skipped) return;
        C.skipped = true;
        if (C.tween) { const tw = C.tween; C.pos.copy(tw.p1); C.look.copy(tw.l1); if (tw.f1) setFov(tw.f1); C.tween = null; }
        hideCard();
        flush();
    }
    async function cineRun(fn) {
        while (C.active) await C.done;
        const id = ++C.id;
        let release;
        C.done = new Promise(r => { release = r; });
        C.active = true; C.skipped = false; C.t = 0; C.each = []; C.waits = []; C.tween = null; C.cardUntil = -1; C.faded = false;
        ctx.toArena(C.pos.copy(camera.position));
        ctx.toArena(C.look.copy(env.look));
        haz.clear();
        document.body.classList.add('cine');
        const now = () => C.skipped || id !== C.id;
        const wait = s => (now() ? Promise.resolve() : new Promise(r => C.waits.push({ at: C.t + s, r })));
        const shot = {
            get skipped() { return C.skipped; },
            get t() { return C.t; },
            cam(pos, look, o) { if (id !== C.id) return; setV(C.pos, pos); setV(C.look, look); C.tween = null; if (o && o.fov) setFov(o.fov); },
            move(pos, look, seconds, o = {}) {
                if (id !== C.id) return Promise.resolve();
                if (now() || !(seconds > 0)) { shot.cam(pos, look, o); return Promise.resolve(); }
                C.tween = { p0: C.pos.clone(), l0: C.look.clone(), p1: setV(V(), pos), l1: setV(V(), look), f0: camera.fov, f1: o.fov || 0, t0: C.t, dur: seconds, ease: o.ease || kit.ease };
                return wait(seconds);
            },
            wait,
            until: fn => (now() || fn() ? Promise.resolve() : new Promise(r => C.waits.push({ check: fn, r }))),
            card(title, sub = '', seconds = 2.5) {
                if (now()) return Promise.resolve();
                $('phaseTitle').textContent = title;
                $('phaseHint').textContent = sub;
                $('phase').hidden = false;
                C.cardUntil = C.t + seconds;
                return wait(seconds);
            },
            fade(toBlack, seconds = 0.6) {
                if (id !== C.id) return Promise.resolve();
                $('fade').style.transitionDuration = seconds + 's';
                env.fade(toBlack);
                C.faded = toBlack;
                return wait(seconds);
            },
            slow(scale) { if (id === C.id) { warp = scale; warpRate = scale >= 1 ? 4 : 0; } },
            shake: k => ctx.shake(k),
            say: (text, seconds) => line(text, seconds),
            each(f) { if (id === C.id) C.each.push(f); }
        };
        try { await fn(shot); }
        catch (e) { console.error('[fight] a cut-scene failed:', e); }
        if (id === C.id) {
            C.active = false;
            C.each = [];
            flush();
            hideCard();
            C.tween = null;
            document.body.classList.remove('cine');
            $('fade').style.transitionDuration = '';
            if (C.faded) env.fade(false);
            setFov(env.baseFov());
            warp = 1; warpRate = 4;
            env.snap();
        }
        release();
    }
    function cineFrame(dt, raw) {
        C.t += raw;
        for (let i = 0; i < C.each.length; i++) C.each[i](dt, C.t);
        for (let i = C.waits.length - 1; i >= 0; i--) {
            const w = C.waits[i];
            if (w.check ? w.check() : C.t >= w.at) { C.waits.splice(i, 1); w.r(); }
        }
        if (C.cardUntil >= 0 && C.t >= C.cardUntil) hideCard();
        const tw = C.tween;
        if (tw) {
            const k = clamp01((C.t - tw.t0) / tw.dur), e = tw.ease(k);
            C.pos.lerpVectors(tw.p0, tw.p1, e);
            C.look.lerpVectors(tw.l0, tw.l1, e);
            if (tw.f1) setFov(mix(tw.f0, tw.f1, e));
            if (k >= 1) C.tween = null;
        }
    }
    ctx.cine = { run: cineRun, get active() { return C.active; } };

    // ═════════════ The visitor ═════════════
    const player = createPlayer(ctx, env);

    // ═════════════ Forms, one after another ═════════════
    function load(i) {
        if (mods[i] !== undefined) return Promise.resolve(mods[i]);
        if (!pending[i]) {
            pending[i] = Promise.resolve()
                .then(() => loaders[i]())
                .then(m => { if (!m || typeof m.create !== 'function') throw new Error('it has no create()'); return m; })
                .catch(e => { console.warn(`[fight] form ${i + 1} is missing or broken, so it is skipped:`, (e && e.message) || e); return null; })
                .then(m => (mods[i] = m));
        }
        return pending[i];
    }
    function preloadFrom(j) { if (j < loaders.length) load(j).then(m => { if (m === null) preloadFrom(j + 1); }); }
    // True once every form after i is known to be missing
    const isLast = i => { for (let j = i + 1; j < loaders.length; j++) if (mods[j] !== null) return false; return true; };

    // A form's own code failing during the fight: say so, and move on to the next so the fight can still end
    function safely(f, fn) {
        try { fn(); }
        catch (e) {
            console.error(`[fight] form '${f.id}' failed, moving on:`, e);
            if (f !== form) return;
            const id = run;
            try { f.dispose(); } catch (e2) { /* already broken */ }
            form = null;
            mods[formIndex] = null;
            if (C.active) skipCine();
            Promise.resolve().then(() => beginForm(formIndex + 1, id));
        }
    }
    function wrapDamage(f) {
        const raw = f.damage.bind(f);
        f.damage = (amount, info) => {
            if (mode !== 'play' || f !== form) return NONE;
            let r = NONE;
            safely(f, () => { r = raw(amount, info) || NONE; });
            if (r.dealt > 0) {
                const P = player.state;
                ctx.shake(0.35);
                spark(mix(P.x, f.x, 0.75), 1.6, mix(P.z, f.z, 0.75));
                sfx.thud();
            }
            if (r.staggered) score.stinger('stagger');
            if (r.dead) defeated(f);
            return r;
        };
    }

    function beginForm(i, id) {
        if (id !== run) return;
        if (i >= loaders.length) return finish(beaten ? rankNow() : '—');
        if (mods[i] === undefined) { mode = 'next'; load(i).then(() => beginForm(i, id)); return; }
        if (mods[i] === null) return beginForm(i + 1, id);
        let f;
        try { f = mods[i].create(ctx); }
        catch (e) { console.error(`[fight] form ${i + 1} would not start, so it is skipped:`, e); mods[i] = null; return beginForm(i + 1, id); }
        form = f; formIndex = i;
        wrapDamage(f);
        preloadFrom(i + 1);
        ctx.setBoss(f.name, f.sub);
        shown = f.hp ?? f.hpMax;
        $('boss').hidden = false;
        mode = 'intro'; modeT = 0;
        cineRun(shot => (f.intro ? f.intro(shot) : null)).then(() => afterIntro(f, id));
    }
    function afterIntro(f, id) {
        if (id !== run || f !== form) return;
        if (!carded) {
            // The first time: the controls, over the fight, until they are touched
            carded = true;
            mode = 'ready'; modeT = 0; cardT = 0;
            $('phaseTitle').textContent = f.name;
            $('phaseHint').innerHTML = env.touch
                ? 'Left thumb to move. <b>HIT</b> to strike (hold for <b>HEAVY</b>), <b>ROLL</b> through attacks (hold to sprint),<br>hold <b>GUARD</b> to block, raise it late to parry. <b>✚</b> heals. <b>ART</b> appears when its meter is full.'
                : '<b>W A S D</b> move &nbsp; <b>J</b> / <b>CLICK</b> strike &nbsp; <b>F</b> heavy (hold to charge) &nbsp; <b>SPACE</b> roll, hold to sprint<br><b>SHIFT</b> / <b>RIGHT CLICK</b> guard, raise it late to parry &nbsp; <b>E</b> heal &nbsp; <b>R</b> ember art &nbsp; <b>Q</b> lock-on';
            $('phase').hidden = false;
            sfx.thud();
            env.snap();
        } else beginPlay();
    }
    function beginPlay() {
        mode = 'play'; modeT = 0;
        const f = form;
        if (!f) return;
        safely(f, () => f.start());
        score.start(f.id);
    }
    function defeated(f) {
        mode = 'won'; modeT = 0;
        beaten++;
        const id = run, last = isLast(formIndex);
        if (last) { sfx.setDrone(false); droneOff = true; }
        score.stinger(last ? 'victory' : 'phase');
        cineRun(shot => (f.outro ? f.outro(shot) : null)).then(async () => {
            if (id !== run || f !== form) return;
            // Is anything left to fight?
            let next = formIndex + 1;
            while (next < loaders.length && (await load(next)) === null) next++;
            if (id !== run) return;
            if (next >= loaders.length) return finish(rankNow());
            try { f.dispose(); } catch (e) { console.error(e); }
            form = null;
            beginForm(next, id);
        });
    }
    const rankNow = () => (deaths === 0 && hits <= 2 ? 'S' : deaths === 0 ? 'A' : deaths <= 1 ? 'B' : deaths <= 3 ? 'C' : 'D');
    function finish(r) {
        if (done) return;
        rank = r; done = true;
        if (r !== '—' && !droneOff) { sfx.setDrone(false); droneOff = true; }
        score.stop();
    }

    // ── Falling, and getting up again ──
    function died() {
        deaths++;
        mode = 'dead'; modeT = 0;
        sfx.roar(2.4);
        score.stinger('death');
    }
    function respawn() {
        // Back to the start of this form (the form decides what that means), with one more ember than last time
        haz.clear();
        player.reset(false, Math.min(6, 3 + deaths));
        player.show(true);
        for (const id of ['phase', 'fell']) $(id).hidden = true;
        $('say').textContent = '';
        warp = 1; warpRate = 4; shakeK = 0;
        mode = 'play'; modeT = 0;
        const f = form;
        if (f) { safely(f, () => { f.restart(); f.start(); }); if (form) shown = form.hp ?? form.hpMax; }
        env.snap();
        env.fade(false);
    }

    // ═════════════ Every frame ═════════════
    function frame(dt) {
        if (mode === 'off' || done) return;
        const raw = warp > 0 ? dt / warp : dt;
        clk += dt;
        if (warpRate > 0) warp = Math.min(1, warp + dt * warpRate);
        if (C.active) {
            cineFrame(dt, raw);
            player.update(dt);
        } else {
            T += dt;
            modeT += dt;
            if (mode === 'ready') {
                cardT += dt;
                if (cardT > 3.9 || (cardT > 0.8 && player.touched())) { $('phase').hidden = true; beginPlay(); }
            } else if (mode === 'play') {
                time += dt;
                const fm = form;
                if (fm && score.intensity) score.intensity(Math.max(0.15, 1 - fm.hp / (fm.hpMax || 1), player.state.hp < 30 ? 0.8 : 0));
            }
            else if (mode === 'dead') {
                if (modeT > 1.3) $('fell').hidden = false;
                if (modeT > 3) env.fade(true);
                if (modeT > 3.8) { respawn(); return; }
            }
            player.update(dt);
            const f = form;
            if (f && !C.active && (mode === 'ready' || mode === 'play' || mode === 'dead')) safely(f, () => f.update(dt));
        }
        hazards(dt);
        effects(dt, raw);
        player.place();
        // The boss bar catches up with its health
        if (form) {
            shown = toward(shown, form.hp ?? 0, 6, dt);
            $('bossFill').style.width = shown / (form.hpMax || 100) * 100 + '%';
        }
        // ── Camera ──
        shakeK = toward(shakeK, 0, 5, dt);
        jolt.x = Math.sin(clk * 47) * shakeK * 0.07;
        jolt.y = Math.cos(clk * 53) * shakeK * 0.07;
        if (C.active) {
            ctx.toWorld(env.camTo.copy(C.pos)).add(_h.set(jolt.x, jolt.y, 0));
            ctx.toWorld(env.look.copy(C.look));
            env.snap();
        } else player.camera(dt);
        // A fixed viewpoint for checking poses (debug only)
        const v = api.view;
        if (v) { ctx.toWorld(env.camTo.set(v[0], v[1], v[2])); ctx.toWorld(env.look.set(v[3], v[4], v[5])); env.snap(); }
    }
    // After the animation mixers: forms pose their bodies and test their weapons, the visitor's guard is posed
    function pose(dt) {
        if (mode === 'off') return;
        const f = form;
        if (f) safely(f, () => f.pose(dt));
        player.pose(dt);
    }

    // ═════════════ Starting, leaving, and tidying up ═════════════
    function reset() {
        run++;
        if (C.active) skipCine();
        if (form) { try { form.dispose(); } catch (e) { console.error(e); } }
        form = null; formIndex = -1; beaten = 0;
        haz.clear();
        for (const s of sparks) s.visible = false;
        for (const m of motes) m.life = 0;
        for (let i = 0; i < DUST; i++) dustPos[i * 3 + 1] = -50;
        dustGeo.attributes.position.needsUpdate = true;
        flashA = 0; flashEl.style.opacity = 0;
        mode = 'off'; modeT = 0; T = 0;
        done = false; rank = null; deaths = 0; hits = 0; parries = 0; time = 0;
        carded = false; droneOff = false;
        warp = 1; warpRate = 4; shakeK = 0;
        player.reset(true);
        player.show(false);
        for (const id of ['phase', 'fell']) $(id).hidden = true;
        $('say').textContent = '';
    }
    function start(n = 0) {
        reset();
        const id = run;
        mode = 'next';
        document.body.classList.add('fighting');
        player.begin();
        env.snap();
        beginForm(n, id);
    }
    function abort() {
        if (done) return;
        run++;
        rank = '—'; done = true;
        if (C.active) skipCine();
        score.stop();
    }
    // The fight's last word: how it went
    const RANKS = ['—', 'D', 'C', 'B', 'A', 'S'];
    function result() {
        const r = rank || '—', s = Math.round(time);
        $('rank').textContent = r;
        $('endTitle').textContent = r === '—' ? `${lastName} WAITS` : `${lastName} FALLS`;
        $('endLine').textContent = r === '—' ? 'You stepped past the fight.' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · fell ${deaths} time${deaths === 1 ? '' : 's'} · struck ${hits} time${hits === 1 ? '' : 's'} · ${parries} parr${parries === 1 ? 'y' : 'ies'}`;
        player.show(false);
        for (const id of ['fell', 'phase']) $(id).hidden = true;
        document.body.classList.remove('cine');
        if (RANKS.indexOf(r) > RANKS.indexOf(env.store.get('aumritash-rank') || '—')) env.store.set('aumritash-rank', r);
        env.track('fight', `${r} · ${s}s · ${deaths} deaths · ${hits} hits · ${parries} parries`);
    }

    load(0);

    const api = {
        ctx, player,
        start, frame, pose, abort, reset, result,
        skip() { if (C.active && !C.skipped) { skipCine(); return true; } return false; },
        bot: (on = true, skill = 0.9, parry = false) => player.bot(on, skill, parry),
        view: null,
        get on() { return mode !== 'off' && !done; },
        get done() { return done; },
        get warp() { return warp; },
        get mode() { return mode; },
        get form() { return form; },
        get cine() { return C.active; },
        get rank() { return rank; },
        get stats() { return { mode, deaths, hits, parries, time: +time.toFixed(1), rank, form: form && form.id, beaten }; }
    };
    return api;
}
