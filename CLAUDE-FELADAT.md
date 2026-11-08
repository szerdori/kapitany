# Kapitány – napi Claude-feladat

Ezt a leírást a Claude desktop ütemezett feladata követi. Beállítás: a README „Claude-réteg” része.

A feladat célja: Dóri napi híreinek és inspirációs kártyáinak magyar nyelvű, szűrt összeállítása a Kapitány appba.
Az app a GitHub Pages-en fut Claude nélkül is; amit itt feltöltesz, az aznapra felülírja a gépi alapváltozatot.

A mappa: a `kapitany` repó helyi másolata. A parancsokat PowerShellben, ebben a mappában futtasd.

## 0. Friss forráslista

```
git pull --ff-only
```

Ha nem sikerül (pl. nincs net vagy helyi módosítás van), nem baj: folytasd a meglévő fájlokkal.

## 1. Kell-e ma futni?

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude-feltoltes.ps1 -Mode last
```

Ha a válasz `kesz`, mára már elkészült az összefoglaló: állj meg, és csak annyit írj, hogy „A Kapitány mára már frissült.”
Ha `HIBA` kezdetű, írd ki a hibát, és állj meg.

## 2. Visszajelzések kimentése

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude-feltoltes.ps1 -Mode export -Out tmp\visszajelzes.json
```

(A `tmp` mappát hozd létre, ha nincs. A `tmp` nem kerül a repóba.)

A `tmp\visszajelzes.json`-ban:
- `visszajelzesek`: Dóri szavazatai a korábbi kártyákra (`fel` = tetszett, `le` = nem, `ugras` = átugrotta, `kesobb` = elmentette; ha `olvasva` is van, meg is nyitotta). Ebből tudod, milyen témák, források és milyen jellegű írások tetszenek neki.
- `korabbiUrlek`: ezeket már látta vagy megkapta, ne ajánld újra.

## 3. Hírek összegyűjtése

Olvasd el a `sources.json`-t. Nézd meg a `hirek` forrásait (RSS), és ha egy fontos témánál kell, keress rá a weben.
A Claude-újdonságokhoz nézd meg a `claudeOldalak` listát.

**Mi kerülhet be:** ami hatással lehet Dóri életére vagy környezetére. Magyar belpolitika és szakpolitika (adók, családi támogatások, oktatás, egészségügy, árak, energia, közlekedés, törvények), EU-s döntések, világpolitika, gazdaság (forint, infláció, kamatok), nagyobb események, jelentős tudományos és technológiai hírek.

**Mi nem kerülhet be soha:**
- gyilkosság, nemi erőszak, zaklatás, kínzás, bántalmazás, egyéb bűncselekmények részletei;
- egyedi, helyi esemény tágabb következmény nélkül (pl. egy autós üldözés Borsodban, egy baleset);
- bulvár.

**Háború, terror és hasonlók:** maradhatnak, ha politikailag fontosak, de tényszerűen: döntések és következmények, részletek, áldozatok leírása és sokkoló elemek nélkül.

**Stílus:** magyarul, semlegesen, értékelés nélkül. Csak abból írj, amit a forrásban ténylegesen elolvastál. Ha a lapok másképp írják le ugyanazt, jelezd egy félmondatban. Ugyanaz a hír több forrásból = egy tétel, az összes forráslinkkel.

Rovatonként 3–5 hír. Minden hírnél egy „hogyan hat rád” rész (`miert`): 2–4 mondat arról, konkrétan hogyan érintheti Dórit és a családját (pénz, adók, gyerekek, oktatás, egészségügy, közlekedés, munka, IT/AI szakma), mikortól és mekkora valószínűséggel. Ha nem tudni még biztosan, írd meg, mitől függ. Ha ilyen nem írható, a hír ne kerüljön be.

## 4. Inspirációs kártyák

Válassz 25–35 kártyát (Dóri görgethető listában látja őket). Témák: D&D, gyereknevelés, IT-vezetés, AI-használat, plusz 4–6 véletlen érdekesség.
- Forrás: a `sources.json` `inspiracio` listája, de keresd is a jót azon túl. Témánként legalább 3 különböző forrásból válogass.
- **Csak regisztráció nélkül olvasható:** Dóri nem szeretne regisztrálni, még ingyenesen sem. Ne ajánlj olyat, ami belépést, (ingyenes) feliratkozást vagy előfizetést kér a teljes szöveghez (pl. ParentData, Medium fizetős cikkek, LeadDev).
- **Oktató jelleg:** legyen köztük 5–8 tanító írás vagy videó (útmutató, magyarázat, „hogyan csináld”, kurzusrészlet); ezeket `"oktato": true`-val jelöld.
- **Gyereknevelés:** csak bizonyítékalapú forrásból (kutatás, szakmai szervezet, kutató szerző). Tudományos alap nélküli trendek, influenszer-tanácsok nem.
- Ne ajánlj olyat, ami a `korabbiUrlek`-ben van.
- A visszajelzések alapján súlyozz: több abból, ami tetszett, kevesebb abból, amit elutasított; a véletlen érdekesség maradjon.
- **Videó:** csak akkor jelöld `"feliratos": true`-val, ha a videóoldalon látod, hogy van hozzá kézzel készített felirat. Ha nem tudod biztosan, `false`.

## 5. Fájlok megírása

`tmp\mai.json`:

```json
{
  "rovatok": [
    { "id": "itthon", "cim": "Itthon", "items": [
      { "cim": "Rövid magyar cím", "osszefoglalo": "2–3 mondat.", "miert": "Hogyan hat Dórira: 2–4 mondat, konkrétan.",
        "linkek": [ { "nev": "Telex", "url": "https://..." }, { "nev": "Index", "url": "https://..." } ] }
    ] },
    { "id": "eu", "cim": "Európai Unió", "items": [] },
    { "id": "vilag", "cim": "Világ", "items": [] },
    { "id": "gazdasag", "cim": "Gazdaság", "items": [] }
  ],
  "claudeHirek": [
    { "cim": "Az újdonság neve", "osszefoglalo": "Mi változott, 1–2 mondat.", "mireJo": "Mire használhatja Dóri.", "linkek": [ { "nev": "Anthropic", "url": "https://..." } ] }
  ],
  "zaras": "Egy rövid, száraz humorú zárómondat (pl. „Ennyi a fontos. Innen már csak kedvtelés.”)"
}
```

A `claudeHirek` lista üres, ha az előző futás óta nem volt Claude-újdonság.

`tmp\kartyak.json`:

```json
[
  { "url": "https://...", "cim": "Eredeti cím", "cimHu": "Magyar cím", "leirasHu": "1–2 mondatos magyar ismertető.",
    "forras": "Sly Flourish", "tema": "dnd", "tipus": "szoveg", "feliratos": null, "oktato": true, "percek": 6,
    "miert": "Mert tetszett a múlt heti kalandelőkészítős cikk." }
]
```

- `tema`: `dnd` | `neveles` | `it-vezetes` | `ai` | `veletlen`
- `tipus`: `szoveg` | `video` | `podcast`
- `miert`: egy rövid sor arról, miért kapja ezt (a visszajelzései alapján, vagy „Véletlen felfedezés”).

A JSON legyen érvényes, UTF-8 kódolású.

## 6. Feltöltés

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude-feltoltes.ps1 -Mode upload -Daily tmp\mai.json -Cards tmp\kartyak.json
```

A végén egy sorban írd meg, hány hír és hány kártya került fel, és ha valami nem sikerült.
