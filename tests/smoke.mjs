/* End-to-end checks for the portfolio. No build step; needs a static server
   and Playwright:
     npx http-server -p 8077 -s .
     node tests/smoke.mjs                    # screenshots land in tests/shots/
   Override the target with BASE_URL. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8077/index.html';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

/* The control point from the graduation project: with the default sliders the
   model should land on about 3.95 TL, 40 tutors and roughly 94% fulfilment. */
const CONTROL = { price: 3.95, tutors: 40, fulfilMin: 93, fulfilMax: 95 };

/* Two failures come from the runner, not the page, so they are reported but
   not counted:
   - The walkthrough is H.264. Playwright's Chromium is the open-source build
     with no proprietary codecs, so it aborts the request; Chrome, Safari,
     Edge and Firefox all play it. The page already falls back to showing
     controls when play() is rejected.
   - Google Fonts is fetched through a proxy that occasionally drops a
     connection (ERR_TOO_MANY_RETRIES / certificate errors). */
const ENV_NOISE = [
  /ss-gameplay\.mp4.*(ERR_ABORTED|ERR_REQUEST_RANGE_NOT_SATISFIABLE)/,
  /fonts\.(googleapis|gstatic)\.com/,
  /ERR_TOO_MANY_RETRIES/,
  /ERR_CERT_AUTHORITY_INVALID/,
];
const isNoise = m => ENV_NOISE.some(re => re.test(m));
const noise = new Set();

