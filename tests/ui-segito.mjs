// A felületi tesztek közös része: böngésző indítása, az app megnyitása kitalált adatbázissal,
// kitalált időjárással és városkeresővel, valamint a lefedettség gyűjtése. A valódi Firebase-hez és a netre nem nyúl.
import { before, after } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
// a scripts mappa node_modules-ából (CI), vagy a gépre telepített Playwrightból
const { chromium } = createRequire(new URL('../scripts/package.json', import.meta.url))('playwright');

const ROOT = new URL('../', import.meta.url);
export const INDEX = new URL('index.html', ROOT).href;
export const MOCK = await readFile(new URL('tests/mock-db.js', ROOT), 'utf8');
export const NOW = Date.parse('2026-11-08T07:30:00Z'); // budapesti idő szerint 2026-11-08 8:30
export const TODAY = '2026-11-08';
export const DAY = 86400e3;

export const weather = {
  current: { time: '2026-11-08T08:30', temperature_2m: 6.4, weather_code: 3 },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-11-0${8 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: Array(48).fill(7), precipitation_probability: Array(48).fill(70), weather_code: Array(48).fill(61),
  },
  daily: { temperature_2m_max: [9, 8], temperature_2m_min: [2, 1], precipitation_sum: [3.2, 0], precipitation_probability_max: [80, 10], snowfall_sum: [0, 0] },
};

export const card = (id, extra = {}) => ({ id, url: `https://ex.com/${id}`, cim: `Cikk ${id}`, leiras: 'Leírás', forras: 'Sly Flourish', tema: 'dnd', tipus: 'szoveg', feliratos: null, megjelent: NOW - DAY, felveve: NOW - DAY, ...extra });

// Böngésző: a Playwright saját Chromiuma; Windowson, ha az nincs letöltve, a gépen lévő Edge is jó.
// KAPITANY_CHROMIUM: tetszőleges Chromium-alapú böngésző útvonala.
async function launch() {
  if (process.env.KAPITANY_CHROMIUM) return chromium.launch({ executablePath: process.env.KAPITANY_CHROMIUM });
  try { return await chromium.launch(); }
  catch (e) { if (process.platform === 'win32') return chromium.launch({ channel: 'msedge' }); throw e; }
}

// Lefedettségméréskor (npm run lefedettseg) minden lap JS-lefedettségét összegyűjtjük, és a végén fájlba írjuk.
// KAPITANY_COVERAGE: a mappa, ahová a mérés kerül.
const COVERAGE = process.env.KAPITANY_COVERAGE;
const coverage = [];
export async function newPage() {
  const page = await browser.newPage();
  if (COVERAGE) {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    const close = page.close.bind(page);
    page.close = async (...a) => { coverage.push(...(await page.coverage.stopJSCoverage()).filter(e => e.url.endsWith('index.html'))); return close(...a); };
  }
  return page;
}

// Minden felületi tesztfájl elején: useBrowser(). Több tesztfájl párhuzamosan fut, ezért mindegyik saját fájlba ír.
let browser;
export function useBrowser() {
  before(async () => { browser = await launch(); });
  after(async () => {
    await browser.close();
    if (COVERAGE) await writeFile(join(COVERAGE, `bongeszo-${process.pid}.json`), JSON.stringify(coverage));
  });
}

export async function openApp(seed, { tab, weatherStatus = 200, geo } = {}) {
  const page = await newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(`window.KAPITANY_TEST = true; window.KAPITANY_NOW = () => ${NOW};\n${MOCK}`);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://api.open-meteo.com/**', r => r.fulfill({ status: weatherStatus, contentType: 'application/json', body: JSON.stringify(weather) }));
  await page.route('https://geocoding-api.open-meteo.com/**', r => (geo === 'hiba' ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geo || { results: [{ name: 'Debrecen', admin1: 'Hajdú-Bihar', country: 'Magyarország', latitude: 47.53, longitude: 21.63 }] }) })));
  await page.goto(INDEX);
  const db = await page.evaluateHandle(s => { window.__db = window.mockDb(s); window.KapitanyApp.setAuth({ status: 'signedIn', email: 'dori@example.com', db: window.__db }); return window.__db; }, seed);
  if (tab) await page.click(`nav.tabs button[data-tab=${tab}]`);
  await page.waitForTimeout(50);
  return { page, errors, store: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__db.store))), db };
}

export const daily = (extra = {}) => ({
  [`kapitany_daily/${TODAY}`]: {
    datum: TODAY, reteg: 'claude', keszult: NOW - 3600e3, zaras: 'Ennyi volt.',
    rovatok: [{ id: 'itthon', cim: 'Itthon', items: [{ cim: 'Nő a családi pótlék', osszefoglalo: 'A kormány döntött.', miert: 'Két gyereked van.', linkek: [{ nev: 'Telex', url: 'https://telex.hu/a' }, { nev: 'Index', url: 'https://index.hu/a' }] }] }],
    claudeHirek: [{ cim: 'Új Claude funkció', osszefoglalo: 'Valami új.', mireJo: 'Gyorsabb tervezés.', linkek: [{ nev: 'Anthropic', url: 'https://anthropic.com/news/x' }] }],
    ...extra,
  },
});

