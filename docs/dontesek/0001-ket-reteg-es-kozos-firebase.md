# 0001 – Két réteg (alap + Claude) és a MomAssistant közös Firebase-projektje

*Állapot: elfogadva (visszamenőleg rögzítve, 2026-11-16).*

## Háttér
Az app napi tartalmát két forrásból kapja: AI nélküli, megbízhatóan ütemezett gyűjtésből, és a Claude desktop ütemezett feladatából, amely csak akkor fut, ha a gép és az app nyitva van.

## Döntés
- **Alapréteg** (GitHub Actions, `scripts/alap.mjs`): naponta kétszer összegyűjti a címeket és kártyákat. Ez mindig megvan.
- **Claude-réteg** (`CLAUDE-FELADAT.md`): magyar összefoglaló és válogatás, aznapra felülírja az alapot. Az app kiírja, melyiket látod.
- Az adatok a MomAssistant Firebase-projektjében vannak, `kapitany_*` gyűjteményekben, és ugyanazok a Google-fiókok érik el őket. Részletek, kockázatok: a MomAssistant `docs/dontesek/0001-kozos-firebase-projekt.md` fájlja.

## Miért
A kétrétegű felépítés miatt az app Claude nélkül is használható, a Claude-réteg pedig csak többletet ad. A közös projekt miatt nincs külön fiók- és jogosultságkezelés.

## Következmények
- Ha a Claude-réteg nem futott, az „Alapváltozat” jelenik meg; ez nem hiba.
- A közös szabályrendszer miatt a MomAssistant szabályainak módosítása a Kapitányt is érinti.
- Az adatok mentését a MomAssistant helyi mentése végzi (`scripts/export-firestore.ps1`), mert a tároló nyilvános, és GitHub Actions artifactba adatot nem szabad tölteni.
