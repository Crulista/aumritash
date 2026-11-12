// Shared helpers for the tower fight: small maths, the rig tools that bend a body into an authored pose, and a few
// little factories (glow sprites, red ground material, eyes). Nothing in here keeps any fight state.
import * as THREE from 'three';

// ── Numbers ──
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp01 = x => Math.min(1, Math.max(0, x));
export const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
// 0 → 1 as t goes from a to b, eased
export const ramp = (t, a, b) => ease((t - a) / (b - a));
// Moves v towards `to` at `rate` per second, the same at any frame rate
export const toward = (v, to, rate, dt) => v + (to - v) * (1 - Math.exp(-rate * dt));
// The signed difference between two angles, in -π..π
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// How far a point on the ground is from a line, both seen from above (a and b need .x and .z)
export function nearSeg(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, k = clamp01(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1));
    return Math.hypot(px - a.x - dx * k, pz - a.z - dz * k);
}

// ── Rig helpers: turn a bone in world space, and bend an arm to put its hand on a point ──
const _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _q = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _p = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
export function turnWorld(bone, q) {
    bone.parent.getWorldQuaternion(_pq);
    bone.getWorldQuaternion(_bq);
    bone.quaternion.copy(_pq.invert()).multiply(q).multiply(_bq);
    bone.updateMatrixWorld(true);
}
// Two-bone IK: bends upper and lower so that `hand` lands on `target` (world space). `pole` is the direction the
// elbow should point. The caller's vectors are only read.
export function reachFor(upper, lower, hand, target, pole) {
    upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
    const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
    _t.copy(target).sub(_a);
    const d = Math.min((l1 + l2) * 0.998, Math.max(Math.abs(l1 - l2) + 0.001, _t.length()));
    _n.copy(_t).normalize();
    // The elbow sits off the line from shoulder to hand, on the side the pole points to
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), up = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    _p.copy(pole).addScaledVector(_n, -pole.dot(_n));
    if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
    _p.normalize();
    _e.copy(_a).addScaledVector(_n, x).addScaledVector(_p, up);
    turnWorld(upper, _q.setFromUnitVectors(_b.sub(_a).normalize(), _e.sub(_a).normalize()));
    lower.getWorldPosition(_b); hand.getWorldPosition(_c);
    _t.copy(_a).addScaledVector(_n, d);
    turnWorld(lower, _q.setFromUnitVectors(_c.sub(_b).normalize(), _t.sub(_b).normalize()));
}

// ── Poses ──
// A pose is where a body's weapon hand is and how its body is held:
//   hand: where the right hand is. dir: which way the weapon's shaft points (from the hand). edge: which way its
//   blade faces. twist: how far the body is turned (+ to its left). bend: forward lean. crouch: 0 standing to 1 low.
//   left: where the left hand goes ('shaft' = lower on the weapon, a point, or null to leave it to the animation).
// Authored poses are plain arrays; readPose turns one into vectors so it can be blended.
// A move is { keys: [[time, pose, ease], ...] }; ease 'in' snaps into the pose (a strike), 'out' settles into it.
export const EASE = { in: k => k * k * k, out: k => 1 - Math.pow(1 - k, 3), undefined: ease };
export const blank = () => ({ hand: new THREE.Vector3(), dir: new THREE.Vector3(), edge: new THREE.Vector3(), twist: 0, bend: 0, crouch: 0, left: null });
export function readPose(src, out) {
    out.hand.fromArray(src.hand); out.dir.fromArray(src.dir).normalize(); out.edge.fromArray(src.edge).normalize();
    out.twist = src.twist; out.bend = src.bend; out.crouch = src.crouch; out.left = src.left;
    return out;
}
export function blendPose(a, b, k, out) {
    out.hand.copy(a.hand).lerp(b.hand, k);
    out.dir.copy(a.dir).lerp(b.dir, k).normalize();
    out.edge.copy(a.edge).lerp(b.edge, k).normalize();
    out.twist = mix(a.twist, b.twist, k); out.bend = mix(a.bend, b.bend, k); out.crouch = mix(a.crouch, b.crouch, k);
    out.left = k < 0.5 ? a.left : b.left;
    return out;
}
const _pa = blank(), _pb = blank();
// Where a move has the body at time t
export function movePose(move, t, out) {
    const keys = move.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
    const [t0, p0] = keys[i], [t1, p1, e] = keys[i + 1];
    return blendPose(readPose(p0, _pa), readPose(p1, _pb), EASE[e](clamp01((t - t0) / (t1 - t0))), out);
}

// How fast a walking or jogging clip actually covers ground (in the character's own units per second), from how far
// a foot travels in it. Stops the character's animation while it measures.
export function clipSpeed(ch, name) {
    const a = ch.actions[name], d = a.getClip().duration, v = new THREE.Vector3();
    let foot = null, lo = 9, hi = -9;
    ch.root.traverse(o => { if (o.isBone && o.name === 'foot_r') foot = o; });
    ch.stopAll();
    a.reset().play();
    const yaw = ch.root.rotation.y;
    ch.root.rotation.set(0, 0, 0);
    for (let i = 0; i < 16; i++) { a.time = d * i / 16; ch.mixer.update(0); ch.root.updateMatrixWorld(true); foot.getWorldPosition(v); lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
    ch.stopAll();
    ch.root.rotation.y = yaw;
    return (hi - lo) * 2 / d / (ch.root.scale.z || 1);
}

// ── Small factories ──
let glow = null;
// A soft white dot, shared by every glow sprite
export function glowTexture() {
    if (glow) return glow;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    glow = new THREE.CanvasTexture(c);
    return glow;
}
// An additive glowing sprite (sparks, orbs, pillars of light)
export const glowSprite = (color = '#ff2a1a', opacity = 1) => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
// The faint red used for every warning on the ground; starts invisible
export const redMaterial = (color = '#ff2a1a') => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });

// A pair of red eyes; `open` 0..1 is how far the lids are apart
let eyeMat = null;
export function eyePair(size = 1) {
    if (!eyeMat) eyeMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff2020', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
        const sp = new THREE.Sprite(eyeMat.clone());
        sp.scale.set(0.22, 0.12, 1);
        sp.position.x = s * 0.17;
        g.add(sp);
    }
    g.scale.setScalar(size);
    setOpen(g, 0);
    return g;
}
export function setOpen(g, open) {
    g.userData.open = open;
    g.visible = open > 0.01;
    g.children.forEach(s => { s.scale.y = 0.12 * Math.max(0.05, open); });
}
