// Az alapréteg logikájának tesztjei: feedek feldolgozása, tiltott témák szűrése, napi összeállítás.
// Futtatás a scripts mappában: npm install, majd npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFeed, isBlocked, buildDaily, buildCards, cardId, budapestDate, stripHtml } from '../scripts/lib.mjs';

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
  // ugyanez a PowerShellben (claude-feltoltes.ps1): SHA1(UTF8(url.Trim())) hexben, az első 20 karakter
  assert.equal(cardId('https://example.com/a'), 'c4ed1c218d14a0f15bba');
  assert.equal(cardId(' https://example.com/a '), 'c4ed1c218d14a0f15bba');
});

test('budapesti dátum', () => {
  assert.equal(budapestDate(new Date('2026-11-08T23:30:00Z')), '2026-11-09');
});

test('a sources.json minden forrása teljes', () => {
  for (const h of sources.hirek) assert.ok(h.id && h.nev && /^https:/.test(h.url) && ['itthon', 'eu', 'vilag', 'gazdasag', 'claude'].includes(h.rovat), h.id);
  for (const i of sources.inspiracio) assert.ok(i.id && i.nev && /^https:/.test(i.url) && sources.temak[i.tema] && ['szoveg', 'video', 'podcast'].includes(i.tipus), i.id);
});

// ---- Szélsőséges feedek és ágak ----

test('HTML-tisztítás: számos entitás, nbsp, aposztróf, üres bemenet', () => {
  assert.equal(stripHtml('A&nbsp;&#8211;&nbsp;B &#39;x&#039; &apos;y&apos; &quot;z&quot; &lt;tag&gt;'), "A – B 'x' 'y' \"z\" <tag>");
  assert.equal(stripHtml(null), '');
  assert.equal(stripHtml('<br/>  <p>\n sok   szóköz </p>'), 'sok szóköz');
});

test('RSS: content:encoded, szám cím, több elem, cím vagy link nélküli elem kiesik', () => {
  const xml = `<rss><channel>
    <item><title>2026</title><link>https://a.hu/1</link><content:encoded><![CDATA[<p>Hosszú</p>]]></content:encoded></item>
    <item><title></title><link>https://a.hu/2</link></item>
    <item><title>Link nélkül</title></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.deepEqual(items.map(i => i.title), ['2026']);
  assert.equal(items[0].summary, 'Hosszú');
  assert.equal(items[0].date, '');
});

test('RSS: egyetlen elemű és üres csatorna', () => {
  assert.equal(parseFeed('<rss><channel><item><title>Egy</title><link>https://a.hu/x</link></item></channel></rss>').length, 1);
  assert.deepEqual(parseFeed('<rss><channel><title>üres</title></channel></rss>'), []);
});

test('Atom: több link közül az alternate, rel nélküli link, link szövegként, published dátum', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title type="html">A</title><link rel="self" href="https://x/self"/><link rel="alternate" href="https://x/a"/><published>2026-11-07T10:00:00Z</published><summary>S</summary></entry>
    <entry><title>B</title><link href="https://x/b"/></entry>
    <entry><title>C</title><link>https://x/c</link></entry>
  </feed>`;
  const items = parseFeed(xml);
  assert.deepEqual(items.map(i => i.link), ['https://x/a', 'https://x/b', 'https://x/c']);
  assert.equal(items[0].date, '2026-11-07T10:00:00Z');
  assert.equal(items[0].summary, 'S');
});

test('ismeretlen XML-gyökér és nem XML bemenet üres listát ad', () => {
  assert.deepEqual(parseFeed('<valami><item><title>x</title></item></valami>'), []);
  assert.deepEqual(parseFeed(''), []);
  assert.deepEqual(parseFeed(undefined), []);
  assert.deepEqual(parseFeed('<rss><channel><item><title>x</a></channel></rss>'), [], 'rosszul zárt tag');
});

test('tiltás a kivonat alapján is, kis- és nagybetűtől függetlenül', () => {
  assert.ok(isBlocked({ title: 'Ártatlan cím', summary: 'A rendőrség ELFOGTA' }, ['elfog']));
  assert.ok(!isBlocked({ title: 'x', summary: 'y' }, []));
});

