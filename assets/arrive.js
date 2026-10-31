// Arriving from the flame: start in black with the place's name and what you find there, then fade in.
// Also remembers which places this visitor has seen (for the sealed path at the flame).
// Loaded right after <body> so the page never flashes before the overlay is up.
(() => {
    const PLACES = {
        work: ['THE WEST DOOR', "You've come to an archive of the past... and of the present."],
        games: ['THE NORTH STAIR', 'You come to an odd room, with CD racks in place.'],
        stories: ['THE EAST BRIDGE', 'You come to a library, with broken shelves.']
    };
    const here = (location.pathname.match(/\/(work|games|stories)\//) || [])[1];
    try {
        const seen = new Set(JSON.parse(localStorage.getItem('aumritash-seen') || '[]'));
        if (here) { seen.add(here); localStorage.setItem('aumritash-seen', JSON.stringify([...seen])); }
    } catch (e) {}

    let place = null;
    try { place = sessionStorage.getItem('aumritash-arrive'); sessionStorage.removeItem('aumritash-arrive'); } catch (e) {}
    if (!PLACES[place]) return;
    const [name, line] = PLACES[place];
    const veil = document.createElement('div');
    veil.className = 'arrive';
    veil.innerHTML = `<div><p class="arrive-name">${name}</p><p class="arrive-line">${line}</p></div>`;
    document.body.prepend(veil);
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => veil.classList.add('out'), quick ? 0 : 2400);
    setTimeout(() => veil.remove(), quick ? 600 : 3900);
})();
