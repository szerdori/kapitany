// Lefuttatja az összes tesztet, és megméri, a kód mekkora részét járják be.
// Függőség nélkül, a V8 saját lefedettségméréséből dolgozik:
//   - Node-os kód (scripts/*.mjs): NODE_V8_COVERAGE
//   - a felület (index.html beágyazott scriptjei): a Playwright böngészős mérése (tests/ui.test.mjs gyűjti)
//
// Használat a scripts mappában:  npm run lefedettseg
//   --min=<szám>   hibával áll le, ha az összesített sorlefedettség ez alá esik (a CI és a hook ezt használja)
//   --reszletes    fájlonként kiírja a nem lefutott sorokat is
//
// Egy sor akkor számít lefedettnek, ha minden kódkaraktere lefutott legalább egyszer (az üres és a csak
// megjegyzést tartalmazó sorok nem számítanak). A félig lefutott sor (pl. egy ternary ki nem próbált ága)
// nem fedett: így a szám inkább szigorú, mint hízelgő.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const MIN = Number((args.find(a => a.startsWith('--min=')) || '').slice(6)) || 0;
const DETAILED = args.includes('--reszletes');

// A mért fájlok. Ami ide kerül és egyetlen teszt sem tölti be, 0%-kal jelenik meg (nem tűnik el csendben).
export const MERT = ['scripts/lib.mjs', 'scripts/alap.mjs', 'index.html'];

// ---- V8-tartományokból karakterenkénti futásszám ----
// A V8 függvényenként egymásba ágyazott [start, end) tartományokat ad; a belső felülírja a külsőt.
export function paint(length, functions, base = 0) {
  const counts = new Int32Array(length).fill(-1); // -1 = ezt a részt a mérés nem érintette
  const ranges = functions.flatMap(f => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) {
    const s = Math.max(0, r.startOffset - base), e = Math.min(length, r.endOffset - base);
    for (let i = s; i < e; i++) counts[i] = r.count;
  }
  return counts;
}

// Csak megjegyzés vagy üres? (egyszerű, a projekt stílusához elég heurisztika)
// A csak záró zárójelekből álló sor (pl. "};" egy return után) sem: a V8 ezeket gyakran "le nem futottnak" jelöli.
const isCodeLine = l => { const t = l.trim(); return t && !/^[})\];,]+$/.test(t) && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('<!--'); };

// Egy forrásszakasz (fájl vagy beágyazott script) sorainak állapota. lineBase: hányadik sorban kezdődik a fájlban.
export function lineStates(source, counts, lineBase = 1) {
  const out = [];
  let pos = 0;
  source.split('\n').forEach((line, i) => {
    if (isCodeLine(line)) {
      let ran = 0, missed = 0;
      for (let j = 0; j < line.length; j++) {
        if (/\s/.test(line[j])) continue;
        const c = counts[pos + j];
        if (c > 0) ran++; else if (c === 0) missed++;
      }
      // A mérés által nem érintett karakter (pl. sosem betöltött script) nem futott.
      const untouched = line.replace(/\s/g, '').length - ran - missed;
      out.push({ line: lineBase + i, state: missed + untouched === 0 ? 'ok' : ran ? 'reszben' : 'nem' });
    }
    pos += line.length + 1;
  });
  return out;
}

// Ugyanannak a forrásnak több mérése (több tesztfájl, több böngészőlap): karakterenként összeadjuk.
function merge(a, b) {
  if (!a) return b;
  for (let i = 0; i < a.length; i++) if (b[i] >= 0) a[i] = Math.max(a[i], 0) + b[i];
  return a;
}

