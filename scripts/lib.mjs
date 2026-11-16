// Az alapréteg tiszta (adatbázis és hálózat nélküli) logikája, hogy tesztelhető legyen.
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export const COLL = {
  daily: 'kapitany_daily',
  cards: 'kapitany_cards',
  feedback: 'kapitany_feedback',
  settings: 'kapitany_settings',
  meta: 'kapitany_meta',
  input: 'kapitany_input',
};

const DAY = 86400e3;

export const ROVATOK = [
  { id: 'itthon', cim: 'Itthon' },
  { id: 'eu', cim: 'Európai Unió' },
  { id: 'vilag', cim: 'Világ' },
  { id: 'gazdasag', cim: 'Gazdaság' },
];

// A kártyák azonosítója az URL-ből számolt rövid SHA-1; a PowerShell-feltöltő ugyanígy számolja.
export const cardId = url => createHash('sha1').update(String(url).trim(), 'utf8').digest('hex').slice(0, 20);

// Budapesti dátum ÉÉÉÉ-HH-NN alakban.
export function budapestDate(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const text = v => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? v['@_href'] ?? '');
  return '';
};
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, ' ').trim();
}

// RSS 2.0, RDF (RSS 1.0) és Atom feedet is felismer; a hibás feed üres listát ad.
export function parseFeed(xml) {
  let doc;
  try {
    doc = new XMLParser({ ignoreAttributes: false, processEntities: true, htmlEntities: true }).parse(xml);
  } catch { return []; }
  const pick = it => ({
    title: stripHtml(text(it.title)),
    link: text(it.link) || '',
    date: text(it.pubDate || it['dc:date'] || it.published || it.updated || ''),
    summary: stripHtml(text(it.description || it.summary || it.content || it['content:encoded'] || '')).slice(0, 400),
  });
  if (doc?.rss?.channel) return arr(doc.rss.channel.item).map(pick).filter(i => i.title && i.link);
  if (doc?.['rdf:RDF']) return arr(doc['rdf:RDF'].item).map(pick).filter(i => i.title && i.link);
  if (doc?.feed) {
    return arr(doc.feed.entry).map(e => {
      const links = arr(e.link);
      const alt = links.find(l => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate') ?? links[0];
      return { ...pick(e), link: typeof alt === 'object' ? alt['@_href'] || '' : text(alt) };
    }).filter(i => i.title && i.link);
  }
  return [];
}

export function isBlocked(item, stems) {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  return stems.some(s => hay.includes(s.toLowerCase()));
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Friss, nem tiltott, ismétlés nélküli hírek rovatonként, a legújabbak elöl.
// kivonat: true esetén a tételek a feed kivonatát is megkapják (a Claude-bemenethez).
export function buildDaily({ feeds, stems, now = Date.now(), maxAgeHours = 36, perRovat = 6, kivonat = false }) {
  const seen = new Map();
  const sections = ROVATOK.map(r => ({ id: r.id, cim: r.cim, items: [] }));
  const claude = [];
  const all = [];
  for (const f of feeds) {
    for (const it of f.items) {
      const t = Date.parse(it.date);
      const fresh = Number.isFinite(t) ? now - t <= maxAgeHours * 3600e3 : true;
      if (!fresh || isBlocked(it, stems)) continue;
      const key = norm(it.title);
      if (!key) continue;
      // Ugyanaz a cím több lapnál: egy tétel, az összes forráslinkkel.
      const dup = seen.get(key);
      if (dup) { if (!dup.linkek.some(l => l.nev === f.source.nev)) dup.linkek.push({ nev: f.source.nev, url: it.link }); continue; }
      const item = { cim: it.title, osszefoglalo: '', miert: '', linkek: [{ nev: f.source.nev, url: it.link }] };
      if (kivonat) item.kivonat = it.summary.slice(0, 300);
      seen.set(key, item);
      all.push({ rovat: f.source.rovat, t: Number.isFinite(t) ? t : 0, item });
    }
  }
  all.sort((a, b) => b.t - a.t);
  for (const a of all) {
    if (a.rovat === 'claude') { if (claude.length < 3 && now - a.t <= 7 * 86400e3) claude.push(a.item); continue; }
    const s = sections.find(x => x.id === a.rovat);
    if (s && s.items.length < perRovat) s.items.push(a.item);
  }
  return { reteg: 'alap', rovatok: sections.filter(s => s.items.length), claudeHirek: claude };
}

// Inspirációs kártyák a feedekből (az utolsó 21 nap elemei).
export function buildCards({ feeds, stems, now = Date.now(), maxAgeDays = 21 }) {
  const out = [];
  for (const f of feeds) {
    for (const it of f.items.slice(0, 10)) {
      const t = Date.parse(it.date);
      if (Number.isFinite(t) && now - t > maxAgeDays * 86400e3) continue;
      if (isBlocked(it, stems)) continue;
      out.push({
        id: cardId(it.link),
        url: it.link,
        cim: it.title,
        leiras: it.summary.slice(0, 280),
        forras: f.source.nev,
        forrasId: f.source.id,
        tema: f.source.tema,
        tipus: f.source.tipus || 'szoveg',
        feliratos: null,
        oktato: !!f.source.oktato,
        megjelent: Number.isFinite(t) ? t : now,
      });
    }
  }
  return out;
}

// ---- Claude-bemenet: egy tömör fájl, amiből a napi Claude-feladat dolgozik ----
// Így Claude-nak nem kell egyenként letöltenie a forrásokat: a letöltés, a kulcsszavas szűrés, az összevonás
// és a már látott linkek kiszűrése itt történik, kód által, tokenek nélkül.

const SZAVAZATOK = ['fel', 'le', 'ugras', 'kesobb'];

// A visszajelzések összesítése: témánként és forrásonként darabszámok, plusz a legutóbbi kedvelt és elutasított címek.
export function summarizeFeedback(feedback, { kedvelt = 15, elutasitott = 10, maxForras = 25 } = {}) {
  const temak = {};
  const forrasok = {};
  const count = (map, key, f) => {
    if (!key) return;
    const m = (map[key] ??= { fel: 0, le: 0, ugras: 0, kesobb: 0, olvasva: 0 });
    if (SZAVAZATOK.includes(f.szavazat)) m[f.szavazat]++;
    if (f.olvasva) m.olvasva++;
  };
  for (const f of feedback) { count(temak, f.tema, f); count(forrasok, f.forras, f); }
  const total = m => m.fel + m.le + m.ugras + m.kesobb;
  const topForras = Object.fromEntries(Object.entries(forrasok).sort((a, b) => total(b[1]) - total(a[1])).slice(0, maxForras));
  const sorted = [...feedback].sort((a, b) => (b.ido || 0) - (a.ido || 0));
  const pick = (v, n) => sorted.filter(f => f.szavazat === v && f.cim).slice(0, n)
    .map(f => ({ cim: f.cim, forras: f.forras ?? null, tema: f.tema ?? null }));
  return { db: feedback.length, temak, forrasok: topForras, kedvelt: pick('fel', kedvelt), elutasitott: pick('le', elutasitott) };
}

// A Claude-bemenet: rövid azonosítós hír- és kártyajelöltek (Claude az azonosítókra hivatkozik, a feltöltő
// pótolja a linkeket és a kártyaadatokat), a Claude-oldalak és az összesített visszajelzés.
export function buildBemenet({ newsFeeds, cards, stems, feedback = [], ajanlottUrlek = [], claudeOldalak = [],
  now = Date.now(), today, perRovat = 12, maxKartya = 80, perForras = 5 }) {
  const daily = buildDaily({ feeds: newsFeeds, stems, now, perRovat, kivonat: true });
  let n = 0;
  const jelolt = (id, i) => ({ id, cim: i.cim, kivonat: i.kivonat, linkek: i.linkek });
  const hirek = daily.rovatok.flatMap(r => r.items.map(i => ({ rovat: r.id, ...jelolt(`h${++n}`, i) })));
  const claudeHirek = daily.claudeHirek.map((i, k) => jelolt(`c${k + 1}`, i));
  const seen = new Set([...feedback.map(f => f.url), ...ajanlottUrlek].filter(Boolean).map(u => String(u).trim()));
  const perSource = {};
  const kartyak = cards
    .filter(c => !seen.has(c.url.trim()))
    .sort((a, b) => b.megjelent - a.megjelent)
    .filter(c => (perSource[c.forras] = (perSource[c.forras] || 0) + 1) <= perForras)
    .slice(0, maxKartya)
    .map(c => ({ id: c.id, url: c.url, cim: c.cim, leiras: c.leiras.slice(0, 200), forras: c.forras, tema: c.tema, tipus: c.tipus, oktato: c.oktato }));
  return { datum: today, keszult: now, hirek, claudeHirek, claudeOldalak, kartyak, visszajelzes: summarizeFeedback(feedback) };
}

// A bemenet mentése: a visszajelzéseket és a Claude által már ajánlott kártyákat az adatbázisból olvassa.
// A kapitany_input gyűjteménybe kerül (nem a kapitany_meta-ba), mert azt az app mindig letölti.
// A napló nyilvános, ezért csak darabszámokat ír ki.
export async function saveBemenet({ db, newsFeeds, cards, sources, today, now = Date.now, log = console.log }) {
  const t = now();
  const fb = await db.collection(COLL.feedback).where('ido', '>=', t - 120 * DAY).get();
  const aj = await db.collection(COLL.cards).where('ajanlva', '>=', budapestDate(new Date(t - 60 * DAY))).get();
  const bemenet = buildBemenet({
    newsFeeds, cards, stems: sources.tiltott, now: t, today,
    feedback: fb.docs.map(d => d.data()),
    ajanlottUrlek: aj.docs.map(d => d.data().url),
    claudeOldalak: sources.claudeOldalak || [],
  });
  await db.collection(COLL.input).doc('claude').set(bemenet);
  log(`Claude-bemenet: ${bemenet.hirek.length} hír, ${bemenet.kartyak.length} kártyajelölt, ${bemenet.visszajelzes.db} visszajelzés.`);
  return bemenet;
}

// ---- Az alapréteg futása (az alap.mjs csak ezt hívja; a hálózat és az adatbázis kívülről jön, így tesztelhető) ----

const UA = 'Kapitany-hirolvaso/1.0 (+https://szerdori.github.io/kapitany/)';

// Egy forrás letöltése; hiba esetén üres listát ad, és csak a forrás nevét írja a naplóba (az nyilvános).
export async function fetchFeed(source, { fetchImpl = fetch, log = console.log, timeoutMs = 20000 } = {}) {
  try {
    const res = await fetchImpl(source.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) { log(`  ${source.nev}: HTTP ${res.status}`); return { source, items: [] }; }
    const items = parseFeed(await res.text());
    log(`  ${source.nev}: ${items.length} elem`);
    return { source, items };
  } catch (e) {
    log(`  ${source.nev}: nem érhető el (${e.name})`);
    return { source, items: [] };
  }
}

const countNews = daily => daily.rovatok.reduce((n, r) => n + r.items.length, 0);

// Mentés a Firestore-ba (firebase-admin felületű db). A Claude-összefoglalót nem írja felül,
// a kártyákat csak akkor veszi fel, ha még nincsenek meg.
export async function saveAlap({ db, daily, cards, today, now = Date.now, log = console.log }) {
  const dailyRef = db.collection(COLL.daily).doc(today);
  const existing = await dailyRef.get();
  let dailySaved = false;
  if (existing.exists && existing.data().reteg === 'claude') {
    log('Mára már van Claude-összefoglaló, a napi hírekhez nem nyúlok.');
  } else {
    await dailyRef.set({ ...daily, datum: today, keszult: now() });
    dailySaved = true;
    log(`Napi alapváltozat elmentve: ${countNews(daily)} hír.`);
  }
  let added = 0;
  for (const c of cards) {
    try { await db.collection(COLL.cards).doc(c.id).create({ ...c, reteg: 'alap', felveve: now() }); added++; }
    catch (e) { if (e.code !== 6) throw e; } // 6 = ALREADY_EXISTS: korábban már felvettük
  }
  await db.collection(COLL.meta).doc('alap').set({ utolsoFutas: now() });
  log(`Kártyák: ${added} új, ${cards.length - added} már megvolt.`);
  return { dailySaved, added };
}

// A teljes napi futás. getDb: aszinkron függvény, ami a Firestore-t adja; ha nincs, csak próbafutás.
export async function runAlap({ sources, fetchImpl = fetch, getDb = null, now = Date.now, log = console.log }) {
  const opts = { fetchImpl, log };
  log('Hírforrások:');
  const newsFeeds = await Promise.all(sources.hirek.map(s => fetchFeed(s, opts)));
  log('Inspirációs források:');
  const inspFeeds = await Promise.all(sources.inspiracio.map(s => fetchFeed(s, opts)));
  const daily = buildDaily({ feeds: newsFeeds, stems: sources.tiltott, now: now() });
  const cards = buildCards({ feeds: inspFeeds, stems: sources.tiltott, now: now() });
  if (!getDb) {
    log(`Próbafutás (nincs FIREBASE_SERVICE_ACCOUNT): ${countNews(daily)} hír, ${cards.length} kártya.`);
    return { proba: true, daily, cards };
  }
  const db = await getDb();
  const today = budapestDate(new Date(now()));
  const saved = await saveAlap({ db, daily, cards, today, now, log });
  const bemenet = await saveBemenet({ db, newsFeeds, cards, sources, today, now, log });
  return { proba: false, daily, cards, bemenet, ...saved };
}
