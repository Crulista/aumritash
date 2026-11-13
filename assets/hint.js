// The box at the foot of each chapter that says one thing is missing. This fills in how many of the three paths
// the visitor has walked, points them at the tower once it is open, and changes its tune if they kept the fire.
(() => {
    const box = document.getElementById('missing'), count = document.getElementById('missingCount');
    if (!box || !count) return;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('aumritash-seen') || '[]'); } catch (e) {}
    const n = ['work', 'games', 'stories'].filter(p => seen.includes(p)).length;
    if (window.aumEnd && window.aumEnd.c === 'keep') {
        box.classList.add('kept');
        box.querySelector('.missing-title').textContent = 'NOTHING IS MISSING NOW';
        box.querySelector('.missing-line').textContent = 'You went up and brought it back. The fire holds.';
        return;
    }
    if (n >= 3) {
        const a = document.createElement('a');
        a.href = '../tower/';
        a.textContent = 'THE TOWER IS OPEN >';
        count.append('3 OF 3 PATHS WALKED · ', a);
    } else count.textContent = n + ' OF 3 PATHS WALKED';
})();
