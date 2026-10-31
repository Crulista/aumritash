// Loads the playable characters: a Quaternius outfit, a head cut from the matching base body,
// and the shared animation clips (every part uses the same 65-bone humanoid rig).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('./models/', import.meta.url).href;

// Each origin is assembled from outfit parts: the first entry supplies the skeleton,
// later entries borrow pieces (by name) from other outfits. `tint` multiplies the colours.
// Each also moves its own way: a stance (pose), a signature move when picked (show), how it walks
// (walk, with walkIdle when it stops and a speed factor) and how it lights the flame (kindle).
const ORIGINS = [
    { name: 'Wanderer', pose: 'Sword_Idle', show: 'Sword_Attack', walk: 'Walk_Loop', walkIdle: 'Idle_Loop', speed: 1, kindle: 'Fixing_Kneeling',
      lore: 'A hooded traveller who walks every road twice. Always moving, always learning the lay of the land.',
      parts: s => [{ file: `${s}_ranger` }] },
    { name: 'Hunter', pose: 'Idle_Loop', show: 'Roll', walk: 'Walk_Loop', walkIdle: 'Idle_Loop', speed: 1, kindle: 'Interact',
      lore: 'Reads the tracks others miss. Patient, precise, and always the first to see where the herd is heading.',
      parts: s => [{ file: `${s}_ranger`, drop: /Head_Hood/, tint: '#a8784a' }] },
    { name: 'Pilgrim', pose: 'Idle_Torch_Loop', show: 'Interact', walk: 'Walk_Formal_Loop', walkIdle: 'Idle_Torch_Loop', speed: 0.9, kindle: 'Fixing_Kneeling',
      lore: 'Walks for the story, not the destination. Carries a hundred worlds in a battered pack.',
      parts: s => [{ file: `${s}_peasant`, drop: /Feet/, tint: '#8c8782' }, { file: `${s}_ranger`, keep: /Head_Hood|Pauldron|Feet/, tint: '#6f6b67' }] },
    { name: 'Wretch', pose: 'Spell_Simple_Idle_Loop', show: 'Spell_Simple_Shoot', walk: 'Walk_Loop', walkIdle: 'Idle_Loop', speed: 1, kindle: 'Spell_Simple_Shoot',
      lore: 'Starts with nothing but stubbornness. Builds the rest from scratch, one stolen hour at a time.',
      parts: s => [{ file: `${s}_peasant` }] }
];

export const CLASSES = ORIGINS.flatMap(o => ['m', 'f'].map(sex => {
    const s = sex === 'm' ? 'male' : 'female';
    const { name, pose, show, walk, walkIdle, speed, kindle, lore } = o;
    return { id: `${name.toLowerCase()}_${sex}`, name, sex, pose, show, walk, walkIdle, speed, kindle, lore, parts: o.parts(s), body: `base_${s}` };
}));

const loader = new GLTFLoader();
const cache = new Map();
const load = name => {
    if (!cache.has(name)) cache.set(name, loader.loadAsync(BASE + name + '.glb'));
    return cache.get(name);
};

let clipsPromise = null;
export function loadClips() {
    if (!clipsPromise) clipsPromise = load('anims').then(g => Object.fromEntries(g.animations.map(c => [c.name, c])));
    return clipsPromise;
}

// Keep only the triangles of the base body that belong to the head and neck
function cutHead(mesh) {
    const geo = mesh.geometry;
    const names = mesh.skeleton.bones.map(b => b.name);
    const keepBones = new Set(['Head', 'neck_01'].map(n => names.indexOf(n)).filter(i => i >= 0));
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const get = (attr, v, k) => (k === 0 ? attr.getX(v) : k === 1 ? attr.getY(v) : k === 2 ? attr.getZ(v) : attr.getW(v));
    const dominant = v => {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = get(sw, v, k); if (w > bw) { bw = w; best = get(si, v, k); } }
        return best;
    };
    const keepVert = new Uint8Array(si.count);
    for (let v = 0; v < si.count; v++) keepVert[v] = keepBones.has(dominant(v)) ? 1 : 0;
    const src = geo.index ? geo.index.array : Array.from({ length: si.count }, (_, i) => i);
    const out = [];
    for (let t = 0; t < src.length; t += 3) {
        const a = src[t], b = src[t + 1], c = src[t + 2];
        if (keepVert[a] && keepVert[b] && keepVert[c]) out.push(a, b, c);
    }
    const g2 = geo.clone();
    g2.setIndex(out);
    mesh.geometry = g2;
}

