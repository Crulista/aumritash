// The visitor in the fight: their input, their sword and every move they make with it, the camera, and their own bars.
//
// Every sword move is authored as poses over time (where the sword hand is, which way the blade points and which way
// its edge faces, how the body turns, bends and crouches, where the other hand goes), with the arms bent to reach by
// two-bone IK. The legs are solved too: each foot stays planted on the stone until it steps, so a lunge is a real
// stride and turning on the spot is a shuffle, not a slide. A blow lands only where the blade actually is.
//
// The core makes one of these per page and drives it every frame:
//   update(dt)   input and the state machine (before the animation mixers)
//   place()      puts the body where the state says, and draws the bars
//   camera(dt)   the camera (in play; cut-scenes drive the camera themselves)
//   pose(dt)     after the mixers: legs, body, arms, the sword, its trail, and the blade test
//   receive(dmg, fromX, fromZ, opts) → 'hit' | 'blocked' | 'parried' | 'dodged' | null
//                a blow reaching the visitor; the core's ctx.hitPlayer checks the fight is on, then calls this
//   begin(), reset(full, heals), show(on), touched(), bot(on, skill, parry)
//   state        the live state, the object forms see as ctx.P
// Strikes land through ctx.form.damage(amount, { kind, x, z, posture }); `posture` is a hint of how hard the blow
// was, for forms that build posture from it.
//
// Controls
//   keyboard + mouse   W A S D / arrows move · J, Enter or left click strike (hold it for a heavy blow) · F or I heavy
//                      (hold to charge) · Space or K roll (tap; no direction = backstep; hold while moving to sprint)
//                      · Shift, L or right click guard (raise it late to parry) · E heal · R or U ember art
//                      · Q or middle click lock on / free camera (the mouse turns the free camera once clicked in)
//   touch              left thumb: a stick wherever it lands · right side: HIT, HEAVY, ROLL (hold to sprint), GUARD,
//                      ✚ heal, ART (shown when full), LOCK · dragging on the right side turns the free camera
//   gamepad            left stick move, right stick free camera · A roll / sprint · X or RB strike · Y or RT heavy
//                      · LB guard · B heal · LT art · R3 lock

// ── Poses ──
// Numbers are in the body's own frame before it turns: x to its left (the sword hand is on -x), y up, z ahead, the
// figure about 1.5 tall. hand: where the sword hand is. dir: which way the blade points from it. edge: which way the
// cutting edge faces (squared up to the blade). twist: how far the chest turns (+ to its left). bend: forward lean.
// crouch: 0 standing to 1 low. left: where the other hand goes ([x, y, z], 'hilt' = both hands on the grip,
// 'blade' = bracing the flat of the blade, null = leave it to the animation). el: which way the sword elbow points.
const p = (hand, dir, edge, twist, bend, crouch, left = null, el = null) => ({ hand, dir, edge, twist, bend, crouch, left, el });
const POSE = {
    ready:  p([-0.2, 1.02, 0.3], [0.12, 0.62, 0.78], [0, -0.78, 0.62], -0.2, 0.08, 0.35, [0.26, 0.98, 0.14]),
    guard:  p([-0.06, 1.3, 0.36], [0.88, 0.42, 0.2], [0, 0, 1], 0.05, 0.08, 0.45, 'blade', [-0.8, -0.6, 0]),
    parry:  p([-0.4, 1.36, 0.34], [-0.7, 0.6, 0.38], [0.3, 0, 0.95], -0.45, -0.05, 0.4, [0.3, 1.2, 0.3]),
    // Light one: cocked over the right shoulder, cut down across to the left hip
    w1: p([-0.3, 1.56, 0.0], [-0.25, 0.55, -0.8], [0.35, 0.75, 0.55], -0.6, -0.08, 0.3, [0.3, 1.2, 0.3], [-0.8, -0.3, -0.4]),
    s1: p([-0.1, 1.18, 0.5], [0.35, 0.05, 0.94], [0.55, -0.8, -0.15], 0.1, 0.22, 0.42, [0.32, 1.05, 0.0]),
    f1: p([0.2, 0.86, 0.3], [0.72, -0.6, 0.35], [0.2, -0.35, -0.92], 0.6, 0.32, 0.48, [0.3, 1.0, -0.2]),
    // Light two: back across, a flat backhand from the left
    w2: p([0.1, 1.12, 0.22], [0.9, 0.2, -0.38], [0.25, 0.3, 0.92], 0.65, 0.15, 0.42, [0.32, 1.0, -0.05], [-0.3, -1, 0.4]),
    s2: p([-0.16, 1.22, 0.52], [-0.12, 0.1, 1], [-0.98, 0.15, -0.1], 0, 0.15, 0.4, [0.35, 1.05, 0.1]),
    f2: p([-0.45, 1.32, 0.18], [-0.85, 0.32, -0.3], [-0.35, 0.1, -0.93], -0.6, 0.05, 0.36, [0.3, 1.1, 0.3]),
    // Light three: drawn back to the hip and driven straight through in a lunge
    w3: p([-0.26, 1.15, -0.12], [0.05, 0.06, 1], [0, 1, 0], -0.55, -0.05, 0.45, [0.3, 1.22, 0.38]),
    s3: p([-0.06, 1.2, 0.62], [0.03, 0.3, 1], [0, 1, 0], 0.35, 0.3, 0.62, [0.36, 1.05, -0.3]),
    // Heavy: both hands, raised behind the head, brought straight down
    hw: p([-0.1, 1.78, -0.06], [-0.08, 0.3, -0.95], [0, 0.95, 0.3], -0.25, -0.25, 0.28, 'hilt', [-0.9, 0.1, 0]),
    hs: p([-0.04, 1.15, 0.55], [0, -0.18, 1], [0, -1, -0.18], 0.05, 0.35, 0.55, 'hilt'),
    hf: p([-0.04, 0.7, 0.45], [0, -0.45, 0.9], [0, -0.9, -0.45], 0.05, 0.55, 0.72, 'hilt'),
    // Out of a sprint: a leap, cocked high, landing in a cut
    dw: p([-0.3, 1.62, -0.05], [-0.3, 0.6, -0.74], [0.3, 0.75, 0.5], -0.55, -0.15, 0.15, [0.35, 1.3, 0.3], [-0.8, -0.3, -0.4]),
    ds: p([0.02, 0.98, 0.55], [0.42, -0.42, 0.8], [0.45, -0.75, -0.45], 0.4, 0.45, 0.72, [0.35, 1.0, -0.1]),
    df: p([0.22, 0.62, 0.3], [0.62, -0.78, 0.1], [0.1, -0.05, -1], 0.55, 0.5, 0.78, [0.3, 0.95, -0.25]),
    // Out of a roll: low on the left, rising across to the right shoulder
    rw: p([0.12, 0.78, 0.3], [0.6, -0.5, -0.62], [-0.3, -0.75, 0.3], 0.6, 0.4, 0.8, [0.35, 0.9, 0.2], [-0.3, -1, 0.3]),
    rs: p([-0.16, 1.25, 0.5], [-0.2, 0.6, 0.77], [-0.6, 0.55, -0.58], -0.1, 0.1, 0.4, [0.35, 1.05, 0]),
    rf: p([-0.4, 1.68, 0.1], [-0.5, 0.86, -0.1], [-0.3, 0, -0.95], -0.5, -0.15, 0.15, [0.3, 1.1, 0.25]),
    // The riposte: drawn back, driven in with both hands, twisted, torn out
    qw: p([-0.28, 1.2, -0.2], [0, 0.08, 1], [0, 1, 0], -0.6, 0, 0.42, [0.35, 1.25, 0.42]),
    qs: p([-0.05, 1.24, 0.6], [0, 0.26, 1], [0, 1, 0], 0.3, 0.25, 0.55, 'hilt'),
    qh: p([-0.05, 1.2, 0.58], [0.15, 0.3, 1], [0.6, 0.8, 0], 0.4, 0.3, 0.58, 'hilt'),
    qr: p([-0.42, 1.35, 0.1], [-0.7, 0.4, 0.6], [-0.2, -0.9, 0.3], -0.5, 0, 0.4, [0.3, 1.1, 0.3]),
    // The ember art: blade drawn far back and low, then one wide burning sweep
    aw: p([-0.45, 1.05, -0.15], [-0.62, 0.05, -0.78], [0.78, 0, -0.62], -1.0, 0.1, 0.55, [0.32, 1.2, 0.42]),
    as: p([-0.1, 1.1, 0.56], [0.2, 0, 1], [1, 0, -0.2], 0, 0.15, 0.55, [0.32, 1.05, 0]),
    af: p([0.32, 1.15, 0.3], [0.95, 0.05, -0.25], [-0.25, 0, -0.97], 0.9, 0.12, 0.5, [0.3, 1.1, 0.3]),
    // A hop backwards, blade kept up
    bk: p([-0.2, 1.12, 0.25], [0.1, 0.7, 0.7], [0, -0.7, 0.7], -0.25, -0.12, 0.25, [0.3, 1.05, 0.15]),
    // Healing: down on one knee-ish, the ember cupped at the chest, then raised
    h1: p([-0.3, 0.88, 0.15], [0.1, -0.55, 0.83], [0, -0.83, -0.55], 0.15, 0.3, 0.6, [0.05, 1.18, 0.22]),
    h2: p([-0.3, 0.9, 0.15], [0.1, -0.55, 0.83], [0, -0.83, -0.55], 0.1, 0.08, 0.45, [0.04, 1.35, 0.28])
};

// Feet: where each one stands, in the body's frame, when it is settled
const HOME = { l: [0.16, 0.12], r: [-0.15, -0.2] };

