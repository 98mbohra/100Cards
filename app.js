(() => {
  'use strict';

  const TAGS = ['writing', 'arranging', 'recording', 'mindset'];
  const KEY = {
    mine: '100cards.mine',
    kept: '100cards.kept',
    history: '100cards.history',
    seen: '100cards.seen',
    filter: '100cards.filter',
  };
  const HISTORY_MAX = 300;

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const $ = (id) => document.getElementById(id);
  const card = $('card');
  const cardInner = $('cardInner');
  const cardTag = $('cardTag');
  const cardText = $('cardText');
  const cardFoot = $('cardFoot');
  const count = $('count');
  const toast = $('toast');
  const sheet = $('sheet');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let deck = [];                                  // from cards.json
  let mine = store.get(KEY.mine, []);             // [{id, text, tag}]
  let kept = store.get(KEY.kept, []);             // [{id, text, tag, at}]
  let history = store.get(KEY.history, []);       // [{id, text, tag, at, fate}]
  let seen = new Set(store.get(KEY.seen, []));    // ids drawn this time through
  let filter = store.get(KEY.filter, 'any');
  let current = null;
  let busy = false;

  if (filter !== 'any' && !TAGS.includes(filter)) filter = 'any';

  const allCards = () => deck.concat(mine.map((c) => ({ ...c, mine: true })));
  const pool = () => allCards().filter((c) => filter === 'any' || c.tag === filter);

  // ---------- drawing ----------

  function pick() {
    const cards = pool();
    if (!cards.length) return null;
    let fresh = cards.filter((c) => !seen.has(c.id));
    if (!fresh.length) {
      cards.forEach((c) => seen.delete(c.id));
      fresh = cards.filter((c) => c.id !== current?.id);
      if (!fresh.length) fresh = cards;
      say('Reshuffled. The whole deck is back in.');
    }
    const next = fresh[Math.floor(Math.random() * fresh.length)];
    seen.add(next.id);
    store.set(KEY.seen, [...seen]);
    return next;
  }

  function paint(c) {
    if (!c) {
      cardTag.textContent = filter;
      cardText.textContent = 'No cards here yet. Add one of your own.';
      cardText.classList.add('long');
      cardFoot.textContent = '';
      return;
    }
    cardTag.textContent = c.tag;
    cardText.textContent = c.text;
    cardText.classList.toggle('long', c.text.length > 48);
    cardFoot.innerHTML = '';
    const left = document.createElement('span');
    left.textContent = c.mine ? 'yours' : 'Goldenchild';
    const right = document.createElement('span');
    right.textContent = c.mine ? '' : c.id.toUpperCase();
    cardFoot.append(left, right);
    card.setAttribute('aria-label', `${c.text} (${c.tag}). Tap to draw another card.`);
  }

  function updateCount() {
    const cards = pool();
    const left = cards.filter((c) => !seen.has(c.id)).length;
    const where = filter === 'any' ? 'in the deck' : `in ${filter}`;
    count.textContent = cards.length ? `${left} of ${cards.length} left ${where}` : '';
    $('savedCount').textContent = kept.length ? String(kept.length) : '';
  }

  function logDraw(c) {
    if (!c) return;
    history.unshift({ id: c.id, text: c.text, tag: c.tag, at: Date.now(), fate: '' });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    store.set(KEY.history, history);
  }

  function markFate(c, fate) {
    const entry = history.find((h) => h.id === c.id);
    if (entry && !entry.fate) { entry.fate = fate; store.set(KEY.history, history); }
  }

  async function draw({ flip = true } = {}) {
    if (busy) return;
    busy = true;
    const next = pick();
    if (flip && !reduceMotion) {
      await cardInner.animate(
        [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }],
        { duration: 170, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }
      ).finished;
      paint(next);
      await cardInner.animate(
        [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }],
        { duration: 230, easing: 'cubic-bezier(.1,.5,.4,1)', fill: 'forwards' }
      ).finished;
    } else if (flip) {
      await cardInner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished;
      paint(next);
      await cardInner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' }).finished;
    } else {
      paint(next);
    }
    current = next;
    logDraw(next);
    updateCount();
    busy = false;
  }

  function keep(c) {
    if (!c || kept.some((k) => k.id === c.id)) return;
    kept.unshift({ id: c.id, text: c.text, tag: c.tag, at: Date.now() });
    store.set(KEY.kept, kept);
    markFate(c, 'kept');
  }

  // ---------- gestures ----------

  let start = null;
  const stampKeep = card.querySelector('.stamp-keep');
  const stampDrop = card.querySelector('.stamp-drop');

  function setDrag(dx, dy) {
    cardInner.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 18}deg)`;
    stampKeep.style.opacity = Math.max(0, Math.min(1, dx / 90));
    stampDrop.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  }

  function clearDrag() {
    cardInner.style.transform = '';
    stampKeep.style.opacity = 0;
    stampDrop.style.opacity = 0;
  }

  card.addEventListener('pointerdown', (e) => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false };
    card.setPointerCapture(e.pointerId);
    cardInner.getAnimations().forEach((a) => a.cancel());
  });

  card.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) start.moved = true;
    if (start.moved) setDrag(dx, dy);
  });

  card.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dt = performance.now() - start.t;
    const fast = Math.abs(dx) > 40 && Math.abs(dx) / dt > 0.6;
    const moved = start.moved;
    start = null;
    askMotion();
    if (Math.abs(dx) > 90 || fast) {
      swipe(dx > 0 ? 1 : -1);
    } else if (!moved) {
      clearDrag();
      draw();
    } else {
      snapBack();
    }
  });

  card.addEventListener('pointercancel', () => { start = null; snapBack(); });

  function snapBack() {
    const from = cardInner.style.transform;
    clearDrag();
    if (from && !reduceMotion) {
      cardInner.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
    }
  }

  async function swipe(dir) {
    if (busy || !current) { snapBack(); return; }
    busy = true;
    const c = current;
    if (dir > 0) { keep(c); say('Kept'); } else { markFate(c, 'let go'); }
    const from = cardInner.style.transform || 'none';
    const off = (window.innerWidth + 200) * dir;
    if (!reduceMotion) {
      await cardInner.animate(
        [{ transform: from }, { transform: `translate(${off}px, 40px) rotate(${dir * 24}deg)` }],
        { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
      ).finished;
    }
    clearDrag();
    busy = false;
    cardInner.getAnimations().forEach((a) => a.cancel());
    cardTag.textContent = '';
    cardText.textContent = '';
    cardFoot.textContent = '';
    await draw();
  }

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); draw(); }
    if (e.key === 'ArrowRight') swipe(1);
    if (e.key === 'ArrowLeft') swipe(-1);
  });

  // ---------- shake ----------

  let motionAsked = false;
  let lastShake = 0;
  let lastAcc = null;

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (lastAcc) {
      const delta = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
      const now = Date.now();
      if (delta > 32 && now - lastShake > 1200 && !sheet.open) {
        lastShake = now;
        draw();
      }
    }
    lastAcc = { x: a.x, y: a.y, z: a.z };
  }

  function listenMotion() {
    try { window.addEventListener('devicemotion', onMotion); } catch { /* not allowed here */ }
  }

  // iOS asks for motion permission, and only from inside a tap.
  function askMotion() {
    if (motionAsked) return;
    motionAsked = true;
    const DME = window.DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      DME.requestPermission().then((r) => { if (r === 'granted') listenMotion(); }).catch(() => {});
    }
  }

  if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission !== 'function') listenMotion();

  // ---------- filters ----------

  const filterBtns = [...document.querySelectorAll('#filters button')];
  function setFilter(tag) {
    filter = tag;
    store.set(KEY.filter, tag);
    filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
    if (current && tag !== 'any' && current.tag !== tag) draw();
    else updateCount();
  }
  filterBtns.forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.tag)));

  // ---------- sheet ----------

  const tabs = [...sheet.querySelectorAll('[role="tab"]')];
  const panels = [...sheet.querySelectorAll('.panel')];

  function openSheet(name) {
    showTab(name);
    if (!sheet.open) {
      if (typeof sheet.showModal === 'function') sheet.showModal();
      else sheet.setAttribute('open', '');
    }
    if (name === 'mine') setTimeout(() => $('addText').focus(), 60);
  }

  function closeSheet() {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  }

  function showTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    renderLists();
  }

  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.open)));
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $('sheetClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  const ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  function row(text, metaParts, action) {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.style.minWidth = '0';
    const t = document.createElement('p');
    t.className = 't';
    t.textContent = text;
    const meta = document.createElement('p');
    meta.className = 'meta';
    metaParts.forEach((part, i) => {
      if (i) meta.append(' · ');
      const span = document.createElement('span');
      if (part === 'kept') span.className = 'kept';
      span.textContent = part;
      meta.append(span);
    });
    body.append(t, meta);
    li.append(body);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', action.run);
      li.append(b);
    }
    return li;
  }

  function renderLists() {
    $('savedList').replaceChildren(...kept.map((k) => row(k.text, [k.tag, ago(k.at)], {
      label: 'Remove',
      run: () => { kept = kept.filter((x) => x.id !== k.id); store.set(KEY.kept, kept); renderLists(); updateCount(); },
    })));

    $('historyList').replaceChildren(...history.map((h) => {
      const isKept = kept.some((k) => k.id === h.id);
      return row(h.text, [h.tag, ago(h.at), h.fate].filter(Boolean), isKept ? null : {
        label: 'Keep',
        run: () => { keep(h); h.fate = h.fate || 'kept'; store.set(KEY.history, history); renderLists(); updateCount(); },
      });
    }));

    $('mineList').replaceChildren(...mine.map((m) => row(m.text, [m.tag, 'yours'], {
      label: 'Delete',
      run: () => {
        mine = mine.filter((x) => x.id !== m.id);
        store.set(KEY.mine, mine);
        seen.delete(m.id);
        store.set(KEY.seen, [...seen]);
        renderLists();
        updateCount();
      },
    })));
  }

  $('clearHistory').addEventListener('click', () => {
    history = [];
    store.set(KEY.history, history);
    renderLists();
  });

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('addText').value.trim().replace(/\s+/g, ' ');
    if (!text) return;
    const tag = $('addTag').value;
    const c = { id: `my-${Date.now().toString(36)}`, text, tag };
    mine.unshift(c);
    store.set(KEY.mine, mine);
    $('addText').value = '';
    renderLists();
    updateCount();
    say('Added to the deck');
  });

  // ---------- toast ----------

  let toastTimer;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  // ---------- boot ----------

  async function loadDeck() {
    try {
      const res = await fetch('cards.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      return data.filter((c) => c && c.id && c.text && TAGS.includes(c.tag));
    } catch {
      return [];
    }
  }

  (async () => {
    setFilter(filter);
    deck = await loadDeck();
    if (!deck.length && !mine.length) {
      cardText.textContent = 'The deck could not load. Check your connection and reopen.';
      cardText.classList.add('long');
      return;
    }
    // Forget ids that no longer exist (cards removed from cards.json).
    const ids = new Set(allCards().map((c) => c.id));
    seen = new Set([...seen].filter((id) => ids.has(id)));
    await draw({ flip: false });
  })();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
