// "Leave a note" box at the end of each chapter: a question, or a suggestion for what to play/read/do next.
// Notes go to Formspree, which forwards them to Aumritash's inbox. If that fails, it falls back to an email draft.
// Markup: <section class="ask" data-topic="The Games" data-prompt="What should I play next?"></section>
(() => {
    const ENDPOINT = 'https://formspree.io/f/xwllnzez';
    const FALLBACK_TO = 'aumritashmaitra@gmail.com';
    document.querySelectorAll('section.ask').forEach(box => {
        const topic = box.dataset.topic, prompt = box.dataset.prompt;
        box.innerHTML = `
            <h2 class="section-title">Leave a note</h2>
            <form class="panel ask-form">
                <p class="ask-prompt">${prompt}</p>
                <div class="ask-kind" role="radiogroup" aria-label="What kind of note">
                    <label><input type="radio" name="kind" value="Suggestion" checked> A suggestion</label>
                    <label><input type="radio" name="kind" value="Question"> A question</label>
                </div>
                <textarea name="note" rows="4" maxlength="2000" required placeholder="Write it here…" aria-label="Your note"></textarea>
                <input name="from" type="text" maxlength="80" placeholder="Your name (optional)" aria-label="Your name">
                <div class="ask-row">
                    <button class="btn small" type="submit">Send ✉</button>
                    <span class="ask-hint" aria-live="polite">It comes straight to me.</span>
                </div>
            </form>`;
        const form = box.querySelector('form'), hint = box.querySelector('.ask-hint'), btn = form.querySelector('button');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const kind = form.kind.value, note = form.note.value.trim(), from = form.from.value.trim();
            if (!note) return;
            btn.disabled = true;
            hint.textContent = 'Sending…';
            try {
                const res = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind, topic, note, from, _subject: `${kind} from the site · ${topic}` })
                });
                if (!res.ok) throw new Error(res.status);
                form.reset();
                hint.textContent = 'Sent. Thanks for the note!';
            } catch (err) {
                // Formspree unreachable: hand the note to the visitor's email app instead
                const body = `${note}\n\n— ${from || 'A visitor'}`;
                location.href = `mailto:${FALLBACK_TO}?subject=${encodeURIComponent(`${kind} from the site · ${topic}`)}&body=${encodeURIComponent(body)}`;
                hint.textContent = "Couldn't send it directly, so your email app should open with the note instead.";
            } finally {
                btn.disabled = false;
            }
        });
    });
})();
