// Az alapréteg tiszta (adatbázis és hálózat nélküli) logikája, hogy tesztelhető legyen.
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export const COLL = {
  daily: 'kapitany_daily',
  cards: 'kapitany_cards',
  feedback: 'kapitany_feedback',
  settings: 'kapitany_settings',
  meta: 'kapitany_meta',
};

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
export function buildDaily({ feeds, stems, now = Date.now(), maxAgeHours = 36, perRovat = 6 }) {
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
        megjelent: Number.isFinite(t) ? t : now,
      });
    }
  }
  return out;
}
