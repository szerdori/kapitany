// Az alap.mjs éles ágának tesztjéhez: előre betöltve (node --import) kicseréli a firebase-admin modulokat
// egy memóriabeli Firestore-ra, a fetch-et pedig egy kitalált RSS-válaszra. A valódi Firebase-hez és a netre nem nyúl.
import { register } from 'node:module';

const app = `export const cert = k => ({ cert: k.project_id });
export const initializeApp = o => { globalThis.__init = o; };`;
const firestore = `const store = globalThis.__store = {};
export const getFirestore = () => ({
  collection: c => ({ doc: id => {
    const p = c + '/' + id;
    return {
      get: async () => ({ exists: p in store, data: () => store[p] }),
      set: async d => { store[p] = d; },
      create: async d => { store[p] = d; },
    };
  } }),
});
process.on('exit', () => console.log('MENTVE ' + JSON.stringify({ init: globalThis.__init, kulcsok: Object.keys(store).sort() })));`;

const url = s => 'data:text/javascript,' + encodeURIComponent(s);
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'firebase-admin/app') return { url: ${JSON.stringify(url(app))}, shortCircuit: true };
  if (spec === 'firebase-admin/firestore') return { url: ${JSON.stringify(url(firestore))}, shortCircuit: true };
  return next(spec, ctx);
}`;
register(url(hooks));

globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<rss><channel><item><title>Hír</title><link>https://x/1</link></item></channel></rss>' });
