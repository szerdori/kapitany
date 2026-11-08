# Kapitány

Napi fontos dolgok és inspiráció, doomscrolling helyett. Véges: a hírek végén „Ennyi a fontos”, az inspirációból napi 15 kártya, és kész.

- **Mai nap:** időjárás (Open-Meteo), hírek rovatonként (Itthon, EU, Világ, Gazdaság) forráslinkekkel, Claude-újdonságok. Bűnügyi és erőszakos hírek nincsenek benne.
- **Inspiráció:** StumbleUpon-szerű kártyák (D&D, gyereknevelés, IT-vezetés, AI-használat, véletlen érdekesség). A 👍/👎 alapján tanul. **Csendes mód:** csak szöveg és feliratos videó. **Hangos mód:** minden.
- **Később:** az elmentett cikkek.

## Hogyan működik

Két réteg dolgozik, és az app mindig a GitHub Pages-ről töltődik be, Claude nélkül is.

| Réteg | Mikor fut | Mit csinál |
|---|---|---|
| **Alapréteg** (`.github/workflows/napi-alap.yml`, `scripts/alap.mjs`) | GitHub Actions, naponta kb. 4:17-kor és 14:17-kor | AI nélkül összegyűjti a hírcímeket és az inspirációs cikkeket a `sources.json` forrásaiból. A címek eredeti nyelvűek, a szűrés kulcsszavas (a `tiltott` lista). |
| **Claude-réteg** (`CLAUDE-FELADAT.md`, `scripts/claude-feltoltes.ps1`) | A Claude desktop ütemezett feladata, amikor a desktop app fut | Magyarul összefoglal, tartalom szerint szűr, megírja, miért érinthet téged egy hír, és a lájkjaid alapján válogat kártyákat. Aznapra felülírja az alapváltozatot. |

Az app kiírja, melyiket látod: „Claude-összefoglaló, 7:42” vagy „Alapváltozat, Claude ma még nem futott”.

Minden adat a MomAssistant Firebase-projektjében van, külön gyűjteményekben (`kapitany_daily`, `kapitany_cards`, `kapitany_feedback`, `kapitany_settings`, `kapitany_meta`). A hozzáférést a MomAssistant meglévő Firestore-szabályai döntik el, így ugyanazok a Google-fiókok érik el, mint a MomAssistantot.

## Fájlok

| Fájl | Mire való |
|---|---|
| `index.html` | maga az app |
| `firebase-config.js` | a Firebase-projekt webes beállításai (ugyanaz, mint a MomAssistanté) |
| `sources.json` | hírforrások, inspirációs források, tiltott szavak; bátran szerkeszthető |
| `CLAUDE-FELADAT.md` | a napi Claude-feladat leírása |
| `scripts/claude-feltoltes.ps1` | ezzel ír a Claude-feladat a Firestore-ba |
| `scripts/alap.mjs`, `scripts/lib.mjs` | az alapréteg (GitHub Actions futtatja) |
| `tests/` | tesztek (commit előtt a gépen, feltöltéskor a GitHubon futnak) |
| `.githooks/` | commit és push előtt lefuttatja a teszteket |

## Első beállítás

### 1. GitHub Pages bekapcsolása
A tárolóban: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, mappa: `/ (root)` → Save.**
Egy-két perc múlva az app elérhető itt: https://szerdori.github.io/kapitany/

A Firebase-ben nincs teendő: a `szerdori.github.io` már engedélyezett domain a MomAssistant miatt.

### 2. Kulcs az alapréteghez (GitHub Actions)
Az alapréteg a MomAssistant kiszolgálói kulcsával ír az adatbázisba.
- A gépeden ez itt van: `%USERPROFILE%\.momassistant\kulcs.json`. Nyisd meg Jegyzettömbbel, és jelöld ki a teljes tartalmát.
- GitHub, a `kapitany` tárolóban: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FIREBASE_SERVICE_ACCOUNT`, Secret: a kulcsfájl teljes tartalma → **Add secret**.
- Ezt a kulcsot ne küldd el senkinek, chatbe se.

Ellenőrzés: **Actions → Napi alapréteg → Run workflow**. A futás naplójában forrásonként látszik, hány elemet talált, vagy hogy nem érte el. Ha egy forrás tartósan nem érhető el, a `sources.json`-ból törölhető vagy javítható.

### 3. Claude-réteg (Claude desktop)
1. Töltsd le a tárolót a gépedre, például ide: `C:\Users\<neved>\kapitany` (GitHub Desktop vagy `git clone https://github.com/szerdori/kapitany`).
2. A Claude desktopban hozz létre egy ütemezett feladatot (ahogy a MomAssistant napi átnézésénél), naponta reggelre, ezzel a mappával és ezzel a szöveggel:

   > Kövesd a CLAUDE-FELADAT.md lépéseit.

