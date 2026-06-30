# Clean OneDrive pool workbook:
# - Dedupe Group + Knockout sheets by email (latest / best full bracket)
# - Fix display names from email when only a first name was entered
# - Knockout sheet: keep one row per player (no phase column)
# - Add Group Master + Knockout Master sheets (flattened readable columns)
#
# Usage: .\scripts\cleanup-excel-entries.ps1
# Requires: Install-Module ImportExcel -Scope CurrentUser

param(
  [string]$ExcelPath = ''
)

Import-Module ImportExcel -ErrorAction Stop

if (-not $ExcelPath) {
  $ExcelPath = "$env:OneDriveCommercial\World Cup 2026 Pool\Group Stage Entries.xlsx"
  if (-not (Test-Path $ExcelPath)) {
    $ExcelPath = "$env:OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx"
  }
}
if (-not (Test-Path $ExcelPath)) {
  throw "Excel file not found: $ExcelPath"
}

$Groups = @('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L')

# Match id -> Excel column label (FIFA match numbers)
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

function Get-EmailKey($email) {
  $key = ([string]$email).Trim().ToLower()
  if ($key) { return $key }
  return $null
}

function ConvertTo-TitleName([string]$text) {
  if (-not $text) { return '' }
  return (Get-Culture).TextInfo.ToTitleCase($text.ToLower())
}

function Get-NameFromEmailLocalPart([string]$email) {
  $local = ($email -split '@', 2)[0].Trim().ToLower()
  if (-not $local) { return $null }

  $local = $local -replace '[._-]+', ' '
  $parts = @($local -split '\s+' | Where-Object { $_ -and $_ -notmatch '^\d+$' })
  if ($parts.Count -lt 2) {
    $dotParts = @((($email -split '@', 2)[0] -split '\.') | Where-Object { $_ })
    if ($dotParts.Count -ge 2) {
      $parts = $dotParts
    }
  }
  if ($parts.Count -lt 2) { return $null }

  return (($parts | ForEach-Object { ConvertTo-TitleName $_ }) -join ' ')
}

function Resolve-DisplayName([string]$playerName, [string]$email) {
  $name = ([string]$playerName).Trim()
  if (-not $name) {
    $fromEmail = Get-NameFromEmailLocalPart $email
    if ($fromEmail) { return $fromEmail }
    return $email
  }

  $tokens = @($name -split '\s+' | Where-Object { $_ })
  if ($tokens.Count -ge 2) {
    return $name
  }

  $fromEmail = Get-NameFromEmailLocalPart $email
  if ($fromEmail) {
    $emailFirst = ($fromEmail -split '\s+', 2)[0]
    if ($emailFirst -eq $tokens[0] -or $tokens[0] -ieq $emailFirst) {
      return $fromEmail
    }
    return $fromEmail
  }

  return $name
}

function Parse-SubmittedAt($value) {
  if ($value -is [datetime]) { return $value }
  try { return [datetime]::Parse([string]$value) } catch { return [datetime]::MinValue }
}

