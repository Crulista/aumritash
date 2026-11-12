// Phase I: THE WATCHER. A tall hollow figure with many red eyes, carrying a scythe. The keeper of an archive: of what
// was built, and of what collapsed.
// Its moves are authored as poses over time (where its hand is, where the scythe points, how its body turns and
// bends); its arms are solved to hold the scythe, so body and weapon always move as one. A blow lands only where the
// blade actually passes, and the mark on the ground is drawn from that same blade path (including any step or spin
// the move makes).
//   Scythe:  a three-hit combo (sweep, backhand, a spinning overhead whose last blow is held back to catch early
//            rolls), a lone sweep, an overhead slam with a shockwave, a long narrow thrust with a step, a lunge across
//            the roof into a backhand, an unblockable reap that hooks behind the visitor and drags them in, and a burst
//            that throws them off when they hug it.
//   Ranged:  a volley of its own eyes, which leave its body and come looking.
// Some wind-ups are held a beat longer at random, so it cannot be beaten on rhythm alone.
// Posture: hits and parries fill it, it drains when the Watcher is left alone; when full the Watcher is thrown open
// (staggered) and a riposte is worth more. Its eyes are its health: they close as it loses.
// Falling sends the visitor back to the start of this form.
//
// Its body, scythe, crown, eyes, haze and light are built by the page (the reveal on the roof animates them before the
// fight), and handed over as ctx.parts.watcher:
//   { body,            the character: { root, mixer, actions, play, stopAll }; its root is a child of the arena
//     bones,           its bones by name: Head, neck_01, spine_01..03, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r
//     scythe, edge,    the scythe group (modelled along -x, shaft up +y, its origin at the heel) and its glowing edge
//     eyes, gaze,      the eye pairs that make up its body, and its own two eyes
//     crown, aura,     the fan of spines behind its shoulders, and the red haze behind it
//     glow, clip,      the red light at its face, and the clipping plane that hides its body above a height
//     lean,            the scythe's resting lean
//     grip,            how far up the shaft its hand closes (body units)
//     home,            where it stands at the start (a Vector3, arena coordinates)
//     small, big,      its height scale when it first stands up, and after it changes
//     reach(v) }       get (no argument) or set how far its arms are stretched; the page reapplies it after the animation
// Pose numbers are in the body's own units (it stands about 1.5 tall before scaling), in a frame where z is ahead of
// it and its right hand is on the -x side.
//
// What this file adds to the roof (and removes in dispose): a ring of eyes out in the dark around the tower (one
// instanced mesh), cracks in the stone, and the shards it breaks into at the end. When it is beaten the scythe is left
// standing in the stone where it fell, as set dressing for the next form (the page's own scythe; not removed).

// ── Its poses ──
const POSE = {
    rest:    { hand: [-0.32, 0.98, 0.22], dir: [0.14, 1, 0.06], edge: [1, 0, 0], twist: 0, bend: 0.05, crouch: 0.15, left: null },
    cast:    { hand: [-0.3, 1.78, 0.12], dir: [0, 1, 0.05], edge: [1, 0, 0], twist: 0, bend: -0.2, crouch: 0, left: [0.34, 1.5, 0.5] },
    roar:    { hand: [-0.62, 1.2, -0.08], dir: [-0.9, 0.42, 0], edge: [0, 0, 1], twist: 0, bend: -0.38, crouch: 0.25, left: [0.62, 1.2, -0.08] },
    gather:  { hand: [-0.2, 1.0, 0.3], dir: [0.3, 0.9, 0.1], edge: [1, 0, 0], twist: 0, bend: 0.45, crouch: 0.95, left: [0.2, 0.95, 0.3] },
    stagger: { hand: [-0.6, 1.55, -0.3], dir: [-0.5, 0.7, -0.5], edge: [1, 0, 0], twist: -0.5, bend: -0.5, crouch: 0.7, left: null },
    recoil:  { hand: [-0.5, 1.4, -0.15], dir: [-0.3, 0.85, -0.35], edge: [1, 0, 0], twist: -0.35, bend: -0.32, crouch: 0.45, left: null },
    low:     { hand: [-0.1, 0.92, 0.45], dir: [0.55, 0.2, 0.8], edge: [0, 1, 0], twist: 0.95, bend: 0.4, crouch: 0.9, left: 'shaft' },
    // The intro: lifts the scythe a little, then drives its heel into the stone
    lift:    { hand: [-0.3, 1.34, 0.26], dir: [0.06, 1, 0.05], edge: [1, 0, 0], twist: 0.05, bend: -0.12, crouch: 0.05, left: null },
    plant:   { hand: [-0.3, 0.9, 0.26], dir: [0.06, 1, 0.05], edge: [1, 0, 0], twist: 0, bend: 0.12, crouch: 0.35, left: null },
    // The end: thrown back, arms wide, every eye open
    dying:   { hand: [-0.75, 1.5, -0.2], dir: [-0.6, 0.75, -0.3], edge: [0, 0, 1], twist: -0.2, bend: -0.55, crouch: 0.5, left: [0.7, 1.45, -0.15] }
};
// Shared key poses, so one move can flow into the next
const SWEEP_END = { hand: [0.05, 1.0, 0.5], dir: [0.5, 0.05, 0.85], edge: [0.85, 0, -0.5], twist: 1.3, bend: 0.15, crouch: 0.4, left: null };
const BACK_END = { hand: [-0.5, 1.05, -0.1], dir: [-0.8, 0.1, -0.6], edge: [0.6, 0, -0.8], twist: -1.15, bend: 0.05, crouch: 0.35, left: null };
const OVERHEAD = { hand: [-0.2, 1.88, -0.12], dir: [0, 0.75, -0.65], edge: [0, -0.65, -0.75], twist: -0.12, bend: -0.34, crouch: 0, left: 'shaft' };
const BURIED = { hand: [-0.1, 0.85, 0.62], dir: [0, -0.22, 1], edge: [0, -1, -0.22], twist: 0, bend: 0.58, crouch: 0.65, left: 'shaft' };