// Point a skinned mesh at the outfit's bones (matched by name), keeping its own bind pose
function rebind(mesh, boneByName) {
    const bones = mesh.skeleton.bones.map(b => boneByName.get(b.name) || b);
    mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
}

// A mesh's own name plus its parents' (multi-material parts are split into child meshes)
function nameChain(o) {
    let s = '';
    for (let n = o; n; n = n.parent) s += n.name + ' ';
    return s;
}
const wanted = (o, part) => {
    const n = nameChain(o);
    return (!part.keep || part.keep.test(n)) && (!part.drop || !part.drop.test(n));
};

function tintMeshes(meshes, tint) {
    if (!tint) return;
    const c = new THREE.Color(tint);
    for (const m of meshes) {
        m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => {
            // Leave bare skin alone, only dye the clothes
            if (!/Regular|Superhero/i.test(x.name)) x.color.multiply(c);
        });
    }
}

export async function loadCharacter(cls) {
    const files = [...new Set(cls.parts.map(p => p.file))];
    const [bodyG, clips, ...outfits] = await Promise.all([load(cls.body), loadClips(), ...files.map(load)]);
    const byFile = Object.fromEntries(files.map((f, i) => [f, outfits[i]]));
    const { clone } = await import('three/addons/utils/SkeletonUtils.js');

    // The first part provides the skeleton everything else binds to
    const [first, ...rest] = cls.parts;
    const root = clone(byFile[first.file].scene);
    const body = clone(bodyG.scene);

    const boneByName = new Map();
    root.traverse(o => { if (o.isBone) boneByName.set(o.name, o); });

    let skinParent = null;
    const firstMeshes = [];
    root.traverse(o => { if (o.isSkinnedMesh) { if (!skinParent) skinParent = o.parent; firstMeshes.push(o); } });
    for (const m of firstMeshes) if (!wanted(m, first)) m.parent.remove(m);
    tintMeshes(firstMeshes.filter(m => wanted(m, first)), first.tint);

    // Borrowed pieces from other outfits
    for (const part of rest) {
        const src = clone(byFile[part.file].scene);
        const picked = [];
        src.traverse(o => { if (o.isSkinnedMesh && wanted(o, part)) picked.push(o); });
        tintMeshes(picked, part.tint);
        for (const m of picked) { rebind(m, boneByName); (skinParent || root).add(m); }
    }

    // Head, eyes and brows from the base body
    const extras = [];
    body.traverse(o => { if (o.isSkinnedMesh) extras.push(o); });
    const biggest = extras.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a), extras[0]);
    for (const m of extras) {
        if (m === biggest) cutHead(m);
        rebind(m, boneByName);
        (skinParent || root).add(m);
    }

    root.traverse(o => {
        if (o.isMesh) {
            o.castShadow = true;
            o.frustumCulled = false;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mt of mats) { mt.metalness = 0; mt.roughness = 1; if (mt.map) mt.map.colorSpace = THREE.SRGBColorSpace; }
        }
    });

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const [name, clip] of Object.entries(clips)) actions[name] = mixer.clipAction(clip);
    let current = null;
    function play(name, { fade = 0.35, once = false } = {}) {
        const next = actions[name];
        if (!next || next === current) return next;
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.enabled = true;
        if (current) next.crossFadeFrom(current, fade, false);
        next.play();
        current = next;
        return next;
    }
    return { root, mixer, actions, play, cls };
}
