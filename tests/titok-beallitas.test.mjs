// A scripts/titok-beallitas.ps1 tesztjei: a Firebase-kulcsot a GitHub Secretbe teszi, a tartalmát soha nem írja ki.
// Egy hamis `gh` parancsot teszünk a PATH elejére, így valódi GitHub-hívás nem történik.
// PowerShell (pwsh) kell hozzá: a GitHubon (ubuntu-latest) megvan; ahol nincs, ott a tesztek kimaradnak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/titok-beallitas.ps1', import.meta.url));

function findPwsh() {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const name of ['pwsh', 'pwsh.exe']) { const p = join(dir, name); if (dir && existsSync(p)) return p; }
  }
  return null;
}
const PWSH = findPwsh();
// A GitHubon nem hagyjuk ki csendben: ott a pwsh hiánya hiba.
const skip = PWSH || process.env.GITHUB_ACTIONS ? false : 'nincs PowerShell (pwsh) ezen a gépen';
const WINDOWS = process.platform === 'win32';

// Egy jól látható, de nem valódi kulcs: ha bármelyik kimenetben megjelenik, a teszt elbukik.
const TITOK = 'NEM-VALODI-TITOK-a1b2c3d4e5';
const KULCS = JSON.stringify({ type: 'service_account', client_email: 'teszt@pelda.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${TITOK}\n-----END PRIVATE KEY-----\n` });

// Hamis gh: `auth status` és `secret set`; az argumentumokat és a stdin-t fájlba írja, hogy ellenőrizhessük.
function fakeGh(bin) {
  if (WINDOWS) {
    writeFileSync(join(bin, 'gh.cmd'), [
      '@echo off',
      'if "%1"=="auth" exit /b %FAKE_GH_AUTH%',
      'echo %*> "%FAKE_GH_LOG%\\args.txt"',
      'more > "%FAKE_GH_LOG%\\stdin.txt"',
      'exit /b %FAKE_GH_SET%',
    ].join('\r\n'));
  } else {
    const p = join(bin, 'gh');
    writeFileSync(p, [
      '#!/bin/sh',
      'if [ "$1" = "auth" ]; then exit "${FAKE_GH_AUTH:-0}"; fi',
      'echo "$@" > "$FAKE_GH_LOG/args.txt"',
      // csak beépített parancsok: a tesztben a PATH-on a hamis gh-n kívül semmi sincs
      'while IFS= read -r sor || [ -n "$sor" ]; do printf "%s\\n" "$sor"; done > "$FAKE_GH_LOG/stdin.txt"',
      'exit "${FAKE_GH_SET:-0}"',
    ].join('\n') + '\n');
    chmodSync(p, 0o755);
  }
}

// Lefuttatja a scriptet egy ideiglenes "felhasználói mappával" (USERPROFILE), és visszaadja az eredményt.
function futtat({ kulcs = KULCS, gh = true, auth = 0, set = 0, args = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kapitany-titok-'));
  try {
    const home = join(dir, 'home'), bin = join(dir, 'bin'), log = join(dir, 'log');
    mkdirSync(join(home, '.momassistant'), { recursive: true }); mkdirSync(bin); mkdirSync(log);
    if (kulcs !== null) writeFileSync(join(home, '.momassistant', 'kulcs.json'), kulcs);
    if (gh) fakeGh(bin);
    const res = spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-File', SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        // Csak a hamis gh legyen elérhető (a GitHub-gépeken a valódi gh is telepítve van).
        ...(WINDOWS ? { Path: bin + delimiter + join(process.env.SystemRoot || 'C:\\Windows', 'System32') } : { PATH: bin }),
        USERPROFILE: home,
        FAKE_GH_AUTH: String(auth), FAKE_GH_SET: String(set), FAKE_GH_LOG: log,
      },
    });
    const read = f => (existsSync(join(log, f)) ? readFileSync(join(log, f), 'utf8') : null);
    return { code: res.status, out: (res.stdout || '') + (res.stderr || ''), ghArgs: read('args.txt'), ghStdin: read('stdin.txt') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('sikeres futás: a kulcs stdin-en megy a gh-nak, a titok neve és a tároló helyes', { skip }, () => {
  const r = futtat();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Kész: a FIREBASE_SERVICE_ACCOUNT titok be van állítva itt: szerdori\/kapitany/);
  assert.match(r.ghArgs, /secret set FIREBASE_SERVICE_ACCOUNT --repo szerdori\/kapitany/);
  assert.ok(r.ghStdin.includes(TITOK), 'a kulcs tartalma a gh bemenetére kerül');
});

test('a kulcs tartalma soha nem jelenik meg a kimenetben és a parancssorban', { skip }, () => {
  const r = futtat();
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.out.includes(TITOK), 'a kimenetben nincs titok');
  assert.ok(!r.ghArgs.includes(TITOK), 'a gh argumentumai között nincs titok');
  assert.ok(!r.ghArgs.includes('private_key'));
});

test('más tárolóba és más néven is beállítható', { skip }, () => {
  const r = futtat({ args: ['-Tarolo', 'szerdori/hazi-naplo', '-Nev', 'MASIK_TITOK'] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.ghArgs, /secret set MASIK_TITOK --repo szerdori\/hazi-naplo/);
});

test('nincs kulcsfájl: 2-es kód, gh-hívás nélkül', { skip }, () => {
  const r = futtat({ kulcs: null });
  assert.equal(r.code, 2);
  assert.match(r.out, /Nincs kulcsfájl/);
  assert.equal(r.ghArgs, null);
});

test('nem JSON vagy hiányos kulcs: 2-es kód, a tartalmat nem írja ki', { skip }, () => {
  for (const kulcs of [`nem json ${TITOK}`, JSON.stringify({ private_key: TITOK })]) {
    const r = futtat({ kulcs });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /nem érvényes service account kulcs/);
    assert.ok(!r.out.includes(TITOK));
    assert.equal(r.ghArgs, null);
  }
});

test('nincs telepítve a gh: 3-as kód', { skip }, () => {
  const r = futtat({ gh: false });
  assert.equal(r.code, 3);
  assert.match(r.out, /Nincs telepítve a GitHub CLI/);
});

test('a gh nincs bejelentkezve: 3-as kód, mentés nélkül', { skip }, () => {
  const r = futtat({ auth: 1 });
  assert.equal(r.code, 3);
  assert.match(r.out, /gh auth login/);
  assert.equal(r.ghArgs, null);
});

test('a mentés nem sikerül: 4-es kód, titok nélküli hibaüzenet', { skip }, () => {
  const r = futtat({ set: 1 });
  assert.equal(r.code, 4);
  assert.match(r.out, /A titok mentése nem sikerült/);
  assert.ok(!r.out.includes(TITOK));
});
