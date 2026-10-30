// Arriving from the flame: start in black with the place's name, then let the page fade in.
// Loaded right after <body> so the page never flashes before the overlay is up.
(() => {
    let place = null;
    try { place = sessionStorage.getItem('aumritash-arrive'); sessionStorage.removeItem('aumritash-arrive'); } catch (e) {}
    const NAMES = { work: 'THE WEST DOOR', games: 'THE NORTH STAIR', stories: 'THE EAST BRIDGE' };
    if (!NAMES[place]) return;
    const veil = document.createElement('div');
    veil.className = 'arrive';
    veil.innerHTML = `<p>${NAMES[place]}</p>`;
    document.body.prepend(veil);
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => veil.classList.add('out'), quick ? 0 : 1100);
    setTimeout(() => veil.remove(), quick ? 600 : 2600);
})();
