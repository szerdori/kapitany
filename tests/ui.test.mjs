// A felület tesztjei láthatatlan böngészőben (Playwright + Chromium), memóriabeli adatbázissal és kitalált időjárással.
// A valódi Firebase-hez és a netre nem nyúlnak.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// a scripts mappa node_modules-ából (CI), vagy a gépre telepített Playwrightból
const { chromium } = createRequire(new URL('../scripts/package.json', import.meta.url))('playwright');

const ROOT = new URL('../', import.meta.url);
const INDEX = new URL('index.html', ROOT).href;
const MOCK = await readFile(new URL('tests/mock-db.js', ROOT), 'utf8');
const NOW = Date.parse('2026-11-08T07:30:00Z'); // budapesti idő szerint 2026-11-08 8:30
const TODAY = '2026-11-08';
const DAY = 86400e3;

const weather = {
  current: { time: '2026-11-08T08:30', temperature_2m: 6.4, weather_code: 3 },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-11-0${8 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: Array(48).fill(7), precipitation_probability: Array(48).fill(70), weather_code: Array(48).fill(61),
  },
  daily: { temperature_2m_max: [9, 8], temperature_2m_min: [2, 1], precipitation_sum: [3.2, 0], precipitation_probability_max: [80, 10], snowfall_sum: [0, 0] },
};

const card = (id, extra = {}) => ({ id, url: `https://ex.com/${id}`, cim: `Cikk ${id}`, leiras: 'Leírás', forras: 'Sly Flourish', tema: 'dnd', tipus: 'szoveg', feliratos: null, megjelent: NOW - DAY, felveve: NOW - DAY, ...extra });

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function openApp(seed, { tab } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(`window.KAPITANY_TEST = true; window.KAPITANY_NOW = () => ${NOW};\n${MOCK}`);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weather) }));
  await page.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Debrecen', admin1: 'Hajdú-Bihar', country: 'Magyarország', latitude: 47.53, longitude: 21.63 }] }) }));
  await page.goto(INDEX);
  const db = await page.evaluateHandle(s => { window.__db = window.mockDb(s); window.KapitanyApp.setAuth({ status: 'signedIn', email: 'dori@example.com', db: window.__db }); return window.__db; }, seed);
  if (tab) await page.click(`nav.tabs button[data-tab=${tab}]`);
  await page.waitForTimeout(50);
  return { page, errors, store: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__db.store))), db };
}

const daily = (extra = {}) => ({
  [`kapitany_daily/${TODAY}`]: {
    datum: TODAY, reteg: 'claude', keszult: NOW - 3600e3, zaras: 'Ennyi volt.',
    rovatok: [{ id: 'itthon', cim: 'Itthon', items: [{ cim: 'Nő a családi pótlék', osszefoglalo: 'A kormány döntött.', miert: 'Két gyereked van.', linkek: [{ nev: 'Telex', url: 'https://telex.hu/a' }, { nev: 'Index', url: 'https://index.hu/a' }] }] }],
    claudeHirek: [{ cim: 'Új Claude funkció', osszefoglalo: 'Valami új.', mireJo: 'Gyorsabb tervezés.', linkek: [{ nev: 'Anthropic', url: 'https://anthropic.com/news/x' }] }],
    ...extra,
  },
});

test('Mai nap: Claude-összefoglaló, források, Claude-újdonság, időjárás-tipp', async () => {
  const { page, errors } = await openApp(daily());
  const view = await page.textContent('#view');
  assert.match(view, /Claude-összefoglaló/);
  assert.match(view, /Nő a családi pótlék/);
  assert.match(view, /Miért számít: Két gyereked van\./);
  assert.match(view, /Claude-újdonságok/);
  assert.match(view, /Mire jó: Gyorsabb tervezés\./);
  assert.match(view, /Ennyi volt\./);
  assert.match(await page.textContent('[data-k=weather]'), /Vigyél esernyőt/);
  assert.equal(await page.locator('.news a[href="https://index.hu/a"]').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Mai nap: alapváltozat jelzése és régebbi anyag dátuma', async () => {
  const { page } = await openApp({ 'kapitany_daily/2026-11-07': { datum: '2026-11-07', reteg: 'alap', keszult: NOW - DAY, rovatok: [{ id: 'vilag', cim: 'Világ', items: [{ cim: 'EU leaders meet', linkek: [{ nev: 'BBC', url: 'https://bbc.co.uk/1' }] }] }] } });
  const view = await page.textContent('#view');
  assert.match(view, /Alapváltozat/);
  assert.match(view, /2026-11-07 anyaga/);
  assert.match(view, /EU leaders meet/);
  await page.close();
});

test('Mai nap: veszélyes link nem kerül ki (csak http/https)', async () => {
  const { page } = await openApp(daily({ rovatok: [{ id: 'itthon', cim: 'Itthon', items: [{ cim: 'X', linkek: [{ nev: 'rossz', url: 'javascript:alert(1)' }] }] }] }));
  assert.equal(await page.getAttribute('.news .links a', 'href'), '#');
  await page.close();
});

test('Inspiráció: szavazás mentődik, és jön a következő kártya', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/a1': card('a1'), 'kapitany_cards/b2': card('b2', { tema: 'ai', forras: 'Simon Willison' }) }, { tab: 'insp' });
  const first = await page.getAttribute('[data-k=card]', 'data-id');
  await page.click('button[data-act=vote][data-v=fel]');
  await page.waitForTimeout(50);
  const s = await store();
  assert.equal(s[`kapitany_feedback/${first}`].szavazat, 'fel');
  assert.equal(s[`kapitany_feedback/${first}`].nap, TODAY);
  const second = await page.getAttribute('[data-k=card]', 'data-id');
  assert.notEqual(second, first);
  await page.close();
});

