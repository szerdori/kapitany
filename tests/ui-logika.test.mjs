// A felület belső logikája és ritkább ágai: ajánló, időjárás-tipp, hibakezelés, beállítások,
// valamint a Firebase-adapter (kitalált Firebase-modulokkal, a valódi szerverhez nem nyúl).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, newPage, openApp, card, daily, NOW, TODAY, DAY, INDEX } from './ui-segito.mjs';

useBrowser();

const fonts = page => page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const wait = page => page.waitForTimeout(50);

// ---- Tiszta függvények (window.KapitanyApp._test) ----

test('ajánló: súlyok szavazatonként, 30 napos felezési idővel, ismeretlen szavazat nélkül', async () => {
  const { page } = await openApp({});
  const w = await page.evaluate(now => window.KapitanyApp._test.weights([
    { szavazat: 'fel', tema: 'dnd', forras: 'A', ido: now },
    { szavazat: 'fel', tema: 'dnd', forras: 'A', ido: now - 30 * 86400e3 },
    { szavazat: 'le', tema: 'ai' },
    { szavazat: 'valami', tema: 'dnd' },
    { szavazat: 'ugras' },
  ], now), NOW);
  assert.equal(w.tema.dnd, 1.5, 'friss 👍 = 1, egy hónapos 👍 = 0,5');
  assert.equal(w.forras.A, 1.5);
  assert.equal(w.tema.ai, -1.5, 'idő nélküli szavazat nem öregszik');
  assert.deepEqual(Object.keys(w.tema).sort(), ['ai', 'dnd']);
  await page.close();
});

test('ajánló: minden negyedik kártya felfedezés a kevésbé kedvelt félből', async () => {
  const { page } = await openApp({});
  const r = await page.evaluate(today => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, tema: i < 3 ? 'dnd' : 'ai', tipus: 'szoveg' }));
    const feedback = [1, 2, 3].map(i => ({ id: 'x' + i, szavazat: 'fel', tema: 'dnd', nap: today }));
    const { nextCard, reason } = window.KapitanyApp._test;
    const r1 = nextCard({ cards, feedback, mod: 'csendes', today, rand: () => 0 });
    const r2 = nextCard({ cards, feedback: feedback.slice(0, 2), mod: 'csendes', today, rand: () => 0 });
    return { f1: r1.felfedezes, t1: r1.card.tema, why1: reason(r1), f2: r2.felfedezes, t2: r2.card.tema, empty: nextCard({ cards: [], feedback: [], mod: 'csendes', today }) };
  }, TODAY);
  assert.equal(r.f1, true);
  assert.equal(r.t1, 'ai', 'a felfedezés nem a kedvenc témából jön');
  assert.match(r.why1, /felfedezés/);
  assert.equal(r.f2, false);
  assert.equal(r.t2, 'dnd');
  assert.equal(r.empty, null);
  await page.close();
});

test('ajánló: indoklás forrás, téma és alapeset szerint', async () => {
  const { page } = await openApp({});
  const why = await page.evaluate(() => {
    const { reason } = window.KapitanyApp._test;
    const c = { tema: 'neveles', forras: 'ParentData' };
    return [
      reason({ card: c, w: { tema: {}, forras: { ParentData: 2 } } }),
      reason({ card: c, w: { tema: { neveles: 2 }, forras: {} } }),
      reason({ card: { tema: 'ismeretlen' }, w: { tema: { ismeretlen: 2 }, forras: {} } }),
      reason({ card: c, w: { tema: {}, forras: {} } }),
    ];
  });
  assert.match(why[0], /ParentData írásai/);
  assert.match(why[1], /Gyereknevelés témát/);
  assert.match(why[2], /ismeretlen témát/, 'ismeretlen téma a saját nevével');
  assert.match(why[3], /még tanulom/);
  await page.close();
});

test('mód: csendesben csak szöveg és feliratos videó, hangosban minden', async () => {
  const { page } = await openApp({});
  const r = await page.evaluate(() => {
    const { allowed } = window.KapitanyApp._test;
    return [allowed({ tipus: 'podcast' }, 'csendes'), allowed({ tipus: 'podcast' }, 'hangos'), allowed({}, 'csendes'), allowed({ tipus: 'video', feliratos: null }, 'csendes')];
  });
  assert.deepEqual(r, [false, true, true, false]);
  await page.close();
});

