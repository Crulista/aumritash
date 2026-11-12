// Phase II: THE PLAYER. The games room come alive: a huge, low, many-legged beast whose shell and legs are stacked
// game discs and broken cases, with one great red eye for a core. Nothing in it is humanoid, so it has its own small
// rig: a body that bobs, leans and turns, and eight legs, each a chain of discs bent with two-bone IK from hip to foot.
// Feet are planted on the stone and step in two alternating groups when the body moves or turns, so it never slides.
//   Moves  leg stabs (one, two, or three with the last held), a low sweep of a foreleg, a charge across the roof into
//          the wall teeth (it is stuck there afterwards, shell cracked open), a leap that lands with shockwaves, thrown
//          discs that ricochet off the roof's edge (a parried disc flies back into it), and from the first form: a
//          spiral eye volley from its core, a stamp that sends out a rolling shockwave, and a belly slam when the
//          visitor hides under or behind it.
//   Its shell turns blows aside (less damage). The eye takes full damage, but only while its lids are open: in the
//   recoveries, when it is thrown open, and while it casts. Enough damage to one leg breaks it: it stumbles, and limps.
//   It has an extra life: the first time its health empties it goes down, a life ticks away, and it gets back up
//   faster, with harder versions of its moves. A fall after that restarts the form from the beginning.
//
// Body-local frame: z ahead, y up, x to one side (its "left", +x). Arena coordinates everywhere else.

// Each leg: hip on the body, where its foot rests (body-local, on the ground), thigh and shin lengths, gait group
const LEG_DEFS = [
    { hip: [0.8, -0.15, 1.35], home: [2.1, 3.4], l1: 2.2, l2: 3.1, g: 0, front: true },
    { hip: [-0.8, -0.15, 1.35], home: [-2.1, 3.4], l1: 2.2, l2: 3.1, g: 1, front: true },
    { hip: [1.25, -0.1, 0.45], home: [3.5, 1.5], l1: 2.05, l2: 2.75, g: 1 },
    { hip: [-1.25, -0.1, 0.45], home: [-3.5, 1.5], l1: 2.05, l2: 2.75, g: 0 },
    { hip: [1.4, -0.1, -0.65], home: [3.75, -0.85], l1: 2.05, l2: 2.75, g: 0 },
    { hip: [-1.4, -0.1, -0.65], home: [-3.75, -0.85], l1: 2.05, l2: 2.75, g: 1 },
    { hip: [1.2, -0.05, -1.85], home: [3.15, -3.2], l1: 1.95, l2: 2.65, g: 1 },
    { hip: [-1.2, -0.05, -1.85], home: [-3.15, -3.2], l1: 1.95, l2: 2.65, g: 0 }
];
const GAPS = [6, 7, 20, 29];        // teeth missing from the roof's wall (tower/index.html)
const STAND = 1.45;                 // body height when standing
const BLADE = 1.0;                  // the steel point at the end of each leg
const STAB_R = 1.05;                // a stab hurts this far from where its point lands
const SWEEP_R = 0.72;               // how near the sweeping shin has to pass
const STRIKE = 0.12;                // how long a stab takes to come down
const LEG_HP = 16;                  // damage that breaks a leg
const REVIVE_HP = 55;               // what it gets back up with
const SUB = 'thousands of hours, and every retry';
const traced = new WeakMap();       // the sweep's ground marks, traced once per arena

