# 0002 – A jelöltlistát az Actions készíti elő, a Claude csak válogat és ír

*Állapot: elfogadva (2026-11-16, #3-as PR).*

## Háttér
A napi Claude-futás (lásd [0001](0001-ket-reteg-es-kozos-firebase.md)) korábban maga töltötte le és olvasta végig a forrásokat. Ez sok tokent vitt el olyan munkára, amit AI nélkül is el lehet végezni: letöltés, szűrés, ismétlődések kiszűrése.

## Döntés
- Az **alapréteg** (GitHub Actions, `scripts/alap.mjs`) minden futáskor tömör jelöltlistát ír a `kapitany_input/claude` dokumentumba: friss hírek kivonattal és rövid azonosítóval, még nem látott kártyák, összesített visszajelzés, Claude-oldalak.
- A **Claude-réteg** (`CLAUDE-FELADAT.md`) ebből dolgozik: kiválasztja, mi kerüljön be, és megírja a magyar összefoglalót. Saját keresést legfeljebb háromszor végez.
- A feltöltő (`scripts/claude-feltoltes.ps1`, `-Mode bemenet`) a rövid azonosítókból pótolja a linkeket és a kártyák adatait, így a Claude-nak nem kell ezeket visszaírnia.

## Miért
A gépies munka ingyen és megbízhatóan fut az Actionsben, a Claude tokenjei pedig arra mennek, amiben többet ad: válogatásra és fogalmazásra. A futás rövidebb, kisebb az esélye, hogy félbeszakad.

## Következmények
- A Claude-réteg az alapréteg futásától függ: ha az Actions nem futott le, a Claude a legutóbbi jelöltlistából dolgozik.
- A tartalmi szabályok (nincs bűnügy és erőszak) két lépcsőben érvényesülnek: a kód kulcsszavakkal szűr (`sources.json` `tiltott` listája), a tartalom szerinti szűrés a Claude dolga. A szabályok szövegét a `CLAUDE-FELADAT.md`-ben teszt őrzi.
- Új forrás felvételéhez elég a `sources.json`-t módosítani, a Claude-feladathoz nem kell nyúlni.
- Lehetséges következő lépés: az összefoglaló is az Actionsben készülhet, API-kulccsal. Ehhez a kulcs a GitHub Secretbe kerülne, ugyanúgy, ahogy a `scripts/titok-beallitas.ps1` a Firebase-kulcsot beteszi.