function Format-SubmittedAtIso($value) {
  $dt = Parse-SubmittedAt $value
  if ($dt -eq [datetime]::MinValue) {
    return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  }
  return $dt.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
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

function Select-BestRow($rows) {
  $scored = foreach ($row in $rows) {
    $parsed = Parse-EntryJson $row.EntryJson
    $pickCount = Get-KnockoutPickCount $parsed
    $isFull = ([string]$row.SubmitPhase).Trim().ToLower() -eq 'full'
    [PSCustomObject]@{
      Row        = $row
      Parsed     = $parsed
      PickCount  = $pickCount
      IsFull     = $isFull
      SubmittedAt = Parse-SubmittedAt $row.SubmittedAt
    }
  }
  return ($scored | Sort-Object `
      @{ Expression = 'IsFull'; Descending = $true }, `
      @{ Expression = 'SubmittedAt'; Descending = $true }, `
      @{ Expression = 'PickCount'; Descending = $true } |
    Select-Object -First 1).Row
}

function Import-SheetRows([string]$path, [string]$worksheet) {
  try {
    return @(Import-Excel -Path $path -WorksheetName $worksheet)
  } catch {
    $tempCopy = Join-Path $env:TEMP "Group Stage Entries-cleanup.xlsx"
    Copy-Item $path $tempCopy -Force
    Write-Warning "Workbook locked - reading temp copy."
    return @(Import-Excel -Path $tempCopy -WorksheetName $worksheet)
  }
}

# --- Backup ---
$backupPath = Join-Path (Split-Path $ExcelPath -Parent) (
  "Group Stage Entries.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').xlsx"
)
Copy-Item $ExcelPath $backupPath -Force
Write-Host "Backup: $backupPath"

# --- Group stage ---
$groupRows = Import-SheetRows $ExcelPath 'Group Stage Entries' |
  Where-Object { $_.PlayerName -and ([string]$_.PlayerName).Trim() }

$groupByEmail = @{}
foreach ($row in $groupRows) {
  $key = Get-EmailKey $row.Email
  if (-not $key) { continue }
  if (-not $groupByEmail.ContainsKey($key)) {
    $groupByEmail[$key] = @($row)
  } else {
    $groupByEmail[$key] += $row
  }
}

$cleanGroup = foreach ($key in $groupByEmail.Keys) {
  $best = $groupByEmail[$key] |
    Sort-Object { Parse-SubmittedAt $_.SubmittedAt } -Descending |
    Select-Object -First 1

  $out = [ordered]@{
    PlayerName  = Resolve-DisplayName $best.PlayerName $best.Email
    Email       = ([string]$best.Email).Trim()
    SubmittedAt = Format-SubmittedAtIso $best.SubmittedAt
  }
  foreach ($g in $Groups) {
    $out["Group${g}_1st"] = $best."Group${g}_1st"
    $out["Group${g}_2nd"] = $best."Group${g}_2nd"
    $out["Group${g}_3rd"] = $best."Group${g}_3rd"
    $out["Group${g}_4th"] = $best."Group${g}_4th"
  }
  [PSCustomObject]$out
}
$cleanGroup = @($cleanGroup | Sort-Object PlayerName)

$groupMaster = foreach ($row in $cleanGroup) {
  $out = [ordered]@{
    PlayerName  = $row.PlayerName
    Email       = $row.Email
    SubmittedAt = $row.SubmittedAt
  }
  foreach ($g in $Groups) {
    $out["Group $g 1st"] = $row."Group${g}_1st"
    $out["Group $g 2nd"] = $row."Group${g}_2nd"
    $out["Group $g 3rd"] = $row."Group${g}_3rd"
    $out["Group $g 4th"] = $row."Group${g}_4th"
  }
  [PSCustomObject]$out
}

# --- Knockout ---
$knockoutRows = Import-SheetRows $ExcelPath 'Knockout' |
  Where-Object { $_.PlayerName -and ([string]$_.PlayerName).Trim() }

$koByEmail = @{}
foreach ($row in $knockoutRows) {
  $key = Get-EmailKey $row.Email
  if (-not $key) { continue }
  if (-not $koByEmail.ContainsKey($key)) {
    $koByEmail[$key] = @($row)
  } else {
    $koByEmail[$key] += $row
  }
}

$cleanKnockout = foreach ($key in $koByEmail.Keys) {
  $best = Select-BestRow $koByEmail[$key]
  $parsed = Parse-EntryJson $best.EntryJson
  $displayName = Resolve-DisplayName $best.PlayerName $best.Email
  $email = ([string]$best.Email).Trim()
  $submittedAt = Format-SubmittedAtIso $best.SubmittedAt

  if ($parsed) {
    $parsed.name = $displayName
    if (-not $parsed.email) { $parsed.email = $email }
    $entryJson = ($parsed | ConvertTo-Json -Depth 20 -Compress)
  } else {
    $entryJson = $best.EntryJson
  }

  [PSCustomObject][ordered]@{
    PlayerName  = $displayName
    Email       = $email
    SubmittedAt = $submittedAt
    EntryJson   = $entryJson
  }
}
$cleanKnockout = @($cleanKnockout | Sort-Object PlayerName)

$knockoutMaster = foreach ($row in $cleanKnockout) {
  $parsed = Parse-EntryJson $row.EntryJson
  $out = [ordered]@{
    PlayerName  = $row.PlayerName
    Email       = $row.Email
    SubmittedAt = $row.SubmittedAt
  }
  foreach ($matchId in $KnockoutColumns.Keys) {
    $label = $KnockoutColumns[$matchId]
    $pick = ''
    if ($parsed -and $parsed.knockout -and $parsed.knockout.$matchId) {
      $pick = $parsed.knockout.$matchId
    }
    $out[$label] = $pick
  }
  $winnerGoals = $null
  $loserGoals = $null
  if ($parsed -and $parsed.finalScore) {
    if ($parsed.finalScore.PSObject.Properties.Name -contains 'winnerGoals') {
      $winnerGoals = $parsed.finalScore.winnerGoals
      $loserGoals = $parsed.finalScore.loserGoals
    } elseif ($parsed.finalScore.PSObject.Properties.Name -contains 'home') {
      $homeGoals = [int]$parsed.finalScore.home
      $awayGoals = [int]$parsed.finalScore.away
      if ($homeGoals -ge $awayGoals) {
        $winnerGoals = $homeGoals
        $loserGoals = $awayGoals
      } else {
        $winnerGoals = $awayGoals
        $loserGoals = $homeGoals
      }
    }
  }
  $out['Final score winner goals'] = $winnerGoals
  $out['Final score loser goals']  = $loserGoals
  [PSCustomObject]$out
}

# --- Write workbook ---
$tempOut = Join-Path ([System.IO.Path]::GetTempPath()) 'wc-pool-entries-cleaned.xlsx'
if (Test-Path -LiteralPath $tempOut) { Remove-Item -LiteralPath $tempOut -Force }

$cleanGroup | Export-Excel -Path $tempOut -WorksheetName 'Group Stage Entries' -TableName 'Entries' -AutoSize
$cleanKnockout | Export-Excel -Path $tempOut -WorksheetName 'Knockout' -TableName 'KnockoutEntries' -AutoSize
$groupMaster | Export-Excel -Path $tempOut -WorksheetName 'Group Master' -TableName 'GroupMaster' -AutoSize
$knockoutMaster | Export-Excel -Path $tempOut -WorksheetName 'Knockout Master' -TableName 'KnockoutMaster' -AutoSize

Copy-Item -LiteralPath $tempOut -Destination $ExcelPath -Force
Remove-Item -LiteralPath $tempOut -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done - $ExcelPath"
Write-Host "  Group Stage Entries: $($cleanGroup.Count) rows (was $($groupRows.Count))"
Write-Host "  Knockout:            $($cleanKnockout.Count) rows (was $($knockoutRows.Count))"
Write-Host "  Group Master:        $($groupMaster.Count) rows"
Write-Host "  Knockout Master:     $($knockoutMaster.Count) rows"
Write-Host "  SubmitPhase column removed from Knockout sheet."
