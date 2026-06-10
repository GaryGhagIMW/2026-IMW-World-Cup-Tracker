# Regenerate src/data/pool-entries.js from the OneDrive Excel log.
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

function Import-PoolRows($path) {
  try {
    return Import-Excel $path -WorksheetName 'Group Stage Entries'
  } catch {
    $tempCopy = Join-Path $env:TEMP 'Group Stage Entries-sync.xlsx'
    Copy-Item $path $tempCopy -Force
    Write-Host 'Excel file locked - reading from temp copy.'
    return Import-Excel $tempCopy -WorksheetName 'Group Stage Entries'
  }
}

$rows = Import-PoolRows $excelPath |
  Where-Object { $_.PlayerName -and $_.PlayerName.Trim() }

# One row per email — keep the best display name.
$deduped = @{}
foreach ($row in $rows) {
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

$rows = $deduped.Values | Sort-Object PlayerName

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

$entries = foreach ($row in $rows) {
  $groupLines = foreach ($g in $groups) {
    $picks = @(
      $row."Group${g}_1st",
      $row."Group${g}_2nd",
      $row."Group${g}_3rd",
      $row."Group${g}_4th"
    ) | ForEach-Object { "'$_'" }
    "      ${g}: [$($picks -join ', ')],"
  }
  $name = $row.PlayerName.Replace("'", "\'")
  $email = ([string]$row.Email).Replace("'", "\'")
  $date = Format-SubmittedAt $row.SubmittedAt
  @"
  poolEntry(
    '$name',
    '$email',
    {
$($groupLines -join "`n")
    },
    '$date'
  ),
"@
}

$header = @'
import { createEmptyKnockoutPredictions } from '../lib/scoring.js';

function poolEntry(name, email, groups, updatedAt) {
  return {
    name,
    email,
    groups,
    knockout: createEmptyKnockoutPredictions(),
    finalScore: { home: null, away: null },
    updatedAt,
  };
}

/** Official pool entries synced from OneDrive Group Stage Entries.xlsx */
export const POOL_ENTRIES = [
'@

$content = $header + ($entries -join "`n") + "`n];`n"
Set-Content -Path $outPath -Value $content -Encoding UTF8
Write-Host "Synced $($rows.Count) entries to $outPath"
