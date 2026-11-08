# Feltölti (commit + push) a változásokat a GitHubra; a GitHub Pages 1-2 percen belül kiteszi az új verziót.
# A tesztek feltöltés után a GitHubon futnak (Actions → Tesztek).
# Használat:  .\feltoltes.ps1 "Mit változtattunk"
# Üzenet nélkül indítva rákérdez.
param([string]$Uzenet)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }

$valtozasok = & $git status --porcelain
if (-not $valtozasok) {
  Write-Host 'Nincs feltöltendő változás.' -ForegroundColor Yellow
  exit 0
}

Write-Host 'Ezek a fájlok változtak:' -ForegroundColor Cyan
& $git status --short

if (-not $Uzenet) { $Uzenet = Read-Host 'Röviden: mit változtattunk? (Enter = "Frissítés")' }
if (-not $Uzenet) { $Uzenet = 'Frissítés' }

# A git a figyelmeztetéseit és a push állapotát stderr-re írja; ez nem hiba, ezért innentől csak a kilépési kódot nézzük.
$ErrorActionPreference = 'Continue'
& $git add -A 2>&1 | ForEach-Object { "$_" } | Write-Host -ForegroundColor DarkGray
if ($LASTEXITCODE -ne 0) { Write-Host 'A git add nem sikerült.' -ForegroundColor Red; exit 1 }
& $git commit -q -m $Uzenet 2>&1 | ForEach-Object { "$_" } | Write-Host -ForegroundColor DarkGray
if ($LASTEXITCODE -ne 0) { Write-Host 'A commit nem sikerült.' -ForegroundColor Red; exit 1 }
& $git push 2>&1 | ForEach-Object { "$_" } | Write-Host -ForegroundColor DarkGray
if ($LASTEXITCODE -ne 0) { Write-Host 'A feltöltés nem sikerült. A változás helyben el van mentve, később újrapróbálható.' -ForegroundColor Red; exit 1 }

Write-Host 'Kész. 1-2 perc múlva él: https://szerdori.github.io/kapitany/' -ForegroundColor Green
