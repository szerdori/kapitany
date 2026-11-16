# Kapitány – napi Claude-feladat

Ezt a leírást a Claude desktop ütemezett feladata követi. Beállítás: a README „Claude-réteg” része.

A feladat célja: Dóri napi híreinek és inspirációs kártyáinak magyar nyelvű, szűrt összeállítása a Kapitány appba.
Az app a GitHub Pages-en fut Claude nélkül is; amit itt feltöltesz, az aznapra felülírja a gépi alapváltozatot.

A forrásokat nem neked kell letöltened: a GitHub Actions hajnalban letöltötte, kulcsszavasan szűrte és összevonta őket,
és egy tömör jelöltlistát készített. Te ebből válogatsz és írsz magyarul. Így a futás sokkal kevesebb tokent használ.

A mappa: a `kapitany` repó helyi másolata. A parancsokat PowerShellben, ebben a mappában futtasd.

**Fontos, hogy a feladat kérdezés nélkül fusson:**
- A parancsokat pontosan úgy futtasd, ahogy itt szerepelnek, egyenként. Ne fűzd össze őket (`;`, `&&`), és ne írd át őket.
- Weboldalt a beépített webes olvasóval (WebFetch) és kereséssel (WebSearch) olvass. Ne írj és ne futtass saját segédszkriptet (Python, PowerShell) letöltéshez vagy feldolgozáshoz.
- Fájlt csak a `tmp` mappába írj.
- Takarékosan: ha több oldalt kell megnyitnod, egy lépésben, párhuzamosan kérd le őket. Az egész futásban legfeljebb 3 webes keresés legyen.

## 0. Friss forráslista

```
git pull --ff-only
```

Ha nem sikerül (pl. nincs net vagy helyi módosítás van), nem baj: folytasd a meglévő fájlokkal.

