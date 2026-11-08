// Memóriabeli adatbázis a tesztekhez, ugyanazzal a felülettel, mint az index.html Firebase-adaptere.
// window.mockDb(seed): seed = { 'gyujtemeny/azonosito': {...mezők} }
window.mockDb = function (seed) {
  const store = JSON.parse(JSON.stringify(seed || {}));
  const listeners = new Set();
  const cmp = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '==': (a, b) => a === b, '>': (a, b) => a > b, '<': (a, b) => a < b };
  const snap = (path) => ({ id: path.split('/').pop(), exists: path in store, data: () => (store[path] ? JSON.parse(JSON.stringify(store[path])) : undefined) });
  const notify = () => listeners.forEach(fn => fn());
  return {
    store,
    query(coll, conds) {
      const run = () => Object.keys(store).filter(p => p.split('/')[0] === coll && p.split('/').length === 2)
        .filter(p => conds.every(([f, op, v]) => cmp[op](store[p][f], v))).map(snap);
      return { onSnapshot(next) { const fn = () => next(run()); listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); } };
    },
    doc(path) {
      return {
        async set(d, o) { store[path] = o && o.merge ? { ...(store[path] || {}), ...d } : { ...d }; setTimeout(notify, 0); },
        onSnapshot(next) { const fn = () => next(snap(path)); listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); },
      };
    },
  };
};