export function create(ctx) {
    const { THREE, kit, sfx } = ctx;
    const { mix, clamp01, ease, toward, angDiff, nearSeg } = kit;
    const arena = ctx.arena, NAME = ctx.heroName || 'VISITOR';
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const Y = V(0, 1, 0), ONE = V(1, 1, 1);
    const NONE = { dealt: 0, staggered: false, dead: false };
    const made = [];
    const put = (o, parent = arena) => { parent.add(o); if (parent === arena) made.push(o); return o; };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // ── Its words ──
    const LINES = {
        again: ['AGAIN.', 'FROM THE TOP.', 'RETRY.'],
        heavy: ['AGAIN.', 'LEARN THE PATTERN.', 'TOO SLOW. RETRY.', 'THAT ONE ALWAYS GETS THEM.'],
        parried: ['LUCKY FRAME.', 'YOU READ THE TELL.', 'NOTED.'],
        fell: ['GAME OVER.', 'CONTINUE?', 'INSERT YOURSELF.'],
        low: ['ONE MORE TRY. FOR ONE OF US.', 'I HAVE BEATEN THIS BEFORE.'],
        leg: ['A SCRATCHED DISC STILL PLAYS.'],
        stuck: ['THE WALL WAS NOT IN THE PATTERN.']
    };
    let barkAt = -9, lastLine = '', namedFall = false;
    function bark(kind, force = false) {
        const list = LINES[kind];
        if (!list || ctx.mode === 'off') return;
        const now = ctx.time();
        if (!force && now - barkAt < 5) return;
        let s = list[Math.floor(ctx.rand() * list.length)];
        if (s === lastLine && list.length > 1) s = list[(list.indexOf(s) + 1) % list.length];
        if (kind === 'fell' && !namedFall) { namedFall = true; s = `GAME OVER, ${NAME}.`; }
        lastLine = s; barkAt = now;
        ctx.line(s, 2.2);
    }
    // Sounds: the score may offer its own (see the score brief); otherwise the house sfx stands in
    function snd(name, fallback, ...args) {
        const s = ctx.score;
        if (s && typeof s[name] === 'function') { try { s[name](...args); return; } catch (e) { /* fall back */ } }
        if (fallback) fallback();
    }
    let stepSndAt = -9, clinkAt = -9, age = 0;
    const stepSound = () => { if (age - stepSndAt > 0.2) { stepSndAt = age; snd('bossStep', () => sfx.thud()); } };
    const clink = () => { if (age - clinkAt > 0.05) { clinkAt = age; snd('discRicochet', () => sfx.tick()); } };

    // ═════════════ Its body ═════════════
    const discGeo = new THREE.LatheGeometry([[1, -0.5], [1, 0.5], [0.2, 0.5], [0.2, -0.5], [1, -0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
    const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    const bladeGeo = new THREE.ConeGeometry(1, 1, 4);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const flatGeo = new THREE.CircleGeometry(1, 28);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 32);
    const rectGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
    const DISC = new THREE.MeshPhongMaterial({ color: '#ffffff', specular: '#76808f', shininess: 40, emissive: '#0b0c12', flatShading: true });
    const STEEL = new THREE.MeshPhongMaterial({ color: '#a2a8b4', specular: '#ffffff', shininess: 80, flatShading: true });
    const DARK = new THREE.MeshLambertMaterial({ color: '#0c0a0f', flatShading: true });
    const ROD = new THREE.MeshLambertMaterial({ color: '#17151b' });
    const CASE = new THREE.MeshPhongMaterial({ color: '#ffffff', specular: '#a6b2c6', shininess: 60, flatShading: true });
    const LID = new THREE.MeshPhongMaterial({ color: '#2a2b33', specular: '#8890a0', shininess: 40, flatShading: true, side: THREE.DoubleSide });
    const EYE = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
    const IRIS = new THREE.MeshBasicMaterial({ color: '#7a0806', fog: false, side: THREE.DoubleSide });
    const PUPIL = new THREE.MeshBasicMaterial({ color: '#050203', fog: false });
    const SHADOW = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false });
    const PROJ = new THREE.MeshPhongMaterial({ color: '#c8ccd6', specular: '#ffffff', shininess: 90, emissive: '#5a0a06', flatShading: true });
    const mats = [DISC, STEEL, DARK, ROD, CASE, LID, EYE, IRIS, PUPIL, SHADOW, PROJ];
    const geos = [discGeo, rodGeo, bladeGeo, boxGeo, flatGeo, ringGeo, rectGeo];
    // Dark discs mostly; some silver; a few showing the coloured data side
    const TONES = ['#1c1d23', '#23242b', '#2b2c34', '#353740', '#565b68', '#3d344b', '#263b42', '#6a7080'];
    const _c = new THREE.Color();
    const tone = () => _c.set(TONES[Math.floor(rnd() * rnd() * TONES.length * 1.6) % TONES.length]);

    const SHELL_C = V(0, 0.15, -0.5), SHELL_R = V(1.6, 1.1, 2.65);
    const EYE_AT = V(0, 0.02, 1.95);
    const bodyG = put(new THREE.Group());
    const under = put(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), DARK), bodyG);
    geos.push(under.geometry);
    under.scale.copy(SHELL_R).multiplyScalar(0.97);
    under.position.copy(SHELL_C);

    // The shell: rows of discs over the upper body, laid like tiles, leaning back so they overlap
    const shellList = [];
    for (let row = 0; row < 6; row++) {
        const lat = mix(-0.2, 1.4, row / 5), n = row === 5 ? 2 : Math.round(mix(15, 6, row / 5));
        for (let k = 0; k < n; k++) {
            const lon = (k + (row % 2) * 0.5) / n * Math.PI * 2 + (rnd() - 0.5) * 0.2;
            const d = V(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
            if (d.z > 0.62 && d.y < 0.55) continue;                 // leave the eye clear
            const p = V(SHELL_R.x * d.x, SHELL_R.y * d.y, SHELL_R.z * d.z).add(SHELL_C);
            const nrm = V(d.x / SHELL_R.x, d.y / SHELL_R.y, d.z / SHELL_R.z).normalize();
            nrm.z -= 0.35; nrm.x += (rnd() - 0.5) * 0.25; nrm.normalize();
            p.addScaledVector(nrm, 0.05 + row * 0.03);
            shellList.push({ p, n: nrm, r: mix(0.78, 0.55, row / 5) * (0.9 + rnd() * 0.25), c: tone().clone() });
        }
    }
    const shell = put(new THREE.InstancedMesh(discGeo, DISC, shellList.length), bodyG);
    shell.frustumCulled = false;
    const shellLocal = shellList.map((s, i) => {
        const m = new THREE.Matrix4().compose(s.p, new THREE.Quaternion().setFromUnitVectors(Y, s.n), V(s.r, 0.08, s.r));
        shell.setMatrixAt(i, m);
        shell.setColorAt(i, s.c);
        return m;
    });
    // Broken cases: a ridge of them standing along its back, and some cracked ones lying on its flanks
    const plateList = [];
    for (let k = 0; k < 6; k++) {
        const z = mix(1.1, -2.7, k / 5), e = (z - SHELL_C.z) / SHELL_R.z, top = SHELL_C.y + SHELL_R.y * Math.sqrt(Math.max(0, 1 - e * e));
        const s = mix(1.3, 0.85, k / 5);
        plateList.push({ p: V((k % 2 ? 0.08 : -0.08), top + s * 0.28, z), r: new THREE.Euler(-0.55, 0, (k % 2 ? 1 : -1) * 0.14), s: V(0.07, s, s * 1.05), ridge: k % 2 ? 1 : -1 });
    }
    for (const [lat, lon] of [[0.45, 1.25], [0.45, -1.25], [0.25, 2.2], [0.3, -2.3]]) {
        const d = V(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
        const p = V(SHELL_R.x * d.x, SHELL_R.y * d.y, SHELL_R.z * d.z).add(SHELL_C);
        const nrm = V(d.x / SHELL_R.x, d.y / SHELL_R.y, d.z / SHELL_R.z).normalize();
        p.addScaledVector(nrm, 0.25);
        const q = new THREE.Quaternion().setFromUnitVectors(Y, nrm);
        plateList.push({ p, q, s: V(1.05, 0.07, 1.15), ridge: 0 });
    }
    const plates = put(new THREE.InstancedMesh(boxGeo, CASE, plateList.length), bodyG);
    plates.frustumCulled = false;
    plateList.forEach((pl, i) => plates.setColorAt(i, _c.set(i % 3 ? '#2a3039' : '#3a4250')));
    const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _pp = V();
    let crackDrawn = -1;
    function drawPlates(crack) {
        if (Math.abs(crack - crackDrawn) < 0.004) return;
        crackDrawn = crack;
        plateList.forEach((pl, i) => {
            if (pl.ridge) {
                // Cracked open, the ridge splays apart and lifts off the glowing back
                _pe.set(pl.r.x - crack * 0.25, 0, pl.r.z + pl.ridge * crack * 0.85);
                _pq.setFromEuler(_pe);
                _pp.copy(pl.p); _pp.x += pl.ridge * crack * 0.5; _pp.y += crack * 0.25;
            } else { _pq.copy(pl.q); _pp.copy(pl.p); }
            plates.setMatrixAt(i, _pm.compose(_pp, _pq, pl.s));
        });
        plates.instanceMatrix.needsUpdate = true;
    }
    drawPlates(0);
    // A red glow inside its back, seen when the shell cracks
    const backGlow = put(kit.glowSprite('#ff2a1a', 0), bodyG);
    backGlow.position.set(0, 1.2, -0.5);
    backGlow.scale.set(3.6, 2.4, 1);

    // The eye: a red ball in a steel socket, with a slit that follows the visitor, and two lids
    const eyeG = put(new THREE.Group(), bodyG);
    eyeG.position.copy(EYE_AT);
    const eyeLook = new THREE.Group();
    eyeG.add(eyeLook);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), EYE);
    const iris = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.44, 20), IRIS);
    iris.position.z = 0.6;
    const pupil = new THREE.Mesh(boxGeo, PUPIL);
    pupil.scale.set(0.11, 0.6, 0.04);
    pupil.position.z = 0.62;
    eyeLook.add(ball, iris, pupil);
    geos.push(ball.geometry, iris.geometry);
    const socket = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.13, 6, 22), STEEL);
    geos.push(socket.geometry);
    eyeG.add(socket);
    const capGeo = new THREE.SphereGeometry(0.71, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    geos.push(capGeo);
    const lidU = new THREE.Group(), lidL = new THREE.Group();
    lidU.add(new THREE.Mesh(capGeo, LID));
    const lowCap = new THREE.Mesh(capGeo, LID);
    lowCap.rotation.z = Math.PI;
    lidL.add(lowCap);
    eyeG.add(lidU, lidL);
    const eyeGlow = kit.glowSprite('#ff3020', 0.8);
    eyeGlow.position.z = 0.75;
    eyeGlow.scale.setScalar(3.2);
    eyeG.add(eyeGlow);
    const eyeLight = new THREE.PointLight('#ff2a1a', 0, 11, 1.5);
    eyeLight.position.z = 1.3;
    eyeG.add(eyeLight);

    // Legs: discs stacked on a dark spindle, a steel point at the end
    const NLD = 13;
    const legDiscs = put(new THREE.InstancedMesh(discGeo, DISC, 8 * NLD));
    const rods = put(new THREE.InstancedMesh(rodGeo, ROD, 16));
    const blades = put(new THREE.InstancedMesh(bladeGeo, STEEL, 8));
    for (const m of [legDiscs, rods, blades]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    for (let i = 0; i < 8 * NLD; i++) legDiscs.setColorAt(i, tone());

    // A soft shadow under it, and one for where it will land
    const flat = (geo, mat) => { const m = put(new THREE.Mesh(geo, mat)); m.rotation.x = -Math.PI / 2; m.position.y = 0.035; return m; };
    const blob = flat(flatGeo, SHADOW);
    const landShadow = flat(flatGeo, SHADOW.clone());
    mats.push(landShadow.material);
    landShadow.visible = false;

    // Its own warning marks: circles where a stab will land, and a lane for the charge
    const PINGS = Array.from({ length: 6 }, () => {
        const ring = flat(ringGeo, kit.redMaterial()), fill = flat(flatGeo, kit.redMaterial());
        mats.push(ring.material, fill.material);
        ring.visible = fill.visible = false;
        return { ring, fill, live: false, x: 0, z: 0, r: 1, t: 0, delay: 1, landed: false };
    });
    const lane = { area: flat(rectGeo, kit.redMaterial()), fill: flat(rectGeo, kit.redMaterial()), on: false, k: 0, x: 0, z: 0, yaw: 0, l: 1, w: 3.2 };
    mats.push(lane.area.material, lane.fill.material);
    lane.area.visible = lane.fill.visible = false;

    // Thrown discs
    const SHOTS = Array.from({ length: 8 }, () => {
        const mesh = put(new THREE.Mesh(discGeo, PROJ));
        mesh.scale.set(0.45, 0.07, 0.45);
        const glow = put(kit.glowSprite('#ff3a20', 0.9));
        glow.scale.setScalar(1.5);
        mesh.visible = glow.visible = false;
        return { mesh, glow, on: false, held: false, back: false, p: V(), v: V(), t: 0, bounces: 0, max: 1, spin: 0, slot: 0 };
    });

    // Loose discs and cases: the debris of the climb, and everything it falls apart into at the end
    const LOOSE_N = 200, LP_N = 12;
    const loose = put(new THREE.InstancedMesh(discGeo, DISC, LOOSE_N));
    const loosePl = put(new THREE.InstancedMesh(boxGeo, CASE, LP_N));
    for (const m of [loose, loosePl]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    for (let i = 0; i < LOOSE_N; i++) loose.setColorAt(i, tone());
    for (let i = 0; i < LP_N; i++) loosePl.setColorAt(i, _c.set('#2e343e'));
    const bits = [];       // { mesh, i, p, v, q, w, s (scale), thin (local axis), mode, dir, spd, lean, t, flat (Quaternion) }

    // The lives left, by the boss bar; and a big one for the moment a life is spent
    const livesEl = document.createElement('div');
    livesEl.style.cssText = 'position:absolute;right:0;top:0.25rem;font-family:var(--pixel,monospace);font-size:1.15rem;letter-spacing:0.3em;color:#ff3a2a;text-shadow:0 2px 0 #000;pointer-events:none;';
    const bigEl = document.createElement('div');
    bigEl.style.cssText = 'position:fixed;left:50%;top:21%;transform:translateX(-50%);z-index:9;font-family:var(--pixel,monospace);font-size:clamp(2.4rem,8vw,4.4rem);letter-spacing:0.35em;color:#ff3a2a;text-shadow:0 0 18px rgba(255,40,20,0.6),0 3px 0 #000;pointer-events:none;transition:transform 0.12s,opacity 0.4s;opacity:0;';
    document.body.appendChild(bigEl);
    const bossEl = document.getElementById('boss');
    if (bossEl) bossEl.appendChild(livesEl);
    const lifeIcons = (left, total = 2) => '◉'.repeat(left) + '<span style="color:#5a4a48">○</span>'.repeat(Math.max(0, total - left));

    // The Watcher's body may still be standing where the page left it: it is gone in this form
    const W = ctx.parts.watcher;
    const hidden = [];
    if (W) {
        for (const o of [W.body && W.body.root, W.gaze, W.crown, W.aura, ...(W.eyes || [])]) if (o) { hidden.push([o, o.visible]); o.visible = false; }
        if (W.glow) W.glow.intensity = 0;
    }

    // ═════════════ State ═════════════
    let B = null;
    const body = { y: STAND, pitch: 0, roll: 0, twist: 0 };
    const aim = { y: STAND, pitch: 0, roll: 0, twist: 0, rate: 4 };
    let bump = 0, bumpV = 0, flinch = 0, hot = 0, cut = false, swing = 0, swingId = 'p2:0', fighting = false;
    let lid = 0.08, lidTo = 0.08, lit = 1, litTo = 1, crack = 0, crackTo = 0, cast = 0, tries = 0;
    const legs = LEG_DEFS.map((d, i) => ({ i, d, side: Math.sign(d.hip[0]), hip: V(), knee: V(), foot: V(), tip: V(), from: V(), to: V(), k: 0, stepping: false, hand: false, lift: 0.6, dur: 0.4, hp: LEG_HP, broken: false, hide: false }));
    const stabs = [];
    const bodyM = new THREE.Matrix4(), eyeW = V();
    const sp = () => (B && B.life === 2 ? 1.22 : 1);

    function fresh() {
        B = { x: 0, z: -6.4, yaw: 0, hp: 100, life: 1, state: 'idle', t: 0, cool: 1.4, last: '', n: 0, did: {}, speed: 0, turn: 0, vx: 0, vz: 0, lx: 0, lz: 0,
            posture: 0, calm: 0, behind: 0, since: 0, side: 1, air: false, tx: 0, tz: 0, sx: 0, sz: 0, dir: 0, went: 0, crashS: 0, again: false,
            rec: 1, reelLeg: 0, broke: 0, lowSaid: false, fellSaid: false, tidy: 0, from: V(), from2: V(), scrapeAt: 0 };
        Object.assign(body, { y: STAND, pitch: 0, roll: 0, twist: 0 });
        Object.assign(aim, { y: STAND, pitch: 0, roll: 0, twist: 0, rate: 4 });
        bump = bumpV = flinch = hot = 0; cut = false; cast = 0;
        lid = lidTo = 0.08; lit = litTo = 1; crack = crackTo = 0;
        for (const L of legs) { L.hp = LEG_HP; L.broken = false; L.hand = false; L.stepping = false; L.hide = false; }
        stabs.length = 0;
        clearHaz();
        plantAll();
        lives(2);
    }
    function lives(n) { B.lives = n; livesEl.innerHTML = lifeIcons(n); }
    const newSwing = () => { swingId = 'p2:' + (++swing); };

    // ── Rig maths ──
    const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = V(), _w = V(), _h = V(), _u = V(), _m = new THREE.Matrix4(), _s = V();
    function bodyMatrix(out, x, z, yaw, y, pitch, roll) {
        _e.set(pitch, yaw, roll, 'YXZ');
        _q.setFromEuler(_e);
        return out.compose(_v.set(x, y, z), _q, ONE);
    }
    // A point on the ground given in the body's frame (yaw only), into the arena
    function ground(lx, lz, out, yaw = B.yaw, x = B.x, z = B.z) {
        const s = Math.sin(yaw), c = Math.cos(yaw);
        return out.set(x + lx * c + lz * s, 0, z - lx * s + lz * c);
    }
    function toLocal(x, z) {
        const dx = x - B.x, dz = z - B.z, s = Math.sin(B.yaw), c = Math.cos(B.yaw);
        B.lx = dx * c - dz * s; B.lz = dx * s + dz * c;
    }
    // Two-bone IK: the knee off the line from hip to foot, on the side the pole points to. `tip` is where it reached.
    const _n = V(), _p = V(), _t = V();
    function solve(H, F, l1, l2, pole, K, tip) {
        _t.subVectors(F, H);
        const d0 = _t.length() || 1e-4;
        const d = Math.min((l1 + l2) * 0.995, Math.max(Math.abs(l1 - l2) + 0.02, d0));
        _n.copy(_t).divideScalar(d0);
        const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
        _p.copy(pole).addScaledVector(_n, -pole.dot(_n));
        if (_p.lengthSq() < 1e-6) _p.set(0, 1, 0);
        _p.normalize();
        K.copy(H).addScaledVector(_n, x).addScaledVector(_p, h);
        tip.copy(H).addScaledVector(_n, d);
    }
    const _pole = V();
    function poleFor(L, H, cx, cz) {
        _pole.set(H.x - cx, 0, H.z - cz).normalize();
        if (L.d.front) { _w.set(Math.sin(B.yaw), 0, Math.cos(B.yaw)); _pole.addScaledVector(_w, 0.35); }
        return _pole.multiplyScalar(1).add(_w.set(0, 1.3, 0));
    }
    function hipOf(L, out) { return out.fromArray(L.d.hip).applyMatrix4(bodyM); }
    // Where a foot wants to be: its rest spot under the body, a little ahead when it is moving or turning
    function homeOf(L, out, lead = 0) {
        const yaw = B.yaw + B.turn * lead;
        ground(L.d.home[0], L.d.home[1], out, yaw, B.x + B.vx * lead, B.z + B.vz * lead);
        return out;
    }
    function plantAll() {
        bodyMatrix(bodyM, B.x, B.z, B.yaw, body.y, body.pitch, body.roll);
        for (const L of legs) { homeOf(L, L.foot); L.stepping = false; L.hand = false; }
    }

    // ── Feet: two groups take turns stepping; a foot only moves while it is lifted ──
    let lastG = 1;
    const errs = new Float32Array(8);
    function gait(dt) {
        const spd = Math.hypot(B.vx, B.vz), fast = spd > 7;
        const dur = (fast ? 0.17 : Math.min(0.46, Math.max(0.2, 0.46 - spd * 0.035))) / sp();
        const lead = dur * 0.95;
        const still = spd < 0.25 && Math.abs(B.turn) < 0.12;
        B.tidy = still ? B.tidy + dt : 0;
        const thresh = B.tidy > 0.35 ? 0.22 : 0.45 + spd * dur * 0.9 + Math.abs(B.turn) * 0.4;
        const busy = [0, 0];
        for (const L of legs) {
            errs[L.i] = 0;
            if (L.hand || L.broken) continue;
            homeOf(L, _h, lead);
            if (L.stepping) {
                L.k += dt / L.dur;
                if (L.k < 0.7) L.to.lerp(_h, 1 - Math.exp(-14 * dt));
                const k = Math.min(1, L.k), e = ease(k);
                L.foot.lerpVectors(L.from, L.to, e);
                L.foot.y = mix(L.from.y, L.to.y, e) + Math.sin(Math.PI * k) * L.lift;
                if (L.k >= 1) land(L, fast); else if (L.k < 0.8) busy[L.d.g]++;
            } else errs[L.i] = Math.hypot(L.foot.x - _h.x, L.foot.z - _h.z);
        }
        // The group that has waited longest goes first, once the other is down
        for (const g of [1 - lastG, lastG]) {
            if (busy[1 - g] || busy[g]) continue;
            let worst = 0;
            for (const L of legs) if (L.d.g === g && !L.stepping) worst = Math.max(worst, errs[L.i]);
            if (worst <= thresh) continue;
            for (const L of legs) {
                if (L.d.g !== g || L.hand || L.broken || L.stepping || errs[L.i] < 0.15) continue;
                homeOf(L, L.to, lead);
                startStep(L, dur, (L.d.front ? 0.8 : 0.6) + Math.min(0.5, spd * 0.04));
            }
            lastG = g;
            break;
        }
        // A broken leg drags behind
        for (const L of legs) {
            if (!L.broken || L.hand) continue;
            ground(L.d.home[0] * 0.75, L.d.home[1] - 1.2, _h);
            L.foot.x = toward(L.foot.x, _h.x, 5, dt); L.foot.z = toward(L.foot.z, _h.z, 5, dt); L.foot.y = 0.12;
        }
    }
    function startStep(L, dur, lift) {
        L.from.copy(L.foot);
        L.k = 0; L.stepping = true; L.dur = dur; L.lift = lift; L.hand = false;
    }
    function land(L, fast) {
        L.foot.copy(L.to); L.foot.y = Math.min(0, L.to.y);
        L.stepping = false;
        if (B.state === 'dying') return;
        ctx.dust(L.foot.x, L.foot.z, fast ? 2 : 3, '#6e6460');
        const P = ctx.P, near = 1 - clamp01(Math.hypot(L.foot.x - P.x, L.foot.z - P.z) / 14);
        ctx.shake((fast ? 0.1 : 0.06) + 0.1 * near);
        bumpV -= fast ? 0.08 : 0.16;
        stepSound();
    }
    // A foot taken over by a move, and given back
    function grab(i) { const L = legs[i]; L.hand = true; L.stepping = false; return L; }
    function release(i, lift = 0.9, dur = 0.38) {
        const L = legs[i];
        if (!L.hand) return;
        L.hand = false;
        if (L.broken) return;
        homeOf(L, L.to);
        startStep(L, dur / sp(), lift);
    }
    function releaseAll() { for (let i = 0; i < 8; i++) release(i); }
    // A body-local point (with height) moved out by the current body
    const local = (x, y, z, out) => out.set(x, y, z).applyMatrix4(bodyM);

    // ═════════════ Warnings and things it throws ═════════════
    function ping(x, z, r, delay) {
        const p = PINGS.find(q => !q.live) || PINGS[0];
        Object.assign(p, { live: true, x, z, r, t: 0, delay, landed: false });
        return p;
    }
    function drawPings(dt) {
        for (const p of PINGS) {
            p.ring.visible = p.fill.visible = p.live;
            if (!p.live) continue;
            p.t += dt;
            p.ring.position.set(p.x, 0.046, p.z); p.fill.position.set(p.x, 0.047, p.z);
            p.ring.scale.setScalar(p.r);
            if (!p.landed) {
                const k = clamp01(p.t / p.delay);
                p.ring.material.opacity = 0.25 + 0.4 * k;
                p.fill.scale.setScalar(p.r * Math.max(0.01, k));
                p.fill.material.opacity = 0.16 + 0.32 * k;
                if (p.t > p.delay + 0.6) p.live = false;
            } else {
                const k = 1 - p.t / 0.35;
                p.ring.material.opacity = Math.max(0, k) * 0.6; p.fill.material.opacity = Math.max(0, k) * 0.9;
                if (k <= 0) p.live = false;
            }
        }
        lane.area.visible = lane.fill.visible = lane.on;
        if (lane.on) {
            for (const m of [lane.area, lane.fill]) { m.position.set(lane.x, m === lane.area ? 0.044 : 0.045, lane.z); m.rotation.z = lane.yaw; }
            lane.area.scale.set(lane.w, lane.l, 1);
            lane.fill.scale.set(lane.w, lane.l * Math.max(0.01, lane.k), 1);
            lane.area.material.opacity = 0.14 + 0.16 * lane.k;
            lane.fill.material.opacity = 0.18 + 0.3 * lane.k;
        }
    }
    function clearHaz() {
        for (const p of PINGS) { p.live = false; p.ring.visible = p.fill.visible = false; }
        lane.on = false;
        for (const d of SHOTS) { d.on = false; d.mesh.visible = d.glow.visible = false; }
        landShadow.visible = false;
        cut = false;
        for (const name in marks) ctx.mark.hide(marks[name]);
        markOn = null;
    }

    // Thrown discs: fly low, ring off the wall teeth, shatter on a guard; a parried one goes back where it came from
    let lastShot = null;
    function shatter(d) { d.on = false; ctx.spark(d.p.x, d.p.y, d.p.z, 1.6, '#ffd2b0'); clink(); }
    function flyDiscs(dt) {
        const P = ctx.P;
        for (const d of SHOTS) {
            d.mesh.visible = d.glow.visible = d.on;
            if (!d.on) continue;
            d.spin += dt * (d.held ? 14 : 26);
            if (d.held) continue;                       // placed by the throw itself
            d.t += dt;
            if (d.back) {
                _v.subVectors(eyeW, d.p);
                const dist = _v.length();
                d.v.copy(_v.normalize().multiplyScalar(17));
                if (dist < 1.4) {
                    d.on = false;
                    ctx.spark(d.p.x, d.p.y, d.p.z, 2.6, '#ff6040');
                    if (B.state !== 'dying') form.damage(12, { kind: 'reflect', x: d.p.x, z: d.p.z });
                    continue;
                }
            } else if (d.p.y > 1.05) d.v.y = Math.min(d.v.y, (1.0 - d.p.y) / 0.25);
            else d.v.y = 0;
            d.p.addScaledVector(d.v, dt);
            // The roof's edge: ricochet, or break
            const r = Math.hypot(d.p.x, d.p.z);
            if (!d.back && r > 12.0 && d.p.x * d.v.x + d.p.z * d.v.z > 0) {
                if (d.bounces < d.max) {
                    const nx = d.p.x / r, nz = d.p.z / r, dot = d.v.x * nx + d.v.z * nz;
                    d.v.x -= 2 * dot * nx; d.v.z -= 2 * dot * nz;
                    d.bounces++;
                    ctx.spark(d.p.x, 1, d.p.z, 1.8, '#ffe0c0');
                    snd('discRicochet', () => sfx.tick());
                } else { shatter(d); continue; }
            }
            if (d.t > 7) { d.on = false; continue; }
            if (!d.back && d.t > 0.12 && Math.hypot(d.p.x - P.x, d.p.z - P.z) < 0.8) {
                lastShot = d;
                const res = ctx.hitPlayer(12, d.p.x - d.v.x * 0.05, d.p.z - d.v.z * 0.05, { kind: 'disc', parryable: true, knock: 0.6 });
                if (res === 'hit' || res === 'blocked') shatter(d);
            }
        }
    }
    function placeDiscs() {
        for (const d of SHOTS) {
            if (!d.on) continue;
            d.mesh.position.copy(d.p);
            d.mesh.rotation.set(Math.sin(d.spin * 0.13) * 0.12, d.spin, 0);
            d.glow.position.copy(d.p);
            d.glow.material.opacity = d.back ? 1 : 0.75;
        }
    }

    // ── The sweep's ground marks: the shin's path over the ground, worked out with the same rig ──
    // sweepFoot(u, s): where the sweeping foot is, body-local, u from 0 (drawn back) to 1 (through); and the body's
    // turn and lean at that moment
    function sweepFoot(u, s, out) {
        const a = s * mix(1.75, -1.3, u), y = 0.4 + Math.max(0, u - 0.85) * 3;
        return out.set(Math.sin(a) * 4.0, y, 0.9 + Math.cos(a) * 4.0);
    }
    const sweepBody = (u, s) => ({ twist: s * mix(-0.22, 0.25, u), roll: s * mix(-0.1, 0.05, u), pitch: 0.06, y: 1.35 });
    let marks = traced.get(arena);
    if (!marks) {
        marks = {};
        const H = V(), K = V(), T = V(), F = V(), M = new THREE.Matrix4();
        for (const s of [1, -1]) {
            const L = legs[s > 0 ? 0 : 1], segs = [];
            for (let i = 0; i <= 18; i++) {
                const u = i / 18, bp = sweepBody(u, s);
                bodyMatrix(M, 0, 0, bp.twist, bp.y, bp.pitch, bp.roll);
                H.fromArray(L.d.hip).applyMatrix4(M);
                sweepFoot(u, s, F).applyMatrix4(M); F.y = sweepFoot(u, s, T).y;
                _pole.set(H.x, 0, H.z).normalize().add(_w.set(0, 1.3, 0.35));
                solve(H, F, L.d.l1, L.d.l2, _pole, K, T);
                segs.push([K.x, K.z, T.x, T.z]);
            }
            marks[s > 0 ? 'sweepL' : 'sweepR'] = ctx.mark.trace(segs, SWEEP_R, 7);
        }
        traced.set(arena, marks);
    }
    let markOn = null, markK = 0;

    // ═════════════ Deciding and moving ═════════════
    const first = key => { if (B.did[key]) return false; B.did[key] = true; return true; };
    function begin(state) { B.state = state; B.t = 0; B.n = 0; B.did = {}; B.last = state; newSwing(); markOn = null; }
    function settle(cool) {
        B.state = 'idle'; B.t = 0;
        B.cool = (cool ?? 0.5 + ctx.rand() * 0.7) / sp();
        markOn = null; lane.on = false; landShadow.visible = false;
        for (let i = 0; i < 8; i++) if (legs[i].hand && !(B.state === 'down')) release(i);
        stabs.length = 0;
    }
    function recover(seconds) { B.state = 'recover'; B.t = 0; B.rec = seconds / sp(); markOn = null; }
    // Health of the visitor it would like to hear about
    function hurt(dmg, fx, fz, opts) {
        const r = ctx.hitPlayer(dmg, fx, fz, opts);
        if (r === 'hit' && dmg >= 24) bark('heavy');
        return r;
    }
    // Could it charge at the visitor from here: a long enough run, not through the brazier
    function laneFrom(dirYaw) {
        const dx = Math.sin(dirYaw), dz = Math.cos(dirYaw);
        const R = 12.1 - 2.4, b = B.x * dx + B.z * dz, c = B.x * B.x + B.z * B.z - R * R;
        const s = -b + Math.sqrt(Math.max(0, b * b - c));
        // nearest the run passes to the roof's centre
        const k = Math.max(0, Math.min(s, -b));
        const miss = Math.hypot(B.x + dx * k, B.z + dz * k);
        return { s, miss };
    }
    function laneOk(aimYaw, dist) { const l = laneFrom(aimYaw); return l.s > dist + 1 && l.s > 6.5 && l.miss > 2.7; }

    function pick(dist, off, aimYaw) {
        const opts = [], facing = Math.abs(off) < 0.5;
        const add = (n, w) => { if (w > 0 && n !== B.last) opts.push([n, w]); };
        if (B.behind > 0.7 || dist < 2.9) add('slam', 5);
        if (facing && dist < 6.4 && dist >= 2.9) { add('stab', 3.2); add('sweep', 2.5); add('stamp', 1.2); }
        if (dist >= 4.5) {
            if (facing) add('discs', 2.2);
            add('leap', dist > 6.5 ? 2 : 0.5);
            if (facing && laneOk(aimYaw, dist)) add('charge', dist > 6.5 ? 2.6 : 1.2);
        }
        if (B.since > 9) add('volley', 1.5);
        if (!opts.length) return null;
        let roll = ctx.rand() * opts.reduce((s, o) => s + o[1], 0);
        for (const [n, w] of opts) { roll -= w; if (roll <= 0) return n; }
        return opts[0][0];
    }

    function think(dt) {
        const P = ctx.P, S = sp();
        const dx = P.x - B.x, dz = P.z - B.z, dist = Math.hypot(dx, dz) || 1, aimYaw = Math.atan2(dx, dz);
        const off = angDiff(aimYaw, B.yaw);
        const face = rate => { B.turn = Math.max(-rate, Math.min(rate, off * 2.6)); B.yaw += B.turn * dt; };
        B.t += dt; B.since += dt;
        B.turn = 0;
        hot = 0;
        let speedTo = 0;
        Object.assign(aim, { y: STAND, pitch: 0, roll: 0, twist: 0, rate: 4 });
        lidTo = 0.08; crackTo = 0; litTo = 1; cast = 0;
        // Posture drains when it is left alone
        B.calm += dt;
        if (B.calm > 2) B.posture = Math.max(0, B.posture - 9 * dt);
        if (ctx.mode === 'dead' && !B.fellSaid) { B.fellSaid = true; bark('fell', true); }
        const st = B.state;

        if (!fighting || ctx.mode !== 'play') {
            if (st === 'idle' || st === 'recover') face(0.8);
        } else if (st === 'idle') {
            face(1.35 * S);
            if (dist > 6.2 && Math.abs(off) < 0.9) speedTo = 2.4 * S;
            B.behind = (Math.abs(off) > 1.9 && dist < 6) ? B.behind + dt : Math.max(0, B.behind - dt * 2);
            B.cool -= dt;
            if (B.cool <= 0) {
                const next = pick(dist, off, aimYaw);
                if (next) { begin(next); if (next === 'volley') B.since = 0; if (next === 'sweep') B.side = off > 0 ? 1 : -1; } else B.cool = 0.2;
            }
        } else if (st === 'recover') {
            lidTo = 1;
            face(0.5);
            if (B.t > B.rec) settle();
        } else if (st === 'stab') {
            // One, two or three: each foreleg rears, aims, and drives its point into the stone
            if (first('go')) { B.n = B.life === 1 ? (ctx.rand() < 0.5 ? 1 : 2) : (ctx.rand() < 0.4 ? 2 : 3); stabs.length = 0; addStab(0, off); }
            let live = false;
            for (const sb of stabs) {
                if (sb.phase === 'done') continue;
                live = true;
                sb.t += dt;
                const L = legs[sb.leg];
                if (sb.phase === 'wind') {
                    if (sb.k === 0) face(1.6 * S);
                    const k = clamp01(sb.t / sb.wind);
                    // cocked high over its own shoulder, leaning towards where it will land
                    local(L.side * 1.55, 3.3, 2.0, sb.C);
                    _v.set(sb.T.x - sb.C.x, 0, sb.T.z - sb.C.z).normalize();
                    sb.C.addScaledVector(_v, 0.5 * k);
                    if (sb.wind - sb.t < 0.22) { sb.C.x += Math.sin(age * 71) * 0.05; sb.C.y += Math.sin(age * 53) * 0.05; }
                    L.foot.lerpVectors(sb.from, sb.C, kit.EASE.out(k));
                    L.foot.y += Math.sin(Math.PI * k) * 0.6;
                    hot = Math.max(hot, k);
                    aim.pitch = -0.14 * k; aim.twist = L.side * 0.1 * k; aim.rate = 8;
                    if (sb.t >= sb.wind) { sb.phase = 'strike'; sb.t = 0; sb.from.copy(L.foot); snd('legWhoosh', () => sfx.whoosh()); }
                } else if (sb.phase === 'strike') {
                    const k = clamp01(sb.t / STRIKE);
                    L.foot.lerpVectors(sb.from, sb.T, k * k * k);
                    hot = 1;
                    aim.pitch = 0.12; aim.rate = 14; aim.y = 1.3;
                    if (k >= 1) {
                        sb.phase = 'stuck'; sb.t = 0;
                        sb.ping.landed = true; sb.ping.t = 0;
                        ctx.dust(sb.T.x, sb.T.z, 8, '#7d716a');
                        ctx.spark(sb.T.x, 0.3, sb.T.z, 1.6, '#e8d8c8');
                        ctx.shake(0.45);
                        bumpV -= 0.4;
                        snd('legStab', () => { sfx.thud(); sfx.tick(); });
                        if (Math.hypot(P.x - sb.T.x, P.z - sb.T.z) < STAB_R) {
                            B.blow = 'stab'; B.blowLeg = sb.leg;
                            hurt(26, B.x, B.z, { kind: 'blade', parryable: true, knock: 1.1 });
                        }
                        if (sb.k + 1 < B.n) addStab(sb.k + 1, angDiff(Math.atan2(P.x - B.x, P.z - B.z), B.yaw));
                    }
                } else if (sb.phase === 'stuck') {
                    const k = Math.max(0, 1 - sb.t * 4);
                    L.foot.copy(sb.T);
                    L.foot.x += Math.sin(age * 60) * 0.04 * k;
                    aim.pitch = 0.08; aim.y = 1.35;
                    if (sb.t >= sb.hold) { sb.phase = 'done'; release(sb.leg, 1.0); }
                }
                if (B.state !== 'stab') return finish(dt, speedTo);
            }
            if (!live && B.t > 0.2) recover(0.95);
        } else if (st === 'sweep') {
            // A foreleg drawn back and out, then swung low and flat across everything in front
            const s = B.side, Li = s > 0 ? 0 : 1, L = legs[Li];
            const Wd = (B.again ? 0.5 : 0.85) / S, A = 0.22 / S, F = 0.16 / S, R = 1.05 / S;
            if (first('go')) { grab(Li); B.from.copy(L.foot); }
            const t = B.t;
            if (t < Wd) {
                face(2.2 * S);
                const k = clamp01(t / Wd);
                sweepFoot(-0.12, s, _v); _v.y = 1.5;
                local(_v.x, _v.y - body.y, _v.z, _w); _w.y = 1.5 + Math.sin(age * 40) * 0.04 * k;
                L.foot.lerpVectors(B.from, _w, kit.EASE.out(k));
                const bp = sweepBody(0, s);
                aim.twist = bp.twist * k; aim.roll = bp.roll * k; aim.pitch = 0.04; aim.y = 1.38; aim.rate = 8;
                hot = k; markOn = s > 0 ? 'sweepL' : 'sweepR'; markK = k;
            } else if (t < Wd + A) {
                const u = (t - Wd) / A, bp = sweepBody(u, s);
                Object.assign(aim, bp); aim.rate = 40;
                sweepFoot(u, s, _v);
                local(_v.x, _v.y - body.y, _v.z, L.foot); L.foot.y = _v.y;
                if (first('whoosh')) snd('legSweep', () => sfx.whoosh());
                cut = true; hot = 1; markOn = s > 0 ? 'sweepL' : 'sweepR'; markK = 1;
            } else if (t < Wd + A + F) {
                cut = false; markOn = null;
                const u = 1 + (t - Wd - A) / F * 0.15, bp = sweepBody(1, s);
                Object.assign(aim, bp); aim.rate = 10;
                sweepFoot(u, s, _v); local(_v.x, _v.y - body.y, _v.z, L.foot); L.foot.y = _v.y;
            } else {
                cut = false;
                const bp = sweepBody(1, s);
                aim.twist = bp.twist * 0.6; aim.roll = bp.roll; aim.rate = 4;
                if (B.life === 2 && !B.again && first('chain') && ctx.rand() < 0.55) {
                    // straight back the other way with the other foreleg
                    release(Li, 0.6);
                    begin('sweep'); B.side = -s; B.again = true;
                    return finish(dt, speedTo);
                }
                lidTo = 1;
                if (t > Wd + A + F + R) { release(Li); B.again = false; settle(); }
            }
        } else if (st === 'charge') {
            // Lowers itself, scrapes the stone, then runs the lane into the wall
            const Wd = (B.again ? 0.75 : 1.05) / S;
            if (B.t < Wd) {
                if (B.t < Wd * 0.7) { face(2.2 * S); B.dir = B.yaw; }
                const l = laneFrom(B.dir);
                B.crashS = l.s;
                Object.assign(lane, { on: true, k: B.t / Wd, x: B.x + Math.sin(B.dir) * 2.4, z: B.z + Math.cos(B.dir) * 2.4, yaw: B.dir, l: l.s, w: 3.4 });
                aim.y = 1.02; aim.pitch = 0.2; aim.rate = 5;
                hot = B.t / Wd;
                // Both forefeet drag back along the stone, twice
                for (const i of [0, 1]) {
                    const L = grab(i), u = (B.t / Wd * 2) % 1;
                    const z = u < 0.72 ? mix(3.6, 1.8, u / 0.72) : mix(1.8, 3.6, (u - 0.72) / 0.28);
                    ground(L.d.home[0] * 0.95, z, L.foot);
                    L.foot.y = u < 0.72 ? 0 : Math.sin((u - 0.72) / 0.28 * Math.PI) * 0.5;
                }
                const ph = Math.floor(B.t / Wd * 2);
                if (ph > B.scrapeAt - 1 && first('scrape' + ph)) {
                    snd('chargeScrape', () => sfx.rumble(0.7));
                    for (const i of [0, 1]) ctx.dust(legs[i].foot.x, legs[i].foot.z, 5, '#7d716a');
                }
            } else {
                if (first('run')) { release(0, 0.7, 0.2); release(1, 0.7, 0.2); B.speed = 0; B.went = 0; ctx.shake(0.3); snd('chargeGo', () => sfx.roar(1.2)); }
                if (!B.did.crash) {
                    const left = B.crashS - B.went, top = 15 * Math.sqrt(S);
                    B.speed = left < 2 ? Math.max(5, B.speed - 34 * dt) : Math.min(top, B.speed + 42 * dt);
                    if (left < 2) ctx.dust(B.x + Math.sin(B.dir) * 2.6, B.z + Math.cos(B.dir) * 2.6, 2, '#7d716a');
                    const step = Math.min(left, B.speed * dt);
                    B.x += Math.sin(B.dir) * step; B.z += Math.cos(B.dir) * step; B.went += step;
                    lane.k = 1;
                    aim.y = 1.2; aim.pitch = 0.12; aim.rate = 8;
                    hot = 1;
                    toLocal(P.x, P.z);
                    if (!B.did.hitP && (B.lx / 2.4) ** 2 + ((B.lz + 0.3) / 3.1) ** 2 < 1) {
                        B.did.hitP = true;
                        hurt(32, B.x, B.z, { kind: 'charge', parryable: false, knock: 2.2 });
                    }
                    if (B.went >= B.crashS - 0.01) {
                        B.did.crash = true;
                        lane.on = false;
                        B.speed = 0;
                        ctx.shake(1);
                        bumpV -= 1.3;
                        const fx = B.x + Math.sin(B.dir) * 2.6, fz = B.z + Math.cos(B.dir) * 2.6;
                        ctx.dust(fx, fz, 22, '#8a7d72');
                        ctx.spark(fx, 1.4, fz, 3.4, '#ffd0a0');
                        snd('crash', () => { sfx.thud(); sfx.rumble(1.4); });
                        begin('stuck');
                        B.kick = 0.55;
                    }
                }
            }
        } else if (st === 'stuck') {
            // Shell cracked against the wall: stuck, and open everywhere
            const dur = (B.life === 1 ? 2.4 : 1.6);
            if (B.kick > 0) { const k = Math.min(B.kick, dt * 3); B.x -= Math.sin(B.yaw) * k; B.z -= Math.cos(B.yaw) * k; B.kick -= k; }
            if (first('say') && ctx.rand() < 0.35) bark('stuck');
            lidTo = 1; crackTo = B.t < dur ? 1 : 0;
            const shake = Math.max(0, 1 - B.t / 0.8);
            aim.y = 1.05; aim.pitch = -0.14 + Math.sin(B.t * 22) * 0.04 * shake; aim.roll = Math.sin(B.t * 17) * 0.1 * shake; aim.rate = 9;
            if (B.t > dur && B.t < dur + 0.7) speedTo = -1.6;
            if (B.t > dur + 0.7) {
                if (B.life === 2 && !B.again && laneOk(aimYaw, dist)) { begin('charge'); B.again = true; }
                else { B.again = false; settle(0.6); }
            }
        } else if (st === 'leap') {
            // Crouches, jumps high, comes down where the visitor was with a ring of force
            const Wd = 0.62 / S, AIR = 1.15 / S;
            if (B.t < Wd) {
                face(1.8 * S);
                aim.y = 0.78; aim.pitch = 0.08; aim.rate = 6;
                hot = B.t / Wd;
            } else if (B.t < Wd + AIR) {
                if (first('jump')) {
                    let tx = P.x, tz = P.z;
                    const r = Math.hypot(tx, tz) || 1, rr = Math.max(3.4, Math.min(8.6, r));
                    tx *= rr / r; tz *= rr / r;
                    B.tx = tx; B.tz = tz; B.sx = B.x; B.sz = B.z;
                    ctx.haz.zone({ shape: 'circle', x: tx, z: tz, r: 3.1, delay: AIR, dmg: 36, onLand: () => {} });
                    snd('leap', () => sfx.whoosh());
                    ctx.dust(B.x, B.z, 14, '#7d716a');
                    for (let i = 0; i < 8; i++) grab(i);
                }
                const k = (B.t - Wd) / AIR;
                B.air = true;
                B.x = mix(B.sx, B.tx, k); B.z = mix(B.sz, B.tz, k);
                body.y = aim.y = mix(0.78, 0.9, k) + 7.2 * 4 * k * (1 - k);
                aim.pitch = mix(-0.25, 0.15, k); aim.rate = 6;
                face(2.5);
                // Legs tucked in, then thrown wide for the landing
                const out = clamp01((k - 0.62) / 0.38);
                for (const L of legs) {
                    local(L.d.home[0] * 0.42, -1.55, L.d.home[1] * 0.5, _v);
                    ground(L.d.home[0], L.d.home[1], _w); _w.y = Math.max(0, body.y - 3.2 * (1 - out) - 0.3);
                    L.foot.lerpVectors(_v, _w, ease(out));
                }
                landShadow.visible = true;
                landShadow.position.set(B.tx, 0.034, B.tz);
                landShadow.scale.setScalar(mix(0.6, 3.0, k));
                landShadow.material.opacity = mix(0.15, 0.6, k);
            } else {
                if (first('land')) {
                    B.air = false; B.x = B.tx; B.z = B.tz;
                    body.y = 0.8; bumpV -= 1.2;
                    for (const L of legs) { L.hand = false; L.stepping = false; ground(L.d.home[0], L.d.home[1], L.foot); }
                    landShadow.visible = false;
                    ctx.shake(1);
                    ctx.dust(B.x, B.z, 26, '#8a7d72');
                    snd('landCrash', () => { sfx.thud(); sfx.rumble(1.2); });
                    ctx.haz.wave({ x: B.x, z: B.z, r0: 3.3, speed: 9, max: 11, dmg: 16 });
                }
                if (B.life === 2 && B.t > Wd + AIR + 0.42 && first('wave2')) ctx.haz.wave({ x: B.x, z: B.z, r0: 3.3, speed: 11, max: 11, dmg: 16 });
                aim.y = STAND; aim.rate = 2.5;
                lidTo = 1;
                if (B.t > Wd + AIR + 1.25 / S) settle();
            }
        } else if (st === 'discs') {
            // Rears, lifts discs off its own back, and flings them low across the roof
            const Wd = 0.72 / S;
            if (first('go')) {
                B.n = B.life === 1 ? (ctx.rand() < 0.5 ? 1 : 3) : (ctx.rand() < 0.45 ? 3 : 5);
                let k = 0;
                for (const d of SHOTS) { if (k >= B.n) break; if (d.on) continue; Object.assign(d, { on: true, held: true, back: false, t: 0, bounces: 0, max: B.life === 1 ? 1 : 2, spin: ctx.rand() * 6, slot: k - (B.n - 1) / 2 }); k++; }
                snd('discWhirr', () => sfx.whoosh());
            }
            if (B.t < Wd) {
                face(2.4 * S);
                const k = B.t / Wd;
                aim.pitch = -0.24 * k; aim.y = mix(STAND, 1.75, k); aim.rate = 7;
                hot = k;
                for (const d of SHOTS) if (d.on && d.held) local(d.slot * 0.8, 1.25 + 1.1 * ease(k), -0.4 + Math.abs(d.slot) * 0.15, d.p);
            } else {
                if (first('throw')) {
                    const base = Math.atan2(P.x - B.x, P.z - B.z), speed = B.life === 1 ? 10.5 : 12;
                    for (const d of SHOTS) {
                        if (!d.on || !d.held) continue;
                        const a = base + d.slot * 0.34;
                        d.held = false; d.t = 0;
                        d.v.set(Math.sin(a) * speed, 0, Math.cos(a) * speed);
                    }
                    snd('discThrow', () => sfx.whoosh());
                }
                aim.pitch = 0.1; aim.y = 1.4; aim.rate = 8;
                if (B.t > Wd + 0.45) lidTo = 1;
                if (B.t > Wd + 0.95 / S) settle();
            }
        } else if (st === 'volley') {
            // Its eye opens wide and spits a spiral of embers; then three that come looking
            const Wd = 0.7 / S, D = 1.8, arms = B.life === 1 ? 2 : 3, every = B.life === 1 ? 0.2 : 0.27;
            lidTo = 1; cast = 1;
            face(0.8);
            if (first('go')) { B.spin = ctx.rand() < 0.5 ? 1 : -1; sfx.eye(1, 0); }
            if (B.t < Wd) { aim.pitch = -0.12; aim.y = 1.6; hot = 0; }
            else if (B.t < Wd + D) {
                aim.pitch = -0.08; aim.y = 1.55;
                const n = Math.floor((B.t - Wd) / every) + 1;
                while (B.n < n) {
                    B.n++;
                    const base = B.yaw + B.spin * B.n * every * 2.4;
                    for (let j = 0; j < arms; j++) {
                        const a = base + j * Math.PI * 2 / arms;
                        ctx.haz.orb({ x: eyeW.x, y: 1.25, z: eyeW.z, tx: eyeW.x + Math.sin(a) * 20, ty: 1.2, tz: eyeW.z + Math.cos(a) * 20, speed: 8, homing: 0, dmg: 10, life: 1.35, size: 0.95 });
                    }
                    if (B.n % 2) sfx.eye(0.6, 0);
                }
            } else if (B.t < Wd + D + 0.8) {
                const n = Math.min(3, Math.floor((B.t - Wd - D) / 0.25) + 1);
                while (B.n < 1000 + n) {
                    if (B.n < 1000) B.n = 1000;
                    B.n++;
                    ctx.haz.orb({ x: eyeW.x, y: 1.3, z: eyeW.z, tx: P.x, ty: 1.2, tz: P.z, speed: 10.5, homing: 0.8, dmg: 11, life: 2.6 });
                    sfx.eye(1, 0);
                }
            } else if (B.t > Wd + D + 1.5 / S) settle();
        } else if (st === 'stamp') {
            // Rears its front half up and brings both forefeet down: the ground there breaks and a ring rolls out
            const Wd = 0.82 / S, SL = 0.12;
            if (first('go')) {
                grab(0); grab(1);
                legs[0].from.copy(legs[0].foot); legs[1].from.copy(legs[1].foot);
                B.tx = B.x + Math.sin(B.yaw) * 3.1; B.tz = B.z + Math.cos(B.yaw) * 3.1;
                ctx.haz.zone({ shape: 'circle', x: B.tx, z: B.tz, r: 3.0, delay: Wd + SL, dmg: 30, onLand: () => {} });
            }
            if (B.t < Wd) {
                const k = ease(B.t / Wd);
                aim.pitch = -0.5 * k; aim.y = mix(STAND, 2.05, k); aim.rate = 8;
                hot = B.t / Wd;
                for (const i of [0, 1]) { const L = legs[i]; local(L.side * 1.5, 3.2, 2.5, _v); L.foot.lerpVectors(L.from, _v, kit.EASE.out(B.t / Wd)); }
                for (const i of [0, 1]) legs[i].to.copy(legs[i].foot);
            } else if (B.t < Wd + SL) {
                const k = (B.t - Wd) / SL;
                aim.pitch = 0.16; aim.y = 1.15; aim.rate = 30;
                for (const i of [0, 1]) { const L = legs[i]; ground(L.side * 1.75, 3.2, _v); _v.y = -0.2; L.foot.lerpVectors(L.to, _v, k * k * k); }
                hot = 1;
            } else {
                if (first('slam')) {
                    ctx.shake(0.9); bumpV -= 0.8;
                    ctx.dust(B.tx, B.tz, 18, '#8a7d72');
                    snd('landCrash', () => { sfx.thud(); sfx.rumble(1); });
                    ctx.haz.wave({ x: B.tx, z: B.tz, r0: 3.2, speed: 8.5, max: 11, dmg: 18 });
                }
                if (B.life === 2 && B.t > Wd + SL + 0.45 && first('wave2')) { ctx.haz.wave({ x: B.tx, z: B.tz, r0: 3.2, speed: 10.5, max: 11, dmg: 18 }); ctx.shake(0.5); }
                aim.pitch = 0.05; aim.y = 1.3; aim.rate = 3;
                lidTo = 1;
                if (B.t > Wd + SL + 1.1 / S) { release(0); release(1); settle(); }
            }
        } else if (st === 'slam') {
            // Rises on all its legs and drops its whole weight: for whoever is under it or behind it
            const Wd = 0.78 / S;
            if (first('go')) {
                ground(0, -0.4, _v);
                B.tx = _v.x; B.tz = _v.z;
                ctx.haz.zone({ shape: 'circle', x: B.tx, z: B.tz, r: 3.5, delay: Wd + 0.1, dmg: 28, onLand: () => {} });
            }
            if (B.t < Wd) {
                const k = ease(B.t / Wd);
                aim.y = mix(STAND, 2.35, k); aim.pitch = -0.05; aim.roll = Math.sin(age * 38) * 0.03 * k; aim.rate = 7;
                hot = B.t / Wd;
            } else if (B.t < Wd + 0.1) { aim.y = 0.6; aim.rate = 45; hot = 1; }
            else {
                if (first('drop')) {
                    ctx.shake(0.9); bumpV -= 0.6;
                    ctx.dust(B.tx, B.tz, 20, '#8a7d72');
                    snd('landCrash', () => { sfx.thud(); sfx.rumble(1); });
                    ctx.haz.wave({ x: B.tx, z: B.tz, r0: 3.7, speed: 8, max: 9, dmg: 16 });
                }
                if (B.life === 2 && B.t > Wd + 0.55 && first('wave2')) ctx.haz.wave({ x: B.tx, z: B.tz, r0: 3.7, speed: 10, max: 9, dmg: 16 });
                aim.y = B.t < Wd + 0.5 ? 0.62 : STAND; aim.rate = 2.2;
                lidTo = 1;
                if (B.t > Wd + 0.1 + 1.25 / S) { B.behind = 0; settle(); }
            }
        } else if (st === 'reel') {
            // A blow turned aside: the leg is flung up and it rears back, wide open
            lidTo = 1;
            aim.pitch = -0.3; aim.y = 1.75; aim.rate = 7;
            const L = legs[B.reelLeg];
            if (B.t < 1.0) { grab(B.reelLeg); local(L.side * 2.3, 3.4, 1.4, _v); L.foot.lerp(_v, 1 - Math.exp(-9 * dt)); }
            else if (first('back')) release(B.reelLeg, 1);
            if (B.t > 1.9) settle(0.4);
        } else if (st === 'stagger') {
            // Posture broken: it goes down on its belly, eye wide open
            lidTo = 1; crackTo = 0.4;
            const w = Math.max(0, 1 - B.t / 1.2);
            aim.y = B.t < 2.6 ? 0.62 : STAND; aim.pitch = 0.16; aim.roll = Math.sin(B.t * 14) * 0.08 * w; aim.rate = B.t < 2.6 ? 7 : 2.5;
            if (B.t > 3.2) settle(0.3);
        } else if (st === 'stumble') {
            // A leg broken: it drops towards that side
            lidTo = 1;
            aim.roll = -B.side * 0.3 * (B.t < 2 ? 1 : 0); aim.y = B.t < 2 ? 0.95 : STAND; aim.pitch = 0.1; aim.rate = 5;
            if (B.t > 2.7) settle(0.3);
        } else if (st === 'down') {
            // Out of health, with a life to spare: it collapses, the eye goes dark
            lidTo = 0; litTo = 0;
            aim.y = 0.5; aim.pitch = 0.14; aim.roll = 0.12; aim.rate = 3;
            if (first('fall')) {
                ctx.haz.clear(); clearHaz();
                snd('crash', () => { sfx.thud(); sfx.rumble(1.5); });
                ctx.shake(0.7);
                for (const L of legs) { grab(L.i); L.from.copy(L.foot); }
            }
            for (const L of legs) { _v.set(L.from.x - B.x, 0, L.from.z - B.z).normalize(); L.foot.copy(L.from).addScaledVector(_v, ease(B.t / 0.6) * 1.0); L.foot.y = 0; }
            if (B.t > 1.7 && ctx.mode === 'play' && !ctx.cine.active && first('revive')) ctx.cine.run(revive);
        } else if (st === 'roar') {
            // Back up, and it throws the visitor back
            aim.pitch = -0.28; aim.y = 1.8; aim.rate = 6;
            lidTo = 1;
            if (first('roar')) {
                sfx.roar(2.2); ctx.shake(0.9);
                ctx.haz.wave({ x: B.x, z: B.z, r0: 2, max: 10, dmg: 0 });
            }
            if (B.t < 0.5 && dist < 8) ctx.push(dx / dist * 14 * dt, dz / dist * 14 * dt);
            if (B.t > 1.3) settle(0.4);
        }
        finish(dt, speedTo);
    }
    // Moving the body (keeps it on the roof and off the brazier), and the marks
    function finish(dt, speedTo) {
        if (B.state !== 'charge') {
            B.speed = toward(B.speed, speedTo, 3, dt);
            B.x += Math.sin(B.yaw) * B.speed * dt; B.z += Math.cos(B.yaw) * B.speed * dt;
        }
        if (B.state !== 'charge' && B.state !== 'stuck' && !B.air) {
            const r = Math.hypot(B.x, B.z);
            if (r > 9.0) { B.x *= 9.0 / r; B.z *= 9.0 / r; }
            if (r < 2.2) { const k = 2.2 / (r || 1); B.x = (B.x || 0.01) * k; B.z *= k; }
        }
        for (const name in marks) {
            if (markOn === name) ctx.mark.show(marks[name], B.x, B.z, B.yaw, 1, markK);
            else ctx.mark.hide(marks[name]);
        }
    }
    function addStab(k, off) {
        const Li = (off > 0 ? 0 : 1) ^ (k % 2), L = grab(Li), P = ctx.P;
        const S = sp(), wind = (k === 0 ? 0.8 : k === 2 ? 1.0 : 0.55) / S;
        // Where its point will land: where the visitor is, or as near as the leg can reach
        hipOf(L, _v);
        let tx = P.x, tz = P.z;
        const hx = tx - _v.x, hz = tz - _v.z, hd = Math.hypot(hx, hz), reach = Math.sqrt(Math.max(1, (L.d.l1 + L.d.l2 - 0.3) ** 2 - _v.y * _v.y));
        if (hd > reach) { tx = _v.x + hx / hd * reach; tz = _v.z + hz / hd * reach; }
        const sb = { k, leg: Li, t: 0, wind, phase: 'wind', from: L.foot.clone(), C: V(), T: V(tx, -0.3, tz), hold: (k === B.n - 1 ? 0.95 : 0.55) / S, ping: null };
        sb.ping = ping(tx, tz, STAB_R, wind + STRIKE);
        // a leg reused by a later stab stops its earlier one
        for (const o of stabs) if (o.leg === Li && o.phase !== 'done') o.phase = 'done';
        stabs.push(sb);
    }

    // ═════════════ Every frame: body, gait, everything it carries ═════════════
    let px = 0, pz = 0, pyaw = 0;
    function motion(dt) {
        if (dt <= 0) return;
        const r = 1 - Math.exp(-aim.rate * dt);
        if (!B.air) body.y += (aim.y - body.y) * r;
        body.pitch += (aim.pitch - body.pitch) * r;
        body.roll += (aim.roll - body.roll) * r;
        body.twist += (aim.twist - body.twist) * r;
        bumpV += (-70 * bump - 10 * bumpV) * dt;
        bump += bumpV * dt;
        bump = Math.max(-0.5, Math.min(0.3, bump));
        B.vx = toward(B.vx, (B.x - px) / dt, 10, dt);
        B.vz = toward(B.vz, (B.z - pz) / dt, 10, dt);
        if (!B.turn) B.turn = angDiff(B.yaw, pyaw) / dt;
        px = B.x; pz = B.z; pyaw = B.yaw;
        flinch = toward(flinch, 0, 5, dt);
        lid = toward(lid, lidTo, lidTo < lid ? 16 : 6, dt);
        lit = toward(lit, litTo, 5, dt);
        crack = toward(crack, crackTo, crackTo > crack ? 12 : 3, dt);
        bodyMatrix(bodyM, B.x, B.z, B.yaw + body.twist, body.y + bump, body.pitch, body.roll);
        gait(dt);
        flyDiscs(dt);
        drawPings(dt);
    }
    function update(dt) {
        age += dt;
        if (B.state === 'dying') return;
        think(dt);
        motion(dt);
        if (B.life === 2 && B.hp < 28 && !B.lowSaid && fighting) { B.lowSaid = true; bark('low', true); ctx.score.intensity(1); }
    }

    // ── After the animation: put every piece where the state says, and test the sweeping leg ──
    const _ds = V(), _dq = new THREE.Quaternion(), _bisect = V();
    function disc(idx, at, dir, r, th = 0.08) {
        _dq.setFromUnitVectors(Y, dir);
        legDiscs.setMatrixAt(idx, _m.compose(at, _dq, _ds.set(r, th, r)));
    }
    const BLOW = { kind: 'blade', parryable: true, fromX: 0, fromZ: 0 };
    const _u1 = V(), _u2 = V(), _at = V(), _bl = V();
    function posed(dt) {
        if (!(dt >= 0)) dt = 0;
        // Its body
        const sway = legs.reduce((s, L) => s + (L.stepping ? L.side * Math.sin(Math.PI * Math.min(1, L.k)) : 0), 0) * 0.025;
        bodyMatrix(bodyM, B.x, B.z, B.yaw + body.twist, body.y + bump, body.pitch + flinch * 0.06, body.roll + sway);
        bodyM.decompose(bodyG.position, bodyG.quaternion, _s);
        drawPlates(crack);
        backGlow.material.opacity = crack * (0.8 + Math.sin(age * 18) * 0.15);
        // Its eye: lids, light, and where the slit is looking
        const a = mix(0.06, 1.15, lid);
        lidU.rotation.x = -a; lidL.rotation.x = a;
        const glow = lit * (0.35 + 0.65 * lid) * (1 + cast * 0.5 + flinch * 0.4);
        EYE.color.setRGB(mix(0.12, 1, lit), mix(0.02, 0.16 + cast * 0.3, lit), mix(0.02, 0.1, lit));
        eyeGlow.material.opacity = Math.min(1, glow * 0.85);
        eyeGlow.scale.setScalar(2.4 + glow * 1.6);
        eyeLight.intensity = glow * 7;
        eyeG.getWorldPosition(eyeW);
        ctx.toArena(eyeW);
        if (eyeG.parent === bodyG) {
            const P = ctx.P;
            _v.set(P.x, 1.0, P.z);
            ctx.toWorld(_v);
            eyeG.worldToLocal(_v);
            eyeLook.rotation.set(Math.max(-0.4, Math.min(0.4, -Math.atan2(_v.y, Math.hypot(_v.x, _v.z)))), Math.max(-0.6, Math.min(0.6, Math.atan2(_v.x, _v.z))), 0);
        }
        // Its legs: hip from the body, foot from the gait or the move, knee from the IK
        let rd = 0;
        for (const L of legs) {
            const base = L.i * NLD, big = L.d.front ? 1.15 : 1;
            if (L.hide) { for (let k = 0; k < NLD; k++) legDiscs.setMatrixAt(base + k, _m.makeScale(0, 0, 0)); rods.setMatrixAt(L.i * 2, _m); rods.setMatrixAt(L.i * 2 + 1, _m); blades.setMatrixAt(L.i, _m); continue; }
            hipOf(L, L.hip);
            solve(L.hip, L.foot, L.d.l1, L.d.l2, poleFor(L, L.hip, B.x, B.z), L.knee, L.tip);
            _u1.subVectors(L.knee, L.hip).normalize();
            _u2.subVectors(L.tip, L.knee).normalize();
            let n = 0;
            disc(base + n++, L.hip, _u1, 0.5 * big, 0.12);
            for (let k = 0; k < 6; k++) { const s = 0.12 + k * 0.15; disc(base + n++, _at.copy(L.hip).addScaledVector(_u1, L.d.l1 * s), _u1, mix(0.44, 0.3, s) * big); }
            disc(base + n++, L.knee, _bisect.addVectors(_u1, _u2).normalize(), 0.42 * big, 0.14);
            const shin = L.d.l2 - BLADE * (L.broken ? 0.4 : 1);
            for (let k = 0; k < 5; k++) { const s = 0.1 + k * 0.15; disc(base + n++, _at.copy(L.knee).addScaledVector(_u2, shin * s / 0.75 * 0.75), _u2, mix(0.32, 0.19, s) * big); }
            // spindles
            _at.addVectors(L.hip, L.knee).multiplyScalar(0.5);
            rods.setMatrixAt(rd++, _m.compose(_at, _dq.setFromUnitVectors(Y, _u1), _ds.set(0.1 * big, L.d.l1, 0.1 * big)));
            _bl.copy(L.knee).addScaledVector(_u2, shin);
            _at.addVectors(L.knee, _bl).multiplyScalar(0.5);
            rods.setMatrixAt(rd++, _m.compose(_at, _dq.setFromUnitVectors(Y, _u2), _ds.set(0.08 * big, shin, 0.08 * big)));
            // the point, from where the spindle ends to the tip (cone tips point along +y)
            _at.copy(L.tip).addScaledVector(_u2, -BLADE * 0.5);
            _dq.setFromUnitVectors(Y, _u2);
            blades.setMatrixAt(L.i, _m.compose(_at, _dq, _ds.set(0.15 * big, L.broken ? 0.001 : BLADE, 0.15 * big)));
        }
        legDiscs.instanceMatrix.needsUpdate = rods.instanceMatrix.needsUpdate = blades.instanceMatrix.needsUpdate = true;
        // The shadow under it shrinks as it rises
        const lift = Math.max(0, body.y - STAND);
        ground(0, -0.3, _v);
        blob.position.set(_v.x, 0.034, _v.z);
        blob.rotation.z = B.yaw;
        blob.scale.set(2.4 / (1 + lift * 0.12), 3.4 / (1 + lift * 0.12), 1);
        blob.material.opacity = 0.5 / (1 + lift * 0.3) * (bodyG.visible ? 1 : 0);
        placeDiscs();
        if (bits.length) drawBits();
        // The sweep: does the shin pass over the visitor?
        if (cut && ctx.mode === 'play') {
            const L = legs[B.side > 0 ? 0 : 1];
            BLOW.fromX = B.x; BLOW.fromZ = B.z;
            B.blow = 'sweep';
            const r = ctx.haz.blade(swingId, L.knee, L.tip, SWEEP_R, 28, BLOW);
            if (r === 'hit') bark('heavy');
        }
    }

    // ═════════════ Loose discs and cases ═════════════
    function spawnBit(mesh, at, q, s, v, w, thin, isPlate) {
        const pool = mesh === loose ? LOOSE_N : LP_N;
        if (mesh.count >= pool) return null;
        const b = { mesh, i: mesh.count++, p: at.clone(), q: q.clone(), s: s.clone(), v: v.clone(), w: w.clone(), thin: thin.clone(), plate: isPlate, mode: 'fly', dir: 0, spd: 0, lean: 0, t: 0, flat: new THREE.Quaternion(), r: s.x };
        bits.push(b);
        return b;
    }
    function clearBits() { bits.length = 0; loose.count = 0; loosePl.count = 0; }
    const _ax = V(), _perp = V(), _nn = V(), _bq = new THREE.Quaternion();
    function nearGap(p) {
        const a = (Math.atan2(p.z, p.x) / (Math.PI * 2) * 36 + 36) % 36, i = Math.round(a) % 36;
        return GAPS.includes(i);
    }
    function simBits(dt) {
        for (const b of bits) {
            b.t += dt;
            if (b.mode === 'gone' || b.mode === 'rest') continue;
            const R = Math.hypot(b.p.x, b.p.z);
            if (b.mode === 'fly') {
                b.v.y -= 16 * dt;
                b.p.addScaledVector(b.v, dt);
                const wl = b.w.length();
                if (wl > 0) b.q.premultiply(_bq.setFromAxisAngle(_ax.copy(b.w).divideScalar(wl), wl * dt));
                if (b.p.y < -12) { b.mode = 'gone'; continue; }
                if (R < 12.9 && b.p.y <= 0.06 + b.r * 0.15 && b.v.y < 0) {
                    const h = Math.hypot(b.v.x, b.v.z);
                    clink();
                    if (!b.plate && h > 1.3 && ctx.rand() < 0.8) { b.mode = 'roll'; b.dir = Math.atan2(b.v.x, b.v.z); b.spd = h * 0.9; b.lean = (ctx.rand() - 0.5) * 0.3; }
                    else if (b.v.y < -4 && ctx.rand() < 0.5) { b.v.y *= -0.3; b.v.x *= 0.6; b.v.z *= 0.6; b.p.y = 0.07; }
                    else {
                        b.mode = 'settle';
                        _nn.copy(b.thin);
                        b.flat.setFromUnitVectors(_nn, Y).premultiply(_bq.setFromAxisAngle(Y, ctx.rand() * 6.28));
                        b.v.y = 0;
                    }
                }
            } else if (b.mode === 'roll') {
                b.p.x += Math.sin(b.dir) * b.spd * dt; b.p.z += Math.cos(b.dir) * b.spd * dt;
                b.spd -= (0.8 + Math.abs(b.lean) * 1.5) * dt;
                b.lean += Math.sign(b.lean || 1) * (0.25 + 0.6 / (b.spd + 0.3)) * dt;
                b.dir += b.lean * 1.1 * dt;
                if (R > 12.1) {
                    if (b.spd > 2.6 || nearGap(b.p)) { b.mode = 'fly'; b.v.set(Math.sin(b.dir) * b.spd, 1.5, Math.cos(b.dir) * b.spd); b.w.set(Math.cos(b.dir), 0, -Math.sin(b.dir)).multiplyScalar(b.spd / b.r); b.p.y += 0.4; }
                    else { const nx = b.p.x / R, nz = b.p.z / R, vx = Math.sin(b.dir), vz = Math.cos(b.dir), d = vx * nx + vz * nz; b.dir = Math.atan2(vx - 2 * d * nx, vz - 2 * d * nz); b.spd *= 0.5; b.p.x = nx * 12.05; b.p.z = nz * 12.05; clink(); }
                }
                if (b.spd < 0.35 || Math.abs(b.lean) > 1.2) b.mode = 'topple';
                rollPose(b);
            } else if (b.mode === 'topple') {
                b.lean += Math.sign(b.lean || 1) * dt * (2 + Math.abs(b.lean) * 6);
                if (Math.abs(b.lean) >= Math.PI / 2) { b.lean = Math.sign(b.lean) * Math.PI / 2; b.mode = 'rest'; clink(); }
                rollPose(b);
            } else if (b.mode === 'settle') {
                b.q.slerp(b.flat, 1 - Math.exp(-12 * dt));
                b.p.y = toward(b.p.y, b.s.y * 0.5 + 0.01, 12, dt);
                b.p.x += b.v.x * dt; b.p.z += b.v.z * dt;
                b.v.x = toward(b.v.x, 0, 5, dt); b.v.z = toward(b.v.z, 0, 5, dt);
                if (b.t > 30 || (Math.abs(b.v.x) + Math.abs(b.v.z) < 0.05 && b.q.angleTo(b.flat) < 0.02)) { b.q.copy(b.flat); b.mode = 'rest'; }
            }
        }
    }
    // A disc on its rim: its face across the way it rolls, leaning over as it slows
    function rollPose(b) {
        _perp.set(Math.cos(b.dir), 0, -Math.sin(b.dir));
        _nn.copy(_perp).multiplyScalar(Math.cos(b.lean)).addScaledVector(Y, Math.abs(Math.sin(b.lean))).normalize();
        b.q.setFromUnitVectors(Y, _nn);
        b.p.y = b.r * Math.cos(b.lean) + b.s.y * 0.5 * Math.abs(Math.sin(b.lean));
    }
    function drawBits() {
        for (const b of bits) {
            if (b.mode === 'gone') _m.makeScale(0, 0, 0); else _m.compose(b.p, b.q, b.s);
            b.mesh.setMatrixAt(b.i, _m);
        }
        loose.instanceMatrix.needsUpdate = loosePl.instanceMatrix.needsUpdate = true;
    }

    // ═════════════ Cut-scenes ═════════════
    // The intro: quiet; the tower shakes; a leg the size of a tree comes up over the edge of the roof and stabs into
    // the stone, then another; it hauls itself over the wall, discs sliding off it, and the eye opens.
    async function intro(shot) {
        const P = ctx.P;
        let ux = -P.x, uz = -P.z;
        const ul = Math.hypot(ux, uz);
        if (ul < 1.5) { ux = 0; uz = -1; } else { ux /= ul; uz /= ul; }
        const fx = -ux, fz = -uz, sx = fz, sz = -fx;                    // inwards, and across (its own +x)
        const at = (r, s, y, out = V()) => out.set(ux * r + sx * s, y, uz * r + sz * s);
        const END = 7.4;
        fresh();
        B.state = 'intro'; fighting = false;
        B.yaw = Math.atan2(fx, fz);
        lid = lidTo = 0; lit = litTo = 0.15;
        bodyG.visible = true;
        let T = 0;
        const A0 = [at(13.9, 1.4, -2.2), at(13.25, 1.7, 2.9), at(11.3, 1.8, -0.25)];
        const A1 = [at(13.9, -1.6, -2.2), at(13.2, -1.9, 2.8), at(11.1, -2.0, -0.25)];
        const over = [5.6, 5.6, 6.3, 6.3, 7.0, 7.0];
        const fired = new Set();
        const once = k => (fired.has(k) ? false : (fired.add(k), true));
        function climbAt(dt) {
            let r, y, p;
            if (T < 4.6) { r = 15.6; y = -2.8 + Math.sin(T * 1.3) * 0.06; p = -1.15; }
            else if (T < 6.4) { const k = ease((T - 4.6) / 1.8); r = mix(15.6, 12.2, k); y = mix(-2.8, 2.3, Math.sin(k * Math.PI / 2)); p = mix(-1.15, -0.3, k); }
            else if (T < 7.4) { const k = ease((T - 6.4) / 1.0); r = mix(12.2, 9.8, k); y = mix(2.3, STAND, k); p = mix(-0.3, 0.12, k); }
            else { const k = ease((T - 7.4) / 1.3); r = mix(9.8, END, k); y = STAND; p = mix(0.12, 0, k); }
            const px0 = B.x, pz0 = B.z;
            at(r, 0, 0, _h);
            B.x = _h.x; B.z = _h.z;
            body.y = aim.y = y; body.pitch = aim.pitch = p; aim.rate = 4;
            if (T >= 7.4) { aim.pitch = body.pitch; }
            B.turn = 0;
            bodyMatrix(bodyM, B.x, B.z, B.yaw, body.y, body.pitch, body.roll);
            // The forelegs: up over the wall, and down into the stone
            for (const [i, path, t0, t1, t2] of [[0, A0, 1.8, 2.75, 2.9], [1, A1, 3.5, 4.15, 4.3]]) {
                const L = legs[i];
                if (T > 6.6) { if (once('rel' + i)) release(i, 1.4, 0.5); continue; }
                L.hand = true;
                if (T < t0) { hipOf(L, L.foot); L.foot.y -= 2.6; L.foot.x += ux * 0.8; L.foot.z += uz * 0.8; }
                else if (T < t1) { const k = (T - t0) / (t1 - t0); L.foot.lerpVectors(path[0], path[1], kit.EASE.out(k)); L.foot.y += Math.sin(k * Math.PI) * 0.6; }
                else if (T < t2) { const k = (T - t1) / (t2 - t1); L.foot.lerpVectors(path[1], path[2], k * k * k); }
                else {
                    L.foot.copy(path[2]);
                    if (once('hit' + i)) {
                        ctx.shake(i ? 0.8 : 0.95);
                        ctx.dust(path[2].x, path[2].z, 14, '#8a7d72');
                        ctx.spark(path[2].x, 0.4, path[2].z, 2.4, '#e8d8c8');
                        snd('legStab', () => { sfx.thud(); sfx.tick(); });
                        sfx.rumble(1.2);
                    }
                    const k = Math.max(0, 1 - (T - t2) * 3);
                    L.foot.x += Math.sin(T * 60) * 0.05 * k;
                }
            }
            // The other legs hang below the edge until they come over it, two by two
            for (let i = 2; i < 8; i++) {
                const L = legs[i];
                if (T >= over[i - 2]) { if (once('over' + i)) { L.hand = false; homeOf(L, L.to); startStep(L, 0.55, 2.3); } continue; }
                L.hand = true;
                hipOf(L, L.foot); L.foot.y -= 2.6; L.foot.x += ux * 0.8; L.foot.z += uz * 0.8;
            }
            // Discs slide off its back as it hauls itself up
            if (T > 5.0 && T < 6.6 && Math.floor(T * 5) !== Math.floor((T - dt) * 5)) {
                const s = shellList[Math.floor(ctx.rand() * shellList.length)];
                _v.copy(s.p).applyMatrix4(bodyM);
                _dq.setFromUnitVectors(Y, s.n);
                const fwd = ctx.rand() < 0.3;
                spawnBit(loose, _v, _dq, _ds.set(s.r, 0.08, s.r), _w.set(ux * (fwd ? -3 : 2.5) + (ctx.rand() - 0.5) * 2, fwd ? 3 : 1.2, uz * (fwd ? -3 : 2.5) + (ctx.rand() - 0.5) * 2), _u.set(ctx.rand() * 8 - 4, ctx.rand() * 4, ctx.rand() * 8 - 4), Y, false);
                clink();
            }
            B.vx = 0; B.vz = 0;
            px = B.x; pz = B.z; pyaw = B.yaw;
            if (T >= 7.4) { B.vx = (B.x - px0) / Math.max(dt, 1e-3); B.vz = (B.z - pz0) / Math.max(dt, 1e-3); }
        }
        shot.each(dt => {
            T += dt; age += dt; B.introT = T;
            climbAt(dt);
            // the body moves by script; the rest of motion still runs (gait, eye, lids, bump)
            const r = 1 - Math.exp(-aim.rate * dt);
            body.roll += (aim.roll - body.roll) * r;
            bumpV += (-70 * bump - 10 * bumpV) * dt; bump += bumpV * dt;
            lid = toward(lid, lidTo, 7, dt); lit = toward(lit, litTo, 6, dt);
            bodyMatrix(bodyM, B.x, B.z, B.yaw, body.y + bump, body.pitch, body.roll);
            gait(dt);
            simBits(dt);
        });
        const look = (r, s, y) => at(r, s, y).toArray();
        const behind = (back, side, y) => [P.x + fx * back + sx * side, y, P.z + fz * back + sz * side];
        // 1. Quiet. Behind the visitor, looking across the roof at the far wall
        shot.cam(behind(4.4, 1.7, 1.55), look(12.4, 0, 1.2), { fov: 50 });
        shot.move(behind(3.5, 1.3, 1.35), look(12.4, 0, 1.2), 1.8);
        await shot.until(() => T >= 0.7);
        if (!shot.skipped) sfx.rumble(2.2);
        await shot.until(() => T >= 1.0);
        ctx.shake(0.35);
        for (const s of [-3, 0, 2.5]) ctx.dust(at(12.3, s, 0).x, at(12.3, s, 0).z, 4, '#8a7d72');
        await shot.until(() => T >= 1.5);
        ctx.shake(0.6);
        // 2. At the wall, side on: a leg comes up over it
        shot.cam(at(9.2, 4.6, 0.32).toArray(), look(12.9, 0.9, 1.7), { fov: 52 });
        await shot.until(() => T >= 2.9);
        shot.slow(0.3);
        await shot.wait(0.45);
        shot.slow(1);
        await shot.until(() => T >= 3.4);
        // 3. Low behind the visitor: a second leg, then the whole thing hauls itself over the wall
        shot.cam(behind(3.6, -2.3, 0.5), look(11.5, 0, 2.0), { fov: 58 });
        await shot.until(() => T >= 4.8);
        shot.move(behind(3.2, -2.1, 0.4), look(10.5, 0, 4.4), 2.6, { fov: 62 });
        await shot.until(() => T >= 7.55);
        // The eye opens
        lidTo = 1; litTo = 1;
        if (!shot.skipped) { ctx.flash('rgba(255,40,20,0.35)', 0.4); sfx.roar(2.6); ctx.shake(0.7); }
        shot.move(at(END - 6.2, -1.4, 0.7).toArray(), look(END - 2.2, 0, 1.5), 1.4, { fov: 54 });
        await shot.until(() => T >= 7.85);
        shot.say('PRESS START.', 1.6);
        await shot.until(() => T >= 9.0);
        // 4. High above the tower: it fills half the roof, the visitor a speck before it
        const mx = (P.x + ux * END) / 2, mz = (P.z + uz * END) / 2;
        shot.cam(behind(5, 7, 16), [mx, 0, mz], { fov: 50 });
        shot.move(behind(6, 8.5, 19), [mx, 0, mz], 1.8);
        shot.say(`NEW GAME, ${NAME}.`, 1.7);
        await shot.until(() => T >= 10.3);
        // 5. Under its eye, looking up; its name
        shot.cam(at(END - 7.4, 3.6, 0.5).toArray(), look(END - 1.2, 0, 2.2), { fov: 58 });
        if (!shot.skipped) { sfx.roar(1.8); ctx.shake(0.6); snd('titleHit', () => sfx.thud()); }
        await shot.card('THE PLAYER', SUB, 2.1);
        // However it ended (played or skipped): standing on the roof, every foot down, eye half-lidded
        T = 99;
        climbAt(0.016);
        B.x = ux * END; B.z = uz * END;
        Object.assign(body, { y: STAND, pitch: 0, roll: 0, twist: 0 });
        Object.assign(aim, { y: STAND, pitch: 0, roll: 0, twist: 0, rate: 4 });
        plantAll();
        clearBits();
        lid = 0.3; lidTo = 0.08; lit = litTo = 1;
        B.state = 'idle'; B.cool = 1.2;
        px = B.x; pz = B.z; pyaw = B.yaw;
    }

    // The extra life: it lies dark; a life ticks away; the eye relights, the shell slams shut, and it gets up
    async function revive(shot) {
        shot.each(dt => { age += dt; motion(dt); });
        const fw = V(Math.sin(B.yaw), 0, Math.cos(B.yaw)), sd = V(fw.z, 0, -fw.x);
        const ex = eyeW.x, ez = eyeW.z;
        shot.cam([ex + fw.x * 3.4 + sd.x * 1.1, 0.5, ez + fw.z * 3.4 + sd.z * 1.1], [ex, 0.8, ez], { fov: 44 });
        bigEl.innerHTML = lifeIcons(2);
        bigEl.style.opacity = 1;
        shot.say('CONTINUE?', 1.5);
        await shot.wait(1.1);
        // A life spent
        bigEl.innerHTML = lifeIcons(1);
        bigEl.style.transform = 'translateX(-50%) scale(1.25)';
        if (!shot.skipped) { sfx.thud(); sfx.tick(); ctx.flash('rgba(255,255,255,0.25)', 0.2); }
        lives(1);
        await shot.wait(0.15);
        bigEl.style.transform = 'translateX(-50%) scale(1)';
        await shot.wait(0.6);
        // It relights
        litTo = 1; lit = 1; lid = 1; lidTo = 0;
        aim.y = 0.75;
        if (!shot.skipped) { ctx.flash('rgba(255,42,26,0.55)', 0.3); sfx.roar(2); ctx.shake(0.9); snd('revive', () => sfx.rumble(1.5)); ctx.score.stinger('revive'); }
        shot.say('YES.', 1.0);
        bigEl.style.opacity = 0;
        await shot.wait(0.55);
        // It gets up
        for (const L of legs) release(L.i, 0.9, 0.45);
        Object.assign(aim, { y: STAND, pitch: -0.15, roll: 0, rate: 3 });
        shot.move([ex + fw.x * 7.5 + sd.x * 3, 0.9, ez + fw.z * 7.5 + sd.z * 3], [B.x, 1.7, B.z], 1.8, { fov: 54 });
        await shot.wait(0.7);
        shot.say('I ALWAYS HAVE ONE MORE.', 2.0);
        await shot.wait(1.3);
        // However it ended: on its feet, second life, faster
        bigEl.style.opacity = 0;
        lives(1);
        B.life = 2; B.hp = REVIVE_HP; B.posture = 0;
        for (const L of legs) { L.broken = false; L.hp = LEG_HP; }
        lit = litTo = 1;
        begin('roar');
        ctx.score.intensity(0.7);
    }

    // The end: its legs give way one by one, the shell splits and the discs roll away, the eye rolls free and goes dark
    async function outro(shot) {
        clearHaz();
        fighting = false;
        B.state = 'dying'; B.air = false;
        bigEl.style.opacity = 0;
        const order = [7, 2, 4, 1, 6, 3, 5, 0];
        let T = 0, gone = 0, split = false, burst = false, freed = false;
        const eye = { p: V(), v: V(), spin: 0, dir: 0 };
        const fw = V(Math.sin(B.yaw), 0, Math.cos(B.yaw)), sd = V(fw.z, 0, -fw.x);
        const cx = B.x, cz = B.z, P = ctx.P;
        for (const L of legs) { L.hand = true; L.stepping = false; L.from.copy(L.foot); L.from.y = 0; }
        lidTo = 0.5;
        function dyingAt(dt) {
            // legs buckle
            for (let k = 0; k < 8; k++) {
                const t0 = 0.25 + k * 0.28, L = legs[order[k]];
                if (T < t0) continue;
                if (k >= gone) { gone = k + 1; ctx.dust(L.foot.x, L.foot.z, 6, '#7d716a'); ctx.shake(0.3); sfx.tick(); if (k % 2 === 0) sfx.thud(); B.side = L.side; }
                _v.set(L.from.x - cx, 0, L.from.z - cz).normalize();
                L.foot.copy(L.from).addScaledVector(_v, ease((T - t0) / 0.3) * 1.5);
            }
            aim.y = mix(STAND, 0.55, gone / 8); aim.roll = gone < 8 ? -B.side * 0.12 : 0; aim.pitch = gone / 8 * 0.12; aim.rate = 5;
            if (T > 2.6 && gone >= 8) { aim.y = 0.42; aim.rate = 9; }
            // the shell splits
            if (T > 3.0 && !split) {
                split = true;
                ctx.shake(0.8); ctx.dust(cx, cz, 30, '#8a7d72');
                snd('crash', () => { sfx.thud(); sfx.rumble(2); });
                bodyMatrix(bodyM, B.x, B.z, B.yaw + body.twist, body.y + bump, body.pitch, body.roll);
                shellList.forEach((s, i) => {
                    _m.multiplyMatrices(bodyM, shellLocal[i]).decompose(_v, _dq, _ds);
                    _w.set(_v.x - cx, 0, _v.z - cz).normalize();
                    const sp0 = 2.5 + ctx.rand() * 5.5;
                    spawnBit(loose, _v, _dq, _ds, _u.set(_w.x * sp0, 2 + ctx.rand() * 4, _w.z * sp0), _at.set(ctx.rand() * 10 - 5, ctx.rand() * 6 - 3, ctx.rand() * 10 - 5), Y, false);
                });
                plateList.forEach((pl, i) => {
                    plates.getMatrixAt(i, _m); _m.premultiply(bodyM).decompose(_v, _dq, _ds);
                    _w.set(_v.x - cx, 0, _v.z - cz).normalize();
                    spawnBit(loosePl, _v, _dq, _ds, _u.set(_w.x * 3, 3 + ctx.rand() * 2, _w.z * 3), _at.set(ctx.rand() * 6 - 3, 0, ctx.rand() * 6 - 3), pl.ridge ? V(1, 0, 0) : Y, true);
                });
                shell.visible = plates.visible = false;
                lidU.visible = lidL.visible = socket.visible = false;
                backGlow.material.opacity = 0;
                under.scale.multiplyScalar(0.7);
            }
            // the legs come apart into their discs
            if (T > 3.3 && !burst) {
                burst = true;
                for (let i = 0; i < 8 * NLD; i++) {
                    legDiscs.getMatrixAt(i, _m); _m.decompose(_v, _dq, _ds);
                    spawnBit(loose, _v, _dq, _ds, _u.set(ctx.rand() * 3 - 1.5, 1 + ctx.rand() * 2, ctx.rand() * 3 - 1.5), _at.set(ctx.rand() * 8 - 4, 0, ctx.rand() * 8 - 4), Y, false);
                }
                for (const L of legs) L.hide = true;
                ctx.dust(cx, cz, 20, '#7d716a');
            }
            // the eye drops out and rolls towards the visitor
            if (T > 5.3 && !freed) {
                freed = true;
                arena.attach(eyeG);
                eyeLook.rotation.set(0, 0, 0);
                eye.p.copy(eyeG.position);
                eye.dir = Math.atan2(P.x - eye.p.x, P.z - eye.p.z) + (ctx.rand() - 0.5) * 0.5;
                eye.v.set(Math.sin(eye.dir) * 3.2, 1.5, Math.cos(eye.dir) * 3.2);
                under.visible = false;
                sfx.thud();
            }
            if (freed) {
                eye.v.y -= 14 * dt;
                eye.p.addScaledVector(eye.v, dt);
                if (eye.p.y < 0.62) { eye.p.y = 0.62; eye.v.y = Math.abs(eye.v.y) > 2 ? -eye.v.y * 0.3 : 0; }
                const h = Math.hypot(eye.v.x, eye.v.z), slow = Math.max(0, h - 0.9 * dt);
                if (h > 0) { eye.v.x *= slow / h; eye.v.z *= slow / h; }
                if (Math.hypot(eye.p.x, eye.p.z) > 11.8) { eye.v.x *= -0.4; eye.v.z *= -0.4; }
                eye.spin += slow / 0.62 * dt;
                eyeG.position.copy(eye.p);
                // it rolls, but comes to rest looking up at whoever is watching
                eyeG.rotation.set(0, Math.atan2(sd.x + fw.x * 0.4, sd.z + fw.z * 0.4), 0);
                eyeLook.rotation.set(Math.sin(eye.spin) * 0.5 * Math.min(1, slow), Math.cos(eye.spin * 0.7) * 0.4 * Math.min(1, slow), 0);
            }
            // and goes dark, with a last flicker
            litTo = T < 6.2 ? 1 : T < 9.2 ? Math.max(0, 1 - (T - 6.2) / 3) * (Math.sin(T * 31) > -0.6 ? 1 : 0.2) : 0;
        }
        shot.each(dt => {
            T += dt; age += dt;
            dyingAt(dt);
            const r = 1 - Math.exp(-aim.rate * dt);
            body.y += (aim.y - body.y) * r; body.pitch += (aim.pitch - body.pitch) * r; body.roll += (aim.roll - body.roll) * r;
            lid = toward(lid, lidTo, 5, dt); lit = toward(lit, litTo, 7, dt);
            simBits(dt);
            if (freed) shot.cam([eye.p.x + sd.x * 4.6 + fw.x * 1.8, 1.1, eye.p.z + sd.z * 4.6 + fw.z * 1.8], [eye.p.x, 0.55, eye.p.z], { fov: 44 });
        });
        // 1. Low, from the side, as its legs give way
        shot.cam([cx + sd.x * 8.5 + fw.x * 1.5, 1.2, cz + sd.z * 8.5 + fw.z * 1.5], [cx, 1.0, cz], { fov: 52 });
        shot.move([cx + sd.x * 7.6 + fw.x * 2.4, 0.9, cz + sd.z * 7.6 + fw.z * 2.4], [cx, 0.8, cz], 2.9);
        await shot.until(() => T >= 2.9);
        // 2. From above: the shell splits and the discs spill across the roof and off the edge
        shot.cam([cx + fw.x * 6 + sd.x * 3, 10, cz + fw.z * 6 + sd.z * 3], [cx, 0, cz], { fov: 56 });
        shot.move([cx + fw.x * 7 + sd.x * 4, 12.5, cz + fw.z * 7 + sd.z * 4], [cx, 0, cz], 2.4);
        await shot.until(() => T >= 5.3);
        // 3. Down at the eye as it rolls free and dims
        await shot.until(() => T >= 5.8);
        shot.say('NO CONTINUES.', 1.8);
        await shot.until(() => T >= 7.8);
        shot.say('THE GAME ENDS. THE STORY DOES NOT.', 2.8);
        await shot.until(() => T >= 10.6);
        // However it ended: everything settled, dark
        if (shot.skipped || T < 10.6) {
            while (T < 10.6) { T += 1 / 30; dyingAt(1 / 30); }
        }
        for (let i = 0; i < 600; i++) simBits(1 / 30);
        drawBits();
        lit = litTo = 0;
        eyeLight.intensity = 0;
        settled = true;
    }
    let settled = false;

    // ═════════════ Taking damage ═════════════
    function damage(amount, info = {}) {
        const st = B.state;
        if (st === 'down' || st === 'dying' || st === 'intro' || st === 'roar' || B.air) return NONE;
        const P = ctx.P;
        let mult = 0.4, post = 3, where = 'shell', broke = false;
        if (info.kind === 'reflect') { mult = 1; post = 26; where = 'eye'; }
        else {
            const ix = info.x ?? P.x, iz = info.z ?? P.z;
            const off = angDiff(Math.atan2(ix - B.x, iz - B.z), B.yaw);
            const open = lid > 0.45 || st === 'stuck';
            // where the blow lands: a little in front of the visitor
            const hx = ix + Math.sin(P.yaw) * 1.1, hz = iz + Math.cos(P.yaw) * 1.1;
            let leg = null, best = 0.85;
            for (let i = 2; i < 8; i++) {
                const L = legs[i];
                if (L.broken) continue;
                const d = Math.min(nearSeg(hx, hz, L.hip, L.knee), nearSeg(hx, hz, L.knee, L.tip));
                if (d < best) { best = d; leg = L; }
            }
            if (Math.abs(off) < 0.8 && open) { mult = 1; post = 6; where = 'eye'; }
            else if (st === 'stuck') { mult = 0.85; post = 4; where = 'open'; }
            else if (leg && Math.abs(off) >= 0.5) {
                mult = 0.6; post = 4; where = 'leg';
                leg.hp -= amount;
                if (leg.hp <= 0 && B.broke < 2 && !leg.broken) {
                    leg.broken = true; B.broke++; broke = true;
                    ctx.spark(leg.knee.x, leg.knee.y, leg.knee.z, 3, '#ffe0c0');
                    snd('legBreak', () => { sfx.thud(); sfx.tick(); });
                    ctx.dust(leg.tip.x, leg.tip.z, 10);
                    B.posture += 40;
                    bark('leg');
                }
            }
            if (info.kind === 'heavy') post *= 1.8;
            if (info.kind === 'riposte') post = 0;
        }
        if (where === 'shell') snd('clang', () => sfx.tick());
        if (where === 'eye') ctx.spark(eyeW.x, eyeW.y, eyeW.z, 2.2, '#ff5030');
        const staggered = ['reel', 'stagger', 'stumble', 'stuck'].includes(st);
        if (staggered && where !== 'shell') mult *= 1.6;
        const before = B.hp;
        B.hp = Math.max(0, B.hp - amount * mult);
        flinch = 1; B.calm = 0;
        if (B.hp <= 0) {
            for (const sb of stabs) if (sb.ping) sb.ping.live = false;
            stabs.length = 0; cut = false;
            if (B.lives > 1) { begin('down'); return { dealt: before, staggered: false, dead: false }; }
            B.state = 'dying';
            return { dealt: before, staggered: false, dead: true };
        }
        B.posture += post;
        let threw = false;
        if (broke && !staggered) { cancelMove(); begin('stumble'); B.side = leg_side(); threw = true; }
        else if (B.posture >= 100 && !staggered && st !== 'charge' && st !== 'leap') { cancelMove(); begin('stagger'); B.posture = 0; threw = true; }
        if (threw) B.posture = Math.min(B.posture, 40);
        return { dealt: before - B.hp, staggered: threw, dead: false };
    }
    function leg_side() { for (const L of legs) if (L.broken) return L.side; return 1; }
    function cancelMove() {
        for (const sb of stabs) if (sb.ping && !sb.ping.landed) sb.ping.live = false;
        stabs.length = 0; cut = false; markOn = null; lane.on = false; landShadow.visible = false;
        for (const d of SHOTS) if (d.held) d.on = false;
        for (let i = 0; i < 8; i++) if (legs[i].hand) release(i);
    }
    // One of its blows was turned aside
    function parried(info = {}) {
        if (info.kind === 'disc' && lastShot && lastShot.on) {
            const d = lastShot;
            d.back = true; d.t = 0;
            ctx.spark(d.p.x, d.p.y, d.p.z, 2, '#fff0d0');
            bark('parried');
            return;
        }
        if (B.state === 'dying' || B.state === 'down') return;
        const legI = B.blow === 'stab' ? B.blowLeg : (B.side > 0 ? 0 : 1);
        cancelMove();
        begin('reel');
        B.reelLeg = legI;
        B.posture += 30; B.calm = 0;
        ctx.shake(0.5);
        bark('parried');
    }

    fresh();
    bodyG.visible = false;

    const form = {
        id: 'player2', name: 'THE PLAYER', sub: SUB,
        hpMax: 100,
        get hp() { return B.hp; },
        get x() { return B.x; }, get z() { return B.z; }, get yaw() { return B.yaw; },
        // Long and low: the visitor is kept further off behind it than at its sides; nothing while it is in the air
        get radius() {
            if (B.air || B.state === 'dying' || B.state === 'intro') return 0;
            const P = ctx.P;
            toLocal(P.x, P.z);
            const a = Math.atan2(B.lx, B.lz), rz = B.lz > 0 ? 2.5 : 3.0, rx = 2.05;
            return 1 / Math.sqrt((Math.sin(a) / rx) ** 2 + (Math.cos(a) / rz) ** 2);
        },
        get aimY() { return Math.max(1.4, body.y); },
        get targetable() { return !B.air && !['down', 'dying', 'intro', 'roar'].includes(B.state); },
        get staggered() { return ['reel', 'stagger', 'stumble', 'stuck'].includes(B.state); },
        get posture() { return B.posture; }, postureMax: 100,
        get hot() { return hot; },
        get state() { return B.state; },
        threat(x, z) {
            for (const sb of stabs) if (sb.phase === 'wind' && sb.wind - sb.t < 0.3 && Math.hypot(x - sb.T.x, z - sb.T.z) < STAB_R + 0.4) return true;
            if (markOn && hot > 0.75) { const d = Math.hypot(x - B.x, z - B.z), off = angDiff(Math.atan2(x - B.x, z - B.z), B.yaw); if (d < 5.6 && Math.abs(off) < 1.9) return true; }
            if (lane.on && lane.k > 0.7) {
                const dx = x - lane.x, dz = z - lane.z, f = dx * Math.sin(lane.yaw) + dz * Math.cos(lane.yaw), s = dx * Math.cos(lane.yaw) - dz * Math.sin(lane.yaw);
                if (f > -2 && f < lane.l && Math.abs(s) < lane.w / 2 + 0.4) return true;
            }
            return false;
        },
        intro,
        start() {
            fighting = true;
            B.fellSaid = false;
            if (B.state === 'intro') B.state = 'idle';
            if (tries++ > 0) bark('again', true);
            ctx.score.intensity(B.life === 2 ? 0.7 : 0.3);
        },
        update,
        pose: posed,
        damage,
        parried,
        outro,
        restart() {
            fresh();
            fighting = false;
            bodyG.visible = true;
            shell.visible = plates.visible = under.visible = true;
            B.x = 0; B.z = -6.4; B.yaw = 0;
            px = B.x; pz = B.z; pyaw = 0;
            plantAll();
        },
        dispose() {
            fighting = false;
            for (const name in marks) ctx.mark.hide(marks[name]);
            for (const o of made) if (o !== loose || !settled) arena.remove(o);
            if (eyeG.parent) eyeG.parent.remove(eyeG);
            livesEl.remove(); bigEl.remove();
            for (const [o, vis] of hidden) o.visible = vis;
            if (settled) {
                // The spilled discs stay as dressing until the next fight starts over from the first form
                loosePl.count = 0;
                loose.onBeforeRender = () => {
                    if (ctx.mode === 'off' || (ctx.form && ctx.form.id === 'watcher')) {
                        loose.visible = false;
                        queueMicrotask(() => { arena.remove(loose); loose.dispose(); });
                    }
                };
            } else {
                for (const g of geos) g.dispose();
                for (const m of mats) m.dispose();
            }
        },
        debug: {
            moves: ['stab', 'sweep', 'charge', 'leap', 'discs', 'volley', 'stamp', 'slam'],
            force(name) {
                cancelMove();
                begin(name);
                B.cool = 99;
                if (name === 'sweep') { const P = ctx.P; B.side = angDiff(Math.atan2(P.x - B.x, P.z - B.z), B.yaw) > 0 ? 1 : -1; }
            },
            get B() { return B; }, legs, body, aim, stabs, bits,
            set life(n) { B.life = n; lives(n === 2 ? 1 : 2); },
            get lid() { return lid; }, set lid(v) { lid = lidTo = v; },
            get eye() { return eyeW; }
        }
    };
    return form;
}
