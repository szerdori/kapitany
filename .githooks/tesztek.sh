#!/bin/sh
# A pre-commit és a pre-push hook közös része: lefuttatja a teszteket és a lefedettségmérést (npm test).
cd "$(git rev-parse --show-toplevel)/scripts" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Kapitány: nincs Node.js ezen a gépen, ezért a tesztek most kimaradnak (a GitHubon feltöltés után lefutnak)."
  exit 0
fi
if [ ! -d node_modules/playwright ] || [ ! -d node_modules/fast-xml-parser ]; then
  echo "Kapitány: első futás, telepítem a tesztekhez kellő csomagokat..."
  npm install --no-audit --no-fund || { echo "A telepítés nem sikerült, a $1 megállt."; exit 1; }
fi

echo "Kapitány: tesztek a $1 előtt..."
if ! npm test --silent; then
  echo ""
  echo "A tesztek nem mentek át, ezért a $1 megállt. Javítsd, vagy sürgős esetben: git $1 --no-verify"
  exit 1
fi