async function newPage(browser, { width, height, colorScheme }) {
  // The sandbox proxy re-signs TLS, so certificate errors here are not the site's.
  const ctx = await browser.newContext({
    viewport: { width, height }, colorScheme, ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  const problems = [];
  const note = m => (isNoise(m) ? noise.add(m.slice(0, 110)) : problems.push(m));
  page.on('pageerror', e => note(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') note(`console: ${m.text()}`); });
  page.on('requestfailed', r => note(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return { ctx, page, problems };
}

async function screenshotMatrix(browser) {
  console.log('\nScreenshots and console health');
  await mkdir(SHOTS, { recursive: true });
  for (const [width, height, colorScheme] of [
    [1400, 1000, 'light'], [1400, 1000, 'dark'], [390, 844, 'light'], [390, 844, 'dark'],
  ]) {
    const tag = `${width}-${colorScheme}`;
    const { ctx, page, problems } = await newPage(browser, { width, height, colorScheme });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(SHOTS, `${tag}-hero.png`) });
    await page.screenshot({ path: join(SHOTS, `${tag}-full.png`), fullPage: true });
    // scrollWidth flickers by a few pixels while the route map animates, so
    // assert what a reader would actually notice: the page never scrolls sideways.
    const scrolled = await page.evaluate(() => {
      window.scrollTo(500, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return x;
    });
    check(`${tag}: no console errors`, problems.length === 0, problems.join(' | '));
    check(`${tag}: page does not scroll sideways`, scrolled === 0, `scrollX=${scrolled}`);
    await ctx.close();
  }
}

async function simulator(browser) {
  console.log('\nKunduz pricing simulator');
  const { ctx, page, problems } = await newPage(browser, { width: 1400, height: 1000, colorScheme: 'light' });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const read = () => page.evaluate(() => ({
    price: parseFloat(document.querySelector('#oP').textContent),
    tutors: parseInt(document.querySelector('#oC').textContent, 10),
    fulfil: parseFloat(document.querySelector('#oF').textContent.replace('%', '')),
    curve: document.querySelectorAll('#simChart .curve').length,
    opt: document.querySelectorAll('#simChart .opt').length,
  }));
  const r = await read();
  check('default price ≈ 3.95 TL', Math.abs(r.price - CONTROL.price) < 0.01, `${r.price}`);
  check('default tutors = 40', r.tutors === CONTROL.tutors, `${r.tutors}`);
  check('default fulfilment ≈ 94%',
    r.fulfil > CONTROL.fulfilMin && r.fulfil < CONTROL.fulfilMax, `${r.fulfil}%`);
  check('cost curve and optimum are drawn', r.curve === 1 && r.opt === 1);

  // The same control point must survive a language switch.
  await page.click('.lang'); await page.waitForTimeout(400);
  const tr = await read();
  check('control point unchanged in Turkish',
    tr.price === r.price && tr.tutors === r.tutors && tr.fulfil === r.fulfil,
    `${tr.price} / ${tr.tutors} / ${tr.fulfil}`);

  // Raising the service target must not lower the price.
  await page.click('.lang'); await page.waitForTimeout(200);
  await page.evaluate(() => {
    const t = document.querySelector('#T');
    t.value = '0.98'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const strict = await read();
  check('a stricter target costs at least as much', strict.price >= r.price,
    `${r.price} -> ${strict.price}`);
  check('simulator produced no console errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

async function game(browser) {
  console.log('\nSolve Stop prototype');
  const { ctx, page, problems } = await newPage(browser, { width: 1400, height: 1000, colorScheme: 'light' });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const routeLabel = () => page.textContent('#routeTxt');
  check('starts on route 1', (await routeLabel()).includes('1'));

  // Play greedily: take the biggest group, preferring the highest tier, until
  // the route advances. Losing a route just restarts it, so this terminates.
  let advanced = false;
  for (let move = 0; move < 400 && !advanced; move++) {
    const target = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#board button')];
      const N = 5, tier = cells.map(c => +c.dataset.t);
      const seen = new Array(N * N).fill(false);
      let best = null;
      for (let i = 0; i < N * N; i++) {
        if (seen[i]) continue;
        const stack = [i], grp = [];
        seen[i] = true;
        while (stack.length) {
          const c = stack.pop(); grp.push(c);
          const y = Math.floor(c / N), x = c % N;
          for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= N || nx < 0 || nx >= N) continue;
            const n = ny * N + nx;
            if (!seen[n] && tier[n] === tier[i]) { seen[n] = true; stack.push(n); }
          }
        }
        if (grp.length >= 3) {
          const score = tier[i] * 100 + grp.length;
          if (!best || score > best.score) best = { index: grp[0], score };
        }
      }
      return best ? best.index : null;
    });
    if (target === null) { await page.click('#shuffleBtn'); await page.waitForTimeout(250); continue; }
    await page.locator('#board button').nth(target).click();
    await page.waitForTimeout(260);
    if ((await routeLabel()).includes('2')) { advanced = true; break; }
    // A finished or failed route waits for a tap on the board.
    const msg = await page.textContent('#rubisSays');
    if (/complete|made it|moves|Rota|Hamle|tamam|bitti/i.test(msg)) {
      await page.locator('#board button').first().click();
      await page.waitForTimeout(260);
      if ((await routeLabel()).includes('2')) { advanced = true; }
    }
  }
  check('route advances to route 2 by playing', advanced, await routeLabel());

  // Match rules from the design document must still hold.
  const rules = await page.evaluate(() =>
    [...document.querySelectorAll('.rules tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  check('3–4 gives one upgrade', /3–4 ?1 upgraded item/.test(rules.join('|')), rules[0]);
  check('9–11 gives a double upgrade and a bomb', /9–11.*Double-tier.*Bomb/.test(rules.join('|')));
  check('12+ gives fireworks', /12\+.*Double-tier.*Fireworks/.test(rules.join('|')));
  check('game produced no console errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

async function keyboard(browser) {
  console.log('\nKeyboard and language');
  const { ctx, page, problems } = await newPage(browser, { width: 1400, height: 1000, colorScheme: 'light' });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  await page.locator('#board button').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const label = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  check('arrow keys move around the board', /2.*2/.test(label), label);
  const tabbables = await page.evaluate(() =>
    [...document.querySelectorAll('#board button')].filter(b => b.tabIndex === 0).length);
  check('board is a single tab stop', tabbables === 1, `${tabbables}`);

  await page.locator('[data-zoom]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('Enter opens the zoom dialog', await page.evaluate(() => document.querySelector('#zoom').open));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes it and focus returns',
    await page.evaluate(() => !document.querySelector('#zoom').open && document.activeElement.hasAttribute('data-zoom')));

  await page.click('.lang'); await page.waitForTimeout(350);
  check('toggle switches the document language',
    await page.evaluate(() => document.documentElement.lang === 'tr'));
  const untranslated = await page.evaluate(() =>
    [...document.querySelectorAll('[data-i18n]')].filter(el => !(el.dataset.i18n in window.I18N.tr)).length);
  check('every markup key exists in Turkish', untranslated === 0, `${untranslated} missing`);
  check('keyboard run produced no console errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

async function worldMap(browser) {
  console.log('\nWho I am world map');
  const { ctx, page, problems } = await newPage(browser, { width: 1400, height: 1000, colorScheme: 'light' });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const shown = () => page.evaluate(() =>
    [...document.querySelectorAll('.worldmap')].filter(m => !m.hasAttribute('hidden')).map(m => m.dataset.map));
  const pinsOn = () => page.evaluate(() =>
    [...document.querySelectorAll('.worldmap:not([hidden]) .pin')].map(p => p.dataset.place));

  check('the world map is the one on show', (await shown()).join() === 'world');
  const world = await pinsOn();
  check('seven pins on the world map', world.length === 7, world.join(','));

  // Every pin must sit on top at its own dot, or it cannot be tapped.
  const covered = await page.evaluate(() => {
    document.querySelector('.world-scroll').scrollIntoView({ block: 'center', behavior: 'instant' });
    return [...document.querySelectorAll('.worldmap:not([hidden]) .pin')].filter(g => {
      const b = g.querySelector('.dot').getBoundingClientRect();
      return !g.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
    }).map(g => g.dataset.place);
  });
  check('no pin is covered by its neighbour', covered.length === 0, covered.join(','));

  // Opening a pin: a translated name, a translated line, photos that load.
  let shots = 0;
  const bad = [];
  async function openPins(places) {
    for (const place of places) {
      await page.locator(`.pin[data-place="${place}"]`).click();
      await page.waitForTimeout(250);
      const r = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll('#placeShots img')];
        await Promise.all(imgs.map(i => i.complete ? null : new Promise(res => { i.onload = i.onerror = res; })));
        return {
          open: document.querySelector('#place').open,
          name: document.querySelector('#placeName').textContent,
          text: document.querySelector('#placeText').textContent,
          count: imgs.length,
          broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
          noAlt: imgs.filter(i => !i.alt || i.alt.startsWith('me.')).length,
        };
      });
      shots += r.count;
      if (!r.open || !r.name || r.name.startsWith('me.') || !r.text || r.text.startsWith('me.') || r.broken.length || r.noAlt) {
        bad.push(`${place}: ${JSON.stringify(r)}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  }
  await openPins(['italy', 'germany', 'holland', 'uk', 'vietnam']);

  // Türkiye and the United States open a map of their own instead of a card.
  for (const [country, cities] of [['turkiye', ['niksar', 'tokat', 'istanbul', 'kocaeli', 'ordu']],
                                   ['usa', ['sandusky', 'niagara', 'newyork', 'chicago']]]) {
    await page.locator(`.pin[data-place="${country}"]`).click();
    await page.waitForTimeout(400);
    check(`${country} opens its own map`, (await shown()).join() === country, (await shown()).join());
    check(`${country} card stays shut`, !(await page.evaluate(() => document.querySelector('#place').open)));
    const got = await pinsOn();
    check(`${country} map carries its ${cities.length} pins`,
      got.slice().sort().join() === cities.slice().sort().join(), got.join(','));
    const hint = await page.evaluate(() => document.querySelector('#mapHint').textContent);
    check(`${country} map shows its own line`, hint.length > 10 && !hint.includes('Tap a pin'), hint.slice(0, 40));
    await openPins(cities);
    await page.click('#mapBack');
    await page.waitForTimeout(350);
    check(`back returns to the world map with focus on ${country}`,
      (await shown()).join() === 'world'
      && await page.evaluate(c => document.activeElement.dataset.place === c, country));
  }
  check('every pin opens a translated card with working photos', bad.length === 0, bad.join(' | '));
  check('all 18 photos are reachable from the maps', shots === 18, `${shots} shown`);

  // Keyboard: Enter opens, Escape closes and hands focus back; Escape again leaves the country map.
  await page.locator('.pin[data-place="italy"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('Enter opens the place card', await page.evaluate(() => document.querySelector('#place').open));
  await page.locator('#placeShots img').first().click();
  await page.waitForTimeout(250);
  check('a photo enlarges in place',
    await page.evaluate(() => document.querySelector('#placeShots img').classList.contains('big')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes the card and focus returns to the pin',
    await page.evaluate(() => !document.querySelector('#place').open
      && document.activeElement.getAttribute('data-place') === 'italy'));

  await page.locator('.pin[data-place="usa"]').click();
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check('Escape steps back out of a country map', (await shown()).join() === 'world');

  // Everything built at runtime has to follow the language toggle.
  await page.click('.lang'); await page.waitForTimeout(350);
  const hintTr = await page.evaluate(() => document.querySelector('#mapHint').textContent);
  check('the hint follows the language toggle', hintTr.includes('nokta'), hintTr.slice(0, 40));
  await page.locator('.pin[data-place="turkiye"]').click();
  await page.waitForTimeout(350);
  await page.locator('.pin[data-place="ordu"]').click();
  await page.waitForTimeout(300);
  const tr = await page.evaluate(() => ({
    name: document.querySelector('#placeName').textContent,
    text: document.querySelector('#placeText').textContent,
    alt: document.querySelector('#placeShots img').alt,
  }));
  check('the card follows the language toggle',
    tr.name === 'Ordu' && /yama/.test(tr.text) && !/^me\./.test(tr.alt), JSON.stringify(tr));
  check('world map run produced no console errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

const browser = await chromium.launch();
await screenshotMatrix(browser);
await simulator(browser);
await game(browser);
await keyboard(browser);
await worldMap(browser);
await browser.close();

if (noise.size) {
  console.log('\nIgnored (runner environment, not the page):');
  for (const n of noise) console.log('  · ' + n);
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