// Egymás utáni sorszámok tömörítése: [3,4,5,9] -> "3-5, 9"
export function ranges(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`); i = j;
  }
  return out.join(', ');
}

// ---- Futtatás ----
function run() {
  const dir = mkdtempSync(join(tmpdir(), 'kapitany-lefedettseg-'));
  const nodeDir = join(dir, 'node');
  const browserDir = join(dir, 'bongeszo');
  mkdirSync(browserDir);
  try {
    const testFiles = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(ROOT, 'tests', f));
    const res = spawnSync(process.execPath, ['--test', ...testFiles], {
      stdio: 'inherit', cwd: join(ROOT, 'scripts'),
      env: { ...process.env, NODE_V8_COVERAGE: nodeDir, KAPITANY_COVERAGE: browserDir },
    });
    if (res.status !== 0) { console.error('\nA tesztek nem mentek át, ezért lefedettséget nem számolok.'); return res.status || 1; }
    return report(nodeDir, browserDir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function report(nodeDir, browserDir) {
  const files = new Map(); // relatív út -> { source, counts, fns: {total, ran} }
  const add = (rel, source, counts, fs) => {
    const f = files.get(rel) || { source, counts: null, fnRan: new Map() };
    f.counts = merge(f.counts, counts);
    for (const fn of fs) { const k = fn.ranges[0].startOffset; f.fnRan.set(k, (f.fnRan.get(k) || 0) + fn.ranges[0].count); }
    files.set(rel, f);
  };
  const isScript = fn => fn.functionName === '' && fn.ranges[0].startOffset === 0;

  // Node
  if (existsSync(nodeDir)) for (const name of readdirSync(nodeDir)) {
    if (!name.endsWith('.json')) continue;
    for (const s of JSON.parse(readFileSync(join(nodeDir, name), 'utf8')).result) {
      if (!s.url.startsWith('file:')) continue;
      const rel = relative(ROOT, fileURLToPath(s.url)).split(sep).join('/');
      if (!MERT.includes(rel)) continue;
      const source = readFileSync(join(ROOT, rel), 'utf8');
      add(rel, source, paint(source.length, s.functions), s.functions.filter(f => !isScript(f)));
    }
  }

  // Böngésző: az index.html beágyazott scriptjei; a Playwright a script saját szövegét adja, ezt keressük meg a fájlban.
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const htmlCounts = new Int32Array(html.length).fill(-1);
  const htmlFns = [];
  // A fájl beágyazott scriptjei akkor is számítanak, ha egyik teszt sem futtatta le őket.
  const scriptRe = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  for (let m; (m = scriptRe.exec(html));) { const s = m.index + m[0].indexOf('>') + 1; for (let i = s; i < s + m[1].length; i++) htmlCounts[i] = 0; }
  const browserEntries = readdirSync(browserDir).flatMap(n => JSON.parse(readFileSync(join(browserDir, n), 'utf8')));
  for (const e of browserEntries) {
    const at = html.indexOf(e.source);
    if (at < 0 || !e.source.trim()) continue;
    const c = paint(e.source.length, e.functions);
    for (let i = 0; i < c.length; i++) if (c[i] >= 0) htmlCounts[at + i] = Math.max(htmlCounts[at + i], 0) + c[i];
    for (const fn of e.functions) if (!isScript(fn)) htmlFns.push({ ...fn, ranges: [{ ...fn.ranges[0], startOffset: fn.ranges[0].startOffset + at }] });
  }
  // Az index.html-ben csak a script-részek sorai számítanak, a HTML és a CSS nem.
  const htmlEntry = { source: html, counts: htmlCounts, fnRan: new Map(), onlyScripts: true };
  for (const fn of htmlFns) { const k = fn.ranges[0].startOffset; htmlEntry.fnRan.set(k, (htmlEntry.fnRan.get(k) || 0) + fn.ranges[0].count); }
  files.set('index.html', htmlEntry);

  // Összesítés
  const rows = [];
  let totL = 0, okL = 0, totF = 0, okF = 0;
  for (const rel of MERT) {
    let f = files.get(rel);
    if (!f) { const source = readFileSync(join(ROOT, rel), 'utf8'); f = { source, counts: new Int32Array(source.length).fill(0), fnRan: new Map() }; }
    let states = lineStates(f.source, f.counts);
    if (f.onlyScripts) {
      // csak azok a sorok, amelyek beágyazott scriptben vannak (ott a számláló nem -1)
      const lines = f.source.split('\n'); let pos = 0; const inScript = new Set();
      lines.forEach((l, i) => { for (let j = 0; j < l.length; j++) if (f.counts[pos + j] !== -1) { inScript.add(i + 1); break; } pos += l.length + 1; });
      states = states.filter(s => inScript.has(s.line));
    }
    const ok = states.filter(s => s.state === 'ok').length;
    const fnTotal = f.fnRan.size, fnOk = [...f.fnRan.values()].filter(v => v > 0).length;
    rows.push({ rel, lines: states.length, ok, fnTotal, fnOk, missed: states.filter(s => s.state !== 'ok').map(s => s.line) });
    totL += states.length; okL += ok; totF += fnTotal; okF += fnOk;
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '–').padStart(6);
  console.log('\nLefedettség (sorok: teljesen lefutott kódsorok; függvények: legalább egyszer meghívva)');
  console.log('fájl'.padEnd(20) + 'sorok'.padStart(16) + 'függvények'.padStart(18));
  for (const r of rows) {
    console.log(r.rel.padEnd(20) + `${pct(r.ok, r.lines)} (${r.ok}/${r.lines})`.padStart(16) + `${pct(r.fnOk, r.fnTotal)} (${r.fnOk}/${r.fnTotal})`.padStart(18));
    if (DETAILED && r.missed.length) console.log('   nem (teljesen) lefutott sorok: ' + ranges(r.missed));
  }
  const total = 100 * okL / totL;
  console.log('összesen'.padEnd(20) + `${pct(okL, totL)} (${okL}/${totL})`.padStart(16) + `${pct(okF, totF)} (${okF}/${totF})`.padStart(18));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = ['| fájl | sorok | függvények |', '|---|---|---|', ...rows.map(r => `| ${r.rel} | ${pct(r.ok, r.lines).trim()} (${r.ok}/${r.lines}) | ${pct(r.fnOk, r.fnTotal).trim()} (${r.fnOk}/${r.fnTotal}) |`), `| **összesen** | **${pct(okL, totL).trim()}** | **${pct(okF, totF).trim()}** |`];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, '## Lefedettség\n\n' + md.join('\n') + '\n', { flag: 'a' });
  }
  if (MIN && total < MIN) { console.error(`\nA lefedettség (${total.toFixed(1)}%) a megengedett ${MIN}% alá esett. Írj tesztet az új kódhoz!`); return 1; }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run());
