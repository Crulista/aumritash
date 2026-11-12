// Phase III: THE AUTHOR. The owner's library, and the last form: a tall robed figure of pale paper that never
// touches the ground, with wings and a halo of loose pages and a blank oval of ink for a face. Behind it the sky has
// opened into one vast eye that watches the visitor for the whole phase.
//
// It floats out of reach and casts from on high (ink beams, quill rain, quills thrown at the visitor, page storms);
// it comes down to cast its heavier work (the echoes of the earlier forms, the rotating cross of beams, tearing the
// roof apart), and that is when it can be struck. A quill turned back by a parry knocks it out of the air.
//   Acts:  above two thirds one echo at a time; below, the cross of beams and faster rain; below a third, two echoes
//          at once and everything quicker. Below ~15 % it spends every page on one last attack, then it is helpless.
// Everything it builds lives in this file: the figure, the sky eye, the pages (one instanced mesh), the falling tiles,
// pale look-alikes of the Watcher's scythe and the beast's legs, and its own telegraphed hazards. It restores the
// scene's background and fog in dispose().
//
// Figure units: arena units; the figure's own frame has z ahead of it and y up from its hem, which floats `alt` above
// the roof.

const TAU = Math.PI * 2;
const HIGH = 3.4, LOW = 0.55;                   // its hem's height when out of reach, and when it comes down
const RAYS = 9, PER = 7;                        // a wing: rays of pages fanned from the shoulder, pages along each
const WINGS = 2 * RAYS * PER, HALO = 42;
const LOOSE0 = WINGS + HALO, LOOSE = 70;        // pages drifting off it
const FIG = LOOSE0;                             // pages that belong to the body
const STORM0 = LOOSE0 + LOOSE, STORM_PER = 40, STORM_W = 4;
const WALL0 = STORM0 + STORM_PER * STORM_W, WALL = 360;
const NP = 1400;                                // every page there is (the intro's column uses them all)
const RAY_L = [3.0, 3.8, 4.4, 4.6, 4.4, 4.0, 3.4, 2.9, 2.4];
const SPD = [1, 1, 1.12, 1.24];                 // how much quicker it is in each act
const TILE = 1.6;

// What it says. {NAME} is the visitor's name.
const LINES = {
    start: 'TURN THE PAGE.',
    act2: 'THE STORY QUICKENS.',
    act3: 'NOW, THE ENDING.',
    struck: ['AND THE VISITOR BLED.', 'STRUCK. AS WRITTEN.', 'A FINE WOUND. I WROTE IT.'],
    parried: ['A MISPRINT.', 'STRIKE THAT LINE.', 'THAT WAS NOT IN THE TEXT.'],
    fell: ['AND HERE THE VISITOR FELL.', 'HERE LIES {NAME}. A SHORT STORY.', 'THE END. AGAIN.'],
    scythe: 'CHAPTER ONE. THE WATCHER.',
    legs: 'CHAPTER TWO. THE PLAYER.',
    both: 'EVERY CHAPTER AT ONCE.',
    rewrite: 'THIS ROOF WAS NEVER WRITTEN.',
    rewrite2: 'CROSSED OUT.',
    last: 'EVERY PAGE. EVERY ENDING.',
    spent: 'THIS WAS NOT WRITTEN.',
    low: 'I WILL WRITE YOU OUT.'
};