test('Inspiráció: csendes módban felirat nélküli videó nem jön, hangos módban igen', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/v1': card('v1', { tipus: 'video', feliratos: false }) }, { tab: 'insp' });
  assert.equal(await page.locator('[data-k=empty]').count(), 1);
  await page.click('button[data-act=mod][data-v=hangos]');
  await page.waitForTimeout(50);
  assert.equal(await page.getAttribute('[data-k=card]', 'data-id'), 'v1');
  assert.equal((await store())['kapitany_settings/main'].mod, 'hangos');
  await page.close();
});

test('Inspiráció: csendes módban a feliratos videó megjelenhet', async () => {
  const { page } = await openApp({ 'kapitany_cards/v2': card('v2', { tipus: 'video', feliratos: true }) }, { tab: 'insp' });
  assert.equal(await page.getAttribute('[data-k=card]', 'data-id'), 'v2');
  await page.close();
});

test('Inspiráció: a kedvelt téma előrébb kerül, és meg is indokolja', async () => {
  const seed = {
    'kapitany_cards/x1': card('x1', { tema: 'it-vezetes', forras: 'Will Larson' }),
    'kapitany_cards/x2': card('x2', { tema: 'dnd', forras: 'The Alexandrian' }),
    'kapitany_feedback/old1': { szavazat: 'fel', tema: 'dnd', forras: 'Sly Flourish', ido: NOW - 2 * DAY, nap: '2026-11-06', cim: 'a', url: 'u' },
    'kapitany_feedback/old2': { szavazat: 'le', tema: 'it-vezetes', forras: 'Charity Majors', ido: NOW - 2 * DAY, nap: '2026-11-06', cim: 'b', url: 'u2' },
  };
  const { page } = await openApp(seed, { tab: 'insp' });
  assert.equal(await page.getAttribute('[data-k=card]', 'data-id'), 'x2');
  assert.match(await page.textContent('.why'), /D&D/);
  await page.close();
});

test('Inspiráció: Claude mai ajánlata és indoklása elsőbbséget kap', async () => {
  const { page } = await openApp({ 'kapitany_cards/c1': card('c1'), 'kapitany_cards/c2': card('c2', { ajanlva: TODAY, miert: 'Mert tetszett a múltkori.', cimHu: 'Magyar cím' }) }, { tab: 'insp' });
  assert.equal(await page.getAttribute('[data-k=card]', 'data-id'), 'c2');
  assert.match(await page.textContent('[data-k=card]'), /Magyar cím/);
  assert.match(await page.textContent('.why'), /Mert tetszett a múltkori\./);
  await page.close();
});

test('Inspiráció: napi keret után „Mára elfogyott”', async () => {
  const seed = { 'kapitany_settings/main': { napiKeret: 3 }, 'kapitany_cards/z9': card('z9') };
  for (let i = 0; i < 3; i++) seed[`kapitany_feedback/f${i}`] = { szavazat: 'ugras', tema: 'dnd', forras: 'x', ido: NOW - 60e3, nap: TODAY, cim: 'c', url: 'u' };
  const { page } = await openApp(seed, { tab: 'insp' });
  assert.match(await page.textContent('[data-k=limit]'), /Mára elfogyott/);
  await page.close();
});

test('Később: a mentett kártya megjelenik, a Kész gomb leveszi', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/k1': card('k1') }, { tab: 'insp' });
  await page.click('button[data-act=vote][data-v=kesobb]');
  await page.click('nav.tabs button[data-tab=kesobb]');
  await page.waitForTimeout(50);
  assert.match(await page.textContent('#view'), /Cikk k1/);
  await page.click('button[data-act=done]');
  await page.waitForTimeout(50);
  assert.equal((await store())['kapitany_feedback/k1'].kesz, true);
  assert.match(await page.textContent('#view'), /Üres/);
  await page.close();
});

test('Beállítások: város keresése és mentése, futások ideje', async () => {
  const { page, store } = await openApp({ 'kapitany_meta/claude': { utolsoFutas: NOW - 3600e3 } }, { tab: 'beall' });
  assert.match(await page.textContent('[data-k=claude-run]'), /2026-11-08/);
  assert.match(await page.textContent('[data-k=alap-run]'), /még nem futott/);
  await page.fill('form[data-form=city] input', 'Debrecen');
  await page.click('form[data-form=city] button');
  await page.click('button[data-act=pick-city]');
  await page.waitForTimeout(50);
  assert.equal((await store())['kapitany_settings/main'].varos.nev, 'Debrecen');
  await page.close();
});

test('Kilépett állapot: belépés gomb látszik, az app nem', async () => {
  const page = await browser.newPage();
  await page.addInitScript(`window.KAPITANY_TEST = true;`);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(INDEX);
  await page.evaluate(() => window.KapitanyApp.setAuth({ status: 'signedOut' }));
  assert.equal(await page.isVisible('button[data-act=signin]'), true);
  assert.equal(await page.isVisible('#app'), false);
  await page.close();
});

void fileURLToPath;
