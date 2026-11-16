# A Firebase szerver-kulcsot (%USERPROFILE%\.momassistant\kulcs.json) beteszi a GitHub-tároló titkai közé
# FIREBASE_SERVICE_ACCOUNT néven, kézi másolás nélkül. A kulcs tartalmát nem írja ki.
# Előfeltétel: GitHub CLI (gh), bejelentkezve (gh auth login).
#
# Használat:  .\scripts\titok-beallitas.ps1                       (a kapitany tárolóba)
#             .\scripts\titok-beallitas.ps1 -Tarolo szerdori/hazi-naplo
# Kilépési kód: 0 = kész, 2 = nincs kulcsfájl vagy nem érvényes JSON, 3 = nincs gh vagy nincs bejelentkezve, 4 = a mentés nem sikerült.
param(
  [string]$Tarolo = 'szerdori/kapitany',
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.momassistant\kulcs.json'),
  [string]$Nev = 'FIREBASE_SERVICE_ACCOUNT'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $KeyPath)) { Write-Host "Nincs kulcsfájl itt: $KeyPath" -ForegroundColor Red; exit 2 }
try { $k = [IO.File]::ReadAllText($KeyPath) | ConvertFrom-Json; if (-not $k.private_key -or -not $k.client_email) { throw 'hiányzó mezők' } }
catch { Write-Host 'A kulcsfájl nem érvényes service account kulcs.' -ForegroundColor Red; exit 2 }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Host 'Nincs telepítve a GitHub CLI (gh): https://cli.github.com/' -ForegroundColor Red; exit 3 }
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Write-Host 'Előbb jelentkezz be: gh auth login' -ForegroundColor Red; exit 3 }

# A tartalom stdin-en megy, így nem jelenik meg a parancssorban.
[IO.File]::ReadAllText($KeyPath) | & gh secret set $Nev --repo $Tarolo
if ($LASTEXITCODE -ne 0) { Write-Host 'A titok mentése nem sikerült.' -ForegroundColor Red; exit 4 }
Write-Host "Kész: a $Nev titok be van állítva itt: $Tarolo" -ForegroundColor Green
exit 0
