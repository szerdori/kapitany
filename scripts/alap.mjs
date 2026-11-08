// Alapréteg: naponta összegyűjti a hírcímeket és az inspirációs cikkeket, AI nélkül, és a Firestore-ba írja.
// Ha aznapra már van Claude-összefoglaló, a napi hírekhez nem nyúl (csak új kártyákat vesz fel).
// A GitHub Actions naplója nyilvános, ezért csak darabszámokat és forrásneveket ír ki.
import { readFile } from 'node:fs/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COLL, parseFeed, buildDaily, buildCards, budapestDate } from './lib.mjs';

const sources = JSON.parse(await readFile(new URL('../sources.json', import.meta.url), 'utf8'));

async function fetchFeed(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Kapitany-hirolvaso/1.0 (+https://szerdori.github.io/kapitany/)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { console.log(`  ${source.nev}: HTTP ${res.status}`); return { source, items: [] }; }
    const items = parseFeed(await res.text());
    console.log(`  ${source.nev}: ${items.length} elem`);
    return { source, items };
  } catch (e) {
    console.log(`  ${source.nev}: nem érhető el (${e.name})`);
    return { source, items: [] };
  }
}

console.log('Hírforrások:');
const newsFeeds = await Promise.all(sources.hirek.map(fetchFeed));
console.log('Inspirációs források:');
const inspFeeds = await Promise.all(sources.inspiracio.map(fetchFeed));

const daily = buildDaily({ feeds: newsFeeds, stems: sources.tiltott });
const cards = buildCards({ feeds: inspFeeds, stems: sources.tiltott });

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log(`Próbafutás (nincs FIREBASE_SERVICE_ACCOUNT): ${daily.rovatok.reduce((n, r) => n + r.items.length, 0)} hír, ${cards.length} kártya.`);
  process.exit(0);
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const today = budapestDate();
const dailyRef = db.collection(COLL.daily).doc(today);

const existing = await dailyRef.get();
if (existing.exists && existing.data().reteg === 'claude') {
  console.log('Mára már van Claude-összefoglaló, a napi hírekhez nem nyúlok.');
} else {
  await dailyRef.set({ ...daily, datum: today, keszult: Date.now() });
  console.log(`Napi alapváltozat elmentve: ${daily.rovatok.reduce((n, r) => n + r.items.length, 0)} hír.`);
}

let added = 0;
for (const c of cards) {
  try { await db.collection(COLL.cards).doc(c.id).create({ ...c, reteg: 'alap', felveve: Date.now() }); added++; }
  catch (e) { if (e.code !== 6) throw e; } // 6 = ALREADY_EXISTS: korábban már felvettük
}
await db.collection(COLL.meta).doc('alap').set({ utolsoFutas: Date.now() });
console.log(`Kártyák: ${added} új, ${cards.length - added} már megvolt.`);
