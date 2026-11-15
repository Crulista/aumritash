// Fetches what the next screen will need while the visitor is still on this one, so it is already in the browser's
// cache when they get there: quietly, one file at a time, after this page has finished loading.
// <script src="assets/warm.js" data-for="flame" defer></script>  ("flame" on the title screen, "tower" at the flame)
(() => {
    const me = document.currentScript;
    const net = navigator.connection;
    if (!me || (net && (net.saveData || /(^|-)2g$/.test(net.effectiveType || '')))) return;     // not on a metered or very slow line
    const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
    const A = new URL('.', me.src).href;                                                        // the assets folder
    const SETS = {
        flame: [
            THREE + 'build/three.module.js',
            A + 'characters.js', A + 'sfx.js',
            THREE + 'examples/jsm/loaders/GLTFLoader.js', THREE + 'examples/jsm/utils/BufferGeometryUtils.js',
            THREE + 'examples/jsm/utils/SkeletonUtils.js', THREE + 'examples/jsm/libs/meshopt_decoder.module.js',
            A + 'models/anims.glb',
            ...['base_male', 'male_ranger', 'base_female', 'female_ranger', 'male_peasant', 'female_peasant'].map(n => A + 'models/' + n + '.glb')
        ],
        tower: ['kit', 'core', 'player', 'score', 'forms/watcher', 'forms/player2', 'forms/author'].map(n => A + 'fight/' + n + '.js').concat(A + 'ending.js')
    };
    const list = (SETS[me.dataset.for] || []).slice();
    let stopped = false;
    addEventListener('pagehide', () => { stopped = true; });
    const next = () => {
        const url = list.shift();
        if (!url || stopped) return;
        fetch(url, { priority: 'low' }).then(r => r.arrayBuffer()).catch(() => {}).then(next);
    };
    const begin = () => setTimeout(next, 1500);
    if (document.readyState === 'complete') begin(); else addEventListener('load', begin);
})();
