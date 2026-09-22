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

const browser = await chromium.launch();
await screenshotMatrix(browser);
await simulator(browser);
await game(browser);
await keyboard(browser);
await browser.close();

if (noise.size) {
  console.log('\nIgnored (runner environment, not the page):');
  for (const n of noise) console.log('  · ' + n);
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
