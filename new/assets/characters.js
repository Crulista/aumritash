// Loads the playable characters: a Quaternius outfit, a head cut from the matching base body,
// and the shared animation clips (every part uses the same 65-bone humanoid rig).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('./models/', import.meta.url).href;

export const CLASSES = [
    { id: 'wanderer_m', name: 'Wanderer', sex: 'm', outfit: 'male_ranger', body: 'base_male', pose: 'Sword_Idle',
      lore: 'A hooded traveller who walks every road twice. Always moving, always learning the lay of the land.' },
    { id: 'wanderer_f', name: 'Wanderer', sex: 'f', outfit: 'female_ranger', body: 'base_female', pose: 'Sword_Idle',
      lore: 'A hooded traveller who walks every road twice. Always moving, always learning the lay of the land.' },
    { id: 'wretch_m', name: 'Wretch', sex: 'm', outfit: 'male_peasant', body: 'base_male', pose: 'Spell_Simple_Idle_Loop',
      lore: 'Starts with nothing but stubbornness. Builds the rest from scratch, one stolen hour at a time.' },
    { id: 'wretch_f', name: 'Wretch', sex: 'f', outfit: 'female_peasant', body: 'base_female', pose: 'Spell_Simple_Idle_Loop',
      lore: 'Starts with nothing but stubbornness. Builds the rest from scratch, one stolen hour at a time.' }
];

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

export async function loadCharacter(cls) {
    const [outfitG, bodyG, clips] = await Promise.all([load(cls.outfit), load(cls.body), loadClips()]);
    const { clone } = await import('three/addons/utils/SkeletonUtils.js');
    const root = clone(outfitG.scene);
    const body = clone(bodyG.scene);

    const boneByName = new Map();
    root.traverse(o => { if (o.isBone) boneByName.set(o.name, o); });

    let skinParent = null;
    root.traverse(o => { if (o.isSkinnedMesh && !skinParent) skinParent = o.parent; });

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
