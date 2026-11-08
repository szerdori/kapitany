// Az alapréteg futásának tesztjei: letöltés, mentés, a teljes napi futás és maga az alap.mjs.
// Valódi hálózat és valódi Firebase nélkül: a fetch és az adatbázis kitalált.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchFeed, saveAlap, runAlap, COLL } from '../scripts/lib.mjs';

const NOW = Date.parse('2026-11-08T08:00:00Z');
const now = () => NOW;
const ago = h => new Date(NOW - h * 3600e3).toUTCString();
const rss = (...titles) => `<rss><channel>${titles.map((t, i) => `<item><title>${t}</title><link>https://ex.com/${encodeURIComponent(t)}/${i}</link><pubDate>${ago(1)}</pubDate></item>`).join('')}</channel></rss>`;
const response = (body, status = 200) => ({ ok: status < 400, status, text: async () => body });

// firebase-admin-szerű memóriabeli Firestore: collection(c).doc(id).get/set/create
function fakeDb(seed = {}) {
  const store = { ...seed };
  return {
    store,
    collection: c => ({
      doc: id => {
        const p = `${c}/${id}`;
        return {
          get: async () => ({ exists: p in store, data: () => store[p] }),
          set: async d => { store[p] = d; },
          create: async d => { if (p in store) throw Object.assign(new Error('exists'), { code: 6 }); store[p] = d; },
        };
      },
    }),
  };
}

test('fetchFeed: sikeres letöltés, a kérés azonosítja magát', async () => {
  const logs = [];
  let seen;
  const r = await fetchFeed({ nev: 'Telex', url: 'https://telex.hu/rss' }, {
    fetchImpl: async (url, opts) => { seen = { url, opts }; return response(rss('Egy', 'Kettő')); },
    log: m => logs.push(m),
  });
  assert.equal(r.items.length, 2);
  assert.equal(seen.url, 'https://telex.hu/rss');
  assert.match(seen.opts.headers['User-Agent'], /Kapitany/);
  assert.deepEqual(logs, ['  Telex: 2 elem']);
});

test('fetchFeed: HTTP-hiba és hálózati hiba üres listát ad, a napló csak a forrás nevét írja', async () => {
  const logs = [];
  const log = m => logs.push(m);
  assert.deepEqual((await fetchFeed({ nev: 'A', url: 'https://a' }, { fetchImpl: async () => response('', 403), log })).items, []);
  const err = Object.assign(new Error('titkos részlet'), { name: 'TimeoutError' });
  assert.deepEqual((await fetchFeed({ nev: 'B', url: 'https://b' }, { fetchImpl: async () => { throw err; }, log })).items, []);
  assert.deepEqual(logs, ['  A: HTTP 403', '  B: nem érhető el (TimeoutError)']);
});

test('saveAlap: elmenti a napi anyagot, az új kártyákat és a futás idejét', async () => {
  const db = fakeDb({ [`${COLL.cards}/regi`]: { cim: 'régi' } });
  const daily = { reteg: 'alap', rovatok: [{ id: 'itthon', items: [{}, {}] }], claudeHirek: [] };
  const r = await saveAlap({ db, daily, cards: [{ id: 'uj', cim: 'új' }, { id: 'regi', cim: 'régi' }], today: '2026-11-08', now, log: () => {} });
  assert.deepEqual(r, { dailySaved: true, added: 1 });
  assert.equal(db.store[`${COLL.daily}/2026-11-08`].datum, '2026-11-08');
  assert.equal(db.store[`${COLL.daily}/2026-11-08`].keszult, NOW);
  assert.deepEqual(db.store[`${COLL.cards}/uj`], { id: 'uj', cim: 'új', reteg: 'alap', felveve: NOW });
  assert.deepEqual(db.store[`${COLL.cards}/regi`], { cim: 'régi' }, 'a meglévő kártya nem íródik felül');
  assert.deepEqual(db.store[`${COLL.meta}/alap`], { utolsoFutas: NOW });
});