// ── Moves ──
// keys: [time, pose, ease] ('snap' is wherever the body was when the move began; 'in' snaps into a pose, 'out'
// settles into it). go: forward travel over time. lift: the body leaving the ground. steps: [from, to, foot, x, z,
// height] — the foot lands at (x, z) in the body's frame as it will stand at `to`. hit: when the blade can land.
// chain: from when a buffered strike carries on into `next`. cancel: from when a roll or guard can cut it short.
// track: until when it may still turn to its target. stop: hit-stop on contact. post: posture hint for the form.
const MOVE = {
    l1: { kind: 'light', dmg: 4, post: 6, cost: 14, hit: [0.15, 0.26], chain: 0.3, cancel: 0.27, track: 0.12, total: 0.62, next: 'l2', stop: 0.05, swing: 0.1,
        keys: [[0, 'snap'], [0.13, POSE.w1, 'out'], [0.19, POSE.s1, 'in'], [0.27, POSE.f1], [0.62, POSE.ready]],
        go: [[0, 0], [0.08, 0.02], [0.22, 0.32], [0.36, 0.36]], steps: [[0.06, 0.2, 'l', 0.17, 0.22, 0.06]] },
    l2: { kind: 'light', dmg: 4, post: 6, cost: 14, hit: [0.15, 0.26], chain: 0.3, cancel: 0.27, track: 0.1, total: 0.66, next: 'l3', stop: 0.05, swing: 0.1,
        keys: [[0, 'snap'], [0.12, POSE.w2, 'out'], [0.19, POSE.s2, 'in'], [0.27, POSE.f2], [0.66, POSE.ready]],
        go: [[0, 0], [0.1, 0.05], [0.22, 0.28], [0.34, 0.3]], steps: [[0.08, 0.22, 'r', -0.16, -0.1, 0.06]] },
    l3: { kind: 'light', dmg: 5.5, post: 10, cost: 18, hit: [0.27, 0.38], chain: 0.52, cancel: 0.42, track: 0.2, total: 0.92, next: 'l1', stop: 0.07, swing: 0.24,
        keys: [[0, 'snap'], [0.22, POSE.w3, 'out'], [0.3, POSE.s3, 'in'], [0.46, POSE.s3], [0.92, POSE.ready]],
        go: [[0, 0], [0.2, 0.02], [0.32, 0.62], [0.5, 0.66]], steps: [[0.18, 0.32, 'r', -0.13, 0.32, 0.07], [0.5, 0.68, 'l', 0.16, 0.02, 0.06]] },
    heavy: { kind: 'heavy', dmg: 7, post: 14, cost: 24, hit: [0.47, 0.6], chain: 0.9, cancel: 0.7, track: 0.44, total: 1.25, next: 'l1', stop: 0.09, swing: 0.43, charge: 0.42,
        keys: [[0, 'snap'], [0.42, POSE.hw, 'out'], [0.52, POSE.hs, 'in'], [0.6, POSE.hf], [0.86, POSE.hf], [1.25, POSE.ready]],
        go: [[0, 0], [0.3, 0], [0.48, 0.45], [0.6, 0.5]], steps: [[0.4, 0.52, 'l', 0.17, 0.26, 0.07], [0.9, 1.1, 'r', -0.15, -0.18, 0.05]] },
    dash: { kind: 'heavy', dmg: 5.5, post: 10, cost: 16, hit: [0.25, 0.38], chain: 0.6, cancel: 0.5, track: 0.15, total: 0.95, next: 'l2', stop: 0.07, swing: 0.2,
        keys: [[0, 'snap'], [0.16, POSE.dw, 'out'], [0.3, POSE.ds, 'in'], [0.4, POSE.df], [0.95, POSE.ready]],
        go: [[0, 0], [0.3, 1.5], [0.48, 1.75]], lift: [[0, 0], [0.14, 0.22], [0.3, 0]],
        steps: [[0.02, 0.3, 'l', 0.18, 0.28, 0.25], [0.02, 0.3, 'r', -0.15, -0.25, 0.2], [0.55, 0.75, 'r', -0.15, -0.15, 0.05]] },
    rollcut: { kind: 'light', dmg: 4, post: 7, cost: 12, hit: [0.15, 0.28], chain: 0.34, cancel: 0.32, track: 0.1, total: 0.82, next: 'l2', stop: 0.05, swing: 0.1,
        keys: [[0, 'snap'], [0.12, POSE.rw, 'out'], [0.2, POSE.rs, 'in'], [0.3, POSE.rf], [0.82, POSE.ready]],
        go: [[0, 0], [0.2, 0.45], [0.3, 0.5]], steps: [[0.08, 0.22, 'l', 0.17, 0.2, 0.06]] },
    riposte: { kind: 'riposte', dmg: 15, post: 0, cost: 0, impact: 0.35, cancel: 1.3, track: 0.3, total: 1.6, swing: 0.3,
        keys: [[0, 'snap'], [0.28, POSE.qw, 'out'], [0.36, POSE.qs, 'in'], [0.95, POSE.qh], [1.1, POSE.qr, 'in'], [1.6, POSE.ready]],
        go: [[0, 0], [0.25, 0.1], [0.36, 1]], steps: [[0.2, 0.36, 'r', -0.13, 0.25, 0.06], [1.15, 1.35, 'r', -0.15, -0.15, 0.05]] },
    art: { kind: 'art', dmg: 12, post: 16, cost: 0, release: 0.53, cancel: 0.8, track: 0.45, total: 1.3, inv: [0, 0.6], swing: 0.47,
        keys: [[0, 'snap'], [0.45, POSE.aw, 'out'], [0.54, POSE.as, 'in'], [0.64, POSE.af], [1.3, POSE.ready]],
        go: [[0, 0], [0.4, 0], [0.55, 0.25]], steps: [[0.38, 0.52, 'l', 0.22, 0.22, 0.05]] },
    backstep: { kind: '', cost: 12, cancel: 0.34, total: 0.5, inv: [0.03, 0.24],
        keys: [[0, 'snap'], [0.12, POSE.bk, 'out'], [0.32, POSE.bk], [0.5, POSE.ready]],
        go: [[0, 0], [0.06, -0.1], [0.26, -1.45], [0.36, -1.55]], lift: [[0, 0], [0.1, 0.1], [0.24, 0]],
        steps: [[0.04, 0.26, 'l', 0.16, 0.12, 0.12], [0.06, 0.27, 'r', -0.15, -0.2, 0.1]] },
    heal: { kind: '', cost: 0, heal: 0.6, cancel: 0.95, total: 1.2,
        keys: [[0, 'snap'], [0.32, POSE.h1, 'out'], [0.6, POSE.h1], [0.82, POSE.h2, 'out'], [1.2, POSE.ready]] }
};
const STATE_OF = { l1: 'attack', l2: 'attack', l3: 'attack', heavy: 'attack', dash: 'attack', rollcut: 'attack', riposte: 'riposte', art: 'art', backstep: 'backstep', heal: 'heal' };

const ANKLE = 0.103;                // how high the ankle bone sits when a foot is flat on the stone
const WAIST = 0.95;                 // the height the body turns and bends about
const DROP = 0.25;                  // how far a full crouch lowers the hips
const BLADE0 = 0.12, BLADE1 = 0.97; // where the blade starts and ends along the sword (from the hand)
const ART_FULL = 100;