// A move is a list of [time, pose, ease]; 'in' snaps into the pose (a strike), 'out' settles into it.
//   lock      until when it keeps turning to face the visitor
//   active    when the blade can hurt; dmg how much
//   hold      a time in the wind-up where it may stop for an extra beat (chosen at random each time)
//   chain     when the next move of a combo takes over (its first key matches this move's pose at that time)
//   step      [from, to, distance]: it steps forward this far (arena units) while striking
//   spin      [from, to]: it turns a full circle on the spot
//   wave      a shockwave where the blade lands; radius how near the blade has to pass (seen from above)
//   unblockable / pull: the reap's hook (cannot be guarded or parried; drags the visitor in)
const MOVE = {
    // Draws the scythe back to its right, then cuts flat through everything in front of it, right to left
    sweep: { lock: 0.6, hold: 0.62, active: [0.86, 1.04], total: 2.15, dmg: 26, chain: 1.4, keys: [
        [0, POSE.rest],
        [0.8, { hand: [-0.5, 1.15, -0.15], dir: [-0.8, 0.35, -0.5], edge: [0.5, 0, -0.85], twist: -1.0, bend: -0.05, crouch: 0.35, left: null }, 'out'],
        [0.9, { hand: [-0.55, 0.95, 0.35], dir: [-0.75, -0.1, 0.65], edge: [0.65, 0, 0.75], twist: 0.05, bend: 0.15, crouch: 0.5, left: null }, 'in'],
        [1.02, { hand: [-0.25, 0.9, 0.55], dir: [0.15, -0.1, 1], edge: [1, 0, -0.15], twist: 1.1, bend: 0.2, crouch: 0.5, left: null }],
        [1.4, SWEEP_END, 'out'],
        [2.15, POSE.rest]
    ] },
    // The same cut coming back the other way: it rolls the blade over the top, then a backhand, left to right
    back: { lock: 0.3, active: [0.5, 0.66], total: 1.85, dmg: 24, chain: 1.05, keys: [
        [0, SWEEP_END],
        [0.26, { hand: [0.1, 1.22, 0.42], dir: [0.55, 0.35, 0.75], edge: [0, 1, 0.1], twist: 1.45, bend: 0.05, crouch: 0.42, left: null }, 'out'],
        [0.44, { hand: [0.08, 1.05, 0.48], dir: [0.6, 0.12, 0.75], edge: [-0.8, 0, 0.6], twist: 1.4, bend: 0.1, crouch: 0.45, left: null }, 'out'],
        [0.54, { hand: [-0.45, 0.95, 0.45], dir: [-0.55, -0.1, 0.83], edge: [-0.83, 0, -0.55], twist: 0.1, bend: 0.2, crouch: 0.5, left: null }, 'in'],
        [0.66, { hand: [-0.55, 0.98, 0.05], dir: [-0.85, -0.06, -0.5], edge: [0.5, 0, -0.85], twist: -1.0, bend: 0.12, crouch: 0.45, left: null }],
        [1.05, BACK_END, 'out'],
        [1.85, POSE.rest]
    ] },
    // The end of the combo: it whirls the scythe round over its head in a full turn, raises it high in both hands,
    // waits (the wait catches a roll made too early), and brings it down with a shockwave
    spin: { lock: 1.0, active: [1.42, 1.56], total: 3.1, dmg: 34, spin: [0.12, 0.82], wave: { r0: 0.6, max: 7.5, dmg: 14 }, keys: [
        [0, BACK_END],
        [0.2, { hand: [-0.3, 1.72, 0.05], dir: [-0.95, 0.25, 0.05], edge: [0, -0.2, -1], twist: -0.2, bend: -0.15, crouch: 0.25, left: null }, 'out'],
        [0.78, { hand: [-0.25, 1.78, 0.1], dir: [-0.9, 0.35, 0.2], edge: [0.1, -0.3, -1], twist: 0.1, bend: -0.2, crouch: 0.2, left: null }],
        [1.12, OVERHEAD, 'out'],
        [1.34, { hand: [-0.18, 1.94, -0.18], dir: [0, 0.7, -0.7], edge: [0, -0.7, -0.7], twist: -0.1, bend: -0.4, crouch: 0.05, left: 'shaft' }],
        [1.5, BURIED, 'in'],
        [2.25, { hand: [-0.1, 0.86, 0.6], dir: [0, -0.2, 1], edge: [0, -1, -0.2], twist: 0, bend: 0.52, crouch: 0.6, left: 'shaft' }],
        [3.1, POSE.rest]
    ] },
    // Lifts the scythe overhead in both hands and brings it straight down; it stays buried a moment
    slam: { lock: 0.66, hold: 0.86, active: [0.94, 1.12], total: 2.6, dmg: 34, wave: { r0: 0.6, max: 10, dmg: 16 }, keys: [
        [0, POSE.rest],
        [0.9, OVERHEAD, 'out'],
        [1.07, BURIED, 'in'],
        [1.7, BURIED],
        [2.6, POSE.rest]
    ] },
    // Draws the scythe back low at its hip, blade up, then drives the whole length of it forward with a step: long,
    // narrow and fast
    thrust: { lock: 0.62, hold: 0.62, active: [0.8, 0.95], total: 2.25, dmg: 26, radius: 0.72, step: [0.72, 0.9, 2.2], keys: [
        [0, POSE.rest],
        [0.62, { hand: [-0.42, 1.08, -0.32], dir: [0.12, 0.06, 1], edge: [0, 1, 0.05], twist: -0.8, bend: -0.08, crouch: 0.55, left: 'shaft' }, 'out'],
        [0.86, { hand: [-0.14, 1.06, 0.82], dir: [0.03, -0.03, 1], edge: [0, 1, 0.05], twist: 0.32, bend: 0.36, crouch: 0.72, left: 'shaft' }, 'in'],
        [1.4, { hand: [-0.16, 1.04, 0.76], dir: [0.04, -0.05, 1], edge: [0, 1, 0.05], twist: 0.28, bend: 0.32, crouch: 0.7, left: 'shaft' }],
        [2.25, POSE.rest, 'out']
    ] },
    // The reap: lifts the scythe high and leans out until the blade hangs far beyond the visitor, drops it behind them
    // and rakes it back. It cannot be guarded or parried, and it drags whoever it catches to its feet. Roll through it.
    reap: { lock: 1.0, hold: 0.96, active: [1.16, 1.42], total: 2.7, dmg: 30, unblockable: true, pull: 2.4, keys: [
        [0, POSE.rest],
        [0.55, { hand: [-0.22, 1.86, 0.22], dir: [-0.2, 0.85, 0.48], edge: [1, 0.1, 0.2], twist: -0.3, bend: -0.28, crouch: 0.15, left: 'shaft' }, 'out'],
        [0.96, { hand: [-0.2, 1.72, 0.55], dir: [-0.32, 0.45, 1], edge: [1, 0, 0.25], twist: 0.05, bend: 0.12, crouch: 0.3, left: 'shaft' }, 'out'],
        [1.14, { hand: [-0.16, 1.22, 0.8], dir: [-0.34, -0.28, 1], edge: [1, -0.1, 0.1], twist: 0.18, bend: 0.46, crouch: 0.55, left: 'shaft' }, 'in'],
        [1.42, { hand: [-0.32, 0.98, 0.18], dir: [-0.42, -0.18, 0.9], edge: [1, 0, 0.3], twist: -0.25, bend: 0.12, crouch: 0.72, left: 'shaft' }, 'in'],
        [1.95, { hand: [-0.34, 1.0, 0.16], dir: [-0.4, -0.12, 0.9], edge: [1, 0, 0.3], twist: -0.2, bend: 0.1, crouch: 0.65, left: 'shaft' }],
        [2.7, POSE.rest, 'out']
    ] }
};
const HP = 130;                     // its health (a light hit does 4): about a minute and a half for most visitors
const BLADE = 0.95;                 // how near the blade (seen from above) has to pass to count
const MARK_EXTENT = 3.6;            // half the width of a ground mark's picture, in body units
const REACHED = 1.32;               // how far its arms are stretched once it has changed
const TAU = Math.PI * 2;
let WALK = 0;                       // how fast its walk clip covers ground, measured once
const traced = new WeakMap();       // the ground marks (and the blade paths behind them), traced once per arena

// What it says. Cold, judging; it speaks of what was built and what collapsed.
const LINES = {
    intro: ['I KEEP WHAT WAS BUILT.', 'AND WHAT COLLAPSED.', 'NOTHING LEAVES THE ARCHIVE.', 'NOW I KEEP YOU.'],
    hit: ['ANOTHER RUIN.', 'BUILT TO FALL.', 'IT ALL COMES DOWN.', 'FILED AWAY.'],
    parried: ['A CRACK. NOTHING MORE.', 'YOU HOLD. FOR NOW.', 'EVERY WALL HOLDS ONCE.'],
    broken: ['IT STANDS. IT WILL NOT.', 'STILL STANDING. FOR NOW.'],
    fell: ['INTO THE ARCHIVE.', 'ABANDONED. LIKE THE REST.', 'ANOTHER UNFINISHED THING.', 'I KEEP THIS ONE TOO.'],
    again: ['I REMEMBER YOUR LAST ATTEMPT.', 'THE RECORD IS PATIENT.'],
    half: 'I HAVE OUTLASTED BETTER.',
    low: 'WHAT WAS BUILT ALWAYS FALLS.',
    end: ['THIS TOO COLLAPSES.', 'WE STILL WATCH.']
};