## 1. A mai jelöltlista

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude-feltoltes.ps1 -Mode bemenet -Out tmp\bemenet.json
```

- Ha a válasz `kesz`, mára már elkészült az összefoglaló: állj meg, és csak annyit írj, hogy „A Kapitány mára már frissült.”
- Ha `HIBA` kezdetű, írd ki a hibát, és állj meg.
- Különben olvasd el a `tmp\bemenet.json`-t. A `sources.json`-t nem kell elolvasnod.

A `tmp\bemenet.json`-ban:
- `hirek`: a friss hírjelöltek rovatonként (`rovat`: `itthon` | `eu` | `vilag` | `gazdasag`), rövid azonosítóval (`h1`, `h2`…), címmel, a feed kivonatával (`kivonat`) és a forráslinkekkel. Ugyanaz a hír több lapnál már egy jelölt.
- `claudeHirek`: Claude-újdonság-jelöltek (`c1`…), és `claudeOldalak`: az Anthropic oldalai.
- `kartyak`: inspirációs kártyajelöltek, amelyeket Dóri még nem látott, és még nem ajánlottál (`id`, cím, rövid leírás, forrás, téma, típus).
- `visszajelzes`: Dóri szavazatainak összesítése témánként (`temak`) és forrásonként (`forrasok`): `fel` = tetszett, `le` = nem, `ugras` = átugrotta, `kesobb` = elmentette, `olvasva` = meg is nyitotta. A `kedvelt` és `elutasitott` a legutóbbi ilyen címek. Ebből tudod, milyen témák, források és milyen jellegű írások tetszenek neki.

## 2. Hírek

Válaszd ki a `hirek` közül, ami bekerül, a lenti szabályok szerint. A kiválasztott híreket nyisd meg (WebFetch, egy lépésben párhuzamosan), mert csak abból írhatsz, amit ténylegesen elolvastál; a kivonat a válogatáshoz elég, az íráshoz nem. Ha egy fontos témánál kell, keress rá a weben.
A Claude-újdonságokhoz nézd meg a `claudeHirek` jelölteket, és ha kell, az Anthropic hírek oldalát a `claudeOldalak` közül.

**Mi kerülhet be:** ami hatással lehet Dóri életére vagy környezetére. Magyar belpolitika és szakpolitika (adók, családi támogatások, oktatás, egészségügy, árak, energia, közlekedés, törvények), EU-s döntések, világpolitika, gazdaság (forint, infláció, kamatok), nagyobb események, jelentős tudományos és technológiai hírek.

**Mi nem kerülhet be soha:**
- gyilkosság, nemi erőszak, zaklatás, kínzás, bántalmazás, egyéb bűncselekmények részletei;
- egyedi, helyi esemény tágabb következmény nélkül (pl. egy autós üldözés Borsodban, egy baleset);
- bulvár.

A jelöltlistát a kód csak kulcsszavakkal szűrte; a tartalom szerinti szűrés a te feladatod.

**Háború, terror és hasonlók:** maradhatnak, ha politikailag fontosak, de tényszerűen: döntések és következmények, részletek, áldozatok leírása és sokkoló elemek nélkül.

**Stílus:** magyarul, semlegesen, értékelés nélkül. Csak abból írj, amit a forrásban ténylegesen elolvastál. Ha a lapok másképp írják le ugyanazt, jelezd egy félmondatban. Ugyanaz a hír több forrásból = egy tétel, az összes forrással.

Rovatonként 3–5 hír. Minden hírnél egy „hogyan hat rád” rész (`miert`): 2–4 mondat arról, konkrétan hogyan érintheti Dórit és a családját (pénz, adók, gyerekek, oktatás, egészségügy, közlekedés, munka, IT/AI szakma), mikortól és mekkora valószínűséggel. Ha nem tudni még biztosan, írd meg, mitől függ. Ha ilyen nem írható, a hír ne kerüljön be.

## 3. Inspirációs kártyák

Válassz 25–35 kártyát (Dóri görgethető listában látja őket). Témák: D&D, gyereknevelés, IT-vezetés, AI-használat, plusz 4–6 véletlen érdekesség.
- Forrás: elsősorban a `kartyak` jelöltjei. Ha egy témából kevés a jó jelölt, keress azon túl is (a 3 keresésen belül). Témánként legalább 3 különböző forrásból válogass.
- **Csak regisztráció nélkül olvasható:** Dóri nem szeretne regisztrálni, még ingyenesen sem. Ne ajánlj olyat, ami belépést, (ingyenes) feliratkozást vagy előfizetést kér a teljes szöveghez (pl. ParentData, Medium fizetős cikkek, LeadDev).
- **Oktató jelleg:** legyen köztük 5–8 tanító írás vagy videó (útmutató, magyarázat, „hogyan csináld”, kurzusrészlet); ezeket `"oktato": true`-val jelöld.
- **Gyereknevelés:** csak bizonyítékalapú forrásból (kutatás, szakmai szervezet, kutató szerző). Tudományos alap nélküli trendek, influenszer-tanácsok nem.
- A jelöltek közül a kód már kiszűrte, amit Dóri látott; amit a jelöltlistán kívül találsz, az ne legyen a `visszajelzes.kedvelt` vagy `elutasitott` címei között.
- A visszajelzések alapján súlyozz: több abból, ami tetszett, kevesebb abból, amit elutasított; a véletlen érdekesség maradjon.
- **Videó:** csak akkor jelöld `"feliratos": true`-val, ha a videóoldalon látod, hogy van hozzá kézzel készített felirat. Ha nem tudod biztosan, `false`.

## 4. Fájlok megírása

Tömören: a linkeket és a kártyaadatokat ne másold ki, csak hivatkozz az azonosítókra, a feltöltő pótolja őket.

`tmp\mai.json`:

```json
{
  "rovatok": [
    { "id": "itthon", "cim": "Itthon", "items": [
      { "cim": "Rövid magyar cím", "osszefoglalo": "1–2 mondat.", "miert": "Hogyan hat Dórira: 2–4 mondat, konkrétan.",
        "forrasok": ["h3", "h7"] }
    ] },
    { "id": "eu", "cim": "Európai Unió", "items": [] },
    { "id": "vilag", "cim": "Világ", "items": [] },
    { "id": "gazdasag", "cim": "Gazdaság", "items": [] }
  ],
  "claudeHirek": [
    { "cim": "Az újdonság neve", "osszefoglalo": "Mi változott, 1–2 mondat.", "mireJo": "Mire használhatja Dóri.", "forrasok": ["c1"] }
  ],
  "zaras": "Egy rövid, száraz humorú zárómondat (pl. „Ennyi a fontos. Innen már csak kedvtelés.”)"
}
```

- `forrasok`: a felhasznált jelöltek azonosítói. Ha olyan forrást használtál, ami nincs a jelöltek között (pl. keresésből vagy az Anthropic oldaláról), azt add meg `"linkek": [ { "nev": "Anthropic", "url": "https://..." } ]` alakban; a kettő együtt is lehet.
- A `claudeHirek` lista üres, ha az előző futás óta nem volt Claude-újdonság.

`tmp\kartyak.json`:

```json
[
  { "id": "a1b2c3d4e5f6a7b8c9d0", "cimHu": "Magyar cím", "leirasHu": "1–2 mondatos magyar ismertető.",
    "percek": 6, "miert": "Mert tetszett a múlt heti kalandelőkészítős cikk." },
  { "url": "https://...", "cim": "Eredeti cím", "cimHu": "Magyar cím", "leirasHu": "1–2 mondatos magyar ismertető.",
    "forras": "Sly Flourish", "tema": "dnd", "tipus": "szoveg", "feliratos": null, "oktato": true, "percek": 6,
    "miert": "Véletlen felfedezés" }
]
```

- Jelöltből választott kártya (első minta): `id` a jelöltlistából, plusz `cimHu`, `leirasHu`, `percek`, `miert`. Ha az `oktato` vagy a `feliratos` értéke eltér a jelöltétől, azt is add meg.
- A jelöltlistán kívül talált kártya (második minta): az összes mezővel, `id` nélkül.
- `tema`: `dnd` | `neveles` | `it-vezetes` | `ai` | `veletlen`
- `tipus`: `szoveg` | `video` | `podcast`
- `miert`: egy rövid sor arról, miért kapja ezt (a visszajelzései alapján, vagy „Véletlen felfedezés”).

A JSON legyen érvényes, UTF-8 kódolású.

## 5. Feltöltés

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude-feltoltes.ps1 -Mode upload -Daily tmp\mai.json -Cards tmp\kartyak.json
```

A végén egy sorban írd meg, hány hír és hány kártya került fel, és ha valami nem sikerült (a feltöltő `FIGYELEM` sorát is).
