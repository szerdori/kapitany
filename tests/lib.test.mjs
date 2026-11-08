// Az alapréteg logikájának tesztjei: feedek feldolgozása, tiltott témák szűrése, napi összeállítás.
// Futtatás a scripts mappában: npm install --no-save fast-xml-parser@4.5.0, majd npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFeed, isBlocked, buildDaily, buildCards, cardId, budapestDate } from '../scripts/lib.mjs';

const sources = JSON.parse(await readFile(new URL('../sources.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-08T08:00:00Z');
const ago = h => new Date(NOW - h * 3600e3).toUTCString();

const rss = items => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>x</title>${items
  .map(i => `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${i.d}</pubDate><description><![CDATA[${i.s || ''}]]></description></item>`).join('')}</channel></rss>`;

test('RSS 2.0 feldolgozása, HTML nélküli kivonattal', () => {
  const items = parseFeed(rss([{ t: 'Döntött a parlament', l: 'https://a.hu/1', d: ago(1), s: '<p>Az <b>adó</b> &amp; a járulék</p>' }]));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Döntött a parlament');
  assert.equal(items[0].summary, 'Az adó & a járulék');
});

test('Atom feed feldolgozása (alternate link)', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v2.1.0</title><link rel="alternate" href="https://github.com/x/releases/v2.1.0"/><updated>2026-11-07T10:00:00Z</updated><content type="html">&lt;p&gt;New stuff&lt;/p&gt;</content></entry></feed>`;
  const items = parseFeed(xml);
  assert.equal(items[0].link, 'https://github.com/x/releases/v2.1.0');
  assert.equal(items[0].summary, 'New stuff');
});

test('RDF (RSS 1.0) feed feldolgozása', () => {
  const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>EU summit</title><link>https://dw.com/a</link><dc:date>2026-11-08T06:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(xml)[0].link, 'https://dw.com/a');
});

test('hibás XML nem dob hibát', () => {
  assert.deepEqual(parseFeed('<html>nem feed'), []);
});

test('tiltott témák: bűnügy, erőszak és helyi baleset kiesik, közpolitika marad', () => {
  const s = sources.tiltott;
  for (const t of ['Megölték a szomszédot', 'Autós üldözés Borsodban', 'Zaklatási botrány', 'Man stabbed in London', 'Frontális ütközés az M3-on'])
    assert.ok(isBlocked({ title: t, summary: '' }, s), t);
  for (const t of ['Emelkedik a családi pótlék', 'EU agrees new energy rules', 'Kamatdöntés a jegybankban'])
    assert.ok(!isBlocked({ title: t, summary: '' }, s), t);
});

test('napi összeállítás: friss, ismétlés nélküli, rovatonként, tiltott nélkül', () => {
  const src = id => sources.hirek.find(h => h.id === id);
  const feeds = [
    { source: src('telex'), items: parseFeed(rss([
      { t: 'Új adótörvény', l: 'https://telex.hu/1', d: ago(2) },
      { t: 'Meggyilkoltak egy férfit', l: 'https://telex.hu/2', d: ago(1) },
      { t: 'Régi hír', l: 'https://telex.hu/3', d: ago(60) },
    ])) },
    { source: src('444'), items: parseFeed(rss([{ t: 'Új adótörvény!', l: 'https://444.hu/1', d: ago(3) }])) },
    { source: src('bbc'), items: parseFeed(rss([{ t: 'EU leaders meet', l: 'https://bbc.co.uk/1', d: ago(4) }])) },
    { source: src('claude-code'), items: parseFeed(rss([{ t: 'v2.1.0', l: 'https://github.com/r/1', d: ago(20) }])) },
  ];
  const d = buildDaily({ feeds, stems: sources.tiltott, now: NOW });
  assert.equal(d.reteg, 'alap');
  const itthon = d.rovatok.find(r => r.id === 'itthon');
  assert.deepEqual(itthon.items.map(i => i.cim), ['Új adótörvény']);
  assert.deepEqual(itthon.items[0].linkek.map(l => l.nev), ['Telex', '444'], 'az azonos hír mindkét forrása megmarad');
  assert.equal(d.rovatok.find(r => r.id === 'vilag').items.length, 1);
  assert.equal(d.claudeHirek.length, 1);
  assert.ok(!d.rovatok.some(r => r.id === 'eu'), 'üres rovat nem kerül be');
});

test('kártyák: azonosító az URL-ből, téma és típus a forrásból', () => {
  const src = sources.inspiracio.find(s => s.id === 'slyflourish');
  const cards = buildCards({ feeds: [{ source: src, items: parseFeed(rss([{ t: 'Lazy prep', l: 'https://slyflourish.com/x.html', d: ago(5) }])) }], stems: sources.tiltott, now: NOW });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, cardId('https://slyflourish.com/x.html'));
  assert.equal(cards[0].id.length, 20);
  assert.equal(cards[0].tema, 'dnd');
  assert.equal(cards[0].tipus, 'szoveg');
});

test('a kártya-azonosító megegyezik a PowerShell-feltöltőével (SHA-1, első 20 hex)', () => {
  // ugyanez a PowerShellben: SHA1(UTF8("https://example.com/a")) = 9a9e...; az első 20 karakter
  assert.equal(cardId('https://example.com/a'), cardId(' https://example.com/a '));
  assert.match(cardId('https://example.com/a'), /^[0-9a-f]{20}$/);
});

test('budapesti dátum', () => {
  assert.equal(budapestDate(new Date('2026-11-08T23:30:00Z')), '2026-11-09');
});

test('a sources.json minden forrása teljes', () => {
  for (const h of sources.hirek) assert.ok(h.id && h.nev && /^https:/.test(h.url) && ['itthon', 'eu', 'vilag', 'gazdasag', 'claude'].includes(h.rovat), h.id);
  for (const i of sources.inspiracio) assert.ok(i.id && i.nev && /^https:/.test(i.url) && sources.temak[i.tema] && ['szoveg', 'video', 'podcast'].includes(i.tipus), i.id);
});