test('saveAlap: a Claude-összefoglalót nem írja felül, de az alapváltozatot igen', async () => {
  const claude = { reteg: 'claude', zaras: 'Claude írta' };
  const db = fakeDb({ [`${COLL.daily}/2026-11-08`]: claude, [`${COLL.daily}/2026-11-07`]: { reteg: 'alap' } });
  const daily = { reteg: 'alap', rovatok: [], claudeHirek: [] };
  const logs = [];
  assert.equal((await saveAlap({ db, daily, cards: [], today: '2026-11-08', now, log: m => logs.push(m) })).dailySaved, false);
  assert.equal(db.store[`${COLL.daily}/2026-11-08`], claude);
  assert.match(logs[0], /már van Claude-összefoglaló/);
  assert.equal((await saveAlap({ db, daily, cards: [], today: '2026-11-07', now, log: () => {} })).dailySaved, true);
});

test('saveAlap: az „ALREADY_EXISTS”-en kívüli adatbázishiba nem nyelődik le', async () => {
  const db = fakeDb();
  db.collection = () => ({ doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, create: async () => { throw Object.assign(new Error('nincs jog'), { code: 7 }); } }) });
  await assert.rejects(saveAlap({ db, daily: { rovatok: [] }, cards: [{ id: 'x' }], today: 'd', now, log: () => {} }), /nincs jog/);
});

const sources = {
  hirek: [{ id: 't', nev: 'Telex', url: 'https://hir', rovat: 'itthon' }, { id: 'h', nev: 'Halott', url: 'https://halott', rovat: 'vilag' }],
  inspiracio: [{ id: 's', nev: 'Sly', url: 'https://insp', tema: 'dnd', tipus: 'szoveg' }],
  tiltott: ['gyilkos'],
};
const fakeFetch = async url => (url === 'https://halott' ? response('', 500) : response(url === 'https://hir' ? rss('Adódöntés', 'Gyilkosság') : rss('Kalandötlet')));

test('runAlap: próbafutás adatbázis nélkül, tiltott hír nélkül', async () => {
  const logs = [];
  const r = await runAlap({ sources, fetchImpl: fakeFetch, now, log: m => logs.push(m) });
  assert.equal(r.proba, true);
  assert.deepEqual(r.daily.rovatok.map(x => x.items.map(i => i.cim)), [['Adódöntés']]);
  assert.equal(r.cards.length, 1);
  assert.match(logs.at(-1), /Próbafutás .*1 hír, 1 kártya/);
  assert.ok(logs.includes('  Halott: HTTP 500'));
});

test('runAlap: éles futás a budapesti mai napra ment', async () => {
  const db = fakeDb();
  const late = () => Date.parse('2026-11-08T23:30:00Z'); // Budapesten már 11-09
  const r = await runAlap({ sources, fetchImpl: fakeFetch, getDb: async () => db, now: late, log: () => {} });
  assert.equal(r.proba, false);
  assert.equal(r.added, 1);
  assert.ok(`${COLL.daily}/2026-11-09` in db.store);
});

test('alap.mjs: kulcs nélkül próbafutást csinál, és nem tölti be a firebase-admint', () => {
  // A fetch-et egy előre betöltött modul cseréli le, így a script nem megy ki a netre.
  const stub = 'data:text/javascript,' + encodeURIComponent(
    `globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<rss><channel><item><title>Hír</title><link>https://x/1</link></item></channel></rss>' });`);
  const env = { ...process.env };
  delete env.FIREBASE_SERVICE_ACCOUNT;
  const res = spawnSync(process.execPath, ['--import', stub, fileURLToPath(new URL('../scripts/alap.mjs', import.meta.url))], { env, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Hírforrások:/);
  assert.match(res.stdout, /Próbafutás \(nincs FIREBASE_SERVICE_ACCOUNT\)/);
});
