// Visitor log: sends small events (a page opened, a name given, the flame kindled) to a Google Sheet
// that Aumritash owns, so they can see how many people come in and how far they get.
// Each browser gets a random id so one person counts once. The name is only there once the visitor gives it.
(() => {
    const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzO85JyB4y2mDlm3FXzL-Nplj8EY-dTykMWBD2_YWcL_G5oOEC158U1qpDYsl9ZEoT8SQ/exec';   // the sheet's web app URL
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    let id = get('aumritash-id');
    if (!id) {
        id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        try { localStorage.setItem('aumritash-id', id); } catch (e) {}
    }
    // The browser's time zone and language stand in for a rough location (no lookup service involved)
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    window.track = (event, detail = '') => {
        if (!ENDPOINT || local) return;
        const body = JSON.stringify({
            id, event, detail: String(detail),
            name: get('aumritash-name') || '', origin: get('aumritash-origin') || '',
            path: location.pathname, from: document.referrer, tz, lang: navigator.language || ''
        });
        // Sent as plain text so the browser doesn't hold it back for a permission check; survives leaving the page
        try {
            if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body))) fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, body });
        } catch (e) {}
    };
    window.track('page');
})();