test('napi összeállítás: rovatonkénti keret, dátum nélküli hír, azonos forrás ismétlése, üres cím, régi Claude-hír', () => {
  const src = { nev: 'Telex', rovat: 'itthon' };
  const items = [];
  for (let i = 0; i < 8; i++) items.push({ title: `Hír ${i}`, link: `https://t/${i}`, date: ago(i + 1), summary: '' });
  items.push({ title: 'Dátum nélkül', link: 'https://t/nd', date: '', summary: '' });
  items.push({ title: 'Hír 0', link: 'https://t/0b', date: ago(1), summary: '' }); // ugyanaz a forrás, ugyanaz a cím
  items.push({ title: '!!!', link: 'https://t/x', date: ago(1), summary: '' }); // írásjelekből álló cím: nincs kulcs
  const feeds = [
    { source: src, items },
    { source: { nev: 'GitHub', rovat: 'claude' }, items: [
      { title: 'v1', link: 'https://g/1', date: new Date(NOW - 8 * 86400e3).toUTCString(), summary: '' },
      ...[2, 3, 4, 5].map(n => ({ title: `v${n}`, link: `https://g/${n}`, date: ago(n), summary: '' })),
    ] },
    { source: { nev: 'Ismeretlen', rovat: 'sport' }, items: [{ title: 'Gól', link: 'https://s/1', date: ago(1), summary: '' }] },
  ];
  const d = buildDaily({ feeds, stems: [], now: NOW, maxAgeHours: 24 * 10 });
  const itthon = d.rovatok.find(r => r.id === 'itthon');
  assert.equal(itthon.items.length, 6, 'rovatonként legfeljebb 6');
  assert.deepEqual(itthon.items[0].linkek.map(l => l.url), ['https://t/0'], 'ugyanaz a forrás nem kerül be kétszer');
  assert.ok(!itthon.items.some(i => i.cim === '!!!'));
  assert.deepEqual(d.claudeHirek.map(c => c.cim), ['v2', 'v3', 'v4'], 'legfeljebb 3, csak 7 napon belüli');
  assert.ok(!d.rovatok.some(r => r.id === 'sport'), 'ismeretlen rovat kimarad');
});

test('napi összeállítás: a dátum nélküli hír friss, de a sor végére kerül', () => {
  const d = buildDaily({ feeds: [{ source: { nev: 'A', rovat: 'vilag' }, items: [
    { title: 'Dátum nélkül', link: 'https://a/1', date: 'nem dátum', summary: '' },
    { title: 'Friss', link: 'https://a/2', date: ago(1), summary: '' },
  ] }], stems: [], now: NOW });
  assert.deepEqual(d.rovatok[0].items.map(i => i.cim), ['Friss', 'Dátum nélkül']);
});

test('kártyák: régi és tiltott kimarad, forrásonként legfeljebb 10, dátum nélküli a mostani időt kapja', () => {
  const source = { id: 's', nev: 'S', tema: 'ai' };
  const items = [
    { title: 'Régi', link: 'https://s/old', date: new Date(NOW - 30 * 86400e3).toUTCString(), summary: '' },
    { title: 'Erőszakos', link: 'https://s/bad', date: ago(1), summary: 'megölték' },
    { title: 'Dátum nélkül', link: 'https://s/nd', date: '', summary: 'x'.repeat(400) },
    ...Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, link: `https://s/${i}`, date: ago(i), summary: '' })),
  ];
  const cards = buildCards({ feeds: [{ source, items }], stems: ['megöl'], now: NOW });
  assert.equal(cards.length, 8, 'az első 10 elemből a régi és a tiltott kiesik');
  const nd = cards.find(c => c.cim === 'Dátum nélkül');
  assert.equal(nd.megjelent, NOW);
  assert.equal(nd.leiras.length, 280);
  assert.equal(nd.tipus, 'szoveg', 'típus nélküli forrás szövegnek számít');
});
