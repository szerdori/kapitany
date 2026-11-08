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

test('Inspiráció: napi keret után a Napló gombja átvisz', async () => {
  const seed = { 'kapitany_settings/main': { napiKeret: 3 } };
  for (let i = 0; i < 3; i++) seed[`kapitany_feedback/f${i}`] = { szavazat: 'fel', tema: 'dnd', forras: 'x', ido: NOW - 60e3, nap: TODAY, cim: 'c', url: 'u' };
  const { page } = await openApp(seed, { tab: 'insp' });
  await page.click('[data-k=limit] button[data-act=tab]');
  await wait(page);
  assert.equal(await page.textContent('#title'), 'Napló');
  await page.close();
});

test('Napló: a Később szűrő a legutóbb mentettel kezdődik, a kész elemek nélkül', async () => {
  const fb = (cim, ido, extra = {}) => ({ szavazat: 'kesobb', cim, url: 'https://x/' + cim, forras: 'F', ido, nap: TODAY, ...extra });
  const { page } = await openApp({ 'kapitany_feedback/a': fb('Régebbi', NOW - DAY), 'kapitany_feedback/b': fb('Újabb', NOW), 'kapitany_feedback/c': fb('Kész', NOW, { kesz: true }) }, { tab: 'naplo' });
  assert.deepEqual(await page.locator('ul.later a').allTextContents(), ['Újabb', 'Régebbi']);
  assert.match(await page.textContent('button[data-act=naplo][data-v=kesobb]'), /\(2\)/);
  await page.close();
});

test('Napló: az átugrott, a nem tetszett és a megnyitott is megmarad, szűrhetően', async () => {
  const fb = (id, extra) => [`kapitany_feedback/${id}`, { cim: 'C ' + id, url: 'https://x/' + id, forras: 'F', tema: 'dnd', nap: TODAY, ido: NOW - extra.d * 60e3, ...extra }];
  const seed = Object.fromEntries([fb('u', { szavazat: 'ugras', d: 1 }), fb('l', { szavazat: 'le', d: 2 }), fb('f', { szavazat: 'fel', d: 3, olvasva: NOW }), fb('o', { olvasva: NOW, d: 4 }), fb('x', { szavazat: 'valami', d: 5 })]);
  const { page } = await openApp(seed, { tab: 'naplo' });
  // nincs függő Később-elem: a Minden nézettel indul
  assert.equal(await page.getAttribute('button[data-act=naplo][data-v=minden]', 'aria-pressed'), 'true');
  assert.deepEqual(await page.locator('ul.later a').allTextContents(), ['C u', 'C l', 'C f', 'C o']);
  assert.match(await page.textContent('li[data-id=u]'), /Átugrottad/);
  assert.match(await page.textContent('li[data-id=f]'), /Tetszett · ✓ megnyitva/);
  assert.match(await page.textContent('li[data-id=u]'), /D&D · F/);
  for (const [v, want] of [['ugras', ['C u']], ['le', ['C l']], ['fel', ['C f']], ['olvasva', ['C f', 'C o']]]) {
    await page.click(`button[data-act=naplo][data-v=${v}]`);
    await wait(page);
    assert.deepEqual(await page.locator('ul.later a').allTextContents(), want, v);
  }
  await page.close();
  const e = await openApp({}, { tab: 'naplo' });
  await e.page.click('button[data-act=naplo][data-v=minden]');
  await wait(e.page);
  assert.match(await e.page.textContent('[data-k=naplo-empty]'), /még nincs semmi/);
  await e.page.close();
});

test('Inspiráció: a megnyitott kártya a listában marad, jelölve, és a Naplóba kerül', async () => {
  const { page, store } = await openApp({ 'kapitany_cards/m1': card('m1', { oktato: true }) }, { tab: 'insp' });
  assert.match(await page.textContent('[data-k=card]'), /Oktató/);
  await page.evaluate(() => { document.querySelector('[data-act=open]').addEventListener('click', e => e.preventDefault()); });
  await page.click('[data-act=open]');
  await wait(page);
  const s = await store();
  assert.equal(s['kapitany_feedback/m1'].olvasva, NOW);
  assert.equal(s['kapitany_feedback/m1'].szavazat, undefined, 'a megnyitás nem szavazat');
  assert.equal(await page.locator('[data-k=card][data-id=m1] [data-k=opened]').count(), 1);
  // utána szavazhat is; a megnyitás ténye megmarad
  await page.click('button[data-act=vote][data-v=fel]');
  await wait(page);
  const s2 = await store();
  assert.equal(s2['kapitany_feedback/m1'].szavazat, 'fel');
  assert.equal(s2['kapitany_feedback/m1'].olvasva, NOW);
  await page.close();
});

test('Inspiráció: a megnyitás nem számít bele a napi keretbe, a lista a keretig tart', async () => {
  const seed = { 'kapitany_settings/main': { napiKeret: 4 } };
  for (let i = 0; i < 6; i++) seed[`kapitany_cards/n${i}`] = card('n' + i);
  seed['kapitany_feedback/n0'] = { olvasva: NOW, ido: NOW, nap: TODAY, cim: 'c', url: 'u' };
  seed['kapitany_feedback/n1'] = { szavazat: 'ugras', ido: NOW, nap: TODAY, cim: 'c', url: 'u' };
  const { page } = await openApp(seed, { tab: 'insp' });
  assert.equal(await page.locator('[data-k=card]').count(), 3, '4-es keretből 1 szavazat ment el');
  assert.match(await page.textContent('[data-k=feed-end]'), /még 3 kártya/);
  await page.close();
});