test('időjárás-tipp: hó, fagy, esernyő csapadékmennyiség alapján is', async () => {
  const { page } = await openApp({});
  const tips = await page.evaluate(() => {
    const { weatherTip } = window.KapitanyApp._test;
    return [
      weatherTip({ snowfall_sum: 2, precipitation_probability_max: 90, precipitation_sum: 5, temperature_2m_min: -5 }),
      weatherTip({ snowfall_sum: 0, precipitation_probability_max: 10, precipitation_sum: 1.2, temperature_2m_min: 3 }),
      weatherTip({ snowfall_sum: 0, precipitation_probability_max: 10, precipitation_sum: 0, temperature_2m_min: 3 }),
    ];
  });
  assert.equal(tips[0], 'Havazás várható. Vigyél esernyőt. Fagyos reggel, öltözz rétegesen.');
  assert.equal(tips[1], 'Vigyél esernyőt.');
  assert.equal(tips[2], 'Esernyő nem kell.');
  await page.close();
});

// ---- Ritkább felületi állapotok ----

test('Mai nap: nincs még anyag, és az időjárás nem érhető el', async () => {
  const { page, errors } = await openApp({}, { weatherStatus: 500 });
  const view = await page.textContent('#view');
  assert.match(view, /Még nincs napi anyag/);
  assert.match(view, /Az időjárás most nem érhető el/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Mai nap: a legfrissebb napi anyag látszik, üres rovat és alapértelmezett zárás', async () => {
  const seed = {
    'kapitany_daily/2026-11-06': { datum: '2026-11-06', reteg: 'alap', rovatok: [{ id: 'eu', cim: 'EU', items: [{ cim: 'Régebbi', linkek: [] }] }] },
    [`kapitany_daily/${TODAY}`]: { datum: TODAY, reteg: 'alap', rovatok: [{ id: 'eu', cim: 'Üres rovat', items: [] }, { id: 'vilag', cim: 'Világ', items: [{ cim: 'Mai', linkek: [{ url: 'https://x' }] }] }] },
  };
  const { page } = await openApp(seed);
  const view = await page.textContent('#view');
  assert.match(view, /Mai/);
  assert.doesNotMatch(view, /Régebbi|Üres rovat/);
  assert.match(view, /Ennyi a fontos\./);
  assert.match(await page.textContent('.news .links a'), /forrás/, 'névtelen link „forrás” felirattal');
  assert.equal(await page.locator('[data-k=old]').count(), 0);
  await page.close();
});

test('Inspiráció: magyar leírás, percek, a lefordított cím alatt az eredeti', async () => {
  const { page } = await openApp({ 'kapitany_cards/p1': card('p1', { tipus: 'podcast', percek: 25, cimHu: 'Magyarul', leirasHu: 'Magyar leírás' }) }, { tab: 'insp' });
  await page.click('button[data-act=mod][data-v=hangos]');
  await wait(page);
  const text = await page.textContent('[data-k=card]');
  assert.match(text, /Podcast · 25 perc/);
  assert.match(text, /Magyarul/);
  assert.match(text, /Cikk p1/, 'az eredeti cím is látszik');
  assert.match(text, /Magyar leírás/);
  await page.close();
});

test('Inspiráció: hangos módban üres pakli, és a mentési hiba jelzése', async () => {
  const { page } = await openApp({ 'kapitany_settings/main': { mod: 'hangos' }, 'kapitany_cards/h1': card('h1') }, { tab: 'insp' });
  await page.evaluate(() => { const orig = window.__db.doc; window.__db.doc = p => (p.startsWith('kapitany_feedback/') ? { set: async () => { throw new Error('offline'); } } : orig(p)); });
  await page.click('button[data-act=vote][data-v=le]');
  await wait(page);
  assert.match(await page.textContent('#toast'), /A mentés nem sikerült/);
  const empty = await page.textContent('[data-k=empty]');
  assert.match(empty, /Most nincs új kártya/);
  assert.doesNotMatch(empty, /hangos módban több/);
  await page.close();
});

test('Inspiráció: napi keret után a Később lista gombja átvisz', async () => {
  const seed = { 'kapitany_settings/main': { napiKeret: 3 } };
  for (let i = 0; i < 3; i++) seed[`kapitany_feedback/f${i}`] = { szavazat: 'fel', tema: 'dnd', forras: 'x', ido: NOW - 60e3, nap: TODAY, cim: 'c', url: 'u' };
  const { page } = await openApp(seed, { tab: 'insp' });
  await page.click('[data-k=limit] button[data-act=tab]');
  await wait(page);
  assert.equal(await page.textContent('#title'), 'Később');
  await page.close();
});

test('Később: a lista a legutóbb mentettel kezdődik, a kész elemek nélkül', async () => {
  const fb = (cim, ido, extra = {}) => ({ szavazat: 'kesobb', cim, url: 'https://x/' + cim, forras: 'F', ido, nap: TODAY, ...extra });
  const { page } = await openApp({ 'kapitany_feedback/a': fb('Régebbi', NOW - DAY), 'kapitany_feedback/b': fb('Újabb', NOW), 'kapitany_feedback/c': fb('Kész', NOW, { kesz: true }) }, { tab: 'kesobb' });
  assert.deepEqual(await page.locator('ul.later a').allTextContents(), ['Újabb', 'Régebbi']);
  await page.close();
});

test('Beállítások: napi kártyaszám 3 és 60 közé szorítva mentődik', async () => {
  const { page, store } = await openApp({}, { tab: 'beall' });
  for (const [input, want] of [['100', 60], ['1', 3], ['', 15], ['20', 20]]) {
    await page.fill('#limit', input);
    await page.dispatchEvent('#limit', 'change');
    await wait(page);
    assert.equal((await store())['kapitany_settings/main'].napiKeret, want, `"${input}"`);
  }
  assert.match(await page.textContent('#toast'), /Elmentve/);
  await page.close();
});

test('Beállítások: városkereső üres keresés, nincs találat, és nem elérhető', async () => {
  const { page } = await openApp({}, { tab: 'beall', geo: {} });
  await page.click('form[data-form=city] button'); // üres mezővel: nem történik semmi
  await wait(page);
  assert.equal(await page.locator('.results, [data-form=city] ~ p').count(), 0);
  await page.fill('form[data-form=city] input', 'Xyz');
  await page.click('form[data-form=city] button');
  await wait(page);
  assert.match(await page.textContent('#view'), /Nincs találat/);
  await page.close();

  const b = await openApp({}, { tab: 'beall', geo: 'hiba' });
  await b.page.fill('form[data-form=city] input', 'Debrecen');
  await b.page.click('form[data-form=city] button');
  await wait(b.page);
  assert.match(await b.page.textContent('#toast'), /A keresés most nem elérhető/);
  await b.page.close();
});

test('Fiók: Kilépés gomb, és a kilépés leállítja a figyelést', async () => {
  const { page } = await openApp({ 'kapitany_meta/alap': { utolsoFutas: NOW } }, { tab: 'beall' });
  assert.match(await page.textContent('[data-k=alap-run]'), /2026-11-08/);
  await page.evaluate(() => { window.__calls = []; window.KapitanyAuth = { signOut: () => window.__calls.push('ki'), signIn: () => window.__calls.push('be') }; });
  await page.click('button[data-act=signout]');
  await page.evaluate(() => window.KapitanyApp.setAuth({ status: 'signedOut', error: 'Lejárt a belépés.' }));
  assert.match(await page.textContent('#gate'), /Lejárt a belépés\./);
  await page.click('button[data-act=signin]');
  assert.deepEqual(await page.evaluate(() => window.__calls), ['ki', 'be']);
  // kilépés után az adatbázis változása már nem rajzolja újra az appot
  await page.evaluate(() => window.__db.doc('kapitany_settings/main').set({ mod: 'hangos' }));
  await wait(page);
  assert.equal(await page.isVisible('#app'), false);
  await page.close();
});

test('Kapu: betöltés és Firebase-beállítás nélküli állapot', async () => {
  const page = await newPage();
  await fonts(page);
  // a firebase-config.js ne tudja beállítani a konfigurációt
  await page.addInitScript(() => Object.defineProperty(window, 'FIREBASE_CONFIG', { get: () => undefined, set() {} }));
  await page.goto(INDEX);
  await wait(page);
  assert.match(await page.textContent('#gate'), /Még nincs összekötve a Firebase-szel/);
  await page.close();
});

// ---- Firebase-adapter kitalált Firebase-modulokkal ----

const FAKE = {
  'firebase-app.js': `export const initializeApp = cfg => ({ cfg });`,
  'firebase-auth.js': `
    const A = window.__auth = { calls: [], cb: null, popupError: null };
    export const getAuth = app => ({ app });
    export class GoogleAuthProvider { setCustomParameters(p) { A.params = p; } }
    export const signInWithPopup = async () => { A.calls.push('popup'); if (A.popupError) throw { code: A.popupError }; };
    export const signInWithRedirect = async () => { A.calls.push('redirect'); };
    export const signOut = async () => { A.calls.push('signOut'); };
    export const onAuthStateChanged = (auth, cb) => { A.cb = cb; cb(null); };`,
  'firebase-firestore.js': `
    const F = window.__fs = { sets: [], data: {}, errs: [] };
    export const persistentMultipleTabManager = () => ({});
    export const persistentLocalCache = o => o;
    export const initializeFirestore = (app, o) => ({ app, o });
    export const collection = (fs, path) => ({ path });
    export const where = (f, op, v) => ({ f, op, v });
    export const query = (ref, ...w) => ({ path: ref.path, w });
    export const doc = (fs, path) => ({ path, single: true });
    export const setDoc = async (ref, d, o) => { F.sets.push([ref.path, d, o]); };
    const wrap = (path, d) => ({ id: path.split('/').pop(), exists: () => d !== undefined, data: () => d });
    export const onSnapshot = (ref, next, err) => {
      F.errs.push(err);
      if (ref.single) next(wrap(ref.path, F.data[ref.path]));
      else next({ docs: Object.keys(F.data).filter(p => p.startsWith(ref.path + '/')).map(p => wrap(p, F.data[p])) });
      return () => {};
    };`,
};

async function openWithFakeFirebase(data) {
  const page = await newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fonts(page);
  await page.addInitScript(`window.KAPITANY_NOW = () => ${NOW};`);
  await page.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 500, body: '' }));
  await page.route('https://www.gstatic.com/firebasejs/**', r => {
    const name = r.request().url().split('/').pop();
    r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE[name] });
  });
  await page.addInitScript(d => { window.__seed = d; }, data);
  await page.goto(INDEX);
  await page.waitForFunction(() => window.__auth && window.__fs);
  await page.evaluate(() => Object.assign(window.__fs.data, window.__seed));
  return { page, errors };
}