export function create(ctx) {
    const { THREE, kit, sfx } = ctx;
    const { mix, clamp01, ease, ramp, toward, angDiff } = kit;
    const arena = ctx.arena, ARENA = ctx.ARENA;
    let scene = arena;
    while (scene.parent) scene = scene.parent;
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const rand = ctx.rand;
    const own = [], added = [];
    const keep = x => { own.push(x); return x; };
    const put = (o, parent = arena) => { parent.add(o); added.push(o); return o; };
    // The score's extra sounds, if it has them
    const fx = (name, ...a) => { const s = ctx.score; if (s && typeof s[name] === 'function') { try { s[name](...a); } catch (e) { /* sound is optional */ } } };
    let seed = 7;
    const lcg = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

    // ═════════════ Textures, all drawn here ═════════════
    function canvasTex(w, h, draw, repeat = false) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        draw(c.getContext('2d'));
        const t = keep(new THREE.CanvasTexture(c));
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }
    // Rows of handwriting too small to read
    const scribble = (g, x0, x1, y0, y1, step, col) => {
        g.fillStyle = col;
        for (let y = y0; y < y1; y += step) {
            let x = x0 + Math.floor(lcg() * 3);
            while (x < x1 - 2) { const w = 2 + Math.floor(lcg() * 6); g.fillRect(x, y, Math.min(w, x1 - x), 1); x += w + 1 + Math.floor(lcg() * 2); }
        }
    };
    const paperTex = canvasTex(32, 40, g => {
        g.fillStyle = '#efe6d3'; g.fillRect(0, 0, 32, 40);
        g.fillStyle = 'rgba(110,80,50,0.4)'; g.fillRect(0, 0, 32, 1); g.fillRect(0, 39, 32, 1); g.fillRect(0, 0, 1, 40); g.fillRect(31, 0, 1, 40);
        scribble(g, 4, 28, 5, 36, 4, 'rgba(40,26,22,0.85)');
    });
    const robeTex = canvasTex(64, 128, g => {
        g.fillStyle = '#ebe2cf'; g.fillRect(0, 0, 64, 128);
        for (let x = 0; x < 64; x += 8) { g.fillStyle = 'rgba(90,70,60,0.2)'; g.fillRect(x, 0, 3, 128); }
        scribble(g, 2, 62, 3, 126, 5, 'rgba(50,34,28,0.6)');
    }, true);
    const crackTex = canvasTex(32, 32, g => {
        g.strokeStyle = '#fff'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) { g.beginPath(); let x = 16, y = 16; g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (lcg() - 0.5) * 11; y += (lcg() - 0.5) * 11; g.lineTo(x, y); } g.stroke(); }
        g.strokeRect(0.5, 0.5, 31, 31);
    });
    const holeTex = canvasTex(32, 32, g => {
        const grd = g.createRadialGradient(16, 16, 3, 16, 16, 23);
        grd.addColorStop(0, '#000'); grd.addColorStop(0.65, '#070203'); grd.addColorStop(1, '#6a120a');
        g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    });
    const splatTex = canvasTex(32, 32, g => {
        g.fillStyle = '#fff'; g.beginPath();
        for (let k = 0; k <= 20; k++) { const a = k / 20 * TAU, r = 8 + lcg() * 6; g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); }
        g.fill();
        for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(16 + (lcg() - 0.5) * 28, 16 + (lcg() - 0.5) * 28, 1 + lcg() * 2, 0, TAU); g.fill(); }
    });
    const GLOW = kit.glowTexture();

    // ═════════════ Materials ═════════════
    // The robe, hood, sleeves and face can be cut away below a height: revealed from the top in the intro, burnt
    // from the hem up in the outro. `cut` is a world height; the cut edge glows `edge`.
    const cut = { value: -99 }, edge = { value: new THREE.Color('#fff4e0') };
    function burnable(m) {
        m.onBeforeCompile = sh => {
            sh.uniforms.uCut = cut; sh.uniforms.uEdge = edge;
            sh.vertexShader = 'varying vec3 vCutP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCutP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            sh.fragmentShader = 'uniform float uCut; uniform vec3 uEdge; varying vec3 vCutP;\n' + sh.fragmentShader
                .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat cutN = fract(sin(dot(floor(vCutP * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);\nfloat cutK = vCutP.y + cutN * 0.45 - uCut;\nif (cutK < 0.0) discard;')
                .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, smoothstep(0.3, 0.0, cutK));');
        };
        m.customProgramCacheKey = () => 'author-cut-' + m.type;
        return m;
    }
    const robeMat = burnable(keep(new THREE.MeshLambertMaterial({ map: robeTex, color: '#f1e8d6', emissive: '#2e211b', side: THREE.DoubleSide })));
    const inkMat = burnable(keep(new THREE.MeshBasicMaterial({ color: '#040203', side: THREE.DoubleSide })));
    const pageMat = keep(new THREE.MeshLambertMaterial({ map: paperTex, emissive: '#3a2c25', side: THREE.DoubleSide }));
    const glowMat = (color, opacity = 1, tex = null) => keep(new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
    const redMat = () => keep(kit.redMaterial());
    const ghost = (opacity = 0.5, color = '#cfe0ff') => glowMat(color, opacity);
    const sprite = (color, sx, sy = sx) => { const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); s.scale.set(sx, sy, 1); return s; };

    // Shared shapes
    const flatGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const stripGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5));     // runs 0..1 along +z
    const discGeo = keep(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
    const ringGeo = keep(new THREE.RingGeometry(0.88, 1, 36).rotateX(-Math.PI / 2));
    const colGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true).translate(0, 0.5, 0));            // 0..1 up y
    const rayGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5));   // 0..1 along +z
    const flat = (geo, mat, parent = arena) => { const m = put(new THREE.Mesh(geo, mat), parent); m.visible = false; m.frustumCulled = false; return m; };

    // ═════════════ The scene: what it changes, and puts back ═════════════
    const saved = { bg: scene.background && scene.background.isColor ? scene.background.clone() : scene.background, fog: scene.fog ? scene.fog.color.clone() : null, density: scene.fog ? scene.fog.density : 0 };
    const FOG_RED = new THREE.Color('#240b10'), FOG_DAWN = new THREE.Color('#5a6070'), _fc = new THREE.Color();
    const dawnLight = new THREE.HemisphereLight('#a8b4cc', '#3a3028', 0);
    scene.add(dawnLight);
    // The earlier forms' bodies are not part of this act; hide what is still standing and give it back afterwards
    const W = ctx.parts && ctx.parts.watcher, hid = [];
    let glowWas = null;
    function hideOld() {
        if (!W) return;
        const standing = W.body && W.body.root.visible;
        for (const o of [W.body && W.body.root, W.gaze, W.crown, W.aura, ...(W.eyes || []), standing ? W.scythe : null]) if (o && o.visible) { hid.push(o); o.visible = false; }
        if (W.glow && glowWas === null) { glowWas = W.glow.intensity; W.glow.intensity = 0; }
    }
    hideOld();

    // ═════════════ The sky: one vast eye behind the clouds ═════════════
    // A sphere around the camera drawn before everything else. The eye sits at a direction on it (uEye), its lids
    // open by uOpen, its pupil a slit (uPupil), looking at uLook; uReveal parts the clouds, uDawn greys the horizon.
    const SU = {
        uEye: { value: V(0, 0.3, -1).normalize() }, uOpen: { value: 0 }, uReveal: { value: 0 }, uTime: { value: 0 }, uRed: { value: 0 },
        uDawn: { value: 0 }, uDawnDir: { value: V(1, 0, 0) }, uLook: { value: new THREE.Vector2(0, -0.5) }, uPupil: { value: 1 }, uFlare: { value: 0 }
    };
    const skyMat = keep(new THREE.ShaderMaterial({
        uniforms: SU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
        vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
uniform vec3 uEye, uDawnDir; uniform float uOpen, uReveal, uTime, uRed, uDawn, uPupil, uFlare; uniform vec2 uLook;
varying vec3 vD;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vD);
  float el = d.y;
  vec3 col = mix(vec3(0.075, 0.055, 0.09), vec3(0.02, 0.016, 0.035), smoothstep(-0.02, 0.6, el));
  vec3 rt = normalize(cross(uEye, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, uEye);
  float fw = step(0.0, dot(d, uEye));
  vec2 a = vec2(dot(d, rt), dot(d, up));
  float W = 0.62, H = 0.25;
  vec2 q = a / vec2(W, H);
  float far = length(q * vec2(1.0, 0.45));
  float red = uRed * fw;
  col += red * vec3(0.4, 0.035, 0.03) * exp(-far * far * 1.2);
  float lid = H * max(0.0, 1.0 - q.x * q.x) * uOpen;
  float inside = fw * step(abs(q.x), 1.0) * step(abs(a.y), lid);
  vec2 ia = a - uLook * vec2(W * 0.4, H * 0.42);
  float RI = H * 0.95;
  float ir = length(ia) / RI;
  float ang = atan(ia.y, ia.x);
  float vein = fbm(a * 22.0);
  vec3 eye = mix(vec3(0.17, 0.015, 0.02), vec3(0.52, 0.07, 0.05), smoothstep(0.5, 0.75, vein));
  float shade = smoothstep(lid, lid * 0.35, abs(a.y));
  eye *= 0.4 + 0.6 * shade;
  float stri = 0.5 + 0.5 * sin(ang * 26.0 + fbm(vec2(ang * 2.0, ir * 3.0)) * 7.0);
  vec3 iris = mix(vec3(0.78, 0.1, 0.03), vec3(1.0, 0.58, 0.2), stri * smoothstep(1.0, 0.25, ir));
  iris = mix(iris, vec3(0.12, 0.0, 0.0), smoothstep(0.78, 1.0, ir));
  iris *= 0.55 + 0.45 * shade;
  if (ir < 1.0) eye = iris;
  vec2 pp = ia / vec2(RI * 0.2 * uPupil, RI * 0.9);
  if (dot(pp, pp) < 1.0) eye = vec3(0.0);
  eye += vec3(1.0, 0.85, 0.7) * step(length(ia - vec2(-RI * 0.38, RI * 0.38)), RI * 0.09);
  eye *= 1.0 + uFlare;
  col = mix(col, eye, inside);
  float rim = fw * step(abs(q.x), 1.02) * (1.0 - smoothstep(0.0, 0.01 + 0.012 * uOpen, abs(abs(a.y) - lid)));
  col += rim * vec3(0.95, 0.18, 0.07) * uRed;
  vec2 cp = d.xz / max(el + 0.28, 0.06);
  float c = fbm(cp * 0.9 + vec2(uTime * 0.015, uTime * 0.008));
  float cloud = smoothstep(0.48, 0.78, c) * smoothstep(-0.12, 0.12, el);
  float hole = fw * uReveal * smoothstep(1.5, 0.8, length(q * vec2(0.8, 0.5)));
  cloud *= 1.0 - 0.85 * hole;
  vec3 cc = vec3(0.06, 0.045, 0.07) + red * vec3(0.38, 0.05, 0.04) * exp(-far * far * 0.35) + uDawn * vec3(0.22, 0.22, 0.26);
  col = mix(col, cc, cloud * 0.9);
  vec3 fl = normalize(vec3(d.x, 0.0001, d.z));
  float tw = smoothstep(-0.4, 1.0, dot(fl, uDawnDir));
  col += uDawn * (vec3(0.26, 0.28, 0.33) * exp(-max(el, 0.0) * 5.0) * (0.35 + 0.65 * tw) + vec3(0.55, 0.42, 0.3) * exp(-abs(el) * 40.0) * tw);
  gl_FragColor = vec4(col, 1.0);
}`
    }));
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(120, 24, 12)), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.visible = false;
    put(sky, scene);
    const eye = { az: 0, el: 0.32, open: 0, reveal: 0, red: 0, pupil: 1, blinkAt: 6, blink: 0, flare: 0, dawn: 0, on: false };

    // ═════════════ The figure ═════════════
    const body = put(new THREE.Group());
    body.rotation.order = 'YXZ';
    body.visible = false;
    // The robe: a turned shape, wide at the hem, narrow at the waist, broad at the shoulders, its hem ragged
    const robeGeo = keep(new THREE.LatheGeometry([[0.95, 0], [0.86, 0.5], [0.66, 1.3], [0.5, 2.1], [0.5, 2.6], [0.62, 3.1], [0.74, 3.45], [0.58, 3.78], [0.24, 4.0], [0.02, 4.08]].map(([r, y]) => new THREE.Vector2(r, y)), 14));
    {
        const pa = robeGeo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
            const x = pa.getX(i), z = pa.getZ(i);
            let y = pa.getY(i);
            if (y < 0.01) y = (i % 3) * 0.16 + hash(i) * 0.14;
            const k = clamp01((y - 2.6) / 1.2);
            pa.setXYZ(i, x * (1 + 0.38 * k), y, z * 0.8);
        }
        robeGeo.computeVertexNormals();
    }
    const robe = new THREE.Mesh(robeGeo, robeMat);
    body.add(robe);
    // The hood, open at the front, with a point at the back
    const hood = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 10, 8, Math.PI / 2 + 0.75, TAU - 1.5, 0, Math.PI * 0.72)), robeMat);
    hood.scale.set(1, 1.35, 1.15);
    hood.position.set(0, 4.32, -0.02);
    body.add(hood);
    const tip = new THREE.Mesh(keep(new THREE.ConeGeometry(0.22, 0.6, 6)), robeMat);
    tip.position.set(0, 4.98, -0.24);
    tip.rotation.x = -0.5;
    body.add(tip);
    // Its face: a blank oval of ink, with two faint red points
    const face = new THREE.Mesh(keep(new THREE.CircleGeometry(0.3, 14)), inkMat);
    face.scale.set(0.78, 1.12, 1);
    face.position.set(0, 4.28, 0.24);
    body.add(face);
    const points = [-1, 1].map(s => { const p = sprite('#ff2a1a', 0.16, 0.08); p.position.set(s * 0.09, 4.36, 0.32); body.add(p); return p; });
    // The halo's light, and the red light under it
    const haloGlow = sprite('#ffe6cc', 3.4);
    haloGlow.material.opacity = 0.32;
    haloGlow.position.set(0, 4.85, -0.65);
    body.add(haloGlow);
    const under = new THREE.PointLight('#ff3a1e', 0, 13, 1.25);
    under.position.set(0, -0.9, 0.6);
    body.add(under);
    const pool = flat(discGeo, glowMat('#ff2a12', 0, GLOW));       // a red pool of light on the stone beneath it
    // Arms: a sleeve to the elbow, a bell sleeve to the wrist, and a hand of ink
    const upperGeo = keep(new THREE.CylinderGeometry(0.14, 0.18, 1, 7).translate(0, 0.5, 0));
    const lowerGeo = keep(new THREE.CylinderGeometry(0.36, 0.15, 1, 8, 1, true).translate(0, 0.5, 0));
    const handGeo = keep(new THREE.ConeGeometry(0.08, 0.66, 5).translate(0, 0.33, 0));
    const thumbGeo = keep(new THREE.ConeGeometry(0.05, 0.38, 4).translate(0, 0.19, 0));
    const arms = [1, -1].map(side => {
        const a = { side, upper: new THREE.Mesh(upperGeo, robeMat), lower: new THREE.Mesh(lowerGeo, robeMat), hand: new THREE.Mesh(handGeo, inkMat), thumb: new THREE.Mesh(thumbGeo, inkMat), at: V(side * 0.72, 2.45, 0.5), to: V(side * 0.72, 2.45, 0.5), sh: V(side * 0.62, 3.55, 0.02), el: V(), wr: V() };
        body.add(a.upper, a.lower, a.hand, a.thumb);
        return a;
    });
    // Strips of robe trailing below it
    const strips = Array.from({ length: 7 }, (_, i) => {
        const g = keep(new THREE.PlaneGeometry(0.3, 1, 1, 6));
        const m = new THREE.Mesh(g, robeMat);
        m.frustumCulled = false;
        body.add(m);
        const a = (i / 7) * TAU + 0.3;
        return { m, a, len: 1.6 + hash(i + 3) * 1.1, ph: hash(i) * 6 };
    });

    // ═════════════ Pages: one instanced mesh for every page ═════════════
    const pageGeo = keep(new THREE.PlaneGeometry(1, 1));
    const pages = put(new THREE.InstancedMesh(pageGeo, pageMat, NP));
    pages.frustumCulled = false;
    pages.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const MA = pages.instanceMatrix.array;
    {
        const c = new THREE.Color();
        for (let i = 0; i < NP; i++) { const k = 0.82 + hash(i * 1.7) * 0.18; c.setRGB(k, k * (0.96 + hash(i) * 0.04), k * (0.9 + hash(i + 9) * 0.08)); pages.setColorAt(i, c); }
        pages.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    const CA = pages.instanceColor.array;
    const BASECOL = Float32Array.from(CA);
    let colorsDirty = false;
    // Lays page i at p, its long side along u, facing roughly f, w wide and h tall
    function lay(i, px, py, pz, ux, uy, uz, fx, fy, fz, w, h) {
        let rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux;
        const o = i * 16;
        MA[o] = rx * w; MA[o + 1] = ry * w; MA[o + 2] = rz * w; MA[o + 3] = 0;
        MA[o + 4] = ux * h; MA[o + 5] = uy * h; MA[o + 6] = uz * h; MA[o + 7] = 0;
        MA[o + 8] = nx; MA[o + 9] = ny; MA[o + 10] = nz; MA[o + 11] = 0;
        MA[o + 12] = px; MA[o + 13] = py; MA[o + 14] = pz; MA[o + 15] = 1;
    }
    function hidePage(i) { MA.fill(0, i * 16, i * 16 + 16); }
    function hideRange(a, b) { MA.fill(0, a * 16, b * 16); }
    hideRange(0, NP);

    // Where the body's own pages belong this frame (arena coordinates): position, long axis, facing, size
    const SL = new Float32Array(FIG * 11);
    let E = body.matrix.elements;
    function slot(i, lx, ly, lz, ux, uy, uz, fx, fy, fz, w, h) {
        const o = i * 11;
        SL[o] = E[0] * lx + E[4] * ly + E[8] * lz + E[12];
        SL[o + 1] = E[1] * lx + E[5] * ly + E[9] * lz + E[13];
        SL[o + 2] = E[2] * lx + E[6] * ly + E[10] * lz + E[14];
        SL[o + 3] = E[0] * ux + E[4] * uy + E[8] * uz;
        SL[o + 4] = E[1] * ux + E[5] * uy + E[9] * uz;
        SL[o + 5] = E[2] * ux + E[6] * uy + E[10] * uz;
        SL[o + 6] = E[0] * fx + E[4] * fy + E[8] * fz;
        SL[o + 7] = E[1] * fx + E[5] * fy + E[9] * fz;
        SL[o + 8] = E[2] * fx + E[6] * fy + E[10] * fz;
        SL[o + 9] = w; SL[o + 10] = h;
    }
    const look = { spread: 0, spreadTo: 1, flap: 0, flapK: 0.25, halo: 1, haloTo: 1, wing: 1, wingTo: 1, face: 0, faceTo: 1, lean: 0, bank: 0, bob: 0, cast: 0 };
    let age = 0;
    function slots() {
        const s = look.spread, sp = clamp01(s);
        const sweep = mix(1.32, 0.26, sp) - Math.max(0, s - 1) * 1.4;
        for (let side = 0; side < 2; side++) {
            const sg = side ? -1 : 1, ox = sg * Math.cos(sweep), oz = -Math.sin(sweep);
            const nx = -oz * sg, nz = ox * sg;                          // the wing's face
            const rootX = sg * 0.3, rootY = 3.5, rootZ = -0.32;
            for (let i = 0; i < RAYS; i++) {
                const k = i / (RAYS - 1);
                const phi = mix(-1.35 + k * 0.14, mix(1.2, -1.0, k), sp);
                const L = RAY_L[i] * mix(0.62, 1, sp) * look.wing;
                for (let j = 0; j < PER; j++) {
                    const f = (j + 0.6 + (i % 2) * 0.5) / PER;
                    const d = 0.3 + f * L;
                    const th = phi - 0.3 * f * f * sp + look.flap * f * (1 - k * 0.4);
                    const c = Math.cos(th), sn = Math.sin(th);
                    const ux = ox * c, uy = sn, uz = oz * c;
                    // Each page rolls about its own length a little, so the wing ripples
                    const fl = Math.sin(age * (4 + i * 0.6) + j * 1.7 + side * 2) * 0.35 * (0.3 + f);
                    const rx = uy * nz, ry = uz * nx - ux * nz, rz = -uy * nx;
                    const w = 0.36 * (0.8 + 0.5 * Math.sin(Math.PI * f)) * look.wing, h = 0.52 * (0.9 + 0.35 * Math.sin(Math.PI * f)) * look.wing;
                    slot((side * RAYS + i) * PER + j, rootX + ux * d, rootY + uy * d, rootZ + uz * d, ux, uy, uz, nx + rx * fl, rx * fl * 0.2 + ry * fl, nz + rz * fl, w, h);
                }
            }
        }
        // The halo: a ring of pages standing out like rays, and a smaller ring turning the other way
        const hr = look.halo;
        for (let k = 0; k < 26; k++) {
            const a = k / 26 * TAU + age * 0.18 * (1 + look.cast);
            const c = Math.cos(a), sn = Math.sin(a);
            slot(WINGS + k, c * 1.25 * hr, 4.85 + sn * 1.25 * hr, -0.62, c, sn, 0, 0, 0, 1, 0.28 * hr, 0.52 * hr);
        }
        for (let k = 0; k < 16; k++) {
            const a = k / 16 * TAU - age * 0.35 * (1 + look.cast);
            const c = Math.cos(a), sn = Math.sin(a);
            slot(WINGS + 26 + k, c * 0.8 * hr, 4.85 + sn * 0.8 * hr, -0.7, -sn, c, 0, 0.2 * c, 0.2 * sn, 1, 0.22 * hr, 0.34 * hr);
        }
    }
    function writeSlots(scale) {
        for (let i = 0; i < FIG; i++) {
            const o = i * 11;
            lay(i, SL[o], SL[o + 1], SL[o + 2], SL[o + 3], SL[o + 4], SL[o + 5], SL[o + 6], SL[o + 7], SL[o + 8], SL[o + 9] * scale, SL[o + 10] * scale);
        }
    }

    // Loose pages: drift off it and fall, tumbling; also thrown off by hits and torn tiles
    const LP = Array.from({ length: LOOSE }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: 0, s: 1 }));
    let looseNext = 0, looseAcc = 0;
    function drop(x, y, z, vx = 0, vy = 0, vz = 0, s = 1) {
        const p = LP[looseNext++ % LOOSE];
        Object.assign(p, { life: 5 + rand() * 2, x, y, z, vx, vy, vz, ph: rand() * 6, s });
    }
    function looseFrame(dt) {
        for (let i = 0; i < LOOSE; i++) {
            const p = LP[i], idx = LOOSE0 + i;
            if (p.life <= 0) { hidePage(idx); continue; }
            p.life -= dt;
            p.ph += dt;
            if (p.y > 0.03) {
                p.vy = toward(p.vy, -0.75, 1.5, dt);
                p.vx = toward(p.vx, Math.sin(p.ph * 2.1) * 0.9, 2, dt);
                p.vz = toward(p.vz, Math.cos(p.ph * 1.7) * 0.9, 2, dt);
                p.x += p.vx * dt; p.y = Math.max(0.03, p.y + p.vy * dt); p.z += p.vz * dt;
            }
            const k = Math.min(1, p.life) * p.s, flatK = p.y <= 0.04 ? 1 : 0;
            const ux = flatK ? Math.cos(p.ph * 0.1) : Math.sin(p.ph * 3), uy = flatK ? 0 : 0.5, uz = flatK ? Math.sin(p.ph * 0.1) : Math.cos(p.ph * 2.3);
            const ul = Math.hypot(ux, uy, uz) || 1;
            lay(idx, p.x, p.y, p.z, ux / ul, uy / ul, uz / ul, flatK ? 0 : Math.cos(p.ph * 2.7), 1, flatK ? 0 : Math.sin(p.ph * 1.9), 0.34 * k, 0.46 * k);
        }
    }

    // Embers: for burning pages
    const EMB = Array.from({ length: 28 }, () => { const s = put(sprite('#ff9a3a', 0.5)); s.visible = false; return { s, life: 0, vy: 0 }; });
    let embNext = 0;
    function ember(x, y, z) { const e = EMB[embNext++ % EMB.length]; e.life = 0.8 + rand() * 0.6; e.vy = 0.6 + rand(); e.s.position.set(x, y, z); e.s.visible = true; }
    function embersFrame(dt) {
        for (const e of EMB) {
            if (e.life <= 0) { e.s.visible = false; continue; }
            e.life -= dt;
            e.s.position.y += e.vy * dt;
            e.s.position.x += Math.sin(e.life * 9) * dt * 0.4;
            e.s.material.opacity = Math.min(1, e.life * 2);
        }
    }

    // ═════════════ The figure's arms, robe strips, and where it all is ═════════════
    const _a = V(), _b = V(), _n = V(), _p = V(), _q = new THREE.Quaternion();
    function orient(mesh, from, to) {
        _a.subVectors(to, from);
        const l = _a.length() || 1e-3;
        mesh.position.copy(from);
        mesh.quaternion.setFromUnitVectors(UP, _a.divideScalar(l));
        mesh.scale.set(1, l, 1);
    }
    function armsFrame(dt) {
        const L1 = 1.05, L2 = 1.0;
        for (const a of arms) {
            a.at.lerp(a.to, 1 - Math.exp(-7 * dt));
            _n.subVectors(a.at, a.sh);
            const d = Math.min(L1 + L2 - 0.02, Math.max(0.2, _n.length()));
            _n.normalize();
            const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
            _p.set(a.side * 0.7, -0.4, -0.6);
            _p.addScaledVector(_n, -_p.dot(_n)).normalize();
            a.el.copy(a.sh).addScaledVector(_n, x).addScaledVector(_p, h);
            a.wr.copy(a.sh).addScaledVector(_n, d);
            orient(a.upper, a.sh, a.el);
            orient(a.lower, a.el, a.wr);
            _b.subVectors(a.wr, a.el).normalize();
            a.hand.position.copy(a.wr);
            a.hand.quaternion.setFromUnitVectors(UP, _b);
            a.thumb.position.copy(a.wr);
            _b.x += a.side * 0.5; _b.normalize();
            a.thumb.quaternion.setFromUnitVectors(UP, _b);
        }
    }
    const HANDS = {
        rest: [0.72, 2.45, 0.5, 0.72, 2.45, 0.5], cast: [1.75, 4.15, 0.45, 1.75, 4.15, 0.45], write: [0.38, 3.35, 1.25, 0.38, 3.35, 1.25],
        tearLow: [0.85, 1.1, 0.95, 0.85, 1.1, 0.95], tearUp: [1.1, 4.8, 0.7, 1.1, 4.8, 0.7], cross: [2.05, 3.4, 0, 2.05, 3.4, 0],
        slump: [0.8, 0.9, 0.75, 0.8, 0.9, 0.75], throw: [0.72, 2.45, 0.5, 0.9, 4.3, -0.6], fling: [1.6, 4.6, -0.4, 1.6, 4.6, -0.4],
        point: [0.72, 2.45, 0.5, 0.4, 3.6, 2.0]
    };
    function hands(name) { const h = HANDS[name]; arms[0].to.set(h[0], h[1], h[2]); arms[1].to.set(-h[3], h[4], h[5]); }
    // Points the right hand at an arena point
    const _inv = new THREE.Matrix4();
    function aimHand(x, y, z) {
        body.updateMatrix();
        _inv.copy(body.matrix).invert();
        _a.set(x, y, z).applyMatrix4(_inv).sub(arms[1].sh).normalize().multiplyScalar(2.0).add(arms[1].sh);
        arms[1].to.copy(_a);
    }
    // The right hand's position in the arena (for beams and quills)
    const handAt = (out, i = 1) => out.copy(arms[i].wr).applyMatrix4(body.matrix);
    function stripsFrame() {
        const lagX = -look.lean * 1.4, lagZ = look.bank;
        for (const s of strips) {
            const pa = s.m.geometry.attributes.position;
            const ax = Math.sin(s.a) * 0.88, az = Math.cos(s.a) * 0.72;
            const tx = Math.cos(s.a), tz = -Math.sin(s.a);
            for (let j = 0; j <= 6; j++) {
                const k = j / 6;
                const sway = Math.sin(age * 2 + s.ph + k * 2.4) * 0.22 * k;
                let x = ax * (1 + k * 0.25) + sway * tx + lagZ * k * k * 0.6, z = az * (1 + k * 0.25) + sway * tz + lagX * k * k;
                let y = 0.2 - k * s.len;
                const wy = F.y + y;
                if (wy < 0.04) { const over = 0.04 - wy; y += over; x += ax * over * 0.6; z += az * over * 0.6; }
                const w = 0.15 * (1 - k * 0.6);
                pa.setXYZ(j * 2, x - tx * w, y, z - tz * w);
                pa.setXYZ(j * 2 + 1, x + tx * w, y, z + tz * w);
            }
            pa.needsUpdate = true;
        }
    }

    // ═════════════ Hazards of its own ═════════════
    const P = () => ctx.P;
    const hits = { beam: -9, hole: -9, wall: -9 };
    function hurt(dmg, x, z, opts) {
        const r = ctx.hitPlayer(dmg, x, z, opts);
        if (r === 'hit' && dmg >= 22 && rand() < 0.5) bark('struck');
        return r;
    }

    // ── Spots: marked circles that land after a delay (quill rain, the burst under it, stabbing legs, the last beam) ──
    const QUILLS = Array.from({ length: 16 }, () => {
        const g = put(new THREE.Group());
        const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.06, 2.0, 5).translate(0, 1.0, 0)), inkMat);
        const vane = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.34, 1.3).translate(0.1, 1.35, 0)), pageMat);
        const nib = sprite('#ff3a1a', 0.5);
        nib.position.y = 0.05;
        g.add(shaft, vane, nib);
        g.visible = false;
        return { g, nib, used: false };
    });
    const takeQuill = () => { const q = QUILLS.find(o => !o.used); if (q) { q.used = true; q.g.visible = true; } return q || null; };
    const freeQuill = q => { if (q) { q.used = false; q.g.visible = false; } };
    const SPOTS = Array.from({ length: 26 }, () => ({
        live: false, x: 0, z: 0, r: 1, delay: 1, t: 0, dmg: 0, landed: false, kind: 'quill', onLand: null, quill: null, inkT: 0,
        ring: flat(ringGeo, redMat()), fill: flat(discGeo, redMat()), ink: flat(discGeo, keep(new THREE.MeshBasicMaterial({ color: '#060203', alphaMap: splatTex, transparent: true, opacity: 0, depthWrite: false })))
    }));
    function spot(x, z, r, delay, dmg, kind = 'quill', onLand = null) {
        const s = SPOTS.find(o => !o.live && o.inkT <= 0) || SPOTS.find(o => !o.live);
        if (!s) return null;
        Object.assign(s, { live: true, x, z, r, delay, t: 0, dmg, landed: false, kind, onLand, inkT: 0 });
        s.ring.position.set(x, 0.05, z); s.ring.scale.setScalar(r); s.ring.visible = true;
        s.fill.position.set(x, 0.051, z); s.fill.visible = true;
        s.ink.visible = false;
        s.quill = kind === 'quill' ? takeQuill() : null;
        if (s.quill) s.quill.g.visible = false;
        return s;
    }
    function spotsFrame(dt) {
        const p = P();
        for (const s of SPOTS) {
            if (s.inkT > 0) { s.inkT -= dt; s.ink.material.opacity = clamp01(s.inkT / 1.2) * 0.9; if (s.inkT <= 0) s.ink.visible = false; }
            if (!s.live) continue;
            s.t += dt;
            if (!s.landed) {
                const k = clamp01(s.t / s.delay);
                s.ring.material.opacity = 0.22 + 0.4 * k;
                s.fill.material.opacity = 0.14 + 0.3 * k;
                s.fill.scale.setScalar(Math.max(0.001, s.r * k));
                if (s.quill) {
                    const f = clamp01((s.t - (s.delay - 0.32)) / 0.32);
                    s.quill.g.visible = f > 0;
                    s.quill.g.position.set(s.x, mix(16, 0, f * f), s.z);
                    s.quill.g.rotation.set(0.25, s.x, 0.15);
                }
                if (s.t >= s.delay) {
                    s.landed = true; s.t = 0;
                    if (s.dmg > 0 && Math.hypot(p.x - s.x, p.z - s.z) < s.r) {
                        const blade = s.kind === 'stab';
                        hurt(s.dmg, blade ? B.x : s.x, blade ? B.z : s.z, blade ? { kind: 'blade', parryable: true } : { kind: s.kind === 'beam' ? 'beam' : 'zone', unblockable: true });
                    }
                    if (s.kind === 'quill') {
                        s.ink.position.set(s.x, 0.046, s.z); s.ink.scale.setScalar(s.r * 1.15); s.ink.rotation.y = rand() * TAU; s.ink.visible = true; s.inkT = 2.2;
                        ctx.dust(s.x, s.z, 4, '#1a0c0c');
                        sfx.tick();
                    }
                    if (s.onLand) s.onLand(s);
                }
            } else {
                const k = 1 - s.t / 0.35;
                s.ring.material.opacity = Math.max(0, k) * 0.6;
                s.fill.material.opacity = Math.max(0, k) * 0.85;
                if (s.quill) s.quill.g.position.y = -s.t * 2.5;
                if (k <= 0) { s.live = false; s.ring.visible = s.fill.visible = false; freeQuill(s.quill); s.quill = null; }
            }
        }
    }

    // ── Ink beams: a line drawn across the roof, then a beam that runs along it ──
    const LINES_ = Array.from({ length: 2 }, () => ({
        live: false, x: 0, z: 0, dx: 0, dz: 1, len: 10, w: 1.3, t: 0, wind: 1, speed: 20, hit: false, inkT: 0,
        mark: flat(stripGeo, redMat()), ink: flat(stripGeo, keep(new THREE.MeshBasicMaterial({ color: '#070203', transparent: true, opacity: 0.9, depthWrite: false }))),
        core: flat(colGeo, glowMat('#fff0e0', 0.9)), halo: flat(colGeo, glowMat('#ff2a14', 0.5))
    }));
    function inkLine(px, pz, ang, wind) {
        const L = LINES_.find(o => !o.live && o.inkT <= 0) || LINES_.find(o => !o.live);
        if (!L) return null;
        const dx = Math.sin(ang), dz = Math.cos(ang), Rr = ARENA + 0.4;
        const b = px * dx + pz * dz, c = px * px + pz * pz - Rr * Rr, disc = Math.sqrt(Math.max(0, b * b - c));
        const s0 = -b - disc, s1 = -b + disc;
        Object.assign(L, { live: true, x: px + dx * s0, z: pz + dz * s0, dx, dz, len: s1 - s0, t: 0, wind, hit: false, inkT: 0, speed: 21 * SPD[B.act] });
        for (const m of [L.mark, L.ink]) { m.position.set(L.x, m === L.mark ? 0.047 : 0.049, L.z); m.rotation.y = ang; }
        L.mark.scale.set(L.w, 1, L.len); L.mark.visible = true;
        L.ink.visible = false;
        return L;
    }
    const _h = V();
    function linesFrame(dt) {
        const p = P();
        for (const L of LINES_) {
            if (L.inkT > 0 && !L.live) { L.inkT -= dt; L.ink.material.opacity = clamp01(L.inkT / 1.2) * 0.9; if (L.inkT <= 0) L.ink.visible = false; }
            if (!L.live) continue;
            L.t += dt;
            const head = (L.t - L.wind) * L.speed;
            L.mark.material.opacity = L.t < L.wind ? 0.12 + 0.4 * L.t / L.wind : 0.45;
            if (head < 0) continue;
            if (head > L.len + 2) { L.live = false; L.mark.visible = L.core.visible = L.halo.visible = false; L.inkT = 1.6; continue; }
            const hd = Math.min(head, L.len), hx = L.x + L.dx * hd, hz = L.z + L.dz * hd;
            if (!L.hit) {
                const ox = p.x - L.x, oz = p.z - L.z, along = ox * L.dx + oz * L.dz, side = Math.abs(ox * L.dz - oz * L.dx);
                if (side < L.w / 2 + 0.25 && along < hd + 0.4 && along > hd - L.speed * dt - 0.6) { L.hit = true; hurt(26, hx, hz, { kind: 'beam', unblockable: true }); }
            }
            L.ink.visible = true; L.ink.material.opacity = 0.9;
            L.ink.scale.set(L.w * 0.75, 1, Math.max(0.01, hd));
            // The beam itself: from its hand down to where the line is being written
            handAt(_h);
            for (const m of [L.core, L.halo]) {
                m.visible = true;
                _a.set(hx, 0, hz);
                orient(m, _a, _h);
                const r = m === L.core ? 0.12 : 0.42;
                m.scale.x = m.scale.z = r;
            }
            if (Math.floor(L.t * 20) % 2 === 0) ctx.spark(hx, 0.3, hz, 1.6, '#ff6a3a');
        }
    }

    // ── The cross: four beams along the roof from where it hangs, turning ──
    const CROSS = { live: false, t: 0, wind: 1.3, dur: 4.6, a0: 0, a: 0, w: 0.55, dir: 1,
        arms: Array.from({ length: 4 }, () => ({ beam: flat(rayGeo, glowMat('#fff0e0', 0.95)), glow: flat(rayGeo, glowMat('#ff2a14', 0.45)), mark: flat(stripGeo, redMat()), lead: flat(stripGeo, redMat()) })) };
    function crossFrame(dt) {
        const C = CROSS;
        if (!C.live) return;
        C.t += dt;
        const go = C.t - C.wind;
        C.a = C.a0 + C.dir * C.w * Math.max(0, go);
        const p = P(), dx = p.x - B.x, dz = p.z - B.z, d = Math.hypot(dx, dz), pa = Math.atan2(dx, dz);
        for (let i = 0; i < 4; i++) {
            const A = C.arms[i], a = C.a + i * Math.PI / 2;
            A.mark.visible = true; A.mark.position.set(B.x, 0.047, B.z); A.mark.rotation.y = a; A.mark.scale.set(1.4, 1, 12);
            A.mark.material.opacity = go < 0 ? 0.12 + 0.35 * C.t / C.wind : 0.3;
            A.lead.visible = go >= 0; A.lead.position.copy(A.mark.position); A.lead.rotation.y = a + C.dir * 0.32; A.lead.scale.set(1.4, 1, 12); A.lead.material.opacity = 0.12;
            for (const m of [A.beam, A.glow]) {
                m.visible = go >= 0 && go < C.dur;
                m.position.set(B.x, 0.75, B.z); m.rotation.set(0, a, 0);
                const r = m === A.beam ? 0.16 : 0.5;
                m.scale.set(r, r, 12.5);
            }
            if (go >= 0 && go < C.dur && d > 0.8 && ctx.time() - hits.beam > 0.9) {
                const rel = angDiff(pa, a);
                if (Math.abs(rel) < Math.PI / 2 && d * Math.abs(Math.sin(rel)) < 0.75) { hits.beam = ctx.time(); hurt(18, B.x, B.z, { kind: 'beam', unblockable: true }); }
            }
        }
        if (go >= C.dur) { C.live = false; for (const A of C.arms) A.beam.visible = A.glow.visible = A.mark.visible = A.lead.visible = false; }
    }

    // ── Page storm: rings of pages spiralling out from it, each with two gaps ──
    const GAP = 0.62;
    const arcGeo = keep(new THREE.RingGeometry(0.9, 1, 24, 1, 0, Math.PI - GAP).rotateX(-Math.PI / 2));
    const WAVES = Array.from({ length: STORM_W }, () => ({ live: false, x: 0, z: 0, r: 1, rot: 0, w: 0.3, speed: 4.6, hit: false, arcs: [flat(arcGeo, redMat()), flat(arcGeo, redMat())] }));
    function storm(rot, w) {
        const v = WAVES.find(o => !o.live);
        if (!v) return;
        Object.assign(v, { live: true, x: B.x, z: B.z, r: 1.2, rot, w, hit: false, speed: 4.6 * SPD[B.act] });
        fx('pageFlutter');
    }
    const inGap = (v, ang) => { for (let g = 0; g < 2; g++) if (Math.abs(angDiff(ang, v.rot + g * Math.PI)) < GAP / 2) return true; return false; };
    function wavesFrame(dt) {
        const p = P();
        for (let wi = 0; wi < STORM_W; wi++) {
            const v = WAVES[wi], base = STORM0 + wi * STORM_PER;
            if (!v.live) { hideRange(base, base + STORM_PER); continue; }
            v.r += v.speed * dt;
            v.rot += v.w * dt;
            const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
            if (!v.hit && Math.abs(d - v.r) < 0.55 && !inGap(v, Math.atan2(dx, dz))) { v.hit = true; hurt(13, v.x, v.z, { kind: 'orb' }); }
            const fade = clamp01((13.5 - v.r) / 2);
            for (let g = 0; g < 2; g++) {
                const m = v.arcs[g];
                m.visible = true;
                m.position.set(v.x, 0.048, v.z);
                m.scale.set(v.r, 1, v.r);
                m.rotation.y = v.rot + g * Math.PI + GAP / 2 - Math.PI / 2;
                m.material.opacity = 0.32 * fade;
            }
            for (let k = 0; k < STORM_PER; k++) {
                const g = k % 2, f = (Math.floor(k / 2) + 0.5) / (STORM_PER / 2);
                const ang = v.rot + g * Math.PI + GAP / 2 + f * (Math.PI - GAP);
                const sa = Math.sin(ang), ca = Math.cos(ang), y = 0.45 + (k % 3) * 0.6 + Math.sin(age * 5 + k) * 0.12;
                const tum = age * 7 + k;
                lay(base + k, v.x + sa * v.r, y, v.z + ca * v.r, Math.cos(tum) * ca, Math.sin(tum), -Math.cos(tum) * sa, sa, 0.3, ca, 0.36 * fade, 0.48 * fade);
            }
            if (v.r > 13.5) { v.live = false; for (const m of v.arcs) m.visible = false; }
        }
    }

    // ── Quills thrown at the visitor. A parried one flies back and knocks it out of the air ──
    const DARTS = Array.from({ length: 6 }, () => ({ live: false, p: V(), v: V(), age: 0, back: false, q: null }));
    function dart(from) {
        const d = DARTS.find(o => !o.live);
        if (!d) return;
        const p = P();
        d.live = true; d.age = 0; d.back = false; d.q = takeQuill();
        d.p.copy(from);
        d.v.set(p.x - from.x, 1.2 - from.y, p.z - from.z).normalize().multiplyScalar(13 * SPD[B.act]);
        if (d.q) d.q.nib.material.color.set('#ff3a1a');
        sfx.whoosh();
    }
    const _d = V(), _m = new THREE.Matrix4();
    function dartsFrame(dt) {
        const p = P();
        for (const d of DARTS) {
            if (!d.live) continue;
            d.age += dt;
            const sp = d.v.length();
            if (d.back) { _d.set(B.x, F.y + 3.0, B.z).sub(d.p).normalize().multiplyScalar(sp); d.v.lerp(_d, Math.min(1, dt * 8)); }
            else if (d.age < 0.3) { _d.set(p.x - d.p.x, 1.2 - d.p.y, p.z - d.p.z).normalize().multiplyScalar(sp); d.v.lerp(_d, Math.min(1, dt * 2)); }
            d.p.addScaledVector(d.v, dt);
            if (d.q) {
                d.q.g.position.copy(d.p);
                _d.copy(d.v).normalize().negate();
                d.q.g.quaternion.setFromUnitVectors(UP, _d);
            }
            let dead = d.age > 3 || d.p.y < 0.05;
            if (!d.back && Math.hypot(d.p.x - p.x, d.p.z - p.z) < 0.75 && d.p.y < 2.4) {
                const r = hurt(12, d.p.x, d.p.z, { kind: 'quill', parryable: true });
                if (r === 'parried') {
                    d.back = true; d.age = 0;
                    d.v.multiplyScalar(1.4);
                    if (d.q) d.q.nib.material.color.set('#fff2c8');
                    ctx.spark(d.p.x, d.p.y, d.p.z, 2, '#fff2c8');
                } else if (r && r !== 'dodged') { dead = true; if (r === 'blocked') ctx.spark(d.p.x, d.p.y, d.p.z, 1.4); }
            }
            if (d.back && Math.hypot(d.p.x - B.x, d.p.z - B.z) < 1.2 && Math.abs(d.p.y - (F.y + 3)) < 2.5) { dead = true; quillReturned(); }
            if (dead) { d.live = false; freeQuill(d.q); d.q = null; }
        }
    }

    // ── Echoes: pale copies of the earlier forms' weapons ──
    // The scythe (after the Watcher's): a long shaft with a hooked blade, swept around a ghost of its wielder
    const scy = { live: false, t: 0, x: 0, z: 0, a0: 0, a1: 0, a: 0, id: '', wind: 1, zone: null, hot: 0 };
    const scyG = put(new THREE.Group());
    scyG.visible = false;
    const scyMat = ghost(0.55), scyEdge = ghost(0.95, '#f4f8ff'), wieldMat = ghost(0.2), trailMat = ghost(0, '#dfe8ff');
    {
        const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.09, 6.6, 6).rotateX(Math.PI / 2).translate(0, 0, 3.3)), scyMat);
        const sh = new THREE.Shape();
        sh.moveTo(0, 6.5); sh.quadraticCurveTo(1.9, 6.9, 3.2, 5.0); sh.quadraticCurveTo(1.7, 5.9, 0, 5.95); sh.closePath();
        const blade = new THREE.Mesh(keep(new THREE.ShapeGeometry(sh, 6).rotateX(Math.PI / 2)), scyMat);
        const cutLine = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0, 5.95), V(1.7, 0, 5.9), V(3.2, 0, 5.0)), 10, 0.045, 4).scale(1, 1, 1)), scyEdge);
        scyG.add(shaft, blade, cutLine);
    }
    const wielder = put(new THREE.Group());
    wielder.visible = false;
    {
        const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(1.0, 5.2, 8, 1, true).translate(0, 2.6, 0)), wieldMat);
        const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 8, 6).translate(0, 5.4, 0)), wieldMat);
        const eyes = [-1, 1].map(s => { const e = sprite('#ff2a1a', 0.3, 0.14); e.position.set(s * 0.15, 5.45, 0.38); return e; });
        wielder.add(cone, head, ...eyes);
    }
    const trailGeo = keep(new THREE.RingGeometry(3.6, 7.6, 14, 1, 0, 0.9).rotateX(-Math.PI / 2));
    const trail = flat(trailGeo, trailMat);
    function echoScythe() {
        const p = P();
        // Its wielder stands off to one side of the visitor, and the blade comes round through where they are
        let ang = Math.atan2(B.x - p.x, B.z - p.z) + (rand() < 0.5 ? 1 : -1) * 1.1;
        let px = p.x + Math.sin(ang) * 4.6, pz = p.z + Math.cos(ang) * 4.6;
        const r = Math.hypot(px, pz);
        if (r > ARENA - 0.5) { px *= (ARENA - 0.5) / r; pz *= (ARENA - 0.5) / r; }
        const toP = Math.atan2(p.x - px, p.z - pz), dir = rand() < 0.5 ? 1 : -1, arc = 2.4;
        Object.assign(scy, { live: true, t: 0, x: px, z: pz, a0: toP - dir * arc / 2, a1: toP + dir * arc / 2, a: toP - dir * (arc / 2 + 0.5), id: 'author:scythe:' + (++swingN), wind: 1.0 / SPD[B.act] });
        scy.zone = ctx.haz.zone({ shape: 'sector', x: px, z: pz, yaw: toP, r: 8.2, r0: 1.5, arc: arc + 0.3, delay: scy.wind, dmg: 0, color: '#bcd0ff', onLand: () => {} });
        scyG.scale.x = dir;
        sfx.whoosh(); fx('swing');
    }
    let swingN = 0;
    const BLOW = { kind: 'blade', parryable: true, fromX: 0, fromZ: 0 };
    function scytheFrame(dt) {
        if (!scy.live) { scyG.visible = wielder.visible = trail.visible = false; return; }
        scy.t += dt;
        const t = scy.t, w = scy.wind, sweep = 0.34;
        const dir = Math.sign(scy.a1 - scy.a0);
        let vis = clamp01(t / 0.35);
        if (t < w) { scy.a = mix(scy.a0 - dir * 0.5, scy.a0 - dir * 0.75, ease(t / w)); scy.hot = t / w; }
        else if (t < w + sweep) { const k = (t - w) / sweep; scy.a = mix(scy.a0 - dir * 0.75, scy.a1, k * k); scy.hot = 1; }
        else { scy.a = scy.a1 + dir * 0.5 * ease((t - w - sweep) / 0.5); vis = 1 - clamp01((t - w - sweep - 0.3) / 0.6); scy.hot = 0; }
        scyG.visible = wielder.visible = true;
        scyG.position.set(scy.x, 1.25, scy.z);
        scyG.rotation.set(0.08, scy.a, 0);
        wielder.position.set(scy.x - Math.sin(scy.a) * 0.6, 0, scy.z - Math.cos(scy.a) * 0.6);
        wielder.rotation.y = scy.a;
        scyMat.opacity = 0.55 * vis; scyEdge.opacity = 0.95 * vis; wieldMat.opacity = 0.2 * vis;
        trail.visible = t >= w && t < w + sweep + 0.4;
        if (trail.visible) {
            trail.position.set(scy.x, 0.9, scy.z);
            trail.rotation.y = dir > 0 ? scy.a - 0.9 - Math.PI / 2 : scy.a - Math.PI / 2;
            trailMat.opacity = 0.4 * (1 - clamp01((t - w - sweep) / 0.4));
        }
        if (t >= w && t < w + sweep) {
            const sa = Math.sin(scy.a), ca = Math.cos(scy.a);
            _a.set(scy.x + sa * 1.6, 0, scy.z + ca * 1.6); _b.set(scy.x + sa * 7.8, 0, scy.z + ca * 7.8);
            BLOW.fromX = scy.x; BLOW.fromZ = scy.z;
            const r = ctx.haz.blade(scy.id, _a, _b, 0.7, 28, BLOW);
            if (r === 'hit' && rand() < 0.5) bark('struck');
            if (Math.floor(t * 30) % 3 === 0) ctx.dust(_b.x, _b.z, 2, '#cfd8ff');
        }
        if (t > w + sweep + 1.0) scy.live = false;
    }
    // The legs (after the beast's): two jointed legs of stacked discs that stab down from above
    const discProfile = [];
    for (let k = 0; k < 9; k++) { const y = k / 9; discProfile.push(new THREE.Vector2(0.17, y), new THREE.Vector2(0.34, y + 0.01), new THREE.Vector2(0.34, y + 0.07), new THREE.Vector2(0.17, y + 0.08)); }
    discProfile.push(new THREE.Vector2(0.17, 1));
    const legSegGeo = keep(new THREE.LatheGeometry(discProfile, 8));
    const legTipGeo = keep(new THREE.ConeGeometry(0.3, 1.6, 5).translate(0, -0.8, 0).rotateX(Math.PI));
    const legMat = ghost(0.45);
    const LEGS = Array.from({ length: 2 }, () => ({ thigh: flat(legSegGeo, legMat), shin: flat(legSegGeo, legMat), tip: flat(legTipGeo, legMat), hip: V(), knee: V(), foot: V(), live: false }));
    const stab = { live: false, t: 0, n: 0, list: [], hot: 0 };
    function echoLegs() {
        Object.assign(stab, { live: true, t: 0, n: 0, list: [] });
        const sp = SPD[B.act];
        // Three stabs: where they stand, where they are going, and a held third at where they stand
        const times = [0.85 / sp, 1.45 / sp, 2.5 / sp];
        for (let i = 0; i < 3; i++) stab.list.push({ at: times[i], leg: LEGS[i % 2], x: 0, z: 0, s: null, from: V(), done: false, placed: false });
        fx('stomp');
    }
    function placeLeg(L, fx_, fz_, footY, dirx, dirz) {
        L.foot.set(fx_, footY, fz_);
        L.hip.set(fx_ - dirx * 4.2, 9.5, fz_ - dirz * 4.2);
        const l1 = 6.2, l2 = 6.6;
        _n.subVectors(L.foot, L.hip);
        const d = Math.min(l1 + l2 - 0.05, _n.length());
        _n.normalize();
        const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
        _p.set(0, 1, 0).addScaledVector(_n, -_n.y).normalize();
        L.knee.copy(L.hip).addScaledVector(_n, x).addScaledVector(_p, h);
        _a.copy(L.hip).addScaledVector(_n, d);
        orient(L.thigh, L.hip, L.knee); L.thigh.scale.x = L.thigh.scale.z = 1.25;
        orient(L.shin, L.knee, _a);
        L.tip.position.copy(_a);
        L.tip.quaternion.setFromUnitVectors(UP, _b.subVectors(L.knee, _a).normalize());
        L.thigh.visible = L.shin.visible = L.tip.visible = true;
    }
    function legsFrame(dt) {
        if (!stab.live) { for (const L of LEGS) L.thigh.visible = L.shin.visible = L.tip.visible = false; return; }
        stab.t += dt;
        const p = P(), sp = SPD[B.act];
        stab.hot = 0;
        for (const L of LEGS) L.live = false;
        for (let i = 0; i < stab.list.length; i++) {
            const s = stab.list[i], wind = 0.85 / sp, start = s.at - wind;
            if (stab.t < start - 0.5 || s.done) continue;
            if (!s.placed && stab.t >= start) {
                s.placed = true;
                const lead = i === 1 ? 1.1 : 0;
                s.x = p.x + p.vx * 0.35 * lead; s.z = p.z + p.vz * 0.35 * lead;
                const r = Math.hypot(s.x, s.z);
                if (r > ARENA) { s.x *= ARENA / r; s.z *= ARENA / r; }
                s.s = spot(s.x, s.z, 1.35, wind, 24, 'stab', () => { sfx.thud(); fx('stab'); ctx.shake(0.5); ctx.dust(s.x, s.z, 8, '#cfd8ff'); });
            }
            if (!s.placed) continue;
            const L = s.leg;
            const dx = s.x - B.x, dz = s.z - B.z, dl = Math.hypot(dx, dz) || 1;
            const k = (stab.t - start) / wind;              // 0..1 the wind-up; then it lands
            let footY;
            if (k < 0.85) footY = mix(9, 5.5, ease(k / 0.85));
            else if (k < 1) footY = mix(5.5, 0.1, Math.pow((k - 0.85) / 0.15, 2));
            else footY = k < 1 + 0.4 / wind ? 0.1 : mix(0.1, 9, clamp01((k - 1 - 0.4 / wind) * wind / 0.4));
            stab.hot = Math.max(stab.hot, k < 1 ? clamp01(k) : 0);
            if (k > 1 + 0.8 / wind) { s.done = true; continue; }
            L.live = true;
            placeLeg(L, s.x, s.z, footY, dx / dl, dz / dl);
            legMat.opacity = 0.45 * clamp01((stab.t - start + 0.5) / 0.4);
        }
        for (const L of LEGS) if (!L.live) L.thigh.visible = L.shin.visible = L.tip.visible = false;
        if (stab.list.every(s => s.done)) stab.live = false;
    }
    // The eye volley (after the Watcher's): pale eyes loosed from its halo
    const volley = { live: false, t: 0, n: 0 };
    function volleyFrame(dt) {
        if (!volley.live) return;
        volley.t += dt;
        const count = B.act >= 3 ? 7 : 5, every = 0.24 / SPD[B.act];
        const n = Math.min(count, Math.floor(volley.t / every) + 1);
        while (volley.n < n) {
            volley.n++;
            const a = volley.n / count * TAU + age;
            _a.set(Math.cos(a) * 1.3, 4.85 + Math.sin(a) * 1.3, -0.6).applyMatrix4(body.matrix);
            ctx.haz.orb({ x: _a.x, y: _a.y, z: _a.z, ty: 1.2, speed: 11 * SPD[B.act], homing: 0.85, dmg: 11, life: 3.2, color: '#dfe8ff', size: 1.2 });
            sfx.eye(0.8, 0);
        }
        if (volley.n >= count) volley.live = false;
    }

    // ── Rewrite: tiles of the roof torn out, leaving holes that hurt, mended later ──
    const TILES = [];
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
        const cx = (i + 0.5) * TILE - TILE / 2 + TILE / 2, cz = (j + 0.5) * TILE;
        const r = Math.hypot(cx, cz);
        if (r < 2.9 || r > ARENA - 0.3) continue;
        TILES.push({ cx, cz, r, ang: Math.atan2(cx, cz), state: 0, t: 0, hold: 0, vy: 0, spin: 0 });
    }
    let stoneMat = null;
    arena.traverse(o => { if (!stoneMat && o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.geometry.parameters.radius >= 12) stoneMat = o.material; });
    const slabMat = keep(new THREE.MeshLambertMaterial({ color: '#9a8f86' }));
    if (stoneMat && stoneMat.map) { const t = keep(stoneMat.map.clone()); t.needsUpdate = true; t.repeat.set(TILE / 2.6, TILE / 2.6); slabMat.map = t; }
    const NT = TILES.length;
    const slabs = put(new THREE.InstancedMesh(keep(new THREE.BoxGeometry(TILE * 0.97, 0.22, TILE * 0.97)), slabMat, NT));
    const holes = put(new THREE.InstancedMesh(flatGeo, keep(new THREE.MeshBasicMaterial({ map: holeTex, fog: false })), NT));
    const cracks = put(new THREE.InstancedMesh(flatGeo, glowMat('#ff3a1a', 0.9, crackTex), NT));
    for (const m of [slabs, holes, cracks]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceMatrix.array.fill(0); m.instanceMatrix.needsUpdate = true; }
    const _o = new THREE.Object3D();
    const setInst = (m, i, x, y, z, s, rx = 0, rz = 0, ry = 0) => { _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); };
    let tilesLive = 0, lastRewrite = -99;
    function rewrite() {
        const p = P(), pr = Math.hypot(p.x, p.z), pa = Math.atan2(p.x, p.z);
        const shape = pr < 3.2 ? 'ring' : ['band', 'ring', 'patch'][Math.floor(rand() * 3)];
        const hold = [0, 10, 9, 8][B.act];
        let n = 0;
        for (const T of TILES) {
            if (T.state) continue;
            let pick = false;
            if (shape === 'band') { const s = Math.abs(T.cx * Math.cos(pa) - T.cz * Math.sin(pa)), f = T.cx * Math.sin(pa) + T.cz * Math.cos(pa); pick = f > 0 && s < 2.1; }
            else if (shape === 'ring') pick = T.r > 7.4 && Math.abs(angDiff(T.ang, pr < 3.2 ? rand() * TAU : pa)) < 1.0;
            else pick = Math.hypot(T.cx - p.x, T.cz - p.z) < 3.1;
            if (!pick) continue;
            T.state = 1; T.t = -hash(n) * 0.25; T.hold = hold; T.vy = 0; T.spin = (rand() - 0.5) * 6;
            n++;
        }
        tilesLive += n;
        lastRewrite = ctx.time();
        fx('tileCrack'); sfx.rumble(1.6);
        bark(B.said.rewrite ? 'rewrite2' : 'rewrite');
        B.said.rewrite = true;
        return n;
    }
    function tilesFrame(dt) {
        if (!tilesLive) return;
        const p = P(), crackT = 1.4;
        let live = 0, fell = false, inHole = false;
        for (let i = 0; i < NT; i++) {
            const T = TILES[i];
            if (!T.state) continue;
            live++;
            T.t += dt;
            if (T.state === 1) {
                // Cracking: the slab shows, shakes, its cracks burn brighter
                const k = clamp01(T.t / crackT), j = k * 0.03 * Math.sin(age * 60 + i);
                setInst(slabs, i, T.cx + j, -0.1, T.cz, 1);
                setInst(cracks, i, T.cx, 0.02, T.cz, TILE * 0.97 * (0.6 + 0.4 * k));
                cracks.material.opacity = 0.9;
                if (T.t >= crackT) { T.state = 2; T.t = 0; T.vy = 5 + rand() * 3; fell = true; setInst(cracks, i, 0, -50, 0, 0); }
            } else if (T.state === 2) {
                // Torn out: the slab flies up, tumbling, toward it, and is gone; the hole is left
                const y = -0.1 + T.vy * T.t - 2 * T.t * T.t;
                const k = clamp01(T.t / 1.3);
                setInst(slabs, i, mix(T.cx, B.x, k * k * 0.6), y, mix(T.cz, B.z, k * k * 0.6), Math.max(0.001, 1 - k), T.t * T.spin, T.t * T.spin * 0.6);
                setInst(holes, i, T.cx, 0.02, T.cz, TILE * Math.min(1, T.t * 4));
                if (k >= 1) { T.state = 3; T.t = 0; setInst(slabs, i, 0, -50, 0, 0); drop(mix(T.cx, B.x, 0.6), y, mix(T.cz, B.z, 0.6), 0, 0.5, 0); }
            } else if (T.state === 3) {
                setInst(holes, i, T.cx, 0.02, T.cz, TILE);
                if (T.t > T.hold) { T.state = 4; T.t = 0; }
            } else {
                // Mended: the hole closes
                const k = clamp01(T.t / 1.0);
                setInst(holes, i, T.cx, 0.02, T.cz, TILE * (1 - k));
                if (k >= 1) { T.state = 0; setInst(holes, i, 0, -50, 0, 0); live--; }
            }
            if ((T.state === 2 && T.t > 0.2) || T.state === 3) if (Math.abs(p.x - T.cx) < TILE / 2 && Math.abs(p.z - T.cz) < TILE / 2) inHole = true;
        }
        if (fell) { fx('tileFall'); sfx.thud(); ctx.shake(0.45); }
        if (inHole && ctx.time() - hits.hole > 0.7) { hits.hole = ctx.time(); hurt(9, p.x, p.z, { kind: 'zone', unblockable: true, knock: 0.2 }); }
        tilesLive = live;
        slabs.instanceMatrix.needsUpdate = holes.instanceMatrix.needsUpdate = cracks.instanceMatrix.needsUpdate = true;
    }
    function mendAll() {
        for (const T of TILES) T.state = 0;
        tilesLive = 0;
        for (const m of [slabs, holes, cracks]) { m.instanceMatrix.array.fill(0); m.instanceMatrix.needsUpdate = true; }
    }
    const holeAt = (x, z) => { if (!tilesLive) return false; for (const T of TILES) if (T.state >= 1 && T.state <= 3 && Math.abs(x - T.cx) < TILE / 2 + 0.3 && Math.abs(z - T.cz) < TILE / 2 + 0.3) return true; return false; };

    // ── The last stand: every page in one wall closing in, one gap that moves, and a last beam ──
    const LAST = { live: false, t: 0, R: 12, gap: 0, gw: 0, beam: flat(colGeo, glowMat('#fff0e0', 0)), beam2: flat(colGeo, glowMat('#ff2a14', 0)), safe: flat(stripGeo, glowMat('#fff6e0', 0)), mark: null, hitBeam: false };
    const GATHER = 3.0, CLOSE = 6.5;
    function lastFrame(dt) {
        if (!LAST.live) { hideRange(WALL0, WALL0 + WALL); LAST.beam.visible = LAST.beam2.visible = LAST.safe.visible = false; return; }
        LAST.t += dt;
        const t = LAST.t, p = P();
        // The wall: out to the edge as it gathers, then closing on the middle
        const g = clamp01(t / GATHER), c = clamp01((t - GATHER) / CLOSE);
        LAST.R = t < GATHER ? 12 : mix(12, 3.3, ease(c));
        LAST.gap += dt * 0.28;
        const R = LAST.R, gw = 1.5 / R;
        for (let k = 0; k < WALL; k++) {
            const layer = k % 3, f = Math.floor(k / 3) / (WALL / 3);
            const ang = f * TAU + age * 0.4 * (layer === 1 ? -1 : 1);
            const inG = Math.abs(angDiff(ang, LAST.gap)) < gw;
            const fromX = B.x, fromZ = B.z, fromY = F.y + 3;
            const kk = clamp01(g * 1.4 - hash(k) * 0.4);
            const sa = Math.sin(ang), ca = Math.cos(ang);
            const x = mix(fromX, sa * R, kk), z = mix(fromZ, ca * R, kk), y = mix(fromY, 0.4 + layer * 0.85 + Math.sin(age * 3 + k) * 0.1, kk);
            const s = inG || t > GATHER + CLOSE + 0.2 ? 0 : 1;
            lay(WALL0 + k, x, y, z, Math.sin(age * 5 + k) * ca, 0.8, -Math.sin(age * 5 + k) * sa, sa, 0.1, ca, 0.42 * s, 0.56 * s);
        }
        // A pale strip on the stone shows the way out
        LAST.safe.visible = t > GATHER - 0.5 && t < GATHER + CLOSE;
        if (LAST.safe.visible) { LAST.safe.position.set(Math.sin(LAST.gap) * (R - 1.5), 0.05, Math.cos(LAST.gap) * (R - 1.5)); LAST.safe.rotation.y = LAST.gap; LAST.safe.scale.set(2.2, 1, 3.2); LAST.safe.material.opacity = 0.35 + Math.sin(age * 6) * 0.1; }
        if (t > GATHER && t < GATHER + CLOSE + 0.2) {
            const d = Math.hypot(p.x, p.z), pa = Math.atan2(p.x, p.z);
            if (Math.abs(d - R) < 0.75 && Math.abs(angDiff(pa, LAST.gap)) > gw && ctx.time() - hits.wall > 0.8) {
                hits.wall = ctx.time();
                if (hurt(20, p.x * 1.2, p.z * 1.2, { kind: 'zone', unblockable: true, knock: 0 }) === 'hit') ctx.push(-p.x / (d || 1) * 1.2, -p.z / (d || 1) * 1.2);
            }
            // Inside, the wall keeps them in
            if (d > R - 0.8 && d < R && Math.abs(angDiff(pa, LAST.gap)) > gw && p.state !== 'roll') ctx.push(-p.x / (d || 1) * 3 * dt, -p.z / (d || 1) * 3 * dt);
        }
        if (t > GATHER + CLOSE - 1.6 && !LAST.mark) LAST.mark = spot(0, 0, 3.4, 1.6, 40, 'beam', () => { fx('inkBeam'); sfx.thud(); sfx.rumble(2); ctx.shake(1); ctx.flash('#ffd8c8', 0.4); eye.flare = 1.2; LAST.hitBeam = true; });
        const bt = t - (GATHER + CLOSE);
        LAST.beam.visible = LAST.beam2.visible = bt > -0.05 && bt < 1.2;
        if (LAST.beam.visible) {
            const k = 1 - clamp01(bt / 1.2);
            LAST.beam.position.set(0, 0, 0); LAST.beam.scale.set(1.6, 30, 1.6); LAST.beam.material.opacity = k;
            LAST.beam2.position.set(0, 0, 0); LAST.beam2.scale.set(3.6, 30, 3.6); LAST.beam2.material.opacity = 0.6 * k;
        }
        if (bt > 1.2) { LAST.live = false; LAST.mark = null; }
    }

    // ═════════════ It ═════════════
    const p0 = ctx.P, pl = Math.hypot(p0.x, p0.z) || 1;
    const home = { x: pl > 0.5 ? -p0.x / pl * 6.2 : 0, z: pl > 0.5 ? -p0.z / pl * 6.2 : -6.2 };
    const F = { y: HIGH };
    let B = null, fighting = false, checkpoint = 100, hot = 0, down = false;
    function fresh(hp, act) {
        const p = P();
        B = { x: home.x, z: home.z, yaw: Math.atan2(p.x - home.x, p.z - home.z), vx: 0, vz: 0, alt: HIGH, altTo: HIGH, hp, act, state: 'idle', t: 0, cool: 1.4, last: '', lastEcho: '', did: {}, n: 0,
            flinch: 0, posture: 0, postT: 0, under: 0, orbit: Math.atan2(home.x - p.x, home.z - p.z), orbitDir: 1, stand: hp <= 15 ? 1 : 0, bark: -9, said: {}, echoes: [], spot: null, plan: null };
        down = false; hot = 0;
        look.spreadTo = 1; look.haloTo = 1; look.wingTo = 1; look.faceTo = 1;
        hands('rest');
    }
    fresh(100, 1);

    function bark(kind, force) {
        const T = ctx.time();
        if (!force && T - B.bark < 5) return;
        const L = LINES[kind];
        if (!L) return;
        const s = typeof L === 'string' ? L : L[Math.floor(rand() * L.length)];
        B.bark = T;
        ctx.line(s.replace('{NAME}', ctx.heroName || 'VISITOR'), 2.4);
    }
    function clearMine() {
        for (const s of SPOTS) { s.live = false; s.inkT = 0; s.ring.visible = s.fill.visible = s.ink.visible = false; freeQuill(s.quill); s.quill = null; }
        for (const L of LINES_) { L.live = false; L.inkT = 0; L.mark.visible = L.ink.visible = L.core.visible = L.halo.visible = false; }
        CROSS.live = false; for (const A of CROSS.arms) A.beam.visible = A.glow.visible = A.mark.visible = A.lead.visible = false;
        for (const v of WAVES) { v.live = false; for (const m of v.arcs) m.visible = false; }
        hideRange(STORM0, STORM0 + STORM_PER * STORM_W);
        for (const d of DARTS) { d.live = false; freeQuill(d.q); d.q = null; }
        scy.live = false; stab.live = false; volley.live = false;
        scyG.visible = wielder.visible = trail.visible = false;
        for (const L of LEGS) L.thigh.visible = L.shin.visible = L.tip.visible = false;
        LAST.live = false; LAST.mark = null;
        for (const q of QUILLS) freeQuill(q);
    }

    // Hit by its own quill, turned back: knocked out of the air
    function quillReturned() {
        if (B.state === 'down' || B.state === 'last') return;
        sfx.thud(); ctx.shake(0.6);
        ctx.spark(B.x, F.y + 3, B.z, 3, '#fff2c8');
        for (let k = 0; k < 6; k++) drop(B.x, F.y + 3, B.z, (rand() - 0.5) * 4, 1.5, (rand() - 0.5) * 4);
        B.hp = Math.max(B.stand ? 0 : 12, B.hp - 5);
        B.posture += 35; B.postT = 0;
        bark('parried');
        if (B.posture >= 100) { begin('stagger'); B.posture = 0; ctx.score.stinger && ctx.score.stinger('stagger'); }
        else if (B.state !== 'stagger' && B.state !== 'spent') begin('struck');
        acts();
    }
    function begin(state) { B.state = state; B.t = 0; B.did = {}; B.n = 0; if (state !== 'idle') B.last = state; }
    function settle(cool) { B.state = 'idle'; B.t = 0; B.cool = cool ?? (0.7 + rand() * 0.6) / SPD[B.act]; B.altTo = HIGH; hands('rest'); look.spreadTo = 1; look.haloTo = 1; look.cast = 0; }
    const first = key => { if (B.did[key]) return false; B.did[key] = true; return true; };
    // Picks a spot to come down at: between the visitor and where it is, off the brazier, on the roof
    function landing(dist) {
        const p = P();
        let dx = B.x - p.x, dz = B.z - p.z, l = Math.hypot(dx, dz) || 1;
        let x = p.x + dx / l * dist, z = p.z + dz / l * dist;
        let r = Math.hypot(x, z);
        if (r > 9) { x *= 9 / r; z *= 9 / r; }
        r = Math.hypot(x, z);
        if (r < 3.3) { const k = 3.3 / (r || 1); x = (x || 0.1) * k; z *= k; }
        return { x, z };
    }
    function acts() {
        const next = B.hp <= 33 ? 3 : B.hp <= 66 ? 2 : 1;
        if (next > B.act) { B.act = next; checkpoint = next === 2 ? 66 : 33; bark(next === 2 ? 'act2' : 'act3', true); sfx.roar(2); ctx.score.stinger && ctx.score.stinger('phase'); }
        if (ctx.score.intensity) ctx.score.intensity(clamp01((100 - B.hp) / 85));
        if (B.hp <= 15 && !B.stand && B.state !== 'last' && B.state !== 'down') { clearMine(); begin('last'); }
    }

    function pick(dist) {
        const opts = [];
        const add = (n, w) => { if (n !== B.last) opts.push([n, w]); };
        add('line', 2.0); add('rain', 2.2); add('darts', 1.6); add('storm', 1.8); add('echo', 3.2);
        if (B.act >= 2) add('cross', 2.0);
        if (!tilesLive && ctx.time() - lastRewrite > (B.act === 1 ? 20 : 12)) add('rewrite', 2.6);
        let roll = rand() * opts.reduce((s, o) => s + o[1], 0);
        for (const [n, w] of opts) { roll -= w; if (roll <= 0) return n; }
        return 'echo';
    }

    // ── Deciding and moving (the fight clock) ──
    function think(dt) {
        const p = P(), sp = SPD[B.act];
        const dx = p.x - B.x, dz = p.z - B.z, dist = Math.hypot(dx, dz) || 1, aim = Math.atan2(dx, dz);
        let tx = B.x, tz = B.z, maxV = 3.5, face = 3;
        B.t += dt;
        B.flinch = toward(B.flinch, 0, 4, dt);
        B.postT += dt;
        if (B.postT > 2) B.posture = Math.max(0, B.posture - 9 * dt);
        hot = 0;
        if (ctx.mode === 'dead' && !B.said.dead) { B.said.dead = true; bark('fell', true); }
        if (ctx.mode !== 'play' || !fighting) {
            // Waiting: it hangs where it is and watches
            B.altTo = HIGH;
        } else if (B.state === 'idle') {
            // Hangs out of reach, drifting round the visitor
            B.altTo = HIGH;
            B.orbit += dt * 0.22 * B.orbitDir;
            if (rand() < dt * 0.08) B.orbitDir *= -1;
            tx = p.x + Math.sin(B.orbit) * 6.6; tz = p.z + Math.cos(B.orbit) * 6.6;
            const r = Math.hypot(tx, tz);
            if (r > 9.5) { tx *= 9.5 / r; tz *= 9.5 / r; }
            maxV = 2.6;
            // The visitor hiding under it is thrown off
            B.under = dist < 2.4 ? B.under + dt : Math.max(0, B.under - dt);
            B.cool -= dt;
            if (B.under > 0.9) { B.under = 0; begin('burst'); }
            else if (B.cool <= 0) { const n = pick(dist); begin(n); }
        } else if (B.state === 'burst') {
            const wind = 0.8 / sp;
            look.spreadTo = 0.4; hands('fling');
            if (first('mark')) spot(B.x, B.z, 3.4, wind, 14, 'zone', () => {
                sfx.thud(); fx('wingBeat'); ctx.shake(0.5);
                ctx.haz.wave({ x: B.x, z: B.z, r0: 1, max: 6, dmg: 0 });
                for (let k = 0; k < 8; k++) drop(B.x, F.y + 1, B.z, Math.sin(k) * 5, 1, Math.cos(k) * 5);
                B.n = 1;
            });
            if (B.n && dist < 4.5) ctx.push(dx / dist * 9 * dt, dz / dist * 9 * dt);
            hot = clamp01(B.t / wind);
            if (B.t > wind + 0.6) settle(0.5);
        } else if (B.state === 'line') {
            const wind = 0.95 / sp;
            face = 2;
            if (first('draw')) {
                const lead = 0.25;
                const L = inkLine(p.x + p.vx * lead, p.z + p.vz * lead, aim + Math.PI / 2 + (rand() - 0.5) * 1.2, wind);
                B.plan = L; fx('inkBeam');
                if (B.act >= 2) B.n = 1;
            }
            if (B.plan) { const L = B.plan, h = Math.max(0, (L.t - L.wind) * L.speed); aimHand(L.x + L.dx * Math.min(h, L.len), 0, L.z + L.dz * Math.min(h, L.len)); }
            hot = clamp01(B.t / wind);
            if (B.n === 1 && B.t > 0.55 && first('second')) { B.plan = inkLine(p.x, p.z, aim + (rand() - 0.5) * 0.8, wind); }
            if (B.t > wind + 1.6) { B.plan = null; settle(); }
        } else if (B.state === 'cross') {
            const C = CROSS;
            if (first('go')) { B.spot = landing(4.6); C.live = true; C.t = 0; C.wind = 1.3 / sp; C.w = 0.5 * sp; C.dir = rand() < 0.5 ? 1 : -1; C.a0 = aim + Math.PI / 4; fx('inkBeam'); }
            tx = B.spot.x; tz = B.spot.z; maxV = 6;
            B.altTo = LOW + 0.45;
            hands('cross'); look.spreadTo = 1.25; look.cast = 1;
            face = 0;
            B.yaw = toward(B.yaw, C.a + Math.PI / 4, 8, dt);
            if (!C.live) { if (first('rec')) B.n = B.t; if (B.t - B.n > 1.3 / sp) settle(); }
        } else if (B.state === 'storm') {
            const wind = 1.0 / sp, count = B.act + 1, every = 0.8 / sp;
            look.spreadTo = 1.35; look.haloTo = 1.3; look.cast = 1; hands('cast');
            maxV = 0.5;
            if (B.t >= wind) {
                const n = Math.min(count, Math.floor((B.t - wind) / every) + 1);
                while (B.n < n) { B.n++; storm(rand() * TAU, (B.n % 2 ? 1 : -1) * 0.32 * sp); fx('wingBeat'); }
            } else hot = B.t / wind;
            const end = wind + (count - 1) * every;
            if (B.t > end) { B.altTo = LOW + 0.3; hands('slump'); look.spreadTo = 0.7; look.cast = 0; }
            if (B.t > end + 2.0 / sp) settle();
        } else if (B.state === 'rain') {
            const wind = 0.6 / sp;
            hands('write'); look.cast = 0.5;
            if (first('plan')) {
                const pats = B.act === 1 ? ['rows', 'chase'] : B.act === 2 ? ['rows', 'chase', 'spiral'] : ['spiral', 'rows', 'chase'];
                B.plan = pats[Math.floor(rand() * pats.length)];
                B.n = 0; B.did.until = wind + 1;
                const fdx = dx / dist, fdz = dz / dist, px = -fdz, pz = fdx;
                if (B.plan === 'rows') {
                    let gapPrev = -1;
                    for (let k = 0; k < 3; k++) {
                        let gap = Math.floor(rand() * 5); if (gap === gapPrev) gap = (gap + 2) % 5; gapPrev = gap;
                        const cx = p.x + fdx * 2.8 * (1 - k), cz = p.z + fdz * 2.8 * (1 - k), land = wind + 0.5 + k * 0.45 / sp;
                        for (let m = 0; m < 5; m++) {
                            if (m === gap) continue;
                            const x = cx + px * (m - 2) * 2.7, z = cz + pz * (m - 2) * 2.7, r = Math.hypot(x, z);
                            if (r > ARENA + 0.5 || r < 1.2) continue;
                            spot(x, z, 1.3, land, 22);
                        }
                        B.did.until = land + 0.8;
                    }
                } else if (B.plan === 'spiral') {
                    const a0 = rand() * TAU;
                    for (let k = 0; k < 12; k++) {
                        const a = a0 + k * 0.75, rr = 5.2 * (1 - k / 12) + 0.4, x = p.x + Math.sin(a) * rr, z = p.z + Math.cos(a) * rr;
                        if (Math.hypot(x, z) > ARENA + 0.5) continue;
                        spot(x, z, 1.25, wind + 0.5 + k * 0.13 / sp, 22);
                    }
                    B.did.until = wind + 0.5 + 12 * 0.13 / sp + 0.8;
                } else B.did.until = wind + 6 * 0.42 / sp + 1.2;
            }
            if (B.plan === 'chase' && B.t >= wind) {
                const n = Math.min(6, Math.floor((B.t - wind) / (0.42 / sp)) + 1);
                while (B.n < n) { B.n++; spot(p.x + p.vx * 0.3, p.z + p.vz * 0.3, 1.35, 0.8 / sp, 22); }
            }
            hot = clamp01(B.t / wind) * 0.5;
            if (B.t > B.did.until) settle();
        } else if (B.state === 'darts') {
            const wind = 0.65 / sp, count = B.act >= 3 ? 5 : 3, every = 0.42 / sp;
            face = 6;
            hands('throw');
            if (B.t >= wind) {
                const n = Math.min(count, Math.floor((B.t - wind) / every) + 1);
                while (B.n < n) { B.n++; handAt(_a, 1); dart(_a); }
            }
            hot = B.t < wind ? B.t / wind : 0;
            if (B.t > wind + count * every + 0.7 / sp) settle();
        } else if (B.state === 'echo') {
            const wind = 0.9 / sp;
            if (first('plan')) {
                B.spot = landing(5.2);
                const kinds = ['scythe', 'legs', 'volley'].filter(k => k !== B.lastEcho);
                const a = kinds[Math.floor(rand() * kinds.length)];
                B.echoes = [a];
                if (B.act >= 3) { const rest = ['scythe', 'legs', 'volley'].filter(k => k !== a); B.echoes.push(rest[Math.floor(rand() * rest.length)]); }
                B.lastEcho = a;
                bark(B.echoes.length > 1 ? 'both' : a, false);
            }
            tx = B.spot.x; tz = B.spot.z; maxV = 6;
            B.altTo = LOW + 0.35;
            hands('cast'); look.spreadTo = 1.3; look.haloTo = 1.35; look.cast = 1;
            B.echoes.forEach((k, i) => {
                if (B.t >= wind + i * 0.7 && first('e' + i)) { if (k === 'scythe') echoScythe(); else if (k === 'legs') echoLegs(); else { volley.live = true; volley.t = 0; volley.n = 0; } }
            });
            hot = Math.max(scy.live ? scy.hot : 0, stab.live ? stab.hot : 0);
            const busy = scy.live || stab.live || volley.live;
            if (B.t > wind + 0.8 && !busy) { if (first('rec')) B.n = B.t; hands('slump'); look.spreadTo = 0.8; if (B.t - B.n > 1.1 / sp) settle(); }
        } else if (B.state === 'rewrite') {
            const wind = 1.4;
            if (first('plan')) { B.spot = landing(4.0); rewrite(); }
            tx = B.spot.x; tz = B.spot.z; maxV = 6;
            B.altTo = LOW + 0.2;
            hands(B.t < wind ? 'tearLow' : 'tearUp');
            look.spreadTo = B.t < wind ? 0.6 : 1.3;
            if (B.t >= wind && first('tear')) { sfx.roar(1.2); fx('wingBeat'); }
            if (B.t > wind + 1.2 / sp) settle();
        } else if (B.state === 'struck' || B.state === 'stagger' || B.state === 'spent') {
            // Knocked down: low, open, wings drooping
            const len = B.state === 'struck' ? 2.4 : B.state === 'stagger' ? 3.0 : 8;
            B.altTo = B.state === 'struck' ? LOW : 0.25;
            hands('slump'); look.spreadTo = B.state === 'spent' ? 0.1 : 0.4; look.cast = 0;
            maxV = 0.8;
            face = 1;
            if (B.state === 'spent') { look.wingTo = mix(0.25, 1, clamp01((B.t - 2) / 6)); look.haloTo = look.wingTo; }
            if (B.t > len) { if (B.state === 'spent') { look.wingTo = 1; look.haloTo = 1; } settle(1.0); }
        } else if (B.state === 'last') {
            if (first('go')) { LAST.live = true; LAST.t = 0; LAST.R = 12; LAST.gap = aim + Math.PI + (rand() < 0.5 ? 1.3 : -1.3); bark('last', true); sfx.roar(3); fx('skyEye'); ctx.score.stinger && ctx.score.stinger('phase'); eye.flare = 0.8; }
            tx = 0; tz = 0; maxV = 4;
            B.altTo = 5.2;
            hands('cast'); look.spreadTo = 1.4; look.cast = 1;
            look.wingTo = 1 - clamp01(B.t / GATHER) * 0.8; look.haloTo = look.wingTo;
            if (!LAST.live && B.t > 1) {
                B.stand = 1; begin('spent'); bark('spent', true);
                // It falls beside the brazier, toward the visitor
                const l = Math.hypot(p.x, p.z) || 1;
                B.spot = { x: p.x / l * 3.6, z: p.z / l * 3.6 };
            }
        }
        if (B.state === 'spent' && B.spot) { tx = B.spot.x; tz = B.spot.z; maxV = 3; }
        // Glide toward where it wants to be
        const gx = tx - B.x, gz = tz - B.z, gl = Math.hypot(gx, gz), v = Math.min(maxV, gl * 1.8);
        B.vx = toward(B.vx, gl > 0.01 ? gx / gl * v : 0, 3, dt);
        B.vz = toward(B.vz, gl > 0.01 ? gz / gl * v : 0, 3, dt);
        B.x += B.vx * dt; B.z += B.vz * dt;
        if (face) B.yaw += angDiff(aim, B.yaw) * Math.min(1, dt * face);
        B.alt = toward(B.alt, B.altTo, B.altTo < B.alt ? 3.2 : 1.8, dt);
        const r = Math.hypot(B.x, B.z);
        if (r > 10.2) { B.x *= 10.2 / r; B.z *= 10.2 / r; }
        if (B.alt < 2 && r < 2.9) { const k = 2.9 / (r || 1); B.x = (B.x || 0.1) * k; B.z *= k; }
    }

    function hazards(dt) {
        spotsFrame(dt); linesFrame(dt); crossFrame(dt); wavesFrame(dt); dartsFrame(dt);
        scytheFrame(dt); legsFrame(dt); volleyFrame(dt); tilesFrame(dt); lastFrame(dt);
    }
    function update(dt) {
        think(dt);
        hazards(dt);
        // Pages come loose and fall, all the time
        looseAcc += dt * (2.5 + look.cast * 3);
        while (looseAcc > 1) {
            looseAcc--;
            const i = Math.floor(rand() * FIG), o = i * 11;
            if (SL[o + 9] > 0.05) drop(SL[o], SL[o + 1], SL[o + 2], (rand() - 0.5) * 1.5, 0, (rand() - 0.5) * 1.5, 0.9);
        }
        // Sound for its wings when they move hard
        if (look.cast && rand() < dt * 0.4) fx('pageFlutter');
    }

    // ═════════════ Every frame, cut-scenes too: the body, the pages, the sky ═════════════
    const intro = { on: false, t: 0, fold: -1, P: { x: 0, z: 0 } };
    const outro = { on: false, burn: -1 };
    const _w = V(), _c = V();
    function placeBody(dt) {
        look.spread = toward(look.spread, look.spreadTo, 3, dt);
        look.halo = toward(look.halo, look.haloTo, 3, dt);
        look.wing = toward(look.wing, look.wingTo, 2.5, dt);
        look.face = toward(look.face, look.faceTo, 2, dt);
        // Wings beat slowly; harder when it moves or casts
        const sp = Math.hypot(B.vx, B.vz);
        look.flap = Math.sin(age * (1.6 + look.cast * 1.5)) * (0.12 + Math.min(0.25, sp * 0.06) + look.cast * 0.08) * clamp01(look.spread);
        look.bob = Math.sin(age * 1.3) * 0.12 * (B.alt > 0.6 ? 1 : 0.3);
        const fwx = Math.sin(B.yaw), fwz = Math.cos(B.yaw);
        look.lean = toward(look.lean, (B.vx * fwx + B.vz * fwz) * 0.06 + B.flinch * -0.25, 4, dt);
        look.bank = toward(look.bank, (B.vx * fwz - B.vz * fwx) * -0.05, 4, dt);
        F.y = B.alt + look.bob;
        body.position.set(B.x, F.y, B.z);
        body.rotation.set(look.lean, B.yaw, look.bank);
        body.updateMatrix();
        E = body.matrix.elements;
        for (const pt of points) { pt.material.opacity = look.face * (0.85 + Math.sin(age * 7) * 0.15); pt.scale.set(0.16 * (0.4 + look.face * 0.6), 0.08, 1); }
        const shown = cut.value < 50 ? 1 : 0;           // nothing glows before the body has formed
        haloGlow.material.opacity = 0.28 * look.halo * clamp01(look.wing + 0.2) * shown;
        under.intensity = 9 * shown * clamp01(body.visible ? 1 : 0) * (outro.on ? clamp01(1 - (outro.burn - 1) / 4) : 1);
        pool.visible = body.visible && shown > 0;
        pool.position.set(B.x, 0.045, B.z);
        pool.scale.setScalar(4.5 - Math.min(2, B.alt * 0.4));
        pool.material.opacity = (0.55 - Math.min(0.35, B.alt * 0.07)) * (outro.on ? clamp01(1 - (outro.burn - 1) / 4) : 1);
    }
    function skyFrame(dt) {
        sky.visible = eye.on;
        if (!eye.on) return;
        ctx.camera.getWorldPosition(sky.position);
        const p = P();
        // It turns, slowly, to keep behind the figure as the visitor sees it, and the pupil follows the visitor
        if (!intro.on && !outro.on) {
            const want = Math.atan2(B.x - p.x, B.z - p.z);
            eye.az += angDiff(want, eye.az) * Math.min(1, dt * 0.25);
            eye.blinkAt -= dt;
            if (eye.blinkAt < 0) { eye.blink = 0.4; eye.blinkAt = 6 + rand() * 4; }
        }
        eye.blink = Math.max(0, eye.blink - dt);
        const bl = eye.blink > 0 ? Math.sin(eye.blink / 0.4 * Math.PI) : 0;
        eye.flare = Math.max(0, eye.flare - dt);
        const ce = Math.cos(eye.el);
        SU.uEye.value.set(Math.sin(eye.az) * ce, Math.sin(eye.el), Math.cos(eye.az) * ce);
        const rx = Math.cos(eye.az), rz = -Math.sin(eye.az);       // the eye's right, on the roof
        SU.uLook.value.x = toward(SU.uLook.value.x, Math.max(-1, Math.min(1, (p.x * rx + p.z * rz) / 7)), 3, dt);
        SU.uLook.value.y = -0.5;
        SU.uOpen.value = eye.open * (1 - bl);
        SU.uReveal.value = eye.reveal;
        SU.uRed.value = eye.red;
        SU.uPupil.value = eye.pupil;
        SU.uFlare.value = eye.flare;
        SU.uTime.value += dt;
        SU.uDawn.value = eye.dawn;
        if (scene.fog && saved.fog) {
            _fc.copy(saved.fog).lerp(FOG_RED, eye.red * 0.8).lerp(FOG_DAWN, eye.dawn);
            scene.fog.color.copy(_fc);
            if (scene.fog.density !== undefined) scene.fog.density = mix(saved.density, 0.016, eye.dawn);
        }
        dawnLight.intensity = eye.dawn * 1.1;
    }
    function pagesFrame(dt) {
        if (intro.on) return introPages();
        if (outro.on) return outroPages(dt);
        if (body.visible) { slots(); writeSlots(1); } else hideRange(0, FIG);
    }
    function posed(dt) {
        age += dt;
        placeBody(dt);
        armsFrame(dt);
        stripsFrame();
        pagesFrame(dt);
        looseFrame(dt);
        embersFrame(dt);
        if (!LAST.live) hideRange(WALL0, WALL0 + WALL);
        pages.instanceMatrix.needsUpdate = true;
        if (colorsDirty) { pages.instanceColor.needsUpdate = true; colorsDirty = false; }
        skyFrame(dt);
    }

    // ═════════════ The entrance ═════════════
    // Pages rise from the cracks in the roof, a few, then thousands, into a column climbing into the sky; the sky
    // opens on one vast eye; the column folds into a figure hanging in front of it, its wings unfurl; silence; name.
    const COL_H = 30;
    function introPages() {
        const t = intro.t, P0 = intro.P;
        const hx = B.x, hz = B.z;
        slots();
        const ux = hx - P0.x, uz = hz - P0.z, ul = Math.hypot(ux, uz) || 1;
        for (let i = 0; i < NP; i++) {
            const h1 = hash(i), h2 = hash(i + 0.37), h3 = hash(i + 0.71);
            // Where it comes out of the stone: the first few in front of the low camera, the rest anywhere on the roof
            let sx, sz, e;
            if (i % 37 === 0) { const f = 2.5 + h1 * 6; sx = P0.x + ux / ul * f + (h2 - 0.5) * 3 * (uz / ul); sz = P0.z + uz / ul * f - (h2 - 0.5) * 3 * (ux / ul); e = 0.2 + h3 * 2.0; }
            else { const a = h1 * TAU, rr = 2 + Math.sqrt(h2) * 9.5; sx = Math.sin(a) * rr; sz = Math.cos(a) * rr; e = 2.2 + h3 * 2.0; }
            const s = clamp01((t - e) / 3.2);
            if (s <= 0) { hidePage(i); continue; }
            const Ht = 1 + h2 * COL_H;
            const y = 0.05 + Math.pow(s, 1.3) * Ht;
            const b = ease(s / 0.7);
            const ca = h1 * TAU + t * (1.2 + h3) + y * 0.15, cr = 0.5 + y * 0.07 + h3 * 0.5;
            let x = mix(sx, hx + Math.sin(ca) * cr, b), z = mix(sz, hz + Math.cos(ca) * cr, b), yy = y;
            const tum = t * (3 + h1 * 3) + i;
            let px = Math.sin(tum), py = 0.6, pz = Math.cos(tum * 0.8), w = 0.34, h = 0.46;
            let fx_ = Math.cos(i), fy = 0.3, fz = Math.sin(i);
            // Folding: each page goes to its place on the figure, the top of the column last
            if (intro.fold >= 0) {
                const f = ease(clamp01((intro.fold - (Ht / COL_H) * 1.0 - h1 * 0.25) / 0.9));
                if (i < FIG) {
                    const o = i * 11;
                    x = mix(x, SL[o], f); yy = mix(yy, SL[o + 1], f); z = mix(z, SL[o + 2], f);
                    px = mix(px, SL[o + 3], f); py = mix(py, SL[o + 4], f); pz = mix(pz, SL[o + 5], f);
                    fx_ = mix(fx_, SL[o + 6], f); fy = mix(fy, SL[o + 7], f); fz = mix(fz, SL[o + 8], f);
                    w = mix(w, SL[o + 9], f); h = mix(h, SL[o + 10], f);
                } else {
                    x = mix(x, hx + (h2 - 0.5) * 0.8, f); yy = mix(yy, F.y + 0.5 + h3 * 4, f); z = mix(z, hz + (h1 - 0.5) * 0.8, f);
                    w *= 1 - f; h *= 1 - f;
                }
            }
            const pl_ = Math.hypot(px, py, pz) || 1;
            lay(i, x, yy, z, px / pl_, py / pl_, pz / pl_, fx_, fy, fz, w, h);
        }
    }
    async function playIntro(shot) {
        const p = P();
        intro.on = true; intro.t = 0; intro.fold = -1; intro.P = { x: p.x, z: p.z };
        hideOld();
        fresh(100, 1);
        body.visible = true;
        cut.value = 99; edge.value.set('#fff4e0');
        look.spread = 0; look.spreadTo = 0; look.face = 0; look.faceTo = 0; look.cast = 0;
        hands('cast');
        eye.on = true; eye.open = 0; eye.reveal = 0; eye.red = 0; eye.pupil = 1.8; eye.dawn = 0;
        const ux0 = B.x - p.x, uz0 = B.z - p.z, ul = Math.hypot(ux0, uz0) || 1, ux = ux0 / ul, uz = uz0 / ul, sx = uz, sz = -ux;
        eye.az = Math.atan2(ux, uz);
        const at = (f, s, y) => [p.x + ux * f + sx * s, y, p.z + uz * f + sz * s];
        const H = (y) => [B.x, y, B.z];
        const said = {};
        const once = (k, cond) => { if (cond && !said[k]) { said[k] = true; return true; } return false; };
        shot.each((dt, t) => {
            intro.t = t;
            if (once('f1', t > 0.3)) { fx('pageFlutter'); sfx.whoosh(); }
            if (once('f2', t > 2.4)) { fx('pageFlutter'); sfx.rumble(3); ctx.shake(0.3); }
            if (once('l1', t > 2.7)) shot.say('THE LAST CHAPTER OPENS.', 2.2);
            eye.reveal = ramp(t, 4.7, 5.9); eye.red = ramp(t, 4.6, 6.2); eye.open = ramp(t, 5.3, 6.6);
            eye.pupil = mix(1.8, 0.65, ramp(t, 6.4, 7.0));
            if (once('eye', t > 4.8)) { fx('skyEye'); sfx.rumble(3.5); ctx.shake(0.5); }
            if (once('l2', t > 5.9)) shot.say('AND THE VISITOR LOOKED UP.', 2.4);
            if (t > 7.4) intro.fold = t - 7.4;
            if (once('fold', t > 7.4)) { sfx.whoosh(); fx('pageFlutter'); }
            if (once('l3', t > 7.8)) shot.say(`${ctx.heroName || 'VISITOR'}. I HAVE WRITTEN YOUR END.`, 2.4);
            cut.value = t < 7.6 ? 99 : mix(F.y + 6.5, F.y - 3, ramp(t, 7.6, 9.6));
            if (t > 9.0) { look.spreadTo = t < 10.2 ? 1.3 : 1; }
            if (once('wings', t > 9.0)) { fx('wingBeat'); sfx.thud(); shot.slow(0.4); for (let k = 0; k < 14; k++) drop(B.x + (rand() - 0.5) * 6, F.y + 3 + rand() * 2, B.z + (rand() - 0.5) * 6, (rand() - 0.5) * 3, 1, (rand() - 0.5) * 3); }
            if (once('hush', t > 10.0)) { shot.slow(1); sfx.setDrone(false); if (ctx.score.stop) ctx.score.stop(0.4); }
            if (t > 10.2) look.faceTo = 1;
            update0(dt);
        });
        // 1. Out of the cracks: low across the stone, the first pages slipping up
        shot.cam(at(1.8, 1.5, 0.32), [...at(7, 0, 0.9)], { fov: 52 });
        shot.move(at(3.2, 1.1, 0.45), at(8, 0, 1.6), 2.4, { ease: k => k });
        await shot.wait(2.4);
        // 2. The column: low behind the visitor, tilting up as thousands climb into the sky
        shot.cam(at(-4.2, 1.6, 0.6), H(3), { fov: 62 });
        shot.move(at(-4.6, 1.8, 0.5), H(15), 2.2);
        await shot.wait(2.2);
        // 3. The sky opens: from the visitor's shoulder, up into it
        const ce = Math.cos(0.32), se = Math.sin(0.32);
        const c3 = at(-1.4, 0.6, 1.25);
        shot.cam(c3, [c3[0] + ux * ce * 20, c3[1] + se * 20, c3[2] + uz * ce * 20], { fov: 74 });
        shot.move(at(-1.1, 0.55, 1.2), [c3[0] + ux * ce * 20, c3[1] + se * 20 - 1.5, c3[2] + uz * ce * 20], 2.8);
        await shot.wait(2.8);
        // 4. The folding: wide and low, the figure hanging against the eye; wings unfurl
        let w4 = at(-6.5, 3.2, 0.45);
        const r4 = Math.hypot(w4[0], w4[2]);
        if (r4 > 11.6) { w4[0] *= 11.6 / r4; w4[2] *= 11.6 / r4; }
        shot.cam(w4, H(5.4), { fov: 60 });
        shot.move([w4[0] + ux * 0.8, 0.8, w4[2] + uz * 0.8], H(6), 2.6);
        await shot.wait(2.6);
        // 5. Its face, and its name
        const fy = HIGH + 4.3;
        shot.cam([B.x - ux * 2.4 + sx * 0.4, fy - 0.9, B.z - uz * 2.4 + sz * 0.4], [B.x, fy, B.z], { fov: 50 });
        shot.move([B.x - ux * 2.0 + sx * 0.3, fy - 0.7, B.z - uz * 2.0 + sz * 0.3], [B.x, fy + 0.05, B.z], 2.2);
        await shot.wait(0.3);
        if (!shot.skipped) { fx('titleHit'); sfx.thud(); sfx.setDrone(true); ctx.shake(0.4); }
        await shot.card('THE AUTHOR', 'what was written, and what was torn out', 1.9);
        // However it ended (played out or skipped), the figure is whole, the eye is open
        sfx.setDrone(true);
        intro.on = false;
        cut.value = -99;
        look.spread = look.spreadTo = 1; look.face = look.faceTo = 1;
        hands('rest');
        eye.reveal = 1; eye.red = 1; eye.open = 1; eye.pupil = 0.65;
        hideRange(FIG, NP);
        for (const pg of LP) pg.life = 0;
    }
    // In cut-scenes core does not call update: keep the body breathing and the loose pages falling
    function update0(dt) { B.flinch = toward(B.flinch, 0, 4, dt); }

    // ═════════════ The end ═════════════
    // Struck down, it drops to the roof for the first time; its pages burn from the edges in; what is left is a
    // small dark figure sitting by the cold brazier. The eye in the sky closes, and the horizon greys toward dawn.
    let small = null, smallLoad = null;
    try {
        smallLoad = ctx.loadCharacter && ctx.heroCls ? ctx.loadCharacter(ctx.heroCls).then(ch => {
            if (disposed) return;
            const dark = keep(new THREE.MeshLambertMaterial({ color: '#17100f' }));
            ch.root.traverse(o => { if (o.isMesh) { o.material = dark; o.frustumCulled = false; } });
            ch.root.visible = false;
            put(ch.root);
            small = ch;
        }).catch(e => console.warn('[author] no small figure:', e && e.message)) : null;
    } catch (e) { smallLoad = null; }
    let disposed = false;
    function outroPages(dt) {
        slots();
        const bt = outro.burn;
        for (let i = 0; i < FIG; i++) {
            // Wing tips first, then inward; the halo with the middle of the wings
            const along = i < WINGS ? (i % PER) / (PER - 1) : 0.5;
            const start = (1 - along) * 1.8 + hash(i) * 0.4;
            const k = clamp01((bt - start) / 0.9);
            const o = i * 11, c = i * 3;
            if (k > 0) {
                const hot_ = clamp01(k / 0.4), black = clamp01((k - 0.4) / 0.4);
                CA[c] = mix(mix(BASECOL[c], 1, hot_), 0.06, black);
                CA[c + 1] = mix(mix(BASECOL[c + 1], 0.45, hot_), 0.03, black);
                CA[c + 2] = mix(mix(BASECOL[c + 2], 0.12, hot_), 0.02, black);
                colorsDirty = true;
                if (k > 0.3 && k < 0.36 && rand() < 0.5) ember(SL[o], SL[o + 1], SL[o + 2]);
            }
            const s = 1 - clamp01((k - 0.8) / 0.2);
            lay(i, SL[o], SL[o + 1] + k * k * 0.6, SL[o + 2], SL[o + 3], SL[o + 4], SL[o + 5], SL[o + 6], SL[o + 7], SL[o + 8], SL[o + 9] * s, SL[o + 10] * s);
        }
    }
    async function playOutro(shot) {
        const p = P();
        clearMine();
        mendAll();
        fighting = false;
        B.state = 'down';
        outro.on = true; outro.burn = 0;
        edge.value.set('#ff8a2a');
        const pl_ = Math.hypot(p.x, p.z) || 1, ox = p.x / pl_, oz = p.z / pl_;
        const seat = { x: ox * 1.5, z: oz * 1.5 };
        const fall = { x0: B.x, z0: B.z, a0: B.alt };
        const sx = oz, sz = -ox;
        const said = {};
        const once = (k, cond) => { if (cond && !said[k]) { said[k] = true; return true; } return false; };
        hands('fling'); look.spreadTo = 0.9;
        if (smallLoad) await Promise.race([smallLoad, shot.wait(0.05)]);
        shot.each((dt, t) => {
            // The fall, slowed: it drifts down beside the brazier
            const k = ramp(t, 0, 1.7);
            B.x = mix(fall.x0, seat.x, k); B.z = mix(fall.z0, seat.z, k);
            B.alt = mix(fall.a0, 0.05, k * k);
            B.vx = B.vz = 0;
            B.yaw += angDiff(Math.atan2(ox, oz), B.yaw) * Math.min(1, dt * 2);
            if (once('land', t > 1.7)) { sfx.thud(); sfx.rumble(1.5); ctx.shake(0.8); ctx.dust(B.x, B.z, 14, '#8a7d72'); shot.slow(1); hands('slump'); look.spreadTo = 0.25; }
            if (once('l1', t > 0.5)) shot.say('THAT WAS NOT THE ENDING I WROTE.', 2.6);
            // The burn
            outro.burn = Math.max(0, t - 2.0);
            if (once('fire', t > 2.0)) fx('fire');
            cut.value = t < 2.6 ? -99 : mix(-1.2, F.y + 6.2, ramp(t, 2.6, 7.4));
            look.faceTo = t > 6.2 ? 0 : 1;
            if (t > 2.4 && rand() < dt * 18) ember(B.x + (rand() - 0.5) * 1.6, Math.max(0.2, cut.value), B.z + (rand() - 0.5) * 1.6);
            if (once('l2', t > 4.6)) shot.say('THEN WRITE YOUR OWN.', 2.6);
            if (small) {
                if (once('small', t > 3.4)) {
                    small.root.visible = true;
                    small.root.position.set(seat.x * 0.95, 0.08, seat.z * 0.95);
                    small.root.rotation.set(0, Math.atan2(ox, oz), 0);
                    small.root.scale.setScalar(1);
                    small.play('Sitting_Idle_Loop', { fade: 0 });
                }
                if (small.root.visible) small.mixer.update(dt);
            }
            if (t > 7.4) body.visible = false;
            // The eye closes; the red goes out of the sky; grey comes up on the horizon
            eye.open = 1 - ramp(t, 7.6, 9.6);
            eye.red = 1 - ramp(t, 8.2, 11);
            eye.reveal = 1 - ramp(t, 9, 12) * 0.6;
            eye.dawn = ramp(t, 9.2, 13);
            SU.uDawnDir.value.set(ox, 0, oz);
        });
        shot.slow(0.4);
        if (!shot.skipped) { sfx.roar(2.5); ctx.flash('#fff0e0', 0.25); }
        // 1. The fall, side on and low
        const mx = (fall.x0 + seat.x) / 2, mz = (fall.z0 + seat.z) / 2;
        shot.cam([mx + sx * 7, 1.6, mz + sz * 7], [mx, Math.max(2, fall.a0 + 2), mz], { fov: 58 });
        shot.move([seat.x + sx * 6, 1.1, seat.z + sz * 6], [seat.x, 1.6, seat.z], 2.2);
        await shot.wait(2.4);
        // 2. The burn: slowly round it
        shot.cam([seat.x + ox * 4.2 + sx * 3, 2.0, seat.z + oz * 4.2 + sz * 3], [seat.x, 1.8, seat.z], { fov: 55 });
        shot.move([seat.x + ox * 4.6 - sx * 2, 1.5, seat.z + oz * 4.6 - sz * 2], [seat.x, 1.2, seat.z], 5.0);
        await shot.wait(5.0);
        // 3. The eye closes
        const eaz = eye.az, ce = Math.cos(0.32), se = Math.sin(0.32);
        const c3 = [seat.x + ox * 2.5, 0.9, seat.z + oz * 2.5];
        shot.cam(c3, [c3[0] + Math.sin(eaz) * ce * 20, c3[1] + se * 20, c3[2] + Math.cos(eaz) * ce * 20], { fov: 70 });
        await shot.wait(2.2);
        // 4. Hold: the small figure by the cold brazier, the visitor, and the grey of dawn behind them
        shot.cam([-ox * 2.6 + sx * 3.0, 1.5, -oz * 2.6 + sz * 3.0], [ox * 6, 1.2, oz * 6], { fov: 56 });
        shot.move([-ox * 2.3 + sx * 2.7, 1.3, -oz * 2.3 + sz * 2.7], [ox * 6, 1.25, oz * 6], 4.5, { ease: k => k });
        await shot.wait(4.5);
        // Whatever was skipped, end on the same picture
        body.visible = false;
        hideRange(0, NP);
        cut.value = 99;
        eye.open = 0; eye.red = 0; eye.dawn = 1; eye.reveal = 0.4;
        SU.uDawnDir.value.set(ox, 0, oz);
        if (small) { small.root.visible = true; small.root.position.set(seat.x * 0.95, 0.08, seat.z * 0.95); small.root.rotation.set(0, Math.atan2(ox, oz), 0); small.play('Sitting_Idle_Loop', { fade: 0 }); small.mixer.update(0.01); }
        skyFrame(0);
        pool.visible = false;
        under.intensity = 0;
    }

    // ═════════════ The form ═════════════
    const NONE = { dealt: 0, staggered: false, dead: false };
    const low = () => B.alt < 1.6;
    const form = {
        id: 'author', name: 'THE AUTHOR', sub: 'what was written, and what was torn out',
        hpMax: 100,
        get hp() { return B.hp; },
        get x() { return B.x; }, get z() { return B.z; }, get yaw() { return B.yaw; },
        get radius() { return low() ? 1.25 : 0; },
        get aimY() { return low() ? 2.2 + B.alt : B.alt + 3.0; },
        get targetable() { return low() && !down && B.state !== 'last' && !ctx.cine.active; },
        get staggered() { return B.state === 'stagger' || B.state === 'spent'; },
        get posture() { return B.posture; }, postureMax: 100,
        get hot() { return hot; },
        get state() { return B.state; },
        // For the test bot: is something of its own about to land here?
        threat(x, z) {
            for (const s of SPOTS) if (s.live && !s.landed && s.t > s.delay - 0.4 && Math.hypot(x - s.x, z - s.z) < s.r + 0.3) return true;
            for (const L of LINES_) if (L.live) { const ox = x - L.x, oz = z - L.z, al = ox * L.dx + oz * L.dz, sd = Math.abs(ox * L.dz - oz * L.dx), h = (L.t - L.wind) * L.speed; if (sd < L.w / 2 + 0.4 && al > h - 0.5 && al < h + 4) return true; }
            if (CROSS.live && CROSS.t > CROSS.wind - 0.3) { const dx = x - B.x, dz = z - B.z, d = Math.hypot(dx, dz), pa = Math.atan2(dx, dz); for (let i = 0; i < 4; i++) { const rel = angDiff(pa, CROSS.a + i * Math.PI / 2); if (Math.abs(rel) < Math.PI / 2 && d * Math.abs(Math.sin(rel)) < 1.2) return true; } }
            for (const v of WAVES) if (v.live) { const d = Math.hypot(x - v.x, z - v.z); if (d - v.r > 0 && d - v.r < 1.3 && !inGap(v, Math.atan2(x - v.x, z - v.z))) return true; }
            if (scy.live && scy.t > scy.wind - 0.35 && scy.t < scy.wind + 0.4) { const d = Math.hypot(x - scy.x, z - scy.z); if (d > 1.4 && d < 8.4) return true; }
            for (const d of DARTS) if (d.live && !d.back && Math.hypot(d.p.x - x, d.p.z - z) < 2.5) return true;
            if (LAST.live && LAST.t > GATHER) { const d = Math.hypot(x, z); if (Math.abs(d - LAST.R) < 1.3 && Math.abs(angDiff(Math.atan2(x, z), LAST.gap)) > 1.5 / LAST.R) return true; }
            return holeAt(x, z);
        },

        intro: playIntro,
        start() { fighting = true; bark('start', true); },
        update(dt) { if (down) return; update(dt); },
        pose: posed,
        damage(amount, info = {}) {
            if (down || !low() || B.state === 'last') return NONE;
            const staggered = form.staggered;
            let a = amount * (staggered ? 1.6 : 1);
            if (!B.stand) a = Math.min(a, Math.max(0, B.hp - 12));
            const before = B.hp;
            B.hp = Math.max(0, B.hp - a);
            B.flinch = 1;
            for (let k = 0; k < 3; k++) drop(B.x + (rand() - 0.5), F.y + 1.5 + rand() * 2, B.z + (rand() - 0.5), (rand() - 0.5) * 3, 1, (rand() - 0.5) * 3, 0.8);
            if (B.hp <= 0) {
                down = true; B.state = 'down'; hot = 0;
                clearMine();
                return { dealt: before, staggered: false, dead: true };
            }
            let broke = false;
            if (!staggered && B.state !== 'struck') {
                B.posture += (info.posture ?? amount * 1.6);
                B.postT = 0;
                if (B.posture >= 100) { B.posture = 0; broke = true; begin('stagger'); }
            }
            if (!B.said.low && B.hp < 30) { B.said.low = true; bark('low', true); }
            acts();
            return { dealt: before - B.hp, staggered: broke, dead: false };
        },
        // A pale blade of its echoes was turned aside: the echo breaks, and it reels
        parried(info) {
            if (info && info.kind === 'quill') return;
            if (scy.live) { scy.live = false; ctx.spark(scy.x, 1.2, scy.z, 3, '#dfe8ff'); }
            B.posture += 30; B.postT = 0;
            bark('parried');
            if (B.posture >= 100 && B.state !== 'last') { B.posture = 0; stab.live = false; begin('stagger'); }
        },
        outro: playOutro,
        restart() {
            clearMine();
            mendAll();
            fresh(checkpoint, checkpoint === 100 ? 1 : checkpoint === 66 ? 2 : 3);
            fighting = false;
            body.visible = true; cut.value = -99;
            look.spread = 1; look.face = 1;
        },
        dispose() {
            disposed = true;
            fighting = false;
            clearMine();
            for (const o of added) if (o.parent) o.parent.remove(o);
            if (dawnLight.parent) dawnLight.parent.remove(dawnLight);
            if (small && small.root.parent) small.root.parent.remove(small.root);
            for (const x of own) if (x && x.dispose) x.dispose();
            pages.dispose(); slabs.dispose(); holes.dispose(); cracks.dispose();
            scene.background = saved.bg;
            if (scene.fog && saved.fog) { scene.fog.color.copy(saved.fog); if (scene.fog.density !== undefined) scene.fog.density = saved.density; }
            for (const o of hid) o.visible = true;
            hid.length = 0;
            if (W && W.glow && glowWas !== null) W.glow.intensity = glowWas;
        },
        debug: {
            moves: ['line', 'cross', 'storm', 'rain', 'darts', 'echo', 'rewrite', 'burst', 'last', 'struck', 'stagger'],
            // Starts a move now, whatever it was doing
            force(name, opt) { clearMine(); begin(name); B.cool = 99; if (name === 'echo' && opt) { B.did.plan = true; B.spot = landing(5.2); B.echoes = [].concat(opt); } },
            get B() { return B; }, look, eye, LAST, TILES, get small() { return small; },
            set act(n) { B.act = n; },
            setHp(h) { B.hp = h; acts(); }
        }
    };
    return form;
}
