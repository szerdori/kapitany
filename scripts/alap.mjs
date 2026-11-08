// Alapréteg: naponta összegyűjti a hírcímeket és az inspirációs cikkeket, AI nélkül, és a Firestore-ba írja.
// Ha aznapra már van Claude-összefoglaló, a napi hírekhez nem nyúl (csak új kártyákat vesz fel).
// A GitHub Actions naplója nyilvános, ezért csak darabszámokat és forrásneveket ír ki.
// A logika a lib.mjs-ben van (runAlap), itt csak a valódi hálózat és adatbázis kerül mellé.
import { readFile } from 'node:fs/promises';
import { runAlap } from './lib.mjs';

const sources = JSON.parse(await readFile(new URL('../sources.json', import.meta.url), 'utf8'));
const key = process.env.FIREBASE_SERVICE_ACCOUNT;

// A firebase-admin csak éles futáskor töltődik be, így a próbafutáshoz (és a tesztekhez) nem kell.
async function getDb() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(key)) });
  return getFirestore();
}

await runAlap({ sources, getDb: key ? getDb : null });
