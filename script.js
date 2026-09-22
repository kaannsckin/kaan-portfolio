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

  /* ---------- language ---------- */
  const DICT = window.I18N || { en: {}, tr: {} };
  const browserTr = (navigator.language || 'en').toLowerCase().startsWith('tr');
  let lang = store.get('mks-lang') || (browserTr ? 'tr' : 'en');
  if (lang !== 'tr' && lang !== 'en') lang = 'en';
  const onLangChange = [];
  const t = (k, vars) => {
    let v = (DICT[lang] && DICT[lang][k]) ?? DICT.en[k];
    if (v === undefined) return k;
    if (vars) for (const n in vars) v = v.split('{' + n + '}').join(vars[n]);
    return v;
  };
  const langBtn = $('.lang');
  function applyLang() {
    root.lang = lang;
    document.title = t('js.title');
    const d = $('meta[name="description"]'); if (d) d.setAttribute('content', t('js.desc'));
    $$('[data-i18n]').forEach(el => {
      const v = t(el.dataset.i18n);
      // SVG text nodes take plain text; everything else may carry inline markup.
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') el.textContent = v;
      else el.innerHTML = v;
    });
    $$('[data-i18n-alt]').forEach(el => el.setAttribute('alt', t(el.dataset.i18nAlt)));
    $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    if (langBtn) langBtn.firstElementChild.textContent = t('js.langCode');
    onLangChange.forEach(fn => fn());
  }
  langBtn.addEventListener('click', () => {
    lang = lang === 'tr' ? 'en' : 'tr';
    store.set('mks-lang', lang);
    applyLang();
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
    targets.forEach((el, i) => { if (el && el.offsetTop <= y) cur = i; });
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
  const fmt = { D: v => t('js.perHour', { v }), C: v => v, P: v => t('js.tl', { v: (+v).toFixed(2) }), M: v => t('js.tl', { v: (+v).toFixed(1) }), T: v => t('js.pct', { v: Math.round(v * 100) }) };
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
    $('#oP').textContent = best ? t('js.tl', { v: best.p.toFixed(2) }) : t('js.na');
    $('#oC').textContent = best ? best.c : t('js.na');
    $('#oF').textContent = best ? t('js.pct', { v: (best.fr * 100).toFixed(1) }) : t('js.na');
    $('#oZ').textContent = best ? t('js.tl', { v: Math.round(best.z) }) : t('js.na');

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
    const xl = el('text', { x: W - R, y: H - 2, 'text-anchor': 'end' }); xl.textContent = t('js.xaxis'); chart.append(xl);
    [zMin, (zMin + zMax) / 2, zMax].forEach(z => { const t = el('text', { x: L - 6, y: sy(z) + 4, 'text-anchor': 'end' }); t.textContent = Math.round(z); chart.append(t); });
    chart.append(el('path', { class: 'curve', d: pts.map((d, i) => (i ? 'L' : 'M') + sx(d.p).toFixed(1) + ' ' + sy(d.z).toFixed(1)).join(' ') }));
    if (best) {
      chart.append(el('line', { class: 'optl', x1: sx(best.p), y1: sy(best.z), x2: sx(best.p), y2: H - B }));
      chart.append(el('circle', { class: 'opt', cx: sx(best.p), cy: sy(best.z), r: 7 }));
      const lbl = el('text', { class: 'optt', x: sx(best.p) + (best.p > 6.5 ? -12 : 12), y: sy(best.z) - 12, 'text-anchor': best.p > 6.5 ? 'end' : 'start' });
      lbl.textContent = t('js.best', { v: best.p.toFixed(2) }); chart.append(lbl);
    }
  }
  ids.forEach(k => $('#' + k).addEventListener('input', runSim));
  onLangChange.push(runSim);

  /* ---------- Solve Stop prototype ---------- */
  const TIERS = ['screw', 'gear', 'motor', 'moto', 'car', 'sport', 'plane'];
  const name = i => t('js.item.' + TIERS[i]);
  const ICON = {
    screw: 'assets/ss-screw.webp', gear: 'assets/ss-gear.webp', motor: 'assets/ss-motor.webp', moto: 'assets/ss-moto.webp',
    car: 'assets/ss-car.webp', sport: 'assets/ss-sport.webp', plane: 'assets/ss-plane.webp'
  };
  const ROUTES = [
    { goal: 3, moves: 8, hi: 'js.route.1' },
    { goal: 4, moves: 15, hi: 'js.route.2' },
    { goal: 5, moves: 24, hi: 'js.route.3' },
    { goal: 6, moves: 40, hi: 'js.route.4' }
  ];
  const N = 5;
  const boardEl = $('#board');
  let b = [], moves = 0, route = 0, busy = false, over = false;
  const rnd = () => { const r = Math.random(); return r < 0.44 ? 0 : r < 0.78 ? 1 : 2; };
  let lastSay = 'js.route.1';
  const say = (msg, key) => { lastSay = key || null; $('#rubisSays').textContent = msg; };
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
    b.forEach((tier, i) => {
      const c = cells[i];
      c.querySelector('img').src = ICON[TIERS[tier]];
      c.setAttribute('aria-label', t('js.cell', { r: Math.floor(i / N) + 1, c: i % N + 1, name: name(tier) }));
      c.dataset.t = tier;
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
    $('#routeTxt').textContent = t('js.routeLabel', { n: r + 1 });
    say(t(ROUTES[r].hi), ROUTES[r].hi);
    const a = {}; b.forEach((_, i) => a[i] = 'pop'); paint(reduced ? {} : a);
  }
  const upTool = (i, a) => { if (b[i] <= 2) { b[i]++; a[i] = 'boost'; } };
  function tap(i) {
    if (busy) return;
    if (over) { startRoute(over === 'win' ? Math.min(route + 1, ROUTES.length - 1) : route); return; }
    const g = group(i), n = g.length, tier = b[i];
    if (n < 3) { cells[i].classList.remove('shake'); void cells[i].offsetWidth; cells[i].classList.add('shake'); say(t('js.needThree')); return; }
    busy = true;
    const a = {};
    g.forEach(c => { b[c] = rnd(); a[c] = 'pop'; });
    const step = n >= 9 ? 2 : 1;
    b[i] = Math.min(6, tier + step); a[i] = 'up';
    if (n >= 6 && n <= 8) { const o = g.filter(c => c !== i).sort((x, y) => nb(i).includes(y) - nb(i).includes(x))[0]; b[o] = Math.min(6, tier + 1); a[o] = 'up'; }
    let msg = step === 2 ? t('js.double', { from: name(tier), to: name(b[i]) }) : t('js.matched', { n, name: name(b[i]) });
    const props = n >= 9 ? 0 : n === 8 ? 2 : n >= 5 ? 1 : 0;
    for (let k = 0; k < props; k++) { const c = Math.floor(Math.random() * N * N); nb(c).forEach(x => upTool(x, a)); }
    if (props) msg += t('js.propeller');
    if (n >= 12) { b.forEach((_, x) => { if (x !== i) upTool(x, a); }); msg += t('js.fireworks'); }
    else if (n >= 9) { const y = Math.floor(i / N), x0 = i % N; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x0 + dx; if ((dy || dx) && yy >= 0 && yy < N && xx >= 0 && xx < N) upTool(yy * N + xx, a); } msg += t('js.bomb'); }
    moves--;
    paint(reduced ? {} : a);
    setTimeout(() => {
      busy = false;
      const goal = ROUTES[route].goal;
      if (Math.max(...b) >= goal) {
        over = 'win';
        say(route === ROUTES.length - 1 ? t('js.winFinal') : t('js.winRoute', { n: route + 1, m: moves }));
        return;
      }
      if (moves <= 0) { over = 'lose'; say(t('js.lose')); return; }
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
    say(auto ? t('js.shuffleAuto') : t('js.shuffleManual'));
  }
  $('#shuffleBtn').addEventListener('click', () => shuffle(false));
  $('#restartBtn').addEventListener('click', () => startRoute(route));
  startRoute(0);
  onLangChange.push(() => {
    paint();
    $('#routeTxt').textContent = t('js.routeLabel', { n: route + 1 });
    // Only a known line can be restated; a mid-game message stays as it was.
    if (lastSay) $('#rubisSays').textContent = t(lastSay);
  });

  /* ---------- Lee ---------- */
  const egg = $('#leeEgg'), leeIn = $('#leeSteps'), leeOut = $('#leeOut');
  const leeRun = () => {
    const s = +leeIn.value, k = s / 12000;
    leeOut.textContent = t('js.steps', { n: s.toLocaleString(t('js.locale')) });
    egg.style.setProperty('--s', (0.82 + k * 0.42).toFixed(3));
    egg.style.setProperty('--g', k.toFixed(3));
  };
  leeIn.addEventListener('input', () => { egg.classList.add('on'); leeRun(); });
  onLangChange.push(leeRun);

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
  let shown = 2, lives = 3, done = false, tvState = { key: 'js.tvIntro' };
  const pathEl = $('#tvPath'), optsEl = $('#tvOpts');
  function drawPath() {
    pathEl.textContent = '';
    PATH.forEach(([y, c], i) => {
      const li = document.createElement('li');
      if (i < shown || done) { li.innerHTML = `<small>${y}</small>${c}`; }
      else { li.className = 'hid'; li.innerHTML = `<small>${y}</small>? ? ? ? ?`; }
      pathEl.append(li);
    });
    $('#tvLives').textContent = t('js.tvLives', { n: lives });
  }
  OPTS.forEach(name => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = name;
    bt.addEventListener('click', () => {
      if (done || bt.classList.contains('no')) return;
      if (name === ANSWER) {
        done = true; bt.classList.add('yes');
        tvState = { key: 'js.tvSolved', vars: { n: shown } };
        $('#tvMsg').textContent = t('js.tvSolved', { n: shown });
      } else {
        bt.classList.add('no'); lives--; shown = Math.min(PATH.length, shown + 1);
        if (lives === 0) { done = true; tvState = { key: 'js.tvOut', vars: { name: ANSWER } }; $('#tvMsg').textContent = t('js.tvOut', { name: ANSWER }); optsEl.querySelectorAll('button').forEach(x => { if (x.textContent === ANSWER) x.classList.add('yes'); }); }
        else { tvState = { key: 'js.tvWrong' }; $('#tvMsg').textContent = t('js.tvWrong'); }
      }
      drawPath();
    });
    optsEl.append(bt);
  });
  onLangChange.push(() => { drawPath(); $('#tvMsg').textContent = t(tvState.key, tvState.vars); });

  /* ---------- first paint in the active language ---------- */
  applyLang();
})();
