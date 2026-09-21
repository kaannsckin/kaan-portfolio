(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const saved = store.get('mks-theme');
  if (saved) root.dataset.theme = saved;
  $('.theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('mks-theme', root.dataset.theme);
  });

  /* ---------- route map ---------- */
  const map = $('.map');
  $$('.ln', map).forEach(p => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));
  $$('.st', map).forEach((g, i) => {
    g.style.setProperty('--i', i);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'link');
    const go = () => { const t = $(g.dataset.go); if (t) t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  if (!reduced) map.classList.add('drawing');

  /* ---------- nav scrollspy ---------- */
  const links = $$('.lines a');
  const targets = links.map(a => $(a.getAttribute('href')));
  const spy = () => {
    const y = scrollY + innerHeight * 0.35;
    let cur = -1;
    targets.forEach((t, i) => { if (t && t.offsetTop <= y) cur = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === cur));
  };
  addEventListener('scroll', spy, { passive: true }); spy();

  /* ---------- zoom ---------- */
  const dlg = $('#zoom');
  const zimg = $('img', dlg);
  document.addEventListener('click', e => {
    const img = e.target.closest('[data-zoom]');
    if (!img || !dlg.showModal) return;
    zimg.src = img.currentSrc || img.src; zimg.alt = img.alt;
    zoomOpener = img;
    dlg.showModal();
  });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.zoom-x')) dlg.close(); });
  // Zoomable images are reachable and operable from the keyboard.
  $$('[data-zoom]').forEach(img => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-haspopup', 'dialog');
    if (img.alt) img.setAttribute('aria-label', img.alt + ' — enlarge');
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); img.click(); }
    });
  });
  // Send focus back to the thumbnail that opened the dialog.
  let zoomOpener = null;
  dlg.addEventListener('close', () => { if (zoomOpener) { zoomOpener.focus(); zoomOpener = null; } });

  /* ---------- play the walkthrough only while it is on screen ---------- */
  const vid = $('.screens video');
  if (vid) {
    if (reduced || !('IntersectionObserver' in window)) {
      vid.controls = true;
    } else {
      new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) vid.play().catch(() => { vid.controls = true; });
        else vid.pause();
      }), { threshold: 0.35 }).observe(vid);
    }
  }

  /* ---------- Kunduz pricing simulator ---------- */
  const E = 0.912, MU = 4;
  const erlangB = (c, r) => { if (c <= 0) return 1; let b = 1; for (let k = 1; k <= c; k++) b = (r * b) / (k + r * b); return b; };
  const ids = ['D', 'C', 'P', 'M', 'T'];
  const fmt = { D: v => `${v}/h`, C: v => v, P: v => `${(+v).toFixed(2)} TL`, M: v => `${(+v).toFixed(1)} TL`, T: v => `${Math.round(v * 100)}%` };
  const chart = $('#simChart');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  function runSim() {
    const v = Object.fromEntries(ids.map(k => [k, +$('#' + k).value]));
    ids.forEach(k => { $(`output[data-for="${k}"]`).textContent = fmt[k](v[k]); });
    const pts = []; let best = null;
    const pMin = 0.5, pMax = 9;
    for (let i = 0; i <= 340; i++) {
      const p = pMin + (pMax - pMin) * i / 340;
      const c = Math.floor(v.C * Math.exp(E * (p - v.P) / v.P));
      const fr = 1 - erlangB(c, v.D / MU);
      const z = v.D * (fr * p + (1 - fr) * v.M);
      const ok = fr >= v.T;
      pts.push({ p, z, ok });
      if (ok && (!best || z < best.z)) best = { p, z, c, fr };
    }
    $('#oP').textContent = best ? best.p.toFixed(2) + ' TL' : 'n/a';
    $('#oC').textContent = best ? best.c : 'n/a';
    $('#oF').textContent = best ? (best.fr * 100).toFixed(1) + '%' : 'n/a';
    $('#oZ').textContent = best ? Math.round(best.z) + ' TL' : 'n/a';

    chart.textContent = '';
    const W = 560, H = 300, L = 48, R = 12, T = 14, B = 34;
    const zs = pts.map(d => d.z); const zMin = Math.min(...zs), zMax = Math.max(...zs);
    const sx = p => L + (p - pMin) / (pMax - pMin) * (W - L - R);
    const sy = z => T + (1 - (z - zMin) / ((zMax - zMin) || 1)) * (H - T - B);
    // infeasible shading
    let start = null;
    pts.forEach((d, i) => {
      if (!d.ok && start === null) start = d.p;
      if ((d.ok || i === pts.length - 1) && start !== null) {
        chart.append(el('rect', { class: 'bad', x: sx(start), y: T, width: Math.max(1, sx(d.p) - sx(start)), height: H - T - B }));
        start = null;
      }
    });
    chart.append(el('line', { class: 'axis', x1: L, y1: H - B, x2: W - R, y2: H - B }));
    chart.append(el('line', { class: 'axis', x1: L, y1: T, x2: L, y2: H - B }));
    for (let p = 1; p <= 9; p += 1) {
      const t = el('text', { x: sx(p), y: H - B + 18, 'text-anchor': 'middle' }); t.textContent = p; chart.append(t);
    }
    const xl = el('text', { x: W - R, y: H - 2, 'text-anchor': 'end' }); xl.textContent = 'price per follow-up (TL)'; chart.append(xl);
    [zMin, (zMin + zMax) / 2, zMax].forEach(z => { const t = el('text', { x: L - 6, y: sy(z) + 4, 'text-anchor': 'end' }); t.textContent = Math.round(z); chart.append(t); });
    chart.append(el('path', { class: 'curve', d: pts.map((d, i) => (i ? 'L' : 'M') + sx(d.p).toFixed(1) + ' ' + sy(d.z).toFixed(1)).join(' ') }));
    if (best) {
      chart.append(el('line', { class: 'optl', x1: sx(best.p), y1: sy(best.z), x2: sx(best.p), y2: H - B }));
      chart.append(el('circle', { class: 'opt', cx: sx(best.p), cy: sy(best.z), r: 7 }));
      const lbl = el('text', { class: 'optt', x: sx(best.p) + (best.p > 6.5 ? -12 : 12), y: sy(best.z) - 12, 'text-anchor': best.p > 6.5 ? 'end' : 'start' });
      lbl.textContent = `best ${best.p.toFixed(2)} TL`; chart.append(lbl);
    }
  }
  ids.forEach(k => $('#' + k).addEventListener('input', runSim));
  runSim();

  /* ---------- Solve Stop prototype ---------- */
  const TIERS = ['screw', 'gear', 'motor', 'moto', 'car', 'sport', 'plane'];
  const NAMES = ['screw', 'gear', 'motor', 'motorcycle', 'car', 'sports car', 'airplane'];
  const ICON = {
    screw: 'assets/ss-screw.webp', gear: 'assets/ss-gear.webp', motor: 'assets/ss-motor.webp', moto: 'assets/ss-moto.webp',
    car: 'assets/ss-car.webp', sport: 'assets/ss-sport.webp', plane: 'assets/ss-plane.webp'
  };
  const ROUTES = [
    { goal: 3, moves: 8, hi: 'Route 1. Build me a motorcycle!' },
    { goal: 4, moves: 15, hi: 'Route 2. A car this time. Tap where you want it to appear.' },
    { goal: 5, moves: 24, hi: 'Route 3. Sports car. Big groups give double upgrades!' },
    { goal: 6, moves: 40, hi: 'Final route. An airplane takes us anywhere.' }
  ];
  const N = 5;
  const boardEl = $('#board');
  let b = [], moves = 0, route = 0, busy = false, over = false;
  const rnd = () => { const r = Math.random(); return r < 0.44 ? 0 : r < 0.78 ? 1 : 2; };
  const say = t => { $('#rubisSays').textContent = t; };
  const nb = i => { const y = Math.floor(i / N), x = i % N, o = []; if (y) o.push(i - N); if (y < N - 1) o.push(i + N); if (x) o.push(i - 1); if (x < N - 1) o.push(i + 1); return o; };
  const group = s => { const t = b[s], seen = new Set([s]), st = [s]; while (st.length) { const c = st.pop(); for (const n of nb(c)) if (!seen.has(n) && b[n] === t) { seen.add(n); st.push(n); } } return [...seen]; };
  const hasMove = () => b.some((_, i) => group(i).length >= 3);

  const cells = [];
  let focused = 0;
  const clearHl = () => cells.forEach(c => c.classList.remove('hl'));
  const showHl = i => { if (busy) return; const g = group(i); if (g.length >= 3) g.forEach(c => cells[c].classList.add('hl')); };
  // Only the active cell is tabbable, so the board is a single tab stop.
  const focusCell = i => {
    focused = i;
    cells.forEach((c, n) => c.tabIndex = n === i ? 0 : -1);
    cells[i].focus();
  };
  for (let i = 0; i < N * N; i++) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'cell'; btn.tabIndex = i === 0 ? 0 : -1;
    const img = document.createElement('img'); img.alt = ''; img.draggable = false;
    btn.append(img);
    btn.addEventListener('click', () => tap(i));
    btn.addEventListener('pointerenter', () => showHl(i));
    btn.addEventListener('pointerleave', clearHl);
    btn.addEventListener('focus', () => { focused = i; showHl(i); });
    btn.addEventListener('blur', clearHl);
    btn.addEventListener('keydown', e => {
      const y = Math.floor(i / N), x = i % N;
      const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (step) {
        const nx = Math.min(N - 1, Math.max(0, x + step[0]));
        const ny = Math.min(N - 1, Math.max(0, y + step[1]));
        e.preventDefault(); focusCell(ny * N + nx); return;
      }
      if (e.key === 'Home') { e.preventDefault(); focusCell(y * N); }
      else if (e.key === 'End') { e.preventDefault(); focusCell(y * N + N - 1); }
    });
    boardEl.append(btn); cells.push(btn);
  }
  function paint(anim = {}) {
    b.forEach((t, i) => {
      const c = cells[i];
      c.querySelector('img').src = ICON[TIERS[t]];
      c.setAttribute('aria-label', `Row ${Math.floor(i / N) + 1}, column ${i % N + 1}: ${NAMES[t]}`);
      c.dataset.t = t;
      c.classList.remove('pop', 'up', 'boost', 'hl');
      if (anim[i]) { void c.offsetWidth; c.classList.add(anim[i]); }
    });
    $('#movesTxt').textContent = moves;
    $('.moves').classList.toggle('low', moves <= 3);
    const best = Math.max(...b);
    $('#roadFill').style.width = Math.min(100, (best / ROUTES[route].goal) * 100) + '%';
  }
  function startRoute(r) {
    route = r; moves = ROUTES[r].moves; over = false;
    do { b = Array.from({ length: N * N }, rnd); } while (!hasMove() || Math.max(...b) >= ROUTES[r].goal);
    $('#aimIco').src = ICON[TIERS[ROUTES[r].goal]];
    $('#routeTxt').textContent = 'Route ' + (r + 1);
    say(ROUTES[r].hi);
    const a = {}; b.forEach((_, i) => a[i] = 'pop'); paint(reduced ? {} : a);
  }
  const upTool = (i, a) => { if (b[i] <= 2) { b[i]++; a[i] = 'boost'; } };
  function tap(i) {
    if (busy) return;
    if (over) { startRoute(over === 'win' ? Math.min(route + 1, ROUTES.length - 1) : route); return; }
    const g = group(i), n = g.length, t = b[i];
    if (n < 3) { cells[i].classList.remove('shake'); void cells[i].offsetWidth; cells[i].classList.add('shake'); say('I need three or more of the same, side by side.'); return; }
    busy = true;
    const a = {};
    g.forEach(c => { b[c] = rnd(); a[c] = 'pop'; });
    const step = n >= 9 ? 2 : 1;
    b[i] = Math.min(6, t + step); a[i] = 'up';
    if (n >= 6 && n <= 8) { const o = g.filter(c => c !== i).sort((x, y) => nb(i).includes(y) - nb(i).includes(x))[0]; b[o] = Math.min(6, t + 1); a[o] = 'up'; }
    let msg = step === 2 ? `Double upgrade! ${NAMES[t]} became a ${NAMES[b[i]]}.` : `${n} matched. New ${NAMES[b[i]]}.`;
    const props = n >= 9 ? 0 : n === 8 ? 2 : n >= 5 ? 1 : 0;
    for (let k = 0; k < props; k++) { const c = Math.floor(Math.random() * N * N); nb(c).forEach(x => upTool(x, a)); }
    if (props) msg += ' Propeller boosted nearby tools.';
    if (n >= 12) { b.forEach((_, x) => { if (x !== i) upTool(x, a); }); msg += ' Fireworks upgraded every tool!'; }
    else if (n >= 9) { const y = Math.floor(i / N), x0 = i % N; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x0 + dx; if ((dy || dx) && yy >= 0 && yy < N && xx >= 0 && xx < N) upTool(yy * N + xx, a); } msg += ' Bomb!'; }
    moves--;
    paint(reduced ? {} : a);
    setTimeout(() => {
      busy = false;
      const goal = ROUTES[route].goal;
      if (Math.max(...b) >= goal) {
        over = 'win';
        say(route === ROUTES.length - 1 ? 'We made it! Tap the board to fly again.' : `Route ${route + 1} complete with ${moves} moves left. Tap the board for the next route.`);
        return;
      }
      if (moves <= 0) { over = 'lose'; say('Out of moves. In the full game, diamonds would buy more. Tap to retry.'); return; }
      if (!hasMove()) { shuffle(true); return; }
      say(msg);
    }, reduced ? 0 : 420);
  }
  function shuffle(auto) {
    if (busy || over) return;
    let tries = 0;
    do { for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } } while (!hasMove() && ++tries < 30);
    if (!hasMove()) b[Math.floor(Math.random() * N * N)] = 0;
    const a = {}; b.forEach((_, i) => a[i] = 'pop'); paint(reduced ? {} : a);
    say(auto ? 'No matches left, so the steering wheel shuffled the board.' : 'Steering wheel! Board shuffled.');
  }
  $('#shuffleBtn').addEventListener('click', () => shuffle(false));
  $('#restartBtn').addEventListener('click', () => startRoute(route));
  startRoute(0);

  /* ---------- Lee ---------- */
  const egg = $('#leeEgg'), leeIn = $('#leeSteps'), leeOut = $('#leeOut');
  const leeRun = () => {
    const s = +leeIn.value, k = s / 12000;
    leeOut.textContent = s.toLocaleString('en-US') + ' steps';
    egg.style.setProperty('--s', (0.82 + k * 0.42).toFixed(3));
    egg.style.setProperty('--g', k.toFixed(3));
  };
  leeIn.addEventListener('input', () => { egg.classList.add('on'); leeRun(); });
  leeRun();

  /* ---------- TikiTrivia career path ---------- */
  const PATH = [
    ['2005–2011', 'Galatasaray'],
    ['2011–2015', 'Atlético Madrid'],
    ['2015–2020', 'Barcelona'],
    ['2018–2020', 'Başakşehir (loan)'],
    ['2020–2022', 'Galatasaray']
  ];
  const OPTS = ['Hakan Çalhanoğlu', 'Arda Turan', 'Burak Yılmaz', 'Selçuk İnan'];
  const ANSWER = 'Arda Turan';
  let shown = 2, lives = 3, done = false;
  const pathEl = $('#tvPath'), optsEl = $('#tvOpts');
  function drawPath() {
    pathEl.textContent = '';
    PATH.forEach(([y, c], i) => {
      const li = document.createElement('li');
      if (i < shown || done) { li.innerHTML = `<small>${y}</small>${c}`; }
      else { li.className = 'hid'; li.innerHTML = `<small>${y}</small>? ? ? ? ?`; }
      pathEl.append(li);
    });
    $('#tvLives').textContent = `${lives} / 3`;
  }
  OPTS.forEach(name => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = name;
    bt.addEventListener('click', () => {
      if (done || bt.classList.contains('no')) return;
      if (name === ANSWER) {
        done = true; bt.classList.add('yes');
        $('#tvMsg').textContent = `Bildin! Solved with ${shown} of 5 clubs visible. Share card unlocked.`;
      } else {
        bt.classList.add('no'); lives--; shown = Math.min(PATH.length, shown + 1);
        if (lives === 0) { done = true; $('#tvMsg').textContent = `Out of guesses. It was ${ANSWER}.`; optsEl.querySelectorAll('button').forEach(x => { if (x.textContent === ANSWER) x.classList.add('yes'); }); }
        else $('#tvMsg').textContent = 'Not quite. Next club revealed.';
      }
      drawPath();
    });
    optsEl.append(bt);
  });
  drawPath();
})();