3. Első alkalommal futtasd kézzel. Ha minden rendben, a végén azt írja, hány hír és kártya került fel, és az appban megjelenik a „Claude-összefoglaló” jelzés.

Ha a gép aludt a beállított időpontban, a feladat a Claude desktop megnyitásakor pótolja a futást. Ha aznap már futott, nem fut le újra.

### 4. Telefonra
Nyisd meg a címet a telefonon, lépj be Google-fiókkal, majd:
- **Android (Chrome):** menü → *Hozzáadás a kezdőképernyőhöz*
- **iPhone (Safari):** Megosztás → *Főképernyőhöz adás*

## Tudnivalók
- Az időjárás városa a **Beállítások** fülön változtatható; alapból Budapest.
- A GitHub az ütemezett futásokat néha 5–20 percet késve indítja.
- Ha a tárolóban 60 napig nem történik változás, a GitHub szünetelteti az alapréteg ütemezését. Ilyenkor az **Actions** fülön egy gombbal újra bekapcsolható.
- A GitHub Actions naplója nyilvános, ezért az alapréteg csak forrásneveket és darabszámokat ír ki, a lájkjaidat soha.
- A kulcsszavas szűrő szándékosan szigorú: kétes esetben inkább kihagy egy hírt. Emiatt Claude nélkül a háborús hírek egy része is kimaradhat; Claude tényszerűen beveszi őket.

## Tesztek
A `tests` mappában vannak, és folyamatosan bővülnek: minden új funkcióhoz jár teszt.

| Fájl | Mit tesztel |
|---|---|
| `tests/lib.test.mjs` | az alapréteg logikája: feedek feldolgozása (RSS, RDF, Atom, hibás feedek), tiltott témák szűrése, napi összeállítás, kártyák |
| `tests/alap.test.mjs` | az alapréteg futása: letöltés, hibás forrás, mentés az adatbázisba (Claude-összefoglaló felülírása nélkül), maga az `alap.mjs` |
| `tests/ui.test.mjs` | a felület fő útjai láthatatlan böngészőben: Mai nap, Inspiráció, Később, Beállítások |
| `tests/ui-logika.test.mjs` | az ajánló, az időjárás-tipp, a ritkább állapotok és hibák, és a Firebase-adapter (kitalált Firebase-zel) |
| `tests/lefedettseg.mjs` | lefuttatja az összeset, és kiírja, a kód hány százalékát járják be |

A tesztek a valódi Firebase-hez és a netre nem nyúlnak.

**Mikor futnak:**
- **commit és push előtt a gépeden** (`.githooks`): ha elbuknak, nem lesz commit, illetve feltöltés. A `feltoltes.ps1` ezt magától bekapcsolja; kézzel: `git config core.hooksPath .githooks`. Első alkalommal a hook maga telepíti a kellő csomagokat. Ha a gépen nincs Node.js, a hook szól, és átengedi (a GitHub ettől még lefuttatja). Sürgős esetben kihagyható: `--no-verify`.
- **feltöltés után a GitHubon:** **Actions → Tesztek**; a lefedettségi táblázat a futás összefoglalójában látszik.

**Kézzel**, a `scripts` mappában: `npm install`, majd `npm test`. Böngészőnek a Playwright Chromiumát használja (`npx playwright install chromium`); Windowson, ha az nincs letöltve, a gépen lévő Edge-et.

**Lefedettség:** az `npm test` a végén kiírja fájlonként. Egy sor akkor számít lefedettnek, ha minden része lefutott (egy ki nem próbált `if`-ág már nem), tehát a szám inkább szigorú. Ha az összesített sorlefedettség **90%** alá esik, a teszt piros: új kódhoz új teszt kell. Ha a lefedettség tartósan feljebb megy, a küszöb (`--min=90` a `scripts/package.json`-ben) emelhető, de csökkenteni nem érdemes. A nem lefedett sorok listája: `npm run lefedettseg`.

## Frissítés
Minden változtatás után futtasd a projektmappában:
```
.\feltoltes.ps1 "Mit változtattunk"
```
vagy kattints duplán a `feltoltes.cmd` fájlra.
