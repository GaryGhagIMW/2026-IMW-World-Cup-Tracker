# Regenerate src/data/pool-entries.js from the OneDrive Excel log.
# Merges group picks (Group Stage Entries) with knockout brackets (Knockout / Knockout Master).
# Requires ImportExcel: Install-Module ImportExcel -Scope CurrentUser

$excelPath = "$env:OneDriveCommercial\World Cup 2026 Pool\Group Stage Entries.xlsx"
if (-not (Test-Path $excelPath)) {
  $excelPath = "$env:OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx"
}
if (-not (Test-Path $excelPath)) {
  throw "Excel file not found. Expected under OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx"
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $repoRoot 'src\data\pool-entries.js'
$groups = @('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L')

$KnockoutColumns = [ordered]@{
  'r32-1'  = 'Match 73'
  'r32-2'  = 'Match 74'
  'r32-3'  = 'Match 75'
  'r32-4'  = 'Match 76'
  'r32-5'  = 'Match 77'
  'r32-6'  = 'Match 78'
  'r32-7'  = 'Match 79'
  'r32-8'  = 'Match 80'
  'r32-9'  = 'Match 81'
  'r32-10' = 'Match 82'
  'r32-11' = 'Match 83'
  'r32-12' = 'Match 84'
  'r32-13' = 'Match 85'
  'r32-14' = 'Match 86'
  'r32-15' = 'Match 87'
  'r32-16' = 'Match 88'
  'r16-1'  = 'Match 89'
  'r16-2'  = 'Match 90'
  'r16-3'  = 'Match 91'
  'r16-4'  = 'Match 92'
  'r16-5'  = 'Match 93'
  'r16-6'  = 'Match 94'
  'r16-7'  = 'Match 95'
  'r16-8'  = 'Match 96'
  'qf-1'   = 'Match 97'
  'qf-2'   = 'Match 98'
  'qf-3'   = 'Match 99'
  'qf-4'   = 'Match 100'
  'sf-1'   = 'Match 101'
  'sf-2'   = 'Match 102'
  'final'  = 'Match 104'
}

function Import-SheetRows($path, $worksheet) {
  try {
    return @(Import-Excel -Path $path -WorksheetName $worksheet)
  } catch {
    $tempCopy = Join-Path $env:TEMP 'Group Stage Entries-sync.xlsx'
    Copy-Item $path $tempCopy -Force
    Write-Host 'Excel file locked - reading from temp copy.'
    return @(Import-Excel -Path $tempCopy -WorksheetName $worksheet)
  }
}

function Format-SubmittedAt($value) {
  if ($value -is [datetime]) {
    return $value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  }
  $text = [string]$value
  if ($text -match 'T') { return $text }
  try {
    return ([datetime]$value).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  } catch {
    return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  }
}

function Parse-SubmittedAt($value) {
  if ($value -is [datetime]) { return $value }
  try { return [datetime]::Parse([string]$value) } catch { return [datetime]::MinValue }
}

function Normalize-Name($name) {
  ([string]$name).Trim().ToLower() -replace '\s+', ' '
}

function Get-EmailLocalKey($email) {
  $local = (($email -as [string]).Trim().ToLower() -split '@', 2)[0]
  if (-not $local) { return $null }
  return ($local -replace '[._-]', '')
}

function Test-EmailLocalMatch($left, $right) {
  if (-not $left -or -not $right) { return $false }
  if ($left -eq $right) { return $true }
  if ($left.StartsWith($right) -or $right.StartsWith($left)) {
    return [Math]::Abs($left.Length - $right.Length) -le 2
  }
  return $false
}

function Parse-EntryJson([string]$json) {
  if (-not $json) { return $null }
  try { return $json | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
}

function Get-KnockoutPickCount($parsed) {
  if (-not $parsed -or -not $parsed.knockout) { return 0 }
  $count = 0
  foreach ($prop in $parsed.knockout.PSObject.Properties) {
    if ($prop.Value) { $count++ }
  }
  return $count
}

function Select-BestKnockoutRow($rows) {
  $scored = foreach ($row in $rows) {
    $parsed = Parse-EntryJson $row.EntryJson
    $pickCount = Get-KnockoutPickCount $parsed
    if (-not $pickCount -and $row.'Match 73') {
      $pickCount = ($KnockoutColumns.Values | Where-Object { $row.$_ }).Count
    }
    [PSCustomObject]@{
      Row         = $row
      PickCount   = $pickCount
      SubmittedAt = Parse-SubmittedAt $row.SubmittedAt
    }
  }
  return ($scored | Sort-Object `
      @{ Expression = 'PickCount'; Descending = $true }, `
      @{ Expression = 'SubmittedAt'; Descending = $true } |
    Select-Object -First 1).Row
}

function Parse-KnockoutFromRow($row) {
  $knockout = @{}
  $finalScore = @{ winnerGoals = $null; loserGoals = $null }

  $parsed = Parse-EntryJson $row.EntryJson
  if ($parsed -and $parsed.knockout) {
    foreach ($prop in $parsed.knockout.PSObject.Properties) {
      if ($prop.Value) { $knockout[$prop.Name] = [string]$prop.Value }
    }
  }
  if ($parsed -and $parsed.finalScore) {
    if ($parsed.finalScore.PSObject.Properties.Name -contains 'winnerGoals') {
      $finalScore.winnerGoals = $parsed.finalScore.winnerGoals
      $finalScore.loserGoals = $parsed.finalScore.loserGoals
    } elseif ($parsed.finalScore.PSObject.Properties.Name -contains 'home') {
      $homeGoals = [int]$parsed.finalScore.home
      $awayGoals = [int]$parsed.finalScore.away
      if ($homeGoals -ge $awayGoals) {
        $finalScore.winnerGoals = $homeGoals
        $finalScore.loserGoals = $awayGoals
      } else {
        $finalScore.winnerGoals = $awayGoals
        $finalScore.loserGoals = $homeGoals
      }
    }
  }

  foreach ($matchId in $KnockoutColumns.Keys) {
    $label = $KnockoutColumns[$matchId]
    $pick = [string]$row.$label
    if ($pick) { $knockout[$matchId] = $pick }
  }

  if ($row.'Final score winner goals' -ne $null -and [string]$row.'Final score winner goals' -ne '') {
    $finalScore.winnerGoals = [int]$row.'Final score winner goals'
  }
  if ($row.'Final score loser goals' -ne $null -and [string]$row.'Final score loser goals' -ne '') {
    $finalScore.loserGoals = [int]$row.'Final score loser goals'
  }

  return [PSCustomObject]@{
    Knockout   = $knockout
    FinalScore = $finalScore
  }
}

function Format-JsString($value) {
  ([string]$value).Replace('\', '\\').Replace("'", "\'")
}

function Format-KnockoutOverridesJs($knockout) {
  if (-not $knockout -or $knockout.Count -eq 0) { return '' }
  $lines = foreach ($matchId in ($knockout.Keys | Sort-Object)) {
    $pick = Format-JsString $knockout[$matchId]
    "      '$matchId': '$pick',"
  }
  @"
    {
$($lines -join "`n")
    }
"@
}

function Format-FinalScoreJs($finalScore) {
  if ($null -eq $finalScore.winnerGoals -or $null -eq $finalScore.loserGoals) { return '' }
  @"
    { winnerGoals: $($finalScore.winnerGoals), loserGoals: $($finalScore.loserGoals) }
"@
}

# --- Group stage ---
$groupRows = Import-SheetRows $excelPath 'Group Stage Entries' |
  Where-Object { $_.PlayerName -and ([string]$_.PlayerName).Trim() }

$deduped = @{}
foreach ($row in $groupRows) {
  $key = ([string]$row.Email).Trim().ToLower()
  if (-not $key) { continue }
  $existing = $deduped[$key]
  if (-not $existing) {
    $deduped[$key] = $row
    continue
  }
  $existingLower = $existing.PlayerName -ceq $existing.PlayerName.ToLower()
  $rowLower = $row.PlayerName -ceq $row.PlayerName.ToLower()
  if ($existingLower -and -not $rowLower) {
    $deduped[$key] = $row
    continue
  }
  if ($row.PlayerName.Length -gt $existing.PlayerName.Length) {
    $deduped[$key] = $row
  }
}

$rows = @($deduped.Values | Sort-Object PlayerName)

# --- Knockout (prefer cleaned Knockout Master; fall back to raw Knockout + EntryJson) ---
$knockoutRows = @()
foreach ($sheet in @('Knockout Master', 'Knockout')) {
  try {
    $sheetRows = Import-SheetRows $excelPath $sheet |
      Where-Object { $_.PlayerName -and ([string]$_.PlayerName).Trim() }
    if ($sheetRows.Count -gt 0) {
      $knockoutRows = $sheetRows
      Write-Host "Knockout data from worksheet: $sheet ($($knockoutRows.Count) rows)"
      break
    }
  } catch {
    Write-Warning "Could not read worksheet '$sheet': $_"
  }
}

$koByEmail = @{}
$koByName = @{}
$koByEmailLocal = @{}
foreach ($row in $knockoutRows) {
  $emailKey = ([string]$row.Email).Trim().ToLower()
  if ($emailKey) {
    if (-not $koByEmail.ContainsKey($emailKey)) {
      $koByEmail[$emailKey] = @($row)
    } else {
      $koByEmail[$emailKey] += $row
    }
  }
  $localKey = Get-EmailLocalKey $row.Email
  if ($localKey) {
    if (-not $koByEmailLocal.ContainsKey($localKey)) {
      $koByEmailLocal[$localKey] = @($row)
    } else {
      $koByEmailLocal[$localKey] += $row
    }
  }
  $nameKey = Normalize-Name $row.PlayerName
  if ($nameKey) {
    if (-not $koByName.ContainsKey($nameKey)) {
      $koByName[$nameKey] = @($row)
    } else {
      $koByName[$nameKey] += $row
    }
  }
}

function Resolve-KnockoutData($email, $playerName) {
  $candidates = @()
  $emailKey = ([string]$email).Trim().ToLower()
  if ($emailKey -and $koByEmail.ContainsKey($emailKey)) {
    $candidates += $koByEmail[$emailKey]
  }
  $localKey = Get-EmailLocalKey $email
  if ($localKey -and $koByEmailLocal.ContainsKey($localKey)) {
    $candidates += $koByEmailLocal[$localKey]
  } elseif ($localKey) {
    foreach ($key in $koByEmailLocal.Keys) {
      if (Test-EmailLocalMatch $localKey $key) {
        $candidates += $koByEmailLocal[$key]
      }
    }
  }
  $nameKey = Normalize-Name $playerName
  if ($nameKey -and $koByName.ContainsKey($nameKey)) {
    $candidates += $koByName[$nameKey]
  }
  if (-not $candidates.Count) { return $null }
  $best = Select-BestKnockoutRow @($candidates | Select-Object -Unique)
  return Parse-KnockoutFromRow $best
}

$withKnockout = 0
$entries = foreach ($row in $rows) {
  $groupLines = foreach ($g in $groups) {
    $picks = @(
      $row."Group${g}_1st",
      $row."Group${g}_2nd",
      $row."Group${g}_3rd",
      $row."Group${g}_4th"
    ) | ForEach-Object { "'$(Format-JsString $_)'" }
    "      ${g}: [$($picks -join ', ')],"
  }
  $name = Format-JsString $row.PlayerName
  $email = Format-JsString $row.Email
  $date = Format-SubmittedAt $row.SubmittedAt

  $koData = Resolve-KnockoutData $row.Email $row.PlayerName
  $koArgs = ''
  if ($koData) {
    $koJs = Format-KnockoutOverridesJs $koData.Knockout
    $fsJs = Format-FinalScoreJs $koData.FinalScore
    if ($koJs) {
      $withKnockout++
      $koArgs = ",`n    $koJs"
      if ($fsJs) { $koArgs += ",`n    $fsJs" }
    }
  }

  @"
  poolEntry(
    '$name',
    '$email',
    {
$($groupLines -join "`n")
    },
    '$date'$koArgs
  ),
"@
}

$header = @'
import { createEmptyKnockoutPredictions, createEmptyFinalScore } from '../lib/scoring.js';

function poolEntry(name, email, groups, updatedAt, knockoutOverrides = null, finalScoreOverride = null) {
  return {
    name,
    email,
    groups,
    knockout: knockoutOverrides
      ? { ...createEmptyKnockoutPredictions(), ...knockoutOverrides }
      : createEmptyKnockoutPredictions(),
    finalScore: finalScoreOverride
      ? { ...createEmptyFinalScore(), ...finalScoreOverride }
      : createEmptyFinalScore(),
    updatedAt,
  };
}

/** Official pool entries synced from OneDrive Group Stage Entries.xlsx (group + knockout) */
export const POOL_ENTRIES = [
'@

$content = $header + ($entries -join "`n") + "`n];`n"
Set-Content -Path $outPath -Value $content -Encoding UTF8
Write-Host "Synced $($rows.Count) group entries ($withKnockout with knockout brackets) to $outPath"
