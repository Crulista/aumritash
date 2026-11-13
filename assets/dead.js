// What is left once a visitor has chosen to end it all at the top of the tower. The choice is kept in this browser
// (localStorage 'aumritash-end'); every page loads this file first, and if the place was ended, nothing else loads:
// the visitor gets a black screen, falling ash, and the name of whoever put it out.
// The tower calls window.__dead(end, true) itself, once its own collapse has played out.
// The way back, for the owner: open any page with ?restore on the end of the address.
(() => {
    const KEY = 'aumritash-end';
    const BOARD = 'https://script.google.com/macros/s/AKfycbzO85JyB4y2mDlm3FXzL-Nplj8EY-dTykMWBD2_YWcL_G5oOEC158U1qpDYsl9ZEoT8SQ/exec';   // the visitor sheet (same as assets/track.js)
    let end = null;
    try { end = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (/[?&]restore\b/.test(location.search)) {
        try { localStorage.removeItem(KEY); } catch (e) {}
        end = null;
        try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]restore\b[^&]*/, '').replace(/^&/, '?')); } catch (e) {}
    }
    window.aumEnd = end;

    const day = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };

    function show(e, slow) {
        const root = document.documentElement;
        document.title = '—';
        if (!document.body) root.appendChild(document.createElement('body'));
        document.head.innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>—</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">' +
            '<style>' +
            'html,body{height:100%;margin:0;background:#000;overflow:hidden}' +
            '#ash{position:fixed;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}' +
            'main{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2rem;padding:1.5rem;text-align:center;font-family:VT323,monospace;text-transform:uppercase}' +
            '.l1{margin:0;font-size:clamp(1.8rem,6vw,3rem);letter-spacing:.22em;color:#6f6a66;min-height:1em}' +
            '.l2{margin:0;font-size:clamp(1.05rem,3vw,1.4rem);letter-spacing:.16em;color:#4a4643;opacity:0;transition:opacity 3s}' +
            '.in{position:fixed;right:1.2rem;bottom:1rem;font-family:VT323,monospace;font-size:1.1rem;letter-spacing:.1em;color:#3a3735;text-decoration:none;opacity:0;transition:opacity 4s,color .3s}' +
            '.in:hover,.in:focus{color:#8a8480}' +
            '.on{opacity:1}' +
            '.board{list-style:none;margin:1.6rem 0 0;padding:0;font-size:1.05rem;letter-spacing:.12em;line-height:1.4;color:#4a4643;opacity:0;transition:opacity 4s}' +
            '.board::before{content:"THOSE WHO CLIMBED";display:block;color:#5f5a56;letter-spacing:.2em;margin-bottom:.3rem}' +
            '.board .you{color:#8a8480}' +
            '.board.on{opacity:1}' +
            '</style>';
        document.body.className = '';
        document.body.removeAttribute('style');
        document.body.innerHTML = '<canvas id="ash" aria-hidden="true"></canvas><main><p class="l1" id="l1"></p><p class="l2" id="l2"></p><ol class="board" id="board" hidden></ol></main>' +
            '<a class="in" id="in" href="https://www.linkedin.com/in/aumritashmaitra/" target="_blank" rel="noopener" aria-label="LinkedIn">in</a>';
        const l1 = document.getElementById('l1'), l2 = document.getElementById('l2'), link = document.getElementById('in');
        const LINE = 'NOTHING BURNS HERE.';
        const name = String((e && e.n) || 'SOMEONE').slice(0, 16);
        l2.textContent = `${name} put it out` + (e && e.d ? ` on ${day(e.d)}.` : '.');
        if (slow) {
            // Just after the collapse: a long dark, then the line is set down a letter at a time
            let i = 0;
            setTimeout(function type() {
                l1.textContent = LINE.slice(0, ++i);
                if (i < LINE.length) setTimeout(type, 110); else setTimeout(() => { l2.classList.add('on'); setTimeout(() => link.classList.add('on'), 3500); }, 1200);
            }, 2600);
        } else {
            l1.textContent = LINE;
            requestAnimationFrame(() => { l2.classList.add('on'); link.classList.add('on'); });
        }

        // The climbs are still counted, the visitor's own among them
        let me = '';
        try { me = localStorage.getItem('aumritash-id') || ''; } catch (err) {}
        fetch(BOARD + '?board=1&id=' + encodeURIComponent(me)).then(r => r.json()).then(data => {
            if (!data || !Array.isArray(data.top) || !data.top.length) return;
            const el = document.getElementById('board');
            data.top.slice(0, 8).forEach((row, i) => {
                const li = document.createElement('li'), s = Math.round(+row.time || 0);
                li.textContent = (i + 1) + '. ' + String(row.name || '???').slice(0, 16) + ' · ' + (row.rank || '—') + ' · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
                if (row.id && row.id === me) li.className = 'you';
                el.appendChild(li);
            });
            el.hidden = false;
            setTimeout(() => el.classList.add('on'), slow ? 9000 : 400);
        }).catch(() => {});

        // Ash, coming down slowly for as long as the page is open
        const c = document.getElementById('ash'), g = c.getContext('2d');
        let W = 0, H = 0;
        const fit = () => { W = c.width = Math.ceil(innerWidth / 4); H = c.height = Math.ceil(innerHeight / 4); };
        fit();
        addEventListener('resize', fit);
        const flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.03, s: Math.random() * 6.28, a: 0.12 + Math.random() * 0.3, big: Math.random() < 0.25 }));
        let last = performance.now(), grow = slow ? 0 : 1;
        (function tick(now) {
            requestAnimationFrame(tick);
            const dt = Math.min(0.1, (now - last) / 1000 || 0);
            last = now;
            grow = Math.min(1, grow + dt / 6);
            g.clearRect(0, 0, W, H);
            for (const f of flakes) {
                f.y += f.v * dt;
                f.s += dt * 0.7;
                if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
                g.fillStyle = `rgba(150,144,138,${f.a * grow})`;
                const s = f.big ? 2 : 1;
                g.fillRect(Math.round((f.x + Math.sin(f.s) * 0.012) * W), Math.round(f.y * H), s, s);
            }
        })(last);
    }
    window.__dead = show;

    if (end && end.c === 'destroy') {
        // Nothing else on the page gets to load
        try { window.stop(); } catch (e) {}
        show(end, false);
    }
})();