export function createPlayer(ctx, env) {
    const { THREE, kit, sfx, hero } = ctx;
    const { mix, clamp01, toward, angDiff, nearSeg, reachFor, turnWorld } = kit;
    const $ = env.$, touch = env.touch;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const now = () => performance.now() / 1000;
    let RUN = 4.2, SPRINT = 6.4;                    // corrected from the clips when the fight first starts
    const JOG_RATE = 1.5, SPRINT_RATE = 1.15;      // the clips play a little fast, so feet keep up with the ground
    const GUARD_WALK = 1.5;

    // Poses as vectors, once
    const prep = s => ({ hand: V().fromArray(s.hand), dir: V().fromArray(s.dir).normalize(), edge: V().fromArray(s.edge).normalize(), twist: s.twist, bend: s.bend, crouch: s.crouch, left: Array.isArray(s.left) ? V().fromArray(s.left) : s.left, el: s.el ? V().fromArray(s.el).normalize() : null });
    const PZ = {};
    for (const k in POSE) PZ[k] = prep(POSE[k]);
    const keyPose = new Map();
    for (const name in MOVE) for (const k of MOVE[name].keys) if (k[1] !== 'snap') { if (!keyPose.has(k[1])) keyPose.set(k[1], prep(k[1])); }
    const EL = V(-0.7, -1, -0.3).normalize();
    const mkPose = () => ({ hand: V(), dir: V(), edge: V(), twist: 0, bend: 0, crouch: 0, el: V(), la: null, lb: null, lk: 0 });
    const cur = mkPose();                           // the upper body's pose this frame
    const snap = mkPose();                          // where a move began
    snap.left = null;

    const P = { x: 0, z: 3.6, y: 0, yaw: Math.PI, hp: 100, st: 100, stWait: 0, state: 'idle', t: 0, inv: false, heals: 3, maxHeals: 3, dx: 0, dz: 0, knock: 1, struck: false, healed: false, guardAt: -9, flick: 0, vx: 0, vz: 0,
        move: '', go: 0, goScale: 1, chargeT: 0, released: true, charged: false, fromStrike: false, art: 0, combo: 0, lock: true, done: {} };
    const want = { light: -9, heavy: -9, roll: -9, heal: -9, art: -9 };
    const held = { strike: false, heavy: false, roll: false, guard: false };
    let strikeAt = -9, rollAt = -9, rollSprinted = false;
    let guarding = false;
    const bots = { on: false, skill: 0.9, parry: false, hold: 0, next: 0 };
    // Who to face when no form is on the roof (between forms)
    const still = { x: 0, z: -4.2, aimY: 2.2, radius: 0, hot: 0, staggered: false, state: '', targetable: false };
    let hs = 0, animRate = 1;                       // hit-stop left, and how fast the body's clip plays
    let emptyFlash = 0, hurtShown = 100;

    // ═════════════ Input ═════════════
    const keys = new Set(), stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, drag = { id: null, x: 0, y: 0 };
    const orbit = { yaw: Math.PI, pitch: 0.28, idle: 9 };      // the free camera
    const isUI = t => t.closest && t.closest('button, a, .gate');
    const on = () => ctx.mode !== 'off';
    const press = what => { if (on() && !ctx.cine.active) want[what] = ctx.time(); };
    const fresh = (what, win = 0.4) => ctx.time() - want[what] < win;
    function guard(up) {
        if (up && !guarding) P.guardAt = ctx.time();
        guarding = up;
        $('btnGuard').classList.toggle('held', up);
    }
    function strike(down) {
        if (down && !held.strike) { strikeAt = now(); press('light'); }
        held.strike = down;
        $('btnAtk').classList.toggle('held', down);
    }
    function heavyKey(down) {
        if (down && !held.heavy) press('heavy');
        held.heavy = down;
        $('btnHeavy').classList.toggle('held', down);
    }
    // Roll on a tap (released quickly); held while moving, it becomes a sprint
    function rollKey(down) {
        if (down && !held.roll) { rollAt = now(); rollSprinted = false; }
        if (!down && held.roll && !rollSprinted && now() - rollAt < 0.32) press('roll');
        held.roll = down;
        $('btnRoll').classList.toggle('held', down);
    }
    function toggleLock() {
        if (!on()) return;
        P.lock = !P.lock;
        if (!P.lock) { orbit.yaw = camYaw; orbit.pitch = 0.3; orbit.idle = 0; }
        else if (document.pointerLockElement) document.exitPointerLock();
        $('btnLock').classList.toggle('off', !P.lock);
    }
    const GUARD_KEYS = ['shift', 'l'], STRIKE_KEYS = ['j', 'enter'], HEAVY_KEYS = ['f', 'i'], ROLL_KEYS = [' ', 'k'];
    addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        keys.add(k);
        if (!on()) return;
        if (ROLL_KEYS.includes(k)) e.preventDefault();
        if (e.repeat) return;
        if (ROLL_KEYS.includes(k)) rollKey(true);
        else if (STRIKE_KEYS.includes(k)) strike(true);
        else if (HEAVY_KEYS.includes(k)) heavyKey(true);
        else if (k === 'e') press('heal');
        else if (k === 'r' || k === 'u') press('art');
        else if (k === 'q') toggleLock();
        else if (GUARD_KEYS.includes(k)) guard(true);
    });
    addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        keys.delete(k);
        if (ROLL_KEYS.includes(k)) rollKey(false);
        else if (STRIKE_KEYS.includes(k)) strike(false);
        else if (HEAVY_KEYS.includes(k)) heavyKey(false);
        else if (GUARD_KEYS.includes(k)) guard(false);
    });
    function letGo() {
        keys.clear(); stick.id = drag.id = null; stick.x = stick.y = 0;
        guard(false); strike(false); heavyKey(false); held.roll = false;
        $('stick').style.display = 'none';
    }
    addEventListener('blur', letGo);
    addEventListener('pointerdown', e => {
        if (!on() || isUI(e.target)) return;
        if (e.pointerType === 'mouse') {
            if (e.button === 2) guard(true);
            else if (e.button === 1) { e.preventDefault(); toggleLock(); }
            else {
                strike(true);
                // In the free camera, the mouse turns it once the pointer is captured
                if (!P.lock && !document.pointerLockElement && document.body.requestPointerLock) { try { document.body.requestPointerLock(); } catch (er) { /* not allowed here */ } }
            }
            return;
        }
        // Touch: the left part of the screen is the stick, the rest turns the free camera
        if (e.clientX < innerWidth * 0.45) {
            if (stick.id !== null) return;
            stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
            $('stick').style.display = 'block';
            $('stick').style.left = e.clientX + 'px';
            $('stick').style.top = e.clientY + 'px';
            $('knob').style.transform = '';
        } else if (drag.id === null) { drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; }
    });
    addEventListener('pointermove', e => {
        if (document.pointerLockElement && e.pointerType === 'mouse') { turnCam(e.movementX * 0.0045, e.movementY * 0.0035); return; }
        if (e.pointerId === drag.id) { turnCam((e.clientX - drag.x) * 0.009, (e.clientY - drag.y) * 0.006); drag.x = e.clientX; drag.y = e.clientY; return; }
        if (e.pointerId !== stick.id) return;
        const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, len = Math.hypot(dx, dy), k = Math.min(1, len / 50) / (len || 1);
        stick.x = dx * k; stick.y = dy * k;
        $('knob').style.transform = `translate(${stick.x * 34}px, ${stick.y * 34}px)`;
    });
    const dropPointer = e => {
        if (e.pointerType === 'mouse') { if (e.button === 2) guard(false); else if (e.button === 0) strike(false); }
        if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; $('stick').style.display = 'none'; }
        if (e.pointerId === drag.id) drag.id = null;
    };
    addEventListener('pointerup', dropPointer);
    addEventListener('pointercancel', dropPointer);
    function turnCam(dx, dy) {
        if (P.lock || !on()) return;
        orbit.yaw -= dx;
        orbit.pitch = Math.min(1.1, Math.max(-0.15, orbit.pitch + dy));
        orbit.idle = 0;
    }
    // Touch buttons: pressed on touch-down; the ones that are held let go on release
    const btn = (id, down, up) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (up) el.setPointerCapture(e.pointerId); down(); });
        if (up) for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => up());
    };
    btn('btnAtk', () => strike(true), () => strike(false));
    btn('btnHeavy', () => heavyKey(true), () => heavyKey(false));
    btn('btnRoll', () => rollKey(true), () => rollKey(false));
    btn('btnGuard', () => guard(true), () => guard(false));
    btn('btnHeal', () => press('heal'));
    btn('btnArt', () => press('art'));
    btn('btnLock', toggleLock);

    // A gamepad, if one is plugged in: read once a frame
    const pad = { x: 0, y: 0, b: [] };
    function pollPad(dt) {
        pad.x = pad.y = 0;
        const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
        if (!gp) return;
        const ax = v => (Math.abs(v) > 0.18 ? v : 0);
        pad.x = ax(gp.axes[0] || 0); pad.y = ax(gp.axes[1] || 0);
        if (!P.lock) turnCam(ax(gp.axes[2] || 0) * 2.6 * dt, ax(gp.axes[3] || 0) * 1.6 * dt);
        const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), was = i => !!pad.b[i];
        const edge = (i, f) => { const n = b(i); if (n !== was(i)) f(n); pad.b[i] = n; };
        edge(0, rollKey); edge(2, strike); edge(5, strike); edge(3, heavyKey); edge(7, heavyKey); edge(4, guard);
        edge(1, n => n && press('heal')); edge(6, n => n && press('art')); edge(11, n => n && toggleLock());
    }

    // ═════════════ The body's clips ═════════════
    function heroAnim(name, once = false, speed = 1, restart = false, from = 0, fade = 0.1) {
        const a = hero.play(name, { fade, once });
        if (a && restart) { a.reset().play(); a.time = from; }
        animRate = speed;
    }
    function flashHurt() { const h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
    // Optional sounds from the score (the score engineer's names); quiet if it does not have them
    const snd = (name, ...args) => { const s = ctx.score; if (s && typeof s[name] === 'function') { try { s[name](...args); return true; } catch (e) { /* never break a swing on a sound */ } } return false; };

    // ═════════════ The sword, the bones, and the things that glow ═════════════
    const B = {};
    let sword = null, bladeMat = null, rigged = false;
    const restQ = { l: new THREE.Quaternion(), r: new THREE.Quaternion() };
    const feet = { l: null, r: null };
    function armHero() {
        hero.root.traverse(o => { if (o.isBone) B[o.name] = o; });
        // How each foot sits when it stands flat (from the idle clip, facing +z)
        const keepP = hero.root.position.clone(), keepY = hero.root.rotation.y;
        hero.root.position.set(0, 0, 0); hero.root.rotation.set(0, 0, 0);
        hero.stopAll();
        const a = hero.actions.Idle_Loop; a.reset().play(); a.time = 0;
        hero.mixer.update(0); hero.root.updateMatrixWorld(true);
        B.foot_l.getWorldQuaternion(restQ.l); B.foot_r.getWorldQuaternion(restQ.r);
        hero.stopAll();
        hero.root.position.copy(keepP); hero.root.rotation.y = keepY;
        for (const s of ['l', 'r']) feet[s] = { s, x: 0, z: 0, yaw: 0, fx: 0, fz: 0, fyaw: 0, tx: 0, tz: 0, tyaw: 0, t: 0, dur: 0, h: 0, lift: 0, stepping: false, thigh: B['thigh_' + s], calf: B['calf_' + s], foot: B['foot_' + s] };
        if (sword) return;
        // In this rig a hand's fingers run along its y axis and its grip along z: the blade runs along z, its edges
        // face ±y, and the hand is turned to hold it
        sword = new THREE.Group();
        bladeMat = new THREE.MeshLambertMaterial({ color: '#d8d4dc', emissive: '#3a3640' });
        const brass = new THREE.MeshLambertMaterial({ color: '#8a7040', emissive: '#1a1408' });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.056, BLADE1 - BLADE0 - 0.08), bladeMat);
        blade.position.z = (BLADE0 + BLADE1 - 0.08) / 2;
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), bladeMat);
        point.rotation.x = Math.PI / 2; point.scale.set(0.35, 1, 1); point.position.z = BLADE1 - 0.04;
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.21, 0.034), brass);
        cross.position.z = BLADE0 - 0.02;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), new THREE.MeshLambertMaterial({ color: '#2a1c14' }));
        grip.position.z = -0.02;
        const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.048, 0.048), brass);
        pommel.position.z = -0.15;
        sword.add(blade, point, cross, grip, pommel);
        sword.position.set(-0.02, 0.085, 0);
        B.hand_r.add(sword);
        buildFx();
    }

    // The swing's trail: a ribbon following the outer blade, fading in a few frames
    const TRAIL = 26, TRAIL_LIFE = 0.13;
    const trail = { mesh: null, pos: null, col: null, base: [], tip: [], age: new Float32Array(TRAIL), n: 0, head: 0, on: false, color: new THREE.Color('#fff0d8'), prevB: V(), prevT: V(), has: false };
    let glint = null, ember = null, crescent = null, cres = { on: false, t: 0, x: 0, z: 0, yaw: 0, hit: false, r: 0 };
    function buildFx() {
        const g = new THREE.BufferGeometry();
        trail.pos = new Float32Array(TRAIL * 2 * 3); trail.col = new Float32Array(TRAIL * 2 * 3);
        g.setAttribute('position', new THREE.BufferAttribute(trail.pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(trail.col, 3));
        const idx = [];
        for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        g.setIndex(idx);
        trail.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
        trail.mesh.frustumCulled = false;
        trail.mesh.visible = false;
        ctx.arena.add(trail.mesh);
        for (let i = 0; i < TRAIL; i++) { trail.base.push(V()); trail.tip.push(V()); trail.age[i] = 9; }
        glint = kit.glowSprite('#fff2c8', 0); glint.scale.set(0.6, 0.6, 1); glint.visible = false; ctx.arena.add(glint);
        ember = kit.glowSprite('#ffb050', 0); ember.scale.set(0.5, 0.5, 1); ember.visible = false; ctx.arena.add(ember);
        // The ember art's crescent: a curved wall of fire that rolls outwards
        const c = document.createElement('canvas');
        c.width = 4; c.height = 64;
        const cg = c.getContext('2d'), grd = cg.createLinearGradient(0, 0, 0, 64);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.55, 'rgba(255,255,255,1)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        cg.fillStyle = grd; cg.fillRect(0, 0, 4, 64);
        const arc = 2.3;
        crescent = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true, -arc / 2, arc),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: '#ff8a2a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
        crescent.visible = false;
        cres.arc = arc;
        ctx.arena.add(crescent);
    }

    // ═════════════ A stand-in player for testing ═════════════
    // Circles, strikes in the openings (combos, sometimes a held heavy), ripostes, rolls or parries what it can, heals
    // when low, sprints in when far, and lets the ember art go when it is full.
    function botThink(F, dt) {
        const dist = Math.hypot(P.x - F.x, P.z - F.z), hot = F.hot || 0, reach = (F.radius || 1) + 1.5;
        const blade = F.threat ? F.threat(P.x, P.z) : false;
        const danger = blade || ctx.haz.near(P.x, P.z);
        const T = ctx.time();
        let side = 0.35, fwd = dist > reach - 0.3 ? 1 : 0;
        held.roll = false;
        if (bots.hold > 0) { bots.hold -= dt; held.heavy = bots.hold > 0; }
        if (blade && bots.parry && hot > 0.97) { guard(true); setTimeout(() => guard(false), 250); }
        else if (danger && bots.skill > Math.random() * 0.999) { press('roll'); side = Math.random() < 0.5 ? 1 : -1; fwd = 0; }
        else if (P.hp < 45 && P.heals > 0 && hot < 0.2 && !F.staggered) { if (dist < reach + 2) { fwd = -1; side = 0; } else press('heal'); }
        else if (P.art >= ART_FULL && dist < 5 && hot < 0.3) press('art');
        else if (F.staggered && dist < reach + 1.4) press('light');
        else if (dist < reach && (hot < 0.3 || F.staggered) && P.st > 25 && T > bots.next) {
            if (Math.random() < 0.12 && hot < 0.1) { press('heavy'); bots.hold = Math.random() * 0.9; held.heavy = true; bots.next = T + 1; }
            else press('light');
        }
        // Sprint in from far away
        if (dist > 8 && !danger && P.st > 40) { held.roll = true; rollAt = now() - 1; }
        return [side, fwd];
    }

    // ═════════════ The state machine ═════════════
    const _cam = V();
    let camYaw = Math.PI;
    const FREE = new Set(['idle', 'run', 'sprint', 'guard']);
    function update(dt) {
        const T = ctx.time(), frozen = ctx.cine.active;
        const F = ctx.form || still;
        if (ctx.form) { still.x = F.x; still.z = F.z; }
        pollPad(dt);
        const x0 = P.x, z0 = P.z;
        // Which way is forward: away from the camera (or, for the bot, towards the boss)
        let ix = 0, iy = 0, fx, fz;
        let fxd = F.x - P.x, fzd = F.z - P.z;
        const dist = Math.hypot(fxd, fzd) || 1;
        fxd /= dist; fzd /= dist;
        if (!frozen) {
            if (keys.has('w') || keys.has('arrowup')) iy += 1;
            if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
            if (keys.has('d') || keys.has('arrowright')) ix += 1;
            if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
            ix += stick.x + pad.x; iy -= stick.y + pad.y;
        }
        if (bots.on && !frozen) { [ix, iy] = botThink(F, dt); fx = fxd; fz = fzd; }
        else { ctx.camera.getWorldDirection(_cam); const l = Math.hypot(_cam.x, _cam.z) || 1; fx = _cam.x / l; fz = _cam.z / l; }
        const il = Math.min(1, Math.hypot(ix, iy));
        if (Math.hypot(ix, iy) > 1) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; }
        const mx = fx * iy - fz * ix, mz = fz * iy + fx * ix;
        const moving = il > 0.15;
        const can = ctx.mode === 'play' && !frozen;
        const target = lockedOn() ? F : null;
        // The way a blow should go: at the boss when locked on; otherwise the stick, or straight ahead
        const aimYaw = target ? Math.atan2(fxd, fzd) : moving ? Math.atan2(mx, mz) : softAim(F, P.yaw);

        // Hit-stop: the visitor's own clock holds still for a few frames when a blow lands
        const mdt = hs > 0 ? 0 : dt;
        hs = Math.max(0, hs - dt);
        P.t += mdt;
        P.inv = false;
        P.stWait -= dt;
        P.flick = toward(P.flick, 0, 5, dt);
        emptyFlash = Math.max(0, emptyFlash - dt);
        if (held.roll && moving && !rollSprinted && now() - rollAt > 0.22) rollSprinted = true;
        const tired = cost => { if (P.st > 1 && P.st >= Math.min(cost, 10)) return false; emptyFlash = 0.6; return true; };

        if (FREE.has(P.state)) {
            const sprinting = rollSprinted && held.roll && moving && P.st > 0;
            if (can && fresh('roll') && !tired(MOVE.backstep.cost)) {
                want.roll = -9;
                if (moving) startRoll(mx / il, mz / il);
                else startMove('backstep', P.yaw);
            } else if (can && (fresh('light') || fresh('heavy')) && F.staggered && canRiposte(F, dist)) {
                want.light = want.heavy = -9;
                startMove('riposte', Math.atan2(fxd, fzd));
            } else if (can && fresh('art') && P.art >= ART_FULL) {
                want.art = -9;
                startMove('art', aimYaw);
            } else if (can && fresh('heavy') && !tired(MOVE.heavy.cost)) {
                want.heavy = want.light = -9;
                startMove(P.state === 'sprint' ? 'dash' : 'heavy', aimYaw);
            } else if (can && fresh('light') && !tired(MOVE.l1.cost)) {
                want.light = -9;
                startMove(P.state === 'sprint' ? 'dash' : 'l1', aimYaw, true);
            } else if (can && fresh('heal') && P.heals > 0 && P.hp < 100) {
                want.heal = -9;
                startMove('heal', P.yaw);
            } else if (can && guarding && P.st > 0) {
                if (P.state !== 'guard') { P.state = 'guard'; P.guardAt = Math.max(P.guardAt, T - 0.05); P.t = 0; }
                P.yaw += angDiff(target ? Math.atan2(fxd, fzd) : moving ? Math.atan2(mx, mz) : P.yaw, P.yaw) * Math.min(1, dt * 12);
                P.stWait = 0.35;
                // A slow guarded walk; the feet step for themselves
                if (moving) { P.x += mx * GUARD_WALK * il * dt; P.z += mz * GUARD_WALK * il * dt; }
                heroAnim('Idle_Loop');
            } else if (sprinting && ctx.mode !== 'dead') {
                P.state = 'sprint';
                P.x += mx / il * SPRINT * dt; P.z += mz / il * SPRINT * dt;
                P.yaw += angDiff(Math.atan2(mx, mz), P.yaw) * Math.min(1, dt * 9);
                P.st -= 15 * dt; P.stWait = 0.5;
                if (P.st <= 0) { P.st = 0; emptyFlash = 0.6; rollSprinted = false; }
                heroAnim('Sprint_Loop', false, SPRINT_RATE);
                env.heroSteps();
            } else if (moving && ctx.mode !== 'dead') {
                P.state = 'run';
                P.x += mx * RUN * dt; P.z += mz * RUN * dt;
                P.yaw += angDiff(Math.atan2(mx, mz), P.yaw) * Math.min(1, dt * 14);
                heroAnim('Jog_Fwd_Loop', false, JOG_RATE * Math.min(1, il + 0.2));
                env.heroSteps();
            } else {
                P.state = 'idle';
                P.yaw += angDiff(target ? Math.atan2(fxd, fzd) : P.yaw, P.yaw) * Math.min(1, dt * 8);
                heroAnim('Sword_Idle');
            }
        } else if (P.state === 'roll') {
            // The clip is a dive: up, over, and back to the feet. The middle of it is the part nothing can touch.
            P.inv = P.t > 0.05 && P.t < 0.5;
            const v = P.t < 0.52 ? 7.2 : 2.2;
            P.x += P.dx * v * mdt; P.z += P.dz * v * mdt;
            // A strike late in the roll comes out of it as a rising cut
            if (can && P.t > 0.4 && fresh('light', 0.5) && !tired(MOVE.rollcut.cost)) { want.light = -9; startMove('rollcut', aimYaw); }
            else if (P.t >= 0.7) P.state = 'idle';
        } else if (MOVE[P.move] && STATE_OF[P.move] === P.state) {
            runMove(MOVE[P.move], mdt, dt, F, target, aimYaw, moving, mx, mz, il, can, tired);
        } else if (P.state === 'hurt') {
            const v = Math.max(0, 6 * P.knock * (1 - P.t / 0.3));
            P.x += P.dx * v * mdt; P.z += P.dz * v * mdt;
            if (P.t >= (P.knock > 1.2 ? 0.6 : 0.36)) P.state = 'idle';
        } else if (P.state === 'broken') {
            // Guard broken: thrown open for a moment
            if (P.t >= 0.85) P.state = 'idle';
        } else if (P.state !== 'dead') P.state = 'idle';

        if (P.stWait <= 0) P.st = Math.min(100, P.st + (P.state === 'guard' ? 22 : 46) * dt);
        art(dt, F);
        keepOut();
        P.vx = dt > 0 ? (P.x - x0) / dt : 0;
        P.vz = dt > 0 ? (P.z - z0) / dt : 0;
        hero.mixer.timeScale = hs > 0 ? 0 : animRate;
    }

    function startRoll(dx, dz) {
        P.state = 'roll'; P.t = 0; P.st -= 20; P.stWait = 0.8; P.move = '';
        P.dx = dx; P.dz = dz;
        P.yaw = Math.atan2(dx, dz);
        heroAnim('Roll', true, 1.9, true, 0.12);
        if (!snd('roll')) sfx.step();
    }
    // Begin an authored move, facing `yaw`. Everything starts from wherever the body is now.
    function startMove(name, yaw, fromStrike = false) {
        const M = MOVE[name];
        // The pose it starts from: the one it is in, or the ready stance if the arms were the animation's
        if (wUp > 0.5) copyPose(cur, snap); else copyPose(PZ.ready, snap);
        P.state = STATE_OF[name]; P.move = name; P.t = 0; P.go = 0; P.goScale = 1; P.struck = false; P.healed = false;
        P.chargeT = 0; P.released = !M.charge; P.charged = false; P.fromStrike = fromStrike; P.done = {};
        P.st -= M.cost || 0;
        if (M.cost) P.stWait = 0.7;
        P.yaw = yaw;
        P.combo = name === 'l1' ? 1 : name === 'l2' ? 2 : name === 'l3' ? 3 : 0;
        heroAnim('Idle_Loop', false, 1, false, 0, 0.12);
        // A riposte steps in to the distance it needs, whatever that is
        if (name === 'riposte' && ctx.form) {
            const F = ctx.form, d = Math.hypot(F.x - P.x, F.z - P.z);
            P.goScale = Math.max(0, Math.min(1.8, d - Math.max(0.6, F.radius || 0) - 0.15));
        }
        if (name === 'art') cutIn();
    }
    function copyPose(a, out) {
        out.hand.copy(a.hand); out.dir.copy(a.dir); out.edge.copy(a.edge);
        out.twist = a.twist; out.bend = a.bend; out.crouch = a.crouch;
        out.el = out.el || V(); out.el.copy(a.el || EL);
        // The other hand keeps going where it was going
        out.left = a.left !== undefined ? a.left : (a.lk < 0.5 ? (a.la && a.la.left) : (a.lb && a.lb.left)) || null;
    }
    // The value of a [time, value] curve at t, eased between points
    function curve(c, t) {
        if (!c) return 0;
        if (t <= c[0][0]) return c[0][1];
        for (let i = 1; i < c.length; i++) if (t < c[i][0]) { const k = kit.ease((t - c[i - 1][0]) / (c[i][0] - c[i - 1][0])); return mix(c[i - 1][1], c[i][1], k); }
        return c[c.length - 1][1];
    }
    function runMove(M, mdt, dt, F, target, aimYaw, moving, mx, mz, il, can, tired) {
        const name = P.move;
        // A light blow whose button is still held becomes a heavy one, carrying on from where it is
        if (M.kind === 'light' && P.fromStrike && held.strike && now() - strikeAt > 0.2 && P.t < M.hit[0] && !tired(MOVE.heavy.cost)) {
            const was = P.t;
            startMove('heavy', P.yaw);
            P.t = Math.min(0.16, was);
            return;
        }
        // A heavy blow held at the top of its lift: charging, and charged after a moment
        if (M.charge && !P.released) {
            if (P.t >= M.charge) {
                if ((held.heavy || held.strike) && P.chargeT < 1.6 && ctx.mode === 'play') {
                    P.t = M.charge;
                    P.chargeT += dt;
                    P.stWait = 0.5;
                    if (!P.charged && P.chargeT > 0.6) { P.charged = true; sfx.tick(); snd('charged'); }
                } else P.released = true;
            }
        }
        const t = P.t;
        if (t < (M.track || 0) + (M.charge && !P.released ? 9 : 0)) {
            const want = target && name !== 'backstep' ? Math.atan2(F.x - P.x, F.z - P.z) : name === 'heal' || name === 'backstep' ? P.yaw : aimYaw;
            P.yaw += angDiff(want, P.yaw) * Math.min(1, dt * (M.charge ? 6 : 14));
        }
        // Travel along the way it faces, and off the ground for a leap or a hop
        const go = curve(M.go, t) * (name === 'riposte' ? P.goScale : P.charged && name === 'heavy' ? 1.5 : 1);
        const dg = go - P.go;
        P.go = go;
        P.x += Math.sin(P.yaw) * dg; P.z += Math.cos(P.yaw) * dg;
        P.y = curve(M.lift, t);
        if (M.inv) P.inv = t > M.inv[0] && t < M.inv[1];
        // Feet that step on cue
        if (M.steps) for (let i = 0; i < M.steps.length; i++) {
            const s = M.steps[i];
            if (t >= s[0] && !P.done['s' + i]) {
                P.done['s' + i] = true;
                const ahead = curve(M.go, s[1]) * (name === 'riposte' ? P.goScale : 1) - go;
                const bx = P.x + Math.sin(P.yaw) * ahead, bz = P.z + Math.cos(P.yaw) * ahead;
                stepTo(feet[s[2]], bx, bz, P.yaw, s[3], s[4], s[1] - s[0], s[5]);
            }
        }
        if (M.swing !== undefined && t >= M.swing && !P.done.swing) {
            P.done.swing = true;
            snd('swing', P.charged ? 'charged' : M.kind);
        }
        // The riposte goes in on its cue, whatever the blade test says: it is a locked finisher
        if (name === 'riposte' && t >= M.impact && !P.done.impact) {
            P.done.impact = true;
            const f = ctx.form;
            if (f && f.damage) {
                const r = f.damage(M.dmg, { kind: f.staggered ? 'riposte' : 'heavy', x: P.x, z: P.z, posture: 0 });
                if (r && r.dealt > 0) landed('riposte', r);
            }
            ctx.slow(0.15, 0.7);
            ctx.shake(0.9);
            ctx.flash('rgba(255,200,150,0.35)', 0.25);
        }
        if (name === 'art' && t >= M.release && !P.done.release) { P.done.release = true; loose(); }
        if (name === 'heal' && t >= M.heal && !P.healed) {
            P.healed = true; P.heals--; P.hp = Math.min(100, P.hp + 45);
            if (!snd('heal')) sfx.kindle();
            ctx.spark(P.x + Math.sin(P.yaw) * 0.2, 1.3, P.z + Math.cos(P.yaw) * 0.2, 1.6, '#ffb050');
        }
        // A charged heavy hits the stone hard enough to raise dust
        if (name === 'heavy' && t >= 0.58 && !P.done.dust) { P.done.dust = true; ctx.dust(P.x + Math.sin(P.yaw) * 1.1, P.z + Math.cos(P.yaw) * 1.1, P.charged ? 14 : 6); if (P.charged) ctx.shake(0.5); }
        // Carry on into the next blow, if one is waiting
        if (can && M.chain && t >= M.chain) {
            if (F.staggered && (fresh('light', 0.5) || fresh('heavy', 0.5)) && canRiposte(F, Math.hypot(F.x - P.x, F.z - P.z))) { want.light = want.heavy = -9; startMove('riposte', Math.atan2(F.x - P.x, F.z - P.z)); return; }
            if (fresh('heavy', 0.5) && !tired(MOVE.heavy.cost)) { want.heavy = want.light = -9; startMove('heavy', aimYaw); return; }
            if (fresh('light', 0.5) && !tired(MOVE[M.next].cost)) { want.light = -9; startMove(M.next, aimYaw, true); return; }
        }
        // Cut it short with a roll or the guard once the blow is spent
        if (can && M.cancel && t >= M.cancel) {
            if (fresh('roll') && !tired(20)) { want.roll = -9; if (moving) startRoll(mx / il, mz / il); else startMove('backstep', P.yaw); return; }
            if (guarding && name !== 'heal') { P.state = 'guard'; P.guardAt = Math.max(P.guardAt, ctx.time() - 0.05); P.t = 0; P.y = 0; return; }
            if (moving && t >= M.cancel + 0.12 && name !== 'riposte') { P.state = 'run'; P.y = 0; return; }
            if (fresh('art') && P.art >= ART_FULL) { want.art = -9; startMove('art', aimYaw); return; }
        }
        if (t >= M.total) { P.state = 'idle'; P.y = 0; P.move = ''; }
    }
    function canRiposte(F, dist) {
        if (!F || !F.staggered || F.targetable === false) return false;
        if (dist > Math.max(0.6, F.radius || 0) + 2.4) return false;
        // From in front of it, if it says which way it faces
        if (typeof F.yaw === 'number' && Math.abs(angDiff(Math.atan2(P.x - F.x, P.z - F.z), F.yaw)) > 1.4) return false;
        return true;
    }
    // Without lock-on, a blow still bends towards the boss if it is roughly ahead and close
    function softAim(F, yaw) {
        if (!ctx.form || F.targetable === false) return yaw;
        const a = Math.atan2(F.x - P.x, F.z - P.z), d = Math.hypot(F.x - P.x, F.z - P.z);
        return Math.abs(angDiff(a, yaw)) < 0.9 && d < Math.max(0.6, F.radius || 0) + 3.5 ? a : yaw;
    }
    const lockedOn = () => P.lock && ctx.form && ctx.form.targetable !== false;

    // Stay on the roof, and out of the brazier and the boss itself
    function keepOut() {
        const F = ctx.form, ARENA = ctx.ARENA;
        const r = Math.hypot(P.x, P.z);
        if (r > ARENA) { P.x *= ARENA / r; P.z *= ARENA / r; }
        if (r < 1.6) { const k = 1.6 / (r || 1); P.x = (P.x || 0.01) * k; P.z *= k; }
        if (F && F.radius > 0) {
            const d2 = Math.hypot(P.x - F.x, P.z - F.z);
            if (d2 < F.radius) { P.x = F.x + (P.x - F.x) / (d2 || 1) * F.radius; P.z = F.z + (P.z - F.z) / (d2 || 1) * F.radius; }
        }
    }

    // A blow landed: hit-stop, a kick of the camera, a bit of the ember meter
    const kick = V();
    let fovKick = 0;
    function landed(kind, r, bx = 0, bz = 0) {
        const w = kind === 'riposte' ? 1 : kind === 'art' ? 0.9 : kind === 'charged' ? 0.85 : kind === 'heavy' ? 0.6 : kind === 'l3' ? 0.45 : 0.3;
        if (kind !== 'riposte' && kind !== 'art') {
            hs = kind === 'charged' ? 0.12 : kind === 'heavy' ? 0.09 : kind === 'l3' ? 0.07 : 0.05;
            if (w >= 0.6) ctx.slow(0.2, 0.05);
        }
        P.art = Math.min(ART_FULL, P.art + (kind === 'riposte' ? 22 : kind === 'art' ? 0 : 6 + w * 8));
        kick.set(bx, -0.4, bz).multiplyScalar(0.12 + w * 0.22);
        fovKick = 0.4 + w;
        ctx.shake(0.25 + w * 0.5);
        snd('flesh', kind);
    }

    // ── The ember art: the cut-in, then the crescent of fire ──
    function cutIn() {
        const el = $('cutin');
        if (el) { $('cutinName').textContent = ctx.heroName || ''; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
        P.art = 0;
        ctx.slow(0.45, 0.55);
        snd('art');
        sfx.kindle();
    }
    function loose() {
        cres.on = true; cres.t = 0; cres.hit = false;
        cres.yaw = P.yaw; cres.x = P.x; cres.z = P.z;
        ctx.shake(0.6);
        ctx.flash('rgba(255,140,60,0.3)', 0.25);
        ctx.dust(P.x + Math.sin(P.yaw), P.z + Math.cos(P.yaw), 10, '#ff8a3a');
    }
    function art(dt, F) {
        if (!crescent) return;
        if (!cres.on) { crescent.visible = false; return; }
        cres.t += dt;
        const k = cres.t / 0.42;
        cres.r = 0.8 + k * 6.6;
        crescent.visible = true;
        crescent.position.set(cres.x, 0.75, cres.z);
        crescent.rotation.set(0, cres.yaw, 0);
        crescent.scale.set(cres.r, 1.5 - k * 0.6, cres.r);
        crescent.material.opacity = Math.max(0, 1 - k * k) * 0.95;
        // It burns the boss once, where its edge passes over it
        const f = ctx.form;
        if (!cres.hit && f && f.targetable !== false && f.damage) {
            const d = Math.hypot(f.x - cres.x, f.z - cres.z), a = Math.abs(angDiff(Math.atan2(f.x - cres.x, f.z - cres.z), cres.yaw));
            const pad = Math.max(0.6, f.radius || 0) + 0.3;
            if (d < cres.r + pad && d > cres.r - pad - 1 && a < cres.arc / 2 + pad / Math.max(1, d)) {
                cres.hit = true;
                const r = f.damage(MOVE.art.dmg, { kind: 'art', x: P.x, z: P.z, posture: MOVE.art.post });
                if (r && r.dealt > 0) { landed('art', r); ctx.spark(f.x, (f.aimY || 1.4) * 0.8, f.z, 3, '#ff9a40'); }
            }
        }
        if (Math.floor(cres.t * 30) % 4 === 0) ctx.dust(cres.x + Math.sin(cres.yaw) * cres.r, cres.z + Math.cos(cres.yaw) * cres.r, 2, '#ff7a2a');
        if (k >= 1) { cres.on = false; crescent.visible = false; }
    }

    // ═════════════ A blow reaching the visitor ═════════════
    // Rolling through it avoids it; a guard raised just in time turns it aside; a guard already up takes most of it, at
    // a cost in stamina, and breaks if the stamina runs out. The core counts hits and parries and handles a fall.
    function receive(dmg, fromX, fromZ, opts) {
        if (P.state === 'dead') return null;
        if (P.inv) return 'dodged';
        const facing = Math.abs(angDiff(Math.atan2(fromX - P.x, fromZ - P.z), P.yaw)) < 1.9;
        if (P.state === 'guard' && facing && !opts.unblockable) {
            if (ctx.time() - P.guardAt < 0.22) {
                P.flick = 1;
                ctx.spark(P.x + Math.sin(P.yaw) * 0.6, 1.4, P.z + Math.cos(P.yaw) * 0.6, 2.6, '#fff6d0');
                if (!snd('parry')) { sfx.tick(); sfx.thud(); }
                ctx.slow(0.25, 0.1875);
                ctx.shake(0.5);
                P.art = Math.min(ART_FULL, P.art + 14);
                return 'parried';
            }
            P.st -= dmg * 1.1;
            P.stWait = 0.9;
            if (!snd('guard')) sfx.thud();
            ctx.shake(0.4);
            ctx.spark(P.x + Math.sin(P.yaw) * 0.5, 1.3, P.z + Math.cos(P.yaw) * 0.5, 1.4, '#c8c0b8');
            const d = Math.hypot(P.x - fromX, P.z - fromZ) || 1;
            ctx.push((P.x - fromX) / d * 0.25, (P.z - fromZ) / d * 0.25);
            if (P.st > 0) { P.hp -= dmg * 0.15; if (P.hp > 0) return 'blocked'; }
            // Guard broken: the rest of it gets through, and they are thrown open
            P.st = 0; emptyFlash = 0.8;
            dmg *= 0.7;
            if (P.hp - dmg > 0) {
                P.hp -= dmg;
                P.state = 'broken'; P.t = 0; P.move = '';
                heroAnim('Hit_Head', true, 0.8, true);
                flashHurt();
                return 'hit';
            }
        }
        P.hp -= dmg;
        ctx.shake(1);
        if (!snd('hurt')) sfx.thud();
        flashHurt();
        const d = Math.hypot(P.x - fromX, P.z - fromZ) || 1;
        P.dx = (P.x - fromX) / d; P.dz = (P.z - fromZ) / d;
        P.knock = opts.knock ?? 1;
        P.y = 0; P.move = ''; cres.on = cres.on && cres.t > 0;
        if (P.hp <= 0) { P.hp = 0; P.state = 'dead'; P.t = 0; heroAnim('Death01', true, 1, true); }
        else { P.state = 'hurt'; P.t = 0; heroAnim('Hit_Chest', true, 1, true); }
        return 'hit';
    }

    // ═════════════ Where the body is, and the bars ═════════════
    const bars = {};
    function place() {
        ctx.toWorld(hero.root.position.set(P.x, P.y, P.z));
        hero.root.rotation.set(0, P.yaw, 0);
        if (!bars.Hp) Object.assign(bars, { Hp: $('meHp'), HpLag: $('meHpLag'), St: $('meSt'), StBar: $('meStBar'), Heals: $('meHeals'), Art: $('meArt'), ArtFill: $('meArtFill'), Low: $('meLow'),
            bHeal: $('btnHeal'), bArt: $('btnArt'), bossPost: $('bossPost'), bossPostBar: $('bossPostBar') });
        const b = bars;
        b.Hp.style.width = Math.max(0, P.hp) + '%';
        hurtShown = P.hp > hurtShown ? P.hp : toward(hurtShown, P.hp, 2.2, 1 / 60);
        if (b.HpLag) b.HpLag.style.width = Math.max(0, hurtShown) + '%';
        b.St.style.width = Math.max(0, P.st) + '%';
        if (b.StBar) b.StBar.classList.toggle('empty', emptyFlash > 0);
        b.Heals.textContent = '✚'.repeat(P.heals) + '·'.repeat(Math.max(0, P.maxHeals - P.heals));
        if (b.bHeal) b.bHeal.hidden = P.heals <= 0;
        const full = P.art >= ART_FULL;
        if (b.ArtFill) b.ArtFill.style.width = P.art / ART_FULL * 100 + '%';
        if (b.Art) b.Art.classList.toggle('full', full);
        if (b.bArt) b.bArt.hidden = !full;
        if (b.Low) b.Low.style.opacity = P.hp > 0 && P.hp < 35 ? (0.35 + (35 - P.hp) / 35 * 0.5) * (0.75 + 0.25 * Math.sin(performance.now() / 180)) : 0;
        // The boss's posture, if it has one to show: fills from the middle outwards
        const f = ctx.form;
        if (b.bossPostBar) {
            const pm = f && f.postureMax > 0 ? f.postureMax : 0, pv = pm ? clamp01((f.posture || 0) / pm) : 0;
            b.bossPostBar.hidden = !pm;
            if (pm) {
                b.bossPost.style.width = pv * 100 + '%';
                b.bossPostBar.classList.toggle('hot', pv > 0.75 || !!f.staggered);
                b.bossPostBar.classList.toggle('open', !!f.staggered);
            }
        }
    }

    // ═════════════ Camera ═════════════
    // Locked on: behind the visitor on the line from the boss, pulled back and up for big things, looking at a point
    // between them weighted towards the boss's own height. Free: orbits the visitor; drifts back behind them while they
    // run and nobody is turning it. Never outside the wall, never under the floor.
    const camSm = { x: 0, z: 0, y: 1.5, ready: false };
    const _ct = V(), _cl = V();
    function camera(dt) {
        const F = ctx.form || still, J = ctx.jolt;
        const locked = lockedOn();
        kick.multiplyScalar(Math.exp(-14 * dt));
        fovKick = toward(fovKick, 0, 10, dt);
        // A target that jumps (comes apart and re-forms) is followed, not snapped to
        if (!camSm.ready) { camSm.x = F.x; camSm.z = F.z; camSm.y = F.aimY || 1.5; camSm.ready = true; }
        camSm.x = toward(camSm.x, F.x, 7, dt); camSm.z = toward(camSm.z, F.z, 7, dt); camSm.y = toward(camSm.y, F.aimY || 1.5, 4, dt);
        let px, py, pz, lx, ly, lz;
        if (P.state === 'riposte') {
            // Close, over the shoulder, low: the finisher
            const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
            px = P.x - s * 1.9 - c * 1.1; py = 1.35; pz = P.z - c * 1.9 + s * 1.1;
            lx = P.x + s * 1.6; ly = 1.2; lz = P.z + c * 1.6;
        } else if (locked) {
            let bx = P.x - camSm.x, bz = P.z - camSm.z;
            const d = Math.hypot(bx, bz) || 1;
            bx /= d; bz /= d;
            const size = Math.max(1, F.radius || 0, (F.aimY || 1.5) / 1.3);
            const close = Math.max(0, 6 + size - d);
            const back = 4.3 + size * 0.85 + close * 0.45;
            const high = 1.9 + size * 0.4 + close * 0.2 + Math.max(0, camSm.y - 3) * 0.25;
            px = P.x + bx * back + bz * 1.1; py = high; pz = P.z + bz * back - bx * 1.1;
            const w = Math.min(0.7, 0.45 + 0.04 * size);
            lx = mix(P.x, camSm.x, w); lz = mix(P.z, camSm.z, w);
            ly = mix(1.3, camSm.y, 0.6);
            camYaw = Math.atan2(-bx, -bz);
        } else {
            // Free: drift back behind the visitor when they run and the camera has been left alone
            orbit.idle += dt;
            if (orbit.idle > 1.2 && (P.state === 'run' || P.state === 'sprint')) orbit.yaw += angDiff(P.yaw, orbit.yaw) * Math.min(1, dt * 1.4);
            const dist = 5.8, cp = Math.cos(orbit.pitch);
            px = P.x - Math.sin(orbit.yaw) * dist * cp; py = 1.4 + Math.sin(orbit.pitch) * dist; pz = P.z - Math.cos(orbit.yaw) * dist * cp;
            lx = P.x; ly = 1.3; lz = P.z;
            camYaw = orbit.yaw;
        }
        // Keep inside the wall (rising a little where it would have gone through), and above the floor
        // Against the wall it slides in along its line of sight, then climbs and looks more down at the visitor
        // so they stay in the frame
        const lim = ctx.ARENA - 0.6, r = Math.hypot(px, pz);
        if (r > lim) {
            let lo = 0, hi = 1;
            for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (Math.hypot(mix(px, lx, m), mix(pz, lz, m)) > lim) lo = m; else hi = m; }
            const lost = Math.hypot(lx - px, lz - pz) * hi;
            px = mix(px, lx, hi); pz = mix(pz, lz, hi);
            py += lost * 0.55;
            const k = Math.min(0.4, lost * 0.1);
            lx = mix(lx, P.x, k); ly = mix(ly, 1.0, k); lz = mix(lz, P.z, k);
        }
        py = Math.max(0.55, py);
        ctx.toWorld(env.camTo.set(px + J.x + kick.x, py + J.y + kick.y, pz + kick.z));
        ctx.toWorld(env.look.set(lx + kick.x * 0.4, ly + kick.y * 0.4, lz + kick.z * 0.4));
        // A small lens punch when a blow lands
        const fov = env.baseFov() * (1 - fovKick * 0.035);
        if (Math.abs(ctx.camera.fov - fov) > 0.01) { ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix(); }
    }

    // ═════════════ Posing: legs, body, arms, sword (after the animation) ═════════════
    let wLegs = 0, wUp = 0, planted = false;
    const LEGS = ['pelvis', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
    const UPPER = ['spine_01', 'spine_02', 'spine_03', 'upperarm_r', 'lowerarm_r', 'hand_r', 'upperarm_l', 'lowerarm_l', 'hand_l'];
    const saved = {}, savedPelvis = V();
    const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
    const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _x = V(), _t = V(), _pole = V(), _sh = V();
    const blade = { base: V(), tip: V(), pb: V(), pt: V(), has: false };
    const IK_LEGS = new Set(['idle', 'guard', 'attack', 'riposte', 'art', 'backstep', 'heal', 'broken']);

    // A point given in the turned-and-bent body's frame, out into the world (isDir: a direction, not a point)
    function bodyToWorld(v, out, ps, isDir) {
        out.copy(v);
        if (!isDir) out.y -= WAIST;
        out.applyAxisAngle(_x.set(1, 0, 0), ps.bend).applyAxisAngle(UP, ps.twist);
        if (!isDir) out.y += WAIST - ps.crouch * DROP;
        out.applyAxisAngle(UP, P.yaw);
        if (!isDir) { out.x += P.x; out.y += P.y; out.z += P.z; ctx.toWorld(out); }
        return out;
    }
    // Set a bone's world rotation outright
    function setWorldQ(bone, q) {
        bone.parent.getWorldQuaternion(_q2);
        bone.quaternion.copy(_q2.invert()).multiply(q);
        bone.updateMatrixWorld(true);
    }
    // A hand turned to hold a blade pointing `dir` with its edge facing `edge` (world directions)
    function gripQ(dir, edge, out) {
        _e.copy(edge).addScaledVector(dir, -edge.dot(dir));
        if (_e.lengthSq() < 1e-4) _e.set(0, 1, 0).addScaledVector(dir, -dir.y);
        _e.normalize();
        _x.crossVectors(_e, dir);
        return out.setFromRotationMatrix(_m.makeBasis(_x, _e, dir));
    }

    // The upper body's pose this frame, from the state
    function upperPose(dt) {
        if (MOVE[P.move] && STATE_OF[P.move] === P.state) {
            const M = MOVE[P.move], ks = M.keys, t = P.t;
            let i = 0;
            while (i < ks.length - 2 && t >= ks[i + 1][0]) i++;
            const a = ks[i][1] === 'snap' ? snap : keyPose.get(ks[i][1]), b = keyPose.get(ks[i + 1][1]);
            const k = kit.EASE[ks[i + 1][2]](clamp01((t - ks[i][0]) / (ks[i + 1][0] - ks[i][0])));
            blendInto(a, b, k);
            // Charging: the held blade trembles
            if (P.move === 'heavy' && !P.released && P.chargeT > 0) { const q = Math.min(1, P.chargeT) * 0.012; cur.hand.x += Math.sin(performance.now() * 0.09) * q; cur.hand.y += Math.cos(performance.now() * 0.11) * q; }
            return true;
        }
        if (P.state === 'guard' || P.flick > 0.05) { blendInto(PZ.guard, PZ.parry, P.flick); cur.hand.y += Math.sin(performance.now() / 600) * 0.008; return true; }
        return false;
    }
    function blendInto(a, b, k) {
        cur.hand.lerpVectors(a.hand, b.hand, k);
        cur.dir.lerpVectors(a.dir, b.dir, k).normalize();
        cur.edge.lerpVectors(a.edge, b.edge, k);
        cur.twist = mix(a.twist, b.twist, k); cur.bend = mix(a.bend, b.bend, k); cur.crouch = mix(a.crouch, b.crouch, k);
        cur.el.lerpVectors(a.el || EL, b.el || EL, k).normalize();
        cur.la = a; cur.lb = b; cur.lk = k;
    }
    // Where the other hand should be for one key's `left`, in the world
    function leftTarget(L, out, hand, dir, edge) {
        if (L === 'hilt') return out.copy(hand).addScaledVector(edge, 0.085).addScaledVector(dir, -0.12).addScaledVector(edge, -0.085);
        if (L === 'blade') return out.copy(hand).addScaledVector(edge, 0.085).addScaledVector(dir, 0.5).addScaledVector(edge, -0.06);
        return bodyToWorld(L, out, cur);
    }

    // ── Feet ──
    function stepTo(f, bx, bz, yaw, hx, hz, dur, h) {
        const s = Math.sin(yaw), c = Math.cos(yaw);
        f.fx = f.x; f.fz = f.z; f.fyaw = f.yaw;
        f.tx = bx + hx * c + hz * s; f.tz = bz - hx * s + hz * c; f.tyaw = yaw;
        f.t = 0; f.dur = Math.max(0.05, dur); f.h = h; f.stepping = true;
    }
    function plantFeet() {
        for (const s of ['l', 'r']) {
            const f = feet[s];
            ctx.toArena(f.foot.getWorldPosition(_a));
            f.x = _a.x; f.z = _a.z; f.yaw = P.yaw; f.stepping = false; f.lift = Math.max(0, _a.y - ANKLE);
        }
        planted = true;
    }
    // Feet step for themselves when the body has moved or turned away from them (not while a move steps them)
    function feetFollow(dt) {
        const M = MOVE[P.move], cued = M && M.steps && STATE_OF[P.move] === P.state && P.t < M.steps[M.steps.length - 1][1];
        for (const s of ['l', 'r']) {
            const f = feet[s];
            if (f.stepping) {
                f.t += dt;
                const k = clamp01(f.t / f.dur), e = kit.ease(k);
                f.x = mix(f.fx, f.tx, e); f.z = mix(f.fz, f.tz, e); f.yaw = f.fyaw + angDiff(f.tyaw, f.fyaw) * e;
                f.lift = Math.sin(Math.PI * k) * f.h;
                if (k >= 1) { f.stepping = false; f.lift = 0; if (f.h > 0.03 && !snd('step')) sfx.step(); }
            } else f.lift = toward(f.lift, 0, 20, dt);
        }
        if (cued || P.state === 'broken') return;
        const lead = 0.16, sn = Math.sin(P.yaw), cs = Math.cos(P.yaw);
        let worst = null, wErr = 0;
        for (const s of ['l', 'r']) {
            const f = feet[s], o = feet[s === 'l' ? 'r' : 'l'];
            if (f.stepping || (o.stepping && o.t / o.dur < 0.6)) continue;
            const hx = P.x + HOME[s][0] * cs + HOME[s][1] * sn + P.vx * lead, hz = P.z - HOME[s][0] * sn + HOME[s][1] * cs + P.vz * lead;
            const err = Math.hypot(f.x - hx, f.z - hz) + Math.abs(angDiff(f.yaw, P.yaw)) * 0.25;
            if (err > 0.17 && err > wErr) { worst = f; wErr = err; }
        }
        if (worst) {
            const s = worst.s, sp = Math.hypot(P.vx, P.vz), dur = Math.max(0.13, Math.min(0.24, 0.26 - sp * 0.03));
            stepTo(worst, P.x + P.vx * dur * 1.1, P.z + P.vz * dur * 1.1, P.yaw, HOME[s][0], HOME[s][1], dur, 0.05 + Math.min(0.05, wErr * 0.1));
        }
    }
    function solveLegs(ps, dt) {
        feetFollow(dt);
        // Hips: lowered by the crouch, turned a little with the chest
        const pel = B.pelvis;
        if (ps) {
            pel.getWorldPosition(_a);
            _a.y -= ps.crouch * DROP;
            _a.x -= Math.sin(P.yaw) * ps.crouch * 0.05; _a.z -= Math.cos(P.yaw) * ps.crouch * 0.05;
            pel.position.copy(pel.parent.worldToLocal(_a));
            pel.updateMatrixWorld(true);
            turnWorld(pel, _q.setFromAxisAngle(UP, ps.twist * 0.3));
        }
        for (const s of ['l', 'r']) {
            const f = feet[s];
            ctx.toWorld(_t.set(f.x, ANKLE + f.lift + P.y * 0, f.z));
            // The knee points the way the foot does, a little outwards
            const out = s === 'l' ? 0.25 : -0.25;
            _pole.set(Math.sin(f.yaw + out), 0.1, Math.cos(f.yaw + out));
            reachFor(f.thigh, f.calf, f.foot, _t, _pole);
            setWorldQ(f.foot, _q.setFromAxisAngle(UP, f.yaw).multiply(restQ[s]));
        }
    }
    function solveUpper() {
        const ps = cur;
        // Chest: turned and bent, the hips having taken their share
        const yaw = P.yaw + ps.twist;
        _a.set(Math.cos(yaw), 0, -Math.sin(yaw));
        turnWorld(B.spine_01, _q.setFromAxisAngle(UP, ps.twist * 0.3));
        turnWorld(B.spine_01, _q.setFromAxisAngle(_a, ps.bend * 0.6));
        turnWorld(B.spine_03, _q.setFromAxisAngle(UP, ps.twist * 0.4));
        turnWorld(B.spine_03, _q.setFromAxisAngle(_a, ps.bend * 0.4));
        // Sword arm
        bodyToWorld(ps.hand, _t, ps);
        bodyToWorld(ps.dir, _d, ps, true).normalize();
        bodyToWorld(ps.edge, _e, ps, true);
        bodyToWorld(ps.el, _pole, ps, true);
        reachFor(B.upperarm_r, B.lowerarm_r, B.hand_r, _t, _pole);
        const ed = _c.copy(_e);
        setWorldQ(B.hand_r, gripQ(_d, ed, _q));
        // The other hand: where either key puts it, eased between them
        const La = ps.la ? ps.la.left : null, Lb = ps.lb ? ps.lb.left : null;
        const wa = La ? 1 : 0, wb = Lb ? 1 : 0, wl = mix(wa, wb, ps.lk);
        if (wl > 0.01) {
            B.hand_r.getWorldPosition(_sh);
            _e.copy(ed).addScaledVector(_d, -ed.dot(_d)).normalize();
            leftTarget(La || Lb, _a, _sh, _d, _e);
            if (La && Lb) { leftTarget(Lb, _b, _sh, _d, _e); _a.lerp(_b, ps.lk); }
            bodyToWorld(_b.set(0.6, -1, -0.2), _pole, ps, true);
            const save = saved.lt || (saved.lt = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]);
            save[0].copy(B.upperarm_l.quaternion); save[1].copy(B.lowerarm_l.quaternion); save[2].copy(B.hand_l.quaternion);
            reachFor(B.upperarm_l, B.lowerarm_l, B.hand_l, _a, _pole);
            const two = (La === 'hilt' || La === 'blade') && (Lb === 'hilt' || Lb === 'blade') || (ps.lk < 0.5 ? La === 'hilt' : Lb === 'hilt');
            if (two) setWorldQ(B.hand_l, gripQ(_d, _e, _q));
            if (wl < 0.99) {
                for (const [bn, i] of [['upperarm_l', 0], ['lowerarm_l', 1], ['hand_l', 2]]) { _q.copy(B[bn].quaternion); B[bn].quaternion.copy(save[i]).slerp(_q, wl); }
            }
        }
    }
    // Running and rolling: the arms are the animation's; the blade is carried trailing low behind
    const CARRY_DIR = V(-0.25, -0.45, -0.86).normalize(), CARRY_EDGE = V(0, -0.86, 0.45);
    function carry(k) {
        bodyToWorld(CARRY_DIR, _d, { twist: 0, bend: 0, crouch: 0 }, true);
        bodyToWorld(CARRY_EDGE, _e, { twist: 0, bend: 0, crouch: 0 }, true);
        _q.copy(B.hand_r.quaternion);
        setWorldQ(B.hand_r, gripQ(_d, _e, _q2.identity()));
        _q2.copy(B.hand_r.quaternion);
        B.hand_r.quaternion.copy(_q).slerp(_q2, k);
    }
    let carryW = 0;
    function pose(dt) {
        if (!sword) return;
        hero.root.updateMatrixWorld(true);
        const legsWant = IK_LEGS.has(P.state) && ctx.mode !== 'off' ? 1 : 0;
        const hasUp = upperPose(dt);
        wLegs = toward(wLegs, legsWant, legsWant ? 26 : 14, dt);
        wUp = toward(wUp, hasUp ? 1 : 0, hasUp ? 24 : 12, dt);
        if (!legsWant && wLegs < 0.02) planted = false;
        if (legsWant && !planted) plantFeet();
        for (const n of LEGS) (saved[n] || (saved[n] = new THREE.Quaternion())).copy(B[n].quaternion);
        for (const n of UPPER) (saved[n] || (saved[n] = new THREE.Quaternion())).copy(B[n].quaternion);
        savedPelvis.copy(B.pelvis.position);
        if (wLegs > 0.002) solveLegs(hasUp && P.state !== 'guard' ? cur : (P.state === 'guard' ? cur : null), dt);
        if (hasUp && wUp > 0.002) solveUpper();
        // Ease from the animation into the authored pose and back
        if (wLegs < 0.998) {
            for (const n of LEGS) { _q.copy(B[n].quaternion); B[n].quaternion.copy(saved[n]).slerp(_q, wLegs); }
            B.pelvis.position.lerpVectors(savedPelvis, B.pelvis.position, wLegs);
        }
        if (wUp < 0.998) for (const n of UPPER) { _q.copy(B[n].quaternion); B[n].quaternion.copy(saved[n]).slerp(_q, hasUp ? wUp : wUp); }
        carryW = toward(carryW, P.state === 'run' || P.state === 'sprint' || P.state === 'roll' ? 1 : 0, 12, dt);
        hero.root.updateMatrixWorld(true);
        if (carryW > 0.01 && wUp < 0.5) { carry(carryW * (1 - wUp)); hero.root.updateMatrixWorld(true); }
        swordFx(dt);
    }

    // ── The blade: where it is, its trail, and whether it is cutting the boss ──
    const _bp = V(), _tp = V(), _ib = V(), _it = V();
    function swordFx(dt) {
        sword.updateMatrixWorld(true);
        ctx.toArena(sword.localToWorld(_bp.set(0, 0, BLADE0)));
        ctx.toArena(sword.localToWorld(_tp.set(0, 0, BLADE1)));
        const M = MOVE[P.move], inMove = M && STATE_OF[P.move] === P.state;
        const t = P.t;
        // Trail: on through the cut, with in-between samples swung around the shoulder so fast arcs stay round
        const cutting = inMove && ((M.hit && t > M.hit[0] - 0.06 && t < M.hit[1] + 0.05) || (P.move === 'art' && t > 0.47 && t < 0.68) || (P.move === 'riposte' && t > 0.3 && t < 0.4));
        ctx.toArena(B.upperarm_r.getWorldPosition(_sh));
        if (cutting && blade.has) {
            const steps = 3;
            for (let i = 1; i <= steps; i++) {
                const k = i / steps;
                swing(blade.pb, _bp, k, _ib); swing(blade.pt, _tp, k, _it);
                pushTrail(_ib, _it, (1 - k) * dt);
                if (!P.struck && M.hit && t >= M.hit[0] && t <= M.hit[1] + 0.02) testBlade(_ib, _it, M);
            }
        } else if (!P.struck && inMove && M.hit && t >= M.hit[0] && t <= M.hit[1]) testBlade(_bp, _tp, M);
        drawTrail(dt, inMove ? (P.move === 'art' ? '#ff8a30' : P.charged ? '#ffc070' : M.kind === 'heavy' ? '#ffe0b0' : '#fff2e0') : '#fff2e0');
        blade.pb.copy(_bp); blade.pt.copy(_tp); blade.has = true;
        // The charge glint, and the blade warming for the art
        const charging = inMove && P.move === 'heavy' && !P.released && P.chargeT > 0;
        glint.visible = charging || (P.charged && t < 0.6);
        if (glint.visible) {
            glint.position.copy(_tp);
            const g = P.charged ? 0.9 + Math.sin(performance.now() / 40) * 0.1 : Math.min(1, P.chargeT / 0.6) * 0.4;
            glint.material.opacity = g;
            glint.scale.setScalar(P.charged ? 0.9 : 0.4 + P.chargeT * 0.4);
        }
        const heat = inMove && P.move === 'art' ? clamp01(t / 0.45) * (t < 0.9 ? 1 : 0) : charging ? Math.min(1, P.chargeT / 0.6) * 0.5 : 0;
        bladeMat.emissive.setRGB(0.23 + heat * 0.9, 0.21 + heat * 0.4, 0.25 - heat * 0.15);
        // The ember cupped in the healing hand
        const healing = inMove && P.move === 'heal' && t > 0.15 && t < 0.95;
        ember.visible = healing;
        if (healing) {
            ctx.toArena(B.hand_l.getWorldPosition(_ib));
            ember.position.copy(_ib);
            const k = t < 0.6 ? (t - 0.15) / 0.45 : 1 - (t - 0.6) / 0.35;
            ember.material.opacity = clamp01(k) * (0.8 + Math.sin(performance.now() / 50) * 0.2);
            ember.scale.setScalar(0.3 + clamp01(k) * (t > 0.55 ? 0.9 : 0.4));
        }
    }
    // Between two blade positions, swung around the shoulder rather than cut straight across
    function swing(a, b, k, out) {
        const la = a.distanceTo(_sh), lb = b.distanceTo(_sh);
        out.lerpVectors(a, b, k).sub(_sh);
        const l = out.length() || 1;
        return out.multiplyScalar(mix(la, lb, k) / l).add(_sh);
    }
    function testBlade(a, b, M) {
        const f = ctx.form;
        if (!f || f.targetable === false || !f.damage || ctx.mode !== 'play') return;
        const reach = Math.max(0.6, f.radius || 0) + 0.1;
        // Seen from above, like every other blow in the fight, but it has to be low enough to meet a floating thing
        if (nearSeg(f.x, f.z, a, b) > reach) return;
        if ((f.aimY || 0) > 4 && Math.max(a.y, b.y) < (f.aimY || 0) - 2.5) return;
        P.struck = true;
        const charged = P.move === 'heavy' && P.charged;
        const dmg = M.dmg * (charged ? 1.5 : 1), post = M.post * (charged ? 1.6 : 1);
        const r = f.damage(dmg, { kind: M.kind === 'light' ? 'light' : 'heavy', x: P.x, z: P.z, posture: post });
        if (r && r.dealt > 0) {
            landed(charged ? 'charged' : P.move === 'l3' ? 'l3' : M.kind, r, b.x - a.x, b.z - a.z);
            ctx.spark(b.x * 0.4 + a.x * 0.6, Math.max(0.6, (a.y + b.y) / 2), b.z * 0.4 + a.z * 0.6, 1.4 + (charged ? 1.2 : 0), '#fff0c8');
        } else {
            // Turned aside, or it could not be hurt just then: a dull knock and a short stop
            hs = 0.04;
            sfx.tick();
            snd('clang');
        }
    }
    function pushTrail(base, tip, age) {
        trail.head = (trail.head + 1) % TRAIL;
        trail.base[trail.head].copy(base); trail.tip[trail.head].copy(tip); trail.age[trail.head] = age;
        trail.n = Math.min(TRAIL, trail.n + 1);
    }
    const _tc = new THREE.Color();
    function drawTrail(dt, color) {
        if (!trail.mesh) return;
        let live = 0;
        _tc.set(color);
        for (let i = 0; i < TRAIL; i++) trail.age[i] += dt;
        for (let j = 0; j < TRAIL; j++) {
            // Newest first, so the ribbon is in order
            const i = (trail.head - j + TRAIL) % TRAIL;
            const k = j < trail.n ? clamp01(1 - trail.age[i] / TRAIL_LIFE) : 0;
            if (k > 0) live++;
            const b = trail.base[i], t = trail.tip[i], o = j * 6;
            // The inner edge sits a little out from the hilt, so the ribbon reads as the blade's sweep
            trail.pos[o] = mix(b.x, t.x, 0.35); trail.pos[o + 1] = mix(b.y, t.y, 0.35); trail.pos[o + 2] = mix(b.z, t.z, 0.35);
            trail.pos[o + 3] = t.x; trail.pos[o + 4] = t.y; trail.pos[o + 5] = t.z;
            const fade = k * k * (1 - j / TRAIL);
            trail.col[o] = _tc.r * fade * 0.25; trail.col[o + 1] = _tc.g * fade * 0.25; trail.col[o + 2] = _tc.b * fade * 0.25;
            trail.col[o + 3] = _tc.r * fade; trail.col[o + 4] = _tc.g * fade; trail.col[o + 5] = _tc.b * fade;
        }
        trail.mesh.visible = live > 1;
        if (live > 1) { trail.mesh.geometry.attributes.position.needsUpdate = true; trail.mesh.geometry.attributes.color.needsUpdate = true; }
    }

    // ═════════════ Starting, stopping ═════════════
    function reset(full = true, heals = 3) {
        Object.assign(P, { x: 0, z: 3.6, y: 0, yaw: Math.PI, hp: 100, st: 100, stWait: 0, state: 'idle', t: 0, inv: false, heals, maxHeals: heals, dx: 0, dz: 0, knock: 1, struck: false, healed: false, guardAt: -9, flick: 0, vx: 0, vz: 0,
            move: '', go: 0, goScale: 1, chargeT: 0, released: true, charged: false, fromStrike: false, art: 0, combo: 0, done: {} });
        for (const k in want) want[k] = -9;
        guard(false); strike(false); heavyKey(false); held.roll = false; rollSprinted = false;
        hs = 0; hurtShown = 100; emptyFlash = 0; cres.on = false; camSm.ready = false;
        kick.set(0, 0, 0); fovKick = 0;
        wLegs = wUp = carryW = 0; planted = false;
        trail.n = 0; blade.has = false;
        if (trail.mesh) trail.mesh.visible = false;
        if (glint) glint.visible = ember.visible = crescent.visible = false;
        hero.stopAll();
        hero.mixer.timeScale = 1; animRate = 1;
        if (full && sword) sword.quaternion.identity();
        if (full) { P.lock = true; $('btnLock').classList.remove('off'); if (document.pointerLockElement) document.exitPointerLock(); }
    }
    // The first time a fight starts: measure the run and the sprint, and put a sword in their hand
    function begin() {
        if (!rigged) {
            rigged = true;
            RUN = kit.clipSpeed(hero, 'Jog_Fwd_Loop') * JOG_RATE;
            SPRINT = kit.clipSpeed(hero, 'Sprint_Loop') * SPRINT_RATE;
            armHero();
        }
        reset(true);
        show(true);
    }
    function show(visible) {
        $('me').hidden = !visible;
        $('pad').hidden = !visible || !touch;
        if (!visible) { letGo(); if (document.pointerLockElement) document.exitPointerLock(); }
    }
    // Whether the visitor is touching the controls (to put the controls card away early)
    const touched = () => keys.size > 0 || stick.id !== null || held.strike || held.guard || ctx.time() - Math.max(want.light, want.roll, want.heavy) < 0.3 || bots.on;
    function bot(enabled = true, skill = 0.9, parry = false) { bots.on = enabled; bots.skill = skill; bots.parry = parry; if (!enabled) { held.roll = held.heavy = false; } }

    return {
        state: P, update, place, camera, pose, receive, reset, begin, show, touched, bot,
        get sword() { return sword; },
        // For testing: the moves, starting one by hand, and the live pose
        debug: { MOVE, POSE, feet, get blade() { return blade; }, start: (name, yaw = P.yaw) => startMove(name, yaw), cur, get w() { return { legs: wLegs, up: wUp }; } }
    };
}