export function create(ctx) {
    const { THREE, kit, sfx } = ctx;
    const { mix, clamp01, toward, angDiff, nearSeg, readPose, blendPose, movePose, blank, turnWorld, reachFor, setOpen, ease } = kit;
    const W = ctx.parts.watcher;
    const watcher = W.body, bones = W.bones, ARENA = ctx.ARENA;
    const BEAST = W.big, GRIP = W.grip, SHAFT = 2.3 - GRIP;     // from its hand up to the top of the shaft
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const UPV = V(0, 1, 0);
    // Extra sounds the score may offer; falls back to the house sounds when it does not
    const sx = (name, ...a) => { const s = ctx.score; if (s && typeof s[name] === 'function') { try { s[name](...a); return true; } catch (e) { /* not ours to break */ } } return false; };

    // ── Its state ──
    let B = null;                   // where it is and what it is doing
    const pose = blank(), poseTo = blank();
    const at = { x: 0, z: 0, yaw: 0 };        // where the body is posed this frame (its yaw includes any spin)
    let poseRate = 8, size = BEAST, crown = 1, scythe = 1, gaze = 1, hot = 0, cut = 0, flare = 0, reapGlow = 0;
    let fighting = false, age = 0, swing = 0, swingId = 'watcher:0', posture = 0, calm = 0, barkT = 0, said = {}, falls = 0;
    let lastMode = '';
    const mark = { on: false, name: '', x: 0, z: 0, yaw: 0, k: 0 };
    const away = new Float32Array(W.eyes.length);        // eyes that have left its body for a volley, and for how long
    const later = [];                                    // lines to say after a moment: [seconds, text]
    function fresh() {
        B = { x: W.home.x, z: W.home.z, yaw: 0, spin: 0, hp: HP, state: 'idle', move: null, t: 0, cool: 1.6, last: '', flinch: 0, tx: 0, tz: 0, vx: 0, vz: 0, ox: 0, oz: 0, did: {}, n: 0, walk: 0, run: 0, queue: [], extra: 0, stepPh: 0, shudder: 0 };
        readPose(POSE.rest, pose); readPose(POSE.rest, poseTo); poseRate = 8;
        size = BEAST; crown = 1; scythe = 1; gaze = 1; hot = 0; cut = 0; flare = 0; reapGlow = 0;
        posture = 0; calm = 0; mark.on = false; away.fill(0); later.length = 0;
        at.x = B.x; at.z = B.z; at.yaw = B.yaw;
        newSwing();
    }
    // Its posture is broken: thrown open for a riposte. The posture bar drains back down while it recovers.
    function throwOpen() {
        B.state = 'stagger'; B.move = null; B.t = 0; B.did = {}; B.queue.length = 0; B.spin = 0;
        posture = 100; mark.on = false; cut = 0; newSwing();
        sfx.roar(1.2); ctx.shake(0.5);
        bark('broken', 0.35, 0.9);
    }
    function newSwing() { swingId = 'watcher:' + (++swing); }
    function say(text, seconds = 2.2, delay = 0) { if (delay > 0) later.push([delay, text, seconds]); else ctx.line(text, seconds); }
    // A bark from a list, not too often, never the same twice running
    function bark(kind, chance = 1, delay = 0) {
        if (barkT > 0 || ctx.rand() > chance) return;
        const list = LINES[kind];
        let i = Math.floor(ctx.rand() * list.length);
        if (said[kind] === i) i = (i + 1) % list.length;
        said[kind] = i;
        barkT = 7;
        say(list[i], 2, delay);
    }

    // From here its body is driven directly: stances blended by weight, with the arms and scythe posed on top
    const STANCES = ['Idle_Loop', 'Crouch_Idle_Loop', 'Walk_Loop', 'Sprint_Loop'];
    watcher.stopAll();
    watcher.mixer.timeScale = 1;
    if (!WALK) WALK = kit.clipSpeed(watcher, 'Walk_Loop');
    // clipSpeed stops everything; start the stances again
    for (const n of STANCES) watcher.actions[n].reset().setEffectiveWeight(n === 'Idle_Loop' ? 1 : 0).play();
    const WALK_CYCLE = watcher.actions.Walk_Loop.getClip().duration;

    // ── Rig: put the body into a pose (after its animation has run) and hang the scythe in its hand ──
    // Leaves the blade's three points in rig.hand / rig.top / rig.tip, in arena coordinates.
    const rig = { hand: V(), top: V(), tip: V(), m: new THREE.Matrix4(), x: V(), z: V(), tw: new THREE.Quaternion(), bd: new THREE.Quaternion(), right: V(), tgt: V(), d: V(), e: V(), lt: V(), pole: V() };
    function poseWatcher(p, where, sz, scytheScale) {
        const yaw = where.yaw;
        watcher.root.updateMatrixWorld(true);
        // Body: turn at the waist and chest, bend at the waist
        rig.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        turnWorld(bones.spine_01, rig.tw.setFromAxisAngle(UPV, p.twist * 0.5));
        turnWorld(bones.spine_01, rig.bd.setFromAxisAngle(rig.right, p.bend));
        turnWorld(bones.spine_03, rig.tw);
        // A point given in the turned-and-bent body's frame, moved out into the world
        const place = (v, out, isDir) => {
            out.copy(v);
            if (!isDir) out.y -= 0.85;
            out.applyAxisAngle(rig.x.set(1, 0, 0), p.bend).applyAxisAngle(UPV, p.twist);
            if (!isDir) { out.y += 0.85; out.multiplyScalar(sz); }
            out.applyAxisAngle(UPV, yaw);
            if (!isDir) { out.x += where.x; out.z += where.z; ctx.toWorld(out); }
            return out;
        };
        place(p.hand, rig.tgt);
        place(p.dir, rig.d, true).normalize();
        place(p.edge, rig.e, true);
        reachFor(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, rig.tgt, rig.pole.set(0, -1, 0).addScaledVector(rig.right, -0.5));
        // The scythe hangs from where the hand actually got to
        bones.hand_r.getWorldPosition(rig.hand);
        rig.e.addScaledVector(rig.d, -rig.e.dot(rig.d));
        if (rig.e.lengthSq() < 1e-6) rig.e.set(-rig.d.z, 0, rig.d.x);             // never let the blade lose its way
        rig.e.normalize();                                                      // blade square to the shaft
        rig.x.copy(rig.e).negate();                                             // the blade is modelled along -x
        rig.z.crossVectors(rig.x, rig.d);
        if (scytheScale > 0) {
            W.scythe.quaternion.setFromRotationMatrix(rig.m.makeBasis(rig.x, rig.d, rig.z));
            W.scythe.position.copy(rig.hand).addScaledVector(rig.d, -GRIP * sz);
            ctx.toArena(W.scythe.position);
            W.scythe.scale.setScalar(Math.max(0.001, scytheScale * sz));
        }
        if (p.left) {
            if (p.left === 'shaft') rig.lt.copy(rig.hand).addScaledVector(rig.d, -0.42 * sz);
            else place(rig.x.fromArray(p.left), rig.lt);
            reachFor(bones.upperarm_l, bones.lowerarm_l, bones.hand_l, rig.lt, rig.pole.set(0, -1, 0).addScaledVector(rig.right, 0.5));
        }
        rig.top.copy(rig.hand).addScaledVector(rig.d, SHAFT * sz);
        rig.tip.copy(rig.top).addScaledVector(rig.e, 1.3 * sz).addScaledVector(rig.d, -0.5 * sz);
        ctx.toArena(rig.hand); ctx.toArena(rig.top); ctx.toArena(rig.tip);
    }

    // A move's own step forward and spin, at time t
    const stepAt = (move, t) => (move.step ? move.step[2] * ease((t - move.step[0]) / (move.step[1] - move.step[0])) : 0);
    const spinAt = (move, t) => { if (!move.spin) return 0; const k = (t - move.spin[0]) / (move.spin[1] - move.spin[0]); return k <= 0 || k >= 1 ? 0 : TAU * ease(k); };

    // ── Ground marks: run each scythe move once on the real body, trace where the blade goes over the ground ──
    // The same blade test decides hits, so what is marked is exactly what is dangerous. The paths are kept as well,
    // so the test bot can ask whether a spot is about to be cut.
    let marks = traced.get(ctx.arena);
    if (!marks) {
        marks = {};
        const where = { x: 0, z: 0, yaw: 0 }, p = blank(), s = V();
        watcher.root.scale.setScalar(BEAST);
        // Its arms as they are once it has changed (the page reapplies this every frame after the animation)
        const was = W.reach();
        W.reach(REACHED);
        const arms = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'].map(n => bones[n]);
        const vis = W.scythe.visible;
        for (const [name, move] of Object.entries(MOVE)) {
            const segs = [];
            for (let i = 0; i <= 18; i++) {
                const t = mix(move.active[0], move.active[1], i / 18);
                where.z = stepAt(move, t); where.yaw = spinAt(move, t);
                watcher.root.position.set(0, 0, where.z);
                watcher.root.rotation.set(0, where.yaw, 0);
                watcher.mixer.update(0);
                for (const b of arms) b.scale.setScalar(REACHED);
                poseWatcher(movePose(move, t, p), where, BEAST, 0);
                s.copy(rig.hand).lerp(rig.top, 0.45);
                segs.push([s.x / BEAST, s.z / BEAST, rig.top.x / BEAST, rig.top.z / BEAST], [rig.top.x / BEAST, rig.top.z / BEAST, rig.tip.x / BEAST, rig.tip.z / BEAST]);
            }
            const radius = (move.radius || BLADE) / BEAST;
            marks[name] = { h: ctx.mark.trace(segs, radius, MARK_EXTENT), segs, radius };
        }
        W.scythe.visible = vis;
        W.reach(was);
        watcher.root.rotation.set(0, 0, 0);
        traced.set(ctx.arena, marks);
    }
    // Is a point (arena coordinates) inside the traced path of the move being marked?
    function inMark(x, z, pad) {
        const m = marks[mark.name];
        if (!m) return false;
        const dx = x - mark.x, dz = z - mark.z, c = Math.cos(mark.yaw), s = Math.sin(mark.yaw);
        const lx = (dx * c - dz * s) / size, lz = (dx * s + dz * c) / size, r = m.radius + pad / size;
        for (const g of m.segs) { _a.x = g[0]; _a.z = g[1]; _b.x = g[2]; _b.z = g[3]; if (nearSeg(lx, lz, _a, _b) < r) return true; }
        return false;
    }
    const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 };

    // ═════════════ Things it adds to the roof ═════════════
    // ── Eyes out in the dark, all round the tower: one instanced mesh of eye-pair quads, turned to the camera ──
    function pairTexture() {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 32;
        const g = c.getContext('2d');
        for (const cx of [17, 47]) {
            g.save();
            g.translate(cx, 16);
            g.scale(1, 0.5);
            const grd = g.createRadialGradient(0, 0, 0, 0, 0, 14);
            grd.addColorStop(0, 'rgba(255,255,255,1)');
            grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
            g.restore();
        }
        return new THREE.CanvasTexture(c);
    }
    const DARK_N = 84;
    const darkMat = new THREE.MeshBasicMaterial({ map: pairTexture(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const darkMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.5), darkMat, DARK_N);
    darkMesh.frustumCulled = false;
    darkMesh.renderOrder = 2;
    const dark = [];
    {
        let seed = 7;
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < DARK_N; i++) {
            const a = (i / DARK_N) * TAU + (r() - 0.5) * 0.3, rr = 16 + r() * 16;
            dark.push({ x: Math.cos(a) * rr, y: -10 + r() * 22, z: Math.sin(a) * rr, size: rr / 6 * (0.7 + r() * 0.7), open: 0, lag: 0.4 + r() * 2.2, blink: r() * 20, look: (r() - 0.5) * 2 });
        }
    }
    const _col = new THREE.Color(), _m4 = new THREE.Matrix4(), _p3 = V(), _s3 = V(), _q = new THREE.Quaternion();
    for (let i = 0; i < DARK_N; i++) { darkMesh.setColorAt(i, _col.setRGB(0, 0, 0)); darkMesh.setMatrixAt(i, _m4.makeScale(0.001, 0.001, 0.001)); }
    ctx.arena.add(darkMesh);
    // How the eyes in the dark are: open (0..1), turned to the roof (0 looking away, 1 straight at it), bright
    const DK = { open: 0, turn: 0, bright: 0.5, flare: 0 };
    function darkFrame(dt) {
        ctx.camera.getWorldQuaternion(_q);
        for (let i = 0; i < DARK_N; i++) {
            const e = dark[i];
            // Each follows the call a little late; and now and then one blinks
            e.blink -= dt;
            if (e.blink < 0) e.blink = 6 + (i * 7.31) % 9;
            const blink = e.blink < 0.16 ? 0.1 : 1;
            e.open = toward(e.open, DK.open * blink, e.blink < 0.16 ? 30 : 1.5 + 3 / e.lag, dt);
            // Looking away, a pair is seen side-on: its two eyes close together and to one side
            const turned = clamp01(DK.turn * 1.2 - e.lag * 0.08);
            const sx = e.size * mix(0.32, 1, turned), sy = e.size * Math.max(0.02, e.open);
            const pull = 1 - 0.1 * turned;
            _p3.set(e.x * pull + e.look * (1 - turned) * e.size, e.y, e.z * pull);
            darkMesh.setMatrixAt(i, _m4.compose(_p3, _q, _s3.set(sx, sy, 1)));
            const k = Math.min(1.25, (DK.bright * mix(0.45, 1, turned) + DK.flare) * e.open);
            darkMesh.setColorAt(i, _col.setRGB(k, k * 0.05 + Math.max(0, k - 1) * 0.3, k * 0.04 + Math.max(0, k - 1) * 0.2));
        }
        darkMesh.instanceMatrix.needsUpdate = true;
        if (darkMesh.instanceColor) darkMesh.instanceColor.needsUpdate = true;
        DK.flare = toward(DK.flare, 0, 1.5, dt);
    }

    // ── Cracks in the stone: where its scythe strikes the roof. A few, reused. ──
    function crackTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        let seed = 3;
        const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const paths = [];
        for (let i = 0; i < 9; i++) {
            const a0 = (i / 9) * TAU + (r() - 0.5) * 0.5;
            let x = 64, y = 64, a = a0;
            const pts = [[x, y]];
            const len = 26 + r() * 34;
            for (let d = 0; d < len; d += 6) { a += (r() - 0.5) * 0.8; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
            paths.push(pts);
            if (r() < 0.6) { const [bx, by] = pts[Math.floor(pts.length / 2)]; const b = a0 + (r() < 0.5 ? 0.7 : -0.7); paths.push([[bx, by], [bx + Math.cos(b) * 14, by + Math.sin(b) * 14], [bx + Math.cos(b + 0.3) * 24, by + Math.sin(b + 0.3) * 24]]); }
        }
        const stroke = (style, w) => { g.strokeStyle = style; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; for (const p of paths) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]); g.stroke(); } };
        stroke('rgba(0,0,0,0.9)', 4.5);
        stroke('rgba(255,60,30,1)', 1.4);
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.beginPath(); g.arc(64, 64, 7, 0, TAU); g.fill();
        const t = new THREE.CanvasTexture(c);
        t.magFilter = THREE.NearestFilter;
        return t;
    }
    const crackTex = crackTexture();
    // A red light that flares up out of a fresh crack (kept in the scene at zero, so adding it costs nothing later)
    const ember = new THREE.PointLight('#ff3a1a', 0, 9, 1.6);
    ember.position.set(0, -20, 0);
    ctx.arena.add(ember);
    let emberK = 0;
    const CRACKS = Array.from({ length: 4 }, () => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.046;
        m.visible = false;
        ctx.arena.add(m);
        return { m, t: 0, life: 0 };
    });
    let crackNext = 0;
    function crack(x, z, r, life = 9) {
        const c = CRACKS[crackNext++ % CRACKS.length];
        c.m.position.x = x; c.m.position.z = z;
        c.m.rotation.z = ctx.rand() * TAU;
        c.m.scale.set(r * 2, r * 2, 1);
        c.m.visible = true;
        c.t = 0; c.life = life;
        ember.position.set(x, 0.6, z);
        emberK = 1;
        return c;
    }
    function cracksFrame(dt) {
        emberK = toward(emberK, 0, 1.4, dt);
        ember.intensity = emberK * 9;
        for (const c of CRACKS) {
            if (!c.m.visible) continue;
            c.t += dt;
            // The red in the crack cools first; then the crack itself fades unless it is kept
            const heat = Math.max(0, 1 - c.t / 2.5);
            c.m.material.color.setRGB(0.45 + heat * 0.55, 0.4 + heat * 0.6, 0.4 + heat * 0.6);
            c.m.material.opacity = c.life === Infinity ? 1 : clamp01((c.life - c.t) / 2);
            if (c.t > c.life) c.m.visible = false;
        }
    }

    // ── Shards: what is left of its body when it comes apart ──
    const SHARD_N = 70, shardPos = new Float32Array(SHARD_N * 3), shardCol = new Float32Array(SHARD_N * 3);
    const shardGeo = new THREE.BufferGeometry();
    shardGeo.setAttribute('position', new THREE.BufferAttribute(shardPos, 3));
    shardGeo.setAttribute('color', new THREE.BufferAttribute(shardCol, 3));
    const shardPts = new THREE.Points(shardGeo, new THREE.PointsMaterial({ size: 0.26, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
    shardPts.frustumCulled = false;
    shardPts.visible = false;
    ctx.arena.add(shardPts);
    const shards = Array.from({ length: SHARD_N }, () => ({ vx: 0, vy: 0, vz: 0, life: 0, r: 0, g: 0, b: 0 }));

    fresh();

    // ═════════════ Fighting ═════════════
    // ── Choosing what to do next ──
    function pick(dist) {
        const opts = [];
        const add = (name, w) => { if (name !== B.last) opts.push([name, w]); };
        if (dist < 3.4) add('burst', 3.5);                         // too close for the scythe: it throws them off
        if (dist < 7.4) { add('combo', 3.2); add('slam', 1.6); add('sweep', 1.1); }
        if (dist > 3 && dist < 7) add('reap', 1.9);
        if (dist > 4.4 && dist < 9.6) add('thrust', 2.2);
        if (dist >= 6) { add('lunge', 2.4); add('volley', 2.2); }
        if (!opts.length) return 'sweep';
        let roll = ctx.rand() * opts.reduce((s, o) => s + o[1], 0);
        for (const [name, w] of opts) { roll -= w; if (roll <= 0) return name; }
        return opts[0][0];
    }

    // Time within a move, with any held beat taken out
    const moveT = (move, t) => (!move.hold || t < move.hold ? t : t < move.hold + B.extra ? move.hold : t - B.extra);

    // ── Deciding and moving, every frame (before the animation) ──
    function think(dt) {
        const P = ctx.P;
        const dx = P.x - B.x, dz = P.z - B.z, dist = Math.hypot(dx, dz) || 1, aim = Math.atan2(dx, dz);
        const face = rate => { B.yaw += angDiff(aim, B.yaw) * Math.min(1, dt * rate); };
        const first = key => { if (B.did[key]) return false; B.did[key] = true; return true; };
        const begin = (state, move) => {
            B.state = state; B.move = move || null; B.t = 0; B.did = {}; B.last = state; B.n = 0; B.spin = 0;
            B.ox = B.x; B.oz = B.z;
            const m = MOVE[move];
            // Some wind-ups are held a beat longer
            B.extra = m && m.hold && ctx.rand() < 0.4 ? 0.22 + ctx.rand() * 0.3 : 0;
            newSwing();
        };
        const settle = (k = 1) => { B.state = 'idle'; B.move = null; B.t = 0; B.cool = (0.4 + ctx.rand() * 0.7) * k; B.queue.length = 0; B.spin = 0; mark.on = false; };
        const hold = (name, rate = 9) => { readPose(POSE[name], poseTo); poseRate = rate; };
        const markAt = (name, x, z, yaw, k) => { mark.on = true; mark.name = name; mark.x = x; mark.z = z; mark.yaw = yaw; mark.k = k; };
        B.t += dt;
        B.flinch = toward(B.flinch, 0, 5, dt);
        B.shudder = toward(B.shudder, 0, 3, dt);
        hot = 0;
        reapGlow = toward(reapGlow, 0, 4, dt);
        let walking = 0, running = 0;
        // Lines waiting their turn
        barkT -= dt;
        for (let i = later.length - 1; i >= 0; i--) { later[i][0] -= dt; if (later[i][0] <= 0) { ctx.line(later[i][1], later[i][2]); later.splice(i, 1); } }
        // Its posture drains when it is left alone
        calm += dt;
        if (calm > 1.6 && B.state !== 'stagger') posture = Math.max(0, posture - 15 * dt);
        // The eyes that left for a volley come home
        for (let i = 0; i < away.length; i++) if (away[i] > 0) away[i] -= dt;

        // The visitor has fallen: it stands over them, and every eye in the dark opens on them
        if (ctx.mode === 'dead' && lastMode !== 'dead') {
            falls++;
            DK.flare = 1.2; DK.turn = 1;
            barkT = 0;
            if (falls === 1 && ctx.heroName) say(`${ctx.heroName}. ABANDONED, LIKE THE REST.`, 2.4, 0.5);
            else bark('fell', 1, 0.5);
        }
        lastMode = ctx.mode;

        if (ctx.mode !== 'play' || !fighting) {
            if (ctx.mode === 'dead') { face(2); hold('rest', 4); cut = 0; mark.on = false; }
        } else if (B.state === 'idle') {
            face(3.2);
            hold('rest', 6);
            if (dist > 6.2) { const v = WALK * size * 0.62; B.x += dx / dist * v * dt; B.z += dz / dist * v * dt; walking = 1; }
            B.cool -= dt;
            if (B.cool <= 0) {
                const next = pick(dist);
                if (next === 'combo') {
                    begin('combo', 'sweep');
                    // Usually all three; sometimes it stops after two, so the third cannot be counted on
                    B.queue = ctx.rand() < 0.7 ? ['back', 'spin'] : ['back'];
                } else if (MOVE[next]) begin(next, next);
                else begin(next);
            }
        } else if (B.move) {
            // A scythe move: the pose comes from its keys, the mark from its traced path, the hit from the blade itself
            const move = MOVE[B.move], t = moveT(move, B.t);
            const holding = move.hold && B.t >= move.hold && B.t < move.hold + B.extra;
            if (t < move.lock) face(5);
            movePose(move, t, poseTo);
            // A held beat is not a frozen one: the arms tremble with the weight
            if (holding || (B.move === 'spin' && t > 1.12 && t < move.active[0])) poseTo.hand.y += Math.sin(age * 37) * 0.012;
            poseRate = 40;
            // Its step and its spin
            B.spin = spinAt(move, t);
            if (move.step) {
                const s = stepAt(move, t);
                B.x = B.ox + Math.sin(B.yaw) * s; B.z = B.oz + Math.cos(B.yaw) * s;
                if (t >= move.step[0] && first('kick')) ctx.dust(B.x, B.z, 6, '#5a4a44');
            } else { B.ox = B.x; B.oz = B.z; }
            hot = clamp01(t / move.active[0]) * (t < move.active[1] ? 1 : 0);
            if (t < move.active[1] + 0.1) markAt(B.move, B.ox, B.oz, B.yaw, clamp01(t / move.active[0])); else mark.on = false;
            cut = t >= move.active[0] && t <= move.active[1] ? move.dmg : 0;
            // The reap's tell: the edge burns and every eye on it opens wide
            if (move.unblockable && t < move.active[1]) {
                reapGlow = Math.max(reapGlow, clamp01(t / 0.5));
                if (first('tell')) { sfx.eye(1.4, 0); sfx.eye(1.1, 0.4); }
            }
            if (t >= move.active[0] - 0.05 && first('cut')) sfx.whoosh();
            if (move.wave && t >= move.active[1] && first('land')) {
                sfx.thud(); sfx.rumble(1.2); ctx.shake(0.7);
                ctx.haz.wave(Object.assign({ x: rig.tip.x, z: rig.tip.z }, move.wave));
                crack(rig.tip.x, rig.tip.z, 2.2);
                ctx.dust(rig.tip.x, rig.tip.z, 10, '#6a5a52');
            }
            // A combo flows into its next move; otherwise the move plays out
            if (B.queue.length && move.chain && t >= move.chain) {
                const next = B.queue.shift(), queue = B.queue;
                begin('combo', next);
                B.queue = queue;
                B.last = 'combo';
            } else if (t >= move.total) settle();
        } else if (B.state === 'lunge') {
            // Drops low, crosses the roof in a few strides, and arrives already cutting
            const wind = 0.62;
            hold('low', 9);
            if (B.t < wind) {
                face(6);
                const go = Math.max(0, dist - 4.2);
                B.tx = B.x + dx / dist * go; B.tz = B.z + dz / dist * go;
                markAt('back', B.tx, B.tz, B.yaw, B.t / wind * 0.6);
            } else if (B.t < wind + 0.42) {
                if (first('go')) { sfx.whoosh(); ctx.dust(B.x, B.z, 6, '#5a4a44'); B.vx = (B.tx - B.x) / 0.42; B.vz = (B.tz - B.z) / 0.42; }
                B.x += B.vx * dt; B.z += B.vz * dt;
                running = 1;
                markAt('back', B.tx, B.tz, B.yaw, 0.6);
            } else { begin('lunge', 'back'); B.last = 'lunge'; B.t = 0.3; B.extra = 0; }
        } else if (B.state === 'burst') {
            // Gathers itself in, then throws everything near it outwards
            const wind = 0.78;
            if (B.t < wind) { hold('gather', 8); hot = B.t / wind; flare = Math.max(flare, B.t / wind); }
            else {
                hold('roar', 22);
                if (first('out')) { sfx.thud(); sfx.rumble(1); ctx.shake(0.6); ctx.haz.wave({ x: B.x, z: B.z, r0: 1, max: 6, dmg: 16 }); ctx.dust(B.x, B.z, 12, '#6a5a52'); }
                if (B.t > wind + 1.1) settle();
            }
        } else if (B.state === 'volley') {
            // Some of its eyes leave its body and come looking
            const wind = 0.8, count = 5 + (B.hp < HP * 0.5 ? 2 : 0);
            face(3); hold('cast', 8);
            flare = Math.max(flare, clamp01(B.t / wind));
            if (B.t >= wind) {
                const n = Math.min(count, Math.floor((B.t - wind) / 0.24) + 1);
                while (B.n < n) {
                    B.n++;
                    // From one of its open eyes, which goes dark until it comes back
                    let from = null;
                    for (let k = 0; k < 8 && !from; k++) {
                        const i = Math.floor(ctx.rand() * W.eyes.length);
                        if (away[i] <= 0 && W.eyes[i].userData.open > 0.3) { from = W.eyes[i].position; away[i] = 2.4; }
                    }
                    const o = ctx.haz.orb({ x: from ? from.x : B.x, y: from ? from.y : 0.9 * size, z: from ? from.z : B.z, tx: P.x, ty: 1.2, tz: P.z, speed: 11.5, homing: 0.9, dmg: 11, life: 3 });
                    if (!o) break;
                    sfx.eye(1, 0);
                }
                if (B.t >= wind + count * 0.24 + 1) settle();
            }
        } else if (B.state === 'stagger') {
            // Thrown open: worth hitting
            hold('stagger', 16);
            cut = 0;
            posture = 100 * Math.max(0, 1 - B.t / 2.4);
            if (B.t > 2.4) { posture = 0; settle(0.6); }
        } else if (B.state === 'recoil') {
            // Its blow was turned aside: knocked back a step, the swing it was making is over
            hold('recoil', 18);
            cut = 0;
            if (B.t > 0.75) settle(0.5);
        }
        if (!B.move) { cut = 0; B.spin = toward(B.spin, 0, 10, dt); }
        B.walk = toward(B.walk, walking, 6, dt);
        B.run = toward(B.run, running, 14, dt);
        // Its footsteps are heavy
        if (B.walk > 0.3) {
            const ph = B.stepPh;
            B.stepPh += dt * 0.62 * 2 / WALK_CYCLE;
            if (Math.floor(B.stepPh) !== Math.floor(ph)) { if (!sx('footstep', 0.8)) sfx.step(); ctx.shake(0.12); }
        }
        // Keep it on the roof and off the brazier
        const r = Math.hypot(B.x, B.z);
        if (r > ARENA - 1) { B.x *= (ARENA - 1) / r; B.z *= (ARENA - 1) / r; B.ox = B.x; B.oz = B.z; }
        if (r < 2.4) { const k = 2.4 / (r || 1); B.x = (B.x || 0.01) * k; B.z *= k; B.ox = B.x; B.oz = B.z; }
        showMarks();
    }
    // The mark for a scythe move: the traced path of the blade, laid where the move began
    function showMarks() {
        for (const name in marks) {
            if (mark.on && mark.name === name) ctx.mark.show(marks[name].h, mark.x, mark.z, mark.yaw, size, mark.k);
            else ctx.mark.hide(marks[name].h);
        }
    }

    // Its stance: standing, crouched, walking or running, mixed by weight; feet keep pace with the ground
    function stance(dt) {
        blendPose(pose, poseTo, 1 - Math.exp(-poseRate * dt), pose);
        const A = watcher.actions;
        const move = Math.max(B.walk, B.run), crouch = pose.crouch * (1 - move);
        A.Walk_Loop.setEffectiveWeight(B.walk * (1 - B.run));
        A.Sprint_Loop.setEffectiveWeight(B.run);
        A.Crouch_Idle_Loop.setEffectiveWeight(crouch);
        A.Idle_Loop.setEffectiveWeight(Math.max(0, 1 - move - crouch));
        A.Walk_Loop.setEffectiveTimeScale(0.62);
        at.x = B.x + (B.shudder ? Math.sin(age * 61) * 0.05 * B.shudder : 0);
        at.z = B.z + (B.shudder ? Math.cos(age * 53) * 0.05 * B.shudder : 0);
        at.yaw = B.yaw + B.spin;
        watcher.root.position.set(at.x, 0, at.z);                // its body is a child of the arena
        watcher.root.scale.setScalar(size);
        watcher.root.rotation.set(-B.flinch * 0.08, at.yaw, 0);
        W.reach(toward(W.reach(), REACHED, 1.5, dt));
    }

    function update(dt) {
        think(dt);
        stance(dt);
    }

    // ── After the animation: body, arms, scythe, the blade test, and everything that hangs off it ──
    const _s = V(), _w = V();
    const BLOW = { kind: 'blade', parryable: true, unblockable: false, knock: 1, fromX: 0, fromZ: 0 };
    function posed(dt) {
        age += dt;
        darkFrame(dt);
        cracksFrame(dt);
        if (brk.on) { breakFrame(dt); return; }
        scythe = toward(scythe, 1, 6, dt);
        poseWatcher(pose, at, size, scythe);
        W.scythe.visible = scythe > 0.02;
        // The edge heats as a blow comes; the reap's edge burns white
        const heat = Math.max(hot * 0.85, reapGlow * (0.75 + 0.25 * Math.sin(age * 30)));
        W.edge.material.color.setRGB(1, 0.16 + heat * 0.84, 0.1 + heat * 0.9);
        // The blade, while it is cutting: does it pass over the visitor?
        if (cut && B.move) {
            const move = MOVE[B.move], P = ctx.P, radius = move.radius || BLADE;
            _s.copy(rig.hand).lerp(rig.top, 0.45);
            BLOW.unblockable = !!move.unblockable; BLOW.parryable = !move.unblockable;
            if (move.pull) {
                // The hook pulls from beyond the visitor, back towards the Watcher
                const d = Math.hypot(P.x - B.x, P.z - B.z) || 1;
                BLOW.fromX = P.x + (P.x - B.x) / d * 2; BLOW.fromZ = P.z + (P.z - B.z) / d * 2; BLOW.knock = move.pull;
            } else { BLOW.fromX = B.x; BLOW.fromZ = B.z; BLOW.knock = 1; }
            let r = ctx.haz.blade(swingId, _s, rig.top, radius, cut, BLOW);
            if (r === null) r = ctx.haz.blade(swingId, rig.top, rig.tip, radius, cut, BLOW);
            if (r === 'hit') {
                if (move.pull) { ctx.slow(0.35, 0.35); ctx.shake(0.8); sx('cineHit'); }
                if (cut >= 30 || move.pull) bark('hit', 0.6, 0.35);
            }
        }
        crown = toward(crown, 1, 1.6, dt);
        const tw = at.yaw + pose.twist, sy = Math.sin(tw), cy = Math.cos(tw);
        ctx.toArena(bones.spine_03.getWorldPosition(_w));
        W.crown.position.set(_w.x - sy * 0.12 * size, _w.y, _w.z - cy * 0.12 * size);
        W.crown.rotation.set(pose.bend, tw, 0);
        W.crown.scale.setScalar(Math.max(0.001, crown * size));
        // Its eyes are its health: they shut as it loses. They flare when it calls on them.
        flare = toward(flare, 0, 3, dt);
        const wide = Math.max(flare, reapGlow);
        const eyes = W.eyes, q = ctx.camera.quaternion;
        for (let i = 0; i < eyes.length; i++) {
            const e = eyes[i], u = e.userData;
            ctx.toArena(bones[u.bone].getWorldPosition(_w));
            const ox = u.on.x * size, oz = u.on.z * size;
            e.position.set(_w.x + ox * cy + oz * sy, _w.y + u.on.y * size, _w.z - ox * sy + oz * cy);
            e.scale.setScalar(0.2 * size * (1 + wide * 0.35));
            e.quaternion.copy(q);
            const alive = B.state === 'dying' || (i / eyes.length < B.hp / HP - 0.02 && away[i] <= 0);
            const want = alive ? (0.8 + 0.2 * Math.sin(age * 7 + u.goAt * 9)) * (1 + wide * 0.4) : 0;
            setOpen(e, toward(u.open, want * (1 - B.flinch * 0.7), 8, dt));
        }
        ctx.toArena(bones.Head.getWorldPosition(_w));
        // Seen from afar its eyes are two burning sockets; in a close-up they draw in, onto the face itself
        gazeClose = toward(gazeClose, gazeCloseTo, 6, dt);
        const gf = mix(0.11, 0.1, gazeClose) * size;
        W.gaze.position.set(_w.x + sy * gf, _w.y + mix(0.05, 0.075, gazeClose) * size, _w.z + cy * gf);
        W.gaze.scale.setScalar(0.87 * size * (1 + gazeFlare * 0.15) * mix(1, 0.32, gazeClose));
        W.gaze.quaternion.copy(q);
        W.glow.position.set(_w.x + sy * 1.4, _w.y - 0.2, _w.z + cy * 1.4);
        gaze = toward(gaze, 1, 3, dt);
        gazeFlare = toward(gazeFlare, 0, 2.5, dt);
        setOpen(W.gaze, gaze * (0.92 + Math.sin(age * 9) * 0.08) * (1 + gazeFlare * 0.4));
        // (in a close-up its face is kept dark, so only the eyes burn)
        W.glow.intensity = (6 * gaze + B.flinch * 6 + hot * 5 + gazeFlare * 30 + reapGlow * 6) * (1 - 0.9 * gazeClose);
        W.aura.scale.set(4.4 * size, 4.2 * size, 1);
        W.aura.position.set(B.x - Math.sin(B.yaw) * 0.8, 1.15 * size, B.z - Math.cos(B.yaw) * 0.8);
        W.aura.material.opacity = (0.55 + (1 - B.hp / HP) * 0.3 + gazeFlare * 0.4) * gaze;
        W.clip.constant = 99;
    }
    let gazeFlare = 0, gazeClose = 0, gazeCloseTo = 0;

    // ═════════════ The end: it comes apart ═════════════
    // brk: the break, once it starts. Its body is gone in a moment; its eyes are flung off the roof into the dark;
    // the scythe is thrown up, turns over, and comes down heel first to stand in the stone.
    const brk = { on: false, t: 0, top: 0, landed: false, land: V(), p0: V(), q0: new THREE.Quaternion(), qf: new THREE.Quaternion(), axis: V(), flight: 1.9, peak: 7, quiver: 0, head: V(), v: [], camDir: V() };
    for (let i = 0; i < W.eyes.length; i++) brk.v.push(V());
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
    // Where the scythe will come down: a little way towards where the visitor stands, on clear stone
    function landingSpot(out) {
        const P = ctx.P, dx = P.x - B.x, dz = P.z - B.z, d = Math.hypot(dx, dz) || 1;
        out.set(B.x + dx / d * Math.min(2.6, d * 0.4), 0, B.z + dz / d * Math.min(2.6, d * 0.4));
        const r = Math.hypot(out.x, out.z);
        if (r < 3) out.multiplyScalar(3 / (r || 1));
        if (r > ARENA - 1.5) out.multiplyScalar((ARENA - 1.5) / r);
        return out;
    }
    function startBreak() {
        if (brk.on) return;
        brk.on = true; brk.t = 0; brk.landed = false; brk.quiver = 0;
        ctx.toArena(bones.Head.getWorldPosition(brk.head));
        brk.top = brk.head.y + 1.5;
        brk.p0.copy(W.scythe.position);
        brk.q0.copy(W.scythe.quaternion);
        landingSpot(brk.land);
        // It lands upright, leaning a little away from the visitor, its blade side-on to them
        const P = ctx.P;
        brk.camDir.set(brk.land.x - P.x, 0, brk.land.z - P.z).normalize();
        const lean = V(brk.camDir.x * 0.16, 1, brk.camDir.z * 0.16).normalize();
        _qa.setFromAxisAngle(UPV, Math.atan2(brk.camDir.x, brk.camDir.z));
        _qb.setFromUnitVectors(UPV, lean);
        brk.qf.copy(_qb).multiply(_qa);
        brk.axis.set(brk.camDir.z, 0, -brk.camDir.x).normalize();
        // Every eye is thrown outwards from the middle of the body, and up
        const C = _w.copy(brk.head).setY(brk.head.y * 0.6);
        for (let i = 0; i < W.eyes.length; i++) {
            const e = W.eyes[i].position, v = brk.v[i];
            v.set(e.x - C.x, 0, e.z - C.z);
            if (v.lengthSq() < 0.01) v.set(Math.cos(i * 2.4), 0, Math.sin(i * 2.4));
            v.normalize().multiplyScalar(9 + (i % 7) * 2.2);
            v.y = 3 + (i % 5) * 1.6 + (e.y - C.y) * 1.2;
        }
        // Shards of the dark body, and embers of its light
        for (let i = 0; i < SHARD_N; i++) {
            const s = shards[i], a = ctx.rand() * TAU, sp = 3 + ctx.rand() * 9, h = ctx.rand();
            shardPos[i * 3] = B.x + Math.cos(a) * 0.5 * size * ctx.rand();
            shardPos[i * 3 + 1] = h * brk.head.y;
            shardPos[i * 3 + 2] = B.z + Math.sin(a) * 0.5 * size * ctx.rand();
            s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = 1 + ctx.rand() * 6;
            s.life = 1.2 + ctx.rand() * 1.6;
            const ember = i % 3 === 0;
            s.r = ember ? 1 : 0.16; s.g = ember ? 0.18 : 0.1; s.b = ember ? 0.1 : 0.12;
        }
        shardPts.visible = true;
        cut = 0; mark.on = false; showMarks();
    }
    function breakFrame(dt) {
        const t = (brk.t += dt);
        // The body is erased from the head down
        W.clip.constant = Math.max(-0.1, mix(brk.top, -0.1, clamp01(t / 0.32)));
        W.crown.scale.setScalar(Math.max(0.001, size * (1 - clamp01(t / 0.2))));
        W.aura.material.opacity = Math.max(0, 0.9 - t * 0.6);
        // Its eyes fly out over the wall into the dark, and go out there
        const q = ctx.camera.quaternion;
        for (let i = 0; i < W.eyes.length; i++) {
            const e = W.eyes[i], v = brk.v[i];
            e.position.addScaledVector(v, dt);
            v.y -= 3.5 * dt;
            v.multiplyScalar(1 - Math.min(1, dt * 0.25));
            e.quaternion.copy(q);
            const far = Math.hypot(e.position.x, e.position.z);
            const want = t < 0.1 ? 1.3 : far < 16 ? 1 : Math.max(0, 1 - (far - 16) / 10);
            setOpen(e, toward(e.userData.open, want, 10, dt));
        }
        // Its own two eyes hang where its head was, a beat longer than the rest, then shut
        W.gaze.position.copy(brk.head);
        W.gaze.quaternion.copy(q);
        const g = t < 1.5 ? 1.2 : Math.max(0, 1 - (t - 1.5) / 0.5);
        setOpen(W.gaze, g);
        W.glow.position.copy(brk.head);
        W.glow.intensity = Math.max(0, (t < 0.3 ? 40 : 10) * g);
        // The shards
        if (shardPts.visible) {
            let live = 0;
            for (let i = 0; i < SHARD_N; i++) {
                const s = shards[i];
                if (s.life <= 0) { shardPos[i * 3 + 1] = -50; continue; }
                live++;
                s.life -= dt; s.vy -= 6 * dt;
                shardPos[i * 3] += s.vx * dt; shardPos[i * 3 + 1] = Math.max(0.05, shardPos[i * 3 + 1] + s.vy * dt); shardPos[i * 3 + 2] += s.vz * dt;
                s.vx *= 1 - Math.min(1, dt * 1.2); s.vz *= 1 - Math.min(1, dt * 1.2);
                const k = Math.min(1, s.life);
                shardCol[i * 3] = s.r * k; shardCol[i * 3 + 1] = s.g * k; shardCol[i * 3 + 2] = s.b * k;
            }
            shardGeo.attributes.position.needsUpdate = true;
            shardGeo.attributes.color.needsUpdate = true;
            if (!live) shardPts.visible = false;
        }
        // The scythe: up, over and over, and down heel first
        W.edge.material.color.setRGB(1, 0.16, 0.1);
        if (!brk.landed) {
            const k = clamp01(t / brk.flight);
            W.scythe.position.lerpVectors(brk.p0, brk.land, k);
            W.scythe.position.y = mix(brk.p0.y, -0.55, k) + 4 * brk.peak * k * (1 - k);
            _qa.setFromAxisAngle(brk.axis, (1 - ease(k)) * TAU * 2.25);
            _qb.copy(brk.qf).premultiply(_qa);
            W.scythe.quaternion.copy(brk.q0).slerp(_qb, clamp01(t / 0.3));
            W.scythe.scale.setScalar(size);
            W.scythe.visible = true;
            if (k >= 1) landScythe(true);
        } else {
            // It stands in the stone, quivering
            brk.quiver += dt;
            const a = 0.09 * Math.exp(-brk.quiver * 1.3) * Math.sin(brk.quiver * 34);
            _qa.setFromAxisAngle(brk.axis, a);
            W.scythe.quaternion.copy(brk.qf).premultiply(_qa);
        }
    }
    function landScythe(loud) {
        brk.landed = true; brk.quiver = 0;
        W.scythe.position.copy(brk.land).setY(-0.55);
        W.scythe.quaternion.copy(brk.qf);
        W.scythe.scale.setScalar(size);
        W.scythe.visible = true;
        crack(brk.land.x, brk.land.z, 2.6, Infinity);
        if (loud) {
            sfx.thud(); sfx.tick(); sx('cineHit'); ctx.shake(0.8);
            ctx.dust(brk.land.x, brk.land.z, 16, '#7a6a60');
            ctx.spark(brk.land.x, 0.4, brk.land.z, 2.6, '#ff8a5a');
        }
    }
    // Everything as it is once the break is over (a skipped cut-scene lands here at once)
    function endBreak() {
        if (!brk.on) startBreak();
        if (!brk.landed) landScythe(false);
        W.clip.constant = -0.1;
        W.crown.scale.setScalar(0.001);
        W.aura.material.opacity = 0;
        setOpen(W.gaze, 0);
        W.glow.intensity = 0;
        for (const e of W.eyes) setOpen(e, 0);
        shardPts.visible = false;
    }

    // ═════════════ The form ═════════════
    const head = V();
    const headAt = () => ctx.toArena(bones.Head.getWorldPosition(head));
    // A point relative to the Watcher: f ahead of it, l to its left, at height y
    const rel = (f, l, y, out = []) => {
        const s = Math.sin(B.yaw), c = Math.cos(B.yaw);
        out[0] = B.x + s * f + c * l; out[1] = y; out[2] = B.z + c * f - s * l;
        return out;
    };

    const form = {
        id: 'watcher', name: 'THE WATCHER', sub: 'what was built, and what collapsed',
        hpMax: HP,
        get hp() { return B.hp; },
        get x() { return B.x; }, get z() { return B.z; }, get yaw() { return B.yaw; },
        get radius() { return brk.on ? 0 : 1.7; },
        get aimY() { return 0.62 * size; },
        get targetable() { return !brk.on && B.state !== 'dying'; },
        get staggered() { return B.state === 'stagger'; },
        get posture() { return posture; },
        postureMax: 100,
        // For the test bot: how close a blow is to landing (0..1), what it is doing, and whether a spot is about to be hit
        get hot() { return hot; },
        get state() { return B.state; },
        threat(x, z) {
            if (B.state === 'burst') return hot > 0.75 && Math.hypot(x - B.x, z - B.z) < 6.5;
            if (!B.move || !mark.on || hot <= 0.8) return false;
            return inMark(x, z, 0.5);
        },

        // ── Its entrance. The visitor has just watched the eyes become this thing; now it shows how big it is. ──
        //   1. low at its feet: the scythe's heel cracks the stone, and the camera climbs its body
        //   2. a hard cut over its shoulder, down to the visitor, small, far below
        //   3. high above the tower: every eye in the dark turns inward at once
        //   4. a whip back to its face; its own eyes flare; the name lands
        async intro(shot) {
            const P = ctx.P;
            shot.each(dt => update(dt));
            DK.open = 0; DK.turn = 0; DK.bright = 0.35;
            readPose(POSE.rest, poseTo); poseRate = 6;
            // 1. Its feet, the heel of the scythe
            const heel = rel(0.8, -1.12, 0.75);
            shot.cam(rel(3.0, -3.1, 0.3), heel, { fov: 50 });
            readPose(POSE.lift, poseTo); poseRate = 5;
            await shot.wait(0.75);
            readPose(POSE.plant, poseTo); poseRate = 34;
            await shot.wait(0.12);
            if (!shot.skipped) {
                sfx.thud(); sfx.rumble(1.6); sx('cineHit'); ctx.shake(0.9);
                shot.slow(0.4);
                ctx.dust(W.scythe.position.x, W.scythe.position.z, 14, '#7a6a60');
                ctx.spark(W.scythe.position.x, 0.3, W.scythe.position.z, 2.4, '#ff8a5a');
            }
            crack(W.scythe.position.x, W.scythe.position.z, 2.4, Infinity);
            await shot.wait(0.35);
            shot.slow(1);
            readPose(POSE.rest, poseTo); poseRate = 2.5;
            shot.say(LINES.intro[0], 1.9);
            await shot.move(rel(3.1, -1.9, 2.6), rel(0, 0, 5.6), 1.7, { fov: 64 });
            // 2. The visitor, small, far below
            shot.cam(rel(-2.4, -2.9, 10.2), [P.x, 0.5, P.z], { fov: 50 });
            shot.say(LINES.intro[1], 1.5);
            shot.move(rel(-2.1, -2.6, 9.6), [P.x, 0.6, P.z], 1.4, { fov: 46 });
            await shot.wait(1.4);
            // 3. High above the tower; the eyes in the dark open, looking anywhere but here...
            const cx = (B.x + P.x) / 2, cz = (B.z + P.z) / 2;
            shot.cam([cx + 7, 30, cz + 15], [cx, 0, cz - 1], { fov: 58 });
            DK.open = 1; DK.turn = 0; DK.bright = 0.5;
            if (!shot.skipped) sfx.eye(0.5, -0.6);
            shot.move([cx + 5, 27, cz + 13], [cx, 0, cz - 1], 2.6, { fov: 54 });
            await shot.wait(0.9);
            // ...and all at once, every one of them turns to the roof
            DK.turn = 1; DK.bright = 1; DK.flare = 0.8;
            if (!shot.skipped) { sfx.eye(1.6, -0.7); sfx.eye(1.6, 0.7); sfx.eye(1.2, 0); sfx.rumble(1.2); ctx.shake(0.3); }
            shot.say(LINES.intro[2], 1.6);
            await shot.wait(1.5);
            // 4. Whip back to its face
            headAt();
            const fs = Math.sin(B.yaw), fc = Math.cos(B.yaw);
            const face = [head.x + fs * 5.2 + fc * 0.5, head.y - 0.35, head.z + fc * 5.2 - fs * 0.5];
            gazeClose = gazeCloseTo = 1;
            await shot.move(face, [head.x, head.y - 0.1, head.z], 0.3, { fov: 30, ease: k => k * k * (3 - 2 * k) });
            // Its own two eyes flare, and the name lands like a blow
            gazeFlare = 1; flare = 1;
            if (!shot.skipped) { sfx.roar(1.6); sfx.thud(); ctx.flash('#ff2a1a', 0.25); ctx.shake(0.7); }
            shot.say(LINES.intro[3], 1.3);
            shot.move([head.x + fs * 4.8 + fc * 0.45, head.y - 0.3, head.z + fc * 4.8 - fs * 0.45], [head.x, head.y - 0.1, head.z], 2.8, { fov: 26 });
            await shot.wait(1.25);
            if (!shot.skipped) { sfx.thud(); sx('cineHit'); ctx.shake(0.6); }
            await shot.card('THE WATCHER', 'what was built, and what collapsed', 1.9);
            // However it ended (skipped or not), it stands ready and the dark is watching
            readPose(POSE.rest, poseTo); readPose(POSE.rest, pose);
            DK.open = 1; DK.turn = 1; DK.bright = 0.5; DK.flare = 0;
            gazeFlare = 0; flare = 0; gazeCloseTo = 0;
        },
        start() { fighting = true; },
        update,
        pose: posed,
        damage(amount, info) {
            if (brk.on || B.state === 'dying') return { dealt: 0, staggered: false, dead: false };
            const kind = (info && info.kind) || 'light';
            if (B.state === 'stagger') amount *= 1.6;              // an opening is worth more
            const before = B.hp;
            B.hp = Math.max(0, B.hp - amount);
            B.flinch = 1;
            calm = 0;
            if (B.hp <= 0) {
                B.state = 'dying'; B.move = null; B.t = 0; B.queue.length = 0; mark.on = false; cut = 0; showMarks();
                return { dealt: before, staggered: false, dead: true };
            }
            // Its posture gives a little with every blow
            let staggered = false;
            if (B.state !== 'stagger') {
                posture += kind === 'heavy' ? 15 : kind === 'art' ? 22 : kind === 'riposte' ? 0 : 7;
                if (posture >= 100) { staggered = true; throwOpen(); }
            }
            if (before > HP * 0.5 && B.hp <= HP * 0.5) { barkT = 0; say(LINES.half, 2.2, 0.3); barkT = 7; ctx.score.intensity(0.5); }
            if (before > HP * 0.22 && B.hp <= HP * 0.22) { barkT = 0; say(LINES.low, 2.2, 0.3); barkT = 7; ctx.score.intensity(0.9); }
            return { dealt: before - B.hp, staggered, dead: false };
        },
        // Its blow was turned aside: it recoils (the swing it was making is over), and its posture takes the shock
        parried() {
            if (brk.on || B.state === 'dying') return;
            posture += 34;
            calm = 0;
            B.move = null; B.t = 0; B.did = {}; B.queue.length = 0; B.spin = 0; mark.on = false; cut = 0; newSwing(); showMarks();
            if (posture >= 100) { throwOpen(); ctx.score.stinger('stagger'); }
            else { B.state = 'recoil'; bark('parried', 0.5, 1); }
        },
        // ── Its end. It does not kneel: driven to nothing, it comes apart. ──
        //   1. slow: thrown back, every eye open, the last verdict
        //   2. it breaks: the body is gone, its eyes are flung off the roof into the dark, the scythe is thrown up
        //   3. quiet: the scythe comes down heel first and stands quivering in the stone. Nothing else moves.
        async outro(shot) {
            const P = ctx.P;
            shot.each(dt => { if (!brk.on) { B.t += dt; B.shudder = Math.min(1, B.t); stance(dt); } });
            B.state = 'dying'; B.move = null; B.queue.length = 0; B.spin = 0; mark.on = false; showMarks();
            readPose(POSE.dying, poseTo); poseRate = 5;
            flare = 1; gazeFlare = 0.6;
            // 1. Low and close, slow
            shot.slow(0.3);
            shot.cam(rel(3.6, 3.2, 1.3), rel(0, 0, 4.3), { fov: 52 });
            shot.move(rel(3.2, 2.7, 1.5), rel(0, 0, 4.6), 1.6, { fov: 48 });
            if (!shot.skipped) { sfx.roar(3); sfx.rumble(2.5); }
            shot.say(LINES.end[0], 1.8);
            await shot.wait(1.3);
            if (!shot.skipped) { ctx.shake(0.5); sfx.eye(1.5, 0); }
            DK.turn = 1; DK.flare = 1;
            await shot.wait(0.45);
            // 2. It breaks
            shot.slow(1);
            startBreak();
            if (!shot.skipped) { sfx.thud(); sfx.roar(2.2); sfx.rumble(3); ctx.flash('#ff3a2a', 0.35); ctx.shake(1); sx('cineHit'); for (let i = 0; i < 4; i++) sfx.eye(1.2, i - 1.5); }
            // Wide and high, from over the visitor's side, as everything is thrown outwards
            const dx = P.x - B.x, dz = P.z - B.z, d = Math.hypot(dx, dz) || 1;
            const wx = B.x + dx / d * 9 + dz / d * 5, wz = B.z + dz / d * 9 - dx / d * 5;
            shot.cam([wx, 8.5, wz], [B.x, 3.2, B.z], { fov: 60 });
            shot.move([wx + dx / d * 2, 10.5, wz + dz / d * 2], [B.x, 2.4, B.z], 1.8, { fov: 64 });
            await shot.wait(0.5);
            shot.say(LINES.end[1], 1.6);
            await shot.until(() => brk.t > brk.flight - 0.3);
            // 3. Low by the stone where the scythe will come down; the visitor small beyond it
            // Turned a little off the line through the visitor, so the shaft does not cover them, to whichever side keeps
            // the brazier out of the foreground
            const d0 = brk.camDir, ca = Math.cos(0.6), sa = Math.sin(0.6);
            const turn = sd => ({ x: d0.x * ca - d0.z * sa * sd, z: d0.z * ca + d0.x * sa * sd });
            const clear = v => nearSeg(0, 0, brk.land, { x: brk.land.x + v.x * 7, z: brk.land.z + v.z * 7 });
            const ua = turn(1), ub = turn(-1), u = clear(ua) > clear(ub) ? ua : ub;
            let cd = 8.5;
            for (let i = 0; i < 12 && Math.hypot(brk.land.x + u.x * cd, brk.land.z + u.z * cd) > ARENA; i++) cd -= 0.5;
            shot.cam([brk.land.x + u.x * cd, 1.0, brk.land.z + u.z * cd], [brk.land.x, 3.3, brk.land.z], { fov: 58 });
            shot.move([brk.land.x + u.x * (cd - 1.6), 0.9, brk.land.z + u.z * (cd - 1.6)], [brk.land.x, 3.1, brk.land.z], 4, { fov: 56 });
            await shot.until(() => brk.landed);
            // A breath of quiet; out in the dark, the eyes close one by one
            await shot.wait(0.9);
            DK.open = 0;
            await shot.wait(2.6);
            endBreak();
        },
        // The visitor fell: back to the start of the Watcher
        restart() {
            fresh();
            fighting = false;
            barkT = 0;
            bark('again', 0.8, 0.6);
            DK.open = 1; DK.turn = 1; DK.bright = 0.5;
        },
        dispose() {
            fighting = false;
            for (const name in marks) ctx.mark.hide(marks[name].h);
            ctx.arena.remove(darkMesh, shardPts, ember);
            ember.dispose();
            darkMesh.geometry.dispose(); darkMat.map.dispose(); darkMat.dispose(); darkMesh.dispose();
            shardGeo.dispose(); shardPts.material.dispose();
            for (const c of CRACKS) { ctx.arena.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); }
            crackTex.dispose();
            W.crown.rotation.set(0, 0, 0);
            if (brk.on) {
                // Beaten: its body stays gone, its eyes are out; the scythe is left standing in the stone
                endBreak();
                watcher.root.position.copy(W.home);
                watcher.root.rotation.set(0, 0, 0);
                for (const e of W.eyes) e.visible = false;
            } else {
                // Left mid-fight: stand the body where the page's reveal expects to find it
                watcher.root.position.copy(W.home);
                watcher.root.rotation.set(0, 0, 0);
                W.clip.constant = 99;
            }
        },
        debug: {
            moves: ['combo', 'sweep', 'back', 'spin', 'slam', 'thrust', 'reap', 'lunge', 'burst', 'volley', 'stagger', 'recoil'],
            // Starts a move now, whatever it was doing ('combo' runs all three blows)
            force(name) {
                const m = name === 'combo' ? 'sweep' : MOVE[name] ? name : null;
                B.state = name; B.move = m; B.t = 0; B.did = {}; B.last = name; B.n = 0; B.cool = 99; B.spin = 0; B.extra = 0;
                B.ox = B.x; B.oz = B.z; B.queue = name === 'combo' ? ['back', 'spin'] : [];
                newSwing();
            },
            get B() { return B; }, POSE, MOVE, rig, marks, DK, brk, get size() { return size; }, get posture() { return posture; },
            set extra(v) { B.extra = v; }
        }
    };
    return form;
}
