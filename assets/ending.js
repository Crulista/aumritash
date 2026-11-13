// The end of the tower: once the last form is down, the visitor stands at the cold brazier with what is left of it
// and chooses. KEEP: the brazier is lit, fires answer from the dark, and the place stays as it is (and remembers).
// END: the bowl is struck from its stand, the roof comes apart from the outside in, the screen itself breaks, and
// from then on every page in this browser is a dead screen (assets/dead.js).
// The choice is stored as localStorage 'aumritash-end' = { c: 'keep' | 'destroy', n: name, d: ISO date }.
//
//   const ending = createEnding(env)
//   ending.enter(rank)      start (rank '—' means the fight was stepped past: nothing to choose)
//   ending.update(dt)       every frame; true once the result card should come up. Never true after END.
//   ending.reset()          put the roof back (before the fight is played again)
// Positions in here are arena-local unless they say otherwise; the arena's brazier is at its origin.
import * as THREE from 'three';
import { mix, clamp01, ramp, toward, angDiff, glowTexture, eyePair, setOpen } from './fight/kit.js';

const KEY = 'aumritash-end';
const LINES = ['SO. YOU SAW ALL OF IT.', 'IT IS YOURS NOW, {NAME}.', 'KEEP IT. OR END IT.'];

export function createEnding(env) {
    const { arena, world, camTo, look, hero, heroCls, sfx, $, store, track } = env;
    const GLOW = glowTexture();
    const rand = Math.random;
    const O = arena.position;                       // arena-local → world is just this offset
    const group = new THREE.Group();                // everything the ending adds to the roof
    arena.add(group);

    let stage = 'off', t = 0, rank = '—', fired = new Set(), saying = null;
    const at = (key, when) => { if (t >= when && !fired.has(key)) { fired.add(key); return true; } return false; };
    const go = s => { stage = s; t = 0; fired = new Set(); };

    // ── Words: typed out, in a paler voice than the boss's ──
    function say(text, hold = 2.6) {
        saying = text ? { text: text.replace('{NAME}', env.who), n: 0, left: hold } : null;
        $('say').classList.toggle('soft', !!text);
        if (!text) $('say').textContent = '';
    }
    function sayFrame(dt) {
        if (!saying) return;
        const s = saying;
        if (s.n < s.text.length) { s.n = Math.min(s.text.length, s.n + dt * 26); $('say').textContent = s.text.slice(0, Math.floor(s.n)); }
        else if ((s.left -= dt) <= 0) say(null);
    }

    // ── Where everyone is ──
    const S = { sx: 0, sz: 1, hx: 0, hz: 0, mx: 0, mz: 0 };     // seat direction, the visitor's spot, the direction between them
    const heroAt = new THREE.Vector3(), cam = new THREE.Vector3(), aim = new THREE.Vector3();
    let walkDone = false;
    function setCam(snap) {
        camTo.copy(cam).add(O);
        look.copy(aim).add(O);
        if (snap) env.snap();
    }
    function stage0() {
        heroAt.copy(hero.root.position).sub(O);
        const l = Math.hypot(heroAt.x, heroAt.z) || 1;
        // What is left of it sits where the last form came down: on the visitor's side of the brazier
        S.sx = heroAt.x / l; S.sz = heroAt.z / l;
        const a = Math.atan2(S.sx, S.sz) + 1.25;
        S.hx = Math.sin(a) * 1.75; S.hz = Math.cos(a) * 1.75;
        const mx = S.sx + Math.sin(a), mz = S.sz + Math.cos(a), ml = Math.hypot(mx, mz) || 1;
        S.mx = mx / ml; S.mz = mz / ml;
        walkDone = false;
    }
    // The visitor walks round to their place at the brazier, then turns to it
    function walkFrame(dt) {
        const p = hero.root.position, tx = S.hx + O.x, tz = S.hz + O.z;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        let face;
        if (!walkDone && d > 0.08) {
            const step = Math.min(d, 1.5 * dt);
            p.x += dx / d * step; p.z += dz / d * step;
            face = Math.atan2(dx, dz);
            hero.play(heroCls.walk, { fade: 0.25 });
            env.steps();
        } else {
            if (!walkDone) { walkDone = true; hero.play(heroCls.walkIdle, { fade: 0.4 }); }
            face = Math.atan2(O.x - p.x, O.z - p.z);
        }
        p.y = toward(p.y, 0, 6, dt);
        hero.root.rotation.y += angDiff(face, hero.root.rotation.y) * Math.min(1, dt * 6);
    }

    // ═════════════ KEEP: the fire ═════════════
    const fire = new THREE.Group();
    fire.position.y = 0.85;
    fire.visible = false;
    group.add(fire);
    const tongues = [['#ff5a14', 1.5, 0.35], ['#ff8a2a', 1.15, 0.55], ['#ffc060', 0.8, 0.7], ['#fff0c0', 0.45, 0.6]].map(([color, size, y], i) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        s.userData = { size, y, ph: i * 1.7 };
        fire.add(s);
        return s;
    });
    const fireLight = new THREE.PointLight('#ff9a48', 0, 26, 1.3);
    fireLight.position.y = 1.6;
    group.add(fireLight);
    const EMBERS = 46;
    const emberPos = new Float32Array(EMBERS * 3).fill(-99), emberV = Array.from({ length: EMBERS }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: '#ffb060', size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    embers.frustumCulled = false;
    group.add(embers);
    // Fires far off in the dark, lit one after another once this one catches
    const far = [];
    function buildFar() {
        const mid = Math.atan2(S.mx, S.mz);
        for (let i = 0; i < 30; i++) {
            const a = mid + (rand() - 0.5) * 2.7, r = 42 + rand() * 70;
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: i % 3 ? '#ff9a40' : '#ffc878', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
            s.position.set(Math.sin(a) * r, -1 - rand() * (r / 9), Math.cos(a) * r);
            s.userData = { size: (0.9 + rand() * 1.3) * (r / 55), at: 3.2 + i * 0.17 + rand() * 0.25, lit: 0, ph: rand() * 6 };
            group.add(s);
            far.push(s);
        }
    }
    let burn = 0, burnTo = 0, flick = 0;
    function fireFrame(dt) {
        burn = toward(burn, burnTo, 1.6, dt);
        flick += dt;
        fire.visible = burn > 0.01;
        if (!fire.visible) { fireLight.intensity = 0; return; }
        for (const s of tongues) {
            const u = s.userData, w = 0.85 + 0.15 * Math.sin(flick * (9 + u.ph) + u.ph) + 0.08 * Math.sin(flick * 23 + u.ph * 3);
            s.scale.set(u.size * burn * w, u.size * burn * (1.25 + 0.2 * Math.sin(flick * 13 + u.ph)), 1);
            s.position.set(Math.sin(flick * 7 + u.ph) * 0.04, u.y * burn, 0);
        }
        fireLight.intensity = burn * (13 + Math.sin(flick * 17) * 1.4 + Math.sin(flick * 31) * 0.8);
        for (let i = 0; i < EMBERS; i++) {
            const e = emberV[i], o = i * 3;
            if (e.life <= 0) {
                if (rand() < dt * 3 * burn) { e.life = 1.2 + rand() * 1.6; emberPos[o] = (rand() - 0.5) * 0.4; emberPos[o + 1] = 1; emberPos[o + 2] = (rand() - 0.5) * 0.4; e.vx = (rand() - 0.5) * 0.5; e.vy = 0.9 + rand() * 1.3; e.vz = (rand() - 0.5) * 0.5; }
                else emberPos[o + 1] = -99;
                continue;
            }
            e.life -= dt;
            emberPos[o] += (e.vx + Math.sin(flick * 3 + i) * 0.3) * dt; emberPos[o + 1] += e.vy * dt; emberPos[o + 2] += e.vz * dt;
        }
        emberGeo.attributes.position.needsUpdate = true;
        for (const s of far) {
            const u = s.userData;
            s.material.opacity = u.lit * (0.75 + 0.25 * Math.sin(flick * 5 + u.ph));
            s.scale.setScalar(u.size * (0.4 + 0.6 * u.lit));
        }
    }

    function keepFrame(dt) {
        if (at('line', 0.2)) { say('THEN IT STAYS.', 2.4); hero.play(heroCls.kindle, { fade: 0.3 }); }
        if (at('catch', 1.7)) {
            burnTo = 1;
            sfx.kindle(); sfx.setFire(true);
            save('keep');
            env.flash('#ffd9a0', 0.5);
            buildFar();
        }
        if (at('stand', 3.6)) hero.play(heroCls.walkIdle, { fade: 0.6 });
        for (const s of far) if (t > s.userData.at) { if (!s.userData.lit) sfx.tick(); s.userData.lit = toward(s.userData.lit || 0.01, 1, 2.5, dt); }
        if (at('line2', 6.4)) say('SIT A WHILE.', 3);
        if (at('sit', 7.0)) hero.play('Sitting_Idle_Loop', { fade: 0.9 });
        // Camera: close on the catching fire, then up and back until the far fires are in the frame
        const k = ramp(t, 2.2, 9.5);
        cam.set(-S.mx * mix(3.6, 9.5, k), mix(1.3, 5.2, k), -S.mz * mix(3.6, 9.5, k));
        aim.set(S.mx * mix(0.6, 5, k), mix(1.1, 0.6, k), S.mz * mix(0.6, 5, k));
        setCam();
        if (at('fade', 10.6)) env.fade(true);
        if (t > 11.5) { card(); return true; }
    }

    // ═════════════ END: the collapse ═════════════
    let debris = [], tiles = null, bowlV = null, heroFall = null, shards = null, snapAt = 0, gone = false;
    const G = 9.5;
    // The floor is one disc; to break, it is swapped for a hundred wedges that lie exactly where it did
    function buildTiles() {
        const floor = env.floor, RINGS = [0, 2.6, 5.2, 7.8, 10.4, 13], SEG = [8, 14, 20, 26, 32];
        const map = floor.material.map.clone();
        map.needsUpdate = true;
        map.repeat.set(10 / 26, 10 / 26);
        const material = new THREE.MeshLambertMaterial({ map, color: floor.material.color });
        tiles = [];
        for (let r = 0; r < 5; r++) for (let i = 0; i < SEG[r]; i++) {
            const a0 = i / SEG[r] * Math.PI * 2, a1 = (i + 1) / SEG[r] * Math.PI * 2, r0 = RINGS[r], r1 = RINGS[r + 1];
            const shape = new THREE.Shape();
            // Shape y is the arena's −z (the wedge is laid flat afterwards)
            const P = (rad, a) => [Math.cos(a) * rad, -Math.sin(a) * rad];
            shape.moveTo(...P(r0, a0));
            for (let j = 0; j <= 3; j++) shape.lineTo(...P(r1, mix(a0, a1, j / 3)));
            for (let j = 3; j >= 0; j--) if (r0 > 0 || j === 3) shape.lineTo(...P(r0, mix(a0, a1, j / 3)));
            const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, cx = Math.cos(am) * rm, cz = Math.sin(am) * rm;
            const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false });
            geo.translate(-cx, cz, -0.45);
            geo.rotateX(-Math.PI / 2);
            const m = new THREE.Mesh(geo, material);
            m.position.set(cx, 0, cz);
            group.add(m);
            const item = { o: m, delay: 0.5 + (4 - r) * 1.15 + rand() * 1.0, v: 0, tilt: new THREE.Vector3(-Math.sin(am), 0, Math.cos(am)).multiplyScalar(rand() < 0.5 ? 1 : -1), w: 0.5 + rand() * 1.4, fell: false, r };
            tiles.push(item);
            debris.push(item);
        }
        floor.visible = false;
    }
    function collectDebris() {
        // Everything else standing on the roof: the wall's teeth, the brazier's stand, whatever the fight left behind
        for (const o of arena.children) {
            if (o === group || o === env.floor || o.isLight || !o.visible || o === env.bowl) continue;
            const r = Math.hypot(o.position.x, o.position.z);
            if (r > 14) continue;
            const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
            debris.push({ o, delay: r > 11 ? 0.1 + rand() * 2.6 : 0.5 + (4 - Math.min(4, Math.floor(r / 2.6))) * 1.15 + rand() * 0.6, v: 0, tilt: axis, w: 0.4 + rand() * 1.2, fell: false, home: o.position.clone(), quat: o.quaternion.clone(), out: r > 11 ? 1.4 : 0 });
        }
    }
    // What the collapse is seen by: a red glow coming up from under the roof, a cold light from above so the stone
    // still reads, and the eyes, back in the dark all round to watch it go
    let pit = null;
    function buildPit() {
        const under = new THREE.PointLight('#ff2a1a', 0, 70, 1.1);
        under.position.y = -6;
        const key = new THREE.DirectionalLight('#b4c2e6', 0);
        key.position.set(-S.mx * 6 + 3, 12, -S.mz * 6);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#ff2414', transparent: true, opacity: 0, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false }));
        glow.position.y = -24;
        glow.scale.setScalar(36);
        group.add(under, key, key.target, glow);
        const eyes = [], mid = Math.atan2(S.mx, S.mz);
        for (let i = 0; i < 34; i++) {
            const a = mid + (rand() - 0.5) * 3.4, r = 19 + rand() * 13;
            const pair = eyePair(r / 8 * (0.7 + rand() * 0.7));
            pair.position.set(Math.sin(a) * r, 1.5 + rand() * 11, Math.cos(a) * r);
            pair.userData.at = 0.3 + rand() * 3.2;
            pair.userData.open = 0;
            setOpen(pair, 0);
            group.add(pair);
            eyes.push(pair);
        }
        pit = { under, key, glow, eyes, fog: world.fog && world.fog.density };
    }
    function pitFrame(dt, tt) {
        const k = ramp(tt, 0, 2.5);
        pit.under.intensity = k * (70 + Math.sin(tt * 11) * 8);
        pit.key.intensity = k * 2.6;
        pit.glow.material.opacity = k * 0.85;
        if (world.fog && pit.fog !== undefined) world.fog.density = mix(pit.fog, 0.012, k);
        for (const e of pit.eyes) if (tt > e.userData.at) { e.userData.open = toward(e.userData.open, 1, 5, dt); setOpen(e, e.userData.open); }
    }
    let crackT = 0;
    function debrisFrame(dt, tt) {
        crackT -= dt;
        for (const d of debris) {
            if (tt < d.delay) {
                // About to go: it shivers
                if (d.r !== undefined && tt > d.delay - 0.5) d.o.position.y = (rand() - 0.5) * 0.03;
                continue;
            }
            if (!d.fell) { d.fell = true; if (crackT <= 0) { crackT = 0.22; sfx.thud(); } }
            d.v += G * dt;
            d.o.position.y -= d.v * dt;
            if (d.out) { const p = d.o.position, l = Math.hypot(p.x, p.z) || 1; p.x += p.x / l * d.out * dt; p.z += p.z / l * d.out * dt; }
            d.o.rotateOnWorldAxis(d.tilt, d.w * dt);
            if (d.o.position.y < -70) d.o.visible = false;
        }
    }
    // The picture on the screen, cut into triangles that fall out of the frame
    function shatter() {
        const url = env.snapshot();
        const W = innerWidth, H = innerHeight, COLS = W > H ? 8 : 5, ROWS = W > H ? 5 : 8;
        const pts = [];
        for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
            const edge = i === 0 || j === 0 || i === COLS || j === ROWS;
            pts.push([i / COLS * W + (edge ? 0 : (rand() - 0.5) * W / COLS * 0.7), j / ROWS * H + (edge ? 0 : (rand() - 0.5) * H / ROWS * 0.7)]);
        }
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:40;overflow:hidden;background:#000;perspective:900px';
        const ix = W * (0.4 + rand() * 0.2), iy = H * (0.4 + rand() * 0.2), far_ = Math.hypot(W, H) * 0.6;
        const list = [];
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
            const a = pts[j * (COLS + 1) + i], b = pts[j * (COLS + 1) + i + 1], c = pts[(j + 1) * (COLS + 1) + i], d = pts[(j + 1) * (COLS + 1) + i + 1];
            for (const tri of (i + j) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]]) {
                const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
                const el = document.createElement('div');
                el.style.cssText = `position:absolute;inset:0;background:url(${url}) 0 0/100% 100% no-repeat;image-rendering:pixelated;will-change:transform;` +
                    `clip-path:polygon(${tri.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')});transform-origin:${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
                wrap.appendChild(el);
                const dx = cx - ix, dy = cy - iy, dl = Math.hypot(dx, dy) || 1;
                list.push({ el, dx: dx / dl, dy: dy / dl, delay: dl / far_ * 0.9 + rand() * 0.25, vx: dx / dl * (40 + rand() * 160), ax: rand() - 0.5, ay: rand() - 0.5, w: (rand() - 0.5) * 5 });
            }
        }
        document.body.appendChild(wrap);
        env.canvas.style.visibility = 'hidden';
        shards = { wrap, list };
    }
    function shardFrame(tt) {
        for (const s of shards.list) {
            // First the cracks open, then each piece lets go
            const open = clamp01(tt / 0.12) * 4, f = Math.max(0, tt - 0.55 - s.delay);
            s.el.style.transform = `translate(${(s.dx * open + s.vx * f).toFixed(1)}px,${(s.dy * open + 1500 * f * f).toFixed(1)}px) rotate3d(${s.ax.toFixed(2)},${s.ay.toFixed(2)},0.3,${(s.w * f).toFixed(3)}rad)`;
        }
    }
    function destroyFrame(dt) {
        if (at('line', 0.15)) say('THEN NOTHING STAYS.', 2.2);
        if (at('swing', 1.0)) { hero.stopAll(); hero.play('Sword_Attack', { fade: 0.1, once: true }); sfx.whoosh(); }
        if (at('hit', 1.43)) {
            // The bowl is knocked off its stand, away from the visitor
            save('destroy');
            const l = Math.hypot(S.hx, S.hz) || 1;
            bowlV = { vx: -S.hx / l * 4.2, vy: 3.4, vz: -S.hz / l * 4.2, axis: new THREE.Vector3(S.hz, 0, -S.hx).normalize(), bounced: 0 };
            sfx.thud(); env.flash('#ffffff', 0.25); env.shake(0.5);
        }
        if (bowlV && env.bowl) {
            const b = env.bowl, v = bowlV;
            v.vy -= G * dt;
            b.position.x += v.vx * dt; b.position.y += v.vy * dt; b.position.z += v.vz * dt;
            b.rotateOnWorldAxis(v.axis, 9 * dt);
            if (b.position.y < 0.25 && v.vy < 0 && v.bounced < 2 && (!tiles || t < 4)) { b.position.y = 0.25; v.vy *= -0.45; v.vx *= 0.7; v.vz *= 0.7; v.bounced++; sfx.tick(); }
        }
        if (at('still', 2.3)) hero.play(heroCls.walkIdle, { fade: 0.5 });
        // The dark comes back all at once: the dawn, and what sat by the brazier, are gone between two frames
        if (at('blink', 3.3)) { env.flash('#000000', 0.9); env.night(); sfx.setWind(true); }
        if (at('break', 4.0)) { buildTiles(); collectDebris(); buildPit(); sfx.rumble(7.5); }
        const tt = t - 4.0;
        if (tiles) {
            debrisFrame(dt, tt);
            pitFrame(dt, tt);
            env.shake(Math.min(1.6, 0.25 + tt * 0.22));
            if (at('roar', 6.5)) sfx.rumble(6);
            // The visitor goes when the stone under them does
            if (!heroFall && tt > 5.5) { heroFall = { v: 0 }; hero.stopAll(); hero.play('Jump_Start', { fade: 0.2, once: true }); }
            if (heroFall) { heroFall.v += G * dt; hero.root.position.y -= heroFall.v * dt; hero.root.rotation.x += dt * 0.9; }
        }
        // Camera: on the brazier for the blow, then back and up to watch the roof go from the edge in
        const k = ramp(t, 3.4, 6.5), fall = heroFall ? clamp01(-hero.root.position.y / 14) : 0;
        cam.set(-S.mx * mix(3.4, 8.8, k), mix(1.4, 4.4, k) + fall * 1.5, -S.mz * mix(3.4, 8.8, k));
        aim.set(S.mx * mix(0.5, 1.5, k), mix(1.0, 0.4, k) - fall * 9, S.mz * mix(0.5, 1.5, k));
        setCam(t > 3.3);
        // The screen breaks while there is still something on it to break
        if (heroFall && !shards && hero.root.position.y < -5) {
            shatter(); snapAt = t;
            sfx.thud(); sfx.roar(1.6);
            for (const el of document.querySelectorAll('.top, .sound, .say, .bars')) el.classList.add('dropped');
            env.halt();          // the 3D scene has been photographed; it stops here
        }
    }
    // After the scene has stopped: the pieces fall on their own clock, then there is nothing
    function afterFrame() {
        if (gone) return;
        const tt = (performance.now() - after0) / 1000;
        shardFrame(tt);
        if (tt > 3.4) {
            gone = true;
            sfx.setMuted(true);
            window.__dead && window.__dead(read(), true);
            return;
        }
        requestAnimationFrame(afterFrame);
    }
    let after0 = 0;

    // ── What was chosen ──
    const read = () => { try { return JSON.parse(store.get(KEY) || 'null'); } catch (e) { return null; } };
    function save(c) {
        const name = store.get('aumritash-name') || heroCls.name;
        store.set(KEY, JSON.stringify({ c, n: name, d: new Date().toISOString() }));
        track('end', c);
    }
    const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // ── The result card (after KEEP, or when the fight was stepped past) ──
    function card() {
        const end = read(), kept = end && end.c === 'keep' && rank !== '—';
        document.body.classList.remove('cine');
        say(null);
        if (kept) {
            $('endTitle').textContent = 'THE FIRE HOLDS';
            $('endNote').textContent = `Kept alive by ${end.n} · ${day(end.d)}`;
        } else $('endNote').textContent = rank === '—' ? 'It is still up there.' : '';
        env.fade(false);
        if (kept) board();
    }
    // The best climbs, from the sheet (only names the owner has approved, plus the visitor's own)
    async function board() {
        const el = $('board'), url = window.track && window.track.url;
        if (!el || !url) return;
        try {
            const res = await fetch(url + '?board=1&id=' + encodeURIComponent(store.get('aumritash-id') || '')), data = await res.json();
            if (!data || !Array.isArray(data.top) || !data.top.length) return;
            el.textContent = '';
            data.top.slice(0, 8).forEach((row, i) => {
                const li = document.createElement('li'), s = Math.round(+row.time || 0);
                li.textContent = `${i + 1}. ${String(row.name || '???').slice(0, 16).toUpperCase()} · ${row.rank || '—'} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
                if (row.id && row.id === store.get('aumritash-id')) li.className = 'you';
                el.appendChild(li);
            });
            el.hidden = false;
        } catch (e) { /* no board yet: the card stands without it */ }
    }

    // ═════════════ Running it ═════════════
    function enter(r) {
        rank = r || '—';
        env.result();
        $('choice').hidden = true; $('sure').hidden = true;
        if (rank === '—') { go('skip'); return; }
        document.body.classList.add('cine');
        stage0();
        hero.stopAll();
        hero.root.rotation.x = 0;
        const end = read();
        if (end && end.c === 'keep') {
            // Already kept, and fought again: the fire is simply still burning
            burn = burnTo = 1; sfx.setFire(true);
            go('kept');
            return;
        }
        go('talk');
    }
    function update(dt) {
        if (stage === 'off') return false;
        if (stage === 'skip') { card(); stage = 'off'; return true; }
        t += dt;
        sayFrame(dt);
        fireFrame(dt);
        if (stage === 'kept') {
            walkFrame(dt);
            cam.set(-S.mx * 6, 2.6, -S.mz * 6); aim.set(S.mx * 2, 1, S.mz * 2); setCam(t < 0.1);
            if (at('fade', 3.2)) env.fade(true);
            if (t > 4) { card(); stage = 'off'; return true; }
        } else if (stage === 'talk' || stage === 'choose') {
            walkFrame(dt);
            const k = stage === 'talk' ? ramp(t, 0, 9) : 1, drift = stage === 'choose' ? Math.min(1, t / 20) : 0;
            cam.set(-S.mx * mix(6.2, 4.3, k) + S.mz * drift * 0.8, mix(2.4, 1.5, k), -S.mz * mix(6.2, 4.3, k) - S.mx * drift * 0.8);
            aim.set(S.mx * 1.2, mix(1.3, 1.05, k), S.mz * 1.2);
            setCam(stage === 'talk' && t < 0.1);
            if (stage === 'talk') {
                LINES.forEach((line, i) => { if (at('l' + i, 1.2 + i * 3.1)) say(line, 2.3); });
                if (t > 1.2 + LINES.length * 3.1) { go('choose'); $('choice').hidden = false; $('keepBtn').focus({ preventScroll: true }); }
            }
        } else if (stage === 'keep') {
            walkFrame(dt);
            if (keepFrame(dt)) { stage = 'off'; return true; }
        } else if (stage === 'destroy') {
            if (t < 1.0) walkFrame(dt);
            destroyFrame(dt);
        }
        return false;
    }
    function choose(c) {
        if (stage !== 'choose') return;
        $('choice').hidden = true; $('sure').hidden = true;
        // Wherever the walk had got to, they are at the brazier now
        hero.root.position.set(S.hx + O.x, 0, S.hz + O.z);
        walkDone = false;
        go(c);
    }
    $('keepBtn').onclick = () => choose('keep');
    $('endBtn').onclick = () => { if (stage === 'choose') { $('choice').hidden = true; $('sure').hidden = false; $('sureNo').focus({ preventScroll: true }); } };
    $('sureNo').onclick = () => { if (stage === 'choose') { $('sure').hidden = true; $('choice').hidden = false; } };
    $('sureYes').onclick = () => choose('destroy');

    // Put the roof back as it was (the fight is being played again)
    function reset() {
        stage = 'off'; say(null);
        burn = burnTo = 0; fire.visible = false; fireLight.intensity = 0;
        for (const s of far) { group.remove(s); s.material.dispose(); }
        far.length = 0;
        emberPos.fill(-99); emberGeo.attributes.position.needsUpdate = true;
        $('choice').hidden = true; $('sure').hidden = true; $('board').hidden = true;
    }

    return {
        enter, update, reset,
        // Called by the page once it has stopped drawing the scene
        after() { after0 = performance.now(); requestAnimationFrame(afterFrame); },
        get stage() { return stage; },
        choose
    };
}