test('ajánló lista: nincs ismétlés, a felfedezés minden negyedik helyre kerül', async () => {
  const { page } = await openApp({});
  const r = await page.evaluate(today => {
    const cards = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, tema: i < 6 ? 'dnd' : 'ai', tipus: 'szoveg' }));
    const feedback = [{ id: 'x', szavazat: 'fel', tema: 'dnd', nap: 'régi' }];
    const list = window.KapitanyApp._test.feedList({ cards, feedback, mod: 'csendes', today, n: 20, rand: () => 0.99 });
    return list.map(x => [x.card.id, x.felfedezes]);
  }, TODAY);
  assert.equal(r.length, 12);
  assert.equal(new Set(r.map(x => x[0])).size, 12);
  assert.deepEqual(r.map(x => x[1]).slice(0, 8), [false, false, false, true, false, false, false, true]);
  await page.close();
});

test('időjárás: 3 nap előre, napszakonként, és figyelmeztetés a nagy változásokra', async () => {
  const { page } = await openApp({});
  assert.equal(await page.locator('[data-k=wx-day]').count(), 3);
  const days = await page.locator('[data-k=wx-day] .nm').allTextContents();
  assert.match(days[0], /holnap/); assert.match(days[1], /holnapután/); assert.match(days[2], /szerda/);
  const day1 = await page.textContent('[data-k=wx-day]:nth-child(1)');
  assert.match(day1, /reggel[\s\S]*délben[\s\S]*délután[\s\S]*este/);
  assert.match(day1, /10% eső · szél 25 km\/h/);
  const alerts = await page.locator('[data-k=wx-alerts] li').allTextContents();
  assert.deepEqual(alerts, [
    'Holnapután 7 fokkal hidegebb lesz, mint előtte (1° a 8° helyett).',
    'Holnapután reggel fagy: -4°.',
    'Holnapután havazás várható.',
    'Szerda sok eső: kb. 14 mm.',
    'Szerda erős szél, széllökések 75 km/h-ig.',
    'Szerda zivatar lehet.',
  ]);
  assert.match(await page.textContent('[data-k=wx-days]'), /3 cm hó/);
  await page.close();
});

test('időjárás-figyelmeztetés: melegedés, a mai nap a tegnaphoz mérve, nyugodt időben nincs', async () => {
  const { page } = await openApp({});
  const r = await page.evaluate(() => {
    const { weatherAlerts, dayName } = window.KapitanyApp._test;
    const d = (max, min, extra = {}) => ({ temperature_2m_max: max, temperature_2m_min: min, precipitation_sum: 0, snowfall_sum: 0, wind_gusts_10m_max: 20, weather_code: 1, ...extra });
    return {
      warm: weatherAlerts([d(5, 0), d(14, 4)], ['ma']),
      calm: weatherAlerts([d(10, 3), d(12, 4), d(9, 2, { snowfall_sum: 0.1 }), d(8, 1)], ['ma', 'holnap', 'holnapután']),
      snowAgain: weatherAlerts([d(1, -2, { snowfall_sum: 2 }), d(1, -3, { snowfall_sum: 2 })], ['ma']),
      names: [dayName('2026-11-08', 0), dayName('2026-11-12', 4)],
    };
  });
  assert.deepEqual(r.warm, ['Ma 9 fokkal melegebb lesz, mint előtte (14° a 5° helyett).']);
  assert.deepEqual(r.calm, []);
  assert.deepEqual(r.snowAgain, [], 'a már tartó havazás nem újdonság');
  assert.deepEqual(r.names, ['ma', 'csütörtök']);
  await page.close();
});

test('Beállítások: napi kártyaszám 3 és 60 közé szorítva mentődik', async () => {
  const { page, store } = await openApp({}, { tab: 'beall' });
  for (const [input, want] of [['100', 60], ['1', 3], ['', 25], ['20', 20]]) {
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

test('időjárás: régi formátumú, hiányos válasz (dátumok és tegnap nélkül) sem töri el', async () => {
  const wx = {
    current: { time: '2026-11-08T08:30', temperature_2m: 6, weather_code: 0 },
    hourly: { time: ['2026-11-08T09:00'], temperature_2m: [6], precipitation_probability: [null], weather_code: [0] },
    daily: { temperature_2m_max: [9, 20], temperature_2m_min: [2, 5], precipitation_sum: [0, 0], precipitation_probability_max: [null, null], snowfall_sum: [0, 0] },
  };
  const { page, errors } = await openApp({}, { wx });
  assert.equal(await page.locator('[data-k=wx-day]').count(), 1);
  assert.equal(await page.locator('.wx-slots').count(), 0, 'órás adat nélkül nincs napszakos sor');
  assert.match(await page.textContent('[data-k=wx-day]'), /0% eső/);
  assert.match(await page.textContent('[data-k=wx-alerts]'), /Holnap 11 fokkal melegebb/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Inspiráció: a megnyitás mentési hibája csendben marad, eltűnt kártyára kattintás nem hibázik', async () => {
  const { page, errors } = await openApp({ 'kapitany_cards/q1': card('q1') }, { tab: 'insp' });
  await page.evaluate(() => {
    const orig = window.__db.doc; window.__db.doc = p => (p.startsWith('kapitany_feedback/') ? { set: async () => { throw new Error('offline'); } } : orig(p));
    document.querySelector('[data-act=open]').addEventListener('click', e => e.preventDefault());
  });
  await page.click('[data-act=open]');
  await wait(page);
  assert.equal(await page.locator('[data-k=opened]').count(), 1);
  await page.evaluate(() => { window.KapitanyApp._test.state.cards = []; });
  await page.click('button[data-act=vote][data-v=fel]');
  await page.click('[data-act=open]');
  await wait(page);
  assert.deepEqual(errors, []);
  await page.close();
});
