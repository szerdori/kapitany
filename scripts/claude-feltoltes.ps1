# A Kapitány Claude-rétege: ezen keresztül olvas és ír a Claude desktop napi feladata a Firestore-ba.
# Ugyanazt a kulcsfájlt használja, mint a MomAssistant (ugyanaz a Firebase-projekt), és a kulcsot soha nem írja ki.
#
#   -Mode check                      ellenőrzi, hogy a kulccsal be lehet-e jelentkezni
#   -Mode last                       kiírja, hogy mára kész-e már a Claude-összefoglaló ("kesz" / "nincs")
#   -Mode export -Out <fajl.json>    kimenti a visszajelzéseket és a korábban mutatott linkeket a válogatáshoz
#   -Mode upload -Daily <mai.json> [-Cards <kartyak.json>]
#                                    feltölti a mai magyar összefoglalót és az ajánlott kártyákat
#
# A fájlok formátuma a CLAUDE-FELADAT.md-ben van leírva.
param(
  [ValidateSet('check', 'last', 'export', 'upload')][string]$Mode = 'check',
  [string]$Out,
  [string]$Daily,
  [string]$Cards,
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.momassistant\kulcs.json'),
  [string]$Project = 'hazi-naplo'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $KeyPath)) { Write-Output "HIBA: nincs kulcsfájl itt: $KeyPath"; exit 2 }