test('Firebase-adapter: kilépett állapot, belépés után az adatok a Firestore-ból jönnek', async () => {
  const { page, errors } = await openWithFakeFirebase({ [`kapitany_daily/${TODAY}`]: daily()[`kapitany_daily/${TODAY}`] });
  assert.equal(await page.isVisible('button[data-act=signin]'), true);
  assert.deepEqual(await page.evaluate(() => window.__auth.params), { prompt: 'select_account' });
  await page.evaluate(() => window.__auth.cb({ email: 'dori@example.com' }));
  await wait(page);
  assert.match(await page.textContent('#view'), /Nő a családi pótlék/);
  // a Firestore-hibák nem dobnak, csak figyelmeztetnek
  await page.evaluate(() => window.__fs.errs.forEach(e => e({ code: 'permission-denied' })));
  // mentés a valódi adapteren keresztül
  await page.click('nav.tabs button[data-tab=beall]');
  await page.fill('#limit', '10');
  await page.dispatchEvent('#limit', 'change');
  assert.deepEqual(await page.evaluate(() => window.__fs.sets.at(-1)), ['kapitany_settings/main', { napiKeret: 10 }, { merge: true }]);
  await page.click('button[data-act=signout]');
  assert.deepEqual(await page.evaluate(() => window.__auth.calls), ['signOut']);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Firebase-adapter: belépés felugró ablakkal, letiltott ablaknál átirányítással, hibánál üzenettel', async () => {
  const { page } = await openWithFakeFirebase({});
  const signIn = async err => { await page.evaluate(e => { window.__auth.popupError = e; }, err); await page.click('button[data-act=signin]'); await wait(page); };
  await signIn(null);
  await signIn('auth/popup-blocked');
  await signIn('auth/popup-closed-by-user');
  assert.deepEqual(await page.evaluate(() => window.__auth.calls), ['popup', 'popup', 'redirect', 'popup']);
  assert.doesNotMatch(await page.textContent('#gate'), /nem sikerült/, 'a bezárt ablak nem hiba');
  await signIn('auth/network-request-failed');
  assert.match(await page.textContent('#gate'), /A belépés nem sikerült \(auth\/network-request-failed\)/);
  await page.close();
});
