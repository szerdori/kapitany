// A felület tesztjei láthatatlan böngészőben (Playwright + Chromium), memóriabeli adatbázissal és kitalált időjárással.
// A valódi Firebase-hez és a netre nem nyúlnak. A közös rész: ui-segito.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, newPage, openApp, card, daily, NOW, TODAY, DAY, INDEX } from './ui-segito.mjs';

useBrowser();

test('Mai nap: Claude-összefoglaló, források, Claude-újdonság, időjárás-tipp', async () => {
  const { page, errors } = await openApp(daily());
  const view = await page.textContent('#view');
  assert.match(view, /Claude-összefoglaló/);
  assert.match(view, /Nő a családi pótlék/);
  assert.match(await page.textContent('[data-k=hat]'), /Hogyan hat rád\s*Két gyereked van\./);
  assert.match(view, /Claude-újdonságok/);
  assert.match(view, /Mire jó\s*Gyorsabb tervezés\./);
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

test('Inspiráció: görgethető lista, a szavazás mentődik, és a kártya kikerül a listából', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/a1': card('a1'), 'kapitany_cards/b2': card('b2', { tema: 'ai', forras: 'Simon Willison' }), 'kapitany_cards/c3': card('c3', { tema: 'neveles' }) }, { tab: 'insp' });
  assert.equal(await page.locator('[data-k=card]').count(), 3, 'több kártya egyszerre látszik');
  const first = await page.getAttribute('[data-k=card]', 'data-id');
  await page.click(`[data-k=card][data-id=${first}] button[data-act=vote][data-v=fel]`);
  await page.waitForTimeout(50);
  const s = await store();
  assert.equal(s[`kapitany_feedback/${first}`].szavazat, 'fel');
  assert.equal(s[`kapitany_feedback/${first}`].nap, TODAY);
  assert.equal(await page.locator('[data-k=card]').count(), 2);
  assert.equal(await page.locator(`[data-k=card][data-id=${first}]`).count(), 0);
  assert.match(await page.textContent('[data-k=feed-end]'), /Naplóban/);
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

test('Napló: a későbbre mentett kártya megjelenik, a Kész gomb leveszi', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/k1': card('k1') }, { tab: 'insp' });
  await page.click('button[data-act=vote][data-v=kesobb]');
  await page.click('nav.tabs button[data-tab=naplo]');
  await page.waitForTimeout(50);
  assert.match(await page.textContent('#view'), /Cikk k1/);
  await page.click('button[data-act=done]');
  await page.waitForTimeout(50);
  assert.equal((await store())['kapitany_feedback/k1'].kesz, true);
  assert.match(await page.textContent('[data-k=naplo-empty]'), /Nincs későbbre mentett/);
  await page.click('button[data-act=naplo][data-v=minden]');
  await page.waitForTimeout(50);
  assert.match(await page.textContent('ul.later'), /Cikk k1[\s\S]*Későbbre mentve · kész/, 'a Minden nézetben megmarad');
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
  const page = await newPage();
  await page.addInitScript(`window.KAPITANY_TEST = true;`);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(INDEX);
  await page.evaluate(() => window.KapitanyApp.setAuth({ status: 'signedOut' }));
  assert.equal(await page.isVisible('button[data-act=signin]'), true);
  assert.equal(await page.isVisible('#app'), false);
  await page.close();
});

