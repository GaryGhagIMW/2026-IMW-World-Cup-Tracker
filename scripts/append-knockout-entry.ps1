# Append a knockout submission row to the KnockoutEntries table in OneDrive Excel.
# Usage:
#   .\scripts\append-knockout-entry.ps1 -PlayerName "Jane Doe" -Email "jane@imw.ca" -SubmitPhase early -EntryJson '{"knockout":{"r32-1":"CAN"}}'

param(
  [Parameter(Mandatory = $true)]
  [string]$PlayerName,
  [string]$Email = '',
  [ValidateSet('early', 'full')]
  [string]$SubmitPhase = 'early',
  [string]$SubmittedAt = '',
  [string]$EntryJson = ''
)

Import-Module ImportExcel -ErrorAction Stop

$excelPath = "$env:OneDriveCommercial\World Cup 2026 Pool\Group Stage Entries.xlsx"
if (-not (Test-Path $excelPath)) {
  $excelPath = "$env:OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx"
}
if (-not (Test-Path $excelPath)) {
  throw 'Excel file not found under OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx'
}

if (-not $SubmittedAt) {
  $SubmittedAt = (Get-Date).ToUniversalTime().ToString('o')
}

$row = [ordered]@{
  PlayerName  = $PlayerName.Trim()
  Email       = $Email.Trim()
  SubmittedAt = $SubmittedAt
  SubmitPhase = $SubmitPhase
  EntryJson   = $EntryJson
}

$existing = @()
try {
  $existing = @(Import-Excel -Path $excelPath -WorksheetName 'Knockout' -TableName 'KnockoutEntries')
} catch {
  $existing = @(Import-Excel -Path $excelPath -WorksheetName 'Knockout')
}

$existing += [pscustomobject]$row

$existing |
  Export-Excel -Path $excelPath -WorksheetName 'Knockout' -TableName 'KnockoutEntries' -AutoSize -ClearSheet

Write-Host "Appended knockout entry for $($row.PlayerName) to $excelPath (Knockout / KnockoutEntries)"