function B64Url([byte[]]$bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

function Get-AccessToken {
  $k = [IO.File]::ReadAllText($KeyPath) | ConvertFrom-Json
  $pem = $k.private_key -replace '-----BEGIN PRIVATE KEY-----', '' -replace '-----END PRIVATE KEY-----', '' -replace '\s', ''
  $cng = [Security.Cryptography.CngKey]::Import([Convert]::FromBase64String($pem), [Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
  $rsa = New-Object Security.Cryptography.RSACng($cng)
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $head = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"RS256","typ":"JWT"}'))
  $claims = [ordered]@{ iss = $k.client_email; scope = 'https://www.googleapis.com/auth/datastore'; aud = 'https://oauth2.googleapis.com/token'; iat = $now; exp = $now + 3600 }
  $body = B64Url ([Text.Encoding]::UTF8.GetBytes(($claims | ConvertTo-Json -Compress)))
  $sig = $rsa.SignData([Text.Encoding]::ASCII.GetBytes("$head.$body"), [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $res = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer'; assertion = "$head.$body.$(B64Url $sig)" }
  return $res.access_token
}

$root = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents"
try { $headers = @{ Authorization = 'Bearer ' + (Get-AccessToken) } }
catch { Write-Output "HIBA: nem sikerült bejelentkezni a kulccsal ($($_.Exception.Message))"; exit 3 }

$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$today = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Central Europe Standard Time').ToString('yyyy-MM-dd')

# ---- JSON <-> Firestore-érték ----
function ConvertTo-FsValue($v) {
  if ($null -eq $v) { return @{ nullValue = 'NULL_VALUE' } }
  if ($v -is [string]) { return @{ stringValue = $v } }
  if ($v -is [bool]) { return @{ booleanValue = $v } }
  if ($v -is [int] -or $v -is [long] -or $v -is [int16] -or $v -is [byte]) { return @{ integerValue = [string]$v } }
  if ($v -is [double] -or $v -is [decimal] -or $v -is [single]) {
    if ([math]::Floor([double]$v) -eq [double]$v -and [math]::Abs([double]$v) -lt 9e15) { return @{ integerValue = [string][long]$v } }
    return @{ doubleValue = [double]$v }
  }
  if ($v -is [System.Collections.IDictionary]) {
    $f = @{}; foreach ($k in $v.Keys) { $f[[string]$k] = ConvertTo-FsValue $v[$k] }
    return @{ mapValue = @{ fields = $f } }
  }
  if ($v -is [System.Management.Automation.PSCustomObject]) {
    $f = @{}; foreach ($p in $v.PSObject.Properties) { $f[$p.Name] = ConvertTo-FsValue $p.Value }
    return @{ mapValue = @{ fields = $f } }
  }
  if ($v -is [System.Collections.IEnumerable]) {
    $vals = @(); foreach ($x in $v) { $vals += , (ConvertTo-FsValue $x) }
    if ($vals.Count -eq 0) { return @{ arrayValue = @{} } }
    return @{ arrayValue = @{ values = $vals } }
  }
  return @{ stringValue = [string]$v }
}
function ConvertFrom-FsValue($fv) {
  if ($null -eq $fv) { return $null }
  $p = $fv.PSObject.Properties
  if ($p['stringValue']) { return $fv.stringValue }
  if ($p['integerValue']) { return [long]$fv.integerValue }
  if ($p['doubleValue']) { return [double]$fv.doubleValue }
  if ($p['booleanValue']) { return [bool]$fv.booleanValue }
  if ($p['timestampValue']) { return $fv.timestampValue }
  if ($p['arrayValue']) { return , @(@($fv.arrayValue.values) | Where-Object { $null -ne $_ } | ForEach-Object { ConvertFrom-FsValue $_ }) }
  if ($p['mapValue']) {
    $o = [ordered]@{}
    if ($fv.mapValue.fields) { foreach ($q in $fv.mapValue.fields.PSObject.Properties) { $o[$q.Name] = ConvertFrom-FsValue $q.Value } }
    return [pscustomobject]$o
  }
  return $null
}
function Fields($obj) { $f = @{}; foreach ($p in $obj.PSObject.Properties) { $f[$p.Name] = ConvertTo-FsValue $p.Value }; return $f }

function Send-Json($method, $uri, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 30 -Compress))
  Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}
function StatusOf($err) { if ($err.Exception.Response) { return [int]$err.Exception.Response.StatusCode } return 0 }
function Get-Doc($path) {
  try { return Invoke-RestMethod -Uri "$root/$path" -Headers $headers }
  catch { if ((StatusOf $_) -eq 404) { return $null } throw }
}
# Lekérdezés egy gyűjteményből: azok a dokumentumok, amelyekben a mező >= érték (egész szám).
function Find-Since($collection, $field, [long]$since) {
  $q = @{ structuredQuery = @{ from = @(@{ collectionId = $collection }); where = @{ fieldFilter = @{ field = @{ fieldPath = $field }; op = 'GREATER_THAN_OR_EQUAL'; value = @{ integerValue = [string]$since } } } } }
  $res = Send-Json 'Post' "$root`:runQuery" $q
  $out = @()
  foreach ($r in @($res)) {
    if (-not $r.document) { continue }
    $o = [ordered]@{ id = ($r.document.name -split '/')[-1] }
    if ($r.document.fields) { foreach ($q2 in $r.document.fields.PSObject.Properties) { $o[$q2.Name] = ConvertFrom-FsValue $q2.Value } }
    $out += [pscustomobject]$o
  }
  return , $out
}
function CardId([string]$url) {
  $sha = [Security.Cryptography.SHA1]::Create()
  $h = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($url.Trim()))
  return (($h | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 20)
}

if ($Mode -eq 'check') { $null = Get-Doc 'kapitany_meta/claude'; Write-Output 'OK: a kulcs működik, az adatbázis elérhető.'; exit 0 }

if ($Mode -eq 'last') {
  $d = Get-Doc "kapitany_daily/$today"
  if ($d -and $d.fields.reteg.stringValue -eq 'claude') { Write-Output 'kesz' } else { Write-Output 'nincs' }
  exit 0
}

if ($Mode -eq 'export') {
  if (-not $Out) { Write-Output 'HIBA: add meg a kimeneti fájlt (-Out).'; exit 4 }
  $fb = Find-Since 'kapitany_feedback' 'ido' ($nowMs - 120L * 86400000)
  $cards = Find-Since 'kapitany_cards' 'felveve' ($nowMs - 30L * 86400000)
  $result = [ordered]@{
    ma = $today
    visszajelzesek = @($fb | Sort-Object ido -Descending | Select-Object -First 400 | ForEach-Object { [ordered]@{ szavazat = $_.szavazat; olvasva = [bool]$_.olvasva; tema = $_.tema; forras = $_.forras; cim = $_.cim; url = $_.url; nap = $_.nap } })
    korabbiUrlek = @(@($cards | ForEach-Object { $_.url }) + @($fb | ForEach-Object { $_.url }) | Where-Object { $_ } | Sort-Object -Unique)
  }
  [IO.File]::WriteAllText($Out, ($result | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
  Write-Output "Kész: $(@($result.visszajelzesek).Count) visszajelzés, $(@($result.korabbiUrlek).Count) korábbi link kimentve."
  exit 0
}

# ---- upload ----
if (-not $Daily -or -not (Test-Path $Daily)) { Write-Output 'HIBA: add meg a mai összefoglaló fájlját (-Daily).'; exit 4 }
$d = [IO.File]::ReadAllText($Daily, [Text.Encoding]::UTF8) | ConvertFrom-Json
if (-not $d.rovatok) { Write-Output 'HIBA: a napi fájlból hiányzik a "rovatok" lista.'; exit 5 }
$d | Add-Member -Force -NotePropertyName reteg -NotePropertyValue 'claude'
$d | Add-Member -Force -NotePropertyName datum -NotePropertyValue $today
$d | Add-Member -Force -NotePropertyName keszult -NotePropertyValue $nowMs
$null = Send-Json 'Patch' "$root/kapitany_daily/$today" @{ fields = (Fields $d) }
$hirek = 0; foreach ($r in @($d.rovatok)) { $hirek += @($r.items).Count }
Write-Output "Napi összefoglaló feltöltve: $hirek hír."

$added = 0; $updated = 0; $failed = 0
if ($Cards -and (Test-Path $Cards)) {
  $items = @(([IO.File]::ReadAllText($Cards, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $_ })
  foreach ($c in $items) {
    if (-not $c.url -or -not ($c.cim -or $c.cimHu)) { $failed++; continue }
    $id = CardId $c.url
    $c | Add-Member -Force -NotePropertyName ajanlva -NotePropertyValue $today
    $c | Add-Member -Force -NotePropertyName reteg -NotePropertyValue 'claude'
    $new = $c.PSObject.Copy()
    $new | Add-Member -Force -NotePropertyName id -NotePropertyValue $id
    $new | Add-Member -Force -NotePropertyName felveve -NotePropertyValue $nowMs
    if (-not $new.PSObject.Properties['megjelent']) { $new | Add-Member -NotePropertyName megjelent -NotePropertyValue $nowMs }
    try { $null = Send-Json 'Post' "$root/kapitany_cards?documentId=$id" @{ fields = (Fields $new) }; $added++ }
    catch {
      if ((StatusOf $_) -ne 409) { $failed++; continue }
      # Már megvan (pl. az alaprétegből): csak a Claude által hozzáadott mezőket írjuk felül.
      $mask = ($c.PSObject.Properties | ForEach-Object { 'updateMask.fieldPaths=' + [Uri]::EscapeDataString($_.Name) }) -join '&'
      try { $null = Send-Json 'Patch' "$root/kapitany_cards/$id`?$mask" @{ fields = (Fields $c) }; $updated++ } catch { $failed++ }
    }
  }
}
$null = Send-Json 'Patch' "$root/kapitany_meta/claude" @{ fields = @{ utolsoFutas = @{ integerValue = [string]$nowMs } } }
Write-Output "Kártyák: $added új, $updated frissítve, $failed hibás."
